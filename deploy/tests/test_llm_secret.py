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
            path = Path(directory) / 'secrets' / 'llm.conf'
            secret.install_secret('first-token', path)
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            self.assertEqual(stat.S_IMODE(path.parent.stat().st_mode), 0o700)
            secret.install_secret('second-token', path)
            self.assertNotIn('first-token', path.read_text())
            for invalid in ['', 'token"; return 200;', 'token\nnext']:
                with self.assertRaises(ValueError):
                    secret.install_secret(invalid, path)
            self.assertEqual(path.read_text(), 'proxy_set_header Authorization "Bearer second-token";\n')
            self.assertEqual(list(path.parent.iterdir()), [path])
