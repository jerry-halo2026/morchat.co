---
purpose: "R1-01D-NATIVE-CLONE r1 owner specification"
owner: task-owners
status: current
updated: 2026-11-10
related: []
---
# R1-01D-NATIVE-CLONE r1 owner specification

PROPOSED / NOT TEST-FROZEN / SOURCE CLOSED / all functional results NOTRUN.
Owner /root/native_clone_impl; actualConfiguredRoute gpt-6.1-sol, reasoning_effort high, fork_turns none, confirmed by Root's actual spawn-tool record. No hidden backend claim. Root consumer and independent guard_review signatures PENDING. Date 2026-11-07.

## Decision and actual source call graph

Adapt only the Issue-read test, not the shared canonical safety helper. Its current canonical-only guard deterministically rejects the existing router clone. Do not run it merely to rediscover this setup failure; never use canonical instead.

Read actual source: r1ACLRequireSyntheticTarget is defined in server/cmd/server/r1_acl_nm02_integration_test.go:76-111 and has exactly THREE consumers: TestR1ACLNM02Schema (:43); TestR1ACLCliMintDatabaseBoundary in r1_acl_cli_token_origin_integration_test.go:38; TestR1ACLNM02IssueReadCrossDepartment in r1_acl_issue_read_integration_test.go:42. Only the third call changes. Shared helper and both other consumers remain byte-identical with their own canonical semantics; no execution release for those cards.

The complete Issue-read file was read. Actual flow: parent -> target guard -> r1IssueReadRequireFixture -> r1IssueReadSnapshot(false) -> deferred immutable/OTP proof -> r1IssueReadSeedOTP collision-checked transaction -> OTP immutable reads -> r1IssueReadRequest POST verify-code -> auth.ParseSessionToken -> GET /api/me -> snapshot(true) -> native missing404/anonymous401 controls -> original three children, both locators -> deferred GET zero-delta and retained-state proofs. Existing helper definitions and assertions do not change.

Native TestMain runs BEFORE m.Run: pgxpool.New/Ping -> cleanupIntegrationTestFixture -> INSERT user/workspace/member/runtime/agent -> NewRouter -> httptest.NewServer -> generateTestJWT -> m.Run -> cleanup/server close/pool close. Missing DB can os.Exit(0) before any test event. New guard is NOT pre-TestMain protection. Outer preflight must bind exact clone/role/URL/fresh private context before launch; outer post-TestMain audit remains mandatory after failure. Rejecting before OTP does not mean no DB writes occurred.

Actual router.go NewRouter delegates to NewRouterWithOptions. Public verify-code uses h.VerifyCode; authenticated /api/me uses h.GetMe; Issue route uses h.GetIssue. Read relevant route wiring, VerifyCode/GetMe, session signature parser and JWT-secret resolution: OTP loads real latest code, marks used, finds retained actor, issues native session; Me reloads native user. No fabricated actor/session/context or consumption of TestMain owner JWT. These product paths stay untouched.

## Exact future one-file surface

Only future editable file: E:\CodexData\worktrees\r1-02b-claim-pin\morchat.co\server\cmd\server\r1_acl_issue_read_integration_test.go.
Beforehash and all protected raw/Git source pins are machine-derived in native-clone-r1-owner-ack.json. Do not hand-copy or normalize EOL hashes.

Allowed: one call replacement r1ACLRequireSyntheticTarget(t, ctx) -> r1IssueReadRequireRouterCloneTarget(t, ctx), append three helpers plus two pure table-driven parents, needed standard imports net/net/url/os. No new source file/package/dependency/framework/state machine. Preserve existing parent body byte-for-byte except that call; preserve all existing helpers/constants/children/assertions, fixture process and OTP301302. No other Guard10 source, TestMain, shared helper, Auth/schema/grants/routes/config writes.

Proposed signatures, all in this same _test.go:
- r1IssueReadRouterCloneURLAllowed(raw, devVerificationCode string) bool: pure, no env/pool/HTTP/SQL.
- r1IssueReadRouterCloneIdentityAllowed(database, currentUser, sessionUser string) bool: pure strings, NOT mocked SQL or evidence of a real connection.
- r1IssueReadRequireRouterCloneTarget(t *testing.T, ctx context.Context): actual env/native globals, real SQL, Fatal diagnostics withholding values.

URL predicate allows ONLY hierarchical postgres or postgresql URL, exact unescaped path /r1_guard_router_r2_20261107 (EscapedPath equal too), nonnil userinfo with exact case-sensitive username r1_guard_router_r2_20261107, authority exactly 127.0.0.1:5432, no opaque/fragment and devVerificationCode exactly empty. No trim of nonempty bypass; no canonical/prefix/regex/accept-any-name/hostname/IPv6/default-port fallback. Password never printed; pure fixtures have no real password.

Parsed query must contain exactly two single-valued keys sslmode=disable and connect_timeout=5, matching the pinned guard-runtime-r1-capsule.DRAFT.ps1:26 builder. Reject duplicates/unknown keys including host/user/dbname/port/options that could override pgx authority. Order may vary, values may not. This explicit narrow safety addition requires new amendment signoff; it does not alter the original shared helper.

