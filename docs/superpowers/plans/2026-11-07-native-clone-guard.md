---
purpose: "R1-01D Native Router Clone Implementation Plan"
owner: docs-maintainers
status: current
updated: 2026-11-10
related: []
---
# R1-01D Native Router Clone Implementation Plan

> For agentic workers: use superpowers:executing-plans inline under the assigned owner, no new subagent/worktree. Proposed future checklist, NOT execution permission.

**Goal:** Route only the existing Issue-read parent to its already-isolated router clone, preserving GET behavior and four-event acceptance.
**Architecture:** One existing _test.go; one call replacement; two pure predicates; one actual SQL/runtime helper; two pure table parents. No SQL mocks/shared helper changes/new package.
**Tech:** Existing Go/pgx/httptest, standard net/net/url/os imports only.
**Spec:** E:\CodexData\incidents\morchat-20261106T233131\native-clone-r1-owner-spec.md.

## Global constraints

- Only future editable file E:\CodexData\worktrees\r1-02b-claim-pin\morchat.co\server\cmd\server\r1_acl_issue_read_integration_test.go; beforehash/protected map in owner-ack.json; all other source unchanged.
- ONLY r1_guard_router_r2_20261107 role/database, numeric127.0.0.1:5432, query sslmode=disable/connect_timeout=5. No canonical/sharedhelper/TestMain/Auth/schema/grants/routes changes.
- Original parent/3children/4events/2locators/OTP301302/all assertions and fixture flow preserved except one helper call. New infrastructure selector separately freezes 37events, not native acceptance.
- Original TF122ecf immutable. Current source CLOSED; compile/runtime/key/fixture permissions NONE. All later commands E cwd/absolute IO, exact-scope elevation; no D/main/managedworktree/global settings/commit/push.

## Review focus

1. Query parameters override pgx authority: test every query-override negative, enforce exact two-key allowlist.
2. Three equally wrong names are not identity: AllSameNonRouter rejects; actual SQL supplies all3 strings.
3. Native TestMain precedes even pure tests: separate clone bootstrap/context/prepost release; missing-DB exit0/noevents never pass.
4. Deny-all passes every negative: literal scheme and exact identity positive controls required.
5. Inner snapshots cannot prove teardown: external post-TestMain audit is mandatory, including failure.

## Task 1 — register/pin, still no source

- [ ] Root freezes a NEW test-infrastructure amendment containing exact spec/plan/ACK hashes, actual HEAD/beforehash/protected file+Git maps, unchanged native4 selector, separate pure37 inventory, clone/role/URL and original immutable TF reference. Root consumer explicitly ACKs boundaries; guard_review independently signs amendment and failure classification. No edits to old TF to simulate prior approval.
- [ ] Recheck actual pins and final DSH writer STOP. Any drift blocks affected scope for review, not expected-hash rewriting. Root explicitly releases only tests-first source; compile/ELF/key/runtime remain separate.

## Task 2 — tests first and fail-closed scaffolding

**Files:** Only the existing absolute _test.go above, for both modify and tests.
**Consumes:** Literal cases/booleans and exact names from spec.
**Produces:** TestR1IssueReadRouterCloneURLBinding, TestR1IssueReadRouterCloneSQLIdentity, then two pure predicate signatures from spec.

- [ ] Append table tests BEFORE helper implementations; hand-fixed want values, no passwords/SQL mocks, exact frozen names, no t.Parallel. Assertion shape: got := r1IssueReadRouterCloneURLAllowed(tc.raw, tc.bypass); got != tc.want => t.Errorf("router clone URL binding accepted=%t; want=%t", got, tc.want). Identity analogous. Do not print raw/identities. Leave original parent/call untouched for this snapshot.
- [ ] If Root separately releases an offline compile now, first expected failure is undefined missing-helper COMPILE/SETUP ERROR, not executed test or Guard business RED. With no compile release, label EXPECTED_NOTRUN and preserve source hash; do not invent observed RED.
- [ ] Under the NEW amendment's minimum-scaffolding allowance, append both pure predicates with return false ONLY. Do not wire parent or permissive runtime helper. This is safely fail-closed and intentionally fails all3 positive rows; passing negatives at this stage alone prove nothing.
- [ ] Separate explicit Root release is required for actual pure tests. Shortest one-file route is normal cmd/server package/ELF with unchanged native TestMain on the reviewed clone; do NOT pretend go test ./cmd/server is DB-free. Do not bypass TestMain with copied packages/overlays/new framework. Pure bodies are side-effect-free but TestMain bootstrap/server/unused JWT still happen and require fresh context/prepost audit. No OTP301302 because original native parent is excluded.
- [ ] Actual assertion RED should be RouterPostgres, RouterPostgresql and ExactRouterIdentity against deny-all scaffolding (and failed parents). Retain raw-first exact events/exits; classify SAFETY-INFRASTRUCTURE ASSERTION RED ONLY. Missing events, bootstrap/DB/permission/timeout/noevents-exit0 are SETUP_BLOCKED, not infrastructure assertion RED or Guard business RED. Independent actual-evidence acceptance and fresh Root continuation before next implementation; no auto-rerun.

