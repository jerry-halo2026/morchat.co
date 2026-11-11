package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"golang.org/x/crypto/argon2"
)

// Argon2id parameters are part of the login contract (docs/engineering/
// CONTRACTS.md, "登录契约"): every hash this server writes uses m=64MiB, t=3,
// p=1. A stored string with different parameters is still verifiable — the
// parameters are read from the PHC string — but NeedsRehash reports it so the
// next successful sign-in rewrites it with the contract values.
const (
	Argon2Memory      uint32 = 64 * 1024 // 64 MiB
	Argon2Iterations  uint32 = 3
	Argon2Parallelism uint8  = 1
	Argon2SaltLength         = 16
	Argon2KeyLength   uint32 = 32
	argon2Version     uint32 = 19
	argon2Algorithm          = "argon2id"
)

var (
	// ErrPasswordMismatch means the hash parsed fine but the password is wrong.
	ErrPasswordMismatch = errors.New("auth: password does not match hash")
	// ErrMalformedPasswordHash means the stored value is not an Argon2id PHC
	// string we can read. Callers must treat it like a failed verification
	// rather than a server fault: a bcrypt hash from a foreign writer is a
	// wrong password here, not a 500.
	ErrMalformedPasswordHash = errors.New("auth: malformed password hash")
)

// passwordHash is the parsed form of an Argon2id PHC string.
type passwordHash struct {
	memory      uint32
	iterations  uint32
	parallelism uint8
	version     uint32
	salt        []byte
	key         []byte
}

// Hash derives a PHC string for password using the contract parameters.
func Hash(password string) (string, error) {
	salt := make([]byte, Argon2SaltLength)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("auth: read salt: %w", err)
	}
	key := argon2.IDKey([]byte(password), salt, Argon2Iterations, Argon2Memory, Argon2Parallelism, Argon2KeyLength)
	return fmt.Sprintf(
		"$%s$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2Algorithm,
		argon2Version,
		Argon2Memory,
		Argon2Iterations,
		Argon2Parallelism,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key),
	), nil
}

// Verify reports whether password matches the stored PHC string.
//
// A malformed stored value returns ErrMalformedPasswordHash and an empty
// password never matches, so callers can map both to "invalid credentials"
// without a second branch. The comparison is constant time.
func Verify(password, encoded string) error {
	parsed, err := parsePasswordHash(encoded)
	if err != nil {
		return err
	}
	key := argon2.IDKey([]byte(password), parsed.salt, parsed.iterations, parsed.memory, parsed.parallelism, uint32(len(parsed.key)))
	if subtle.ConstantTimeCompare(key, parsed.key) != 1 {
		return ErrPasswordMismatch
	}
	return nil
}

// NeedsRehash reports whether encoded was written with parameters other than
// the contract values, or cannot be parsed at all. Callers rehash after a
// successful sign-in so old cost factors do not live forever.
func NeedsRehash(encoded string) bool {
	parsed, err := parsePasswordHash(encoded)
	if err != nil {
		return true
	}
	return parsed.version != argon2Version ||
		parsed.memory != Argon2Memory ||
		parsed.iterations != Argon2Iterations ||
		parsed.parallelism != Argon2Parallelism ||
		len(parsed.salt) != Argon2SaltLength ||
		uint32(len(parsed.key)) != Argon2KeyLength
}

func parsePasswordHash(encoded string) (passwordHash, error) {
	encoded = strings.TrimSpace(encoded)
	// $argon2id$v=19$m=65536,t=3,p=1$<salt>$<key>
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[0] != "" {
		return passwordHash{}, ErrMalformedPasswordHash
	}
	if parts[1] != argon2Algorithm {
		return passwordHash{}, ErrMalformedPasswordHash
	}
	version, ok := parseUint32(strings.TrimPrefix(parts[2], "v="))
	if !ok || !strings.HasPrefix(parts[2], "v=") {
		return passwordHash{}, ErrMalformedPasswordHash
	}

	var memory, iterations uint32
	var parallelism uint32
	for _, field := range strings.Split(parts[3], ",") {
		name, value, found := strings.Cut(field, "=")
		if !found {
			return passwordHash{}, ErrMalformedPasswordHash
		}
		switch name {
		case "m":
			v, ok := parseUint32(value)
			if !ok {
				return passwordHash{}, ErrMalformedPasswordHash
			}
			memory = v
		case "t":
			v, ok := parseUint32(value)
			if !ok {
				return passwordHash{}, ErrMalformedPasswordHash
			}
			iterations = v
		case "p":
			v, ok := parseUint32(value)
			if !ok {
				return passwordHash{}, ErrMalformedPasswordHash
			}
			parallelism = v
		default:
			return passwordHash{}, ErrMalformedPasswordHash
		}
	}
	if memory == 0 || iterations == 0 || parallelism == 0 || parallelism > 255 {
		return passwordHash{}, ErrMalformedPasswordHash
	}

	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil || len(salt) == 0 {
		return passwordHash{}, ErrMalformedPasswordHash
	}
	key, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil || len(key) == 0 {
		return passwordHash{}, ErrMalformedPasswordHash
	}

	return passwordHash{
		memory:      memory,
		iterations:  iterations,
		parallelism: uint8(parallelism),
		version:     version,
		salt:        salt,
		key:         key,
	}, nil
}

func parseUint32(raw string) (uint32, bool) {
	v, err := strconv.ParseUint(raw, 10, 32)
	if err != nil {
		return 0, false
	}
	return uint32(v), true
}
