---
purpose: "SUPABASE-LOGIN — email/password to native Multica session"
owner: task-owners
status: current
updated: 2026-11-09
related: []
---
# SUPABASE-LOGIN — email/password to native Multica session

- Task-ID: SUPABASE-LOGIN; owner/writer: /root/supabase_login_impl; consumer/reviewer: /root + independent reviewer.
- Baseline: codex/round1-continuous, efdc54aaf3fcc4e3eaee369b980ac054ccc0bb54, retained dirty issue/source-context/models and task docs are outside this write set.
- Authorization: Ethan explicitly requested existing orange Supabase email/password accounts logging into the running local Multica. No remote DB writes/migrations, no credentials in chat/log/storage, no service-role, no main/commit/push.
- Fixed provider: https://qcpgqehqjescuwqhnmie.supabase.co (project qcpgqehqjescuwqhnmie). SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY enable the optional adapter; unset/invalid means disabled; native OTP/PAT/MAT remain unchanged.

## Frozen interface and security

1. GET /auth/supabase/config returns enabled + fixed URL + publishable key only. Browser POSTs email/password directly to provider /auth/v1/token?grant_type=password (no package/dependency required), keeps password/access token only transiently, sends only access_token to POST /auth/supabase.
2. Backend calls fixed-project GET /auth/v1/user with publishable key and bearer proof, bounded timeout/body and no redirects. Checks non-anonymous confirmed-email authenticated UUID identity, JWT issuer/sub/exp consistency after server validation. Never trusts browser email/ID or metadata for authorization.
3. Minimal LOCAL migration 618 adds external_auth_identity(project,subject,user_id). Native user keeps Supabase UUID; transactional provisioning refuses existing unbound UUID or email collisions rather than auto-linking. Existing native signup allowlist/invitation and disabled-user checks remain enforced. Identity grants no workspace membership or roles.
4. New native HS256 session preserves native provenance/sid/CSRF cookies but expiry is min(provider exp, native TTL, one hour). An external-provider marker forbids sliding and explicit renewal. CLI token exchange returns the same bounded native token, never a fresh lifetime. No provider refresh token persisted; expiry requires entering credentials again. This is bounded proof-at-login, not instantaneous remote revocation.

## Allowed exact write set

- docs/tasks/SUPABASE-LOGIN.md
- server/internal/supabaseauth/{verifier.go,verifier_test.go}
- server/internal/auth/{external_session.go,external_session_test.go,session.go,cookie.go}
- server/internal/handler/{supabase_auth.go,auth.go,session.go}
- server/cmd/server/router.go
- server/migrations/618_supabase_identity.{up,down}.sql (local native Postgres only)
- packages/core/api/{supabase-password.ts,supabase-password.test.ts,client.ts}
- packages/core/auth/store.ts
- packages/views/auth/{login-page.tsx,login-page.test.tsx}

## TDD / verification plan

- Isolated new verifier package with mock HTTP server: configured endpoint/key, authenticated confirmed user, rejected HTTP/expired/wrong issuer/mismatched sub/anonymous/unconfirmed/malformed UUID/no redirects.
- Auth package tests: bounded issuance, cannot renew external token, native renewal unchanged, valid CSRF and cookies end at bounded expiry.
- Frontend mock fetch tests: direct provider password request; backend receives only access token; generic errors/no storage/credentials forwarding.
- UI tests: optional password form invokes native store then native workspace routing; disabled config retains OTP.
- Use existing Docker Go toolchain; no handler/cmd integration TestMain execution or DB reset. Compile actual backend; run focused existing core/view tests where tools available.
- Root rebuilds/restarts existing local Docker only after review. No real password is available here: human browser login remains NOT RUN until Ethan enters it.

## Evidence

- Before edits: dirty state inspected; no existing auth/config/session changes. Repo authority README/PRD/architecture/discovery/engineering read.
- Official docs consulted: Supabase auth-signinwithpassword, getUser; server verification uses authenticated /user rather than trusting decoded token. Changelog markdown web fetch unsupported; follow-up direct fetch planned.
- RED/GREEN: pending.
- Also allowed server/internal/middleware/session_renewal.go: skip provider sessions before calling renewal, avoiding intentional failure logs. Migrator ExtractVersion strips only .up/.down.sql: ledger is complete stem, so 618_supabase_identity does not replace old unimplemented 618_* Leader reservations; later Leader work must rebase/reverify.

## STOP checkpoint (user asks to clarify the new Goal first)

