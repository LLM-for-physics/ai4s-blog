#!/usr/bin/env python3
"""Validate real static output (including custom code viewer resources), then seal it."""
import argparse
import hashlib
import json
from html.parser import HTMLParser
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = 'site-manifest.json'


def file_hashes(root):
    result = {}
    for file in sorted(root.rglob('*')):
        if file.is_symlink():
            raise ValueError(f'Unexpected artifact symlink: {file}')
        if file.is_file() and file.relative_to(root).as_posix() != MANIFEST:
            digest = hashlib.sha256()
            with file.open('rb') as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                    digest.update(chunk)
            result[file.relative_to(root).as_posix()] = digest.hexdigest()
    return result


def assert_safe(root):
    for file in root.rglob('*'):
        if (file.name.lower() in ('score', 'feedback', '2025秋归档')
                or file.suffix.lower() in ('.xls', '.xlsx', '.jsonl')
                or re.match(r'feedback-.*\.json$', file.name)):
            raise ValueError(f'Private data in public output: {file}')


def verify_sealed(root):
    assert_safe(root)
    data = json.loads((root / MANIFEST).read_text())
    if data['files'] != file_hashes(root):
        raise ValueError(f'Artifact differs from its verified manifest: {root}')
    return data


def verify_archive_visibility(root, term):
    """Check public archive contents, including bundled pages and local search data."""
    revision = term.get('publicRevision')
    if not revision:
        return
    policies = json.loads((ROOT / 'scripts/archive/visibility.json').read_text())
    policy = policies.get(term['id'])
    if not policy or policy['publicRevision'] != revision:
        raise ValueError('Unknown archive visibility revision')
    tokens = policy['forbiddenTokens']
    path_tokens = tokens + policy.get('forbiddenPathTokens', [])
    encoded = {value.encode('utf-8') for value in tokens}
    encoded.update(json.dumps(value, ensure_ascii=True)[1:-1].encode('ascii') for value in tokens)
    for file in root.rglob('*'):
        relative = file.relative_to(root).as_posix()
        if any(token in relative for token in path_tokens):
            raise ValueError(f'Hidden archive resource in public output: {relative}')
        if not file.is_file():
            continue
        # The build does not produce precompressed assets. Reject unexpected copies.
        if file.suffix in ('.gz', '.br'):
            raise ValueError(f'Unverified compressed public archive resource: {relative}')
        if file.suffix in ('.html', '.js', '.json', '.map', '.md', '.txt', '.xml', '.css'):
            content = file.read_bytes()
            if any(token in content for token in encoded):
                raise ValueError(f'Hidden archive content in public output: {relative}')


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []
    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if value and ((key == 'href' and tag in ('a', 'link')) or (key == 'src' and tag in ('img', 'script', 'iframe', 'source'))):
                self.urls.append(value)


def verify(root, base, source=None):
    root = root.resolve()
    assert_safe(root)
    errors = set()
    def check(url, page):
        parsed = urlsplit(url)
        if parsed.scheme or parsed.netloc or not parsed.path:
            return
        urlpath = unquote(parsed.path)
        if urlpath.startswith('/'):
            if not urlpath.startswith(base):
                errors.add(f'{page.relative_to(root)}: escapes archive base: {url}')
                return
            target = root / urlpath[len(base):]
        else:
            target = page.parent / urlpath
        if target.resolve() != root and root not in target.resolve().parents:
            errors.add(f'{page.relative_to(root)}: outside output: {url}')
            return
        candidates = [target, target / 'index.html', Path(str(target) + '.html')]
        if not any(p.is_file() for p in candidates):
            errors.add(f'{page.relative_to(root)}: missing {url}')
    pages = list(root.rglob('*.html'))
    for page in pages:
        html = page.read_text()
        links = Links(); links.feed(html)
        for url in links.urls:
            check(url, page)
        if base != '/' and page.name != '404.html' and 'archive-banner' not in html:
            errors.add(f'{page.relative_to(root)}: missing archive banner')
    if source:
        for md in source.rglob('*.md'):
            if '.vitepress' in md.parts or 'public' in md.parts:
                continue
            for src in re.findall(r'<CodeFileViewer\b[^>]*\bsrc="([^"]+)"', md.read_text(), re.S):
                url = base.rstrip('/') + src if src.startswith('/') else src
                check(url, root / md.relative_to(source).with_suffix('.html'))
    for js in (root / 'assets').glob('*.js'):
        text = js.read_text()
        if base != '/' and any(marker in text for marker in ('/api/llm', '/api/feedback/submit', '/score/extra.yaml')):
            errors.add(f'{js.name}: dynamic archive feature present')
        if '/score/extra.yaml' in text or '/api/feedback/submit' in text:
            errors.add(f'{js.name}: disabled feature present')
    if errors:
        raise ValueError('\n'.join(sorted(errors)))
    if not (root / 'index.html').is_file() or not (root / '404.html').is_file():
        raise ValueError('Missing index or 404 page')
    if base != '/':
        term_id = base.strip('/').split('/')[-1]
        terms = json.loads((ROOT / 'terms.json').read_text())['archives']
        term = next((item for item in terms if item['id'] == term_id), None)
        if term:
            verify_archive_visibility(root, term)
    (root / MANIFEST).write_text(json.dumps({'base': base, 'files': file_hashes(root)}, ensure_ascii=False, indent=2) + '\n')
    print(f'Verified {len(pages)} pages and sealed artifact: {root}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--current-only', action='store_true')
    parser.add_argument('--archive', type=Path)
    parser.add_argument('--archive-source', type=Path)
    args = parser.parse_args()
    if args.archive:
        verify(args.archive, f'/archive/{args.archive.name}/', args.archive_source)
    else:
        verify(ROOT / 'docs/.vitepress/dist', '/', ROOT / 'docs')
        for term in ([] if args.current_only else json.loads((ROOT / 'terms.json').read_text())['archives']):
            if term.get('publicRevision'):
                artifact = ROOT / 'artifacts/archive-public' / term['publicRevision'] / term['id']
                source = ROOT / '.archive-build/public' / term['publicRevision'] / term['id'] / 'docs'
            else:
                artifact = ROOT / 'artifacts/archive' / term['id']
                source = ROOT / '.archive-build' / term['id'] / 'docs'
            verify(artifact, f"/archive/{term['id']}/", source)
