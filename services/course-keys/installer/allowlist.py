#!/usr/bin/python3
"""Root operator tool, never granted to Web/importer by sudoers.
audit: JSON account readiness; propose: JSON config on stdout; approve: explicit commit.
"""
import argparse
import csv
import importlib.util
import io
import json
import os
import sys
import tempfile

HELPER = "/usr/local/libexec/course-keys/helper.py"
spec = importlib.util.spec_from_file_location("course_keys_installer", HELPER)
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)

def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("audit")
    propose = sub.add_parser("propose")
    propose.add_argument("--roster-csv", required=True, help="UTF-8 CSV with studentId/学号 and serverId/服务器号 columns")
    approve = sub.add_parser("approve")
    approve.add_argument("--configuration", required=True, help="Reviewed root-owned candidate configuration")
    args = parser.parse_args()
    if os.geteuid() != 0:
        parser.error("Run as root from a root-owned reviewed installation")
    config = helper.load_config()
    if args.command == "audit":
        results = [helper.process_request({"operation": "check", "studentId": name, "serverId": config["serverId"], "username": helper.student_username(name)}, config)
                   for name in sorted(config["allowedAccounts"])]
        print(json.dumps({"accounts": results}, ensure_ascii=False, indent=2))
        return 0 if all(item["ok"] for item in results) else 2
    if args.command == "propose":
        import pwd
        with open(args.roster_csv, "rb") as stream:
            raw = stream.read(2097153)
        if len(raw) > 2097152:
            parser.error("Roster CSV is limited to 2 MiB")
        reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
        column = "studentId" if "studentId" in (reader.fieldnames or []) else "学号"
        if column not in (reader.fieldnames or []):
            parser.error("CSV must contain studentId or 学号")
        server_column = next((key for key in ("serverId", "服务器号", "服务器") if key in reader.fieldnames), None)
        if server_column is None:
            parser.error("CSV must contain serverId or 服务器号")
        names, seen = [], set()
        for row in reader:
            name = helper.student_name((row.get(column) or "").strip())
            server_id = (row.get(server_column) or "").strip()
            if server_id not in helper.SERVER_IDS:
                parser.error("Unknown serverId in roster")
            if name in seen or len(seen) >= 2000:
                parser.error("Duplicate student IDs or more than 2000 students")
            seen.add(name)
            if server_id == config["serverId"]:
                names.append(name)
        if not names:
            parser.error("No roster rows are assigned to this server")
        errors = []
        for name in names:
            try:
                account = pwd.getpwnam(helper.student_username(name))
                prior = config["allowedAccounts"].get(name)
                if prior is not None and prior["expectedUid"] != account.pw_uid:
                    helper.fail("UID_CHANGED", "Existing approval has a different UID; investigate before rebinding")
                config["allowedAccounts"][name] = {"expectedUid": account.pw_uid}
                helper.check_account(config, name)
            except KeyError:
                errors.append({"studentId": name, "code": "ACCOUNT_MISSING"})
            except helper.InstallerError as error:
                errors.append({"studentId": name, "code": error.code, "message": error.message})
        if errors:
            print(json.dumps({"errors": errors}, ensure_ascii=False, indent=2), file=sys.stderr)
            return 2
        helper.validate_config(config)
        # Additive proposal: omitted students retain their existing approval.
        print(json.dumps(config, ensure_ascii=False, indent=2))
        return 0
    candidate = json.loads(helper.secure_read(args.configuration, 1048576).decode("utf-8"))
    helper.validate_config(candidate)
    # This tool approves accounts only. Paths/group/security policy are fixed.
    for key in config:
        if key != "allowedAccounts" and candidate[key] != config[key]:
            parser.error("Account approval cannot alter installer paths or policy")
    for name in candidate["allowedAccounts"]:
        helper.check_account(candidate, name)
    previous = helper.secure_read(helper.CONFIG_PATH, 1048576)
    backup_fd, backup_path = tempfile.mkstemp(prefix="allowlist-before-", suffix=".json", dir=config["stateDirectory"])
    with os.fdopen(backup_fd, "wb") as stream:
        stream.write(previous)
        stream.flush()
        os.fsync(stream.fileno())
    fd, temporary = tempfile.mkstemp(prefix=".installer-", dir=os.path.dirname(helper.CONFIG_PATH))
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write((json.dumps(candidate, indent=2) + "\n").encode("utf-8"))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, helper.CONFIG_PATH)
        directory = os.open(os.path.dirname(helper.CONFIG_PATH), os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print(json.dumps({"approvedAccounts": len(candidate["allowedAccounts"]), "backup": backup_path}))
    return 0

if __name__ == "__main__":
    try:
        sys.exit(main())
    except (helper.InstallerError, OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
