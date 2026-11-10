---
purpose: "R1-01B-AUTH foundation task/card amendment — DRAFT"
owner: task-owners
status: draft
updated: 2026-11-07
related: []
---
# R1-01B-AUTH foundation task/card amendment — DRAFT
PREPARATION ONLY; no source/runtime/freeze authority. Owner /root/acl_contract, configured gpt-6.1-sol high.
Root will bind the NEW committed baseline before dispatch; observed HEAD e979ae939bce00c6ba569047947e600502d7de1e.
References: r1-01b-amendment-proposal-r2.md SHA85c86e7d511205df00f2757143d08ecff78ff9dce6a445d73a4f3d04d3940f29;
r1-01b-task-contract-amendment-draft.md SHA446c36c94a72fac472cf5234c16c201217b798fb2d8c462946ce4ce83c65e42d.
This narrows those preparation drafts to auth foundation only; supersedes their stale WAIT_GREEN/baseline-capture-needed status, not reviewed contracts.

## 1. Actual entry evidence and indivisible goal
Root reports independently ACCEPTED meaningful HTTP RED result7ce86e1a219f502cb26ebb04b42a126cd3b9f33ac16e30b59cde7696b9742771.
Actual TestR1ACLCliMintDatabaseBoundary: parent+2 children run3/pass1/fail2/skip0; process1/converter0.
OTP->CLI positive PASS; real PAT201/GetMe200->CLI wrong200->genuine unmarked signed JWT same-A1 GetMe200.
Capture2336B/hash cab88bdd...d6b9 retained privately in owned Linux volume8f3e; same signing context retained.
13 business/641 ledger/old7 controls unchanged; only reviewed OTP1/PAT1; no setup/delta/cleanup failure; helpers removed.
This is real native wrong-allow RED, NOT missing typed API, compilation/setup failure or component-fixture evidence.
Implement M1 targeted mint backstop + M2 v1 issuance/non-upgrading renewal + typed verified origin as ONE unexposed candidate.
Do not expose v1 issuance before PAT mint is closed; no intermediate M1-only lineage claim.

## 2. Exact single-writer source set (9 paths; only after new TF/card dispatch)
MODIFY server/internal/middleware/auth.go — reset private identity on entry, stamp native verified success branches.
NEW server/internal/middleware/verified_identity.go — private context key/writer, read-only typed view/accessor.
NEW server/internal/middleware/verified_identity_test.go — actual Auth-chain branch/provenance/forgery components.
MODIFY server/internal/handler/auth.go — ONLY IssueCliToken backstop and issueJWT signed-v1 issuance.
NEW server/internal/handler/cli_token_origin_test.go — real middleware-to-handler/backstop components, no public setter.
MODIFY server/internal/auth/session.go — claim constants and exact existing-claim preservation in RenewSessionToken.
MODIFY server/internal/auth/session_test.go — signed renewal shape/no-upgrade regression components.
MODIFY server/internal/middleware/session_renewal_test.go — native cookie-renewal lineage/CSRF regressions.
MODIFY server/internal/handler/session_test.go — native explicit refresh lineage regressions.
READ-ONLY all other source, including router/global RequireHumanActor/actor_guards.go, session_renewal.go,
handler/session.go, DB/schema617/generated/dependencies, and baseline cmd test8e350f1475d265a8b1b4d19c76c437ebb9fe7f8a9ba19902e10b7f13f32882f1.
No source/body assertion weakening, new authentication authority, role lowering, key rotation, or schema/session-table migration.

