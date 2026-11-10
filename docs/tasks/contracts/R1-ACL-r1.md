---
purpose: "R1-ACL-r1: initial persisted NM-02a candidate"
owner: task-owners
status: draft
updated: 2026-11-06
related: []
---
# R1-ACL-r1: initial persisted NM-02a candidate

**DRAFT-r3 / NOT RUN. Not TEST-FROZEN, BUILD-FROZEN, implementation permission or product exposure.** 2026-11-06.

## 1. Identity, authority and source

- Proposed R1-01/B01 provider owner `/root/acl_contract`; configured model `gpt-6.1-sol`, high (root confirmed). Proposer is not independent reviewer.
- `/root` is the conditional native Issue/Project consumer and prospective sole source/schema writer. Root ACK covers direction for **initial schema/fixed fixture/read/title-only edit only**, not final exact-byte acceptance, revocation/cascade lifecycle, B04/B06, freeze or release.
- Independent security review: baseline_review raised blockers against r2. This r3 design addresses them for re-review; no approval/signature is fabricated. B04/B06 must ACK this subcase does not consume their outputs or review the affected interface.
- Authority: ROUND1-DELIVERY R1-AUTH-r1; Discovery section3; MINIMUM-CHAIN NM-ACL-r1 sections9.1-9.5; R1-01 and MC-01G cards; ARCHITECTURE4.1; ENGINEERING9.1.
- Worktree `E:/CodexData/worktrees/morchat-round1/morchat.co`, branch `codex/round1-continuous`; source baseline b353d4c335a2fc2d06cf1f546bde8ad62debbc45; upstream164290ee14f63fe009ca304db21de9879db104c8.
- Integration HEAD4112a4ce54129254b0b1303949ca0b50be501272 was reattested at reconciliation start; latest observed HEAD1f9a26d872a0f5c25bc8b402d1ffa31766c4faae. All eight source-file hashes in section10 were rechecked before this MD write and remain identical to the inspected b353 source. A doc/engineering HEAD is not a product-permission result.
- This owner writes ONLY these three design artifacts: this MD, R1-ACL-r1-schema.sql, R1-ACL-r1-fixture.sql. No source, executable migration, Git index, ACTIVE/checkpoint, DB/service/model changes or .env reads.

## 2. Narrow first scope and sequence

Consume C01 real human-session/native member/department/resource facts and C02 native Issue ID + expected_revision. First gate: NM-01 -> **NM-02a existing resources read and title-only edit**. Do not wait for all C01-C08; do not claim a full NM-02, R1-01 or enterprise ACL loop.

1. Independent review exact three design artifacts, future queries/types/fixture/evidence/error/transaction contract, proposed write set and isolated instance manifest. Freeze only after actual owner/consumer/safety signatures.
2. Under that narrow TEST-FROZEN permission, implement initial schema/seed support. No fake policy; missing schema is BLOCKED/native gap, not a leaked-data FAIL.
3. Run persisted fixture through real native login/router before guard repair: record specific wrong bytes/writes plus positive controls. Expected-red is not absent DB/schema/test or reversed assertions.
4. Follow production TDD: named failing test -> smallest real guard repair -> same positive/negative and unsupported-field regressions -> independent review. No product/public/UI exposure.
5. Native CreateIssue/project detail/project inheritance of future tasks is a **separate NM-03a amendment**. Grant revocation/transfer/cascades/account suspension are separate later lifecycle slices. First NM02 signatures do not permit guessing those transactions.
6. Unadapted list/query/table/search-index/counts/WS/inbox/download/delegation/device paths, legacy fixture compatibility and all lifecycle refusal regressions block BUILD/release. Core functionality is not being disabled to claim the whole product passed; this is a bounded isolated test/repair step only.

## 3. Exact SQL design, generic append-only policy

Highest inspected native migration616_member_pinned; proposed617_r1_acl_nm02.up/down.sql, subject to root rechecking no617_* and serially allocating it before source writes. No reservation against another writer is implied.

Exact DDL-r3 and fixture-r3 hashes in section9. Six native-DB companion tables, no duplicated task/project body/status/user/runtime authority:

