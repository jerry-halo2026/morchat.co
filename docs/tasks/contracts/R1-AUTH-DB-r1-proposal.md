---
purpose: "R1-01B first HTTP RED: auth-only retained-DB fixture proposal"
owner: task-owners
status: draft
updated: 2026-11-07
related: []
---
# R1-01B first HTTP RED: auth-only retained-DB fixture proposal

**DRAFT / NO EXECUTION OR FREEZE.** /root/acl_contract, configured gpt-6.1-sol high; only this ignored proposal is written.
Reference: M1+M2 task draft SHA446c36c94a72fac472cf5234c16c201217b798fb2d8c462946ce4ce83c65e42d and r2 SHA85c86e7d511205df00f2757143d08ecff78ff9dce6a445d73a4f3d04d3940f29.
Decision: YES, the first meaningful auth HTTP RED can use the retained owned morchat_r1_nm DB with only new native auth material, before three independent title-mutation states are ready.
This does NOT authorize title writes, clone/reset policies, rerun the old fixture, use its seven consumed OTPs, or claim full7 mint/9 title tests. Current source14 staged files stay untouched.

## 1. Exact future selected test and expected RED

Proposed test-only file remains `server/cmd/server/r1_acl_cli_token_origin_integration_test.go` (already in amendment write set); no new product path.
Use NEW auth-subset parent `TestR1ACLCliMintDatabaseBoundary` with ONLY actual children `OTPPositive` and `PATDatabaseCannotMint`.
Selector: `-test.run=^TestR1ACLCliMintDatabaseBoundary$ -test.count=1 -test.v`; native real testServer/testPool, no typed-origin API references or owner-JWT helper.
Parent setup uses one new reviewed OTP for existing A1 and real POST /auth/verify-code200 + GET /api/me200; retain returned session in memory, never print it.
OTPPositive: real session POST /api/cli-token200, resulting actual JWT GET /api/me200 for the same A1. This first positive is native issuance/identity, NOT a v1 assertion.
PATDatabaseCannotMint: real session POST /api/tokens {"name":"r1-01b-auth-db-red-v1","expires_in_days":1} ->201; actual PAT GET /api/me200.
Use native router with Redis nil/disabled, so real PAT authentication must take the PostgreSQL branch, not a forged prefix or manually seeded cache.
Then PAT POST /api/cli-token must403 with no token field; baseline native200 + genuine JWT is the intended wrong-allow RED. Capture it BEFORE failing the assertion.
Baseline expected named events: parent+2children3run; OTPPositive1pass; PATDatabaseCannotMint+parent2fail;0skip, no missing/extra selected names; actual process1 and converter0 separately.
Do not assert v1 in the first positive against baseline, manufacture future cases/skips, or accept compile/type/bootstrap/OTP errors as this security RED.

## 2. Exact new native OTP transaction (future owned runtime only)

Native existing A1 ID22222222-2222-4222-8222-000000000001/email r1-acl-a1@invalid.example must already match retained user/member facts; no account/ACL copy.
Before seed require approved full DB/container/namespace proof, exact641 ledger and expected immutable retained Workspace/Issue/ACL snapshot; acquire exclusive auth-test runtime ownership.
This transaction is a design proposal only; no SQL is run by this worker:
```sql
BEGIN;
DO $$ BEGIN
 IF current_database() IS DISTINCT FROM 'morchat_r1_nm' THEN RAISE EXCEPTION 'wrong owned auth-test DB'; END IF;
 IF (SELECT count(*) FROM public."user" WHERE id='22222222-2222-4222-8222-000000000001' AND email='r1-acl-a1@invalid.example') IS DISTINCT FROM 1
 OR (SELECT count(*) FROM member WHERE workspace_id='11111111-1111-4111-8111-000000000001' AND user_id='22222222-2222-4222-8222-000000000001') IS DISTINCT FROM 1
 OR (SELECT count(*) FROM verification_code WHERE email='r1-acl-a1@invalid.example' AND code='493821' AND used=true) IS DISTINCT FROM 1
 OR EXISTS(SELECT 1 FROM verification_code WHERE id='77777777-7777-4777-8777-000000000101' OR (email='r1-acl-a1@invalid.example' AND code='682947'))
 OR EXISTS(SELECT 1 FROM verification_code WHERE email='r1-acl-a1@invalid.example' AND used=false AND expires_at>now() AND attempts<5)
 OR EXISTS(SELECT 1 FROM personal_access_token WHERE user_id='22222222-2222-4222-8222-000000000001' AND name='r1-01b-auth-db-red-v1')
 THEN RAISE EXCEPTION 'retained identity/OTP/name collision; do not reuse or reset'; END IF;
END $$;
INSERT INTO verification_code(id,email,code,expires_at,used,attempts,created_at)
VALUES('77777777-7777-4777-8777-000000000101','r1-acl-a1@invalid.example','682947',now()+interval '10 minutes',false,0,now());
COMMIT;
```
No UPSERT/delete/revoke/old-code update or global lock. Single approved runtime owns the seed/login/mint sequence; if ownership cannot be proven, BLOCKED before SQL.
Use only this OTP once through production endpoint; afterwards exactly this row used=true, attempts0, old7 OTP rows unchanged. Unexpected pending valid OTP => collision, not selecting another code.
Generated PAT ID/hash/expiry comes from native201, not test INSERT; record its private provenance and exactly one new named PAT row. Native last_used_at is an allowed auth-only effect.
Parent setup/collision failure stops parent as BLOCKED, never security RED. Retry requires a separately reviewed attempt ID/code/name+hash, not silently fresh UUIDs/upserts.

