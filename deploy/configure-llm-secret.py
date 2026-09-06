#!/usr/bin/env python3
"""Install a server-only nginx credential from a prompt or secret-manager environment."""
import argparse
import getpass
import os
from pathlib import Path
import re
import tempfile


def install_secret(key, destination):
    # Restrict input to token characters; never interpolate nginx syntax.
    if not re.fullmatch(r'[A-Za-z0-9._~+/=-]+', key):
        raise ValueError('密钥为空或含不支持的字符')
    destination = Path(destination)
    destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(dir=destination.parent, prefix='.llm-')
    try:
        with os.fdopen(fd, 'w') as output:
            output.write(f'proxy_set_header Authorization "Bearer {key}";\n')
        os.replace(temporary, destination)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default='/etc/nginx/secrets/ai4s-llm.conf')
    args = parser.parse_args()
    key = os.environ.get('LLM_API_KEY') or getpass.getpass('LLM API key（输入不回显）: ')
    install_secret(key, args.output)
    print('密钥文件已更新（权限 0600）。请运行 sudo nginx -t && sudo systemctl reload nginx。')
