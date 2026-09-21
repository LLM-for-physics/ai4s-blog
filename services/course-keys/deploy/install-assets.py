#!/usr/bin/python3
"""Prepare root-owned assets and isolated service accounts. Does NOT start services,
open enrollment, approve students, modify nginx, or modify/reload sshd.
Run with system Python -I -S from a root-owned reviewed release directory.
"""
import argparse
import grp
import hashlib
import json
import os
from pathlib import Path
import pwd
import secrets
import shutil
import stat
import subprocess
import sys
import tempfile

ROOT = Path("/usr/local/lib/course-key-service")
HELPERS = Path("/usr/local/libexec/course-keys")
CONFIG = Path("/etc/course-keys")
DEPLOY = Path(__file__).resolve().parent
INSTALLER = DEPLOY.parent / "installer"

def trusted(path, directory=False):
    path = Path(path)
    if not path.is_absolute():
        raise RuntimeError("Absolute paths required")
    for item in list(reversed(path.parents)) + [path]:
        info = item.lstat()
        if stat.S_ISLNK(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            raise RuntimeError("Untrusted owner, permissions or symlink: " + str(item))
    if directory and not path.is_dir():
        raise RuntimeError("Expected directory: " + str(path))
    return path

def directory(path, mode=0o755, uid=0, gid=0):
    path = Path(path)
    trusted(path.parent, True)
    if path.exists() or path.is_symlink():
        info = path.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid not in (0, uid):
            raise RuntimeError("Unexpected existing directory: " + str(path))
    else:
        path.mkdir(mode=mode)
    os.chown(str(path), uid, gid)
    path.chmod(mode)

def atomic_install(source, target, mode=0o644, preserve=False):
    source, target = trusted(source), Path(target)
    trusted(target.parent, True)
    if target.exists() or target.is_symlink():
        trusted(target)
        if preserve:
            return
    fd, temporary = tempfile.mkstemp(prefix=".course-install-", dir=str(target.parent))
    try:
        with os.fdopen(fd, "wb") as stream:
            os.fchmod(stream.fileno(), mode)
            stream.write(source.read_bytes())
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, str(target))
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)

def get_group(name):
    try:
        return grp.getgrnam(name)
    except KeyError:
        subprocess.run(["/usr/sbin/groupadd", "--system", name], check=True)
        return grp.getgrnam(name)

def get_user(name):
    try:
        account = pwd.getpwnam(name)
    except KeyError:
        subprocess.run(["/usr/sbin/useradd", "--system", "--user-group", "--no-create-home",
                        "--home-dir", "/nonexistent", "--shell", "/usr/sbin/nologin", name], check=True)
        account = pwd.getpwnam(name)
    if account.pw_uid == 0 or account.pw_dir != "/nonexistent" or not account.pw_shell.endswith("/nologin"):
        raise RuntimeError("Unexpected pre-existing service account: " + name)
    return account

