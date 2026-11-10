---
purpose: "SUPABASE-LOGIN independent review"
owner: task-owners
status: current
updated: 2026-11-09
related: []
---
# SUPABASE-LOGIN independent review

- Reviewer: /root/supabase_auth_review; 2026-11-09.
- Baseline: `efdc54aaf3fcc4e3eaee369b980ac054ccc0bb54`, `codex/round1-continuous`, worktree `E:/CodexData/worktrees/r1-02b-claim-pin/morchat.co`.
- Scope: final write set in SUPABASE-LOGIN.md only. Pre-existing issue/source-context/generated-model/R1 changes are not attributed to this feature.
- **Verdict: HOLD — one P2 finding.** No P1 finding. Fix the new login endpoint narrowly and recheck; no new framework or broader Windows gate is required.

## P2 — Prevent cross-site login/session replacement before exchanging proof

**Location:** `E:/CodexData/worktrees/r1-02b-claim-pin/morchat.co/server/internal/handler/supabase_auth.go:36–45` (cookie issuance at 72); route `server/cmd/server/router.go:1578–1579`.

The new public endpoint accepts JSON without validating its request media type or origin. Its single `Decode` also ignores trailing input. It is outside `middleware.Auth`, where native cookie CSRF checks live. Global go-chi/cors does not reject ordinary disallowed-origin POSTs: it omits CORS response headers and still calls the handler. Consequently, an attacker who holds a valid, locally permitted provider account can submit a top-level `text/plain` HTML form from another origin with body `{"access_token":"ATTACKER_VALID_PROOF"}=x\r\n`. The first JSON object is accepted, provider verification succeeds for the attacker, and the endpoint sets the victim browser's native cookies to the attacker's account. This is login CSRF/session replacement, not a forged provider identity. The ordinary authenticated API's CSRF protection does not prevent this unauthenticated login flow.

**Smallest correction:** reject non-JSON requests before verification/DB/cookie work (parse the media type so `application/json; charset=utf-8` works); require a single complete JSON value. An explicit allowed-origin check can additionally defend this cookie-setting endpoint. Do not require a pre-existing authenticated session for initial login.

**Regression acceptance:** reuse the existing external-package handler fixture (no live account/database): cross-origin `text/plain` with a valid synthetic proof and the trailing `=x` suffix must return 4xx with no cookies, no provider call and no transaction; allowed JSON must still log in; trailing second values/garbage must fail. The current focused tests already demonstrate a successful handler call with no Content-Type, but do not test cross-site/form rejection. This finding is source-confirmed; no real browser exploit or real-account login was run.

Evidence: pinned local `github.com/go-chi/cors@v1.2.2/cors.go`, `Handler` invokes `next.ServeHTTP` after `handleActualRequest` even when origin is disallowed; [upstream implementation](https://github.com/go-chi/cors/blob/v1.2.2/cors.go). SameSite governs cookie sending and is not a substitute for protecting the login operation; [cookie specification](https://httpwg.org/http-extensions/draft-ietf-httpbis-rfc6265bis.html).

## Reviewed and not blocked

- Password goes directly from browser to the fixed provider, with no credentials/refresh-token persistence or forwarding to local backend. Public configuration accepts only the fixed HTTPS project and publishable-key prefix. No service-role or remote DDL.
- Backend validates the actual provider `/user` response before using decoded issuer/sub/expiry; bounded request/body, redirects refused, confirmed non-anonymous UUID identity. User metadata does not grant permissions. [Supabase getUser](https://supabase.com/docs/reference/javascript/auth-getuser), [password sign-in](https://supabase.com/docs/reference/javascript/auth-signinwithpassword).
- Stable project+subject mapping and native user creation share a transaction/advisory lock; collisions are refused rather than auto-linked. Schema constrains subject=user ID and user uniqueness. Signup allowlist/invitation logic remains reused; no automatic workspace membership. Migration ledger uses the complete filename stem, so the new 618 name does not overwrite a different 618 entry.
- External native token is capped by provider expiry/native TTL/one hour, retains native provenance and CSRF session ID, cannot slide/refresh, and CLI exchange reuses it. Missing CloudFront cookies are capped. Existing PAT/MAT paths are unchanged by this write set.
- Optional password UI follows the native auth store, workspace cache and routing; unset configuration retains OTP. Real local startup/login/workspace/project/task acceptance remains a subsequent Root/Ethan step, not a mocked-test claim.

## Independent verification

Executed from the worktree's `server` directory with `E:/CodexData/morchat-r1-local/tools/go127/go/bin/go.exe`, existing local caches, `GOPROXY=off`:

```text
go test ./internal/supabaseauth ./internal/auth ./internal/middleware -run 'TestVerifier|TestConfigFailClosed|TestSupabaseLogin|TestExternalSession|TestRenew|TestSession|TestRefreshCloudFront|TestAuth_(Missing|Invalid|Expired|Wrong|Valid|Temporarily|Strips|PATCacheHit|MCN_No)' -count=1
```

**PASS, exit 0:** supabaseauth 2.291s; auth 1.185s; middleware 2.267s. Handler tests import real production handlers from the isolated external test package; provider HTTP and transactions are mocks. No handler/cmd TestMain, real DB rollback/concurrency test, remote request using credentials, migration, restart or business/model call was run. Task-owned tracked diff check also passed. Frontend 200 tests/typechecks and server/migrate compilation are author handoff evidence, not independently rerun here. Reviewed assertions are meaningful boundary tests, not evidence of real business end-to-end completion.

Only this review report was written. No source edits/commit/merge/restart/migration/private compose read.

## Fix1 re-review — APPROVED (2026-11-09)

**Current verdict: APPROVED for Root-controlled local deployment and subsequent user acceptance.** The original P2/HOLD above is retained as history and is now resolved. No remaining P1/P2 finding in this scoped source review; this is not a claim of real-account or business end-to-end acceptance.

Verified exact fixed artifacts:
- `server/internal/handler/supabase_auth.go`: SHA256 `97b46d7b0d80d0f57dd3c3e8c153c6a02f0c8b3da1eb68db55b92a0839a8f318`.
- `server/internal/supabaseauth/login_integration_test.go`: SHA256 `20da88d43403dad47002fdc2c330631f91ee6981320c3f87ddcdb29defab72b1`.

The handler now requires parsed `application/json` (including legitimate charset parameters), and the second decode must return EOF. These checks run before provider verification, local transactions or cookies. This closes the reported simple-form/session-replacement path. An additional explicit Origin gate is not required for this minimum fix: the existing restricted CORS configuration controls browser preflight for non-simple JSON requests. No native-auth redesign is needed.

Reviewed the same real-handler fixture: six negative cases cover malicious-Origin text/plain plus valid proof plus `=x`, URL-encoded/missing/malformed media types, a second JSON value and trailing garbage. Each asserts exact rejection plus no cookies, provider calls or transaction events. Legitimate same-origin JSON with charset and trailing whitespace succeeds. Existing proof/identity/signup/session assertions remain. Author RED evidence is recorded in the task card; independent re-review reran GREEN, not the old vulnerable version.

Independent repeat of the exact focused command above with `GOPROXY=off`: **exit 0**, supabaseauth **2.343s**, auth **2.242s**, middleware **2.546s**. No live provider credentials, remote/local DB writes, migration, restart, source edit or commit was performed by this reviewer. Only this report was appended. Root/Ethan still own deployment and the actual login → workspace → project → task acceptance.
