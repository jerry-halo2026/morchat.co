---
purpose: "R56 DSH foreign-frame owner specification (DRAFT pending Root TEST-FROZEN)"
owner: task-owners
status: draft
updated: 2026-11-07
related: []
---
# R56 DSH foreign-frame owner specification (DRAFT pending Root TEST-FROZEN)

Task: R1-02C-DSH-FOREIGN-FRAME. Actual owner / future implementer: /root/dsh_frame_impl. Actual spawn routing reported by Root: gpt-6.1-sol, reasoning medium; agent identity /root/dsh_frame_impl. This records route metadata only, not inferred underlying model internals. Date: 2026-11-07.

## Authority and evidence
Read repository AGENTS.md, docs/README.md, ROUND1-DELIVERY.md (R1-AUTH-r1), baseline scope introductions, current handler/test/TestMain, and assigned proposal SHA256 6407e1b160ce88107616abb91e7ca246f8c0f4036f7053abec0d00c7a4302635. SDD, TDD and writing-plans skills read; controller/implementation-only machinery not invoked for this preparation task. This incident artifact is not a repository contract or execution authorization.
Inspected tree: E:/CodexData/worktrees/r1-02b-claim-pin/morchat.co. Root supplies HEAD 5abcca9dabc421958b665e3c69331a27b1781357, branch codex/round1-continuous; HEAD/branch not independently queried here. The 25-path index review and successor baseline remain Root-owned. No index/HEAD/source/docs writes or tests performed.

## Owner decision and root cause
ACK: in handleDshFrame(frame dshFrame, requestID string, ch chan<- Message, state *dshRunState), a nonempty frame.RequestID unequal to requestID must return before all version checks and dispatch; any Version, Type or payload is ignored with unchanged full state and no channel emissions. Matching and empty IDs retain existing version validation and type handling. No whitespace normalization, request-ID generation change, new DTO, new protocol or new state machine.
Current order validates Version first and overwrites protocolError, then filters foreign ID. This is a static inconsistency, not observed production cross-run corruption. Current valid terminal result retains its existing precedence. The handler-only no-side-effect guarantee does NOT include Execute scanner frameCount, which increments before the call; do not move that accounting.
The minimal future product edit moves the existing nonempty foreign-ID guard ahead of Version validation and may add a clarifying comment. Everything else stays unchanged.

## Exact allowed future source paths and observed before SHA256
- server/pkg/agent/dsh.go: 9132ccdc9fcd8e91bcf53eae58461aa3fedbbfc69ddcb591b1536b76f538d6ab
- server/pkg/agent/dsh_test.go: 0e3d909d9e6d143c87aa38de02ec7ac8debbb5cde9d4baf489948c632822c9c5
Protected outside write set: server/pkg/agent/claude_deadlock_test.go SHA256 f4b9248fe00a8317bef443192011633744e8151b282192fe53a8d83cce38ade4, including TestMain and helper dispatch. Existing tests/helpers in dsh_test.go must remain semantically and textually unchanged except the import addition needed for deep comparison; append new tests only. Root must rebind exact baseline/hashes before opening a write window. Mismatch => STOP, not overwrite.

## Acceptance, deliberately limited
Three new parent tests, four children, seven Go test run/pass events after the minimal fix; child bodies call only handleDshFrame with buffered channels and owned in-memory state. No goroutines, timing, subprocess, shell fixture, network, DB, provider/model or actual DSH. Unsupported foreign frame test must assert deep state AND message equality, not merely protocolError.
Matching v999 still sets exact diagnostic; matching v1 session still sets session and emits the existing running MessageStatus. Empty-ID v1 ready/runtime=dsh remains compatible. Empty-ID unsupported-version behavior is preserved by unchanged shared version path but not a separate eighth test event.
No claims of full C05/C06, receipt/usage deduplication, complete request attribution for empty IDs, Windows behavior, actual DSH, process stop, gateway cost, or R1-02 E2E. General semantic guard covers all nonmatching IDs/types by control-flow inspection; these seven events are a bounded fixture, not exhaustive input coverage.

## Gate
Owner semantic ACK only. Root confirmed consumer agreement including handler-only boundary via message. Independent integration_review_r56 verdict, Root TEST-FROZEN decision, exact successor baseline, single-writer handover and separately reviewed compile/runtime profile remain prerequisites. Until Root explicitly opens a source window: preparation complete; STOP.
## Routing/toolchain correction r1
Root supplied the already verified compiler: E:/CodexData/morchat-r1-local/tools/go127/go/bin/go.exe, Go 1.27.3, SHA256 83b7ba66215e696414fa49462d0db2da4f4cf15c7bebd42f0b189fa04866999d. The module go 1.26.9 line is a minimum declaration, not the locked compiler. Adopt the exact locked settings in the plan; this owner has not run Go or revalidated toolchain execution. server/go.mod SHA256 616f1d455fc5f9ac436c9aea8773e5a5c491271f321ad9663cc675063205230e; server/go.sum SHA256 5e6088b07fa11ab4ebe3f5896fb5dd6cc369bc8800d5462485d85f0f97abd786 (Root supplied). No downloads. Full agent runtime profile remains separately unfrozen; no daemon-profile reuse. Successor baseline awaits Root index commit. Original three artifacts retained as .prerouting-r1.
## Input-pin correction r1 (host-only evidence)
The earlier dsh_test.go pin was transcribed as 65 hexadecimal characters. Earlier statements that all pins matched were invalid: hash output was viewed, not programmatically compared to the artifact pin or checked for SHA256 length. A host-only correction check actually reproduced FAIL (65 != 64 and artifact != file), then computed the pin from file bytes, compared all three source/protected-file SHA256 values to byte-preserving read-only Git baseline d683 content, and enforced ^[a-f0-9]{64}$. The exact comparisons and before/after checks are in r56-dsh-owner-input-pin-correction.json; sourceHashes in ACK is generated, not hand-copied. Original drafts retained as .prehash-fix-r1. Proposal 6407e1b...2635 and old review are historical inputs, not valid hash-gate approval. Semantic contract and seven-event plan are unchanged. Root registration failed before TF/card/ACTIVE writes; source window remains CLOSED. No source/test/Go/agent CLI execution; only host file hashing and read-only Git object extraction. No repository writes by this owner.