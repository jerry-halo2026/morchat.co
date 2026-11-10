package knowledge

import (
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"testing"
)

// Paths from this package directory out to the two declarations that must agree
// with the registry.
const (
	tsTypesPath   = "../../../packages/views/lib/knowledge/types.ts"
	migrationUp   = "../../migrations/637_wiki_knowledge.up.sql"
	migrationDown = "../../migrations/637_wiki_knowledge.down.sql"
)

func readFile(t *testing.T, path string) string {
	t.Helper()
	body, err := os.ReadFile(filepath.Clean(path))
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	return string(body)
}

var (
	tsConstPattern     = regexp.MustCompile(`(?s)export const ([A-Z][A-Z0-9_]*) = \[(.*?)\] as const;`)
	tsStringPattern    = regexp.MustCompile(`"([^"]*)"`)
	tsNumberConst      = regexp.MustCompile(`export const ([A-Z][A-Z0-9_]*) = (\d+);`)
	tsInterfacePattern = regexp.MustCompile(`(?s)export interface (\w+) \{(.*?)\n\}`)
	tsFieldPattern     = regexp.MustCompile(`(?m)^\s*([a-z][a-z0-9_]*)\??:`)
)

// TestRegistryMatchesViewTypes is the anti-drift check plan §5 rule 4 asks for:
// the Go registry and the handwritten TS declarations carry the same enum value
// sets, in the same order.
func TestRegistryMatchesViewTypes(t *testing.T) {
	ts := readFile(t, tsTypesPath)

	consts := map[string][]string{}
	for _, match := range tsConstPattern.FindAllStringSubmatch(ts, -1) {
		var values []string
		for _, value := range tsStringPattern.FindAllStringSubmatch(match[2], -1) {
			values = append(values, value[1])
		}
		consts[match[1]] = values
	}
	if len(consts) != len(Enums) {
		t.Fatalf("types.ts declares %d value sets, registry has %d: %v", len(consts), len(Enums), consts)
	}

	for _, enum := range Enums {
		tsValues, ok := consts[enum.TSConst]
		if !ok {
			t.Fatalf("%s: types.ts does not declare %s", enum.Field, enum.TSConst)
		}
		if !reflect.DeepEqual(tsValues, enum.Values) {
			t.Errorf("%s: types.ts %v != registry %v", enum.Field, tsValues, enum.Values)
		}
		if !enum.Has(enum.Default) {
			t.Errorf("%s: default %q is not a member of %v", enum.Field, enum.Default, enum.Values)
		}
	}
}

// TestRegistryMatchesMigrationConstraints pins the registry to the DDL. A CHECK
// that is renamed or whose values drift would otherwise be invisible until a
// write hits it in production.
func TestRegistryMatchesMigrationConstraints(t *testing.T) {
	up := readFile(t, migrationUp)
	for _, enum := range Enums {
		// CONSTRAINT <name> CHECK (<column> IN ('a', 'b', ...))
		pattern := regexp.MustCompile(`CONSTRAINT\s+` + regexp.QuoteMeta(enum.Constraint) +
			`\s+CHECK\s*\(\s*` + regexp.QuoteMeta(enum.Column) + `\s+IN\s*\(([^)]*)\)\s*\)`)
		match := pattern.FindStringSubmatch(up)
		if match == nil {
			t.Errorf("migration %s: constraint %s on column %s not found",
				migrationUp, enum.Constraint, enum.Column)
			continue
		}
		var values []string
		for _, value := range strings.Split(match[1], ",") {
			values = append(values, strings.Trim(strings.TrimSpace(value), "'"))
		}
		if !reflect.DeepEqual(values, enum.Values) {
			t.Errorf("%s: DDL %v != registry %v", enum.Field, values, enum.Values)
		}
	}

	// The mode enum lives on knowledge_instances.search_mode with a DEFAULT that
	// matches the registry, so a created instance reads back as Mode.Default.
	if !strings.Contains(up, "search_mode text NOT NULL DEFAULT '"+Mode.Default+"'") {
		t.Errorf("migration: knowledge_instances.search_mode DEFAULT is not %q", Mode.Default)
	}
	for _, enum := range []Enum{Kind, SourceType, Status, ACLMode, ParseEngine} {
		if !strings.Contains(up, enum.Column+" text NOT NULL DEFAULT '"+enum.Default+"'") {
			t.Errorf("migration: %s DEFAULT is not %q", enum.Column, enum.Default)
		}
	}
}

