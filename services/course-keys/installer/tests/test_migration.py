"""Configuration migration cannot silently transfer old numeric-account approval."""
import importlib.util
import json
from pathlib import Path
import unittest
from unittest import mock
from test_helper import helper, ed_key

SPEC = importlib.util.spec_from_file_location("course_migration", Path(__file__).resolve().parents[2] / "deploy/migrate-installer-config.py")
migration = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(migration)

class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.original = {"schemaVersion": 1, "serverId": "fyl190", "allowedAccounts": {},
                         "keysDirectory": "/etc/ssh/course_authorized_keys", "minimumRsaBits": 3072}

    def test_empty_approved_state_migrates_without_mutating_original(self):
        with mock.patch.object(helper, "validate_config"), mock.patch.object(migration.os, "listdir", return_value=[]):
            result = migration.candidate_config(helper, self.original, "190")
        self.assertEqual(result["schemaVersion"], 2)
        self.assertEqual(result["serverId"], "190")
        self.assertEqual(result["allowedAccounts"], {})
        self.assertEqual(self.original["schemaVersion"], 1)

    def test_existing_legacy_uid_approval_is_never_rebound(self):
        self.original["allowedAccounts"] = {"000123": {"expectedUid": 1023}}
        with self.assertRaisesRegex(RuntimeError, "never rebind"):
            migration.candidate_config(helper, self.original, "190")

    def test_cross_server_migration_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "different server"):
            migration.candidate_config(helper, self.original, "132")

    def test_installed_legacy_key_blocks_migration_but_revoked_metadata_is_retained(self):
        key = helper.parse_key(ed_key())
        metadata = {"schemaVersion": 1, "studentId": "000123", "generation": 8, "action": "install", "fingerprint": key["fingerprint"]}
        raw = (helper.HEADER + json.dumps(metadata) + "\n" + key["publicKey"] + "\n").encode("ascii")
        with mock.patch.object(helper, "validate_config"), mock.patch.object(migration.os, "listdir", return_value=["000123"]), mock.patch.object(helper, "secure_read", return_value=raw):
            with self.assertRaisesRegex(RuntimeError, "installed central key"):
                migration.candidate_config(helper, self.original, "190")
        metadata.update(action="revoke", fingerprint=None)
        raw = (helper.HEADER + json.dumps(metadata) + "\n").encode("ascii")
        with mock.patch.object(helper, "validate_config"), mock.patch.object(migration.os, "listdir", return_value=["000123"]), mock.patch.object(helper, "secure_read", return_value=raw), mock.patch.object(migration.os, "replace") as replace:
            result = migration.candidate_config(helper, self.original, "190")
        self.assertEqual(result["allowedAccounts"], {})
        replace.assert_not_called()

if __name__ == "__main__":
    unittest.main()