- Stopped adding code/builds/installs/remote operations immediately on /root instruction. No service restarted; running localhost remains original OTP UI; Supabase login is NOT deployed and UI wiring is NOT implemented.
- Preserved unfinished source changes; no commit/merge/push/rollback. No remote DB migrations/writes, password, real login, business/model calls.
- Commands completed naturally: Docker session 52632 RED exit 1 (undefined verifier); Docker 52991 exit 1 (verifier confirmed happy-path FAIL; external session symbols RED missing); local Go session 60962 completed naturally exit 1.
- Last focused command: Go 1.27 from E:/CodexData/morchat-r1-local/tools/go127/go/bin/go.exe test ./internal/supabaseauth ./internal/auth -run 'TestVerifier|TestConfigFailClosed|TestExternalSession', with existing go-cache/go-mod. Verifier suite FAIL: confirmed happy path rejects fixture (root cause NOT investigated before STOP); rejection/config tests did not report individual failures. Auth focused suite PASS, 1.052s, covering bounded session issuance/no renewal/CSRF cookie expiry/expired proof.
- Frontend RED attempt via environment pnpm fallback unexpectedly began supply-chain/bootstrap, explicitly interrupted (session 19779 exit 1); package.json/pnpm-lock.yaml unchanged. No frontend test result. No backend whole build or handler integration test executed.
- Last code state: new verifier; bounded native auth issuance/cookies/renewal + CLI handoff; new handler/config routes/local transaction mapper; migration files only (not applied); frontend API/helper/store methods only. Shared LoginPage untouched, so feature is unfinished. New Go files have not been gofmt-ed. Do not deploy without fixing verifier happy-path, adding handler/mapping/route/frontend tests, wiring UI, compiling, independent review, then Root-controlled rebuild.
- Exact modified tracked paths: server/internal/auth/session.go, server/internal/auth/cookie.go, server/internal/handler/auth.go, server/internal/handler/session.go, server/internal/middleware/session_renewal.go, server/cmd/server/router.go, packages/core/api/client.ts, packages/core/auth/store.ts.
- Exact added paths: docs/tasks/SUPABASE-LOGIN.md; server/internal/supabaseauth/verifier.go, verifier_test.go; server/internal/auth/external_session.go, external_session_test.go; server/internal/handler/supabase_auth.go; server/migrations/618_supabase_identity.up.sql, 618_supabase_identity.down.sql; packages/core/api/supabase-password.ts, supabase-password.test.ts.
- No tool command remains running from this worker. Existing app and unrelated user processes untouched. Independent source review and user-entered browser login NOT RUN.

## Resumed implementation (Ethan confirmed new Goal)
- Resumed exact preserved state. Root cause confirmed in jwt/v5 parser.go ParseUnverified: the fixture signature literal 'signature' is 9 characters (invalid base64url), and parser decodes all three segments even without validating signature. Changed fixture to valid encoded 'sig' (c2ln), not any provider validation check. Focused Go verifier+auth tests now PASS (1.818s/2.410s).
- Read the direct changelog index: relevant entries cover SDK/CLI/TLS, no endpoint contract change for this REST adapter. Existing migrations use complete stem ledger. Parent remains sole local compose/restart owner.
- Additional allowed writes for localized password labels: packages/views/locales/{en,es,fr,ja,ko,zh-Hans,zh-Hant}/auth.json; and focused native API/store/identity tests if added.

- Actual mapping/handler isolation achieved without production refactor: new server/internal/supabaseauth/login_integration_test.go uses an external test package importing production handler only (no handler TestMain). Real methods run on transaction/HTTP mocks, no DB/network. Additional narrow writes: server/internal/middleware/{cloudfront.go,external_session_test.go}, apps/web/app/(auth)/login/page.test.tsx (mock optional config API).
- CDN missing-cookie refresh RED: TestExternalSessionCloudFrontProofBounded failed because native default TTL exceeded provider proof. Capped only external sessions; focused regression passed. No CloudFront configured in current local demo; this preserves the adapter boundary when enabled.
- Frontend acceptance RED: 2 new UI cases failed, 40 old passed. GREEN: 42 UI passed; core API/auth regressions 151 passed. Typecheck first attempt wrong bin/tsc (pinned alias exposes bin/tsc6); next revealed 4 test-only unchecked mock-call array accesses, corrected with non-null assertions. Final recheck pending.


## Review handoff — implementation paused for independent review

### Final verified results

