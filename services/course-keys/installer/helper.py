#!/usr/bin/python3
"""Fixed stdin JSON installer. Production: system Python 3.8+ with -I -S."""
import base64
import binascii
import datetime
import hashlib
import json
import os
import re
import stat
import struct
import subprocess
import sys
import tempfile

CONFIG_PATH = "/etc/course-keys/installer.json"
MAX_REQUEST = 16384
MAX_KEY = 4096
MAX_GENERATION = 9007199254740991
STUDENT_RE = re.compile(r"[0-9]{6,16}\Z")
USERNAME_RE = re.compile(r"stu[0-9]{6,16}\Z")
SERVER_IDS = ("132", "190", "197")
HEADER = "# course-keys "

class InstallerError(Exception):
    def __init__(self, code, message, account_status=None):
        super().__init__(message)
        self.code, self.message, self.account_status = code, message, account_status

def fail(code, message, account_status=None):
    raise InstallerError(code, message, account_status)

def exact_int(value, minimum=0, maximum=MAX_GENERATION):
    return type(value) is int and minimum <= value <= maximum

def student_name(value):
    if not isinstance(value, str) or not STUDENT_RE.fullmatch(value):
        fail("INVALID_REQUEST", "studentId must be a digit string of 6 to 16 characters")
    return value

def student_username(student_id):
    return "stu" + student_name(student_id)

def username_student(username):
    if not isinstance(username, str) or not USERNAME_RE.fullmatch(username):
        fail("INVALID_REQUEST", "username must be stu followed by a valid studentId")
    return username[3:]

def archive_filename(name):
    if not isinstance(name, str) or not (STUDENT_RE.fullmatch(name) or USERNAME_RE.fullmatch(name)):
        fail("INVALID_REQUEST", "Invalid central key filename")
    return name

