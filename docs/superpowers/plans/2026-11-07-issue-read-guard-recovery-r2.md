---
purpose: "Issue GET guard — operational recovery binding r2"
owner: docs-maintainers
status: current
updated: 2026-11-07
related: []
---
# Issue GET guard — operational recovery binding r2

> **For agentic workers:** use the parent continuous SDD task/ledger and TDD; this only rebinds resources after the incident, not a new product design or parallel source flow.

**Goal:** Resume the exact minimum GET guard without losing or inventing evidence after startup-cleanup.
**Architecture/Tech/Spec:** Original detailed plan `2026-11-07-issue-read-guard.md` SHA614a00092f05ccff395fbf17dedecf0afe079d4261350c6c1bbcd632a1434967 and tracked exact original R2 `docs/tasks/contracts/R1-ISSUE-READ-GUARD-r2-spec.md` SHA91e7fbe141bc4b635a9743943d56c4b0f613939753dcefb8c7fa0211a1e1a18b remain the semantic authority. Actual source contract `R1-ISSUE-READ-GUARD-r2-test-frozen.json` overrides ONLY operational root/tool/cache/WIP/evidence bindings.

## Current actual baseline and scope
- Existing host-created recovery tree E:/CodexData/worktrees/r1-02b-claim-pin/morchat.co, branch codex/round1-continuous, baseline 5abcca9dabc421958b665e3c69331a27b1781357. Original E morchat-round1 is not rebuilt, moved or used; D main/index stay untouched. Do not call managed-worktree tools/global settings.
- One product writer /root/guard_impl gpt-6.1-sol high; Root separate docs/metadata only. Exact same10 paths/14 required parents; service test9967 already exists as recovered own WIP, remaining5 new paths absent and4 modify paths original. No other code/API/schema/Auth/routes/locks/config changes.
- All keys/old raw artifacts remain LOST or unavailable; historical RED46b4 is a witnessed prior fact, not current revalidation. Original consumed101/201/202 stay protected; runtime fixture/context/DB access must be separately reviewed. Never synthesize missing original raw/key or imply same old context.

## Safe operational bindings
- Tools/caches/build/evidence now exclusively under non-managed E:/CodexData/morchat-r1-local. Go1.27.3 SHA83b7ba66215e696414fa49462d0db2da4f4cf15c7bebd42f0b189fa04866999d and Node22.23.4 dccc52de28d8df2ee22d2062424f8c563070d95d8ad70c54c4bf01d590dec14f match old pins.
- SQLC1.31.1 new binary c13fd8bd32ba201c85691bd9fd8471b22db2758e5068ffe0351c2d5cbb0a091e, same module h1:+V+BjBJfFNPX/RFfL8eiZD9jk9lVJUEGGllWvnYNqbc=, not old86ea. Official converter ec47ee671611093b6c62bec4dc3f339881a8fd2544a45341b04490dac9487df7 restored exactly. Reports224215/7a0cd and live tool/cache hashes independently accepted; no product compile claimed.
- GOMODCACHE E:/CodexData/morchat-r1-local/go-mod, GOCACHE E:/CodexData/morchat-r1-local/go-cache. 70 public locked modules fetched with matching sums; offline compilation can still expose a missing cache and must BLOCK rather than download or change locks.
- Fresh build/guard-r2/{gopath,home,localappdata,tmp,sqlc-staged,evidence}; all new SDK/source/self-review/compiler/CLI stdout-stderr/hash/diff records outside disposable worktrees. No own root `.local` or ignoredSDD as sole copy of critical evidence. Keep spec tracked; retain private logs in protected incident/safe directories, never stage secrets/rollouts.

## Execute the original seven steps, not a new preparation loop
1. Check actual TF/newRoot/base/beforehash and sole writer release. Continue tests first (14 parents and saved service test); handler draft in incident is only an unwritten draft until intentionally implemented under scope. No undefined-API compile failure counts as business RED.
2. Implement exact original R2 owned attempt/lifetime/current ACL/one-hop globally ordered locks+bounded retry/scope-only full Tx hydration+buffer-commit-before200. No semantic changes from this rebind.
3. Use locked SQLC staged config clone (only three path fields; original config unchanged), compare complete output, STOP before sourcecopy on any unauthorized diff; only models.go/enterprise_acl.sql.go may copy. No hand edit generated.
4. Fresh GREEN source fixture301/302 stays source-only until separately approved runtime; include old10OTP/PAT and existing state immutable, preserve original4events/two locators/all assertions.
5. Clean Environment.Clear fixed offline Go test -c for service/handler/cmd-server -> three safe external ELF files; gofmt exact changed Go/vet allowed. Never execute test binary/TestMain/app in source phase. Save actual exit/log/hash/argv/env/generated audit and full exact diff.
6. Stop writer for independent SPEC+QUALITY. Root separately freezes actual component/native runtime source/ELF/fixture/context/names/profile/old-state protections and revalidates real behavior; no missing-DB skip, mirror/overlay or fake current-key claim.
7. Complete real failure/fix/regression/review/checkpoint before local integration; missing old evidence remains explicitly LOST, historical entries unchanged. No Issue/Auth BUILD or Goal completion merely from recovery, compilation, cache availability or unit results.

Source permission activates only after actual new TF/plan/card/checkpoint independent review and explicit Root dispatch. DB/keys/OTP/HTTP/helper/DSH/cloud models remain NOT RELEASED. User's first-round full scope is unchanged.
