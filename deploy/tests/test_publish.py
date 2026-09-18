import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('publish', Path(__file__).resolve().parents[1] / 'publish.py')
publish = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publish)


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.work = Path(self.temp.name)
        self.root = self.work / 'server'
        self.source = self.work / 'main'
        self.archives = self.work / 'artifacts'
        self.public_archives = self.work / 'public-artifacts'
        self.term = {'id': '2025-fall', 'commit': 'a' * 40}
        self.source.mkdir()
        (self.source / 'index.html').write_text('2026')
        (self.source / 'old.html').write_text('old')
        self.archive = self.archives / self.term['id']
        self.archive.mkdir(parents=True)
        (self.archive / 'index.html').write_text('2025')
        (self.archive / 'archive-build.json').write_text(json.dumps({'sourceCommit': self.term['commit']}))
        self.seal(self.source, '/')
        self.seal(self.archive, '/archive/2025-fall/')

    def seal(self, directory, base):
        (directory / publish.verify.MANIFEST).write_text(json.dumps({'base': base, 'files': publish.verify.file_hashes(directory)}))

    def run_publish(self):
        return publish.publish(self.root, self.source, self.archives, [self.term])

    def test_repeat_publish_preserves_archive_and_removes_stale_current_files(self):
        first = self.run_publish()
        archive = self.root / 'archives/2025-fall'
        hashes = publish.verify.file_hashes(archive)
        inode = (archive / 'index.html').stat().st_ino
        (self.source / 'old.html').unlink()
        (self.source / 'index.html').write_text('2026 updated')
        self.seal(self.source, '/')
        second = self.run_publish()
        self.assertNotEqual(first, second)
        self.assertFalse((self.root / 'current/old.html').exists())
        self.assertEqual(hashes, publish.verify.file_hashes(archive))
        self.assertEqual(inode, (archive / 'index.html').stat().st_ino)
        self.assertEqual((self.root / 'current/archive/2025-fall/index.html').read_text(), '2025')
        publish.rollback(self.root, first, [self.term])
        self.assertEqual((self.root / 'current/index.html').read_text(), '2026')
        self.assertTrue((self.root / 'current/old.html').exists())

    def test_tampered_artifact_leaves_current_unchanged(self):
        first = self.run_publish()
        (self.source / 'index.html').write_text('tampered')
        with self.assertRaises(ValueError):
            self.run_publish()
        self.assertEqual((self.root / 'current').resolve(), first)

    def test_replacement_archive_is_rejected(self):
        first = self.run_publish()
        (self.archive / 'index.html').write_text('changed historical content')
        self.seal(self.archive, '/archive/2025-fall/')
        with self.assertRaises(ValueError):
            self.run_publish()
        self.assertEqual((self.root / 'current').resolve(), first)

    def test_missing_archive_does_not_publish(self):
        with self.assertRaises(FileNotFoundError):
            publish.publish(self.root, self.source, self.work / 'missing', [self.term])
        self.assertFalse((self.root / 'current').exists())

    def test_daily_publication_uses_existing_archive_without_local_copy(self):
        self.run_publish()
        publish.publish(self.root, self.source, self.work / 'missing', [self.term])
        self.assertTrue((self.root / 'current/archive/2025-fall/index.html').is_file())

    def test_private_data_is_rejected_even_with_valid_hashes(self):
        (self.source / 'score').mkdir()
        (self.source / 'score/extra.yaml').write_text('private')
        self.seal(self.source, '/')
        with self.assertRaises(ValueError):
            self.run_publish()

    def test_lock_prevents_concurrent_publish(self):
        with publish.locked(self.root):
            with self.assertRaises(BlockingIOError):
                self.run_publish()

    def test_rollback_rejects_directory_outside_releases(self):
        self.run_publish()
        with self.assertRaises(ValueError):
            publish.rollback(self.root, self.source, [self.term])

    def prepare_public_archive(self):
        policy = json.loads((publish.ROOT / 'scripts/archive/visibility.json').read_text())
        self.public_term = {**self.term, 'publicRevision': policy[self.term['id']]['publicRevision']}
        self.public_archive = self.public_archives / self.public_term['publicRevision'] / self.term['id']
        self.public_archive.mkdir(parents=True)
        (self.public_archive / 'index.html').write_text('2025 public')
        (self.public_archive / 'archive-build.json').write_text(json.dumps({
            'sourceCommit': self.term['commit'],
            'publicRevision': self.public_term['publicRevision'],
        }))
        self.seal(self.public_archive, '/archive/2025-fall/')

    def run_public_publish(self):
        return publish.publish(self.root, self.source, self.archives, [self.public_term], self.public_archives)

    def public_target(self):
        return self.root / 'public-archives' / self.public_term['publicRevision'] / self.term['id']

    def test_filtered_publication_preserves_original_archive(self):
        self.run_publish()
        original = self.root / 'archives/2025-fall'
        original_hashes = publish.verify.file_hashes(original)
        original_inode = (original / 'index.html').stat().st_ino
        self.prepare_public_archive()
        release = self.run_public_publish()
        self.assertEqual(publish.verify.file_hashes(original), original_hashes)
        self.assertEqual((original / 'index.html').stat().st_ino, original_inode)
        self.assertEqual((release / 'archive/2025-fall').resolve(), self.public_target())
        self.assertEqual((release / 'archive/2025-fall/index.html').read_text(), '2025 public')

    def test_daily_publication_reuses_installed_public_archive(self):
        self.prepare_public_archive()
        self.run_public_publish()
        target = self.public_target()
        original_hashes = publish.verify.file_hashes(target)
        original_inode = (target / 'index.html').stat().st_ino
        release = publish.publish(self.root, self.source, self.work / 'missing-baseline',
                                  [self.public_term], self.work / 'missing-public')
        self.assertEqual((release / 'archive/2025-fall').resolve(), target)
        self.assertEqual(publish.verify.file_hashes(target), original_hashes)
        self.assertEqual((target / 'index.html').stat().st_ino, original_inode)

    def test_public_archive_parents_are_traversable_with_private_umask(self):
        self.run_publish()
        self.prepare_public_archive()
        previous_umask = os.umask(0o077)
        try:
            self.run_public_publish()
        finally:
            os.umask(previous_umask)
        for directory in (self.root / 'public-archives', self.public_target().parent, self.public_target()):
            self.assertEqual(directory.stat().st_mode & 0o777, 0o755)

    def test_missing_public_archive_never_falls_back_to_original(self):
        first = self.run_publish()
        self.prepare_public_archive()
        with self.assertRaises(FileNotFoundError):
            publish.publish(self.root, self.source, self.archives,
                            [self.public_term], self.work / 'missing-public')
        self.assertEqual((self.root / 'current').resolve(), first)
        self.assertFalse((self.root / 'public-archives').exists())

    def test_all_archives_are_validated_before_installation(self):
        self.prepare_public_archive()
        with self.assertRaises(FileNotFoundError):
            publish.publish(self.root, self.source, self.archives,
                            [self.public_term], self.work / 'missing-public')
        self.assertFalse((self.root / 'archives').exists())
        self.assertFalse((self.root / 'public-archives').exists())
        self.assertFalse((self.root / 'releases').exists())

    def test_invalid_public_metadata_leaves_current_unchanged(self):
        first = self.run_publish()
        self.prepare_public_archive()
        valid = {'sourceCommit': self.term['commit'], 'publicRevision': self.public_term['publicRevision']}
        for key, value in [('sourceCommit', 'b' * 40), ('publicRevision', 'wrong-revision'),
                           ('publicRevision', None)]:
            with self.subTest(key=key, value=value):
                (self.public_archive / 'archive-build.json').write_text(json.dumps({**valid, key: value}))
                self.seal(self.public_archive, '/archive/2025-fall/')
                with self.assertRaises(ValueError):
                    self.run_public_publish()
                self.assertEqual((self.root / 'current').resolve(), first)
        self.assertFalse((self.root / 'public-archives').exists())

    def test_tampered_public_candidate_leaves_current_unchanged(self):
        first = self.run_publish()
        self.prepare_public_archive()
        (self.public_archive / 'index.html').write_text('tampered')
        with self.assertRaises(ValueError):
            self.run_public_publish()
        self.assertEqual((self.root / 'current').resolve(), first)

    def test_public_archive_cannot_be_replaced_with_resealed_content(self):
        self.prepare_public_archive()
        first = self.run_public_publish()
        (self.public_archive / 'index.html').write_text('changed public content')
        self.seal(self.public_archive, '/archive/2025-fall/')
        with self.assertRaises(ValueError):
            self.run_public_publish()
        self.assertEqual((self.root / 'current').resolve(), first)
        self.assertEqual((self.public_target() / 'index.html').read_text(), '2025 public')

    def test_hidden_solution_is_rejected_even_with_valid_seal(self):
        first = self.run_publish()
        self.prepare_public_archive()
        (self.public_archive / 'assignments').mkdir()
        (self.public_archive / 'assignments/assignment-4-solution.html').write_text('solution')
        self.seal(self.public_archive, '/archive/2025-fall/')
        with self.assertRaises(ValueError):
            self.run_public_publish()
        self.assertEqual((self.root / 'current').resolve(), first)

    def test_rollback_rejects_original_archive_after_visibility_change(self):
        original_release = self.run_publish()
        self.prepare_public_archive()
        safe_release = self.run_public_publish()
        with self.assertRaises(ValueError):
            publish.rollback(self.root, original_release, [self.public_term])
        self.assertEqual((self.root / 'current').resolve(), safe_release)

    def test_rollback_accepts_release_with_current_public_archive(self):
        self.prepare_public_archive()
        first = self.run_public_publish()
        (self.source / 'index.html').write_text('2026 updated')
        self.seal(self.source, '/')
        self.run_public_publish()
        publish.rollback(self.root, first, [self.public_term])
        self.assertEqual((self.root / 'current').resolve(), first)
        self.assertEqual((self.root / 'current/archive/2025-fall').resolve(), self.public_target())

    def test_rollback_rejects_tampered_installed_public_archive(self):
        self.prepare_public_archive()
        first = self.run_public_publish()
        second = self.run_public_publish()
        (self.public_target() / 'index.html').write_text('tampered')
        with self.assertRaises(ValueError):
            publish.rollback(self.root, first, [self.public_term])
        self.assertEqual((self.root / 'current').resolve(), second)


if __name__ == '__main__':
    unittest.main()