| Table | Data |
|---|---|
| department | id,workspace_id,name,revision=1; unique(workspace_id,id/name) |
| department_member | workspace_id,department_id,user_id; native member composite FK |
| project_access_policy | workspace_id,project_id,department_id,revision=1; one per native Project |
| issue_access_policy | workspace_id,issue_id,department_id,visibility ordinary/private,revision=1; one per native Issue |
| project_access_grant | workspace_id,project_id,user_id,action read/create_issue; no first-slice grant API |
| issue_access_grant | workspace_id,issue_id,user_id,action read/edit_title |

All extension rows are **generic append-only**, not fixture-conditioned. INSERT uses normal DB keys/constraints for any valid native member/resource. UPDATE/DELETE is locally rejected with SQLSTATE0A000 by one SECURITY INVOKER trigger function that reads/locks NO parent. There is no seed flag/GUC/fixture ID/name branch in product DDL or policy, no new HTTP provisioning/grant API and no r2 parent-revision bump trigger. Initial trusted fixture inserts real rows in one transaction. No upserts or cleanup are in that fixture.

Revision1 is a structural immutable policy revision, **not a complete grant-change watermark or revocation epoch**. Grants may only be appended under separately reviewed provisioning; current guards query real grants each request. A stamp never authorizes another request, cache, reconnect or delayed delivery. This subset does not solve rights removal and makes no t0/revocation/cascade claim.

### ENGINEERING9.1 explicit exception request and cost

Native convention avoids new FK/cascade. Candidate adds native Issue/Project unique(workspace_id,id) and restrictive composite FKs so ACL policy/grants cannot silently name another Workspace's native resource/member. Every proposed FK is immediate NO ACTION; **no new cascade**. This is an enterprise-integrity exception request, NOT an approved style change. Independent reviewer/native owner must accept its exact scope before TEST-FROZEN.

Cost: deleting/modifying referenced native member/Workspace/Project/Issue or department can now be refused. Existing native teardown may cascade internally, but these new edges refuse rather than propagate; whole statement/transaction rollback is required on error. Policy/membership/grant row removal is unsupported. Only a positively identified isolated DB snapshot/reset can restore independent test state; no source lifecycle fix or broad cleanup is implied. This is a real compatibility blocker, not a passing NM11. Upgrade/down ordering and those regressions still need real test evidence before any BUILD gate. DOWN drops only extension tables/functions/constraints; missing policies must remain fail-closed, never open native Workspace-wide data.

## 4. Policy rules for this subcase

- Active source is current native member row + successful production session Auth including its emergency denylist, and current department_member relation. Native user/member has no persisted active/suspended field; no duplicate ACL-side account status is invented. NM11 suspension remains unimplemented.
- Department ordinary read is not edit_title. Native owner/admin does not imply business/private permission.
- Ordinary Issue reads evaluate its current native Issue.project_id against project read grants, never copied child grants. Future-task proof still waits for NM03's real create transaction.
- Private ignores department/project inheritance; direct issue read only. Title editing needs current read plus explicit issue edit_title.
- Single-task read does not open parent/project/sibling/dependency content.
- Missing/mismatched policy/department/workspace is unclassified and denied. No permissive legacy fallback or test-local policy evaluator.
- First guard supports actual human sessions only; task credentials cannot borrow runtime owner's business authority. No untrusted actor/department/header/policy revision can confer access.

## 5. Strict title-only request and typed interface

For native PUT /api/issues/{id}, after current read authorization, accept **exactly two required raw JSON keys**: title (string, native title validation) and expected_revision (positive int64). Reject unknown, extra, duplicate or missing keys, wrong types, nulls. project_id,parent_issue_id,status,assignee_type,assignee_id,description,title_base,attachment_ids,suppress_run and every other field are outside this action even when null. Validate keys before native assignment/workflow/status/project/attachment processing. A native credential with no read receives404 before body/revision-dependent detail; a visible human with no edit_title receives403. An authorized title editor sending unsupported fields receives400 with no side effect.

This intentionally narrows existing generic PUT behavior; old callers lacking expected_revision or changing status/assignee/etc are compatibility blockers, not silently supported. Other native mutation routes remain unadapted and block exposure. Do not translate edit_title into general edit/manage/dispatch.

Candidate new API in service/resource_access.go (not existing symbols):

