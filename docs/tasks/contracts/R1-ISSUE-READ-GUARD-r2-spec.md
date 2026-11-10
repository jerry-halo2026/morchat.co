---
purpose: "R1-ISSUE-READ-GUARD-r1 — owner source-contract proposal r2"
owner: task-owners
status: draft
updated: 2026-11-07
related: []
---
# R1-ISSUE-READ-GUARD-r1 — owner source-contract proposal r2

2026-11-07 / DRAFT-r2, design fix round 1/5; **not TEST-FROZEN, implementation, runtime or BUILD permission**.
Owner `/root/issue_guard_design`, actual configured model `gpt-6-astra`, high. Consumer `/root`; independent reviewer not this owner. Ethan has delegated engineering fields to those roles; no product-foundation decision is reopened.

## 1. Decision and observed baseline

Use a GET-only adapter, real typed SQL and one real READ COMMITTED transaction through authorization, the complete authorized native payload, serialization and commit. Do not change the shared `loadIssueForUser`, UpdateIssue, Project/list/comment routes, Auth or schema. Do not create another task/policy authority. A three-file ceiling is not a correctness requirement.

Inspected only `E:/CodexData/worktrees/morchat-round1/morchat.co`, branch `codex/round1-continuous`, original inspection HEAD `c6a21f9832a7ca6c7455e1b7bfea8b35284028ca`; r2 final shell check observed evidence-doc HEAD `b94ad8c5f0f467e6ba1bee703144223b660e4547`, clean tracked status and unchanged bound product hashes. Root must rebind actual HEAD before source TF. All shell reads explicitly used that E root and require_escalated. No D-main access, compile, generate, DB, HTTP, Docker, secret or model CLI operation performed. This round writes only this successor and the requested fix report; original bd2c bytes remain unchanged. Root owns the concurrent R45/R46 evidence changes, not this owner.

Authority read: root AGENTS; docs README, PRD, ARCHITECTURE, DISCOVERY/ENGINEERING BASELINE, ROUND1-DELIVERY, R1-01-collaboration, R1-01C-issue-read; ACL r3/schema/fixture/TF; AUTH-FOUNDATION TF; current ISSUE-READ-RED source TF. Their wider NOT RUN headers do not erase the separately accepted schema/Auth evidence. Latest Root handoff and R46 actual record report accepted real RED: result SHA256 `46b4ed1748d024b304ac1ad648fd455b7a86911581a818f13fa4bfe9dc10a338`, 4run2pass2fail0skip, both negative locators actual wrong200 and both positive controls. Owner rehashed that result file but did not execute/re-review runtime. OTP201/202 are consumed; cumulative retained OTP count10 per Root, never reset/replay. Source release now requires r2 independent acceptance, Root actual-HEAD binding and a new signed source TF; not another RED run.

Facts changing the design:
- `handler/issue.go:GetIssue` currently calls Workspace-only `loadIssueForUser`, then several pool-backed helpers. Accepted RED records A2/T-A200, B1/T-only200 and B1/T-A both locators wrong200; this owner did not execute those requests.
- `fillStatusCategory` also calls `fillDuplicateOf`, reading another Issue's title/status/identifier. `issueSourceContextDetail` returns a captured source Issue/comment thread and reads current source Issue, anchor/comments, attachments and authors. Moving Queries to a Tx is insufficient permission control.
- Parent consumer explicitly ACKed one-hop payload authorization, bounded to this GET, with no other endpoint or general graph framework. This proposal makes that amendment precise below.
- `TxStarter` has Begin, not BeginTx. `Handler` also holds DB, ReadSelector, services and IssueStatusCatalog; copying Handler and changing just Queries is not an acceptable containment proof.

Rejected alternatives: (a) pre-check then original GET leaks race/pool reads; (b) Workspace fallback or fixture-ID branches invent authority; (c) full global permission middleware changes unapproved routes; (d) silently dropping source_context yet returning200 breaks its existing execution-contract semantics. Chosen: explicit GET read scope and bounded one-hop authorization.

## 2. Credential gate, routing and errors

First operation in GetIssue before locator parsing/query/TX: `middleware.VerifiedIdentityFromContext`. Require `Kind == VerifiedCredentialSessionJWT`, `SessionProvenance == VerifiedSessionProvenanceNativeV1`, valid nonzero verified UserID, and empty AgentID/TaskID. Session WorkspaceID is normally empty: **do not require it to be populated or manufacture it from a header**. If a nonempty verified scope exists, it must agree with the middleware workspace context.

