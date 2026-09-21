#!/usr/bin/python3
"""Root-only central-key snapshots for a Python-only receiver; no database or credentials."""
import datetime
import hashlib
import importlib.util
import json
import os
import re
import shutil
import stat
import sys
import tempfile

BACKUPS = "/var/backups/course-key-target"
HELPER = "/usr/local/libexec/course-keys/helper.py"
SNAPSHOT_RE = re.compile(r"[0-9]{8}T[0-9]{12}Z\Z")
RETENTION_DAYS = 30

def load_helper():
    spec = importlib.util.spec_from_file_location("course_target_backup_helper", HELPER)
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    return helper

def private_directory(helper, path):
    helper.trusted_path(path, "directory")
    info = os.lstat(path)
    if info.st_uid != 0 or info.st_mode & 0o077:
        raise RuntimeError("Backup directories must be private to root")

def fsync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)

def write_private(path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())

def verify_snapshot(helper, folder, expected_server):
    """Read back the saved bytes and validate metadata and every recorded checksum."""
    private_directory(helper, folder)
    private_directory(helper, os.path.join(folder, "keys"))
    manifest = json.loads(helper.secure_read(os.path.join(folder, "manifest.json"), 1048576))
    if manifest.get("schemaVersion") != 1 or manifest.get("serverId") != expected_server:
        raise RuntimeError("Snapshot destination metadata is invalid")
    raw_config = helper.secure_read(os.path.join(folder, "installer.json"), 1048576)
    if hashlib.sha256(raw_config).hexdigest() != manifest.get("installerSha256"):
        raise RuntimeError("Snapshot configuration checksum mismatch")
    config = json.loads(raw_config)
    helper.validate_config(config)
    if config["serverId"] != expected_server:
        raise RuntimeError("Snapshot configuration has a different server")
    hashes = manifest.get("keySha256")
    if not isinstance(hashes, dict) or set(os.listdir(os.path.join(folder, "keys"))) != set(hashes):
        raise RuntimeError("Snapshot key inventory mismatch")
    for name, expected_hash in hashes.items():
        helper.archive_filename(name)
        raw = helper.secure_read(os.path.join(folder, "keys", name), helper.MAX_REQUEST)
        if hashlib.sha256(raw).hexdigest() != expected_hash:
            raise RuntimeError("Snapshot key checksum mismatch")
        helper.parse_stored_state(config, name, raw)
    return len(hashes)

def create_snapshot(helper, now):
    private_directory(helper, BACKUPS)
    raw_config = helper.secure_read(helper.CONFIG_PATH, 1048576)
    config = helper.validate_config(json.loads(raw_config))
    if config["serverId"] not in ("132", "197"):
        raise RuntimeError("Use the database-aware service backup on server 190")
    stamp = now.strftime("%Y%m%dT%H%M%S%fZ")
    staging = tempfile.mkdtemp(prefix=".snapshot-", dir=BACKUPS)
    try:
        keys = os.path.join(staging, "keys")
        os.mkdir(keys, 0o700)
        hashes = {}
        for name in sorted(os.listdir(config["keysDirectory"])):
            if not (helper.STUDENT_RE.fullmatch(name) or helper.USERNAME_RE.fullmatch(name)):
                continue
            raw = helper.secure_read(os.path.join(config["keysDirectory"], name), helper.MAX_REQUEST)
            helper.parse_stored_state(config, name, raw)
            write_private(os.path.join(keys, name), raw)
            hashes[name] = hashlib.sha256(raw).hexdigest()
        write_private(os.path.join(staging, "installer.json"), raw_config)
        manifest = {"schemaVersion": 1, "serverId": config["serverId"], "createdAt": stamp,
                    "scope": "central-keys-and-installer-allowlist", "retentionUtcDays": RETENTION_DAYS,
                    "installerSha256": hashlib.sha256(raw_config).hexdigest(), "keySha256": hashes,
                    "credentialsIncluded": False,
                    "restoreNote": "Key files contain generations. Reconcile live state and tasks before any manual restore; never roll generations back. Files are individually consistent, not one global transaction."}
        write_private(os.path.join(staging, "manifest.json"), (json.dumps(manifest, indent=2) + "\n").encode("ascii"))
        count = verify_snapshot(helper, staging, config["serverId"])
        fsync_directory(keys)
        fsync_directory(staging)
        completed = os.path.join(BACKUPS, stamp)
        os.rename(staging, completed)
        staging = None
        fsync_directory(BACKUPS)
        return {"ok": True, "serverId": config["serverId"], "snapshot": stamp,
                "keyFiles": count, "metadataAndHashesVerified": True, "credentialsIncluded": False}
    finally:
        if staging is not None:
            # This is our new private staging directory, never a completed snapshot.
            shutil.rmtree(staging)

def expire_snapshots(helper, now):
    # Retain today and the preceding 29 UTC dates; extra same-day runs do not shorten it.
    cutoff = now.date() - datetime.timedelta(days=RETENTION_DAYS - 1)
    for entry in os.scandir(BACKUPS):
        if not SNAPSHOT_RE.fullmatch(entry.name):
            continue
        timestamp = datetime.datetime.strptime(entry.name, "%Y%m%dT%H%M%S%fZ")
        if timestamp.date() < cutoff:
            private_directory(helper, entry.path)
            # BACKUPS and snapshot are root-only; rmtree does not follow symlink entries.
            shutil.rmtree(entry.path)
    fsync_directory(BACKUPS)

def main():
    if len(sys.argv) != 1 or not hasattr(os, "geteuid") or os.geteuid() != 0:
        raise RuntimeError("Run the fixed backup program as root without arguments")
    os.umask(0o077)
    helper = load_helper()
    private_directory(helper, BACKUPS)
    import fcntl
    fd = os.open(os.path.join(BACKUPS, ".backup.lock"), os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o077 or info.st_nlink != 1:
            raise RuntimeError("Unsafe target backup lock")
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        now = datetime.datetime.now(datetime.timezone.utc)
        result = create_snapshot(helper, now)
        expire_snapshots(helper, now)
        print(json.dumps(result, separators=(",", ":")))
    finally:
        os.close(fd)

if __name__ == "__main__":
    try:
        main()
    except Exception:
        print(json.dumps({"ok": False, "error": "Target snapshot failed; inspect configuration and permissions. No key text or login credentials are logged."}))
        sys.exit(1)
