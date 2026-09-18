#!/usr/bin/python3
"""Root-only, explicit acceptance for stu0099000191 on servers 190/132/197.

Run on 190 after reviewing this root-owned script and provisioning/allowlisting
all three test accounts (this script never creates users or changes sshd):
  /usr/bin/python3 -I -S live_multi_server.py --student 0099000191

All writes use HTTP over /run/course-keys-importer/importer.sock. Read-only
helper status probes verify actual state independently of worker acknowledgments.
Each server receives a separate job because worker jobs prohibit duplicate
student IDs. Remote SSH uses the preverified /etc/course-keys/known_hosts;
loopback 190 is pinned to its trusted local Ed25519 public host key. Remote
traffic uses 190's existing route/NAT (expected egress 162.105.151.77).

Only Python 3.8 stdlib, ssh/ssh-keygen and the already deployed sudo/helper are
required. No email or Web database is used. Temporary private keys are 0600
inside a private /root directory and deleted even after test failure. Cleanup
failure exits nonzero and identifies the affected server for operator action.
Do not terminate with SIGKILL: it cannot run any program's finally cleanup.
"""
import argparse
import base64
import hashlib
import http.client
import json
import os
from pathlib import Path
import pwd
import re
import signal
import socket
import sqlite3
import stat
import subprocess
import sys
import tempfile
import time
import uuid

STUDENT = "0099000191"
USERNAME = "stu" + STUDENT
SERVERS = ("190", "132", "197")
HOSTS = {"190": "127.0.0.1", "132": "162.105.151.132", "197": "162.105.151.197"}
SOCKET = "/run/course-keys-importer/importer.sock"
DATABASE = "/var/lib/course-key-service/importer/jobs.sqlite3"
KNOWN_HOSTS = "/etc/course-keys/known_hosts"
HOST_KEY = "/etc/ssh/ssh_host_ed25519_key.pub"
IMPORTER_KEY = "/var/lib/course-key-service/importer/ssh/id_ed25519"
HELPER = "/usr/local/libexec/course-keys/helper.py"
PORT = 2024


class AcceptanceError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise AcceptanceError(message)


def target(server):
    require(server in SERVERS, "Unknown target server")
    return {"studentId": STUDENT, "serverId": server, "username": USERNAME}


def run(argv, input_text=None, timeout=30):
    process = subprocess.Popen(
        argv, stdin=subprocess.PIPE if input_text is not None else subprocess.DEVNULL,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True,
        start_new_session=True, cwd="/",
        env={"PATH": "/usr/bin:/bin", "LANG": "C", "LC_ALL": "C", "HOME": "/root"})
    try:
        stdout, stderr = process.communicate(input_text, timeout=timeout)
    except BaseException:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.communicate()
        raise AcceptanceError("Acceptance command interrupted or timed out")
    return subprocess.CompletedProcess(argv, process.returncode, stdout, stderr)