Authenticated legacy/unmarked/Unknown/PAT/TaskToken/CloudNodePAT, absent verified view, or raw-header-only direct handler requests receive generic403. Auth still produces anonymous401 before the route. Resolve workspace only from `middleware.WorkspaceIDFromContext` for this router-protected GET; context is a selector, not authority. Missing/malformed context fails closed, no pool fallback. Parse verified user and workspace, then freshly select+lock their native member row in the actual transaction; never trust cached member/role as the grant. Owner/admin confers no exception. The preexisting Auth/workspace middleware may already query auth/member tables; the guarantee is **no Issue locator or payload query/GET transaction before this gate**, not zero router SQL.

Use a new GET locator parser preserving `splitIdentifier` and native case-insensitive prefix matching with `issuePrefixForWorkspace`. UUID and identifier both resolve metadata within the Tx. No fallback from a failed identifier DB query to UUID/404. Only pgx.ErrNoRows / policy denial / stable unclassified association become `writeError(404, "issue not found")`; compare exact body, Content-Type and newline to missing UUID/identifier controls. Unknown/malformed resource locator is the same404 after the credential gate. DB/scan/query/begin/commit/marshal failures are500 with no IDs/content; cancellation never200. Do not collapse infrastructure failure into404 or expose policy409.

## 3. Typed service and GET orchestration contract

Proposed APIs (not existing symbols). r2 removes all exterior q/scope and tx/scope pairing from the protected GET chain:

```go
// service/resource_access.go — one narrow GET attempt, not a generic TX framework.
type IssueReadActor struct { WorkspaceID, UserID pgtype.UUID }
type IssueReadAttempt struct { /* private tx, guarded q, shared lifetime */ }
type IssueReadScope struct { /* private *attemptState + bound authorization data */ }
func BeginIssueReadAttempt(ctx context.Context,
    begin func(context.Context) (pgx.Tx, error)) (*IssueReadAttempt, error)
func (a *IssueReadAttempt) LocatorQueries(ctx context.Context) (*db.Queries, error)
func (a *IssueReadAttempt) LockIssueReadAccess(ctx context.Context,
    actor IssueReadActor, rootID pgtype.UUID) (IssueReadScope, error)
func (s IssueReadScope) Queries(ctx context.Context) (*db.Queries, error)
func (s IssueReadScope) Data(ctx context.Context) (IssueReadData, error)
func (a *IssueReadAttempt) Commit(ctx context.Context) error
func (a *IssueReadAttempt) Rollback(ctx context.Context) error
// IssueReadData copies authorized root/optional duplicate/pinned source metadata;
// no q, tx, authority constructor, commit method or client token.

// handler/issue_access.go
func issueReadActorFromRequest(r *http.Request) (service.IssueReadActor, error)
func loadIssueReadLocator(ctx context.Context, attempt *service.IssueReadAttempt,
    workspaceID pgtype.UUID, rawID string) (pgtype.UUID, error)
func (h *Handler) readIssueDetail(ctx context.Context, actor service.IssueReadActor,
    locator string, mode attachmentURLMode) ([]byte, error)
func hydrateIssueReadDetail(ctx context.Context, scope service.IssueReadScope,
    renderAttachment func(db.Attachment) AttachmentResponse) (IssueResponse, error)
// handler/source_context.go — strict GET also has no external q/rows pairing.
func issueSourceContextDetailForRead(ctx context.Context,
    scope service.IssueReadScope) (*sourceContextDetailResponse, error)
```

Only BeginIssueReadAttempt accepts existing `h.TxStarter.Begin`, immediately takes private ownership of the returned tx, executes fixed `SET TRANSACTION ISOLATION LEVEL READ COMMITTED` before any data query, then creates one fresh pointer-identity lifetime. No constructor accepts foreign q/stamp, no public raw Tx accessor, no raw Commit/Rollback in handler. SET is transaction control, not inline policy SQL; failure invalidates+rolls back before returning no attempt. Keep read/write transaction because FOR SHARE requires it. All typed SQL derives once from that owned tx through the private guarded DBTX; never h.Queries/pool.

Scope private state binds q/tx + shared lifetime + authorized identities. `Queries` and `Data` reject zero/nil/unbound scope, inactive attempt and cancelled context before returning any query/data (`ErrIssueReadScopeClosed`/context error => internal500 or cancelled/no response, never404/200). `LocatorQueries` returns the same guarded q only while live, solely for locator work. Hydrator and strict source helper take ONLY scope; lower-level source service helpers receive q only after it was obtained from that scope. Every copied scope shares the SAME lifetime pointer. Retry creates a new pointer, never rebinds old scopes. This is not a serialized stamp, grant epoch/cache or generic permission-token framework.

