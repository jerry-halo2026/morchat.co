# Knowledge base

The workspace knowledge base is where a run leaves something behind. Three MCP
tools, and the rules for what deserves to be kept.

## The three tools

| Tool | Arguments | Answer |
|---|---|---|
| `knowledge.search` | `query` (required), `top_k`, `mode`, `space_id`, `score_threshold`, `rerank` | The best matching chunks, each with its source item, document, heading path and score |
| `knowledge.get` | `item_id` (required), `document_id`, `include_chunks`, `chunk_limit` | One item and, by default, its document's chunks |
| `knowledge.write` | `title` and `content` (required), `space_id`, `source_ref` | The item and document the write produced |

Search first, read second: `knowledge.search` returns passages,
`knowledge.get` returns the document a passage came from. A hit's `item_id` is
the argument to `knowledge.get` — without it you are reading chunks with no
surrounding text.

`knowledge.write` takes a Markdown body. Omit `space_id` and the note lands in
the workspace's General space, created on first use. Put the issue link in
`source_ref`: that is what the item shows as its source. Some runtimes spell
the tools with underscores (`knowledge_search`); they are the same tools.

## What to write

- A conclusion and the evidence it rests on.
- A trap you hit and the way around it.
- A step or command sequence worth running again.
- A decision and the reasons behind it, including what you rejected.
- An external system's interface contract: endpoints, fields, units, quirks.

## What not to write

- The narrative of the run — what you tried, in what order.
- One-off intermediate data.
- A fact already in the code, the issue or the diff; link to it instead.
- Anything private to another person.

## How to write it

- Title: a searchable noun phrase ("千川报表取数的 token 刷新"), not a sentence,
  and not "Notes".
- Body: conclusion first, then the detail that supports it.
- Commands and payloads in fenced code blocks, copy-pasteable as written.
- Short. One page that gets read beats three that get skimmed.

## One topic, one item

Run `knowledge.search` for the topic before writing. If an item already covers
it, merge the new conclusion into that item's body instead of creating a second
one: two near-identical items split the evidence and neither wins the search.

## Say what you left behind

A write nobody can find may as well not have happened. In your reply or result
comment, give the item a link and one sentence on what it now covers.

## The write waits

`knowledge.write` blocks while the document runs through ingest — chunking,
then indexing — for up to 45 seconds. A timeout is not a failure: the task
keeps running and the document becomes searchable shortly after. Confirm with
`knowledge.search` before writing again; retrying on timeout is how one note
lands twice.

## What the tools do not do

They add no second door to permissions. `knowledge.search` and `knowledge.get`
run as the calling agent, so a space or item you cannot read answers
`knowledge_forbidden`, exactly as it would for a member. That is why the
identity you write under matters: the note inherits your visibility.
