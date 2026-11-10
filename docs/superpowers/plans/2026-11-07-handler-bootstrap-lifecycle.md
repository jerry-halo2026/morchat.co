---
purpose: "Handler bootstrap lifecycle — reviewed one-file implementation"
owner: docs-maintainers
status: current
updated: 2026-11-10
related: []
---
# Handler bootstrap lifecycle — reviewed one-file implementation

Authority: docs/tasks/contracts/R1-ISSUE-READ-GUARD-bootstrap-lifecycle-r1-test-frozen.json. Multica remains the only substrate. This is test-fixture lifecycle repair, not an Auth bypass or handler53 acceptance.

1. Verify exact branch/HEAD, old handler_test.go hash, reviewed patch/candidate bytes and actual environment-review hash. Write owner/model/scope ACK before any source write. All other source writers are stopped.
2. Preserve before bytes. Apply only the reviewed captured-tuple lifecycle to server/internal/handler/handler_test.go. No changes to original test cases, DB exit behavior, Auth/schema or any other source file.
3. Verify destination equals reviewed candidate bytes. Run only pinned gofmt on this one path; preserve formatter output and token-equivalence proof for any formatting delta. No Go compile/test/vet, SQL, Docker, HTTP, private value reads or index operations.
4. Check the 1217-file accepted handler source manifest with only this one authorized difference, plus current three Leader test source pins. Preserve original host RED/GREEN with their static/model-only limits; do not claim business RED or GREEN.
5. STOP with actual source hashes, exact diff, covering commands and output. Independent actual-source review precedes a fresh compiler closure/ELF and separately approved handler53 runtime.

Environment repair already executed once with acknowledged commit and independent accepted facts. Never repeat its transaction, clear service35, reset roles/clones, read old keys or automatically rerun the original failed test.
