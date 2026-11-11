// Package bench holds the knowledge retrieval load benchmark.
//
// The benchmark lives in bench_test.go behind the `bench` build tag, so the
// default test run (`go test ./...`) never seeds a database. Everything here is
// the corpus contract the test and the report in docs/tasks/KNOWLEDGE-BENCH.md
// share: one seed, one corpus size, one query set size. Changing a constant
// means the recorded numbers no longer describe the same experiment, so the
// report's "造数规模" section has to change with it.
//
// This file deliberately has no build tag: the package still compiles for
// `go build ./...` and `go test ./...`, it just has nothing to test until the
// tag is passed.
package bench

const (
	// Seed makes every run produce byte-identical chunk text. A rerun on a
	// freshly migrated database therefore measures the same corpus.
	Seed int64 = 20261111

	// ChunkCount is the corpus size the plan's retrieval budget is stated
	// against: 100k chunks.
	ChunkCount = 100_000

	// ItemCount is how many knowledge items the chunks are spread over, so the
	// permission simulation has enough rows to split into visible sets.
	ItemCount = 20

	// ChunkPerItem is the uniform chunk count per item; ChunkCount is an exact
	// multiple of ItemCount so the corpus size is exact, not approximate.
	ChunkPerItem = ChunkCount / ItemCount

	// QueryCount is the size of the annotated query set: 20 identifier queries
	// and 30 phrase queries.
	QueryCount = 50

	// IdentifierQueries is how many of the QueryCount queries are the bare
	// identifier (ZX-00417, 约定-42, ...). The rest are natural phrases taken
	// from the same gold chunk, which is the harder half of the set.
	IdentifierQueries = 20

	// ViewerCount is how many distinct visible sets the retrieval is filtered
	// through: three users, each owning a different share of the private items.
	ViewerCount = 3

	// ItemWorkspaceShared is how many of the items every member can see. The
	// remaining ItemCount-ItemWorkspaceShared items are private, owned by one
	// viewer each, except the ownerless tail which nobody can see.
	ItemWorkspaceShared = 6

	// TopK is the cutoff Recall@10 is measured at, and the result size the
	// latency is measured with.
	TopK = 10
)
