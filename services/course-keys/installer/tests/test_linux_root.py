"""Real root-owned filesystem tests. Run only from a root-owned reviewed copy."""
import base64
import importlib.util
import os
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest import mock

SPEC = importlib.util.spec_from_file_location("course_keys_helper_linux", Path(__file__).resolve().parents[1] / "helper.py")
helper = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(helper)

@unittest.skipUnless(os.name == "posix" and getattr(os, "geteuid", lambda: -1)() == 0,
                     "Real filesystem safety tests require a disposable Linux root environment")
class LinuxRootTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.mkdtemp(prefix="course-key-tests-", dir="/root")
        self.addCleanup(shutil.rmtree, self.temp)
        keys, state = self.temp + "/keys", self.temp + "/state"
        os.mkdir(keys, 0o755)
        os.mkdir(state, 0o700)
        self.config = {"serverId": "190", "keysDirectory": keys, "stateDirectory": state, "sshKeygen": "/usr/bin/ssh-keygen", "minimumRsaBits": 3072}
        self.key = "ssh-ed25519 " + base64.b64encode(
            b"\0\0\0\x0bssh-ed25519\0\0\0\x20" +
            bytes.fromhex("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a")).decode()
        self.account = mock.patch.object(helper, "check_account")
        self.account.start()
        self.addCleanup(self.account.stop)

    def request(self, operation="apply", generation=1, action="install"):
        payload = {"operation": operation, "studentId": "000123", "serverId": "190", "username": "stu000123"}
        if operation == "apply":
            payload.update(generation=generation, action=action, publicKey=self.key if action == "install" else None, fingerprint=None)
            if action == "revoke":
                payload["expectedFingerprint"] = helper.parse_key(self.key)["fingerprint"]
        return helper.process_request(payload, self.config)

    def test_atomic_key_permissions_revoke_and_restart(self):
        self.assertTrue(self.request()["ok"])
        path = Path(self.config["keysDirectory"]) / "stu000123"
        self.assertEqual(path.stat().st_mode & 0o777, 0o644)
        self.assertEqual(path.stat().st_uid, 0)
        self.assertEqual(len(path.read_text().splitlines()), 2)
        self.assertFalse(self.request()["changed"])
        self.assertTrue(self.request(generation=2, action="revoke")["ok"])
        self.assertEqual(len(path.read_text().splitlines()), 1)
        self.assertEqual(self.request("status")["generation"], 2)
        self.assertEqual(self.request()["error"]["code"], "STALE_GENERATION")

    def test_legacy_tombstone_is_not_modified_by_new_install(self):
        legacy = Path(self.config["keysDirectory"]) / "000123"
        before = b'# course-keys {"schemaVersion":1,"studentId":"000123","generation":20,"action":"revoke","fingerprint":null}\n'
        legacy.write_bytes(before)
        self.assertTrue(self.request()["ok"])
        self.assertEqual(legacy.read_bytes(), before)
        self.assertEqual(self.request("status")["generation"], 1)

    def test_symlink_and_hardlink_destination_rejected(self):
        target = Path(self.temp) / "untouched"
        target.write_text("original")
        key_path = Path(self.config["keysDirectory"]) / "stu000123"
        key_path.symlink_to(target)
        self.assertEqual(self.request()["error"]["code"], "UNSAFE_PATH")
        key_path.unlink()
        os.link(str(target), str(key_path))
        self.assertEqual(self.request()["error"]["code"], "UNSAFE_PATH")
        self.assertEqual(target.read_text(), "original")

    def test_writable_ancestor_rejected(self):
        os.chmod(self.config["keysDirectory"], 0o777)
        with self.assertRaises(helper.InstallerError) as raised:
            helper.trusted_path(self.config["keysDirectory"], "directory")
        self.assertEqual(raised.exception.code, "UNSAFE_PATH")

    def test_unmanaged_file_not_overwritten(self):
        key_path = Path(self.config["keysDirectory"]) / "stu000123"
        key_path.write_text(self.key + "\n")
        self.assertEqual(self.request()["error"]["code"], "STATE_CONFLICT")
        self.assertEqual(key_path.read_text(), self.key + "\n")

    def test_failed_replace_preserves_previous_key(self):
        self.request()
        key_path = Path(self.config["keysDirectory"]) / "stu000123"
        before = key_path.read_bytes()
        with mock.patch.object(os, "replace", side_effect=OSError("simulated")):
            result = self.request(generation=2, action="revoke")
        self.assertEqual(result["error"]["code"], "IO_ERROR")
        self.assertEqual(key_path.read_bytes(), before)
        self.assertFalse(list(Path(self.config["keysDirectory"]).glob(".course-key-*")))

if __name__ == "__main__":
    unittest.main()