To prevent retained q escaping lifetime, a private GET-only DBTX forwarding wrapper in resource_access.go checks shared active state before every Exec/Query/QueryRow; returned QueryRow.Scan and Rows.Next/Scan/Values/Err also reject use after close/cancellation. Rows.Close always forwards cleanup. Thus even a retained `*db.Queries` cannot read a pool or a closed/retried attempt; wrapper supplies no permission answers, only forwards real typed SQL while live. No concurrent hydrate goroutines; consume/close rows before serialization/commit. Query/scan trace tests must prove this, not rely on a comment.

`readIssueDetail` owns max TWO whole attempts, installs deferred Attempt.Rollback immediately after successful construction. All exit paths:
- Gate failure: no attempt. Begin failure: no q/scope. SET failure: inactive before bounded rollback, no usable attempt returned.
- Locator/policy/grant/hydrate/scan/marshal failure, early return or pre-commit cancellation: inactive BEFORE rollback, discard buffer. Deferred rollback also handles panic; no response was written.
- Association retry: invalidate and finish old rollback before a new BeginIssueReadAttempt; rollback error stops retry500, cancellation never retries. Old scope/q remain permanently closed.
- Commit: mark inactive BEFORE underlying tx.Commit, including a blocked commit. Pre-existing cancellation performs bounded rollback instead. Commit error/ambiguous result never reactivates/retries; discard buffer and attempt bounded rollback cleanup, preserve primary and cleanup failures internally.
- Successful commit: remains inactive permanently; only pre-marshaled bytes may be written after final context check, no further scope/q/sign/hydrate. Deferred cleanup is idempotent after confirmed commit.
- Rollback: mark inactive BEFORE underlying tx.Rollback even when rollback fails/cancels. Inactive and cleanup-complete are separate states: cleanup cannot be skipped merely because live=false. Repeated cleanup recognizes pgx.ErrTxClosed but cannot revive reads. Cleanup uses fresh bounded context; failed cleanup is never permission to continue.

Structural identity evidence remains native member/user/workspace; root/related Issue and project IDs; policies, visibility and revisions; department IDs/revisions; source/anchor IDs. Lifetime misuse is infrastructure/internal misuse, not a missing-resource authorization verdict. Scope Data does not let a caller manufacture a new authorized scope from copied rows.

Authorization: native member required; all policy/department Workspace bindings required. If project nonnull, issue and project policies must both exist and name SAME department even for a direct/private read. Ordinary => current department membership OR current direct `read` OR current project `read`; private => current direct `read` ONLY. `edit_title`/`create_issue` are not read. Query real current grants and department membership after locks, never infer from revision1 or role. Null project has no project policy/grant. Preserve native NULL distinctly from zero UUID.

## 4. One-hop plan, lock order and race boundary

Before payload, metadata-only locators collect root, its live cancelled duplicate pointer, and attached issue_source_context source Issue ID/anchor ID. At most **3 distinct native Issues**, including root; deduplicate self-links. Do not traverse related Issue duplicate/source relationships, parent/project body, sibling or dependency. No title/description/snapshot/comment text in planning SQL.

Proposed global order for this bounded GET set (amends r3 single-resource order without changing ranks):
1. Native actor member FOR SHARE.
2. All distinct candidate department rows FOR SHARE, sorted UUID bytes.
3. All nonnull project policy rows FOR SHARE, sorted project UUID.
4. All issue policy rows FOR SHARE, sorted Issue UUID.
5. All native Issue identity rows FOR SHARE, sorted Issue UUID.
6. Attached source-context link row FOR SHARE by ID, then its anchor comment identity row FOR SHARE by ID, when needed. These are payload-dependency locks, not additional business grants.
7. Validate every actual locked identity against plan, then current grant/department-member facts by plain queries. No lock on grant/department_member after parents. Only then read authorized body fields and hydrate.

All locked rows stay held to commit. SQL locking queries are one table each, explicit scoped keys; no join whose planner chooses parent lock order. Sorted calls are easier to audit than hoping one joined query orders locks. Root/related Issue project change, live duplicate change, source link change or anchor pointing at another Issue => no body/authorization result returned; rollback WHOLE transaction and rerun locator+plan once, no acquisition of newly discovered lower-rank locks while stale locks are held. Second change / stable unclassified root/source => generic404, internal reason only. Database deadlock/serialization/timeout is infrastructure500, not an association retry or permission verdict.