- Go tool: E:/CodexData/morchat-r1-local/tools/go127/go/bin/go.exe; existing GOCACHE=E:/CodexData/morchat-r1-local/go-cache and GOMODCACHE=E:/CodexData/morchat-r1-local/go-mod.
- Final Go command (server cwd): `go test ./internal/supabaseauth ./internal/auth ./internal/middleware -run 'TestVerifier|TestConfigFailClosed|TestSupabaseLogin|TestExternalSession|TestRenew|TestSession|TestRefreshCloudFront|TestAuth_(Missing|Invalid|Expired|Wrong|Valid|Temporarily|Strips|PATCacheHit|MCN_No)' -count=1` => exit 0; supabaseauth 2.194s, auth 1.143s, middleware 2.389s. Includes disabled-user and maximum lifetime tests. All mock HTTP/transaction identity exchange tests run in supabaseauth_test; no existing handler/cmd integration TestMain runs.
- `go build ./cmd/server ./cmd/migrate` => exit 0. No binary deployed. New/changed Go files gofmt-ed.
- `docker build --target deps -f Dockerfile.web -t morchat-auth-web-deps:local .` => exit 0, existing dependency layers cached; no package/lock changes. Tests run with `docker run --rm --network none`, readonly workspace packages/apps source copied into ephemeral container to retain image dependency links; no host install.
- Core: `node node_modules/vitest/vitest.mjs run api/supabase-password.test.ts auth/store.test.ts api/client.test.ts` => 151/151 PASS (5 new credential-boundary tests); final exit 0. `node node_modules/typescript/bin/tsc6 --noEmit` => exit 0 after fixing test-only mock array observations. (The dependency is pinned alias @typescript/typescript6@6.0.2, not a new compiler.)
- Views: `node node_modules/vitest/vitest.mjs run auth/login-page.test.tsx` => 42/42 PASS, including configured password→native workspace cache/routing and failure clears password. `node node_modules/typescript/bin/tsc6 --noEmit` => exit 0.
- Web shell: `node node_modules/vitest/vitest.mjs run 'app/(auth)/login/page.test.tsx'` => 7/7 PASS; mock gains optional public config method only.
- Task-owned `git diff --check` => exit 0; package.json/pnpm-lock.yaml unchanged.

### Exact final write set (relative to this worktree only)

Modified:
- server/cmd/server/router.go
- server/internal/auth/cookie.go
- server/internal/auth/session.go
- server/internal/handler/auth.go
- server/internal/handler/session.go
- server/internal/middleware/cloudfront.go
- server/internal/middleware/session_renewal.go
- packages/core/api/client.ts
- packages/core/auth/store.ts
- packages/views/auth/login-page.tsx
- packages/views/auth/login-page.test.tsx
- packages/views/locales/en/auth.json
- packages/views/locales/es/auth.json
- packages/views/locales/fr/auth.json
- packages/views/locales/ja/auth.json
- packages/views/locales/ko/auth.json
- packages/views/locales/zh-Hans/auth.json
- packages/views/locales/zh-Hant/auth.json
- apps/web/app/(auth)/login/page.test.tsx

Added:
- docs/tasks/SUPABASE-LOGIN.md
- server/internal/supabaseauth/verifier.go
- server/internal/supabaseauth/verifier_test.go
- server/internal/supabaseauth/login_integration_test.go
- server/internal/auth/external_session.go
- server/internal/auth/external_session_test.go
- server/internal/handler/supabase_auth.go
- server/internal/middleware/external_session_test.go
- server/migrations/618_supabase_identity.up.sql
- server/migrations/618_supabase_identity.down.sql
- packages/core/api/supabase-password.ts
- packages/core/api/supabase-password.test.ts

### Deployment/manual acceptance still NOT RUN

- Source is uncommitted, independent review pending. No backend/web restart, local migration application, remote database changes, real business/model write, or real user login was performed by this worker. The running app remains original source until Root rebuilds.
- Root configures only approved SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in existing private local compose, retaining native LOCAL DATABASE_URL. Root rebuild/restart after independent review applies only local migration. Browser then shows password form from runtime config. Ethan enters password himself; no credential requested or recorded in this task.
- New Supabase-backed local users receive no workspace/project roles automatically. Native onboarding/workspace permissions still decide access. New local user provisioning remains subject to native signup/invitation rules.
- Explicit policy: at most 1h and never beyond provider exp/native TTL, no automatic provider refresh. On expiry the user signs in again. Provider revocation after login is not instantaneous (bounded snapshot proof). External CLI handoff reuses the exact token, never lengthens it. PAT/MAT mechanisms unchanged.
- Rollback must retain data safely: migration down drops the identity mapping only, not native users. Reapplying after dropping bindings intentionally refuses existing unbound UUID/email rows; do not auto-link or delete users to bypass this guard. Keep local backup and resolve binding via a separately reviewed admin recovery if rollback is necessary.
- STOP: no further implementation or service operation until independent review/Root follow-up. No running worker commands remain.

