package avatar

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
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
	if spec.Character == "" {
		t.Error("derived character is empty: a derived avatar has to name a cast member")
	}
	if _, ok := castCharacter(spec.Character); !ok {
		t.Errorf("derived character = %q, which is not in CastCharacters", spec.Character)
	}
}

func TestDerivedSpecTakesShapeAndColorFromTheCharacter(t *testing.T) {
	for _, vector := range loadVectors(t).Vectors {
		spec := DeriveSpec(vector.ID)
		character, ok := castCharacter(spec.Character)
		if !ok {
			t.Fatalf("derive(%q) picked %q, which is not in CastCharacters", vector.ID, spec.Character)
		}
		if spec.Shape != character.Shape || spec.Color != character.Color {
			t.Errorf(
				"derive(%q) = shape %q colour %q, want %q and %q from character %q",
				vector.ID, spec.Shape, spec.Color, character.Shape, character.Color, character.ID,
			)
		}
	}
}

// A roster of plain bodies is the bug this table exists to fix: the ids have to
// land on many characters, not on one shape recycled with a new colour.
func TestDerivedSpecSpreadsAcrossCharacters(t *testing.T) {
	picked := map[string]struct{}{}
	for i := 0; i < 400; i++ {
		picked[DeriveSpec(fmt.Sprintf("agent-%d", i)).Character] = struct{}{}
	}
	if len(picked) < 30 {
		t.Errorf("400 ids landed on %d characters, want at least 30", len(picked))
	}
}

func TestParseSpecKeepsAnEmptyCharacter(t *testing.T) {
	// Specs written before derivation named a cast member still have to parse.
	spec, ok := ParseSpec("aora::blob:cyan:capsule:vector:f3b0")
	if !ok {
		t.Fatal("ParseSpec rejected a spec with an empty character")
	}
	if spec.Character != "" || spec.Shape != "blob" || spec.Color != "cyan" {
		t.Fatalf("ParseSpec = %+v, want an empty character with blob/cyan", spec)
	}
}

func castCharacter(id string) (CastCharacter, bool) {
	for _, character := range CastCharacters {
		if character.ID == id {
			return character, true
		}
	}
	return CastCharacter{}, false
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

func TestDefaultAvatarKeepsAnExplicitChoice(t *testing.T) {
	chosen := "aora:mochi:blob:blue:capsule:vector:1a2b"
	for _, explicit := range []string{chosen, "  https://cdn.example.com/avatars/agent.png  "} {
		want := strings.TrimSpace(explicit)
		if got := DefaultAvatar(explicit, "agent-0001"); got != want {
			t.Errorf("DefaultAvatar(%q) = %q, want %q", explicit, got, want)
		}
	}
}

func TestDefaultAvatarDerivesFromTheEntityID(t *testing.T) {
	for _, entityID := range []string{"agent-0001", "0192f0aa-6f2e-7000-8000-000000000001"} {
		got := DefaultAvatar("", entityID)
		if want := DeriveSpec(entityID).Encode(); got != want {
			t.Errorf("DefaultAvatar(%q) = %q, want %q", entityID, got, want)
		}
		if spec, ok := ParseSpec(got); !ok || spec.Style != DerivedStyle {
			t.Errorf("DefaultAvatar(%q) = %q, which does not round-trip as a derived spec", entityID, got)
		}
		// Stability is the contract: a re-read of the same entity never moves.
		if again := DefaultAvatar("   ", entityID); again != got {
			t.Errorf("DefaultAvatar(%q) is not stable: %q then %q", entityID, got, again)
		}
	}
}
