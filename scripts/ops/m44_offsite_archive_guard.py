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
import tarfile
import zipfile

CIPHER_NAME = "iberfit-prod-recovery.ibf"
MAX_CIPHER = 1024 * 1024 * 1024
MAX_TAR_BYTES = 2 * 1024 * 1024 * 1024
MAX_ITEMS = 100000


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
    require(not target.exists(), "DESTINATION_ALREADY_EXISTS")
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
        try:
            with bundle.open(info) as source, open(target, "xb") as output:
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


def validate_enriched_archive(base):
    before = inventory_rows(protected_json(base / "storage-inventory.json"))
    after = inventory_rows(protected_json(base / "storage-post-inventory.json"))
    require(before == after, "INVENTORY_CHANGED_DURING_EXPORT")
    manifest = protected_json(base / "storage" / "manifest.json")
    require(isinstance(manifest, dict)
            and manifest.get("schema") == "iberfit.storage.backup.v1"
            and manifest.get("project") == "pjhmrhejsoofmouedavw"
            and isinstance(manifest.get("objects"), list),
            "MANIFEST_INVALID")
    objects = manifest["objects"]
    require(len(objects) == len(before), "MANIFEST_COUNT_MISMATCH")
    seen = set()
    for idx, x in enumerate(objects):
        require(isinstance(x, dict)
                and isinstance(x.get("bucket"), str) and bool(x["bucket"])
                and isinstance(x.get("name"), str) and bool(x["name"])
                and x.get("relative") == "files/" + str(idx).zfill(6) + ".bin"
                and type(x.get("bytes")) is int and x["bytes"] >= 0
                and isinstance(x.get("sha256"), str)
                and HEX64.fullmatch(x["sha256"]), "MANIFEST_ENTRY_INVALID")
        k = (x["bucket"], x["name"])
        require(k not in seen and k in before, "MANIFEST_OBJECT_MISMATCH")
        seen.add(k)
        size = before[k][3]
        require(size is None or int(size) == x["bytes"],
                "STORAGE_SIZE_MISMATCH")
    require(seen == set(before), "INVENTORY_MANIFEST_MISMATCH")
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


def unpack_tar(archive, directory):
    base = pathlib.Path(directory).resolve()
    require(base.is_dir() and not any(base.iterdir()), "RESTORE_DIR_NOT_EMPTY")
    present = set()
    total = 0
    with tarfile.open(archive, mode="r:") as bundle:
        for member in bundle:
            name = member.name.removeprefix("./").rstrip("/")
            require(name not in present, "TAR_DUPLICATE_ENTRY")
            present.add(name)
            if member.isdir():
                require(name in ("storage", "storage/files"), "TAR_UNSAFE_DIRECTORY")
                (base / name).mkdir(parents=True, exist_ok=True)
                continue
            require(member.isfile() and allowed_tar_file(name), "TAR_UNSAFE_ENTRY")
            limit = (MAX_JSON_BYTES if name in EXTRA_FILES else
                     MAX_ROLES_BYTES if name == ROLE_FILE else MAX_TAR_BYTES)
            require(0 <= member.size <= limit, "TAR_MEMBER_TOO_LARGE")
            total += member.size
            require(total <= MAX_TAR_BYTES and len(present) <= MAX_ITEMS,
                    "TAR_LIMIT_EXCEEDED")
            target = base / name
            target.parent.mkdir(parents=True, exist_ok=True)
            require(target.resolve().is_relative_to(base), "TAR_PATH_ESCAPE")
            source = bundle.extractfile(member)
            require(source is not None, "TAR_MEMBER_MISSING")
            with source, open(target, "xb") as output:
                os.chmod(target, 0o600)
                shutil.copyfileobj(source, output, length=1024 * 1024)
    require({"database.pgcustom", "storage/manifest.json"}.issubset(present),
            "TAR_REQUIRED_COMPONENT_MISSING")
    extension = present.intersection(EXTRA_FILES)
    require(not extension or extension == EXTRA_FILES,
            "PARTIAL_ENRICHED_ARCHIVE")
    if extension:
        validate_enriched_archive(base)
    if ROLE_FILE in present:
        require(extension == EXTRA_FILES, "ROLES_WITHOUT_ENRICHED_METADATA")
        validate_optional_role_archive(base / ROLE_FILE)
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
