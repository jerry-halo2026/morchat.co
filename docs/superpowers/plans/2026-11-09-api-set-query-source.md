---
purpose: "Exact API-set diagnostic source Implementation Plan"
owner: docs-maintainers
status: current
updated: 2026-11-10
related: []
---
# Exact API-set diagnostic source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task. Steps use checkbox syntax.

**Goal:** Implement the one-shot fixed-contract diagnostic protocol with real fake-only behavior RED/GREEN and a native adapter source ready for independent review.
**Architecture:** Pure PowerShell coordinator and fixed fake adapter tests; minimal C# adapter source. Compile, assembly/provider load and real query are separate CLOSED gates. No Multica product architecture change.
**Tech Stack:** Existing PowerShell/.NET source only; no Add-Type/compiler/runspace/process/native activation.
**Spec:** E:\CodexData\incidents\morchat-20261106T233131\r125-api-set-contract-proposal.json SHAe36161be9b7d6fd13200935cf7d86b825c3b76e00bd8b85c482ce5b9b3cb6a6f plus independent design review bda606eb2ab7ec3642a8a66cad8dd97be0e813a55af75b56a8fbab9831ab579d and Root R126 TF.

## Global Constraints
- Fixed api-ms-win-core-errorhandling-l1-1-2. Exact source5/file64KiB/total320KiB/stdout16KiB limits in TF.
- Fixed slots AVAILABILITY/QUERY, named provider/export pair per normative review; no arbitrary callbacks in production entrypoint.
- Two acquired references remain distinct even with equal handle bits. Consume one-shot before first boundary; mark attempts before calls; whole-finally cleanup does not skip second reference.
- ABI, UInt16[260], signed HRESULT, exact returned length/NUL/ASCII DLL grammar, typed shape checks and no retry/fallback/upcast per TF normative fields.
- Fake-only tests; no existing source/authority changes, binary reads, environment/clock/OS/native query, C# compile or assembly/module/provider load. Future actual evidence defaults to UNPROVEN importer applicability/O0Ready false.

## Review Focus
- Exception after native acquisition but before caller result: preserve unknown ownership, no guessed free/clean proof.
- Release exception/failure: sticky UNKNOWN, second slot still handled; no finalizer retry.
- PowerShell string-false, arrays and coercible integers are not typed results.
- NUL/length/status malformed data never interpreted as a valid basename.
- Duplicate/reentrant invocation cannot obtain a second trace or rearm the original scope.

### Task 1: one minimal source and fake-TDD slice
**Files:** create only the TF exact5 under the incident directory:
r126-api-set-query-protocol.ps1; r126-api-set-query-protocol.tests.ps1; r126-api-set-query-native.cs; r126-api-set-query-protocol.tests.results.json; r126-api-set-query-source-report.json.

**Interfaces:** define concrete slot operation/result shapes before behavior implementation in the actual test fixture/interface table. The real coordinator and C# adapter must agree exactly; fake seams are test inputs, not runtime authority. Suggested unique entry names New-R126ApiSetScope / Invoke-R126ApiSetProtocol / Invoke-R126ApiSetDiagnostic; concrete selected names and typed data contract must be fixed in source report and tests, not left as prose. Internal names are owner's engineering decision; no Ethan question required.
- [ ] Write explicit named fake test inventory covering every requiredPureCases class and review-focus case. Create callable unimplemented protocol boundary as needed; no native type loading.
- [ ] Run positive behavior assertion against unimplemented boundary: record genuine RED with expected behavior mismatch, not missing-command/type/compiler/setup failure. Preserve all harness mistakes separately.
- [ ] Implement smallest pure coordinator/state/lifetime/result validation. Run RED covering cases to GREEN; assert exact operations/known refs/unknown errors/cleanup outcomes, not truthiness.
- [ ] Write native adapter SOURCE matching ABI and fixed protocol. Add source/static agreement checks, no compile. Label native semantic proof NOT RUN; pure GREEN does not certify C#/Win32.
- [ ] Run full pure and static-source suite, record exact commands/full bounded output/named counts/FAIL-SKIP-NOT RUN. Source creation scripts need not be duplicated into reports: source hashes and fixture descriptions bind them; actual test invocations/output must be complete.
- [ ] Self-review source default inertness, fixed production factory, per-reference cleanup, absence of implicit activation and extra IO. Recheck all fixed source inputs unchanged.
- [ ] Final five file sizes and hashes, results JSON/source report, all writes STOP. Independent Windows reviewer checks actual code/ABI/test evidence. No automatic compile/query or new task at handoff.

**Stop conditions:** Any fixed input/namespace mismatch, preexisting output, cap inability or safety ambiguity => preserve bounded failure and STOP, not reduced tests/raised caps. Source fix review follows maximum5 rounds; Root never repairs implementation itself.