// TestWireTypesMatchViewInterfaces compares the JSON field set of every wire
// struct with the TS interface that declares it.
func TestWireTypesMatchViewInterfaces(t *testing.T) {
	ts := readFile(t, tsTypesPath)

	interfaces := map[string][]string{}
	for _, match := range tsInterfacePattern.FindAllStringSubmatch(ts, -1) {
		var fields []string
		for _, field := range tsFieldPattern.FindAllStringSubmatch(match[2], -1) {
			fields = append(fields, field[1])
		}
		sort.Strings(fields)
		interfaces[match[1]] = fields
	}

	for _, tc := range []struct {
		tsName  string
		goValue any
	}{
		{"KnowledgeItem", Item{}},
		{"KnowledgeDocument", Document{}},
		{"KnowledgeChunk", Chunk{}},
		{"KnowledgeRetrievalRequest", RetrievalRequest{}},
	} {
		var goFields []string
		typ := reflect.TypeOf(tc.goValue)
		for i := 0; i < typ.NumField(); i++ {
			name, _, _ := strings.Cut(typ.Field(i).Tag.Get("json"), ",")
			if name == "" || name == "-" {
				continue
			}
			goFields = append(goFields, name)
		}
		sort.Strings(goFields)

		tsFields, ok := interfaces[tc.tsName]
		if !ok {
			t.Errorf("types.ts does not declare interface %s", tc.tsName)
			continue
		}
		if !reflect.DeepEqual(goFields, tsFields) {
			t.Errorf("%s: Go fields %v != TS fields %v", tc.tsName, goFields, tsFields)
		}
	}
}

// TestEmbeddingDimAgrees pins the vector dimension across registry, TS and DDL.
func TestEmbeddingDimAgrees(t *testing.T) {
	ts := readFile(t, tsTypesPath)
	up := readFile(t, migrationUp)

	match := tsNumberConst.FindStringSubmatch(ts)
	if match == nil || match[1] != "KNOWLEDGE_EMBEDDING_DIM" {
		t.Fatalf("types.ts: KNOWLEDGE_EMBEDDING_DIM not found")
	}
	dim, err := strconv.Atoi(match[2])
	if err != nil {
		t.Fatal(err)
	}
	if dim != EmbeddingDim {
		t.Fatalf("types.ts dim %d != registry %d", dim, EmbeddingDim)
	}
	if !strings.Contains(up, "vector("+strconv.Itoa(EmbeddingDim)+")") {
		t.Fatalf("migration does not create vector(%d)", EmbeddingDim)
	}
}

// TestMigrationOptionalExtensionsAreFailSoft asserts the shape plan §4 requires:
// pgcrypto / pg_trgm / pg_bigm / vector are attempted inside guarded DO blocks,
// so a database without any of them still migrates.
func TestMigrationOptionalExtensionsAreFailSoft(t *testing.T) {
	up := readFile(t, migrationUp)

	blocks := doBlocks(up)
	for _, extension := range []string{"pgcrypto", "pg_trgm", "pg_bigm", "vector"} {
		statement := "CREATE EXTENSION IF NOT EXISTS " + extension + ";"
		index := strings.Index(up, statement)
		if index < 0 {
			t.Fatalf("migration does not attempt %s", extension)
		}
		enclosing := blockContaining(blocks, index)
		if enclosing == nil {
			t.Errorf("%s: CREATE EXTENSION is not inside a DO block", extension)
			continue
		}
		if !strings.Contains(*enclosing, "EXCEPTION WHEN OTHERS THEN") {
			t.Errorf("%s: DO block has no EXCEPTION handler", extension)
		}
	}

	// The embedding column must be conditional on pg_extension, never a plain
	// top-level ALTER: that is what lets the migration run without pgvector.
	if strings.Contains(up, "\nALTER TABLE public.knowledge_chunks ADD COLUMN") {
		t.Error("embedding column is added outside the guarded block")
	}
	if !strings.Contains(up, "IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')") {
		t.Error("embedding column is not gated on pg_extension")
	}
}

// TestDownDropsEveryUpTable keeps the rollback honest: whatever the up file
// creates, the down file removes.
func TestDownDropsEveryUpTable(t *testing.T) {
	up := readFile(t, migrationUp)
	down := readFile(t, migrationDown)

	created := regexp.MustCompile(`CREATE TABLE public\.(\w+)`).FindAllStringSubmatch(up, -1)
	if len(created) == 0 {
		t.Fatal("up file creates no tables")
	}
	dropped := map[string]bool{}
	for _, match := range regexp.MustCompile(`DROP TABLE IF EXISTS public\.(\w+);`).FindAllStringSubmatch(down, -1) {
		dropped[match[1]] = true
	}

	for _, match := range created {
		if !dropped[match[1]] {
			t.Errorf("down file does not drop public.%s", match[1])
		}
		if !strings.HasPrefix(match[1], "knowledge_") {
			t.Errorf("table %s is not namespaced knowledge_*", match[1])
		}
	}
	if len(dropped) != len(created) {
		t.Errorf("down drops %d tables, up creates %d", len(dropped), len(created))
	}
}

// doBlocks returns the bodies of every `DO $$ ... $$;` block, with the offset of
// each block's start recorded alongside.
func doBlocks(sql string) []doBlock {
	var blocks []doBlock
	const opener = "DO $$"
	offset := 0
	for {
		start := strings.Index(sql[offset:], opener)
		if start < 0 {
			return blocks
		}
		start += offset
		end := strings.Index(sql[start:], "$$;")
		if end < 0 {
			return blocks
		}
		end += start
		blocks = append(blocks, doBlock{start: start, end: end, body: sql[start : end+3]})
		offset = end + 3
	}
}

type doBlock struct {
	start int
	end   int
	body  string
}

func blockContaining(blocks []doBlock, offset int) *string {
	for i := range blocks {
		if offset >= blocks[i].start && offset <= blocks[i].end {
			return &blocks[i].body
		}
	}
	return nil
}