```go
type ResourceAction string // read, edit_title; create_issue deferred
type ResourceCredentialKind uint8
const CredentialHumanSession ResourceCredentialKind = 1

type ResourceActor struct {
    WorkspaceID, UserID pgtype.UUID
    CredentialKind ResourceCredentialKind // trusted successful Auth adapter only
}
type DepartmentPolicyStamp struct {
    DepartmentID pgtype.UUID
    Revision int64 // immutable structural1, NOT grant epoch
}
type ResourcePolicyStamp struct {
    WorkspaceID, UserID, NativeMemberID pgtype.UUID
    IssueID, NativeProjectID pgtype.UUID // project Valid=false explicitly means none
    IssueDepartmentID, ProjectDepartmentID pgtype.UUID
    IssueVisibility string
    Departments []DepartmentPolicyStamp // distinct and UUID sorted
    ProjectPolicyRevision, IssuePolicyRevision int64
}
func LockIssueAccessPolicy(ctx context.Context, tx pgx.Tx, actor ResourceActor,
    issueID pgtype.UUID, action ResourceAction) (ResourcePolicyStamp, error)
func AuthorizeLockedIssue(ctx context.Context, tx pgx.Tx, actor ResourceActor,
    locked db.Issue, action ResourceAction, stamp ResourcePolicyStamp) error
```

Helpers require pgx.Tx and derive db.New(tx); no pool-backed fallback, client stamp or cross-TX reuse. Stamp binds native member.id, Workspace/user/Issue/project IDs, department IDs/structural revisions, policy identity/visibility. It does NOT assert a fixed complete grant version. Native Issue.revision is separately checked by existing expected_revision semantics.

Errors: invisible/missing/unclassified ->404 same native issue-not-found shape; visible action denied ->403; unsupported credential ->403 without resource content; DB/TX infrastructure failure ->500, never disguised404. Valid current authorized title edit with mismatched expected_revision ->409. Invisible resource must not reveal title/ID/role/revision via an earlier conflict or body error.

## 6. Actual transactions and precise bounded lock protocol

Verified definitions: handler/issue.go:255 runWithIssueStatusGuard; :277 updateIssueWithStatusGuard; :3718 updateIssueAtomically; handler/wakeup_actor.go:41 beginWakeupWrite; service/issue.go:235 IssueService.Create, current commit:515.

runWithIssueStatusGuard's existing no-wakeup/built-in-status shortcut must not bypass a trusted first-slice ACL intent. updateIssueWithStatusGuard is also called by BatchUpdateIssues at current4922; do not accidentally claim that batch path is ACL-fixed or make it inherit a spoofable HTTP intent. First source diff must preserve unrelated caller behavior and list the remaining insecure batch exposure. A changed helper signature has those real consumers, not just title PUT.

**Title PUT:** native status-catalog guard first (retain existing ordering), native actor member FOR SHARE, distinct candidate department rows FOR SHARE sorted by UUID, project policy FOR SHARE when non-null project, issue policy FOR SHARE, native Issue FOR UPDATE. Then validate exact native association and real current grants via plain queries before the existing native UpdateIssue query/callback in that same transaction. No global Workspace lock. Recheck expected_revision under actual row lock and keep all held locks through native commit. Reuse native wakeup attribution, conditional SQL and post-commit event path; no second task/write authority.

**GET:** locator data is server-only, not permission. In a real READ COMMITTED transaction lock native member -> sorted department rows -> project policy -> issue policy -> native Issue FOR SHARE, validate actual association and query real grants. Buffer authorized data before committing, then emit. A pre-t0 in-flight response is not a new post-t0 grant, and this first slice proves no t0/client cleanup guarantee. Do not lock grant/department_member rows after parent locks; r3 append-only refusal has no parent-locking mutation trigger at all.

For a non-null project, both policies must be present in the Workspace and name the same department. Re-read actual native Issue.project_id/workspace/id after native row lock and compare all held identities (not revisions alone). If changed/mismatched, authorize/write nothing, roll back the WHOLE transaction, and attempt at most one new locator/lock cycle. No lower-order new locks acquired while holding stale parents. If still unstable or unclassified, return generic invisible404 and audit association retry internally; do not leak invisible existence with a policy409. No move is implemented.

**Atomic description/attachment branch:** strict raw-key rejection makes this branch unreachable for the first title-only action. updateIssueAtomically remains read-only/outside first source write set. Do not add a generic edit permission to it. Any future support needs explicit status -> ACL -> attachment -> native Issue lock review and action-specific tests; retaining current source is not marking it secure.

