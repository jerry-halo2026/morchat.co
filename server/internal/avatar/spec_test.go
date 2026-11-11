package avatar

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// The derivation vectors are the contract between this package and
// packages/core/avatar/aora-spec.ts. Both sides reproduce them; a change to either
// implementation fails here before it reaches a user whose avatar would render
// differently in the web and desktop apps.
type vectorsFile struct {
	Note    string `json:"note"`
	Vectors []struct {
		ID      string `json:"id"`
		Spec    Spec   `json:"spec"`
		Encoded string `json:"encoded"`
	} `json:"vectors"`
}

func loadVectors(t *testing.T) vectorsFile {
	t.Helper()
	path := filepath.Join("..", "..", "..", "testdata", "aora-vectors.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read vectors: %v", err)
	}
	var file vectorsFile
	if err := json.Unmarshal(raw, &file); err != nil {
		t.Fatalf("decode vectors: %v", err)
	}
	if len(file.Vectors) == 0 {
		t.Fatal("vectors file is empty")
	}
	return file
}

func TestDeriveSpecMatchesSharedVectors(t *testing.T) {
	for _, vector := range loadVectors(t).Vectors {
		got := DeriveSpec(vector.ID)
		if got != vector.Spec {
			t.Errorf("derive(%q) = %+v, want %+v", vector.ID, got, vector.Spec)
		}
		if encoded := got.Encode(); encoded != vector.Encoded {
			t.Errorf("encode(derive(%q)) = %q, want %q", vector.ID, encoded, vector.Encoded)
		}
	}
}

func TestDerivedSpecIsFlatAndCapsule(t *testing.T) {
	spec := DeriveSpec("anything")
	if spec.Style != "vector" {
		t.Errorf("derived style = %q, want vector (the flat drawing)", spec.Style)
	}
	if spec.Face != "capsule" {
		t.Errorf("derived face = %q, want capsule (capsule eyes)", spec.Face)
	}
	if spec.Character != "" {
		t.Errorf("derived character = %q, want empty so the cast picks the name", spec.Character)
	}
}

func TestParseSpecRoundTrip(t *testing.T) {
	spec := Spec{Character: "mochi", Shape: "blob", Color: "blue", Face: "capsule", Style: "pixel", Seed: "1a2b"}
	encoded := spec.Encode()
	got, ok := ParseSpec(encoded)
	if !ok {
		t.Fatalf("ParseSpec(%q) rejected a spec it just produced", encoded)
	}
	if got != spec {
		t.Fatalf("round trip = %+v, want %+v", got, spec)
	}
	if isDerived := IsDerived(encoded); isDerived {
		t.Error("a stored spec must not read as derived")
	}
}

func TestParseSpecRejectsGarbage(t *testing.T) {
	cases := []string{
		"",
		"cap:blob:amber",
		"aora:",
		"aora:mochi:blob:blue:capsule",
		"aora:mochi:blob:blue:capsule:watercolor:1a2b",
		"aora:mochi::blue:capsule:vector:1a2b",
	}
	for _, value := range cases {
		if _, ok := ParseSpec(value); ok {
			t.Errorf("ParseSpec(%q) accepted a malformed spec", value)
		}
		if !IsDerived(value) {
			t.Errorf("IsDerived(%q) = false, want true", value)
		}
	}
}