Related payload decisions:
- **duplicate original:** same r3 read rule independently. Missing/unclassified/denied original => omit DuplicateOf exactly as existing optional absent-original shape, never emit its ID/title/identifier/status and never fetch its body. Permitted original => construct native IssueRefResponse from its authorized locked row. No inherited grant and no recursive hydrate.
- **attached source context:** separately require read of its source Issue. Missing/denied/unclassified source => whole GET generic404, before snapshot/comments/author/attachment reads; never return200 with a silently stripped required source context. Caller cannot distinguish this from invisible main Issue.
- Lock source row's metadata and anchor metadata, compare workspace/source/root/state/IDs; the anchor must belong to that same authorized source Issue (cross-Issue movement is unclassified, not permission to follow a new arbitrary pointer). Missing physical anchor => fail-closed404 in this first GET contract; existing deleted-source/deleted-anchor presentation compatibility is explicitly not generalized. A present soft-deleted anchor can use the already authorized source and capture-boundary path.
- After source authorization, fetch its pinned full row; verify snapshot source Issue ID and anchor ID agree with pinned metadata before any snapshot-directed lookup or response. Invalid JSON/internal malformed snapshot =>500; identity disagreement => generic404, never read a fourth Issue. Existing history/attachment queries must retain Workspace+authorized Issue predicates. Authors are projected only after their authorized source thread was loaded.
- When the plan has no attached source context, do not later refetch one through a helper: a concurrent phantom insertion must not introduce an unplanned source. When present, use the pinned row, not an unconstrained second ByIssue fetch. A valid same-Tx read is not a claim of repeatable-read snapshot or revocation t0.

The extra source/anchor SHARE locks need a real native writer lock-order test. Existing non-ACL writers can contend or deadlock; error must discard the buffer. Do not claim lifecycle/move/revoke safety or hide deadlocks with global Workspace locks. The new ordered GET set is the only multi-resource protocol authorized by this proposal.

## 5. Whole native hydrate, no pool escape, no premature200

GetIssue body becomes gate + orchestration + final write; shared loader stays unchanged. The new hydrator takes only valid scope (no external q), obtains its lifetime-guarded q and authorized data, and has no cloned Handler or pool. Use existing pure `issueToResponse`, labels/reactions/attachment DTO conversion and native status wire mapping. Required current GET fields remain: prefix/identifier, body/metadata/properties, status category/name, labels (empty array retained), reactions, own attachments, authorized DuplicateOf and authorized complete SourceContext.

- Prefix: q.GetWorkspace + issuePrefixForWorkspace, propagate error.
- Custom status: q.GetIssueStatusEntryByKey and issuestatus.IsCategory/WireCategory, propagate lookup/invalid-category error; built-ins pure. Do not call error-swallowing Resolver or pool IssueStatusCatalog.
- Labels/reactions/own attachments: q.ListLabelsForIssues / ListIssueReactions / ListAttachmentsByIssue; keep current DTO shapes, propagate failures rather than partial200. No native new writes/seeding.
- Duplicate: use only authorized locked original, not `fillStatusCategory`/`fillDuplicateOf` which would blindly reread the related Issue.
- Source: extract existing projection into a strict GET helper in source_context.go, **valid scope only**, `issueSourceContextDetailForRead(ctx, scope)`; obtain guarded q and pinned source/anchor from that scope after validity check. All nested author/current-source/thread functions use that same q; existing service BuildSourceIssueSnapshot/BuildSourceContext/BuildSourceContextThreadAtCaptureBoundary already take q. Anchor is held stable; validate captured source IDs first. Propagate real query/scan errors instead of converting them to unavailable/empty. Keep existing `issueSourceContextDetail` wrapper and other endpoints' behavior unchanged; no changes to source creation/cleanup/lifecycle. Existing deleted/too-large semantic branches may remain only when they do not mask infrastructure failure.
- Attachment renderer may call existing h.attachmentToResponse for **already authorized rows only**: inspected chain uses configuration, CdnDomain and local signing, not database queries/network download. Do not pass h into database hydration; renderer cannot fetch assets. No claim that separate download endpoints are secured.

Marshal complete payload to bytes + native trailing newline **before commit**. Check ctx.Err before commit and again before writing. Attempt.Commit invalidates every scope/q copy before the real commit. Commit error (including ambiguous result) discards bytes; never200. Attempt.Rollback invalidates before cleanup; deferred cleanup is idempotent after confirmed commit. After successful commit set native Content-Type/Length and write buffered bytes, no further read/sign/hydrate. Network failure after successful commit cannot be undone; do not promise delivered response or a cancellation-free interval after the final check. A ResponseWriter spy must show zero Write/WriteHeader before successful commit.

