---
purpose: "Active MAT fixture and panic observation — one-file source implementation"
owner: docs-maintainers
status: current
updated: 2026-11-10
related: []
---
# Active MAT fixture and panic observation — one-file source implementation

Authority: docs/tasks/contracts/R1-ISSUE-READ-GUARD-active-mat-diagnostic-r1-test-frozen.json and immutable source candidate/reviews. This does not certify panic cause or schema semantics.

1. Verify exact before c9af source and reviewed 7216 patch/fe6be candidate; preserve before. Root assigns only guard_fixture_impl to this source. F5 source writer has STOPPED and current1a7 must remain unchanged.
2. Apply only server/internal/handler/issue_access_test.go. Make MAT valid and active with a strictly owned runtime/agent/task/token, observe actual authenticated private tuple, keep native403/reached/noTx. Panic changes are diagnostic only; do not remove reached/rollback/scope/noSuccess assertions or claim bug fixed.
3. Pinned gofmt only this file; preserve actual diff/hash/token proof. No Go build/test/vet, SQL/DB/Docker/private values/schema/role changes. STOP for actual source review.
4. Only a new separately audited fixture epoch with actual20-table/286-column source/default/trigger certification, all oldruntime/before rows protected, fresh build and exact two-leaf/four-named runtime may diagnose. Old42/service35 are retained; no reset or owned0 rerun. Full53 remains separate incomplete gate.
