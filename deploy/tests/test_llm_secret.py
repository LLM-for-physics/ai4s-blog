import importlib.util
from pathlib import Path
import stat
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('llm_secret', Path(__file__).parents[1] / 'configure-llm-secret.py')
secret = importlib.util.module_from_spec(spec)
spec.loader.exec_module(secret)


class SecretTests(unittest.TestCase):
    def test_private_atomic_rotation_and_invalid_input(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'secrets' / 'llm-proxy.env'
            secret.install_secret('first-token', path)
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            self.assertEqual(stat.S_IMODE(path.parent.stat().st_mode), 0o700)
            secret.install_secret('second-token', path)
            self.assertNotIn('first-token', path.read_text())
            for invalid in ['', 'token"; return 200;', 'token\nnext']:
                with self.assertRaises(ValueError):
                    secret.install_secret(invalid, path)
            self.assertEqual(path.read_text(), 'LLM_API_KEY=second-token\n')
            self.assertEqual(list(path.parent.iterdir()), [path])

    def test_rotation_preserves_unrelated_env_lines(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'llm-proxy.env'
            path.write_text('LLM_MODEL=qwen3.8-max\nLLM_API_KEY=old-token\n# comment\n')
            secret.install_secret('new-token', path)
            text = path.read_text()
            self.assertIn('LLM_MODEL=qwen3.8-max\n', text)
            self.assertIn('# comment\n', text)
            self.assertNotIn('old-token', text)
            self.assertEqual(text.count('LLM_API_KEY='), 1)


if __name__ == '__main__':
    unittest.main()
