#!/usr/bin/env python3
"""Fail-closed parser for an externally downloaded M44 archive; never prints private content."""
import hashlib
import json
import os
import pathlib
import re
import shutil
import stat
import sys
import tempfile
import tarfile
import zipfile

CIPHER_NAME = "iberfit-prod-recovery.ibf"
MAX_CIPHER = 1024 * 1024 * 1024
MAX_TAR_BYTES = 2 * 1024 * 1024 * 1024
MAX_ITEMS = 100000
MAX_STORAGE_OBJECT_BYTES = 256 * 1024 * 1024  # Matches the exporter limit


def require(condition, reason):
    if not condition:
        raise ValueError("IBERFIT_OFFSITE_" + reason)


def hash_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def unwrap_zip(archive, expected_sha, destination):
    require(re.fullmatch(r"[0-9a-f]{64}", expected_sha or "") is not None,
            "EXPECTED_DIGEST_INVALID")
    require(hash_file(archive) == expected_sha, "SOURCE_CHECKSUM_MISMATCH")
    target = pathlib.Path(destination)
    require(not target.exists() and not target.is_symlink(),
            "DESTINATION_ALREADY_EXISTS")
    with zipfile.ZipFile(archive) as bundle:
        entries = bundle.infolist()
        require(len(entries) == 1, "ZIP_ENTRY_COUNT_INVALID")
        info = entries[0]
        mode = (info.external_attr >> 16) & 0xFFFF
        require(info.filename == CIPHER_NAME and not info.is_dir(),
                "ZIP_ENTRY_NAME_INVALID")
        require(not stat.S_ISLNK(mode) and (mode == 0 or stat.S_ISREG(mode)),
                "ZIP_ENTRY_TYPE_INVALID")
        require(info.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED),
                "ZIP_COMPRESSION_UNSUPPORTED")
        require(53 <= info.file_size <= MAX_CIPHER, "CIPHERTEXT_SIZE_INVALID")
        created = False
        try:
            with bundle.open(info) as source:
                # Exclusive create guarantees the ZIP cannot overwrite a
                # preexisting file. Mark creation *before* any subsequent
                # operation that may raise so cleanup only removes our output.
                with open(target, "xb") as output:
                    created = True
                    os.chmod(target, 0o600)
                    total = 0
                    header = source.read(8)
                    require(header == b"IBFBAK01", "CIPHERTEXT_HEADER_INVALID")
                    output.write(header)
                    total += len(header)
                    for chunk in iter(lambda: source.read(1024 * 1024), b""):
                        total += len(chunk)
                        require(total <= MAX_CIPHER, "CIPHERTEXT_LIMIT_EXCEEDED")
                        output.write(chunk)
                    require(total == info.file_size, "CIPHERTEXT_TRUNCATED")
        except BaseException:
            if created:
                target.unlink(missing_ok=True)
            raise
    print("IBERFIT_OFFSITE_DRIVE_CIPHERTEXT_VERIFIED")


# The 2026-10-16 enriched format adds these exact files INSIDE the
# authenticated encrypted TAR. Preserve support for legacy TARs.
EXTRA_FILES = frozenset((
    "storage-inventory.json",
    "storage-post-inventory.json",
    "platform-catalog-source.json",
))
ROLE_FILE = "global-roles.sql"
MAX_ROLES_BYTES = 8 * 1024 * 1024
CORE_ROLES = (
    "postgres", "anon", "authenticated", "authenticator",
    "service_role", "supabase_admin", "supabase_auth_admin",
    "supabase_storage_admin",
)
CATALOG_KEYS = frozenset((
    "roles", "role_memberships", "relation_security", "default_privileges",
    "function_security", "policies", "triggers", "constraints", "indexes",
    "extensions", "bucket_configuration", "migration_history",
))
MAX_JSON_BYTES = 64 * 1024 * 1024
HEX64 = re.compile(r"[0-9a-f]{64}")
UUID = re.compile(r"[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}", re.I)
TIMESTAMP = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z")


def allowed_tar_file(name):
    return name in EXTRA_FILES or name == ROLE_FILE or name in ("database.pgcustom", "storage/manifest.json") or (
        re.fullmatch(r"storage/files/[0-9]{6,12}\.bin", name) is not None)


def protected_json(path):
    require(path.is_file() and not path.is_symlink(), "METADATA_NOT_REGULAR")
    size = path.stat().st_size
    require(2 <= size <= MAX_JSON_BYTES, "METADATA_SIZE_INVALID")
    try:
        with path.open("r", encoding="utf-8") as stream:
            return json.load(stream)
    except (UnicodeError, ValueError):
        raise ValueError("IBERFIT_OFFSITE_METADATA_JSON_INVALID")


