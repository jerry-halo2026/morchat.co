---
purpose: "Native Issue GET read guard — detailed task implementation plan"
owner: docs-maintainers
status: current
updated: 2026-11-07
related: []
---
# Native Issue GET read guard — detailed task implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL superpowers:subagent-driven-development (parent controller) / test-driven-development (implementer). This is a detailed appendix of 2026-11-06-round1-continuous, using its existing single-writer ledger, not a new parallel source flow.

**Goal:** Close the independently witnessed two-locator cross-department GetIssue leak while preserving authorized native detail and failing closed for linked content and transaction faults.
**Architecture:** Existing Multica/Auth/Workspace/native Issue only. Exact v1 verified-session gate; typed current ACL; one READ COMMITTED owned attempt; bounded one-hop authorization; guarded same-Tx queries and buffered response after commit. No new authority/cache/global middleware.
**Tech Stack:** Existing Go1.27.3, pgx/sqlc1.31.1, schema617; locked tools/dependencies unchanged.
**Spec:** actual source contract `docs/tasks/contracts/R1-ISSUE-READ-GUARD-r1-test-frozen.json`; exact R2 owner design SHA91e7fbe141bc4b635a9743943d56c4b0f613939753dcefb8c7fa0211a1e1a18b and independent revision review f93ae521f9dedece7acedb958cec2a6b5c0a4e21ad5189efc5a3942c79bd9fb7. The source contract pins both; do not build from old bd2c draft.

## Global constraints / actual baseline
Only the ten source paths in source contract. E existing isolated codex/round1-continuous baseline b94ad8c5f0f467e6ba1bee703144223b660e4547; one product writer /root/guard_impl (gpt-6.1-sol high), Root docs/ignored prep only in parallel. D main, Auth/shared loader/schema/router/Update/List/Project/dependency/lock/global interfaces are immutable.
Real prerequisite RED46b4ed1748d024b304ac1ad648fd455b7a86911581a818f13fa4bfe9dc10a338 is independently accepted: native4run2pass2fail, two exact TA wrong200s, two authorized controls, state invariant. Retain sourcefba7/ELFdf80/result/raw. Used201/202 cannot run again/reset. Source permission is not DB/context/OTP/HTTP/model permission; future actual component and GREEN runtime requires separate owned fixture/profile review.

## Review focus
1. Scope cannot accept foreign q; zero/closed/old-attempt and retained q/row reads must fail; all q derive from one private owned attempt.
2. Authorization before content; duplicate/source one-hop identities, locks and projection; unauthorized mandatory source404, unauthorized duplicate fully omitted, no unplanned source reread.
3. Stable globally ranked metadata/locks; relationship change rolls back whole attempt at most once, no lower-rank late locks or open fallback.
4. All hydration/query/scan/rows/error/cancellation/commit failures discard buffer; no200/body before successful commit and final context check.
5. Component fixtures own independent user/workspace/resources, no native TestMain/dbfx FK coupling or DELETE ACL cleanup; old tests retained and compatibility blockers recorded honestly.

## Task 1 — tests, minimal implementation and local integration
**Files:** NEW service/resource_access.go + resource_access_test.go; NEW handler/issue_access.go + issue_access_test.go; MODIFY handler/issue.go GetIssue only and handler/source_context.go strict GET helper only; NEW pkg/db/queries/enterprise_acl.sql + generated/enterprise_acl.sql.go; MODIFY generated/models.go generator only; MODIFY cmd/server/r1_acl_issue_read_integration_test.go fresh GREEN fixture/baseline only. All paths under server; exact before hashes in source contract.
**Interfaces:** Exact R2 BeginIssueReadAttempt/LocatorQueries/LockIssueReadAccess/Scope.Queries+Data/Attempt.Commit+Rollback and scope-only hydrate/source helper. Existing public endpoints/DTO/native Store unaffected. Keep legacy source-context wrapper/callers behavior intact.

- [ ] Step 1: Write required policy/credential/related-payload/scope-lifetime/Tx/fault tests in the two new test files before product changes. Use existing public surfaces wherever possible; the accepted real existing-surface RED is the fix prerequisite. New undefined-API compile failure is NOT business RED. Record which new tests are still NOT RUN. Do not delete/weaken old tests; actual component execution is separately gated.
- [ ] Step 2: Implement minimal typed ACL query source and service attempt/scope. Member/dept/policy/native identity locks globally ordered, current real facts, ordinary department OR direct read OR project read; private direct read only; no owner/admin/edit-title bypass. Metadata association mismatch => whole rollback/retry max1. Scope private owned tx/q/lifetime, guarded forwarding DBTX/Rows/Row, invalidation before all commit/rollback/error/retry/panic paths, cleanup separate/idempotent.
- [ ] Step 3: Implement only GET actor gate/locator/authorized hydration and strict source projection. Verified SessionJWT+exact NativeV1/nonzero server user/empty agent-task, workspace context selector checked; unauthorized creds403 before Issue query, anonymous original401. Resource invisibility exact native404; infrastructure500. Same owned Tx for full payload/status/duplicate/labels/reactions/attachments/source/comments/authors. Marshal before commit, no body/header200 until commit succeeds and context live. Do not clone handler/pool-backed helpers into the protected path.
- [ ] Step 4: Fixed SQLC staged generation: ignored config clone only changes queries/schema/output path fields; query/schema point at original absolute source directories, output new ignored directory. Original config is immutable. Generate with locked executable in clean env/offline; compare every output first. Only new enterprise_acl.sql.go and models.go may differ; unexpected output diff => STOP/report, no copying/reverting/hand-editing. Copy only the approved two files once closure is proven. This mechanical invocation refinement protects exact ten-path write set, not a new generator framework.
- [ ] Step 5: Amend existing integration fixture ONLY to frozen new301/302 aliases/codes/IDs, old201/202 included in immutable baseline; preserve parent/three children/two locators/assertions/postproof. No DB run or reset in source phase.
- [ ] Step 6: Clean pinned offline LinuxCGO0 compile whole service/handler/cmd-server test packages into three distinct ignored ELF files; gofmt exact changed Go and vet these packages. Save argv/env/stdout/stderr/actual exits/source before+after, generated inventory/diff, no init/TestMain/test binary execution. No cache download/overlay/mirror/test suppression.
- [ ] Step 7: Stop source writer and hand exact diffs/hashes to Root for independent SPEC+QUALITY. Future isolated component/native GREEN runs need separately frozen exact fixture/selector/names/source/ELF/profile and Root run release. Require actual run/pass/noSkip, real lock/barrier/forwarding-pgx fault evidence, no permission mocks or sleeps-only concurrency proof. Fix actual failures, then independent source/evidence review, Root ACK/checkpoint and whitelist local commit. No Issue BUILD or full R1 claim from compilation.

## Required names / later evidence
The fourteen fixture/policy/lifetime/lock/concurrency/credential/shape/hydration/related/scope/Tx/fault parents are explicitly listed in source contract and R2; exact runtime children must bind actual implemented source before execution. Existing native4-event parent/children preserved, GREEN future4pass/noSkip/Go0+converter0. Existing legacy/manual-header/no-policy native regression cases remain unmodified blockers until an explicit fixture amendment; do not relabel their NOT RUN as PASS or remove assertions.

## Stop conditions (affected scope only)
Any source outside ten paths, unapproved generated drift, changed shared semantic/API, fixture/key/defaultDB/network attempt, or unable-to-preserve native source wrapper => STOP that action and report exact evidence; continue unaffected authorized work. No main/push/production/real data/provider key/model fee authority.
