---
purpose: "NM03-A Workspace Bootstrap Implementation Plan"
owner: docs-maintainers
status: current
updated: 2026-11-10
related: []
---
# NM03-A Workspace Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New company creation atomically provisions explicit department membership and separate creation grants without bypassing resource ACL.
**Architecture:** Extend existing CreateWorkspace Tx only; typed queries from same Tx; no extra backend. Keep running reviewed demo unchanged; this candidate remains isolated until later whole business integration.
**Tech Stack:** Existing Go1.27.3, pgx/PostgreSQL17, sqlc1.31.1, native httptest/Auth.
**Spec:** docs/tasks/NM03A-WORKSPACE-BOOTSTRAP.md plus approvedA scope in NATIVE-CREATION-REVIEW §2.

## Global Constraints
Exact9 source paths, single owner, current WIP hashes, no model/credential/real data operations. Existing actor/GET/role/617 constraints are not weakened; old-company adoption and B/lifecycle remain incomplete.

## Task 1 — Real public API behavior RED
- [ ] Owner ACK exact successor APIs/input/error/source bounds; reviewer signs TEST-FROZEN tests-only.
- [ ] Owner creates only new cmd/server test using native OTP→Me and random owned workspace; compile-only, final source review.
- [ ] Root reattaches retained isolated synthetic volume without reset, validates explicit URL and database identity before TestMain.
- [ ] Root runs exact opt-in selector, confirms actual named failure department0 vs1, retains raw/exit/hash; no missing API/table compile errors count as RED.

## Task 2 — Minimum schema and atomic product repair
- [ ] Root releases exact production9 paths only after consumed RED and exact negative/fault matrix ACK.
- [ ] Owner adds new migration (allocated619 only if still free), three typed queries; runs existing locked sqlc into private output, compares expected drift before applying2 generated files.
- [ ] Owner implements native actor + strict request decode + same-Tx bootstrap/cleanup; preserve original status/event semantics and all prior source boundaries.
- [ ] Node model operations remain independent and cannot touch schema/workspace code.

## Task 3 — Same candidate acceptance, no premature deployment
- [ ] Root native migration/target assertion in explicit synthetic DB; run first RED test to GREEN.
- [ ] Credential/input/fault/cancellation/ambiguous-commit/no-backfill/two-connection isolation/conflict tests run with actual named events, no skip/permission relaxation.
- [ ] Full existing GET53/service42 and actual native creation compatibility on same candidate; original creation-read stillRED until B, record it rather than hiding.
- [ ] Locked gofmt/vet/sqlc provenance; independent source+evidence review and only whitelisted local commit if accepted. No main merge, push or deploy.
- [ ] Update ACTIVE/card/results/reviewed checkpoint; immediately progressB under its own reviewed frozen interface, not wait on remote model/second device and not mark complete from A.
