---
purpose: "Skill claim pin Implementation Plan"
owner: docs-maintainers
status: current
updated: 2026-11-07
related: []
---
# Skill claim pin Implementation Plan

> **For agentic workers:** use the parent continuous Superpowers SDD execution; one serial product writer, exact source TF and separate runtime release. This is its bounded R1-02B task, not a second task authority.

**Goal:** Reject cold claimed-v1/current-v2 ordinary skill bytes without losing legal new-v2 claims or mixing independent cached versions.
**Architecture:** Native daemon resolves one original claim ref; reuse validateSkillBundle(originalRef,bundle) and original-ref cache lock before Store. Server remains current-only, so unavailable historical bytes fail closed; no server history/API/cache rewrite.
**Tech Stack:** Existing Go daemon/client/cache; pinned Go1.27.3, offline readonly modules; existing native HTTP protocol.
**Spec:** docs/tasks/contracts/R1-02B-CLAIM-PIN-r2-spec.md SHA59f629e3b3ba477526d6733fb1f82b15cee1a6a1e311d10ab4aa0121f3246cb5. Its historical cache_owner candidate is superseded only by actual owner claim_pin_impl in source TF. Actual owner ACKb28dd8 and proposal review092dcf retained.

## Global Constraints
- Exact two files: server/internal/daemon/daemon.go and skill_bundle_resolve_test.go. Protect all guard paths, cache implementation, producer/client/protocol/schema/lock/config and other tests.
- Source permission activates only after actual TF review, guard STOP/approved handoff and Root sole-writer release. No concurrent product writers in this tree.
- Actual test binary/DB/network/CLI/model execution requires its later exact isolated runtime. Compilation does not execute init/TestMain; no production fix or old acceptance rewrite before independently accepted meaningful RED.
- Same workspace/source/id can have separately pinned hashes; claims remain deeply unchanged. Self-consistent wrong-version bundles still reject. Historical Store guard evidence remains LOST until fresh same-candidate component revalidation.

## Review Focus
- Hash fixtures: choose source/id/body/files before BuildManifest, then validate each own-ref bundle; test A/C/D both workspace and builtin.
- Poisoned cold cache: A checks original-ref request once, typed unavailable error, no publication and BOTH v1/v2 cache keys absent.
- Hot version and sharing: C zero resolver calls; D same cache/workspace with independent agents/tasks/runtime IDs, v1 and v2 exact byte content retained and v1 reread after v2.
- Legitimate update and write failure: B legal newclaim-v2 positive, E partial success preserved, F valid bytes survive cache-store failure, G plugin mismatch still rejects.
- Transport/TestMain: only A/C/D are zero socket; B/E/F/G own loopback. Fresh-from-birth environment excludes Pi cleanup controls and all real CLI/provider/config/proxy credentials; never relabel this component test DSH/E2E.

## Task: two-file minimum fix, with a real TDD stop gate
1. [ ] Verify actual TF/hash/owner/source window. Add ONLY A TestEnsureTaskSkillBundles_RejectsClaimHashDrift with workspace/builtin children and local memory transport/helper; leave daemon.go and old AcceptsServerSideSkillUpdate byte unchanged. Assert own-ref versions valid, one exact original-v1 protocol request returning complete valid-v2; errors.Is unavailable, Skills nil, refs unchanged, Load(v1/v2) both misses.
2. [ ] Clean offline whole-daemon test-c to safe claim-pin-red-linux.test, exact Go/env; gofmt test file and vet daemon. Save complete diff/before-after/real exits/hash. STOP writer. Runtime NONE until Root separate release.
3. [ ] Root independently reviews source/ELF/profile and executes exact ^TestEnsureTaskSkillBundles_RejectsClaimHashDrift$ once in a fresh NONE nonDB helper. Meaningful RED expects Go1/converter0/3run3fail0skip for parent+twochildren from mismatch/no-publication/cache assertions, not fixture/setup/compile failure. Preserve raw and independent RED acceptance before product changes. Fresh cache Store seven-event component revalidation may run separately under its exact selector, not claimed from history.
4. [ ] After Root explicit post-RED source release, minimally change only resolveSkillBundle validation/lock to originalRef; no self-derived replacement ref. Add C/D per spec. Explicitly rename/comment old acceptance into B legal newclaim-v2 while retaining its structure; do not delete contradictory control before RED. Existing E/F/G remain assertions.
5. [ ] Clean offline whole-daemon test-c to distinct claim-pin-green-linux.test, gofmt exact2/vet daemon and self-review. STOP. Preserve red ELF/raw; do not overwrite red result.
6. [ ] Root separately binds actual names/source/binary/profile and runs exact spec GREEN selector:7parents+8children=15run15pass/noSkip, Go0/converter0; plus same-candidate cache selected7 events. Fault/setup/skip is not green. Independent SPEC+QUALITY review and affected regression required.
7. [ ] Record ACTIVE/card/results/reviewed snapshot, consumer ACK for this limited fail-closed component and whitelist local integration only when actual applicable evidence passes. No full historical retention/hot revocation/Windows/full R1 BUILD claim.

Self-review: A-D and E-G cover all spec sections and five focus classes; existing resolveSkillBundle signature/API stays unchanged. No unspecified algorithm/body/field decisions left for Ethan. Existing continuous authorization supplies execution method and engineering review; no repeat user approval for scoped local work.