## Fix1 — independent review P2 login CSRF (same narrow endpoint scope)

- Read/verified docs/tasks/SUPABASE-LOGIN-REVIEW.md SHA256 52f5844b3e79878683b6266e42ad6c3b94fa2b6d22561f819521fa6b58bdf4ed. Source confirmed: the public endpoint accepted a browser-simple text/plain body and ignored trailing input, allowing session replacement with an attacker's valid proof. Existing native authenticated CSRF middleware cannot protect an initial public login.
- Exact fix1 write set: server/internal/handler/supabase_auth.go; server/internal/supabaseauth/login_integration_test.go; this task card. No old native OTP/Google/login path, dependency, router, identity mapping, session lifetime, schema, or frontend changed in fix1.
- Production change: mime.ParseMediaType requires application/json (permits charset parameters) before any provider/transaction/cookie work; then Decode must succeed once and second Decode must return io.EOF. Missing/invalid/form media type => 415; trailing second JSON/garbage => 400. No authenticated cookie required for first login. Browser-cross-origin JSON remains subject to existing CORS preflight; no new origin/config framework introduced.
- Real RED command: `go test ./internal/supabaseauth -run 'TestSupabaseLoginRejectsFormAndTrailingJSONBeforeProof|TestSupabaseLoginAllowsSameOriginJSONCharset' -count=1` => exit 1. All six negative subcases incorrectly returned 200, set cookies, called provider, entered transaction; same-origin charset JSON positive passed. New cases: evil-Origin text/plain + valid proof + '=x\r\n', urlencoded form, missing media type, malformed media parameter, trailing second object, trailing '=x' despite JSON media type.
- Existing handler fixtures now supply actual application/json; charset=utf-8 and same-origin Origin headers. All original invalid proof/client identity/signup/collision/bounded refresh assertions remain unchanged. Negative new cases assert exact 4xx and no cookies/provider calls/transaction events; positive additionally allows trailing whitespace (not a second value) and retains native session cookies.
- A first test-file insertion script failed with JS syntax before writing anything and produced '[no tests to run]' (NOT a RED result). A first production compile found ParseMediaType's 3-return tuple; fixed by discarding only params. Both intermediate failures retained here, not reported as passing checks.
- Final GREEN command (server cwd, existing Go/cache, GOPROXY=off): `go test ./internal/supabaseauth ./internal/auth ./internal/middleware -run 'TestVerifier|TestConfigFailClosed|TestSupabaseLogin|TestExternalSession|TestRenew|TestSession|TestRefreshCloudFront|TestAuth_(Missing|Invalid|Expired|Wrong|Valid|Temporarily|Strips|PATCacheHit|MCN_No)' -count=1` => exit 0: supabaseauth 2.280s, auth 1.190s, middleware 2.169s.
- `go build ./cmd/server ./cmd/migrate` => exit 0. All changed Go files gofmt-ed; fix1 diff-check exit 0. No TestMain/real DB/network credentials, migration, server restart, Docker deployment, business/model call, commit or push. Root's earlier images are not this fixed backend until rebuilt.
- STOP for same reviewer's re-review. Real account login/workspace/project/task acceptance remains NOT RUN by this worker. No running commands remain.

## Root deployment and real acceptance (2026-11-09)
Independent review fix1 APPROVED (SUPABASE-LOGIN-REVIEW.md); Root rebuilt current frontend and fixed backend, applied only local618 to morchat-local-demo after localpg_dump backup. RemoteSupabaseDDL/businesswrites0. Runtimeconfigenabledorange; browserpasswordformvisible. Ethan himself completed email/password sign-in and confirmed workspace. Root UI created clearlymarkedlocalproject andTITA-2 manually; reloadreadbackpassed, noBot/model. Evidence LOCAL-FIRST-STAGE-ACCEPTANCE.md. Prior worker NOT RUN snapshots above remain capture-time facts, superseded for deployment only by this Root record.
Precommit Root reran samefocusedGo verifier/auth/middleware -count1 on574ad8: all3PASS, no actualaccount/DB tests. This is stage1 completion only; enterprise goals remain.