---
purpose: "Persistent-host consumer implementation plan"
owner: docs-maintainers
status: current
updated: 2026-11-10
related: []
---
# Persistent-host consumer implementation plan
Spec: exact Root source-test-frozen contract referenced by R1-00R4 taskcard. This is one baseline prerequisite, not a replacement Goal. User delegated engineering choices; use existing PowerShell/guard, no new framework.
## Constraints
Existing6inputs immutable. Only NEW4 source/test/results/DRAFT binding. Actual owner ACK and independent preflight precede implementation. At most2 auxiliary in-process runspaces; no child/native/filesystem sample or installation. Preserve every FAIL/UNKNOWN/NOT RUN and raw test output.
## Task 1 — Consumer TDD (sole actual writer)
- Write tests first calling complete original module functions with real original PSHost passed to runspaces. Cover live parent hold, concurrent same-module recovery, exact references, wrong/replaced/serialized capability, host/session/channel mismatch, no channel, replay/max1, diagnostic/recovery fault and unresolved owner retention.
- Run InProcessNoChild and retain genuine assertion RED. Parser errors/missing test dependencies are harness failures, not behavioral RED.
- Implement minimum adapter over original module/private same-reference capability store; use actual dispatch synchronization without holding lock across parent Wait. Do not copy module or patch Host.
- Re-run same tests for GREEN; full command/output/history and exact hashes in results. Default adapter import performs no work. DRAFT binding not filled with fake actual-host authority.
## Task 2 — Independent source and consumer review
- Writer STOP, Root hashes four deliverables and verifies immutable inputs; independent reviewer assesses spec+quality and scope of real in-process evidence.
- Any Important enters original-author fix rounds1–3 then stronger fresh4–5, cap5; Root does not fix implementation.
- Only consumer-mechanics evidence may be accepted. Actual persistent tool-session/runtime/once/sampling gates remain separate; no fourth install, no fullGoal completion.