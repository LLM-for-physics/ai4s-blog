#!/usr/bin/python3
"""Verify the latest completed backup by restoring disposable, offline copies.
Never changes live databases, starts applications, or restores SSH keys.
Run as root from the reviewed release with system Python -I -S.
"""
import importlib.util
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import subprocess
import sys
import tempfile

BACKUPS = Path('/var/backups/course-key-service')
SPEC = importlib.util.spec_from_file_location('course_helper', '/usr/local/libexec/course-keys/helper.py')
helper = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(helper)
CHILD = r'''
import json, sqlite3, sys
p, role = sys.argv[1:]
c = sqlite3.connect(p)
c.execute('PRAGMA trusted_schema=OFF')
assert c.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
assert not c.execute('PRAGMA foreign_key_check').fetchall()
version = c.execute('PRAGMA user_version').fetchone()[0]
assert version in ((1, 2, 3) if role == 'web' else (1, 2))
if role == 'web':
    summary = {'students': c.execute('SELECT count(*) FROM students').fetchone()[0],
               'sessions': c.execute('SELECT count(*) FROM sessions').fetchone()[0],
               'unresolvedItems': c.execute("SELECT count(*) FROM batch_items WHERE status IN ('queued','running')").fetchone()[0]}
else:
    summary = {'jobs': c.execute('SELECT count(*) FROM jobs').fetchone()[0],
               'unresolvedTasks': c.execute("SELECT count(*) FROM tasks WHERE status IN ('queued','running')").fetchone()[0]}
if role == 'web' and version == 3:
    assert c.execute("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='auto_import_settings'").fetchone()[0] == 1
summary['schemaVersion'] = version
c.execute('CREATE TABLE restore_write_probe(value INTEGER NOT NULL)')
c.execute('INSERT INTO restore_write_probe VALUES(1)')
c.commit()
c.close()
c = sqlite3.connect(p)
assert c.execute('SELECT value FROM restore_write_probe').fetchone()[0] == 1
c.close()
print(json.dumps({'role':role,'integrity':'ok','foreignKeys':'ok','writableAndReopened':True, 'counts':summary}))
'''

def main():
    if os.geteuid() != 0 or len(sys.argv) != 1:
        raise RuntimeError('Run fixed verification program as root without arguments')
    os.umask(0o077)
    helper.trusted_path(str(BACKUPS), 'directory')
    snapshots = sorted(p for p in BACKUPS.iterdir() if re.fullmatch(r'[0-9]{8}T[0-9]{12}Z', p.name))
    if not snapshots:
        raise RuntimeError('No completed snapshot available')
    snapshot = snapshots[-1]
    helper.trusted_path(str(snapshot), 'directory')
    manifest = json.loads(helper.secure_read(str(snapshot / 'manifest.json'), 1048576))
    config = helper.load_config()
    if manifest.get("serverId", config["serverId"]) != config["serverId"]:
        raise RuntimeError("Backup belongs to another server")
    results = []
    with tempfile.TemporaryDirectory(prefix='.course-restore-check-', dir='/var/lib/course-key-service') as temporary:
        stage = Path(temporary)
        for role, user in [('web','course-keys-web'),('importer','course-keys-importer')]:
            account = pwd.getpwnam(user)
            if account.pw_uid == 0:
                raise RuntimeError('Service owner cannot be root')
            folder = stage / role
            folder.mkdir(mode=0o700)
            target = folder / 'restored.sqlite3'
            # Prepare all bytes while this subdirectory is still owned exclusively by root.
            data = helper.secure_read(str(snapshot / (role + '.sqlite3')), 256 * 1024 * 1024)
            fd = os.open(str(target), os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with os.fdopen(fd, 'wb') as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
                os.fchown(stream.fileno(), account.pw_uid, account.pw_gid)
            os.chown(str(folder), account.pw_uid, account.pw_gid)
            stage.chmod(0o711)
            def drop():
                os.setgroups([])
                os.setgid(account.pw_gid)
                os.setuid(account.pw_uid)
            check = subprocess.run(['/usr/bin/python3','-I','-S','-c',CHILD,str(target),role],
                                   preexec_fn=drop, cwd='/', stdin=subprocess.DEVNULL,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30,
                                   universal_newlines=True, env={'PATH':'/usr/bin:/bin','LANG':'C','HOME':'/nonexistent'})
            if check.returncode != 0:
                raise RuntimeError('Isolated restored database check failed for ' + role)
            results.append(json.loads(check.stdout))
        import hashlib
        keys = []
        for name, expected in manifest['keySha256'].items():
            helper.archive_filename(name)
            saved = helper.secure_read(str(snapshot / 'keys' / name), helper.MAX_REQUEST)
            helper.parse_stored_state(config, name, saved)
            if hashlib.sha256(saved).hexdigest() != expected:
                raise RuntimeError('Snapshot key checksum mismatch')
            live = helper.secure_read(str(Path(config['keysDirectory']) / name), helper.MAX_REQUEST)
            keys.append({'username':name,'studentId':name[3:] if name.startswith('stu') else name,
                         'legacy':not name.startswith('stu'),'snapshotHashValid':True,'matchesLive':saved == live})
        report = {'ok':True,'snapshot':snapshot.name,'databases':results,'centralKeys':keys,
                  'scope':'Offline disposable restoration only; live databases, keys and services were not changed.'}
    report['temporaryCopiesDeleted'] = not os.path.lexists(temporary)
    print(json.dumps(report))

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'ok':False,'errorType':type(error).__name__}))
        sys.exit(1)
