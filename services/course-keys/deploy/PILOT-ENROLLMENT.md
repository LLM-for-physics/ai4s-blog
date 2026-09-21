# Student pilot enrollment

The student portal supports three modes. Student identities must always be active in the roster and complete email verification.

| Global flag | Pilot list | Result |
| --- | --- | --- |
| false | empty | All student entry is closed. |
| false | selected student IDs | Only the listed active students may request codes, verify codes, use sessions or upload keys. |
| true | any value | All active roster students may enroll. |

Configure the root-owned `/etc/course-keys/web.env` and restart only `course-keys-web.service` after a reviewed release is installed:

```ini
COURSE_KEYS_ENROLLMENT_OPEN=false
COURSE_KEYS_ENROLLMENT_PILOT_IDS=2501110104
```

This deployment uses exactly the single test ID above. IDs are comma-separated digit strings, 6 to 16 digits; leading zeroes are preserved. Empty tokens, wildcards and malformed IDs are rejected. Pilot membership never overrides a removed or missing roster record. Clearing the list while the global flag stays false closes all student access.

The global flag takes precedence: setting it true opens access to all active students even if a pilot list remains. Keep it false for a restricted pilot. Existing sessions and unconsumed codes are checked against the effective mode on every use, including another check after upload streaming. Administrator access is independent. Enrollment never grants installer authority. Uploads remain pending unless an administrator has enabled automatic import; see AUTO-IMPORT.md. The pilot restriction also applies to automatic candidates.

`/api/course-keys/health` returns `enrollmentMode` as `closed`, `pilot` or `open`. Its compatible `enrollmentOpen` field means some student access is available, so it is true in pilot mode. The public health response never includes pilot IDs. The browser displays a pilot notice without revealing identities. Browsers using a legacy health response continue to use its boolean field.

The original pilot-only release required no database migration, SSH configuration change or installer allowlist change. Later automatic-import releases use Web schema 3: follow AUTO-IMPORT.md for rollback compatibility. For the historical pilot-only release, rollback: first clear the pilot list and retain global=false, then switch to the prior service/static release and restart Web. Preserve databases and all existing keys. SMTP credentials and the session signing secret remain unchanged.

Actual school-email delivery and the user's own browser upload are completed by the tester. Automated tests use mock email and importer adapters and never send real codes or install keys.
## Deployment verified on 2026-09-18

- Service release: `/usr/local/lib/course-key-service/releases/20260918-pilot-v1`.
- Static release: `/var/www/ai4s-site/releases/20260918T060327Z-da715df5`.
- Previous service: `20260918-roster-v2`; previous static: `20260917T170611Z-b75099c8`.
- The running Web process was verified to have global enrollment false and exactly one pilot ID, `2501110104`. This active roster entry maps to `stu2501110104` on132 and school email `2501110104@stu.pku.edu.cn`.
- Current roster state was preserved:180 historical records,1 active,179 previously removed. This release did not remove, restore or reassign any student.
- Linux backend/integration:63 tests passed. Local backend package:58 tests passed. Browser:23 checks passed. Server site build and sealed48-page verification passed.
- Public health reports pilot mode and the page references the new pilot application bundle. Public health contains no pilot IDs. No real email or student upload was performed by the deployment probe.
- Existing SMTP configuration and signing secret were preserved; Web alone was restarted, importer remained active. Database schema stays2, with no migration or key installation.
- Service backup completed before switching. Root-private prior web.env backup is recorded in `/tmp/course-keys-pilot-deploy.log`; it must never be copied into a user-readable source directory.
- Local browser evidence: `artifacts/course-keys-browser-pilot/results.json` and `public-smoke.json`. Raw server validation logs stay in the feature worktree under `artifacts/course-keys-server-pilot/`.