#!/usr/bin/env python3
"""One-time migration of the inspected aiphy nginx site, with automatic config rollback."""
import argparse
from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('publisher', ROOT / 'deploy/publish.py')
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


def remove_location(text, declaration):
    pattern = re.compile(r'^\s*' + re.escape(declaration) + r'\s*\{', re.M)
    matches = list(pattern.finditer(text))
    if len(matches) != 1:
        raise ValueError('Expected exactly one existing block: ' + declaration)
    match = matches[0]
    depth, quote, comment, escape = 1, None, False, False
    end = match.end()
    for i in range(end, len(text)):
        char = text[i]
        if comment:
            if char == '\n': comment = False
            continue
        if escape:
            escape = False
            continue
        if char == '\\':
            escape = True
            continue
        if quote:
            if char == quote: quote = None
            continue
        if char in ('"', "'"):
            quote = char
        elif char == '#': comment = True
        elif char == '{': depth += 1
        elif char == '}':
            depth -= 1
            if depth == 0:
                return text[:match.start()] + '\n' + text[i + 1:]
    raise ValueError('Unclosed nginx block')


def prepare_config(original, snippet):
    if original.count('root /var/www/ai4s-blog;') != 1:
        raise ValueError('Production root differs from inspected configuration; stop for review')
    result = original.replace('root /var/www/ai4s-blog;', 'root /var/www/ai4s-site/current;')
    for location in ('location /score/', 'location /', r'location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$'):
        result = remove_location(result, location)
    result = result.replace('    index index.html;', '    index index.html;\n    include ' + str(snippet) + ';', 1)
    return result


def atomic_write(path, content, mode):
    fd, temporary = tempfile.mkstemp(prefix='.ai4s-', dir=str(path.parent))
    try:
        with os.fdopen(fd, 'w') as file:
            file.write(content)
            file.flush()
            os.fsync(file.fileno())
        os.chmod(temporary, mode)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)


def check_live():
    tests = [('/', 200, '2026 年秋'),
             ('/archive/2025-fall/', 200, '2025 年秋'),
             ('/archive/2025-fall/course/slides', 200, 'archive-banner'),
             ('/archive/2025-fall/course/llm-agent/code-examples/basic_api_calls.py', 200, None),
             ('/score/extra.yaml', 404, None),
             ('/archive/2025-fall/score/extra.yaml', 404, None),
             ('/students_server_assignment.xlsx', 404, None),
             ('/api/feedback/submit', 404, None),
             ('/archive/2025-fall/does-not-exist', 404, None),
             ('/does-not-exist', 404, None)]
    for scheme, port in [('http', 80), ('https', 443)]:
        for url, expected, needle in tests:
            command = ['curl', '--silent', '--show-error', '--noproxy', '*', '--max-time', '20',
                       '--resolve', f'aiphy.pku.edu.cn:{port}:127.0.0.1',
                       '--write-out', '\n%{http_code}', f'{scheme}://aiphy.pku.edu.cn{url}']
            result = subprocess.run(command, capture_output=True, text=True, check=True)
            body, status = result.stdout.rsplit('\n', 1)
            if int(status) != expected or (needle and needle not in body):
                raise RuntimeError(f'Health check failed: {scheme} {url} (HTTP {status})')
            print(f'OK {scheme} {url}: {status}', flush=True)


def main():
    if os.geteuid() != 0:
        raise SystemExit('Run with sudo python3 deploy/migrate-production.py; never send passwords to the assistant.')
    nginx = Path('/etc/nginx/sites-available/aiphy.conf')
    snippet = Path('/etc/nginx/snippets/ai4s-static.conf')
    original = nginx.read_text()
    mode = nginx.stat().st_mode & 0o777
    target = prepare_config(original, snippet)
    subprocess.run(['nginx', '-t'], check=True)
    publisher.verify.verify_sealed(ROOT / 'docs/.vitepress/dist')
    publisher.verify.verify_sealed(ROOT / 'artifacts/archive/2025-fall')
    backup = Path('/var/backups/ai4s-site') / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup.mkdir(parents=True, mode=0o700)
    backup.parent.chmod(0o700)
    shutil.copy2(nginx, backup / 'aiphy.conf')
    shutil.copy2('/etc/nginx/conf.d/aiphy-https.conf', backup / 'aiphy-https.conf')
    old_snippet = snippet.read_text() if snippet.exists() else None
    if snippet.exists(): shutil.copy2(snippet, backup / 'ai4s-static.conf')
    print('Configuration backup: ' + str(backup), flush=True)
    deployment = Path('/var/www/ai4s-site')
    previous = (deployment / 'current').resolve() if (deployment / 'current').exists() else None
    release = publisher.publish(deployment, ROOT / 'docs/.vitepress/dist', ROOT / 'artifacts/archive',
                                json.loads((ROOT / 'terms.json').read_text())['archives'])
    changed = False
    try:
        snippet.parent.mkdir(parents=True, exist_ok=True)
        atomic_write(snippet, (ROOT / 'deploy/static-locations.conf').read_text(), 0o644)
        changed = True
        atomic_write(nginx, target, mode)
        subprocess.run(['nginx', '-t'], check=True)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
        time.sleep(1)
        check_live()
    except Exception:
        if changed:
            atomic_write(nginx, original, mode)
            if old_snippet is None:
                snippet.unlink()
            else:
                atomic_write(snippet, old_snippet, (backup / 'ai4s-static.conf').stat().st_mode & 0o777)
            subprocess.run(['nginx', '-t'], check=True)
            subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
        if previous: publisher.rollback(deployment, previous)
        print('Migration failed; original nginx configuration restored. Old site directory was not modified.', flush=True)
        raise
    report = {'release': str(release), 'backup': str(backup), 'previousRelease': str(previous) if previous else None,
              'oldSite': '/var/www/ai4s-blog', 'httpAndHttpsChecks': 'passed'}
    (backup / 'deployment.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2), flush=True)


if __name__ == '__main__':
    main()
