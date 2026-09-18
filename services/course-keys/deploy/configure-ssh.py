#!/usr/bin/python3
"""Append one audited Match block without replacing existing global SSH settings.
Run only as root after copying into /usr/local/libexec/course-keys.
"""
import argparse
import datetime
import grp
import importlib.util
import json
import os
import pwd
import re
import subprocess
import sys
import tempfile

SPEC = importlib.util.spec_from_file_location("course_keys_installer", "/usr/local/libexec/course-keys/helper.py")
helper = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(helper)
SSHD_CONFIG = "/etc/ssh/sshd_config"
BEGIN = "# BEGIN course-keys managed Match"
END = "# END course-keys managed Match"

def effective(path, user, address, port):
    connection = "user={0},host=client,addr={1},laddr=127.0.0.1,lport={2}".format(user, address, port)
    result = subprocess.run(["/usr/sbin/sshd", "-T", "-f", path, "-C", connection],
                            check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
    return dict(line.split(" ", 1) for line in result.stdout.splitlines() if " " in line)

def atomic_bytes(path, data, mode):
    fd, temporary = tempfile.mkstemp(prefix=".course-ssh-", dir=os.path.dirname(path))
    try:
        with os.fdopen(fd, "wb") as stream:
            os.fchmod(stream.fileno(), mode)
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
    parser = argparse.ArgumentParser()
    parser.add_argument("--admin", required=True, help="Existing administrator username to confirm unchanged")
    parser.add_argument("--student", action="append", required=True, help="Existing approved stu account username; repeat if needed")
    parser.add_argument("--client-address", required=True, help="Actual representative SSH client IP for Match checks")
    parser.add_argument("--port", type=int, default=2024)
    parser.add_argument("--service", choices=("ssh", "sshd"), default="ssh")
    args = parser.parse_args()
    if os.geteuid() != 0:
        parser.error("Run as root")
    import ipaddress
    ipaddress.ip_address(args.client_address)
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", args.admin) or not 1 <= args.port <= 65535:
        parser.error("Invalid administrator username or SSH port")
    config = helper.load_config()
    if not re.fullmatch(r"[a-z_][a-z0-9_-]*", config["requiredGroup"]):
        parser.error("Unsafe course group name")
    course_group = grp.getgrnam(config["requiredGroup"])
    admin = pwd.getpwnam(args.admin)
    if course_group.gr_gid in os.getgrouplist(args.admin, admin.pw_gid):
        parser.error("The administrator must not belong to the course group")
    names = set(args.student) | {helper.student_username(sid) for sid in config["allowedAccounts"]} | set(course_group.gr_mem)
    names |= {entry.pw_name for entry in pwd.getpwall() if entry.pw_gid == course_group.gr_gid}
    for name in names:
        sid = helper.username_student(name)
        helper.check_account(config, sid)
    original = helper.secure_read(SSHD_CONFIG, 1048576)
    original_text = original.decode("utf-8")
    baselines = {name: effective(SSHD_CONFIG, name, args.client_address, args.port) for name in names}
    admin_before = effective(SSHD_CONFIG, args.admin, args.client_address, args.port)
    central = config["keysDirectory"] + "/%u"
    for name, values in baselines.items():
        if values.get("passwordauthentication") != "no" or values.get("kbdinteractiveauthentication", values.get("challengeresponseauthentication")) != "no":
            parser.error("Password and keyboard-interactive authentication must already be disabled for " + name)
    if BEGIN in original_text or END in original_text:
        if original_text.count(BEGIN) != 1 or original_text.count(END) != 1:
            parser.error("Ambiguous existing course-key block")
        if not all(central in values.get("authorizedkeysfile", "").split() for values in baselines.values()):
            parser.error("The existing managed block is not effective for every course account")
        print(json.dumps({"changed": False, "message": "Existing managed Match verified"}))
        return 0
    existing_values = {values.get("authorizedkeysfile", "") for values in baselines.values()}
    if len(existing_values) != 1 or not next(iter(existing_values)):
        parser.error("Different per-account AuthorizedKeysFile values require manual configuration")
    existing = next(iter(existing_values))
    if central in existing.split():
        print(json.dumps({"changed": False, "message": "Central key path is already effective; no block added"}))
        return 0
    block = "\n{0}\nMatch Group {1}\n    AuthorizedKeysFile {2} {3}\nMatch all\n{4}\n".format(BEGIN, config["requiredGroup"], existing, central, END)
    candidate = original_text.rstrip("\n") + "\n" + block
    mode = os.stat(SSHD_CONFIG).st_mode & 0o777
    fd, temporary = tempfile.mkstemp(prefix=".course-sshd-check-", dir="/etc/ssh")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write(candidate)
        subprocess.run(["/usr/sbin/sshd", "-t", "-f", temporary], check=True)
        for name, before in baselines.items():
            after = effective(temporary, name, args.client_address, args.port)
            expected = dict(before)
            expected["authorizedkeysfile"] = existing + " " + central
            if after != expected:
                parser.error("An overlapping Match or other change prevents safe automatic configuration for " + name)
        if effective(temporary, args.admin, args.client_address, args.port) != admin_before:
            parser.error("Candidate configuration would change administrator SSH settings")
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        backup = os.path.join(config["stateDirectory"], "sshd-before-" + stamp + ".conf")
        atomic_bytes(backup, original, 0o600)
        atomic_bytes(SSHD_CONFIG, candidate.encode("utf-8"), mode)
        try:
            subprocess.run(["/usr/sbin/sshd", "-t"], check=True)
            subprocess.run(["/bin/systemctl", "reload", args.service], check=True)
        except subprocess.CalledProcessError:
            atomic_bytes(SSHD_CONFIG, original, mode)
            subprocess.run(["/usr/sbin/sshd", "-t"], check=True)
            subprocess.run(["/bin/systemctl", "reload", args.service], check=True)
            raise
        print(json.dumps({"changed": True, "backup": backup, "accountsChecked": sorted(names),
                          "next": "Keep the administrator session open and test a separate student connection"}))
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return 0

if __name__ == "__main__":
    try:
        sys.exit(main())
    except (helper.InstallerError, OSError, ValueError, KeyError, subprocess.CalledProcessError) as error:
        print("SSH configuration was not completed: " + str(error), file=sys.stderr)
        sys.exit(1)