def trusted_path(path, kind="file"):
    """Reject symlinks, hardlinked files, non-root owners and writable ancestors."""
    if not isinstance(path, str) or not path.startswith("/") or os.path.normpath(path) != path:
        fail("CONFIG_ERROR", "An absolute normalized installation path is required")
    pieces, current = path.split("/"), "/"
    root = os.lstat("/")
    if root.st_uid != 0 or root.st_mode & 0o022:
        fail("UNSAFE_PATH", "The filesystem root is not trusted")
    for index, piece in enumerate(pieces):
        if not piece:
            continue
        current = os.path.join(current, piece)
        try:
            info = os.lstat(current)
        except OSError:
            fail("UNSAFE_PATH", "Required installation path is unavailable")
        if stat.S_ISLNK(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            fail("UNSAFE_PATH", "Installation paths must be root-owned and not writable by other users")
        if index < len(pieces) - 1 or kind == "directory":
            if not stat.S_ISDIR(info.st_mode):
                fail("UNSAFE_PATH", "An installation component is not a directory")
        elif not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
            fail("UNSAFE_PATH", "Installation files must be regular files with one link")

def secure_read(path, limit):
    trusted_path(path)
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_CLOEXEC", 0))
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022 or info.st_nlink != 1:
            fail("UNSAFE_PATH", "Unsafe opened installation file")
        with os.fdopen(fd, "rb", closefd=False) as stream:
            data = stream.read(limit + 1)
        if len(data) > limit:
            fail("CONFIG_ERROR", "Installation file exceeds its size limit")
        return data
    finally:
        os.close(fd)

def validate_config(config):
    fields = {"schemaVersion", "serverId", "keysDirectory", "stateDirectory", "sshKeygen",
              "requiredGroup", "deniedGroups", "allowedAccounts", "minimumRsaBits"}
    if not isinstance(config, dict) or set(config) != fields or config.get("schemaVersion") != 2:
        fail("CONFIG_ERROR", "Unexpected installer configuration fields")
    if config["serverId"] not in SERVER_IDS:
        fail("CONFIG_ERROR", "serverId must be 132, 190 or 197")
    if not exact_int(config["minimumRsaBits"], 3072, 16384):
        fail("CONFIG_ERROR", "minimumRsaBits must be between 3072 and 16384")
    for field in ("keysDirectory", "stateDirectory"):
        trusted_path(config[field], "directory")
    trusted_path(config["sshKeygen"])
    if not os.access(config["sshKeygen"], os.X_OK):
        fail("CONFIG_ERROR", "The configured ssh-keygen is not executable")
    if not isinstance(config["requiredGroup"], str) or not config["requiredGroup"]:
        fail("CONFIG_ERROR", "A required course group must be configured")
    if not isinstance(config["deniedGroups"], list) or not all(isinstance(g, str) and g for g in config["deniedGroups"]):
        fail("CONFIG_ERROR", "deniedGroups must be a list")
    if not {"sudo", "admin", "wheel", "docker", "lxd"}.issubset(set(config["deniedGroups"])):
        fail("CONFIG_ERROR", "Built-in privileged groups cannot be removed")
    if not isinstance(config["allowedAccounts"], dict):
        fail("CONFIG_ERROR", "allowedAccounts must be an object")
    uids = set()
    for name, entry in config["allowedAccounts"].items():
        student_name(name)
        if not isinstance(entry, dict) or set(entry) != {"expectedUid"} or not exact_int(entry["expectedUid"], 1, 4294967294):
            fail("CONFIG_ERROR", "Each approved account requires a non-root expectedUid")
        if entry["expectedUid"] in uids:
            fail("CONFIG_ERROR", "Approved accounts may not share a UID")
        uids.add(entry["expectedUid"])
    return config

def load_config():
    try:
        config = json.loads(secure_read(CONFIG_PATH, 1048576).decode("utf-8"))
    except (ValueError, UnicodeError):
        fail("CONFIG_ERROR", "Invalid installer configuration")
    return validate_config(config)

def check_account(config, student_id):
    import grp
    import pwd
    name = student_username(student_id)
    # Numeric getent arguments select UID. getpwnam explicitly selects a name.
    try:
        account = pwd.getpwnam(name)
    except KeyError:
        fail("ACCOUNT_MISSING", "The server account has not been created", "missing")
    if account.pw_name != name or account.pw_uid == 0 or account.pw_gid == 0:
        fail("ACCOUNT_UNAUTHORIZED", "The account is not an eligible student account", "unauthorized")
    approval = config["allowedAccounts"].get(student_id)
    if approval is None or approval["expectedUid"] != account.pw_uid:
        fail("ACCOUNT_UNAUTHORIZED", "The account or its UID has not been approved by operations", "unauthorized")
    gids = set(os.getgrouplist(name, account.pw_gid))
    if 0 in gids:
        fail("ACCOUNT_UNAUTHORIZED", "Members of the root group cannot receive course keys", "unauthorized")
    try:
        course_gid = grp.getgrnam(config["requiredGroup"]).gr_gid
    except KeyError:
        fail("CONFIG_ERROR", "The configured course group does not exist")
    if course_gid not in gids:
        fail("ACCOUNT_UNAUTHORIZED", "The account is not in the approved course group", "unauthorized")
    for group in config["deniedGroups"]:
        try:
            gid = grp.getgrnam(group).gr_gid
        except KeyError:
            continue
        if gid in gids:
            fail("ACCOUNT_UNAUTHORIZED", "Privileged accounts cannot receive course keys", "unauthorized")
    return account

def parse_key(text, minimum_rsa_bits=3072):
    if not isinstance(text, str):
        fail("INVALID_KEY", "A public-key string is required")
    try:
        size = len(text.encode("utf-8"))
    except UnicodeError:
        fail("INVALID_KEY", "Invalid public-key text encoding")
    if size > MAX_KEY:
        fail("INVALID_KEY", "The public key exceeds the allowed size")
    line = text.strip("\r\n").strip(" \t")
    if "\n" in line or "\r" in line or "\x00" in line:
        fail("INVALID_KEY", "Exactly one public-key line is required")
    fields = line.split()
    if len(fields) < 2 or fields[0] not in ("ssh-ed25519", "ssh-rsa"):
        fail("INVALID_KEY", "Use an Ed25519 or RSA public key without authorized_keys options")
    try:
        blob = base64.b64decode(fields[1].encode("ascii"), validate=True)
    except (ValueError, UnicodeError, binascii.Error):
        fail("INVALID_KEY", "Invalid public-key encoding")
    cursor = [0]
    def string():
        start = cursor[0]
        if start + 4 > len(blob):
            fail("INVALID_KEY", "Truncated public key")
        length = struct.unpack(">I", blob[start:start + 4])[0]
        end = start + 4 + length
        if end > len(blob):
            fail("INVALID_KEY", "Truncated public key")
        cursor[0] = end
        return blob[start + 4:end]
    if string() != fields[0].encode("ascii"):
        fail("INVALID_KEY", "The encoded key type does not match its label")
    if fields[0] == "ssh-ed25519":
        if len(string()) != 32:
            fail("INVALID_KEY", "Invalid Ed25519 public-key length")
        bits = 256
    else:
        integers = []
        for _ in range(2):
            raw = string()
            if not raw or raw[0] & 128 or (len(raw) > 1 and raw[0] == 0 and not raw[1] & 128):
                fail("INVALID_KEY", "Invalid RSA integer encoding")
            integers.append(int.from_bytes(raw, "big"))
        exponent, modulus = integers
        bits = modulus.bit_length()
        if exponent < 3 or exponent % 2 == 0 or modulus % 2 == 0 or exponent >= modulus or bits < minimum_rsa_bits or bits > 16384:
            fail("INVALID_KEY", "RSA keys must meet the configured minimum of at least 3072 bits")
    if cursor[0] != len(blob):
        fail("INVALID_KEY", "Trailing data in public key")
    public_key = fields[0] + " " + base64.b64encode(blob).decode("ascii")
    fingerprint = "SHA256:" + base64.b64encode(hashlib.sha256(blob).digest()).decode("ascii").rstrip("=")
    return {"publicKey": public_key, "fingerprint": fingerprint, "bits": bits, "algorithm": fields[0]}

def verify_openssh(config, key):
    fd, path = tempfile.mkstemp(prefix=".key-verify-", dir=config["stateDirectory"])
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write((key["publicKey"] + "\n").encode("ascii"))
        result = subprocess.run([config["sshKeygen"], "-l", "-E", "sha256", "-f", path],
                                stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                timeout=5, check=False, universal_newlines=True,
                                env={"PATH": "/usr/bin:/bin", "LANG": "C", "LC_ALL": "C"})
        tokens = result.stdout.split()
        if result.returncode != 0 or len(tokens) < 2 or tokens[0] != str(key["bits"]) or tokens[1] != key["fingerprint"]:
            fail("INVALID_KEY", "OpenSSH did not accept the public key")
    except subprocess.TimeoutExpired:
        fail("VALIDATION_TIMEOUT", "OpenSSH key validation timed out")
    finally:
        os.unlink(path)

def parse_stored_state(config, name, data):
    """Validate both retained v1 numeric archives and v2 stu account files."""
    archive_filename(name)
    try:
        lines = data.decode("ascii").splitlines()
        if not lines or not lines[0].startswith(HEADER):
            fail("STATE_CONFLICT", "The central file is not managed by this installer")
        metadata = json.loads(lines[0][len(HEADER):])
        legacy = bool(STUDENT_RE.fullmatch(name))
        expected_sid = name if legacy else username_student(name)
        if (metadata.get("schemaVersion") != (1 if legacy else 2)
                or metadata.get("studentId") != expected_sid
                or not exact_int(metadata.get("generation"), 1)
                or metadata.get("action") not in ("install", "revoke")):
            fail("STATE_CONFLICT", "Invalid central key metadata")
        if not legacy and (metadata.get("serverId") != config["serverId"] or metadata.get("username") != name):
            fail("STATE_CONFLICT", "Central key metadata has a different destination")
        key = None
        if metadata["action"] == "install":
            if len(lines) != 2:
                fail("STATE_CONFLICT", "Unexpected central public-key content")
            key = parse_key(lines[1], config["minimumRsaBits"])
            if lines[1] != key["publicKey"] or metadata.get("fingerprint") != key["fingerprint"]:
                fail("STATE_CONFLICT", "Central key fingerprint does not match its metadata")
        elif len(lines) != 1 or metadata.get("fingerprint") is not None:
            fail("STATE_CONFLICT", "Unexpected revoked-key content")
        return {"generation": metadata["generation"], "action": metadata["action"],
                "fingerprint": key["fingerprint"] if key else None, "publicKey": key["publicKey"] if key else None}
    except (ValueError, UnicodeError, AttributeError):
        fail("STATE_CONFLICT", "Cannot parse central key state")

def read_state(config, name):
    username_student(name)  # Runtime operations never address legacy numeric files.
    path = os.path.join(config["keysDirectory"], name)
    if not os.path.lexists(path):
        return {"generation": 0, "action": "none", "fingerprint": None, "publicKey": None}
    return parse_stored_state(config, name, secure_read(path, MAX_REQUEST))

def write_state(config, name, generation, action, key, previous):
    metadata = {"schemaVersion": 2, "serverId": config["serverId"], "studentId": username_student(name),
                "username": name, "generation": generation, "action": action,
                "fingerprint": key["fingerprint"] if key else None, "previousFingerprint": previous["fingerprint"],
                "updatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat()}
    content = HEADER + json.dumps(metadata, sort_keys=True, separators=(",", ":")) + "\n"
    if key:
        content += key["publicKey"] + "\n"
    fd, temporary = tempfile.mkstemp(prefix=".course-key-", dir=config["keysDirectory"])
    try:
        with os.fdopen(fd, "wb") as stream:
            os.fchmod(stream.fileno(), 0o644)
            stream.write(content.encode("ascii"))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, os.path.join(config["keysDirectory"], name))
        directory = os.open(config["keysDirectory"], os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)

def lock_account(config, name):
    import fcntl
    path = os.path.join(config["stateDirectory"], name + ".lock")
    fd = os.open(path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o077 or info.st_nlink != 1:
            fail("UNSAFE_PATH", "Unsafe account lock")
        fcntl.flock(fd, fcntl.LOCK_EX)
        return fd
    except Exception:
        os.close(fd)
        raise

def empty_response(request=None):
    request = request if isinstance(request, dict) else {}
    sid, server, username = request.get("studentId"), request.get("serverId"), request.get("username")
    return {"ok": False,
            "serverId": server if isinstance(server, str) and server in SERVER_IDS else None,
            "studentId": sid if isinstance(sid, str) and STUDENT_RE.fullmatch(sid) else None,
            "username": username if isinstance(username, str) and USERNAME_RE.fullmatch(username) else None,
            "accountStatus": "error", "generation": None, "action": None,
            "fingerprint": None, "publicKey": None, "changed": False, "error": None}

def process_request(request, config):
    response = empty_response(request)
    fd = None
    try:
        if not isinstance(request, dict):
            fail("INVALID_REQUEST", "A JSON object is required")
        operation = request.get("operation")
        fields = {"operation", "serverId", "studentId", "username"}
        if operation == "apply":
            fields |= {"action", "generation", "publicKey", "fingerprint", "expectedFingerprint"}
        if operation not in ("check", "status", "apply") or set(request) - fields:
            fail("INVALID_REQUEST", "Unexpected request operation or fields")
        sid = student_name(request.get("studentId"))
        name = student_username(sid)
        if not isinstance(request.get("serverId"), str) or request["serverId"] not in SERVER_IDS:
            fail("INVALID_REQUEST", "A supported serverId is required")
        if not isinstance(request.get("username"), str) or not USERNAME_RE.fullmatch(request["username"]):
            fail("INVALID_REQUEST", "An explicit stu username is required")
        if request["serverId"] != config["serverId"] or request["username"] != name:
            fail("TARGET_MISMATCH", "The request destination does not match this server and student")
        check_account(config, sid)
        response["accountStatus"] = "ready"
        if operation == "check":
            response["ok"] = True
            return response
        fd = lock_account(config, name)
        check_account(config, sid)
        current = read_state(config, name)
        response.update(current)
        if operation == "status":
            response["ok"] = True
            return response
        action, generation = request.get("action"), request.get("generation")
        if action not in ("install", "revoke") or not exact_int(generation, 1):
            fail("INVALID_REQUEST", "A valid action and positive integer generation are required")
        key = None
        if action == "install":
            if "expectedFingerprint" in request:
                fail("INVALID_REQUEST", "expectedFingerprint is only used for revocation")
            key = parse_key(request.get("publicKey"), config["minimumRsaBits"])
            if request.get("fingerprint") is not None and request["fingerprint"] != key["fingerprint"]:
                fail("INVALID_KEY", "The supplied fingerprint does not match the public key")
            verify_openssh(config, key)
        elif request.get("publicKey") is not None or request.get("fingerprint") is not None:
            fail("INVALID_REQUEST", "Revocation must not contain a public key or fingerprint")
        if generation < current["generation"]:
            fail("STALE_GENERATION", "A newer generation is already installed")
        if generation == current["generation"]:
            if action != current["action"] or (key["fingerprint"] if key else None) != current["fingerprint"]:
                fail("GENERATION_CONFLICT", "This generation already identifies different content")
            response["ok"] = True
            return response
        if action == "revoke":
            expected = request.get("expectedFingerprint")
            if expected is not None and not isinstance(expected, str):
                fail("INVALID_REQUEST", "expectedFingerprint must be a string or null")
            if current["action"] == "install" and expected != current["fingerprint"]:
                fail("EXPECTED_KEY_MISMATCH", "The installed key changed after revocation was confirmed")
        write_state(config, name, generation, action, key, current)
        response.update(read_state(config, name))
        response.update(ok=True, changed=True)
    except InstallerError as error:
        if error.account_status:
            response["accountStatus"] = error.account_status
        response["error"] = {"code": error.code, "message": error.message}
    except (OSError, ValueError):
        response["error"] = {"code": "IO_ERROR", "message": "Installer operation could not be completed; query status before retrying"}
    finally:
        if fd is not None:
            os.close(fd)
    return response

def main():
    response = empty_response()
    try:
        if len(sys.argv) != 1 or not hasattr(os, "geteuid") or os.geteuid() != 0:
            fail("PERMISSION_DENIED", "The fixed installer must run as root without command-line arguments")
        import signal
        def timed_out(signum, frame):
            fail("TIMEOUT", "Installer request timed out; query status before retrying")
        signal.signal(signal.SIGALRM, timed_out)
        signal.alarm(20)
        raw = sys.stdin.buffer.read(MAX_REQUEST + 1)
        if len(raw) > MAX_REQUEST:
            fail("INVALID_REQUEST", "Request exceeds the size limit")
        try:
            request = json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeError, RecursionError):
            fail("INVALID_REQUEST", "Invalid JSON request")
        response = empty_response(request)
        response = process_request(request, load_config())
    except InstallerError as error:
        response["error"] = {"code": error.code, "message": error.message}
        if error.account_status:
            response["accountStatus"] = error.account_status
    except OSError:
        response["error"] = {"code": "IO_ERROR", "message": "Installer configuration is unavailable"}
    print(json.dumps(response, separators=(",", ":")))
    return 0 if response["ok"] else 1

if __name__ == "__main__":
    sys.exit(main())