def inventory_rows(payload):
    require(isinstance(payload, list) and len(payload) <= MAX_ITEMS,
            "INVENTORY_INVALID")
    result = {}
    for x in payload:
        require(isinstance(x, dict) and set(x) == {
            "bucket_id", "name", "id", "version", "updated_at", "size"
        }, "INVENTORY_ENTRY_INVALID")
        bucket, name, uid = x["bucket_id"], x["name"], x["id"]
        require(isinstance(bucket, str) and bool(bucket)
                and isinstance(name, str) and bool(name)
                and isinstance(uid, str) and UUID.fullmatch(uid),
                "INVENTORY_IDENTITY_INVALID")
        require(x["version"] is None or isinstance(x["version"], str),
                "INVENTORY_VERSION_INVALID")
        require(x["updated_at"] is None or (
            isinstance(x["updated_at"], str)
            and TIMESTAMP.fullmatch(x["updated_at"])),
            "INVENTORY_TIMESTAMP_INVALID")
        require(x["size"] is None or (isinstance(x["size"], str)
                and re.fullmatch(r"0|[1-9]\d*", x["size"])),
                "INVENTORY_SIZE_INVALID")
        key = (bucket, name)
        require(key not in result, "INVENTORY_DUPLICATE")
        result[key] = (uid.lower(), x["version"], x["updated_at"], x["size"])
    return result


def validate_storage_manifest(base, archived_members):
    # Every historical generation has a Storage manifest inside its
    # authenticated TAR, even if it predates before/after inventories.
    manifest = protected_json(base / "storage" / "manifest.json")
    require(isinstance(manifest, dict)
            and set(manifest) == {"schema", "project", "objects"}
            and manifest["schema"] == "iberfit.storage.backup.v1"
            and manifest["project"] == "pjhmrhejsoofmouedavw"
            and isinstance(manifest["objects"], list)
            and len(manifest["objects"]) <= MAX_ITEMS,
            "MANIFEST_INVALID")
    seen = set()
    expected_members = set()
    result = {}
    for idx, x in enumerate(manifest["objects"]):
        require(isinstance(x, dict)
                and set(x) == {"bucket", "name", "relative", "bytes", "sha256"}
                and isinstance(x["bucket"], str) and bool(x["bucket"])
                and isinstance(x["name"], str) and bool(x["name"])
                and x["relative"] == "files/" + str(idx).zfill(6) + ".bin"
                and type(x["bytes"]) is int
                and 0 <= x["bytes"] <= MAX_STORAGE_OBJECT_BYTES
                and isinstance(x["sha256"], str)
                and HEX64.fullmatch(x["sha256"]),
                "MANIFEST_ENTRY_INVALID")
        key = (x["bucket"], x["name"])
        require(key not in seen, "MANIFEST_OBJECT_DUPLICATE")
        seen.add(key)
        expected_members.add("storage/" + x["relative"])
        result[key] = x["bytes"]

    # Never accept a successful historical unpack with missing, extra or
    # tampered Storage bytes just because it lacks enriched inventories.
    actual_members = {
        name for name in archived_members if name.startswith("storage/files/")
    }
    require(actual_members == expected_members, "STORAGE_FILES_SET_MISMATCH")
    for idx, x in enumerate(manifest["objects"]):
        target = base / "storage" / x["relative"]
        require(target.is_file() and not target.is_symlink(),
                "STORAGE_FILE_NOT_REGULAR")
        require(target.stat().st_size == x["bytes"],
                "STORAGE_FILE_SIZE_MISMATCH")
        require(hash_file(target) == x["sha256"],
                "STORAGE_FILE_CHECKSUM_MISMATCH")
    return result


def validate_enriched_archive(base, manifest_sizes):
    before = inventory_rows(protected_json(base / "storage-inventory.json"))
    after = inventory_rows(protected_json(base / "storage-post-inventory.json"))
    require(before == after, "INVENTORY_CHANGED_DURING_EXPORT")
    require(len(manifest_sizes) == len(before),
            "MANIFEST_COUNT_MISMATCH")
    require(set(manifest_sizes) == set(before),
            "INVENTORY_MANIFEST_MISMATCH")
    for key, bytes_count in manifest_sizes.items():
        size = before[key][3]
        require(size is None or int(size) == bytes_count,
                "STORAGE_SIZE_MISMATCH")
    catalog = protected_json(base / "platform-catalog-source.json")
    require(isinstance(catalog, dict) and
            set(catalog) == CATALOG_KEYS | {"schema"} and
            catalog.get("schema") == "iberfit.m44.platform.catalog.v1" and
            all(isinstance(catalog.get(k), str)
                and HEX64.fullmatch(catalog[k]) for k in CATALOG_KEYS),
            "PLATFORM_CATALOG_INVALID")