def trusted_root_file(filename):
    path = Path(filename)
    for component in list(reversed(path.parents)) + [path]:
        info = component.lstat()
        require(not stat.S_ISLNK(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022,
                "Untrusted root-owned path: " + filename)
    require(path.is_file(), "Required regular file unavailable: " + filename)
    return path


def ssh_args(host, username, key, hosts):
    return ["/usr/bin/ssh", "-F", "/dev/null", "-T", "-p", str(PORT), "-l", username,
            "-i", str(key), "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes",
            "-o", "IdentityAgent=none", "-o", "StrictHostKeyChecking=yes",
            "-o", "UserKnownHostsFile=" + str(hosts), "-o", "GlobalKnownHostsFile=/dev/null",
            "-o", "UpdateHostKeys=no", "-o", "PreferredAuthentications=publickey",
            "-o", "PasswordAuthentication=no", "-o", "KbdInteractiveAuthentication=no",
            "-o", "ProxyCommand=none", "-o", "ProxyJump=none",
            "-o", "ClearAllForwardings=yes", "-o", "ConnectTimeout=8",
            "-o", "ConnectionAttempts=1", "-o", "LogLevel=ERROR", host]


def remote_state(server):
    payload = dict(target(server), operation="status")
    if server == "190":
        command = ["/usr/bin/sudo", "-n", "-u", "course-keys-importer", "/usr/bin/sudo", "-n",
                   "/usr/bin/python3", "-I", "-S", HELPER]
    else:
        command = ["/usr/bin/sudo", "-n", "-u", "course-keys-importer"] + ssh_args(
            HOSTS[server], "course-keys-receiver", IMPORTER_KEY, KNOWN_HOSTS)
    result = run(command, json.dumps(payload) + "\n")
    try:
        response = json.loads(result.stdout)
    except ValueError:
        raise AcceptanceError(server + ": status probe returned no valid JSON")
    require(isinstance(response, dict) and response.get("ok") is True and result.returncode == 0,
            server + ": status probe failed")
    require(all(response.get(k) == v for k, v in target(server).items()), server + ": status target mismatch")
    generation = response.get("generation")
    require(type(generation) is int and 0 <= generation <= 9007199254740991,
            server + ": invalid state generation")
    require(response.get("action") in ("none", "install", "revoke"), server + ": invalid state action")
    if response["action"] != "install":
        require(response.get("fingerprint") is None and response.get("publicKey") is None,
                server + ": revoked state contains a key")
    return response


class UnixHTTP(http.client.HTTPConnection):
    def __init__(self):
        super().__init__("localhost", timeout=35)

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect(SOCKET)


def worker(method, path, body=None):
    connection = UnixHTTP()
    try:
        payload = None if body is None else json.dumps(body, separators=(",", ":")).encode("utf-8")
        headers = {} if payload is None else {"Content-Type": "application/json"}
        connection.request(method, path, payload, headers)
        response = connection.getresponse()
        raw = response.read(128 * 1024 + 1)
        require(len(raw) <= 128 * 1024, "Worker response exceeded the bound")
        value = json.loads(raw)
        require(200 <= response.status < 300, "Worker HTTP error " + str(response.status))
        require(isinstance(value, dict), "Worker response is not an object")
        return value
    except (OSError, ValueError, http.client.HTTPException):
        raise AcceptanceError("Worker transport or JSON response failed")
    finally:
        connection.close()


def make_key(directory, label):
    private = directory / label
    result = run(["/usr/bin/ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-C",
                  "course-multi-acceptance-" + label, "-f", str(private)])
    require(result.returncode == 0, "Temporary key generation failed")
    fields = private.with_suffix(".pub").read_text(encoding="ascii").split()
    require(len(fields) >= 2 and fields[0] == "ssh-ed25519", "Unexpected generated key")
    fingerprint = "SHA256:" + base64.b64encode(hashlib.sha256(
        base64.b64decode(fields[1], validate=True)).digest()).decode("ascii").rstrip("=")
    require(not private.stat().st_mode & 0o077, "Temporary private key has unsafe permissions")
    return {"private": str(private), "publicKey": " ".join(fields[:2]), "fingerprint": fingerprint}


def expect_ssh(server, key, hosts, allowed):
    result = run(ssh_args(HOSTS[server], USERNAME, key["private"], hosts) + ["/usr/bin/id -un"], timeout=20)
    if allowed:
        require(result.returncode == 0 and result.stdout.strip() == USERNAME,
                server + ": expected public-key login success")
    else:
        require(result.returncode == 255 and "Permission denied" in result.stderr,
                server + ": expected an authentication denial (not a transport failure)")


class Acceptance:
    def __init__(self, report):
        self.report = report
        self.pending = []
        self.keys = {}
        self.hosts = None
        self.touched = set()

    def record(self, server, name, **extra):
        event = dict(serverId=server, step=name, ok=True, **extra)
        self.report["steps"].append(event)
        print(json.dumps(event, separators=(",", ":")), flush=True)

    def wait_job(self, body):
        # Reusing exactly the same request ID safely recovers a lost POST reply.
        last_error = None
        for attempt in range(3):
            try:
                job = worker("POST", "/jobs", body)
                break
            except AcceptanceError as error:
                last_error = error
                if attempt == 2:
                    raise last_error
                time.sleep(0.5)
        require(isinstance(job.get("id"), str) and re.fullmatch(r"[0-9a-f-]{36}", job["id"]),
                "Worker returned invalid job ID")
        deadline = time.monotonic() + 120
        while job.get("status") in ("queued", "running"):
            require(time.monotonic() < deadline, "Worker job did not settle: " + job["id"])
            time.sleep(0.3)
            job = worker("GET", "/jobs/" + job["id"])
        require(job.get("status") in ("completed", "partial", "failed"), "Invalid terminal job status")
        items = job.get("items")
        require(isinstance(items, list) and len(items) == 1, "Unexpected job item count")
        expected, item = body["items"][0], items[0]
        require(all(item.get(k) == expected[k] for k in ("studentId", "serverId", "username", "action", "fingerprint")),
                "Job response target/action/fingerprint mismatch")
        return job

    def submit(self, server, action, key):
        item = dict(target(server), action=action, fingerprint=key["fingerprint"],
                    publicKey=key["publicKey"] if action == "install" else None)
        body = {"requestId": str(uuid.uuid4()), "items": [item]}
        self.pending.append(body)  # Track before the first potentially ambiguous network write.
        self.touched.add(server)
        job = self.wait_job(body)
        require(job["status"] == "completed" and job["items"][0]["status"] == "success",
                server + ": worker operation failed for job " + job["id"])
        return body, job

    def apply(self, server, action, key, name):
        before = remote_state(server)
        body, job = self.submit(server, action, key)
        state = remote_state(server)
        expected = key["fingerprint"] if action == "install" else None
        require(state["action"] == action and state["fingerprint"] == expected and
                state["generation"] > before["generation"] and state["generation"] == job["items"][0]["generation"],
                server + ": actual installed state does not match worker success")
        if action == "install":
            require(state.get("publicKey") == key["publicKey"], server + ": installed key content mismatch")
        replay = self.wait_job(body)
        after_replay = remote_state(server)
        require(replay == job and after_replay == state, server + ": replay changed a completed operation")
        self.record(server, name, generation=state["generation"], fingerprint=expected, replayUnchanged=True)

    def login(self, server, label, allowed, step):
        expect_ssh(server, self.keys[label], self.hosts, allowed)
        self.record(server, step, fingerprint=self.keys[label]["fingerprint"], accepted=allowed)

    def cleanup(self):
        # Never let another ordinary termination signal interrupt a cleanup already in progress.
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        owned = {self.keys[label]["fingerprint"] for label in ("A", "B")}
        for server in SERVERS:
            if server not in self.touched:
                continue
            result = {"serverId": server, "ok": False}
            try:
                # Resolve all uncertain submissions before deciding which key needs revocation.
                for body in list(self.pending):
                    if body["items"][0]["serverId"] == server:
                        self.wait_job(body)
                state = remote_state(server)
                if state["action"] == "install":
                    require(state.get("fingerprint") in owned,
                            server + ": cleanup refused an unknown key; operator action required")
                    selected = next(key for key in self.keys.values() if key["fingerprint"] == state["fingerprint"])
                    self.apply(server, "revoke", selected, "final_revoke")
                    state = remote_state(server)
                require(state["action"] == "revoke" and state.get("publicKey") is None and state.get("fingerprint") is None,
                        server + ": final revoked state could not be verified")
                result.update(generation=state["generation"], action="revoke")
                for label in ("A", "B", "wrong"):
                    self.login(server, label, False, label + "_after_final_revoke")
                result["ok"] = True
            except Exception as error:
                result["error"] = str(error)
            self.report["cleanup"].append(result)
        require(all(item["ok"] for item in self.report["cleanup"]),
                "Final cleanup failed; inspect cleanup results and reconcile affected test accounts")

    def run(self):
        require(hasattr(os, "geteuid") and os.geteuid() == 0, "Run this script as root on server 190")
        account = pwd.getpwnam(USERNAME)
        require(account.pw_name == USERNAME and account.pw_uid != 0, "Dedicated local test account is unavailable")
        require(stat.S_ISSOCK(os.stat(SOCKET).st_mode), "The deployed importer socket is unavailable")
        trusted_root_file(KNOWN_HOSTS)
        local_host = trusted_root_file(HOST_KEY).read_text(encoding="ascii").split()
        require(len(local_host) >= 2 and local_host[0] == "ssh-ed25519", "Local Ed25519 host key missing")
        base64.b64decode(local_host[1], validate=True)
        # Read-only: refuse to race a job left by another acceptance process or operator.
        with sqlite3.connect("file:" + DATABASE + "?mode=ro", uri=True) as database:
            active = database.execute(
                "SELECT count(*) FROM tasks WHERE username=? AND server_id IN ('132','190','197') AND status IN ('queued','running')",
                (USERNAME,)).fetchone()[0]
        require(active == 0, "Dedicated account already has pending importer jobs")
        require(worker("GET", "/health").get("ok") is True, "Worker health check failed")
        checked = worker("POST", "/check", {"targets": [target(server) for server in SERVERS]}).get("accounts")
        require(isinstance(checked, list) and len(checked) == 3, "Invalid account-check response")
        for server in SERVERS:
            match = [item for item in checked if all(item.get(k) == v for k, v in target(server).items())]
            require(len(match) == 1 and match[0].get("status") == "ready", server + ": test account not ready/approved")
            initial = remote_state(server)
            require(initial["action"] in ("none", "revoke"), server + ": refusing an existing installed key")
            self.record(server, "approved_empty_or_revoked_account", generation=initial["generation"])
        os.umask(0o077)
        with tempfile.TemporaryDirectory(prefix="course-multi-acceptance-", dir="/root") as temporary:
            self.report["_temporaryDirectory"] = temporary
            directory = Path(temporary)
            self.hosts = directory / "known_hosts"
            self.hosts.write_text(trusted_root_file(KNOWN_HOSTS).read_text(encoding="ascii") +
                                  "\n[127.0.0.1]:2024 " + " ".join(local_host[:2]) + "\n", encoding="ascii")
            self.keys = {label: make_key(directory, label) for label in ("A", "B", "wrong")}
            try:
                # Verify no key appeared between initial validation and the first write.
                for server in SERVERS:
                    require(remote_state(server)["action"] in ("none", "revoke"), server + ": state changed before writes")
                for server in SERVERS:
                    self.apply(server, "install", self.keys["A"], "install_A")
                    self.login(server, "A", True, "A_after_install_A")
                    self.login(server, "wrong", False, "wrong_key_rejected")
                for server in SERVERS:
                    self.apply(server, "install", self.keys["B"], "replace_with_B")
                    self.login(server, "A", False, "A_after_replace_B")
                    self.login(server, "B", True, "B_after_replace_B")
                    self.apply(server, "revoke", self.keys["B"], "revoke_B")
                    self.login(server, "B", False, "B_after_revoke_B")
                    self.apply(server, "install", self.keys["A"], "restore_A")
                    self.login(server, "A", True, "A_after_restore_A")
            finally:
                self.cleanup()


def interrupted(signum, frame):
    raise AcceptanceError("Acceptance interrupted; attempting cleanup")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--student", required=True, choices=(STUDENT,), help="Explicit dedicated test student; no other account is accepted")
    parser.parse_args()
    report = {"ok": False, "studentId": STUDENT, "username": USERNAME, "servers": list(SERVERS),
              "socket": SOCKET, "steps": [], "cleanup": [], "temporaryPrivateKeysDeleted": True}
    signal.signal(signal.SIGINT, interrupted)
    signal.signal(signal.SIGTERM, interrupted)
    try:
        Acceptance(report).run()
        report["ok"] = True
    except Exception as error:
        report["error"] = str(error)
    finally:
        temporary = report.pop("_temporaryDirectory", None)
        report["temporaryPrivateKeysDeleted"] = temporary is None or not os.path.lexists(temporary)
        if not report["temporaryPrivateKeysDeleted"]:
            report["ok"] = False
            report["error"] = "Temporary private keys could not be removed; root cleanup required"
    print(json.dumps(report, ensure_ascii=False, separators=(",", ":")), flush=True)
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