## 6. Exact proposed SQL names / allowed source write set

New `server/pkg/db/queries/enterprise_acl.sql` contains these typed query names (freeze SQL bytes later):
- `GetIssueReadLocatorByID`, `GetIssueReadLocatorByNumber`: native IDs/workspace/project/live-duplicate metadata only; number path verifies native prefix through tx workspace row.
- `GetIssueReadPolicyLocator`: issue/project policy identifiers, department IDs, visibility, revisions; LEFT JOIN metadata only so absence is an explicit unclassified result.
- `GetIssueReadSourceLink`: attached context ID/workspace/issue/source/anchor/state only, no snapshot.
- `LockIssueReadMember`, `LockIssueReadDepartment`, `LockIssueReadProjectPolicy`, `LockIssueReadIssuePolicy`: one scoped row, FOR SHARE.
- `LockIssueReadNativeIdentity`: native ID/workspace/project/live-duplicate metadata only, FOR SHARE; full GetIssueInWorkspace is permitted only after authorization.
- `LockIssueReadSourceLink`, `LockIssueReadAnchorIdentity`: scoped metadata only, FOR SHARE; validate exact source/anchor before body reads.
- `GetIssueReadGrantFacts`: one result with three EXISTS facts (department_member / issue read grant / project read grant), all Workspace+verified user+locked resource constrained, no locks or copied grants. Policy evaluator exists only in production service and consumes these real facts.

Minimal proposed write set = **10 paths**, not an authorization yet:
1. NEW service/resource_access.go and resource_access_test.go.
2. NEW handler/issue_access.go and issue_access_test.go.
3. MODIFY handler/issue.go: GetIssue only; any extraction must stay read/hydrate, no shared write/status behavior.
4. MODIFY handler/source_context.go: scope-only strict entry with internally bound-query/pinned-row extraction only, keep legacy wrapper/callers intact. This extra path is necessary for no pool leakage, no unplanned source reread and no swallowed DB errors.
5. NEW pkg/db/queries/enterprise_acl.sql and generated/enterprise_acl.sql.go.
6. MODIFY pkg/db/generated/models.go **sqlc output only** (617 tables are not currently generated).
7. MODIFY cmd/server/r1_acl_issue_read_integration_test.go **GREEN fresh OTP alias/ID/code fixture and immutable baseline binding only**, preserving parent+3 children/assertions/dual locator. Existing RED source hash remains evidence at its commit; do not run its used201/202 again.
All above relative to E-root/server. Additional native test adaptation, source_context tests, generated drift or a second test file requires exact write-set amendment before writes, not blanket generated/tests access.

sqlc v1.31.1 already fixed by Makefile365; locally verified binary `.local/engineering-prep/tools/sqlc1311/bin/sqlc.exe` SHA256 `86ea58f21c2f25f484a282c7efefdf167fc940b3a4e963d33d966c15d71ae2fb`. Future authorized generation is that binary `generate -f server/sqlc.yaml` from E root (no make download fallback). Inspect tracked AND untracked output; expected enterprise_acl.sql.go + models.go only. Unexpected changes => stop/amend, never hand-edit generated or skip typed SQL. No migration/version/dependency/config edit proposed.

## 7. Named tests and evidence gates (all proposed tests NOT RUN)

Existing real-router parent remains `TestR1ACLNM02IssueReadCrossDepartment` and exactly `SameDepartmentRead`, `ExplicitIssueReadGrant`, `UnsharedCrossDepartment`. Same two locators in each. Accepted RED is retained, not rerun. Separately freeze the exact candidate GREEN fields below before any future owned runtime collision preflight/insertion. These values are NOT allocated/inserted/queried now. Use actual verify-code→Me→signed-v1, preserve old201/202 and all prior OTP/PAT/business/ledger state. GREEN requires exact4run4pass0skip/Go0+converter0, both denied locators full404, exact positive markers and immutable/zero-delta proofs. Runtime/source/ELF/profile/fresh fixture review remains separate. No resetting/reseeding old credentials.

### Fresh GREEN candidate fields — not allocation/runtime permission

| Actor | Native user ID | OTP ID | Email | Exact alias | Candidate code |
|---|---|---|---|---|---|
| A2 | 22222222-2222-4222-8222-000000000002 | 77777777-7777-4777-8777-000000000301 | r1-acl-a2@invalid.example | R1-ISSUE-READ-GREEN-A2-r1 | 927314 |
| B1 | 22222222-2222-4222-8222-000000000004 | 77777777-7777-4777-8777-000000000302 | r1-acl-b1@invalid.example | R1-ISSUE-READ-GREEN-B1-r1 | 618425 |

