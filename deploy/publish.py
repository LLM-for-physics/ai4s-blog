#!/usr/bin/env python3
"""Prepare complete releases and atomically switch current; archives are immutable."""
import argparse
from contextlib import contextmanager
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import re
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


def validate_terms(terms):
    seen = set()
    for term in terms:
        if not re.fullmatch(r'\d{4}-(spring|fall)', term['id']) or term['id'] in seen:
            raise ValueError('Invalid or duplicate archive term')
        seen.add(term['id'])
        if not re.fullmatch(r'[a-f0-9]{40}', term['commit']):
            raise ValueError('Invalid archive baseline commit')
        revision = term.get('publicRevision')
        if 'publicRevision' in term and (not isinstance(revision, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]*', revision)):
            raise ValueError('Invalid public archive revision')


def archive_target(root, term):
    if term.get('publicRevision'):
        return root / 'public-archives' / term['publicRevision'] / term['id']
    return root / 'archives' / term['id']


def validate_archive(directory, term, revision=None):
    if directory.is_symlink():
        raise ValueError(f'Archive storage must be a real directory: {directory}')
    data = verify.verify_sealed(directory)
    if data['base'] != f"/archive/{term['id']}/":
        raise ValueError('Archive base does not match term')
    build = json.loads((directory / 'archive-build.json').read_text())
    if build['sourceCommit'] != term['commit']:
        raise ValueError('Archive baseline does not match terms.json')
    if build.get('publicRevision') != revision:
        raise ValueError('Archive public revision does not match terms.json')
    if revision is not None:
        verify.verify_archive_visibility(directory, term)
    return data


def publish(root, source, archives, terms, public_archives=None):
    root = root.resolve()
    public_archives = public_archives if public_archives is not None else ROOT / 'artifacts/archive-public'
    with locked(root):
        validate_terms(terms)
        metadata = verify.verify_sealed(source)
        if metadata['base'] != '/':
            raise ValueError('Current site artifact must have base /')
        if any((source / 'archive' / term['id']).exists() for term in terms):
            raise ValueError('Current artifact may not embed archive content')
        # Validate every prerequisite before publishing any new archive or release.
        prerequisites = []
        for term in terms:
            prerequisites.append((root / 'archives' / term['id'], archives / term['id'], term, None))
            if term.get('publicRevision'):
                revision = term['publicRevision']
                prerequisites.append((archive_target(root, term), public_archives / revision / term['id'], term, revision))
        checked = []
        for target, candidate, term, revision in prerequisites:
            installed = target.exists() or target.is_symlink()
            data = validate_archive(target if installed else candidate, term, revision)
            if installed and (candidate.exists() or candidate.is_symlink()):
                incoming = validate_archive(candidate, term, revision)
                if incoming != data:
                    raise ValueError(f'Refusing to overwrite immutable archive {target}')
            checked.append((target, candidate, term, revision, data))
        (root / 'archives').mkdir(exist_ok=True)
        (root / 'releases').mkdir(exist_ok=True)
        for target, candidate, term, revision, expected in checked:
            if not target.exists():
                target.parent.mkdir(parents=True, exist_ok=True)
                if revision is not None:
                    # nginx must traverse the new storage parents even with a private umask.
                    (root / 'public-archives').chmod(0o755)
                    target.parent.chmod(0o755)
                staging = Path(tempfile.mkdtemp(prefix='.archive-', dir=root))
                try:
                    shutil.copytree(candidate, staging, dirs_exist_ok=True)
                    if validate_archive(staging, term, revision) != expected:
                        raise ValueError(f'Archive changed during publication: {candidate}')
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
                (staging / 'archive' / term['id']).symlink_to(archive_target(root, term), target_is_directory=True)
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


def rollback(root, release, terms=None):
    root = root.resolve()
    if terms is None:
        terms = json.loads((ROOT / 'terms.json').read_text())['archives']
    with locked(root):
        validate_terms(terms)
        release = validate_release(root, release)
        for term in terms:
            link = release / 'archive' / term['id']
            target = archive_target(root, term)
            if not link.is_symlink() or link.resolve(strict=True) != target.resolve(strict=True):
                raise ValueError(f'Rollback archive does not match current public policy: {term["id"]}')
            validate_archive(target, term, term.get('publicRevision'))
        switch(root, release)
        print(f'Restored {release}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=Path('/var/www/ai4s-site'))
    parser.add_argument('--source', type=Path, default=ROOT / 'docs/.vitepress/dist')
    parser.add_argument('--archives', type=Path, default=ROOT / 'artifacts/archive')
    parser.add_argument('--public-archives', type=Path, default=ROOT / 'artifacts/archive-public')
    parser.add_argument('--rollback', type=Path)
    args = parser.parse_args()
    terms = json.loads((ROOT / 'terms.json').read_text())['archives']
    if args.rollback:
        rollback(args.root, args.rollback, terms)
    else:
        publish(args.root, args.source, args.archives, terms, args.public_archives)