def validate_optional_role_archive(path):
    require(path.is_file() and not path.is_symlink(), "ROLES_NOT_REGULAR")
    size = path.stat().st_size
    require(300 <= size <= MAX_ROLES_BYTES, "ROLES_SIZE_INVALID")
    try:
        sql = path.read_text(encoding="utf-8")
    except UnicodeError:
        raise ValueError("IBERFIT_OFFSITE_ROLES_UTF8_INVALID")
    require(re.search(r"^--\s*PostgreSQL database cluster dump",
                      sql, flags=re.M) is not None,
            "ROLES_PGDUMP_HEADER_MISSING")
    require("PostgreSQL database cluster dump complete" in sql,
            "ROLES_PGDUMP_TRAILER_MISSING")
    # Role-password declarations are forbidden even if the dump is encrypted.
    # Never print raw SQL, role names, arguments or recovered paths.
    require(re.search(r"\bPASSWORD\b", sql, re.I) is None,
            "ROLES_PASSWORD_CLAUSE_FORBIDDEN")
    for name in CORE_ROLES:
        quoted = re.escape(name)
        require(re.search(
            r"\bCREATE\s+ROLE\s+(?:\"" + quoted + r"\"|" + quoted + r")\s*;",
            sql, re.I) is not None, "ROLES_REQUIRED_ROLE_MISSING")
    require(re.search(r"\bALTER\s+ROLE\s+", sql, re.I) is not None,
            "ROLES_ATTRIBUTES_MISSING")


def publish_verified_archive(stage, destination, existed, *,
                             supports_replace_directory=None):
    # Linux/POSIX can replace an existing EMPTY directory atomically. Windows
    # cannot replace even an empty existing directory; keep the old, tested
    # rollback for that one compatibility path. A destination that does not
    # exist supports atomic rename on either OS.
    if supports_replace_directory is None:
        supports_replace_directory = os.name != "nt"
    require(not destination.is_symlink(), "RESTORE_DIR_SYMLINK_FORBIDDEN")
    if existed:
        require(destination.is_dir() and not any(destination.iterdir()),
                "RESTORE_DESTINATION_CHANGED")
    else:
        require(not destination.exists(), "RESTORE_DESTINATION_CHANGED")
    if not existed or supports_replace_directory:
        # Staging is a sibling, so this is one same-filesystem namespace
        # operation. A crash cannot expose a partially moved file set.
        os.replace(stage, destination)
        return
    # Windows compatibility when the caller supplied an existing empty dir.
    # This fallback remains only exception-safe, not crash-atomic.
    published = []
    try:
        for child in stage.iterdir():
            final = destination / child.name
            require(not final.exists() and not final.is_symlink(),
                    "RESTORE_DESTINATION_CHANGED")
            os.rename(child, final)
            published.append(final)
    except BaseException:
        for final in reversed(published):
            if final.is_dir() and not final.is_symlink():
                shutil.rmtree(final)
            else:
                final.unlink(missing_ok=True)
        raise


