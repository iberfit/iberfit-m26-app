#!/usr/bin/env python3
"""Fail-closed parser for an externally downloaded M44 archive; never prints private content."""
import hashlib
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


def allowed_tar_file(name):
    return name == "database.pgcustom" or name == "storage/manifest.json" or (
        re.fullmatch(r"storage/files/[0-9]{6,12}\.bin", name) is not None)


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
            require(0 <= member.size <= MAX_TAR_BYTES, "TAR_MEMBER_TOO_LARGE")
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
