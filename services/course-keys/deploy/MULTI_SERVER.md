# Three-server stu-account deployment

This document describes the new source implementation for servers `132`, `190`, and `197`.
It is not a claim that these changes have already been deployed. The 2026-09-17 acceptance
record describes the earlier numeric-account, single-server version.

## Identity and fixed protocol

Keep student IDs as 6-16 ASCII digit strings, including leading zeros. The only normal
Linux username is `stu` plus that ID. School email remains `studentId@stu.pku.edu.cn`.
The root installer configuration has `schemaVersion: 2`, its own server ID, and
`allowedAccounts: { "000123": { "expectedUid": 1234 } }`. The UID must be read from
`pwd.getpwnam("stu000123")` on that server; never reuse the UID approved for `000123`.

Every helper request explicitly identifies the destination:

```json
{"operation":"status","serverId":"190","studentId":"000123","username":"stu000123"}
```

`check`, `status`, and `apply` require all three identity fields. `apply` also takes the
existing action/generation/key/fingerprint fields; revocation takes `expectedFingerprint`.
The helper rejects another server or a username not derived from the student ID with
`TARGET_MISMATCH` before account access. Responses echo the three fields, including normal
operation failures; malformed field values are returned as null. New key metadata is
schema 2 and includes server ID, student ID and username. Files and locks use the stu
username. Legacy numeric files are never addressed by new helper operations.

## Upgrade 190 before opening enrollment

1. Stop Web and importer and retain the old code/configuration backup. Closing enrollment
   alone does not stop approved work. Account for unfinished Web batches and importer jobs
   before migrating either database; do not replay old tasks onto a new destination.
2. Using the old helper, explicitly revoke and verify any installed legacy course key.
   Retire old account approvals through the old root operator procedure. The old
   `allowedAccounts` must be empty; the migration never rebinds an old UID to a stu account.
3. Copy the new reviewed source into a root-owned release with trusted ancestors. From
   that release, run the new migration in validation mode, inspect its result, then commit:

   ```sh
   /usr/bin/python3 -I -S deploy/migrate-installer-config.py --server-id 190
   /usr/bin/python3 -I -S deploy/migrate-installer-config.py --server-id 190 --commit
   ```

   This tool refuses a nonempty old allowlist, any still-installed central key, a different
   server ID, or unrecognized metadata. It backs up the old config before replacing it;
   numeric revoked-key files and their generations remain unchanged for audit and backup.
   It creates or renames no Linux accounts. Run it before `install-assets.py`, which rejects
   an unmigrated config before replacing the old helper.
4. Complete the separately guarded application database migration. Install the new 190
   assets while services remain stopped. Approve existing stu accounts only after checking
   their actual UIDs, course group membership and absence of administrative privileges.
   `allowlist.py propose` now requires the `serverId`/`服务器号` roster column and selects
   only rows assigned to the local config's server. Unknown server IDs are rejected.
5. Recheck the course SSH Match using actual stu usernames, e.g. `--student stu000123`.
   Any remaining numeric member of `course_students` stops automatic configuration for
   manual review. Do not silently alter its group or account. Start services only after
   configuration, databases, task destinations and authorization have been reconciled.

## Python-only receiver on 132 and 197

No Node runtime, Web process, SMTP configuration or Web database is needed on these targets.
Stage `installer/` and `deploy/` under a reviewed root-owned directory with no writable
ancestors. Obtain 190's importer PUBLIC key and verified egress address through the normal
administrator connection. Never copy the private key to a target.

On 2026-09-18, the actual route from the 190 importer host to these targets was verified
as source IP `162.105.151.77`, and both receiver keys restrict `from` to that address. Do not
assume that the login address `162.105.151.190` is also its outbound source address. Recheck
the route before a network change. Run from the reviewed root-owned release, substituting
the actual server ID and verified source IP:

```sh
/usr/bin/python3 -I -S deploy/install-receiver.py --server-id 132 --source-ip 162.105.151.77 --public-key /root/reviewed-importer.pub
```

The script creates only the dedicated `course-keys-receiver` service account (executable
`/bin/sh` shell, root-owned home), installs the Python helper/operator tools, an empty
server-specific root config, and precise helper-only sudo authorization. The single
root-owned authorized-key entry uses `restrict`, a fixed `from` address and the fixed
helper command. Existing unexpected account identity, permissions or config cause refusal.
It does not create/rename student accounts, start applications, or change/reload sshd.

The script stages `/etc/course-keys/receiver-sshd.conf`. With an administrator session kept
open, back up `sshd_config`, append this reviewed block at the end (never inside an existing
Match), and verify `sshd -t` plus `sshd -T -C` for the receiver and administrator before reload.
The receiver must have the fixed ForceCommand, publickey-only authentication, no TTY or
forwarding, and exactly the root-owned authorized-key location. Validate the actual PAM and
account policy with a real forced-command connection; an executable shell alone does not
prove that a locked system account may authenticate. Do not enable password login to fix it.
Retain existing student and administrator SSH settings.