**Deferred create:** actual atomic creation lives in service/issue.go, not handler alone. Native Issue+policy+creator grants must share its transaction BEFORE commit/publish/enqueue; caller inventory/catalog/capacity/workflow lock order are NM03's separate amendment. No copied B1 child grant, no post-return ACL insertion. This is not first-stage permission.

r3 does NOT allow or prove membership/grant/policy UPDATE/DELETE, parent removal, transfer, dynamic revoke locks or cache invalidation. Rejections/compatibility failures are explicit; do not infer lifecycle safety from these simple read/title locks.

## 7. Future exact product/test write sets (NOT this proposer's current authority)

Relative to authoritative E root only:

**Schema/seed:** server/migrations/617_r1_acl_nm02.up.sql and .down.sql; server/pkg/db/queries/enterprise_acl.sql; server/pkg/db/generated/enterprise_acl.sql.go and models.go; server/cmd/server/r1_acl_nm02_integration_test.go.

**First guard:** server/internal/service/resource_access.go and resource_access_test.go; server/internal/handler/issue_access.go; server/internal/handler/issue.go (GetIssue, strict UpdateIssue, trusted ACL-intent integration into runWithIssueStatusGuard/updateIssueWithStatusGuard only); server/cmd/server/r1_acl_nm02_integration_test.go.

Read-only first: handler.go loadIssueForUser/resolveIssueByIdentifier, wakeup_actor.go beginWakeupWrite, updateIssueAtomically, service/issue.go, project.go, router/auth/clients/attachments/daemon/root configs/locks. sqlc unexpected other generated changes require write-set amendment, not blanket generated/ permission.

Deferred NM03 amendment additionally considers handler/project.go GetProject, handler/issue.go CreateIssue, service/issue.go Create params/options/real transaction and its actual caller/tests. No implicit source write permission from this list. No product special cases tied to fixture identities.

## 8. Fixed fixture, HTTP expectations and TDD evidence

Fixture SQL is one transaction with normal generic rows: native company Workspace, A1/A2/AL real departmentA; B1/BL departmentB; OP native admin/no department business grants; OUT user/no member. P-A/T-A ordinary, S-A private child only A1, Q-A/T-only/T-sibling, P-B/T-B. A1 P-A read/create_issue and T-A/S-A read/edit_title. B1 T-only direct read, NO initial P-A grant. No assignment/workflow/autopilot/attachments/devices/harness. Unique synthetic markers, actual native child-event/search-index baseline side effects retained.

Fixture exact safety guard `current_database() IS DISTINCT FROM 'morchat_r1_nm'` rejects any other DB. Root reports this exact isolated DB safely initialized, no migration yet. That name is a secondary safety check, NOT ownership proof; instance/image/port/volume/user/database/egress manifest is still required. Never replace the guard with a wildcard/default or import its DB-name check into production policy.

Native verification_code records -> actual POST /auth/verify-code -> GET /api/me per independent actor/session. No manually signed JWT, owner-global helper, dev-code/email bypass, forged X-User-ID or test-local policy. SQL fixture assertions use explicit table counts and scalar IS DISTINCT FROM so missing rows fail closed; revision1 checks are not permission tests.

| First NM02 operation | Required result |
|---|---|
| A1/A2/AL GET T-A UUID and R1A-1 | 200 correct marker |
| A2 title PUT with current expected_revision | 403, no edit_title |
| B1 unshared GET/PUT T-A | 404 same missing shape, no marker/version |
| A1 title+expected_revision PUT | 200, title changed/native revision+1 only |
| A1 PUT title+expected_revision+project_id (including null) | 400, original project/row/events/queue unchanged |
| A1 PUT title+expected_revision+parent_issue_id (including null) | 400, original parent/row/events/queue unchanged |
| A1 PUT status/assignee/description/other extra or duplicate/missing keys | 400 with no hidden status/workflow/dispatch side effect |
| OP GET S-A | 404 despite native admin |
| OUT / anonymous | 404 / 401 |

Every denied/unsupported attempt compares full native Issue revision/timestamps/title/status/project/parent/assignee, activity/EventIssueUpdated/queue/usage; legitimate title mutation adds no model run/task_usage. Mutations use >=3 independent initial states, not mutate/delete append-only ACL rows to reset. Existing router fixture wires realtime/activity, not all main.go notification listeners: no notification/WS safety claim. No averages/sleep replace deterministic state assertions.

Proposed tests, not existing/PASS:

