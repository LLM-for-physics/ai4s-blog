# Course key service

Independent Node.js 24 ESM package. Install with `npm ci`; run tests with `npm test`. The current browser, importer and helper interfaces are documented in the [API contract](../../COURSE-KEY-CONTRACT.md).

- `node src/server.js`: browser-facing Fastify API at `/api/course-keys`, loopback port 3081.
- `node src/worker.js`: independent durable importer on a private Unix socket. It uses the fixed local helper for server 190 and configured SSH receiver routes for servers 132 and 197.
- `createApp({config, db?, mailer?, importer?})`: injectable application. Mail adapter exposes `configured` and `sendCode({to,code,role})`; the internal adapter also supports `send({email,code,role})`. Importer adapter exposes `check(targets)`, `submit({requestId,items})`, `get(id)`; every target contains `studentId`, `serverId` and `username`.
- `createWorker({config, db?, helper?})`: injectable worker. Helper adapter exposes `run(request)`. `app.processJobs()` allows deterministic tests; the production worker reconciles outstanding jobs on startup and polls thereafter.

Configuration is supplied by root-managed runtime environment files, not source files. Never commit credentials.

| Variable | Default / requirement |
| --- | --- |
| `NODE_ENV` | Set `production` when deployed |
| `COURSE_KEYS_HOST` | `127.0.0.1` |
| `COURSE_KEYS_PORT` | `3081` |
| `COURSE_KEYS_ORIGIN` | Exact browser origin; HTTPS required in production |
| `COURSE_KEYS_SECRET` | At least 32 characters; required for production web process only |
| `COURSE_KEYS_ADMIN_EMAILS` | Comma-separated administrator email allowlist |
| `COURSE_KEYS_ENROLLMENT_OPEN` | `false`; literal `true` opens access to all enrolled students |
| `COURSE_KEYS_ENROLLMENT_PILOT_IDS` | Empty; comma-separated 6–16 digit student IDs allowed while the global switch is closed |
| `COURSE_KEYS_STUDENT_EMAIL_DOMAIN` | `stu.pku.edu.cn` |
| `COURSE_KEYS_DB` | `/var/lib/course-key-service/web/keys.sqlite3` |
| `COURSE_KEYS_IMPORTER_DB` | `/var/lib/course-key-service/importer/jobs.sqlite3` |
| `COURSE_KEYS_IMPORTER_SOCKET` | `/run/course-keys-importer/importer.sock` |
| `COURSE_KEYS_TARGETS_FILE` | Worker-only root-managed absolute JSON path, normally `/etc/course-keys/targets.json`; absent configuration enables only the local 190 route |
| `COURSE_KEYS_TRUST_PROXY` | `false`; literal `true` only behind a trusted reverse proxy on a private loopback listener |
| `SMTP_HOST`, `SMTP_PORT` | Mail provider host and port (default 465) |
| `SMTP_SECURE` | `true`; use `false` only for mandatory STARTTLS |
| `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | SMTP credentials and fixed sender; only the web process needs these |

The worker must use its own environment file without SMTP credentials or the web session secret. `loadConfig(process.env, 'worker')` permits this separation. The socket directory and socket group must give the web service access while excluding student accounts. The web process has neither an importer SSH private key nor permission to invoke the root helper.

The local helper is fixed at `/usr/local/libexec/course-keys/helper.py`, invoked as `/usr/bin/sudo -n /usr/bin/python3 -I -S …`. Student uploads cannot choose a command, server, path, UID or username. Administrators assign server `132`, `190` or `197` through the roster; usernames are derived as `stu` plus the complete student ID, while the verified school-email local part remains the student ID. Every task freezes all three target fields. Remote routes use fixed SSH arguments, strict host-key verification and receiver forced commands, with no arbitrary remote command. Missing routes fail explicitly and never fall back to 190. Account creation and helper allowlist maintenance remain administrator operations outside the web application.

## Roster and key handling

Roster templates contain three required columns: `学号`, `姓名`, `服务器号`. The service derives email and username; optional imported email or username columns must match those derived values. Student IDs are 6–16 ASCII digits and preserve leading zeros. XLSX numeric student ID cells are rejected because lost leading zeros cannot be reconstructed; server cells may be numeric 132, 190 or 197. Files are limited to 2 MiB, and active enrollment to 2000 students. XLSX archive expansion is bounded before workbook parsing, formula cells are rejected, and exports write user-controlled values as literal strings.

Roster imports add/update records without removing students omitted from a later upload. The admin list accepts `includeRemoved=true`; its statistics count active students separately from removed records. Removing and restoring a student each require a preview and a confirmation. Removal retains key history and audit records, invalidates the student's sessions and codes, and cancels unapproved automatic candidates. It does not delete or lock a Linux account. Restoring a roster record does not install historical keys or revive invalidated sessions. Existing installed keys, active tasks or unresolved deployment results block removal and server reassignment; revoke and verify the old target first. Importing a removed student again does not silently restore the record.

Only canonical Ed25519 and RSA public keys of at least 3072 bits are accepted. A `.pub` file is limited to 4096 bytes and the entire upload request to 16 KiB. Raw uploads and private material are never persisted; public-key comments are discarded. Per-student key history is retained, and the same fingerprint cannot be assigned to another student, including a removed student's historical keys. Invalid uploads cannot replace an accepted key. Repeating the current key is a no-op, with `duplicate:true`.

## Authentication and deployment state

OTP codes expire after 10 minutes, allow five verification attempts, and are hashed with the runtime secret. Resends are limited to one per minute and three per ten minutes per normalized identity. Shared classroom IPs allow 300 code requests per ten minutes. Sessions last eight hours; import approval, retry, key revoke/restore, roster remove/restore confirmation and automatic-import setting changes require verification within ten minutes. Production cookies are Secure, HttpOnly and SameSite=Strict; mutating browser requests require an exact Origin, and authenticated mutations require the session CSRF token. API responses are not cacheable.

Approvals freeze the target, key ID and roster revision. They create a durable web outbox and stable request ID before contacting the importer. Duplicate request IDs must represent identical actions. The worker allocates strictly increasing generations independently for each `(serverId, username)`, including every install, revoke and restore. It reads actual helper state after restart and after writes; target mismatches and higher remote generations never count as success. Failed jobs can be retried only while the approved student version and target remain current.

The helper owns the authoritative installed key and generation metadata. Do not delete that metadata when revoking or rolling back web code. Browser batches expose `source:manual|automatic`, target and per-item result; internal importer jobs additionally expose `generation`. For revocation, the job fingerprint identifies the key being revoked; the helper receives it as `expectedFingerprint` and compares it under the account lock before applying the change. An `installed` status confirms verified server-side writing, not a completed student SSH login.

## Automatic import

Automatic import is disabled in a new database. Administrators read `GET /admin/auto-import` and update `PUT /admin/auto-import` with `{enabled,revision}`; changes require fresh authentication and matching revision. Responses contain `enabled`, `revision`, `updatedAt` and `updatedBy`.

When disabled, uploads await manual approval. When enabled, subsequent new key uploads, including replacements, create candidates bound to the key, roster target and setting revision. Ready, authorized accounts can enter a durable `source:'automatic'` batch without a separate per-key approval. Missing or unauthorized accounts wait for administrator preparation and are rechecked with backoff. Uncertain or failed deployment results require administrator handling. Enabling the switch does not backfill previous uploads, and re-uploading the current key does not create a new candidate.

Each student response includes `autoImport:{status,message}` and `autoImportBlocked`. Candidate status is `waiting`, `queued`, `blocked`, `cancelled` or `null`; final deployment status remains in `importStatus` and `installedKey`. Disabling automatic import cancels unapproved waiting/blocked candidates, but does not cancel already approved outbox jobs or revoke installed keys. Manual revoke approval blocks that student's future automatic imports; a successful manual install or key restore clears the block. Reopening the switch or restoring roster membership alone does not clear it.

## Enrollment closure semantics

The global enrollment switch and pilot list determine access after the web process restarts with the new configuration. Global `true` allows every active roster student; otherwise a nonempty `COURSE_KEYS_ENROLLMENT_PILOT_IDS` allows only those active roster IDs. With global `false` and an empty pilot list, student code issuance, verification and authenticated operations are closed. Administrator login and management remain available in every mode.

`GET /health` exposes `enrollmentMode:'open'|'pilot'|'closed'`. Its `enrollmentOpen` is true for both open and pilot mode, so it does not mean all students can enter. The response lists supported servers, not their connectivity or account readiness, and does not expose pilot IDs. `mailConfigured` indicates configuration, not actual mail delivery.

Changing enrollment access does not delete existing sessions or unconsumed codes. On reopening, they remain usable if still within their original lifetime and verification-attempt limit. Verification attempts made while closed still count. Unapproved automatic candidates that fall outside the current enrollment scope are cancelled when rechecked. Closing enrollment does not cancel already approved/importing jobs and does not revoke installed SSH keys; access revocation requires an explicit administrator key-revocation operation.

## Tests and operational records

Default package tests use synthetic identities, in-memory or private temporary SQLite databases, fake mail and injected helpers. They do not send real SMTP messages or modify production SSH authorization. Live acceptance scripts are separate, explicit administrator operations; see [testing](TESTING.md) and [deployment](deploy/README.md).

The current Web schema is version 3 and importer schema version 2. Historical reports separately record [the v2 multi-server migration](DEPLOYMENT-MULTI-SERVER-20260918.md), [automatic-import delivery](DEPLOYMENT-AUTO-IMPORT-20260918.md) and [full enrollment opening](deploy/ENROLLMENT-OPEN-20260918.md); each describes its own deployment-time state rather than a permanent current-stage label. See [multi-server operations](deploy/MULTI_SERVER.md) for receiver setup and migration. Restore requires reviewing databases together with actual server key generations; rolling back application code alone neither revokes keys nor safely downgrades a newer database.

See [known issues](KNOWN-ISSUES.md) for the confirmed cross-server scheduling delay and the limits of existing concurrency tests.