Synthetic fixture codes, not real credentials. Future reviewed single-transaction INSERT exact2, DB now+10min/used=false/attempts=0. Any collision on IDs, email+code, alias binding or still-valid unused emailOTP => BLOCKED, no overwrite/reset/delete/reissue. Alias is a manifest/test actor field, not an invented verification_code column. Persistent delta permits only these2 new rows then native used transition; all other columns exact unchanged. Snapshot excludes ONLY fresh301/302, includes all10 retained OTP rows (especially used201/202), prior PAT and all canonical/business/ledger rows. Successor test may change fresh IDs/alias/email/code binding and derived pair exclusion, never parent+3children, both locators, status/body expectations, noSkip, immutable or post-failure proof. Four named events means one parent+THREE children.

### New component fixture ownership / teardown boundary

All NEW handler/service persisted tests create OWN distinct synthetic Workspace(s), user(s), members/resources and append-only ACL. No new row may reference handler testWorkspaceID/testUserID/testRuntimeID, TestMain temporary workspace/user/agent/runtime, shared dbfx rows or retained canonical NM02 owners. Distinct owned identities also cover creator/uploader/captured_by/source authors and related resources: no indirect ownership/FK to temporary identities. Sharing a verified owned pool is not sharing fixture rows. Service tests likewise avoid generic fixtures whose t.Cleanup deletes parents.

Fixture helpers stay inside the same two NEW test files; no shared TestMain/dbfx/testutil/source write-set expansion. Do not use dbfx.Insert/automatic DELETE cleanup for retained ACL data. Cleanup may close rows/connections, cancel contexts and rollback uncommitted transactions; it must NOT DELETE committed ACL or native parents, disable triggers, TRUNCATE, reset/restore. Record exact owned component fixture delta and retain it until separately approved, positively owned disposable-instance reclamation. Collision aborts setup; no repurposing/wildcard cleanup. Races use independent initial synthetic rows, not reset ACL.

Prefer a separately reviewed component instance to keep canonical GREEN zero-delta evidence distinct from expected fixture INSERTs. If a future reviewed runtime chooses the same owned instance, freeze separate exact pre/post component delta; canonical full rows remain unchanged and GREEN GET phase remains zero-delta. This proposal selects no instance or runtime.

Frozen pre/post proof must show: no new FK/ownership to TestMain rows; native TestMain cleanup/prepost0; exact retained component rows and only named native race changes; canonical full-row immutability incl OTP/PAT/ledger; closed rows/Tx/connections; actual named events/noSkip. Handler TestMain uses fixed aliases, not global TRUNCATE: include user/workspace/member/runtime/agent AND agent_invocation_target/native dependent cascade rows in its bootstrap pre/post predicates. Service TestMain only closes lazy sharedPool; prove closure/no connection leaks, do not invent handler fixture there. Its sharedTestPool may Skip on DB failure, so require strict outer actual-run/noSkip proof. Outer runtime capsule must collect post-TestMain state; an in-test assertion cannot prove post-process cleanup.

Add `service.TestIssueReadFixtureOwnership` and `handler.TestGetIssueReadFixtureOwnership` in those two files for identity/FK separation; outer pre/post verifies actual cleanup. These and all new component tests remain design-only NOT RUN.

New service/resource_access_test.go (real persisted synthetic rows + actual production SQL; no hand-written permission mock):
- `TestIssueReadAccessPolicy`: SameDepartmentOrdinary, DirectIssueRead, ProjectReadOrdinary, PrivateIgnoresDepartmentAndProject, PrivateDirectRead, AdminNoBusinessBypass, MissingMember, MissingPolicy, CrossWorkspacePolicy, ProjectDepartmentMismatch, NullProject, NonReadActionDoesNotGrant, CurrentGrantAppendRead. Use independent native synthetic rows, generic INSERT constraints; no ACL UPDATE/DELETE cleanup of retained fixture.
- `TestIssueReadScopeLifetime`: ZeroScope, ZeroAttempt, SuccessfulLiveScope, CopiedScopeAfterRollback, ScopeAfterCommit, OldAttemptAfterRetry, RetainedQueriesAfterClose, QueryRowScanAfterClose, RowsAfterClose, CommitInProgressAlreadyInvalid, RollbackFailureStaysInvalid, CommitFailureStaysInvalid, CancelledScope. Forwarding real Tx wrappers and real policy SQL; invalid access returns error before downstream query counters change, all copies share invalidation, new attempt succeeds only with its own new scope/q. Include Begin/SET failure cleanup and deferred panic rollback.
- `TestIssueReadAccessLockOrder`: record generated query name + bound key from a forwarding real pgx.Tx wrapper; assert rank and UUID order with root/related IDs deliberately inverse. No stubbed grant answers.
- `TestIssueReadAccessAssociationRetry`: deterministic barrier before native identity locks; second real connection changes native project or duplicate association, then release. One change => new whole Tx/new locator + correct current result, no stale payload; two changes =>404, exactly2 begins, no third retry/new lower-rank lock. Do not modify retained canonical fixture.
- `TestIssueReadAccessLocksHeldThroughCommit`: pg_locks/pg_blocking_pids plus channels prove writer blocked by SHARE until commit/rollback; no timing-average/sleep-only proof. Verify source/anchor dependency order and bounded native writer contention separately; deadlock must be500/no200.