## 3. Exact API and security semantics to register
middleware: type VerifiedCredentialKind uint8; values Unknown, SessionJWT, PAT, TaskToken, CloudNodePAT (named constants prefixed VerifiedCredential).
middleware: type VerifiedSessionProvenance uint8; values Unknown, NativeV1 (constants prefixed VerifiedSessionProvenance).
type VerifiedIdentity struct { Kind VerifiedCredentialKind; UserID, WorkspaceID, AgentID, TaskID string; SessionProvenance VerifiedSessionProvenance }.
func VerifiedIdentityFromContext(context.Context) (VerifiedIdentity, bool) returns a copy; unknown/unset -> false.
Private key/writer ONLY middleware; clear/shadow incoming typed context, then stamp AFTER native verification/denylist/binding.
Stamp JWT, PAT-cache, PAT-DB, task and cloud success independently; no raw token/hash in the view.
No bearer-prefix/header/unsigned-claim/absence-of-machine-header inference; existing attribution headers remain native, not new authority.
auth.SessionProvenanceClaim="morchat_session_provenance"; auth.SessionProvenanceV1="v1".
Only exact verified signed string v1 maps NativeV1. Missing/null/numeric/object/unknown-string -> Unknown, no coercion.
IssueCliToken first requires typed SessionJWT+NativeV1 with nonempty verified UserID consistent with server attribution;
reject403/no token before GetUser/issueJWT for PAT/task/cloud/unknown/legacy/forged headers. Invalid public auth remains native401.
issueJWT emits signed v1 only for existing verified OTP/Google and newly gated CLI callers; inspect all call sites again before edit.
RenewSessionToken copies provenance iff present, preserving its JSON value exactly; absent remains absent; never defaults/adds/upgrades.
Both cookie auto-renew and POST/api/auth/refresh use the shared function; preserve sid/CSRF/native cookie behavior.
Legacy valid JWT may remain /api/me200 and renewable, but CLI mint403 before and after either renewal; actual captured legacy stays denied.
Conservative compatibility cost: ALL unmarked sessions (including legitimate old OTP) need native re-login for newly protected scopes.
No claim of physical human presence or selective old PAT-origin identification. Future Issue adapter consumes this same API under another card.

## 4. Component TDD (unit scope, not replacement for accepted HTTP RED)
First add behavior assertions using native Auth/handler paths; do not count future-type compile errors as RED.
Then minimal typed API/backstop/issuer/renewal changes; M1+M2 remain one unexposed change set; no parallel auth writer.
TestAuthVerifiedIdentity: JWTBearer/JWTCookie; PATDatabase/PATCache; Task/Cloud; MissingOrInvalid;
ClaimShapes{Missing,Null,Numeric,Object,Unknown,V1}; ForgedHeaders; StaleContextShadow; denylist/binding failures never stamp success.
TestIssueCliTokenRequiresVerifiedSession: OTPV1Success; PATDatabase/PATCache/Task/Cloud/Unknown/LegacyDeny;
ForgedHeadersDeny; AttributionMismatchDeny; assert no user-query/mint on denial and no token member.
TestRenewSessionTokenProvenance: missing/null/numeric/object/unknown/v1 preserved; stable sid; no legacy upgrade.
TestCookieRenewalProvenance and TestRefreshSessionProvenance: actual native channel, v1 remains v1;
legacy/malformed remain untrusted after renewal, then CLI403; existing CSRF/header precedence/expiry controls unchanged.
Component cryptographic fixtures MAY be genuinely signed with isolated test keys; label UNIT only, never captured legacy or end-to-end lineage.
Selectors: middleware ^(TestAuthVerifiedIdentity|TestCookieRenewalProvenance)$;
auth ^TestRenewSessionTokenProvenance$; handler ^(TestIssueCliTokenRequiresVerifiedSession|TestRefreshSessionProvenance)$, count1/no skips.
Production package existing regression suites also required under separately authorized clean isolated execution, no default DB/env.
Actual post-repair HTTP/retained-legacy verification needs a separately registered fresh-material runner/test capsule;
DO NOT rerun consumed fixed OTP or negative transport probes on retained volume, read tokens now, or claim unit GREEN as HTTP GREEN.
Real Redis cache/task/cloud HTTP coverage remains separately bound; no mocks called real cache, no new services here.

## 5. Owner ACK and release/signature gates
Source-owner PREPARATION ACK: exact9 paths/API/claim/M1+M2/legacy compatibility and unit-only fixture distinction above.
Root native Auth owner must sign issuer caller audit, backstop-before-query, exact private API and both renewal preservation semantics.
Root Issue consumer signs future typed API consumption direction ONLY; Title9/Resource service/TX/query work is a separate card.
Independent security signs exact bytes/write set/TDD and any runtime capsule; root registrar freezes/commits new card/base before source release.
No full R1-01/C04/C06/revocation/BUILD/release completion; this foundation alone does not protect Issue endpoints.
Reattested native source hashes: middleware/auth.go45d6df46...286de; handler/auth.goa73ca629...69986; auth/session.go5a4bf815...8fdd5.
Only this NEW ignored draft written; no product/schema/contracts/cards/status/index/test/runtime changes in this preparation.