Runtime helper retains every applicable old safety check: explicit allowed scheme and exact target, absent dev bypass, initialized nonnil native pool/server, real SQL identity and actual numeric-loopback testServer.URL (url.Parse + net.ParseIP/IsLoopback). One actual testPool.QueryRow(ctx, "SELECT current_database(), current_user, session_user").Scan checks all THREE equal r1_guard_router_r2_20261107, not just equal each other. Any SQL error/mismatch fails closed. No fake current_database/SQL answers, SET ROLE, canonical URL, rename/recreate/new database or new PG server. Outer binding remains necessary since TestMain precedes guard.

## Exact separate infrastructure inventory

Parents: TestR1IssueReadRouterCloneURLBinding; TestR1IssueReadRouterCloneSQLIdentity.
Selector: ^(TestR1IssueReadRouterCloneURLBinding|TestR1IssueReadRouterCloneSQLIdentity)$
37 test-name events = 2 parents + 27 URL children + 8 identity children, exactly one run/terminal each, no extra/missing/skip, no t.Parallel. Full names are parent + slash + each literal child below and recorded in machine ACK.

URL children (27): RouterPostgres, RouterPostgresql, CanonicalDatabase, ServiceClone, HandlerClone, WrongDatabase, WrongRole, MissingUser, Hostname, IPv6Loopback, WrongPort, MissingPort, NonPostgres, EmptyURL, MalformedURL, DevBypass, QueryHostOverride, QueryUserOverride, QueryDatabaseOverride, QueryPortOverride, QueryOptions, WrongConnectTimeout, DuplicateQueryKey, Fragment, EscapedDatabasePath, ExtraPath, MissingSSLMode.
Identity children (8): ExactRouterIdentity, CanonicalDatabase, ServiceDatabase, HandlerDatabase, WrongCurrentUser, WrongSessionUser, EmptyIdentity, AllSameNonRouter.

Hand-fixed expectations, no mirrored validator: base postgres://r1_guard_router_r2_20261107@127.0.0.1:5432/r1_guard_router_r2_20261107?sslmode=disable&connect_timeout=5; RouterPostgres and RouterPostgresql (only scheme changed) expect true. All other URL rows expect false, changing only named dimension: canonical path /morchat_r1_nm; service/handler paths /r1_guard_service_r2_20261107 and /r1_guard_handler_r2_20261107; WrongDatabase /wrong_database; WrongRole wrong_role; MissingUser no userinfo; Hostname localhost; IPv6 [::1]; port5433/missing; NonPostgres https; EmptyURL empty; MalformedURL percent character; bypass "000000"; query additions host=127.0.0.2, user=wrong_role, dbname=morchat_r1_nm, port=5433, options=-crole=wrong_role; timeout6; duplicate sslmode; fragment x; percent-encoded first r in path; extra /extra path; removed sslmode key.

Identity ExactRouterIdentity uses three literal router names, true. All other rows false: canonical/service/handler change database alone; wrong-current/session change only named string to wrong_role; empty all3; AllSameNonRouter all3 morchat_r1_nm. Positive controls forbid deny-all. Pure negatives do not claim actual queries on wrong targets.

## Original four-event acceptance remains unchanged

Selector ^(TestR1ACLNM02IssueReadCrossDepartment)$, NEVER widened with pure parents.
Exact names: TestR1ACLNM02IssueReadCrossDepartment and its children SameDepartmentRead, ExplicitIssueReadGrant, UnsharedCrossDepartment.
Requires actual4run4pass0skip/Go0/converter0/package-pass, exact positive payloads, both denied locators full native404, missing/anonymous controls, retained old10OTP/PAT/business/641 ledger, exact fresh301302 used/immutable proof and GET zero-delta plus outer post-TestMain cleanup/audit. Pure/setup/compile failures are not Guard business RED. Accepted historical real RED remains historical with LOST raw, never rewritten. Unrun old CRUD/other outlets remain NOTRUN.

## Registration, proof and stop boundary

Owner ACK is this PROPOSAL only. Root consumer must explicitly ACK clone-only one-file boundary, old shared helper/two consumers, all original four-event assertions, separate pure inventory, fixture/Auth/schema/routes/grants limits. Independent guard_review must approve exact NEW TF amendment/spec/plan/ACK; original TF122ecf bytes stay immutable. Only later explicit Root test-only release opens source. Go/SQL/Docker/ELF/TestMain/HTTP/key/fixture permissions currently NOTRELEASED.

Role validation33calls0/replayed grants, result5c1ff77.../actual-review054d20... is infrastructure-only. Manifest fixes router role=database r1_guard_router_r2_20261107 and separate service/handler clones. Derived allowlist211 system relations/2073 columns/17 pg_settings columns is not a universal capability audit; PUBLIC TEMP/defaults and permitted session-setting changes remain limitations. No credential/env values read. DSH observed f48eb3a4... is not a frozen Guard ELF binding: final writer stop, fresh3ELF same-candidate compile/source review, then separate runtime/key/context/audit release are mandatory.

Actual HEADd683932b1aeb3ff536c7e6672ec808c52f8535e6 / codex/round1-continuous at E sourceRoot above; machine ACK records file SHA256 and binary actual HEAD-blob SHA256/object ID with null when absent, differences explicit, never false-equal. Only three new native-clone-r1-owner incident artifacts are authored; no source/repo-doc/index/main/managed-worktree/global-config modification or runtime operation. Initial default exec supplied E cwd but surfaced C:\ with E Set-Location denied; absolute E reads only, then scoped elevation corrected cwd. No relative file IO or D target action. One read/hash attempt parser error and one overlong artifact command failed before effects; neither is a test result. STOP pending Root/independent approval.
