---
purpose: 知识库六屏的实拍与说明（S1 首页 / S2 阅读 / S4 条目 / S5 导入）
owner: lead
status: current
updated: 2026-11-11
related: [docs/plans/KNOWLEDGE-INTEGRATION-PLAN.md]
---
# Knowledge UI — reference captures (B1)

Screens of the knowledge space as it renders on the local dev stack, captured
with Playwright (Edge, 1440×900, zh-Hans locale) against
`http://localhost:3000` and the Go API on `:8080`.

| File | Screen | Route |
| --- | --- | --- |
| `s1-knowledge-home.png` | S1 home — space/tree rail, "recently modified", create + import | `/{ws}/knowledge` |
| `s2-knowledge-reader.png` | S2 reader — tree / body / properties (access, provenance, backlinks, revisions) | `/{ws}/knowledge/{space}/{path}` |
| `s4-knowledge-items.png` | S4 entries — table + detail drawer | `/{ws}/knowledge/items` |
| `s5-knowledge-import.png` | S5 import drawer — source → chunk preview → progress | `/{ws}/knowledge` (drawer open) |

## Why the empty states

The pages/spaces/items/search endpoints are still contract-only: the knowledge
handler that shipped (`server/internal/handler/knowledge.go`) exposes
`upload-url`, `import`, `import/{taskId}[/events]`, `items/{itemId}/chunks/preview`,
`retrieval-test` and the agent tools — the browsing surface (pages, spaces,
item list, search) has no route yet. The dev server running on `:8080` predates
even those, so every knowledge request answers 404 and the screens draw their
"后端未就绪" state instead of failing. Capturing them empty is the intended
behaviour, not a workaround: a workspace without a knowledge API must be usable.

S1 shows the rail's tree placeholder, the local recent/favorites rails (empty on
a fresh account) and the create/import affordances. S2 shows the three-column
shell with the right-hand property rail; a missing page renders the red-link
"create this page" card. S4 shows the entries table's empty state behind the
same message. S5 is fully exercised UI — the drawer's three steps, four source
kinds and the space picker all render without a backend.

Re-shoot after the server lands the browsing routes; nothing in the screens
changes shape, the states simply fill in.

## `live/` — W1-AG3 re-shoot against the running API (2026-11-11)

A second pass hit the same wall for a different reason: the binary serving `:8080`
is from `2026-11-10 18:19`, and the knowledge routes landed in `ba1ef19da` at
`2026-11-11 00:51`. Every screen therefore renders the same "后端未就绪" card,
including the two that had no capture before (S3 editor, S6 retrieval test).

| File | Screen | Route |
| --- | --- | --- |
| `live/s1-home.png` | S1 home | `/{ws}/knowledge` |
| `live/s2-reader.png` | S2 reader | `/{ws}/knowledge/{space}/{path}` |
| `live/s3-edit.png` | S3 editor | same route `?mode=edit` |
| `live/s4-items.png` | S4 entries | `/{ws}/knowledge/items` |
| `live/s5-import.png` | S5 import drawer | `/{ws}/knowledge` (drawer open) |
| `live/s6-retrieval.png` | S6 retrieval test | `/{ws}/knowledge/retrieval-test` |
| `live/s6-retrieval-run.png` | S6 after 运行测试 | `POST /api/knowledge/retrieval-test` → 404 |

Details, request/response log and the cleanup result: [UI-VERIFICATION](../../../tasks/UI-VERIFICATION.md).
