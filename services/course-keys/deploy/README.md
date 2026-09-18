# Course key installer and deployment

Current deployed v2 results and rollback restrictions: [2026-09-18 multi-server delivery](../DEPLOYMENT-MULTI-SERVER-20260918.md).

These files are reviewed deployment assets. They do not authorize student account creation.
The portal and importer run as separate service accounts on 190. The current source supports
server IDs 132, 190 and 197 and stu-prefixed accounts. See [MULTI_SERVER.md](MULTI_SERVER.md)
for the explicit v1 migration and Python-only remote receiver deployment. The dated record
below describes the prior single-server deployment, not acceptance of the new source.

## 190 历史部署记录（2026-09-17，单服务器旧版）

- 部署根目录使用 `/usr/local/lib/course-key-service`。190 原有 `/opt` 权限为 `0757`，本次没有修改该目录权限，也没有将可信安装程序或运行时放在其下。
- 公网 `https://aiphy.pku.edu.cn` 的 TLS 在学校网关 `162.105.120.173` 终止，再通过 HTTP 回源至 190 的 `:80`。该网关未发送 `X-Forwarded-Proto`；公网 HTTP 已验证返回 `301` 跳转 HTTPS。
- 回源 `:80` 的课程 API 使用专用 `nginx-course-keys-gateway.conf`。其中只允许已核实的网关来源 `162.105.120.173`，其他来源全部拒绝；在此来源约束内向本机后端设置 `X-Forwarded-Proto: https`。不能删除来源限制后继续把任意 HTTP 请求当作 HTTPS。
- 190 本地 `:443` 的现有 HTTPS 虚拟主机继续使用 `nginx-course-keys.conf`。两个入口都只转发课程公钥 API，保留已有静态网站及 LLM 路由。后端仍只监听本机回环地址。
- 学校网关拓扑不代表应用拥有真实学生来源 IP：当前回源主要呈现网关地址。OTP 同时按规范化身份限流，校园共同出口模拟的边界见测试报告。未来若需真实客户端 IP，应先核实学校网关协议，再配置受信任代理链。
- 网站服务与导入服务已运行并启用；真实 `course-keys-web → Unix socket → worker → helper` 通路和 SSH 测试已通过。无 importer 套接字时 Web 冷启动成功，worker 恢复后原 Web 进程即可通信；结果为 `course-key-service-recovery.json`。
- Node.js 已升级至 `24.21.0`，Windows 与 190 的服务及根目录集成测试各通过 33/33 项。`enrollment.test.js` 已覆盖已有学生会话、OTP 跨关闭重启和重开，管理员始终可用。
- 真实 systemd 备份运行成功且定时器已启用；快照 `20260917T120323968269Z` 的隔离副本恢复检查已通过。Web/importer 分别以所属 UID 完成 SQLite 完整性、外键、写入及关闭后重新打开检查，中央公钥快照哈希与 LIVE 一致；临时副本已删除，生产数据库未修改。实际生产灾备演练仍未执行。
- 本次服务 release 为 `20260917T114000Z`；最终静态 release 为 `20260917T120323Z-0d47ebb8`，共 48 页。功能加入前的稳定回滚基线为 `20260914T164549Z-779bf99f`；`20260917T114503Z-62609e1a` 是本次功能的中间发布，不是预功能基线。正式 Web 名单和安装允许清单均为空；合成测试账号已过期并禁用登录，课程公钥终态为撤销，测试私钥已删除。
- 最终公网只读冒烟检查已通过：三个页面、健康接口、`mailConfigured:true`、`enrollmentOpen:false`、HTTP 301 跳转 HTTPS、零 JavaScript 错误。证据位于 `artifacts/course-keys-public-final`。
- SMTP 已配置并通过认证；指定管理员邮箱已实际收到验证码，用户已成功完成管理员登录。正式名单尚未提供，`COURSE_KEYS_ENROLLMENT_OPEN=false`；仍需正式名单与账号核对、学生学校邮箱真实送达、SMTP 额度核对和小范围试用，再决定全班开放。管理员单次收信成功不代表课堂集中发信的额度或送达速度已经验收。

真实联调结果、模拟测试边界、最新服务器证据路径及待完成项见 [TESTING.md](../TESTING.md)。最新服务器日志仍保留在 190，未复制到本地；本地 `artifacts/course-keys-server` 旧日志仅是阶段性结果，不能作为最终测试或发布证据。如果学校网关或回源来源发生变化，应重新核实 HTTPS 终止点和 IP 限制，先执行 `nginx -t` 再 reload，不能放宽为任意来源。

