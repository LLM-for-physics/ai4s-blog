#!/usr/bin/python3
"""Explicit root-only v1-to-v2 configuration migration. Never renames accounts/keys."""
import argparse
import datetime
import importlib.util
import json
import os
from pathlib import Path
import stat
import sys
import tempfile

CONFIG = "/etc/course-keys/installer.json"

def trusted(path):
    path = Path(path).absolute()
    for part in list(reversed(path.parents)) + [path]:
        info = part.lstat()
        if stat.S_ISLNK(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            raise RuntimeError("Migration code must have trusted root-owned ancestors")
    return path

def load_helper():
    source = Path(__file__).absolute().parent.parent / "installer/helper.py"
    if not source.exists():
        source = Path("/usr/local/libexec/course-keys/helper.py")
    spec = importlib.util.spec_from_file_location("migration_helper", str(trusted(source)))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def candidate_config(helper, original, server_id):
    if original.get("schemaVersion") != 1:
        raise RuntimeError("Only a schemaVersion 1 configuration can be migrated")
    if original.get("serverId") not in (server_id, "fyl" + server_id):
        raise RuntimeError("Legacy configuration belongs to a different server")
    if original.get("allowedAccounts") != {}:
        raise RuntimeError("Legacy allowlist must be empty: revoke old keys and explicitly retire old approvals first; never rebind their UIDs to stu accounts")
    candidate = dict(original, schemaVersion=2, serverId=server_id)
    helper.validate_config(candidate)
    for name in sorted(os.listdir(candidate["keysDirectory"])):
        if not (helper.STUDENT_RE.fullmatch(name) or helper.USERNAME_RE.fullmatch(name)):
            continue
        state = helper.parse_stored_state(candidate, name,
                    helper.secure_read(os.path.join(candidate["keysDirectory"], name), helper.MAX_REQUEST))
        if state["action"] != "revoke":
            raise RuntimeError("An installed central key remains; revoke and verify it before migration")
    return candidate

def write_atomic(path, data):
    fd, temporary = tempfile.mkstemp(prefix=".config-migration-", dir=os.path.dirname(path))
    try:
        with os.fdopen(fd, "wb") as stream:
            os.fchmod(stream.fileno(), 0o600)
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        directory = os.open(os.path.dirname(path), os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server-id", required=True, choices=("132", "190", "197"))
    parser.add_argument("--commit", action="store_true", help="Commit the reviewed migration; otherwise only validate")
    args = parser.parse_args()
    if os.geteuid() != 0:
        parser.error("Run as root from a reviewed root-owned release; stop Web/importer first")
    os.umask(0o077)
    helper = load_helper()
    before = helper.secure_read(CONFIG, 1048576)
    candidate = candidate_config(helper, json.loads(before), args.server_id)
    backup = None
    if args.commit:
        if helper.secure_read(CONFIG, 1048576) != before:
            raise RuntimeError("Configuration changed during migration review")
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        backup = os.path.join(candidate["stateDirectory"], "installer-v1-" + stamp + ".json")
        with open(backup, "xb") as stream:
            stream.write(before)
            stream.flush()
            os.fsync(stream.fileno())
        write_atomic(CONFIG, (json.dumps(candidate, indent=2) + "\n").encode("utf-8"))
    print(json.dumps({"ok": True, "committed": args.commit, "serverId": args.server_id,
                      "allowedAccounts": 0, "backup": backup, "legacyKeyFilesPreserved": True}))

if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}))
        sys.exit(1)
