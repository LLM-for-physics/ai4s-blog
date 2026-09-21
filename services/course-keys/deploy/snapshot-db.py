#!/usr/bin/python3
"""Executed under the database service UID, never root. No user-writable imports."""
import json
import os
import pwd
import re
import sqlite3
import stat
import sys

DATABASES = {
    "web": ("course-keys-web", "/var/lib/course-key-service/web", "keys.sqlite3"),
    "importer": ("course-keys-importer", "/var/lib/course-key-service/importer", "jobs.sqlite3"),
}

def main():
    if len(sys.argv) != 3 or sys.argv[1] not in DATABASES or not re.fullmatch(r"[0-9a-f]{32}", sys.argv[2]):
        raise RuntimeError("Invalid snapshot arguments")
    user, directory, name = DATABASES[sys.argv[1]]
    expected = pwd.getpwnam(user)
    if os.geteuid() == 0 or os.geteuid() != expected.pw_uid:
        raise RuntimeError("Snapshot must run as the database owner")
    os.umask(0o077)
    source = directory + "/" + name
    target = directory + "/.course-backup-" + sys.argv[2] + ".sqlite3"
    source_info = os.lstat(source)
    if not stat.S_ISREG(source_info.st_mode) or source_info.st_uid != expected.pw_uid:
        raise RuntimeError("Invalid database source")
    # Reserve the destination atomically; any SQLite sidecar access runs at low privilege.
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    os.close(fd)
    connection = None
    destination = None
    try:
        connection = sqlite3.connect("file:" + source + "?mode=ro", uri=True, timeout=5)
        connection.execute("PRAGMA trusted_schema=OFF")
        destination = sqlite3.connect(target)
        destination.execute("PRAGMA trusted_schema=OFF")
        connection.backup(destination, pages=128, sleep=0.05)
        if destination.execute("PRAGMA quick_check").fetchone()[0] != "ok":
            raise RuntimeError("Snapshot failed quick_check")
        destination.execute("PRAGMA journal_mode=DELETE")
        destination.close()
        destination = None
        connection.close()
        connection = None
        fd = os.open(target, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
        print(json.dumps({"ok": True}))
        return 0
    finally:
        if destination is not None:
            destination.close()
        if connection is not None:
            connection.close()

if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        print(json.dumps({"ok": False, "error": "Database-owner snapshot failed"}))
        sys.exit(1)
