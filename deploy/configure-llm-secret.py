#!/usr/bin/env python3
"""Install or rotate the llm-proxy credential in its systemd environment file."""
import argparse
import getpass
import os
import re
import tempfile
from pathlib import Path


def install_secret(key, destination):
    # Restrict input to token characters; never interpolate shell or unit syntax.
    if not re.fullmatch(r'[A-Za-z0-9._~+/=-]+', key):
        raise ValueError('密钥为空或含不支持的字符')
    destination = Path(destination)
    destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(destination.parent, 0o700)
    lines = []
    if destination.exists():
        # Keep unrelated settings (LLM_BASE_URL, model, limits); replace only the key.
        lines = [line for line in destination.read_text().splitlines() if not line.startswith('LLM_API_KEY=')]
    lines.append(f'LLM_API_KEY={key}')
    fd, temporary = tempfile.mkstemp(dir=destination.parent, prefix='.llm-')
    try:
        with os.fdopen(fd, 'w') as output:
            output.write('\n'.join(lines) + '\n')
        os.replace(temporary, destination)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    os.chmod(destination, 0o600)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default='/etc/ai4s-llm-proxy/llm-proxy.env')
    args = parser.parse_args()
    key = os.environ.get('LLM_API_KEY') or getpass.getpass('LLM API key（输入不回显）: ')
    install_secret(key, args.output)
    print('密钥文件已更新（权限 0600）。请运行 sudo systemctl restart llm-proxy。')
