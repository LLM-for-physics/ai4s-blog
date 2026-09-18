#!/usr/bin/python3
"""Explicit opt-in acceptance for a dedicated, disposable stu-prefixed test account.

Run as root from a reviewed root-owned installation:
  /usr/bin/python3 -I -S live_ssh_acceptance.py --server-id 190 --student 2026999999

The account must already exist, be approved and have no central installer state.
No accounts are created; sshd and personal authorized_keys files are never edited.
Only loopback SSH is used. Generated private keys stay in a private /root directory
and are deleted on exit. A final revocation retains monotonically increasing state.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import secrets
import signal
import stat
import subprocess
import sys
import tempfile

SUDO = "/usr/bin/sudo"
PYTHON = "/usr/bin/python3"
SSH = "/usr/bin/ssh"
KEYGEN = "/usr/bin/ssh-keygen"
HELPER = "/usr/local/libexec/course-keys/helper.py"
HOST_PUBLIC_KEY = "/etc/ssh/ssh_host_ed25519_key.pub"
IMPORTER = "course-keys-importer"
WEB = "course-keys-web"
STUDENT = re.compile(r"[0-9]{6,16}\Z")
PORT = 2024
SERVER_ID = None

class AcceptanceError(Exception):
    pass

def run(argv, input_text=None, timeout=30):
    """No shell, inherited agent, interactive stdin or lingering local child."""
    process = subprocess.Popen(
        argv, stdin=subprocess.PIPE if input_text is not None else subprocess.DEVNULL,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True,
        start_new_session=True, cwd="/",
        env={"PATH": "/usr/bin:/bin", "LANG": "C", "LC_ALL": "C", "HOME": "/root"})
    try:
        stdout, stderr = process.communicate(input_text, timeout=timeout)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.communicate()
        raise AcceptanceError("A local acceptance command timed out")
    return subprocess.CompletedProcess(argv, process.returncode, stdout, stderr)

def helper_request(payload, user=IMPORTER):
    payload = dict(payload, serverId=SERVER_ID, username="stu" + payload["studentId"])
    command = [SUDO, "-n", "-u", user, SUDO, "-n", PYTHON, "-I", "-S", HELPER]
    completed = run(command, json.dumps(payload, separators=(",", ":")) + "\n")
    try:
        answer = json.loads(completed.stdout)
    except ValueError:
        raise AcceptanceError("The fixed helper did not return JSON (exit {0})".format(completed.returncode))
    if not isinstance(answer, dict) or type(answer.get("ok")) is not bool:
        raise AcceptanceError("Unexpected helper response")
    if any(answer.get(k) != payload[k] for k in ("serverId", "studentId", "username")):
        raise AcceptanceError("Helper response destination mismatch")
    if answer["ok"] != (completed.returncode == 0):
        raise AcceptanceError("Helper exit status disagrees with its response")
    return answer

def require_ok(answer):
    if not answer["ok"]:
        error = answer.get("error") or {}
        raise AcceptanceError("Helper rejected operation: " + str(error.get("code", "UNKNOWN")))
    return answer

def state(student):
    return require_ok(helper_request({"operation": "status", "studentId": student}))

def trusted_public_host_key():
    path = Path(HOST_PUBLIC_KEY)
    for component in list(reversed(path.parents)) + [path]:
        info = component.lstat()
        if stat.S_ISLNK(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            raise AcceptanceError("The local SSH host public key path is not trusted")
    if not path.is_file():
        raise AcceptanceError("The local Ed25519 host public key is unavailable")
    fields = path.read_text(encoding="ascii").split()
    if len(fields) < 2 or fields[0] != "ssh-ed25519":
        raise AcceptanceError("The local host key is not Ed25519")
    try:
        base64.b64decode(fields[1], validate=True)
    except ValueError:
        raise AcceptanceError("The local host public key has invalid encoding")
    return fields[0] + " " + fields[1]

def make_key(directory, label):
    private = directory / label
    generated = run([KEYGEN, "-q", "-t", "ed25519", "-N", "", "-C",
                     "course-key-acceptance-" + label, "-f", str(private)])
    if generated.returncode != 0:
        raise AcceptanceError("Cannot generate temporary acceptance key " + label)
    fields = private.with_suffix(".pub").read_text(encoding="ascii").split()
    public = fields[0] + " " + fields[1]
    fingerprint = "SHA256:" + base64.b64encode(
        hashlib.sha256(base64.b64decode(fields[1], validate=True)).digest()).decode("ascii").rstrip("=")
    if private.stat().st_mode & 0o077:
        raise AcceptanceError("Temporary private-key permissions are not private")
    return {"private": str(private), "publicKey": public, "fingerprint": fingerprint}

def expect_login(student, key, known_hosts, allowed):
    command = [
        SSH, "-F", "/dev/null", "-T", "-n", "-p", str(PORT),
        "-l", "stu" + student, "-i", key["private"],
        "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes", "-o", "IdentityAgent=none",
        "-o", "StrictHostKeyChecking=yes", "-o", "UserKnownHostsFile=" + str(known_hosts),
        "-o", "GlobalKnownHostsFile=/dev/null", "-o", "UpdateHostKeys=no",
        "-o", "HostKeyAlgorithms=ssh-ed25519", "-o", "PreferredAuthentications=publickey",
        "-o", "PasswordAuthentication=no", "-o", "KbdInteractiveAuthentication=no",
        "-o", "ProxyCommand=none", "-o", "ProxyJump=none",
        "-o", "ConnectTimeout=5", "-o", "ConnectionAttempts=1",
        "127.0.0.1", "/usr/bin/true",
    ]
    completed = run(command, timeout=15)
    if allowed and completed.returncode != 0:
        raise AcceptanceError("Expected SSH authentication success, got exit " + str(completed.returncode))
    if not allowed and not (completed.returncode == 255 and "Permission denied" in completed.stderr):
        raise AcceptanceError("Expected public-key authentication rejection, got exit " + str(completed.returncode))
    return {"accepted": allowed, "exitCode": completed.returncode}

def apply(student, action, current, key=None):
    payload = {"operation": "apply", "studentId": student, "action": action,
               "generation": current["generation"] + 1,
               "publicKey": key["publicKey"] if key else None,
               "fingerprint": key["fingerprint"] if key else None}
    if action == "revoke":
        payload["expectedFingerprint"] = current.get("fingerprint")
    answer = require_ok(helper_request(payload))
    if answer.get("generation") != payload["generation"] or answer.get("action") != action:
        raise AcceptanceError("Helper returned an unexpected generation or action")
    return answer

def final_cleanup(student, generated_fingerprints):
    current = state(student)
    if current.get("action") == "install":
        if current.get("fingerprint") not in generated_fingerprints:
            raise AcceptanceError("Cleanup found a key outside this test; it was not revoked")
        current = apply(student, "revoke", current)
    elif current.get("action") == "none":
        current = apply(student, "revoke", current)
    elif current.get("action") != "revoke":
        raise AcceptanceError("Cleanup found unexpected central state")
    checked = state(student)
    if checked.get("action") != "revoke" or checked.get("publicKey") is not None or checked.get("fingerprint") is not None:
        raise AcceptanceError("Cleanup could not confirm a revoked central key")
    return {"ok": True, "generation": checked["generation"], "action": "revoke"}

def acceptance(student, report):
    if not hasattr(os, "geteuid") or os.geteuid() != 0:
        raise AcceptanceError("Run as root")
    if not STUDENT.fullmatch(student):
        raise AcceptanceError("Explicit student must be a 6-16 digit test-account name")
    account = pwd.getpwnam("stu" + student)  # Exact name, never numerical UID lookup.
    if account.pw_name != "stu" + student or account.pw_uid == 0:
        raise AcceptanceError("The selected test account is not eligible")
    service_uids = [pwd.getpwnam(user).pw_uid for user in (IMPORTER, WEB)]
    if 0 in service_uids or len(set(service_uids + [account.pw_uid])) != 3:
        raise AcceptanceError("Service and test accounts must have separate non-root UIDs")
    require_ok(helper_request({"operation": "check", "studentId": student}))
    initial = state(student)
    if initial.get("generation") != 0 or initial.get("action") != "none" or initial.get("publicKey") is not None:
        raise AcceptanceError("Refusing to test an account with any existing central installer state")
    report["steps"].append({"name": "approved_empty_test_account", "ok": True})

    # Fixed helper must not be reachable through sudo by the public Web account.
    denied = run([SUDO, "-n", "-u", WEB, SUDO, "-n", PYTHON, "-I", "-S", HELPER],
                 json.dumps({"operation": "check", "studentId": student, "serverId": SERVER_ID, "username": "stu" + student}) + "\n")
    if denied.returncode == 0:
        raise AcceptanceError("The Web account unexpectedly has helper sudo access")
    report["steps"].append({"name": "web_helper_sudo_denied", "ok": True})

    missing = None
    for _ in range(20):
        candidate = "{0:016d}".format(secrets.randbelow(10 ** 16))
        try:
            pwd.getpwnam("stu" + candidate)
        except KeyError:
            missing = candidate
            break
    if missing is None:
        raise AcceptanceError("Could not select a nonexistent numeric account for the negative check")
    missing_result = helper_request({"operation": "check", "studentId": missing})
    if missing_result["ok"] or missing_result.get("accountStatus") != "missing" or (missing_result.get("error") or {}).get("code") != "ACCOUNT_MISSING":
        raise AcceptanceError("Missing-account check did not fail with ACCOUNT_MISSING")
    report["steps"].append({"name": "missing_account_blocked", "ok": True})

    host_key = trusted_public_host_key()
    os.umask(0o077)
    with tempfile.TemporaryDirectory(prefix="course-keys-ssh-", dir="/root") as temporary:
        directory = Path(temporary)
        report["_temporaryDirectory"] = temporary
        report["temporaryPrivateKeysDeleted"] = False
        known_hosts = directory / "known_hosts"
        known_hosts.write_text("[127.0.0.1]:{0} {1}\n".format(PORT, host_key), encoding="ascii")
        keys = {name: make_key(directory, name) for name in ("A", "B", "wrong")}
        generated_fingerprints = {keys[name]["fingerprint"] for name in ("A", "B")}
        mutation_attempted = False
        try:
            # State must still be empty just before the first mutation.
            current = state(student)
            if current.get("generation") != 0 or current.get("action") != "none":
                raise AcceptanceError("Central state changed before acceptance began")
            mutation_attempted = True
            current = apply(student, "install", current, keys["A"])
            report["steps"].append({"name": "install_A", "ok": True, "generation": current["generation"]})
            for label, accepted in (("A", True), ("wrong", False)):
                result = expect_login(student, keys[label], known_hosts, accepted)
                report["steps"].append(dict(name=label + "_after_install_A", ok=True, **result))
            current = apply(student, "install", current, keys["B"])
            report["steps"].append({"name": "replace_with_B", "ok": True, "generation": current["generation"]})
            for label, accepted in (("A", False), ("B", True)):
                result = expect_login(student, keys[label], known_hosts, accepted)
                report["steps"].append(dict(name=label + "_after_replace_B", ok=True, **result))
            current = apply(student, "revoke", current)
            report["steps"].append({"name": "revoke_B", "ok": True, "generation": current["generation"]})
            result = expect_login(student, keys["B"], known_hosts, False)
            report["steps"].append(dict(name="B_after_revoke", ok=True, **result))
            current = apply(student, "install", current, keys["A"])
            report["steps"].append({"name": "restore_A", "ok": True, "generation": current["generation"]})
            result = expect_login(student, keys["A"], known_hosts, True)
            report["steps"].append(dict(name="A_after_restore", ok=True, **result))
        finally:
            if mutation_attempted:
                try:
                    report["cleanup"] = final_cleanup(student, generated_fingerprints)
                    for label in ("A", "B"):
                        result = expect_login(student, keys[label], known_hosts, False)
                        report["steps"].append(dict(name=label + "_after_final_cleanup", ok=True, **result))
                except Exception as error:
                    report["cleanup"] = {"ok": False, "error": str(error)}
                    raise
    report["temporaryPrivateKeysDeleted"] = True

def main():
    global SERVER_ID
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server-id", required=True, choices=("132", "190", "197"))
    parser.add_argument("--student", required=True, help="Dedicated disposable numeric course test account; no existing central state")
    args = parser.parse_args()
    SERVER_ID = args.server_id
    report = {"ok": False, "studentId": args.student, "username": "stu" + args.student, "serverId": SERVER_ID, "endpoint": "127.0.0.1:2024",
              "steps": [], "cleanup": None, "temporaryPrivateKeysDeleted": False}
    try:
        acceptance(args.student, report)
        report["ok"] = True
    except Exception as error:
        report["error"] = str(error)
    finally:
        temporary = report.pop("_temporaryDirectory", None)
        # Verify cleanup; do not claim deletion if TemporaryDirectory raised.
        report["temporaryPrivateKeysDeleted"] = temporary is None or not os.path.lexists(temporary)
        if not report["temporaryPrivateKeysDeleted"]:
            report["ok"] = False
            report["error"] = "Temporary private-key directory could not be removed; root cleanup is required"
    print(json.dumps(report, ensure_ascii=False, separators=(",", ":")))
    return 0 if report["ok"] else 1

if __name__ == "__main__":
    sys.exit(main())
