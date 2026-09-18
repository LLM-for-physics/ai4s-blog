#!/usr/bin/python3
"""Install Python-only remote receiver assets. Does not change/reload sshd or create students."""
import argparse
import importlib.util
import ipaddress
import json
import os
from pathlib import Path
import pwd
import grp
import stat
import subprocess
import sys
import tempfile

RECEIVER = "course-keys-receiver"
HOME = Path("/var/lib/course-key-receiver")
COMMAND = "/usr/bin/sudo -n /usr/bin/python3 -I -S /usr/local/libexec/course-keys/helper.py"

def trusted(path):
    path = Path(path).absolute()
    for part in list(reversed(path.parents)) + [path]:
        info = part.lstat()
        if stat.S_ISLNK(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            raise RuntimeError("Untrusted receiver installation path")
    return path

def module(name, path):
    spec = importlib.util.spec_from_file_location(name, str(trusted(path)))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value

def write_root(path, data, mode):
    path = Path(path)
    trusted(path.parent)
    if path.exists() or path.is_symlink():
        trusted(path)
        if not path.is_file() or path.stat().st_nlink != 1:
            raise RuntimeError("Existing receiver asset is not a single-link regular file")
    fd, temporary = tempfile.mkstemp(prefix=".receiver-", dir=str(path.parent))
    try:
        with os.fdopen(fd, "wb") as stream:
            os.fchmod(stream.fileno(), mode)
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, str(path))
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server-id", required=True, choices=("132", "197"))
    parser.add_argument("--source-ip", required=True, help="Verified 190 egress IP; never an unbounded CIDR")
    parser.add_argument("--public-key", required=True, help="Root-owned importer public-key file; never the private key")
    args = parser.parse_args()
    if os.geteuid() != 0:
        parser.error("Run as root from a reviewed root-owned release")
    os.umask(0o077)
    source_ip = str(ipaddress.ip_address(args.source_ip))
    folder = trusted(Path(__file__).absolute().parent)
    assets = module("receiver_assets", folder / "install-assets.py")
    helper = module("receiver_helper", folder.parent / "installer/helper.py")
    public = helper.parse_key(helper.secure_read(str(trusted(args.public_key)), helper.MAX_KEY).decode("ascii"))
    if public["algorithm"] != "ssh-ed25519":
        parser.error("Receiver transport identity must be Ed25519")
    existing_config = assets.CONFIG / "installer.json"
    if existing_config.exists():
        existing = json.loads(helper.secure_read(str(existing_config), 1048576))
        if existing.get("schemaVersion") != 2 or existing.get("serverId") != args.server_id:
            raise RuntimeError("Existing installer needs explicit migration or server identity correction")
    assets.get_group("course_students")
    try:
        account = pwd.getpwnam(RECEIVER)
    except KeyError:
        subprocess.run(["/usr/sbin/useradd", "--system", "--user-group", "--no-create-home",
                        "--home-dir", str(HOME), "--shell", "/bin/sh", RECEIVER], check=True)
        account = pwd.getpwnam(RECEIVER)
    if account.pw_uid == 0 or account.pw_gid == 0 or account.pw_dir != str(HOME) or account.pw_shell != "/bin/sh":
        raise RuntimeError("Unexpected pre-existing receiver account")
    groups = set(os.getgrouplist(RECEIVER, account.pw_gid))
    forbidden = {0}
    for name in ("course_students", "sudo", "admin", "wheel", "docker", "lxd"):
        try:
            forbidden.add(grp.getgrnam(name).gr_gid)
        except KeyError:
            pass
    if groups & forbidden:
        raise RuntimeError("Receiver must not belong to student or privileged groups")
    for path, mode in ((assets.CONFIG, 0o755), (assets.HELPERS.parent, 0o755), (assets.HELPERS, 0o755),
                       (Path("/var/lib/course-key-service"), 0o755),
                       (Path("/var/lib/course-key-service/installer"), 0o700),
                       (Path("/etc/ssh/course_authorized_keys"), 0o755), (HOME, 0o755), (HOME / ".ssh", 0o755)):
        assets.directory(path, mode)
    for relative, name in (("../installer/helper.py", "helper.py"), ("../installer/allowlist.py", "allowlist.py"),
                           ("configure-ssh.py", "configure-ssh.py")):
        assets.atomic_install((folder / relative).absolute(), assets.HELPERS / name)
    if not existing_config.exists():
        value = json.loads(helper.secure_read(str(folder / "installer.json.example"), 1048576))
        value["serverId"] = args.server_id
        helper.validate_config(value)
        write_root(existing_config, (json.dumps(value, indent=2) + "\n").encode("ascii"), 0o600)
    else:
        helper.validate_config(json.loads(helper.secure_read(str(existing_config), 1048576)))
    helper.verify_openssh(json.loads(helper.secure_read(str(existing_config), 1048576)), public)
    sudoers = (RECEIVER + " ALL=(root) NOPASSWD: NOSETENV: /usr/bin/python3 -I -S /usr/local/libexec/course-keys/helper.py\n").encode("ascii")
    candidate = assets.CONFIG / "receiver.sudoers"
    write_root(candidate, sudoers, 0o440)
    subprocess.run(["/usr/sbin/visudo", "-cf", str(candidate)], check=True)
    target = Path("/etc/sudoers.d/course-keys-receiver")
    previous = helper.secure_read(str(target), 16384) if target.exists() else None
    write_root(target, sudoers, 0o440)
    try:
        subprocess.run(["/usr/sbin/visudo", "-c"], check=True)
    except subprocess.CalledProcessError:
        if previous is None:
            target.unlink()
        else:
            write_root(target, previous, 0o440)
        raise
    authorized = 'restrict,from="' + source_ip + '",command="' + COMMAND + '" ' + public["publicKey"] + "\n"
    write_root(HOME / ".ssh/authorized_keys", authorized.encode("ascii"), 0o644)
    match = ("# BEGIN course-keys receiver\nMatch User " + RECEIVER + "\n"
             "    AuthorizedKeysFile " + str(HOME / ".ssh/authorized_keys") + "\n"
             "    AuthenticationMethods publickey\n    PasswordAuthentication no\n"
             "    KbdInteractiveAuthentication no\n    ForceCommand " + COMMAND + "\n"
             "    AllowAgentForwarding no\n    AllowTcpForwarding no\n    X11Forwarding no\n"
             "    PermitTTY no\n    PermitTunnel no\nMatch all\n# END course-keys receiver\n")
    write_root(assets.CONFIG / "receiver-sshd.conf", match.encode("ascii"), 0o644)
    print(json.dumps({"ok": True, "serverId": args.server_id, "receiver": RECEIVER,
                      "sshdChanged": False, "studentsCreated": False,
                      "next": "Review receiver-sshd.conf; install its Match at the end of sshd_config, validate effective config and reload with an admin session retained. Approve student accounts separately."}))

if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}))
        sys.exit(1)