Approve each target's precreated stu accounts separately with its root allowlist tool and
configure/check the course-group central-key Match. A full copy of `targets.json.example`
is not authorization to approve every student on every host.

## Configure 190's importer transport

Use `/var/lib/course-key-service/importer/ssh`, owned by the importer UID, mode 0700, with
`id_ed25519` mode 0600 and the same owner. Generate the transport key under that identity
without printing private content. Web must not be able to read it. Do not grant key access
to `course-keys-api`: the Web process also belongs to that shared socket group.

Populate root-owned `/etc/course-keys/known_hosts` from host keys verified via existing
trusted administrator connections. Nonstandard-port records are `[host]:2024`. Do not trust
an unauthenticated `ssh-keyscan` result by itself. Neither the key nor known_hosts is supplied
by a roster upload or student request.

Install the reviewed `targets.json.example` as `/etc/course-keys/targets.json`, root-owned
and not group/world writable, with equally trusted ancestors. Match the actual host/port
and dedicated receiver user. Until a remote receiver and host key are ready, omit that route;
its jobs fail `TARGET_NOT_CONFIGURED`, never run on 190 instead. Set:

```text
COURSE_KEYS_TARGETS_FILE=/etc/course-keys/targets.json
```

The example maps 190 to local sudo and 132/197 to fixed SSH destinations. SSH uses no user
config, no interactive password, strict host-key validation and no remote command argument;
the target's forced command consumes one stdin JSON request. Confirm the helper response
reports the same server/student/username, including a deliberate wrong-server rejection.

## Change, remove, and recover

A job's server and username must remain the approved snapshot through dispatch, retry,
revocation and history. Changing the roster does not move or revoke an installed key.
Only a student with no installed course key, or a previously completed and verified manual
revocation, may be removed. Active jobs block removal. Preserve task, key and audit history;
removing a roster entry is not Linux account deletion and does not remove personal keys.

The existing 190 service backup handles both numeric legacy files and new stu files, plus
its Web/importer databases. Its snapshots do not cover another host. Install the dedicated
receiver backup described below on 132 and 197. Generation/action/fingerprint metadata is
inside each central key file, including revoked-key tombstones; transient lock files do not
need restoration. Restore restrictions in README.md still apply: stop services, compare
unfinished and successful records with live per-target state, and do not roll generations
back. No backup program here automatically restores production access.

## Daily receiver backups on 132 and 197

`backup-target.py` uses only system Python and the installed root helper. It reads the fixed
root installer configuration and the managed central-key directory, includes both legacy
numeric and current stu filenames, and stores root-private snapshots in
`/var/backups/course-key-target`. It does not read Web/SQLite state, the receiver's SSH login
credentials, authorized login key, SMTP secrets, or 190's importer transport private key.
Server 190 is deliberately refused; retain its existing database-aware backup instead.

Every run validates each source file with `secure_read` and `parse_stored_state`, then reads
back the completed staging contents and validates the saved configuration hash, key hashes,
filename inventory and metadata before atomically publishing a snapshot. The manifest records
the server ID and checksums. The configuration contains the per-server account allowlist;
key files contain their generation history metadata. Files are individually consistent,
not a transaction spanning all accounts and the allowlist. Logs contain only result status,
server ID, snapshot name, file count and validation flags, never key bodies or credentials.

From the reviewed root-owned release, install these new assets independently; this does not
require rerunning the receiver installer:

```sh
install -d -o root -g root -m 0700 /var/backups/course-key-target
install -o root -g root -m 0644 deploy/backup-target.py /usr/local/libexec/course-keys/backup-target.py
install -o root -g root -m 0644 deploy/course-keys-target-backup.service /etc/systemd/system/course-keys-target-backup.service
install -o root -g root -m 0644 deploy/course-keys-target-backup.timer /etc/systemd/system/course-keys-target-backup.timer
systemctl daemon-reload
systemctl start course-keys-target-backup.service
systemctl status course-keys-target-backup.service --no-pager
systemctl enable --now course-keys-target-backup.timer
```

Require the first real service run to succeed before recording backup acceptance. The timer
runs daily at 03:27 UTC with up to ten minutes of randomized delay and catches missed runs.
Snapshots retain today and the preceding 29 UTC dates; multiple same-day runs do not shorten
this period. Retention occurs only after a new snapshot passes its checks, and the lock
prevents overlapping runs. Snapshot files are root-only (0600) beneath root-only directories
(0700). These units and code have local synthetic-data verification; real service/timer
installation and execution must be recorded separately by the deploying operator.

## Verification boundary

Run `python -m unittest discover -s installer/tests -v` locally; the actual Linux/root
filesystem tests require a root-owned Linux release. `live_ssh_acceptance.py` now requires
`--server-id 190 --student <ID>` and logs in as `stu<ID>`; its default local service-permission
checks are for 190, where both Web and importer identities exist. Use only an empty,
dedicated test account. It still creates no accounts and finally revokes the test key.
Remote receiver and multi-server routing acceptance must be performed separately through
190's actual importer; a mock or an existing single-server acceptance result is insufficient.
