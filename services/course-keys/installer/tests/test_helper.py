"""Pure unit tests run on Windows/macOS/Linux; no real accounts are changed."""
import base64
import importlib.util
import json
import os
from pathlib import Path
import struct
import sys
import types
import unittest
from unittest import mock

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("course_keys_helper", HERE.parent / "helper.py")
helper = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(helper)

def wire(value):
    return struct.pack(">I", len(value)) + value

def ed_key(byte=1):
    blob = wire(b"ssh-ed25519") + wire(bytes([byte]) * 32)
    return "ssh-ed25519 " + base64.b64encode(blob).decode("ascii")

def rsa_key(bits):
    exponent = b"\x01\x00\x01"
    modulus = (2 ** (bits - 1) + 12345).to_bytes(bits // 8, "big")
    return "ssh-rsa " + base64.b64encode(wire(b"ssh-rsa") + wire(exponent) + wire(b"\0" + modulus)).decode("ascii")

class KeyTests(unittest.TestCase):
    def rejects(self, text):
        with self.assertRaises(helper.InstallerError) as raised:
            helper.parse_key(text)
        self.assertEqual(raised.exception.code, "INVALID_KEY")

    def test_key_normalization_and_fingerprint(self):
        parsed = helper.parse_key(ed_key() + " student@\u5b66\u6821\r\n")
        self.assertEqual(parsed["publicKey"], ed_key())
        self.assertEqual(parsed["bits"], 256)
        self.assertRegex(parsed["fingerprint"], r"^SHA256:[A-Za-z0-9+/]{43}$")

    def test_rejects_options_multiple_keys_private_text_and_garbage(self):
        for value in ['command="id" ' + ed_key(), ed_key() + "\n" + ed_key(2),
                      "-----BEGIN OPENSSH PRIVATE KEY-----", "ssh-ed25519 @@@",
                      "ssh-ed25519 A" * 1024, ed_key() + "\0", ed_key() + "\ntrailing"]:
            with self.subTest(value=value[:45]):
                self.rejects(value)

    def test_blob_type_length_and_trailing_bytes(self):
        for blob in [wire(b"ssh-rsa") + wire(bytes(32)), wire(b"ssh-ed25519") + wire(bytes(31)),
                     wire(b"ssh-ed25519") + wire(bytes(32)) + b"x", b"\xff\xff\xff\xff"]:
            self.rejects("ssh-ed25519 " + base64.b64encode(blob).decode("ascii"))

    def test_rsa_bit_policy(self):
        self.rejects(rsa_key(2048))
        self.assertEqual(helper.parse_key(rsa_key(3072))["bits"], 3072)
        self.assertEqual(helper.parse_key(rsa_key(4096))["bits"], 4096)

    def test_fingerprint_claim_rechecked(self):
        current = {"generation": 0, "action": "none", "fingerprint": None, "publicKey": None}
        with mock.patch.object(helper, "check_account"), mock.patch.object(helper, "lock_account", return_value=None), \
             mock.patch.object(helper, "read_state", return_value=current), mock.patch.object(helper, "verify_openssh"):
            answer = helper.process_request({"operation": "apply", "studentId": "000123", "serverId": "190", "username": "stu000123", "action": "install",
                                             "generation": 1, "publicKey": ed_key(), "fingerprint": "SHA256:wrong"},
                                            {"minimumRsaBits": 3072, "serverId": "190"})
        self.assertEqual(answer["error"]["code"], "INVALID_KEY")

class AccountTests(unittest.TestCase):
    def setUp(self):
        self.account = types.SimpleNamespace(pw_name="stu000123", pw_uid=1023, pw_gid=1023)
        self.pwd = types.SimpleNamespace(getpwnam=mock.Mock(return_value=self.account))
        self.grp = types.SimpleNamespace(getgrnam=mock.Mock(side_effect=lambda name: types.SimpleNamespace(gr_gid={"course_students": 5000, "sudo": 27}[name])))
        self.config = {"allowedAccounts": {"000123": {"expectedUid": 1023}},
                       "requiredGroup": "course_students", "deniedGroups": ["sudo"]}

    def check(self, groups=(1023, 5000)):
        with mock.patch.dict(sys.modules, {"pwd": self.pwd, "grp": self.grp}), \
             mock.patch.object(os, "getgrouplist", return_value=list(groups), create=True):
            return helper.check_account(self.config, "000123")

    def test_numeric_name_uses_getpwnam_and_preserves_zeros(self):
        self.check()
        self.pwd.getpwnam.assert_called_once_with("stu000123")

    def test_missing_distinct_from_unapproved(self):
        self.pwd.getpwnam.side_effect = KeyError
        with self.assertRaises(helper.InstallerError) as raised:
            self.check()
        self.assertEqual(raised.exception.account_status, "missing")
        self.pwd.getpwnam.side_effect = None
        self.config["allowedAccounts"] = {}
        with self.assertRaises(helper.InstallerError) as raised:
            self.check()
        self.assertEqual(raised.exception.code, "ACCOUNT_UNAUTHORIZED")

    def test_uid_change_admin_group_and_wrong_name_denied(self):
        for change, groups in [({"pw_uid": 0}, (0, 5000)), ({"pw_uid": 2023}, (1023, 5000)),
                               ({"pw_name": "someone-else"}, (1023, 5000)), ({}, (1023, 5000, 27)),
                               ({}, (1023,))]:
            self.account.pw_name, self.account.pw_uid = "stu000123", 1023
            for key, value in change.items():
                setattr(self.account, key, value)
            with self.subTest(change=change, groups=groups), self.assertRaises(helper.InstallerError):
                self.check(groups)

class GenerationTests(unittest.TestCase):
    def setUp(self):
        self.state = {"generation": 0, "action": "none", "fingerprint": None, "publicKey": None}
        self.stack = []
        def install(config, name, generation, action, key, previous):
            self.state = {"generation": generation, "action": action,
                          "fingerprint": key["fingerprint"] if key else None,
                          "publicKey": key["publicKey"] if key else None}
        for patcher in [mock.patch.object(helper, "check_account"),
                        mock.patch.object(helper, "lock_account", return_value=None),
                        mock.patch.object(helper, "read_state", side_effect=lambda c, n: dict(self.state)),
                        mock.patch.object(helper, "write_state", side_effect=install),
                        mock.patch.object(helper, "verify_openssh")]:
            self.stack.append(patcher)
            patcher.start()
            self.addCleanup(patcher.stop)

    def request(self, generation=1, key=None, action="install", expected=None):
        payload = {"operation": "apply", "studentId": "000123", "serverId": "190", "username": "stu000123",
                   "generation": generation, "action": action,
                   "publicKey": (key or ed_key()) if action == "install" else None, "fingerprint": None}
        if action == "revoke":
            payload["expectedFingerprint"] = expected if expected is not None else self.state["fingerprint"]
        return helper.process_request(payload, {"minimumRsaBits": 3072, "serverId": "190"})

    def test_install_idempotency_and_same_generation_conflict(self):
        self.assertTrue(self.request()["changed"])
        self.assertFalse(self.request()["changed"])
        self.assertEqual(self.request(key=ed_key(2))["error"]["code"], "GENERATION_CONFLICT")
        self.assertEqual(self.request(action="revoke")["error"]["code"], "GENERATION_CONFLICT")

    def test_revoke_tombstone_old_job_rejected_and_restore_higher(self):
        self.request()
        revoked = self.request(2, action="revoke")
        self.assertTrue(revoked["ok"])
        self.assertIsNone(revoked["publicKey"])
        self.assertEqual(revoked["generation"], 2)
        self.assertFalse(self.request(2, action="revoke")["changed"])
        self.assertEqual(self.request(1)["error"]["code"], "STALE_GENERATION")
        self.assertTrue(self.request(3)["changed"])

    def test_revoke_cas_rejects_replaced_key_without_advancing_generation(self):
        first = self.request()
        second = self.request(2, key=ed_key(2))
        blocked = self.request(3, action="revoke", expected=first["fingerprint"])
        self.assertEqual(blocked["error"]["code"], "EXPECTED_KEY_MISMATCH")
        self.assertEqual(self.state["generation"], 2)
        self.assertEqual(self.state["fingerprint"], second["fingerprint"])
        self.assertTrue(self.request(3, action="revoke", expected=second["fingerprint"])["ok"])

    def test_invalid_generation_and_extra_fields(self):
        for generation in [True, 0, -1, 1.5, "1", 2 ** 53]:
            self.assertEqual(self.request(generation)["error"]["code"], "INVALID_REQUEST")
        result = helper.process_request({"operation": "check", "studentId": "000123", "serverId": "190", "username": "stu000123", "path": "/root/x"}, {})
        self.assertEqual(result["error"]["code"], "INVALID_REQUEST")
        self.assertEqual(helper.process_request({"operation": "check", "studentId": 123}, {})["error"]["code"], "INVALID_REQUEST")

class DestinationTests(unittest.TestCase):
    def request(self, **overrides):
        value = {"operation": "check", "studentId": "000123", "serverId": "190", "username": "stu000123"}
        value.update(overrides)
        with mock.patch.object(helper, "check_account") as account:
            answer = helper.process_request(value, {"serverId": "190"})
        return answer, account

    def test_three_field_destination_checked_before_account_access(self):
        answer, account = self.request()
        self.assertTrue(answer["ok"])
        self.assertEqual((answer["serverId"], answer["studentId"], answer["username"]), ("190", "000123", "stu000123"))
        account.assert_called_once_with({"serverId": "190"}, "000123")
        for change in ({"serverId": "132"}, {"username": "stu000124"}):
            answer, account = self.request(**change)
            self.assertEqual(answer["error"]["code"], "TARGET_MISMATCH")
            account.assert_not_called()

    def test_missing_or_unsafe_destination_rejected_with_safe_echo(self):
        for change in ({"serverId": None}, {"serverId": []}, {"username": "../../root"},
                       {"username": "000123"}, {"studentId": "１２３４５６"}):
            answer, account = self.request(**change)
            self.assertEqual(answer["error"]["code"], "INVALID_REQUEST")
            account.assert_not_called()
            for field in change:
                self.assertIsNone(answer[field])

class ArchiveTests(unittest.TestCase):
    def stored(self, name, **overrides):
        legacy = not name.startswith("stu")
        metadata = {"schemaVersion": 1 if legacy else 2, "studentId": name if legacy else name[3:],
                    "serverId": "190", "username": name, "generation": 4, "action": "revoke", "fingerprint": None}
        metadata.update(overrides)
        return (helper.HEADER + json.dumps(metadata) + "\n").encode("ascii")

    def test_archive_accepts_legacy_tombstone_and_v2_target(self):
        for name in ("000123", "stu000123"):
            state = helper.parse_stored_state({"serverId": "190", "minimumRsaBits": 3072}, name, self.stored(name))
            self.assertEqual(state["generation"], 4)
            self.assertEqual(state["action"], "revoke")
        with self.assertRaises(helper.InstallerError):
            helper.read_state({}, "000123")

    def test_archive_rejects_cross_server_or_mismatched_metadata(self):
        for change in ({"serverId": "132"}, {"username": "stu000124"}, {"studentId": "000124"}, {"schemaVersion": 1}):
            with self.subTest(change=change), self.assertRaises(helper.InstallerError):
                helper.parse_stored_state({"serverId": "190", "minimumRsaBits": 3072}, "stu000123", self.stored("stu000123", **change))

if __name__ == "__main__":
    unittest.main()