```powershell
& $go -C 'E:\CodexData\worktrees\morchat-round1\morchat.co\server' test -json -count=1 ./cmd/server -run '^TestR1ACLNM02IssueTitle$'
```

Named expected children: NativeSession, SameDepartmentReadOnly, UnsharedCrossDepartment, AuthorizedEdit, RejectProjectReassociation, RejectParentReassociation, RejectUnsupportedFields, PrivateAdmin, OutsiderAndAnonymous. Evidence verifier must require actual run/pass for all signed names, no skip/missing and no Skipping integration tests text. Both existing router/handler TestMain can exit0 on DB failure; exit0 is never proof. Red means actual expected policy violation, not bootstrap failure. Production implementation must follow TDD, not write guard first and invent passing tests.

Deferred NM03: B1 project read append -> existing T-A200/S-A404; A1 real native POST T-new after grant -> B1 GET200/PUT403 with no B1 child grant; T-only200/Q-A404/T-sibling404. Deferred revoke/transfer/leave cannot be run or declared supported under append-only r3.

## 9. Design hashes, tooling and remaining signatures

- Exact DDL-DRAFT-r3: R1-ACL-r1-schema.sql SHA256 e21aed0fb0702d2db6ce5ce04ed6170056b691cde43ba4d3121aa23292888af9 (9,770 bytes).
- Exact FIXTURE-DRAFT-r3: R1-ACL-r1-fixture.sql SHA256 fd4c9bcb53ec1d47438b27bc836c414e227dd16a8140d9dfb4e66eccfa77eb61 (12,438 bytes).
- MD own hash reported externally after write. r2 hashes/protocol superseded; r2 parent-locking mutation/cascade triggers and epoch claims are removed, not patched around.
- Go1.27.3 pinned by MC-00 (go.mod1.26.9 is minimum); GOTOOLCHAIN=local/GOPROXY=off with current E caches. sqlc v1.31.1. Native custom migrate is go -C E/server run ./cmd/migrate up ONLY after target proof; it has dangerous empty/default DATABASE_URL fallback. Do not invoke Makefile test/migrate-up/ensure-postgres or read .env.
- Existing compose mutable pg17/default5432/shared pgdata is not the approved exact instance. Root reports independent immutable infrastructure evidence; this owner has not queried the DB or applied any SQL.
- Model budget0 attempts/retries; no Agent CLI/DSH/daemon/automatic model jobs, external model/business egress denied with attempt logs and scoped run/task_usage before/after. Zero bill alone is insufficient.
- Before TEST-FROZEN: reviewer approves exact r3 and explicit restrictive-FK ENGINEERING9.1 exception; root native consumer ACK exact first-slice bytes; B04/B06 not-consumed/affected ACKs; real query/strict parser/TDD/evidence design; current source hash+instance manifest binding. Go/schema/SQL tests remain NOT RUN. No self-signing.
- No full NM02/03/10/11, no company ACL loop, no Windows/models/archive/devices proof, no BUILD or release. Unsupported lifecycle compatibility is a blocker to later product integration, not an acceptable permanent replacement for R1-01.

## 10. Reattested source hashes (SHA256)

| Relative authoritative path | SHA256 |
|---|---|
| server/cmd/server/router.go | f6d56506348e7a1faf59ec8283c82727b4ca8a37a3db29e021c6e0724e01c5a8 |
| server/internal/handler/handler.go | fbe785bcda4d6508d220dc2abe097fc43b814441bbcb2b8a24009716862c10ef |
| server/internal/handler/issue.go | 9e70f255a77c5a3557472c9a6721a1bd503af2b699b660d0e957fd1074091b98 |
| server/internal/handler/project.go | ed8f25b69498cabd456f21bfcc2438611bd9e8ac26b73ed0f562a504087e3d2c |
| server/internal/handler/wakeup_actor.go | 5b47f73e3b6ebe3a73c9d2d2267859a0265a6d47675e3d201d77f5b4f45d7794 |
| server/internal/service/issue.go | 17749ae5e685ecd59347c76b8cc1eecaeb477cfbe4b8397d3c9a0c45d5919ab2 |
| server/pkg/db/queries/issue.sql | 389db653b8e103b89f6e42274fd768f949f2a6b4ea4cfc90bfcd68745275c044 |
| server/pkg/db/queries/project.sql | ffd193c9659d6a82aee54844376b51c1f2d6f43430f27d5ff0f3f2a4eb43fbd1 |