def verify_release(release):
    trusted(release, True)
    if release.parent != ROOT / "releases":
        raise RuntimeError("Release must be an immediate child of /usr/local/lib/course-key-service/releases")
    for parent, directories, files in os.walk(str(release), followlinks=False):
        for name in directories + files:
            item = Path(parent) / name
            if item.is_symlink():
                if os.path.isabs(os.readlink(str(item))):
                    raise RuntimeError("Absolute release symlinks are not allowed")
                resolved = item.resolve()
                if release not in resolved.parents:
                    raise RuntimeError("A release symlink escapes the release")
                trusted(resolved, resolved.is_dir())
                if item.lstat().st_uid != 0:
                    raise RuntimeError("Release symlink is not root-owned")
            else:
                trusted(item, item.is_dir())
    for name in ("src/server.js", "src/worker.js", "node_modules/better-sqlite3/package.json"):
        if not (release / name).is_file():
            raise RuntimeError("Incomplete built service release: " + name)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--release", required=True, help="Reviewed root-owned service release with production dependencies installed")
    args = parser.parse_args()
    if os.geteuid() != 0:
        parser.error("Run as root")
    os.umask(0o077)
    trusted(DEPLOY, True)
    trusted(INSTALLER, True)
    release = Path(args.release)
    verify_release(release)
    # Do not replace the old helper before its approvals/keys have been retired.
    existing_config = CONFIG / "installer.json"
    if existing_config.exists():
        trusted(existing_config)
        existing = json.loads(existing_config.read_text(encoding="utf-8"))
        if existing.get("schemaVersion") != 2 or existing.get("serverId") != "190":
            raise RuntimeError("Stop services and run the reviewed migrate-installer-config.py --server-id 190 before upgrading assets")
    node = trusted(ROOT / "runtime/bin/node")
    version = subprocess.check_output([str(node), "--version"], universal_newlines=True).strip()
    if not version.startswith("v24."):
        parser.error("A reviewed root-owned Node 24 runtime must be installed first")
    shared = get_group("course-keys-api")
    get_group("course_students")
    web, importer = get_user("course-keys-web"), get_user("course-keys-importer")
    subprocess.run(["/usr/sbin/usermod", "-a", "-G", "course-keys-api", "course-keys-web"], check=True)
    directory(CONFIG, 0o755)
    directory(HELPERS.parent, 0o755)
    directory(HELPERS, 0o755)
    directory("/var/lib/course-key-service", 0o755)
    directory("/var/lib/course-key-service/web", 0o700, web.pw_uid, web.pw_gid)
    directory("/var/lib/course-key-service/importer", 0o700, importer.pw_uid, importer.pw_gid)
    directory("/var/lib/course-key-service/installer", 0o700)
    directory("/etc/ssh/course_authorized_keys", 0o755)
    directory("/var/backups/course-key-service", 0o700)
    for source, name in [(INSTALLER / "helper.py", "helper.py"), (INSTALLER / "allowlist.py", "allowlist.py"),
                         (DEPLOY / "configure-ssh.py", "configure-ssh.py"), (DEPLOY / "backup.py", "backup.py"),
                         (DEPLOY / "snapshot-db.py", "snapshot-db.py"), (DEPLOY / "configure-mail.py", "configure-mail.py")]:
        atomic_install(source, HELPERS / name)
    atomic_install(DEPLOY / "installer.json.example", CONFIG / "installer.json", 0o600, preserve=True)
    atomic_install(DEPLOY / "importer.env.example", CONFIG / "importer.env", 0o600, preserve=True)
    web_env = CONFIG / "web.env"
    if not web_env.exists():
        data = (DEPLOY / "course-keys.env.example").read_text(encoding="utf-8").replace(
            "REPLACE_WITH_AT_LEAST_32_RANDOM_BYTES", secrets.token_urlsafe(48))
        fd = os.open(str(web_env), os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write(data)
    else:
        trusted(web_env)
    for unit in ("course-keys-web.service", "course-keys-importer.service", "course-keys-backup.service", "course-keys-backup.timer"):
        atomic_install(DEPLOY / unit, Path("/etc/systemd/system") / unit)
    candidate = DEPLOY / "sudoers-course-keys"
    subprocess.run(["/usr/sbin/visudo", "-cf", str(candidate)], check=True)
    sudoers = Path("/etc/sudoers.d/course-keys")
    prior = sudoers.read_bytes() if sudoers.exists() else None
    atomic_install(candidate, sudoers, 0o440)
    try:
        subprocess.run(["/usr/sbin/visudo", "-c"], check=True)
    except subprocess.CalledProcessError:
        if prior is None:
            sudoers.unlink()
        else:
            sudoers.write_bytes(prior)
            sudoers.chmod(0o440)
        raise
    current = ROOT / "current"
    if current.exists() and not current.is_symlink():
        raise RuntimeError("Refusing to replace a non-symlink current release")
    if current.is_symlink():
        if current.lstat().st_uid != 0 or (ROOT / "releases") not in current.resolve().parents:
            raise RuntimeError("Untrusted existing current symlink")
    temporary = ROOT / (".current-" + secrets.token_hex(8))
    temporary.symlink_to(release)
    os.replace(str(temporary), str(current))
    subprocess.run(["/bin/systemctl", "daemon-reload"], check=True)
    print("Assets installed. Enrollment remains closed. No service was started and nginx/SSH were not changed.")
    print("Configure runtime SMTP, approve course accounts, validate SSH/nginx, then start and test the services.")
    return 0

if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        print("Asset installation stopped: " + str(error), file=sys.stderr)
        sys.exit(1)
