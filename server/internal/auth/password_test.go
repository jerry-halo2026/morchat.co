package auth

import (
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"testing"

	"golang.org/x/crypto/argon2"
)

func TestPasswordHashVerifyRoundTrip(t *testing.T) {
	const password = "Passw0rd!2026"
	encoded, err := Hash(password)
	if err != nil {
		t.Fatalf("Hash() error = %v", err)
	}
	if err := Verify(password, encoded); err != nil {
		t.Fatalf("Verify(correct password) error = %v", err)
	}
	if NeedsRehash(encoded) {
		t.Errorf("NeedsRehash(%q) = true, want false for a fresh contract hash", encoded)
	}
}

func TestPasswordHashUsesContractParameters(t *testing.T) {
	encoded, err := Hash("another-long-password")
	if err != nil {
		t.Fatalf("Hash() error = %v", err)
	}
	wantPrefix := "$argon2id$v=19$m=65536,t=3,p=1$"
	if !strings.HasPrefix(encoded, wantPrefix) {
		t.Fatalf("Hash() = %q, want prefix %q", encoded, wantPrefix)
	}
	if parts := strings.Split(encoded, "$"); len(parts) != 6 {
		t.Errorf("Hash() = %q, want 6 PHC fields, got %d", encoded, len(parts))
	}

	second, err := Hash("another-long-password")
	if err != nil {
		t.Fatalf("Hash() second call error = %v", err)
	}
	if second == encoded {
		t.Error("two Hash() calls produced the same string; salts must be random")
	}
}

func TestPasswordVerifyRejectsWrongPassword(t *testing.T) {
	encoded, err := Hash("correct-horse-battery")
	if err != nil {
		t.Fatalf("Hash() error = %v", err)
	}
	err = Verify("correct-horse-batterY", encoded)
	if !errors.Is(err, ErrPasswordMismatch) {
		t.Fatalf("Verify(wrong password) error = %v, want ErrPasswordMismatch", err)
	}
}

func TestPasswordVerifyRejectsTamperedHash(t *testing.T) {
	encoded, err := Hash("tamper-me-please")
	if err != nil {
		t.Fatalf("Hash() error = %v", err)
	}
	parts := strings.Split(encoded, "$")

	cases := []struct {
		name    string
		encoded string
		want    error
	}{
		{
			name:    "flipped key byte",
			encoded: strings.Join([]string{parts[0], parts[1], parts[2], parts[3], parts[4], flipBase64(parts[5])}, "$"),
			want:    ErrPasswordMismatch,
		},
		{
			name:    "flipped salt byte",
			encoded: strings.Join([]string{parts[0], parts[1], parts[2], parts[3], flipBase64(parts[4]), parts[5]}, "$"),
			want:    ErrPasswordMismatch,
		},
		{
			name:    "different cost factor",
			encoded: strings.Replace(encoded, "m=65536", "m=32768", 1),
			want:    ErrPasswordMismatch,
		},
		{
			name:    "bcrypt string",
			encoded: "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy",
			want:    ErrMalformedPasswordHash,
		},
		{
			name:    "truncated",
			encoded: "$argon2id$v=19$m=65536,t=3,p=1$c2FsdA",
			want:    ErrMalformedPasswordHash,
		},
		{
			name:    "empty",
			encoded: "",
			want:    ErrMalformedPasswordHash,
		},
		{
			name:    "unsupported algorithm",
			encoded: strings.Replace(encoded, "$argon2id$", "$argon2i$", 1),
			want:    ErrMalformedPasswordHash,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := Verify("tamper-me-please", tc.encoded)
			if !errors.Is(err, tc.want) {
				t.Fatalf("Verify(%q) error = %v, want %v", tc.encoded, err, tc.want)
			}
		})
	}
}

func TestPasswordVerifyReadsParametersFromHash(t *testing.T) {
	// A hash written by an older deployment with cheaper parameters must still
	// verify: the parsed string, not the package constants, drives the KDF.
	const password = "legacy-parameters"
	const salt = "0123456789abcdef"
	key := argon2.IDKey([]byte(password), []byte(salt), 1, 8*1024, 1, 32)
	encoded := fmt.Sprintf(
		"$argon2id$v=19$m=8192,t=1,p=1$%s$%s",
		base64.RawStdEncoding.EncodeToString([]byte(salt)),
		base64.RawStdEncoding.EncodeToString(key),
	)
	if err := Verify(password, encoded); err != nil {
		t.Fatalf("Verify(legacy parameters) error = %v", err)
	}
	if !NeedsRehash(encoded) {
		t.Error("NeedsRehash(legacy parameters) = false, want true")
	}
}

func TestPasswordNeedsRehash(t *testing.T) {
	fresh, err := Hash("needs-rehash-check")
	if err != nil {
		t.Fatalf("Hash() error = %v", err)
	}
	if NeedsRehash(fresh) {
		t.Fatal("NeedsRehash(fresh hash) = true, want false")
	}
	cases := map[string]string{
		"other memory":      strings.Replace(fresh, "m=65536", "m=131072", 1),
		"other iterations":  strings.Replace(fresh, "t=3", "t=4", 1),
		"other parallelism": strings.Replace(fresh, "p=1", "p=2", 1),
		"other version":     strings.Replace(fresh, "v=19", "v=16", 1),
		"garbage":           "not-a-hash",
	}
	for name, candidate := range cases {
		t.Run(name, func(t *testing.T) {
			if !NeedsRehash(candidate) {
				t.Errorf("NeedsRehash(%q) = false, want true", candidate)
			}
		})
	}
}

func flipBase64(encoded string) string {
	raw, err := base64.RawStdEncoding.DecodeString(encoded)
	if err != nil || len(raw) == 0 {
		return encoded + "A"
	}
	raw[0] ^= 0xff
	return base64.RawStdEncoding.EncodeToString(raw)
}
