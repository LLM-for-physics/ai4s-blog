#!/usr/bin/env python3
"""Prepare complete releases and atomically switch current; archives are immutable."""
import argparse
from contextlib import contextmanager
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import shutil
import tempfile
import uuid
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('verify_site', ROOT / 'scripts/verify-site.py')
verify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify)


@contextmanager
def locked(root):
    root.mkdir(parents=True, exist_ok=True)
    with (root / '.publish.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield


def switch(root, release):
    candidate = root / ('.current-' + uuid.uuid4().hex)
    candidate.symlink_to(release)
    os.replace(candidate, root / 'current')


def validate_release(root, release):
    release = release.resolve(strict=True)
    if release.parent != (root / 'releases').resolve() or not (release / 'index.html').is_file():
        raise ValueError('Rollback must name an existing release in this deployment root')
    return release


def publish(root, source, archives, terms):
    root = root.resolve()
    with locked(root):
        metadata = verify.verify_sealed(source)
        if metadata['base'] != '/':
            raise ValueError('Current site artifact must have base /')
        if any((source / 'archive' / term['id']).exists() for term in terms):
            raise ValueError('Current artifact may not embed archive content')
        (root / 'archives').mkdir(exist_ok=True)
        (root / 'releases').mkdir(exist_ok=True)
        # Validate every prerequisite before publishing any new archive or release.
        for term in terms:
            target = root / 'archives' / term['id']
            candidate = archives / term['id']
            check = target if target.exists() else candidate
            data = verify.verify_sealed(check)
            if data['base'] != f"/archive/{term['id']}/":
                raise ValueError('Archive base does not match term')
            build = json.loads((check / 'archive-build.json').read_text())
            if build['sourceCommit'] != term['commit']:
                raise ValueError('Archive baseline does not match terms.json')
            if target.exists() and candidate.exists():
                incoming = verify.verify_sealed(candidate)
                if incoming != data:
                    raise ValueError(f'Refusing to overwrite immutable archive {term["id"]}')
        for term in terms:
            target = root / 'archives' / term['id']
            if not target.exists():
                staging = Path(tempfile.mkdtemp(prefix='.archive-', dir=root))
                try:
                    shutil.copytree(archives / term['id'], staging, dirs_exist_ok=True)
                    verify.verify_sealed(staging)
                    for entry in staging.rglob('*'):
                        entry.chmod(0o755 if entry.is_dir() else 0o644)
                    staging.chmod(0o755)
                    os.rename(staging, target)
                finally:
                    if staging.exists():
                        shutil.rmtree(staging)
        name = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ-') + uuid.uuid4().hex[:8]
        staging = Path(tempfile.mkdtemp(prefix='.release-', dir=root))
        release = root / 'releases' / name
        try:
            shutil.copytree(source, staging, dirs_exist_ok=True)
            verify.verify_sealed(staging)
            (staging / 'archive').mkdir(exist_ok=True)
            for term in terms:
                (staging / 'archive' / term['id']).symlink_to(root / 'archives' / term['id'], target_is_directory=True)
            # Static assets must be readable by nginx regardless of the invoking user's umask.
            for entry in staging.rglob('*'):
                if not entry.is_symlink():
                    entry.chmod(0o755 if entry.is_dir() else 0o644)
            staging.chmod(0o755)
            os.rename(staging, release)
            previous = (root / 'current').resolve() if (root / 'current').exists() else None
            switch(root, release)
            print(json.dumps({'current': str(release), 'previous': str(previous) if previous else None}))
            return release
        finally:
            if staging.exists():
                shutil.rmtree(staging)


def rollback(root, release):
    root = root.resolve()
    with locked(root):
        release = validate_release(root, release)
        switch(root, release)
        print(f'Restored {release}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=Path('/var/www/ai4s-site'))
    parser.add_argument('--source', type=Path, default=ROOT / 'docs/.vitepress/dist')
    parser.add_argument('--archives', type=Path, default=ROOT / 'artifacts/archive')
    parser.add_argument('--rollback', type=Path)
    args = parser.parse_args()
    if args.rollback:
        rollback(args.root, args.rollback)
    else:
        publish(args.root, args.source, args.archives, json.loads((ROOT / 'terms.json').read_text())['archives'])