New handler/issue_access_test.go:
- `TestGetIssueReadCredentialGate`: absent view/raw forged headers, legacy/Unknown, PAT, task/cloud credentials denied before any locator/Begin; valid exact v1 accepted into real actor/member path. Obtain views through production Auth (signed synthetic session for component tests; native OTP for router integration), never export/add a context writer or fabricate actor headers. Anonymous route401 remains original Auth test responsibility.
- `TestGetIssueReadDenialShape`: UUID/identifier/foreign prefix/unknown/missing/policy-denied => exact same native404; valid lower-case prefix works; injected DB failure =>500 not404.
- `TestGetIssueReadHydration`: authorized persisted fields for native metadata/properties, built-in/custom status+name, labels/reactions/attachments; original values/native shape retained, both locator forms.
- `TestGetIssueReadRelatedProjection`: denied/private/missing duplicate original omits complete DuplicateOf; authorized original returns exact native summary; authorized root with unauthorized source context =>404/no source marker/author/attachment; authorized source returns complete frozen+current native detail; malformed or mismatched snapshot fails closed; no source relation does not later hydrate a concurrently inserted unplanned source. Include soft-deleted anchor safe boundary; physical missing anchor404 is an explicit compatibility restriction.
- `TestGetIssueReadScopeBinding`: scope-only hydrate/strict-source entry; zero/rollback/commit/old-attempt scopes fail with no reads/200. Retain old scope/q while a new attempt is live; prove old scope cannot borrow its Tx/pool, new scope returns full authorized native payload. Signatures have no q argument to swap.
- `TestGetIssueReadTransactionBoundary`: forwarding real pgx.Tx query trace proves ALL policy/grant/workspace/catalog/labels/reactions/attachments/source/comment/author reads on same backend/transaction. Set Handler.Queries/DB/ReadSelector/services to poison readers (or nil where unused) after middleware setup, retain only TxStarter+pure rendering config. A permitted populated payload must still200; no pool read after begin or after commit.
- `TestGetIssueReadFaultsNeverEmitSuccess`: BeginFailure, LocatorFailure, PolicyFailure, GrantFailure, HydrateLabelsFailure, HydrateReactionsFailure, HydrateAttachmentsFailure, HydrateSourceFailure, HydrateAuthorFailure, ContextCancelledDuringLock, ContextCancelledDuringHydrate, SetTransactionFailure, MarshalFailure, CommitFailure, RollbackFailure, EarlyReturnCleanup, PanicCleanup. Inject transport/storage/transaction faults via wrappers forwarding production policy SQL to real PG; no fake allow/deny evaluator. Each records rollback/closed Tx, generic500 or cancelled/no response, zero successful/body writes before commit and no protected marker. CommitFailure wrapper rolls back real underlying Tx before returning its injected error. Rows.Scan/Rows.Err failures must be covered, not just Query error.

Original native regression inventory, not silently deleted or relabelled:
`handler.TestIssueCRUD`, `handler.TestGetIssueByIdentifierEnforcesPrefix`, `handler.TestNewIssueDefaultsToEmptyMetadata`, `handler.TestDuplicateOfSummaryFollowsTheOriginal`, `handler.TestCommentSourceContextLifecycle`; `cmd/server.TestIssuesCRUDThroughRouter`. These use legacy/manual-header fixtures and/or create native Issues without ACL; they cannot all pass unchanged under fail-closed v1+policy. Keep files unchanged in this first write set. Carry GET assertions into the new authorized real-fixture tests; pure source-context projection tests still run in their original scope. Full old CRUD/delete/source lifecycle adaptation is a later explicit test-fixture amendment (append-only ACL FK teardown is not silently bypassed). A local GET subset may pass while these remain compatibility blockers; never call that whole-native regression/BUILD success.

