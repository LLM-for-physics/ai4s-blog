import importlib.util
import json
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
        publish.rollback(self.root, first)
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
            publish.rollback(self.root, self.source)


if __name__ == '__main__':
    unittest.main()
