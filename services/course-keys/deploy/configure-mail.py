#!/usr/bin/python3
"""Root-only interactive SMTP setup; never prints or takes a secret on argv."""
import getpass
import importlib.util
import os
from pathlib import Path
import re
import smtplib
import ssl
import sys
import tempfile

CONFIG = Path('/etc/course-keys/web.env')
HOST = 'smtp.163.com'
SENDER = 'physicsandai2026@163.com'


def main():
    if os.geteuid() != 0 or len(sys.argv) != 1 or not sys.stdin.isatty():
        raise RuntimeError('Run interactively as root, without arguments')
    spec = importlib.util.spec_from_file_location('course_helper', '/usr/local/libexec/course-keys/helper.py')
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    helper.trusted_path(str(CONFIG))
    if CONFIG.stat().st_mode & 0o077:
        raise RuntimeError('Configuration must have mode 0600')
    print('SMTP sender: ' + SENDER)
    print('Enter the 163 SMTP authorization code, not the mailbox login password.')
    secret = getpass.getpass('SMTP authorization code (hidden): ')
    if not re.fullmatch(r'[A-Za-z0-9]{8,128}', secret):
        raise RuntimeError('Authorization code format is invalid; no configuration changed')
    with smtplib.SMTP_SSL(HOST, 465, context=ssl.create_default_context(), timeout=20) as smtp:
        smtp.login(SENDER, secret)
    updates = {'SMTP_HOST': HOST, 'SMTP_PORT': '465', 'SMTP_SECURE': 'true',
               'SMTP_USER': SENDER, 'SMTP_FROM': SENDER, 'SMTP_PASS': secret}
    original = CONFIG.read_text(encoding='utf-8')
    lines = original.splitlines()
    for key, value in updates.items():
        lines = [line for line in lines if not line.startswith(key + '=')]
        lines.append(key + '=' + value)
    fd, temporary = tempfile.mkstemp(prefix='.mail-', dir=str(CONFIG.parent))
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            os.fchmod(stream.fileno(), 0o600)
            stream.write('\n'.join(lines) + '\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, str(CONFIG))
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print('SMTP authentication succeeded; private configuration saved. No email was sent.')
    print('Restart course-keys-web.service to load the credential.')


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\nSetup cancelled; no secret displayed.', file=sys.stderr)
        sys.exit(1)
    except Exception as error:
        # SMTP servers may echo user-controlled content; show only exception type.
        print('SMTP setup failed (' + type(error).__name__ + '); credential was not displayed.', file=sys.stderr)
        sys.exit(1)