## Task 3 — minimum local implementation

**Interfaces:** r1IssueReadRouterCloneURLAllowed(raw, devVerificationCode string) bool; r1IssueReadRouterCloneIdentityAllowed(database, currentUser, sessionUser string) bool; r1IssueReadRequireRouterCloneTarget(t *testing.T, ctx context.Context).

- [ ] Implement predicates literally from spec: exact clone/user/authority/path/schemes/bypass/two-key query allowlist; all3 SQL identities equal router. No canonical/regex/prefix fallback; no env mutation.
- [ ] Append runtime helper: actual getenv, pure validation, nonnil pool/server, ONE real SELECT current_database(), current_user, session_user Scan, identity predicate, actual numeric-loopback testServer.URL check. Error/Fatal fail-closed and values withheld. No mock SQL/current_database/role switching.
- [ ] Replace exactly ONE original helper call. No production change or new business-RED prerequisite is necessary for this test-only infrastructure adaptation. Preserve original parent except that call and all old helper bodies/constants/children/assertions.
- [ ] Separately authorized gofmt only this file, inspect any unrelated formatting delta. Stop writer and hand full diff/protected machine hashes to independent guard_review for SPEC+QUALITY; no borrowed compiler/runtime result.

## Task 4 — fresh same-candidate compile and separately released proof

- [ ] Root binds final DSH stop/candidate and separately releases NEW clean offline compilation for ALL3 Guard packages using frozen Go/tool/env-clear conventions and fresh distinct external outputs, no credentials. Argv shape: Go -C E:\CodexData\worktrees\r1-02b-claim-pin\morchat.co\server test -c -o separately-bound-absolute-output ./internal/service; repeat exact handler/cmd/server packages. These are planned shapes, not executed commands/permission. Save actual source/dependency/argv/env-key/raw/exits/ELF/buildinfo/quality bindings. Old3ELF remain historical, compile0 is not behavior green.
- [ ] On a fresh separately reviewed clone-bound process/context/audit, final pure selector ^(TestR1IssueReadRouterCloneURLBinding|TestR1IssueReadRouterCloneSQLIdentity)$ must yield37run37pass0skip/Go0/converter0/package-pass with no extras/missing, native outer cleanup proof. Use existing -test.v=test2json/-test.count=1/-test.parallel=1/-test.timeout=180s shape. Pure green does not prove actual runtime SQL identities or GET authorization.
- [ ] Independently review actual source/pure evidence; bind same final candidate/source/threeELFs/suite roles/clones/private fresh keys/context/fixtures/raw-first executor/audits. Root separately releases key generation/private credential load/audits/each actual suite process; this plan creates none. Service/handler/native must share that final source candidate, not obsolete ELF evidence.
- [ ] Original native args unchanged: -test.v=test2json -test.count=1 -test.parallel=1 -test.timeout=180s -test.run '^(TestR1ACLNM02IssueReadCrossDepartment)$'. Require4run4pass0skip/Go0/converter0 plus every unchanged payload/status/OTP/delta/post-failure proof and outer post-TestMain old-row/bootstrap/transaction/session audit. Do NOT select other canonical cards or entire package/project suite without another explicit runtime amendment; report broader regressions NOTRUN, not full-suite green.
- [ ] Any unknown exit/timeout/drain/cleanup/fixture failure: raw first, STOP, no retry/reset/reseed/GRANT/trigger changes; separately authorized diagnostic readback only. Independent source/runtime review then Root decides registration/integration. No automatic commit, BUILD/fullGuard/Auth/R1/Windows/model/Goal claim.

## Present handoff

All above checkboxes are future proposed work. Author used writing-plans/TDD and actual-source investigation for this plan only. Current source/tests/compile/runtime/key results NOTRUN; writer STOP. Only three incident artifacts authored, machine pins rechecked. Await Root consumer ACK + independent guard_review + new exact TF amendment + explicit test-only release, not more unapproved preparation execution.