## Fixed paths and identities

| Purpose | Path / identity |
| --- | --- |
| Web process | course-keys-web, supplementary group course-keys-api |
| Import process | course-keys-importer, socket group course-keys-api |
| Course group | course_students; administrators must not be members |
| Node runtime | /usr/local/lib/course-key-service/runtime/bin/node, actual root-owned Node 24 executable |
| Service code | /usr/local/lib/course-key-service/releases/<release>, root-owned; current is a root-owned symlink |
| Web state | /var/lib/course-key-service/web/keys.sqlite3, private to Web |
| Importer state | /var/lib/course-key-service/importer/jobs.sqlite3, private to importer |
| Socket | /run/course-keys-importer/importer.sock, 0660; parent 0750 |
| Installer configuration | /etc/course-keys/installer.json, root:root 0600 |
| Root programs | /usr/local/libexec/course-keys/*.py, root:root 0644 |
| Central authorized keys | /etc/ssh/course_authorized_keys/<username>, root:root 0644; directory 0755 |
| Locks / approval and SSH backups | /var/lib/course-key-service/installer, root:root 0700 |
| Recovery snapshots | /var/backups/course-key-service, root:root 0700; retain 30 UTC days |

All ancestors of privileged programs, installer configuration and central keys must be
root-owned and not group/world writable. The runtime helper never imports the source
checkout or a user-owned Python environment. It uses the system interpreter with -I -S.
It has no useradd/usermod/group-management action.

Student IDs match 6-16 ASCII digits, preserving leading zeros. Linux usernames are always
stu + studentId, and the helper calls pwd.getpwnam() with that exact string. Configuration
schema 2 binds serverId to 132, 190 or 197; allowedAccounts remains indexed by student ID.
Permission checks require an exact name, approved expected UID, course-group membership,
and exclusion of UID/GID 0 and sudo/admin/wheel/docker/lxd groups. Operations must also
review any direct per-user sudo grants before approving a student account.

## Protocol

The only sudo command is:

    sudo -n /usr/bin/python3 -I -S /usr/local/libexec/course-keys/helper.py

It accepts one bounded JSON document on stdin and no script arguments:

    {"operation":"check","serverId":"190","studentId":"2026000001","username":"stu2026000001"}
    {"operation":"status","serverId":"190","studentId":"2026000001","username":"stu2026000001"}
    {"operation":"apply","serverId":"190","studentId":"2026000001","username":"stu2026000001","action":"install","generation":1,"publicKey":"ssh-ed25519 ...","fingerprint":"SHA256:..."}
    {"operation":"apply","serverId":"190","studentId":"2026000001","username":"stu2026000001","action":"revoke","generation":2,"publicKey":null,"fingerprint":null,"expectedFingerprint":"SHA256:..."}

Every response has:

    {
      "ok": true,
      "serverId": "190",
      "studentId": "2026000001",
      "username": "stu2026000001",
      "accountStatus": "ready",
      "generation": 1,
      "action": "install",
      "fingerprint": "SHA256:...",
      "publicKey": "ssh-ed25519 ...",
      "changed": true,
      "error": null
    }

Every request requires serverId/studentId/username. Another server or a username different
from stu + studentId is rejected with TARGET_MISMATCH before account access. Responses echo
validated destination fields even on failure; malformed values are null.
check returns generation/action/fingerprint/publicKey as null. status without an existing
file returns generation 0, action none and null key fields. Failure exits nonzero and
returns error: {code,message}; it never echoes uploaded key text in error messages.
Account readiness describes permission to install; it does not prove successful SSH login.
Revoke compares expectedFingerprint to the currently installed key while holding the account
lock. A changed key yields EXPECTED_KEY_MISMATCH without a write or generation advance.
An already empty/revoked target is a safe no-key action. Install does not accept this field.

Each successful new install/revoke/restore uses a higher generation. Only identical
generation + action + fingerprint is an idempotent retry. Revocation writes a metadata-only
file and retains its NEW generation. It never deletes generation state. Restoring a
historical key is a new install at a higher generation. A root-owned per-account flock
serializes changes; metadata and normalized key are replaced atomically as one file.
A timeout or interrupted response must be reconciled with status before retrying.

Only one plain Ed25519 or RSA >=3072-bit key is accepted. A stdlib parser checks SSH wire
structure and computes SHA256; fixed-argv system ssh-keygen independently verifies the
key and fingerprint. Comments are removed. Uploaded input is never evaluated as a shell
command or copied verbatim into authorized_keys. Uniform INVALID_KEY handling is used.

## Stage and install

1. Build/test the backend with the selected Node 24 runtime. Install production dependencies
   for the target Linux ABI, including better-sqlite3, using the build account. Copy the
   reviewed service release into /usr/local/lib/course-key-service/releases/<release> and make all
   code/dependencies root-owned and not group/world writable before executing any root
   deployment program. Relative package symlinks must remain inside that release.
   Install a verified Node 24 binary as the actual file at runtime/bin/node; do not point
   privileged runtime paths into a home directory.

2. Run the staged root-owned script with the system Python:

       /usr/bin/python3 -I -S /usr/local/lib/course-key-service/releases/<release>/deploy/install-assets.py --release /usr/local/lib/course-key-service/releases/<release>

   It creates ONLY the two service accounts and service/course groups, installs assets and
   validates sudoers. It preserves existing runtime configuration, prepares an empty account
   allowlist on a new install, generates the initial application secret, and leaves
   enrollment false. It does not start services or modify nginx/sshd. On upgrades, stop
   Web/importer first, retain the previous release symlink and back up state before changing
   code or database schemas.

3. Fill /etc/course-keys/web.env using an editor that does not echo secrets to terminal logs.
   SMTP credentials are runtime-only. The configured administrator is
   gwlbgs523@pku.edu.cn; the requested sender is physicsandai2026@163.com. Neither SMTP
   credentials nor actual enrollment data belongs in the repository. Review backend
   configuration validation; verify SMTP login/delivery before opening enrollment.

4. Operations first creates student accounts using the established independent procedure
   and assigns them to course_students. The website may collect public keys before this.
   Missing accounts stay pending and do not receive keys. Account checking reports missing
   separately from unauthorized; no operation automatically creates a student.

5. Prepare a UTF-8 CSV with studentId (or 学号) and serverId (or 服务器号), and generate
   an ADDITIVE proposal for rows assigned to this server:

       umask 077
       /usr/bin/python3 -I -S /usr/local/libexec/course-keys/allowlist.py propose --roster-csv /root/reviewed-roster.csv > /root/course-account-approval.json

   If any selected account is missing or unready, proposal generation exits nonzero.
   Existing UID bindings cannot silently change. Review every username and expectedUid,
   then explicitly approve:

       /usr/bin/python3 -I -S /usr/local/libexec/course-keys/allowlist.py approve --configuration /root/course-account-approval.json
       /usr/bin/python3 -I -S /usr/local/libexec/course-keys/allowlist.py audit

   Approval cannot change paths or security policy. The candidate must be root-owned with
   trusted ancestors. The previous configuration is retained under installer state.
   Removing an allowlist entry blocks future installer operations; it does not revoke an
   already installed key. Revoke first when intentionally retiring access.

## SSH and nginx integration

Keep an administrator connection open and a separate recovery path available.
The configure-ssh script appends a marked Match Group block at the end of the current
sshd_config, preserving its previous text and effective AuthorizedKeysFile paths:

    /usr/bin/python3 -I -S /usr/local/libexec/course-keys/configure-ssh.py \
      --admin fyl --student <approved-stu-test-account> \
      --client-address <actual-client-IP> --port 2024 --service ssh

It checks all known course-group members and allowed accounts, refuses unapproved or
privileged members, requires password/keyboard-interactive authentication already disabled,
and rejects divergent per-account authorized-key paths. It validates a temporary candidate
with sshd -t and sshd -T -C, confirms the administrator is unchanged, saves a backup, then
atomically installs and reloads. Reload failure restores the original file. An overlapping
Match that prevents the central path taking effect causes validation to stop. If the host
has address-dependent SSH settings, repeat explicit effective-config checks for every
relevant client context; one representative address cannot prove all Match Address cases.

The original per-user authorized-key files remain effective. Replacing the course-managed
key does not revoke keys stored in those historical locations. Do not describe this as
global one-key-only access.

For direct HTTPS ingress, include nginx-course-keys.conf only inside the existing HTTPS server for aiphy.pku.edu.cn,
then run nginx -t before reload. Do not replace the vhost or existing LLM routes. This file
adds only /api/course-keys/; student-key bodies are limited to 16 KiB, ordinary API JSON
to 64 KiB, and the exact roster-preview route to 2064 KiB. Request buffering is disabled
for all three locations so raw student attachments are not first spooled to nginx files.
Ensure another more-specific location does not override these routes. For the verified campus gateway on 190, use the separate source-restricted HTTP-upstream snippet described in the actual topology section above.

Start importer and Web after configuration. Web only Wants importer; collection remains
available during a worker outage. Its unit does not bind-mount the importer RuntimeDirectory:
ProtectSystem=strict and directory/socket DAC permissions retain the access boundary without
requiring that transient directory to exist when Web starts. The importer unit deliberately
avoids NoNewPrivileges and seccomp options that implicitly prohibit its narrowly scoped sudo
operation. DAC and mount restrictions still prevent its unprivileged process from writing
central keys.

COURSE_KEYS_ENROLLMENT_OPEN=false takes effect after Web restarts. It blocks student OTP
issuance, OTP verification and access through existing student sessions, while administrator
access remains available. It does not pause the Web outbox or importer, cancel approved jobs,
or revoke SSH keys. Existing unexpired sessions and challenges are retained; reopening may
make them usable again. Closing enrollment is not a maintenance or recovery stop switch.

## Tests and acceptance

Portable tests, using any local Python 3.8+:

    python -m unittest discover -s installer/tests -v

The tests never create users. Six Linux/root filesystem tests are skipped elsewhere.
For real ownership, locking, symlink/hardlink and atomic-replacement checks, execute the same
suite from the reviewed ROOT-OWNED release with system Python -I -S in a disposable Linux
test environment. It uses temporary directories under /root, mocked account resolution,
and the real system ssh-keygen; it does not alter the live installer configuration.

Before enrollment opens, exercise one approved test account through actual student and
administrator email OTP, key upload, preview, install, real SSH login, replacement and
revocation. Verify a wrong private key fails and that the old course key fails after
replacement when it is absent from other authorized-key locations. Verify missing-account
blocking, duplicate requests, stale previews, partial failures and status reconciliation.
A successful API/install result is not a substitute for an actual login test.

## Backups and rollback

Enable course-keys-backup.timer after both databases exist. The root orchestrator launches
the fixed snapshot-db.py with all supplementary groups removed and the corresponding
service UID/GID, isolated system Python and a cleared environment. Only that lower-privilege
child opens SQLite or its WAL/SHM sidecars, performs online backup and runs quick_check.

Root copies the predetermined randomly named result using a directory fd, O_NOFOLLOW and
fstat checks for regular file, expected service UID, one link and a 256 MiB limit. It never
opens a database through SQLite as root. Installed keys and approval configuration are
copied separately; all completed snapshots stay root-only for 30 UTC days. SMTP secrets
and application secrets are excluded and need the existing private operations backup.

The two databases and central keys are separately consistent snapshots, not one global
transaction. Before restoring production data, stop BOTH course-keys-web and
course-keys-importer. Restore database files with the correct service owners, then inspect
the restored copies offline. Do not start either service until every unfinished Web batch
and importer task has been compared with the LIVE central generation, action and fingerprint,
and an operator has explicitly resolved whether it is already complete, superseded, or still
intended. Closing student enrollment does not pause either queue.

A restored Web batch that has no corresponding importer job can be automatically submitted
again on startup. The importer allocates a new generation above the live generation, so an
old approved key could otherwise be installed again. Generation checks alone do not make
backup restoration safe. Also recheck rows recorded as successful: routine synchronization
only scans queued/running work and does not automatically correct historical success displays.
Do not blindly restore older central key files or reset generation counters.

Record these acceptance levels separately: a successful backup run proves snapshot creation;
an isolated-copy check can prove restored SQLite integrity and reviewed snapshot contents
without touching production; an actual production disaster-recovery drill additionally needs
service downtime, ownership and configuration restoration, live-state reconciliation, and
service/SSH acceptance. Neither of the first two is evidence that the production drill has
passed. Current completed checks and remaining work are recorded in TESTING.md.

The isolated-copy check passed for snapshot 20260917T120323968269Z using the reviewed
root-owned deploy/verify-backup.py. Each database was opened under its own service UID;
integrity and foreign-key checks, a write, and close/reopen succeeded. Central-key snapshot
hashes matched the live files. Temporary copies were deleted and production databases were
not modified. To repeat this isolated check on the deployed server, run:

    sudo /usr/bin/python3 -I -S /usr/local/lib/course-key-service/current/deploy/verify-backup.py

This command does not perform a production restore or waive the stop-and-reconcile procedure
above. An actual production disaster-recovery drill remains unperformed.

Application rollback stops Web/importer and switches the root-owned current symlink to
the prior compatible release. Preserve the SSH Match and installed central keys by default
so student login remains available. Disable the nginx API include only after nginx -t.
Do not delete installed keys or remove their SSH discovery path as an incidental application
rollback. A deliberate key restore/revocation must use a new higher generation.