Test-first sequencing: accepted real four-event RED -> independent new source TF -> write new behavior/transaction tests against existing surfaces where possible, establish actual failing behavior (not undefined API compile failure) -> smallest product+typed SQL change -> offline compile+vet+generated reproducibility -> separately authorized owned DB/router/component runs -> independent exact diff/evidence review + Root ACK. TestMain can exit0 when DB absent; require every frozen named event actualrun/pass, zero skip/missing. No source release or BUILD claim from this proposal.

## 8. Inspected SHA256 bindings

Paths below relative to E root. NEW paths above were absent at inspection. Existing writes/critical read-only dependencies:

| Path | SHA256 |
|---|---|
| server/internal/handler/issue.go | 9e70f255a77c5a3557472c9a6721a1bd503af2b699b660d0e957fd1074091b98 |
| server/internal/handler/source_context.go | 8d372e90c9c61c25dc722731535e22b594a86604791b3c12b2e6189acd115631 |
| server/pkg/db/generated/models.go | 29d9afbe7c9e6e3dc0314dfbc0dc71ff20548b148985811d10cc366e03291b5e |
| server/cmd/server/r1_acl_issue_read_integration_test.go | fba7b818bb9f72d42786a8532a19d995adad33c0ef813f2135f29754be0c42e2 |
| server/internal/handler/handler.go | fbe785bcda4d6508d220dc2abe097fc43b814441bbcb2b8a24009716862c10ef |
| server/internal/service/source_context.go | effc0dbc9d30d1fc1799ce8f758f22239e99b7e2c6d8b6078bafef05c6905d84 |
| server/internal/handler/file.go | 8b294732d2cce9e66b6ab826407f7b7b434d40640c23b807dcc8dff459d06dba |
| server/internal/middleware/verified_identity.go | aa384557c44433f78521559c4c3236569fda824b749fe0c86d4d3908d0bec933 |
| server/internal/middleware/auth.go | f52329508d6de885706e161627b73ec3514f6783d6b0e44a85626403558fd8e5 |
| server/internal/middleware/workspace.go | 64521c31d3f55ecb6d3a5bc8b123004db3e4da572c351d5af1d0a14ba7c36e90 |
| server/internal/issuestatus/issuestatus.go | 81ad659ce3bfe7f7b0b7d3752c104494d372ae48489d53b21d37f9bd107358f6 |
| server/pkg/db/generated/db.go | 0c9302e79a855e76de414411e9c730a96b56c46782e65d19f7f4b919a7771799 |
| server/pkg/db/queries/issue.sql | 389db653b8e103b89f6e42274fd768f949f2a6b4ea4cfc90bfcd68745275c044 |
| server/pkg/db/queries/source_context.sql | a70a4807b0c21041ff08ec387a3f40becbe6e5acde9193383cd9574a64e84f03 |
| server/pkg/db/queries/comment.sql | d05bee2790a3303e81373b477c71dd4cb138fc7d26035898c92fcab1ae5fbbb2 |
| server/sqlc.yaml | 4eda341cdbf85e504ad5561c5c7e9414725f583e76fff049db5cb1c15f5a19fc |
| docs/tasks/contracts/R1-ACL-r1.md | f5e810595f5f30b07d07c29926cd7eb0228d3d8a9c8283f822ee6d194c87f414 |
| docs/tasks/contracts/R1-ACL-r1-schema.sql | e21aed0fb0702d2db6ce5ce04ed6170056b691cde43ba4d3121aa23292888af9 |
| docs/tasks/contracts/R1-ACL-r1-fixture.sql | fd4c9bcb53ec1d47438b27bc836c414e227dd16a8140d9dfb4e66eccfa77eb61 |

r2 supersedes r1 API/lifetime, component ownership and fresh-GREEN candidate clauses; all other accepted policy/query/one-hop/error/10-path boundaries remain. Original bd2c bytes stay unchanged. Required findings addressed in design only, no code or test execution.

Before source TF Root must freshly hash all these and exact successor credential fixture; doc advances during runner preparation do not authorize borrowing stale HEAD/hash. Reviewer must specifically approve one-hop lock amendment, mandatory-source404/physical-missing-anchor restriction, strict GET error propagation, source_context extraction and fresh GREEN test mutation. No claim of revocation, all outlets, full Auth BUILD, complete R1-01, Windows or Goal completion.