def unpack_tar(archive, directory):
    # Refuse the supplied symlink itself instead of silently resolving it
    # to a different location that might hold unrelated data.
    supplied = pathlib.Path(directory)
    require(not supplied.is_symlink(), "RESTORE_DIR_SYMLINK_FORBIDDEN")
    base = supplied.resolve()
    existed = base.exists()
    require(not existed or (base.is_dir() and not any(base.iterdir())),
            "RESTORE_DIR_NOT_EMPTY")
    require(base.parent.is_dir(), "RESTORE_PARENT_INVALID")
    # Staging lives in a sibling private directory, NEVER under final output.
    # This permits same-filesystem atomic rename on POSIX, and on Windows
    # when the destination has not been created by the caller.
    # Failed validation removes staging without changing final destination.
    with tempfile.TemporaryDirectory(prefix=".m44-private-stage-",
                                     dir=base.parent) as temp:
        stage = pathlib.Path(temp)
        os.chmod(stage, 0o700)
        present = set()
        total = 0
        with tarfile.open(archive, mode="r:") as bundle:
            for member in bundle:
                name = member.name.removeprefix("./").rstrip("/")
                require(name not in present, "TAR_DUPLICATE_ENTRY")
                present.add(name)
                if member.isdir():
                    require(name in ("storage", "storage/files"), "TAR_UNSAFE_DIRECTORY")
                    (stage / name).mkdir(parents=True, exist_ok=True)
                    continue
                require(member.isfile() and allowed_tar_file(name), "TAR_UNSAFE_ENTRY")
                # Apply producer-compatible limits at the TAR header
                # BEFORE writing the untrusted member to private staging.
                # Legacy Storage is still accepted; excessive blobs are not.
                limit = (MAX_JSON_BYTES
                         if name in EXTRA_FILES or name == "storage/manifest.json"
                         else MAX_ROLES_BYTES if name == ROLE_FILE
                         else MAX_STORAGE_OBJECT_BYTES
                         if name.startswith("storage/files/")
                         else MAX_TAR_BYTES)
                require(0 <= member.size <= limit, "TAR_MEMBER_TOO_LARGE")
                total += member.size
                require(total <= MAX_TAR_BYTES and len(present) <= MAX_ITEMS,
                        "TAR_LIMIT_EXCEEDED")
                target = stage / name
                target.parent.mkdir(parents=True, exist_ok=True)
                require(target.resolve().is_relative_to(stage), "TAR_PATH_ESCAPE")
                source = bundle.extractfile(member)
                require(source is not None, "TAR_MEMBER_MISSING")
                with source, open(target, "xb") as output:
                    os.chmod(target, 0o600)
                    shutil.copyfileobj(source, output, length=1024 * 1024)
                    # A maliciously truncated TAR may have a valid header
                    # but fewer extracted bytes; never publish it.
                    require(output.tell() == member.size,
                            "TAR_MEMBER_SIZE_MISMATCH")
        require({"database.pgcustom", "storage/manifest.json"}.issubset(present),
                "TAR_REQUIRED_COMPONENT_MISSING")
        # Even legacy backups claim a PostgreSQL custom-format dump. Reject an
        # empty/wrongly labeled body before reporting a structurally valid TAR.
        # The real pg_restore is STILL required to prove SQL restorability.
        database_dump = stage / "database.pgcustom"
        require(database_dump.is_file() and not database_dump.is_symlink()
                and database_dump.stat().st_size >= 16,
                "PGCUSTOM_ARCHIVE_INVALID")
        with database_dump.open("rb") as stream:
            require(stream.read(5) == b"PGDMP", "PGCUSTOM_MAGIC_INVALID")
        # Both legacy and enriched backups carry Storage hashes. The
        # inventories/catalog are additional guarantees, never a reason
        # to skip the bytes check on an older authenticated archive.
        manifest_sizes = validate_storage_manifest(stage, present)
        extension = present.intersection(EXTRA_FILES)
        require(not extension or extension == EXTRA_FILES,
                "PARTIAL_ENRICHED_ARCHIVE")
        if extension:
            validate_enriched_archive(stage, manifest_sizes)
        if ROLE_FILE in present:
            require(extension == EXTRA_FILES, "ROLES_WITHOUT_ENRICHED_METADATA")
            validate_optional_role_archive(stage / ROLE_FILE)
        # All members, hashes and optional role data must pass before a
        # single publish operation makes them visible.
        publish_verified_archive(stage, base, existed)
    # No unverified snapshot is announced. This marker is only emitted
    # after staging and full publication have both succeeded.
    print("IBERFIT_OFFSITE_STORAGE_MANIFEST_BYTES_SHA256_VERIFIED")
    if extension:
        print("IBERFIT_OFFSITE_ENRICHED_STORAGE_BYTES_SHA256_VERIFIED")
    print("IBERFIT_OFFSITE_DECRYPTED_ARCHIVE_STRUCTURE_VERIFIED")

def main():
    require(len(sys.argv) == 5 if sys.argv[1:2] == ["unwrap"] else
            len(sys.argv) == 4 if sys.argv[1:2] == ["unpack"] else False,
            "USAGE_INVALID")
    if sys.argv[1] == "unwrap":
        unwrap_zip(sys.argv[2], sys.argv[3], sys.argv[4])
    else:
        unpack_tar(sys.argv[2], sys.argv[3])


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, zipfile.BadZipFile, tarfile.TarError, EOFError):
        print("IBERFIT_OFFSITE_VALIDATION_FAILED", file=sys.stderr)
        sys.exit(1)
