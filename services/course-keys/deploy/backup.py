#!/usr/bin/python3
"""Root orchestrates snapshots, but never opens SQLite under root privileges."""
import datetime
import hashlib
import importlib.util
import json
import os
import pwd
import resource
import secrets
import shutil
import stat
import subprocess
import sys
import tempfile

SPEC = importlib.util.spec_from_file_location("course_keys_installer", "/usr/local/libexec/course-keys/helper.py")
helper = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(helper)
BACKUPS = "/var/backups/course-key-service"
SNAPSHOT_HELPER = "/usr/local/libexec/course-keys/snapshot-db.py"
MAX_DB = 256 * 1024 * 1024
DATABASES = {
    "web": ("course-keys-web", "/var/lib/course-key-service/web"),
    "importer": ("course-keys-importer", "/var/lib/course-key-service/importer"),
}

def snapshot_database(role, destination):
    user, directory = DATABASES[role]
    account = pwd.getpwnam(user)
    if account.pw_uid == 0:
        raise RuntimeError("Database owner may not be root")
    helper.trusted_path(os.path.dirname(directory), "directory")
    parent = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    nonce = secrets.token_hex(16)
    filename = ".course-backup-" + nonce + ".sqlite3"
    try:
        info = os.fstat(parent)
        if info.st_uid != account.pw_uid or not stat.S_ISDIR(info.st_mode) or info.st_mode & 0o077:
            raise RuntimeError("Database directory must be private to its service owner")
        def drop_privileges():
            os.setgroups([])
            os.setgid(account.pw_gid)
            os.setuid(account.pw_uid)
            resource.setrlimit(resource.RLIMIT_FSIZE, (MAX_DB, MAX_DB))
        completed = subprocess.run(["/usr/bin/python3", "-I", "-S", SNAPSHOT_HELPER, role, nonce],
                                   stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   timeout=90, check=False, preexec_fn=drop_privileges,
                                   cwd="/", env={"PATH": "/usr/bin:/bin", "LANG": "C", "LC_ALL": "C", "HOME": "/nonexistent"})
        if completed.returncode != 0:
            raise RuntimeError("Database-owner snapshot failed")
        # The child never gets to choose the path copied by root.
        fd = os.open(filename, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK, dir_fd=parent)
        try:
            before = os.fstat(fd)
            if not stat.S_ISREG(before.st_mode) or before.st_uid != account.pw_uid or before.st_nlink != 1 or before.st_size > MAX_DB:
                raise RuntimeError("Unsafe snapshot file")
            with os.fdopen(fd, "rb", closefd=False) as source, open(destination, "xb") as target:
                remaining = MAX_DB
                while True:
                    data = source.read(min(1048576, remaining + 1))
                    if not data:
                        break
                    remaining -= len(data)
                    if remaining < 0:
                        raise RuntimeError("Snapshot exceeds size limit")
                    target.write(data)
                target.flush()
                os.fsync(target.fileno())
            after = os.fstat(fd)
            if (after.st_size, after.st_mtime_ns, after.st_ctime_ns) != (before.st_size, before.st_mtime_ns, before.st_ctime_ns):
                raise RuntimeError("Snapshot changed during copy")
        finally:
            os.close(fd)
    finally:
        try:
            # unlink does not follow a replacement symlink.
            os.unlink(filename, dir_fd=parent)
        except FileNotFoundError:
            pass
        os.close(parent)

def expire_snapshots(now):
    cutoff = now - datetime.timedelta(days=30)
    for entry in os.scandir(BACKUPS):
        try:
            timestamp = datetime.datetime.strptime(entry.name, "%Y%m%dT%H%M%S%fZ").replace(tzinfo=datetime.timezone.utc)
        except ValueError:
            continue
        if timestamp < cutoff and entry.is_dir(follow_symlinks=False):
            helper.trusted_path(entry.path, "directory")
            shutil.rmtree(entry.path)

def main():
    if os.geteuid() != 0 or len(sys.argv) != 1:
        raise RuntimeError("Run fixed backup program as root without arguments")
    os.umask(0o077)
    helper.trusted_path(BACKUPS, "directory")
    helper.trusted_path(SNAPSHOT_HELPER)
    config = helper.load_config()
    now = datetime.datetime.now(datetime.timezone.utc)
    stamp = now.strftime("%Y%m%dT%H%M%S%fZ")
    staging = tempfile.mkdtemp(prefix=".snapshot-", dir=BACKUPS)
    try:
        for role in DATABASES:
            snapshot_database(role, os.path.join(staging, role + ".sqlite3"))
        keys = os.path.join(staging, "keys")
        os.mkdir(keys, 0o700)
        hashes = {}
        for name in sorted(os.listdir(config["keysDirectory"])):
            if not (helper.STUDENT_RE.fullmatch(name) or helper.USERNAME_RE.fullmatch(name)):
                continue
            data = helper.secure_read(os.path.join(config["keysDirectory"], name), helper.MAX_REQUEST)
            helper.parse_stored_state(config, name, data)
            with open(os.path.join(keys, name), "xb") as stream:
                stream.write(data)
            hashes[name] = hashlib.sha256(data).hexdigest()
        with open(os.path.join(staging, "installer.json"), "xb") as stream:
            stream.write(helper.secure_read(helper.CONFIG_PATH, 1048576))
        with open(os.path.join(staging, "manifest.json"), "x", encoding="utf-8") as stream:
            json.dump({"createdAt": stamp, "schemaVersion": 2, "serverId": config["serverId"], "keySha256": hashes, "retentionDays": 30,
                       "restoreNote": "Stop services; restore database snapshots, then reconcile against live central keys. Do not blindly restore older key generations.",
                       "secretsIncluded": False}, stream, indent=2)
        completed = os.path.join(BACKUPS, stamp)
        os.rename(staging, completed)
        staging = None
        expire_snapshots(now)
        print(json.dumps({"ok": True, "snapshot": completed}))
        return 0
    finally:
        if staging is not None:
            shutil.rmtree(staging)

if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        print(json.dumps({"ok": False, "error": "Backup failed; completed snapshots were retained"}))
        sys.exit(1)