## 3. Side effects and real legacy capture lifecycle

Own test changes are the new OTP (then used), one native PAT row/last_used metadata, and stateless JWT issuance; no ACL/member/Issue/project/model/task mutation.
Existing native TestMain may create/clean its separate known bootstrap records as before; bound evidence must distinguish that from retained business fixture facts.
Hash retained ACL6/native Issue/project/member/workspace snapshots and exact ledger before/after; all stay unchanged. No title or resource endpoint is needed for this first auth RED.
On baseline PAT CLI200, verify returned JWT via native /api/me200 for A1; optionally native ParseSessionToken inspects verified claims, never sign a replacement/runtime JWT.
Before t.Fail, write genuine PAT-origin legacy JWT ONLY to a root-reviewed private mount/file (0600/container + restrictive host ACL), outside tracked docs/source/public stdout/test2json.
Capture metadata: baseline source/binary hashes, actual route chain/statuses, subject, expiry, owned DB/snapshot/fullID/nonce, capture-file SHA and opaque signing-context reference; NO raw token/key/hash-as-credential in public evidence.
First RED uses normal native TTL (no short override), keeping this real pre-fix credential valid while M1+M2 is implemented. Never rewrite exp/iat or re-sign it.
After fix, SAME owned synthetic signing context must yield legacy /api/me200 but protected Issue/CLI403; wrong-key/expired401 cannot prove lineage exclusion.
For actual renewal-window proof later, use a NEW baseline capture only after baseline+candidate binaries/capsules are ready, with reviewed native AUTH_TOKEN_TTL120s per fresh helper process.
Then both explicit refresh and cookie renew must preserve legacy classification and remain protected403; original normal-TTL capture is not artificially aged. See bounded M1+M2 draft for full tests.
Keep baseline capture/PAT auth records under explicit owned-retention disposition; no automatic cleanup/revocation/fixture rerun. Private ephemeral token/signing files erased only by separately attested exact-ID/path cleanup.
No production/company credential or external email/model/CLI is used; MULTICA_DEV_VERIFICATION_CODE must remain unset, no /auth/send-code or email egress.

## 4. Runtime/proof gates and truthful next step

Root/security must approve exact new test source/binary, this auth-row delta, private capture sink/retention, selected3 names, no-proxy/no-egress and existing full-ID namespace bindings before runtime.
No Redis required now; current PostgreSQL5432-only namespace proof is retained. Warmed-cache, task/cloud, malformed provenance/renewal, seven mint children and nine title children remain NOT RUN here.
This slice can supply meaningful M1+M2 HTTP RED now without waiting for title mutations, but does not waive full combined-candidate tests or future3 independent title states.
New typed-API unit compile failures are NOT accepted RED: first show actual baseline PAT->CLI200 owner-borrow, preserve evidence, then implement the privately typed M1+M2 boundary.
Source owner ACK: this auth-only preparatory design under root/native-auth consumer + independent-security exact review; NOT a source dispatch, contract signature, BUILD or runtime approval.
All previous source/contract/card/status write sets remain unchanged; registrar/root owns any future narrow test card/runtime registration. This proposal changes nothing else.
