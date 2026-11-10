---
purpose: "SUPABASE-LOGIN staged review — APPROVED"
owner: task-owners
status: current
updated: 2026-11-10
related: []
---
# SUPABASE-LOGIN staged review — APPROVED

- Reviewer: /root/supabase_auth_review; 2026-11-09. Independent of Root staging.
- Baseline: efdc54aaf3fcc4e3eaee369b980ac054ccc0bb54, codex/round1-continuous.
- Worktree: E:/CodexData/worktrees/r1-02b-claim-pin/morchat.co.
- **Verdict: APPROVED for the exact 32-path staged snapshot below.** No P1/P2 finding; no code changes since the approved fix1 found. This is local commit review, not authorization to publish the repository/history.

## Actual index checks

1. Read actual `git diff --cached --name-status`, `--stat`, `--numstat`, targeted cached diff and index blobs. The manifest stage-auth.json matches exactly 32/32 staged paths: final task write set 31 plus original source-review report 1; no extras or omissions. Index delta is 1,267 additions / 17 deletions.
2. For each path, `git rev-parse :PATH` equals `git hash-object --path=PATH -- PATH`. This compares the actual index against the working file after existing Git normalization, not a raw CRLF/LF byte comparison. No attributes/config were changed.
3. Fix1 handler and test SHA256 remain respectively `97b46d7b0d80d0f57dd3c3e8c153c6a02f0c8b3da1eb68db55b92a0839a8f318` and `20da88d43403dad47002fdc2c330631f91ee6981320c3f87ddcdb29defab72b1`; approved source-review report remains `d9dcd03b281399000d0a1a155675b0e96b233e010a6f745c973726e3742423e5`. Previously reviewed tracked code blob IDs/diffs match. New provider/helper/migration index content was checked directly. Root's task-card append records deployment and real acceptance, without changing the security contract or silently rewriting historical NOT RUN captures.
4. Reviewed staged additions for credential-shaped literals and private configuration. No actual password, access/refresh token, service-role/secret key, DB connection credential, private-key material or private compose content found. Hits are variables, documentation placeholders, explicit synthetic test passwords/keys, and synthetic JWTs ending in `.c2ln`; the service_role_secret literal is a rejection-test fixture. The fixed project URL/reference is public configuration, not a secret. No broad repository/history/private-data scan was performed.
5. Old R1 user WIP, issue/source-context changes, generated models, main, private compose/runtime configuration, lockfiles and unrelated dirty docs are excluded by the exact index allowlist. The actual acceptance document is read-only supporting evidence and is not among these 32 paths.

**Nonblocking hygiene:** actual `git diff --cached --check` returns 2 solely for `packages/core/api/supabase-password.test.ts:51: new blank line at EOF`. This is not a semantic/security finding; do not report the complete staged diff check as clean. No reviewer edit was made.

Root/Ethan's acceptance record reports password login into the workspace, a clearly marked local test project and task TITA-2, then reload/readback. This reviewer read that evidence and did not repeat the real-account operations. The prior independent fix1 focused tests remain approved; Root's precommit focused rerun is additional reported evidence. No new full-source audit/test harness was requested or run.

## Exact staged blobs (Git object ID + repository-relative path)

These paths are relative only within this machine-verifiable snapshot listing; all belong to the absolute worktree above.

```text
308a2a6ffbdc83fb299f1742734872eb85ee8bea apps/web/app/(auth)/login/page.test.tsx
e383634a9edc972d3edf73f1240d19840f67a67b docs/tasks/SUPABASE-LOGIN-REVIEW.md
6727a7e789012256721a4fd6d9b460aa28978bad docs/tasks/SUPABASE-LOGIN.md
9e80592ed18145f45a7aaa40c8fd3e13d66d66f6 packages/core/api/client.ts
b81e58da431c0313d106ed90ac697eea5f967fb3 packages/core/api/supabase-password.test.ts
3f916fccc4b8a42cec94d7deef32e463d00dfa13 packages/core/api/supabase-password.ts
436688103e7a941c69cff40d87aa8a269854d14c packages/core/auth/store.ts
9386495e609c19fdf31c417a186bd954fecc30e0 packages/views/auth/login-page.test.tsx
5fab9765bf7be09b27f4ec8ee08b4562e193ad02 packages/views/auth/login-page.tsx
d8485ac4983ce30c3d555f79e3ea6c65fef4c840 packages/views/locales/en/auth.json
b1588260147cd04187ed7194cd81a288312fa4ec packages/views/locales/es/auth.json
2e7015e74948f71edcd5e75a827a8e4cb77926cb packages/views/locales/fr/auth.json
21b32c428b36047df4a74f352d2a5fcac9c51c19 packages/views/locales/ja/auth.json
e732043b96257449453a7515bb963e68611025fc packages/views/locales/ko/auth.json
8cbc51ee03e4a64d8585c38c9ccfa7ec73ac5036 packages/views/locales/zh-Hans/auth.json
6535a06e0366452543e3bbe411f8271fe129c453 packages/views/locales/zh-Hant/auth.json
9798a7c0f2e142728033672880d21312bd573cdf server/cmd/server/router.go
31e9a90ddd7fed0763a82723b067ec0873a09c64 server/internal/auth/cookie.go
0da7a088e57006f61c1eb23444cdd3557634b009 server/internal/auth/external_session_test.go
21aaf0ea02cf3b1277367825e31ed0a5b53f1ec3 server/internal/auth/external_session.go
7ea76de4d814884ba6b849598784b8c3776ed5c5 server/internal/auth/session.go
ba3f7a864b62eb226725e61a465b4aecc5a51b38 server/internal/handler/auth.go
2049b2f2ac1b2ffdcd9d9128d195aeada4cfb336 server/internal/handler/session.go
e0d8ae1d6ab1005a2154bf0bb11464ceb4f2154d server/internal/handler/supabase_auth.go
676607004ac721f52f24358c8be470c5bd1a7c35 server/internal/middleware/cloudfront.go
9a78b8a08ba80e1b33039ae307bc82f69efaaf0f server/internal/middleware/external_session_test.go
9b8ab95a6560d86b7834fc69e7bc70e45ff7ebab server/internal/middleware/session_renewal.go
12b2e602cfbd7c2be43710ad40f09df6db3dce6c server/internal/supabaseauth/login_integration_test.go
440d8e92965ab8e6ad271dc7ca34a61478d3e598 server/internal/supabaseauth/verifier_test.go
4705565945b041bfce690804ecca1fc4dba4488a server/internal/supabaseauth/verifier.go
0cedb3c46e9c8c42a0bc118048d1f74956c41f06 server/migrations/618_supabase_identity.down.sql
cf20639777aceb9133c625c38036ba7205e941f8 server/migrations/618_supabase_identity.up.sql
```

Only this NEW review report was written. No staging, source edit, commit, migration, restart, remote operation or private compose read occurred. This new report is deliberately not added to the approved 32-path index by the reviewer. STOP.
