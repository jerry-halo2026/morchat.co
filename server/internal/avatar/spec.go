package avatar

import (
	"fmt"
	"hash/fnv"
	"strings"
)

// The avatar spec: one string that fully describes an Aora Bot character.
//
//	aora:<character>:<shape>:<color>:<face>:<style>:<seed>
//
// This is the Go half of packages/core/avatar/aora-spec.ts and must agree with it
// byte for byte: an avatar written by the server has to render identically in the
// web and desktop apps. testdata/aora-vectors.json pins the agreement, and both
// sides test against it.
//
// Derived avatars - the ones nobody chose - pin the style to vector (flat) and the
// face to capsule eyes so the roster reads as one family, and pick one cast
// character, which carries the shape and the colour together.

// StyleIDs is what the free editor may pick. Derived avatars only ever use the first.
var StyleIDs = []string{"vector", "pixel", "kaomoji"}

const (
	// SpecPrefix marks a value as an Aora spec rather than a legacy avatar URL.
	SpecPrefix = "aora:"
	// DerivedFace is capsule eyes: one face for every generated avatar.
	DerivedFace = "capsule"
	// DerivedStyle is the flat vector drawing.
	DerivedStyle = "vector"
	fieldCount   = 6
)

// Spec is a decoded avatar description.
type Spec struct {
	Character string
	Shape     string
	Color     string
	Face      string
	Style     string
	Seed      string
}

// ParseSpec returns ok=false for anything that is not a well-formed spec, so a
// caller can fall back to the derived avatar instead of storing garbage.
//
// Character stays optional: specs written before derivation named a cast member
// carry an empty one and still have to parse.
func ParseSpec(value string) (Spec, bool) {
	value = strings.TrimSpace(value)
	if !strings.HasPrefix(value, SpecPrefix) {
		return Spec{}, false
	}
	parts := strings.Split(strings.TrimPrefix(value, SpecPrefix), ":")
	if len(parts) != fieldCount {
		return Spec{}, false
	}
	for _, part := range parts[1:] {
		if part == "" {
			return Spec{}, false
		}
	}
	spec := Spec{
		Character: parts[0],
		Shape:     parts[1],
		Color:     parts[2],
		Face:      parts[3],
		Style:     parts[4],
		Seed:      parts[5],
	}
	if !containsString(StyleIDs, spec.Style) {
		return Spec{}, false
	}
	return spec, true
}

// Encode renders the spec in the canonical order.
func (s Spec) Encode() string {
	return strings.Join([]string{
		strings.TrimSuffix(SpecPrefix, ":"),
		s.Character, s.Shape, s.Color, s.Face, s.Style, s.Seed,
	}, ":")
}

// StableHash is FNV-1a over the UTF-8 bytes of the id. It must match the TypeScript
// implementation exactly, including the 32-bit wraparound.
func StableHash(id string) uint32 {
	h := fnv.New32a()
	_, _ = h.Write([]byte(id))
	return h.Sum32()
}

// DeriveSpec builds the avatar an entity gets when nobody chose one: one cast
// character picked by the id's hash, with the shape and colour that character is.
func DeriveSpec(entityID string) Spec {
	hash := StableHash(entityID)
	character := CastCharacters[int(hash)%len(CastCharacters)]
	return Spec{
		Character: character.ID,
		Shape:     character.Shape,
		Color:     character.Color,
		Face:      DerivedFace,
		Style:     DerivedStyle,
		Seed:      fmt.Sprintf("%04x", hash>>16),
	}
}

// IsDerived reports whether an entity has not chosen an avatar of its own.
func IsDerived(value string) bool {
	_, ok := ParseSpec(value)
	return !ok
}

// DefaultAvatar is the avatar_url a newly created entity is stored with: the
// caller's own choice when the request carried one, otherwise the face derived
// from the entity's id.
//
// It runs after the insert rather than before it, because the derivation is
// keyed on the id the database mints. Callers inside the same transaction can
// still store the result without a window where the row has no face.
func DefaultAvatar(explicit, entityID string) string {
	if trimmed := strings.TrimSpace(explicit); trimmed != "" {
		return trimmed
	}
	return DeriveSpec(entityID).Encode()
}

func containsString(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}
