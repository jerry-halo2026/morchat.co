package auth

import (
	"github.com/golang-jwt/jwt/v5"
	"time"
)

const ExternalProviderClaim = "morchat_external_provider"

// External proof is deliberately non-renewable without contacting its provider.
func IsExternalSession(claims jwt.MapClaims) bool {
	_, present := claims[ExternalProviderClaim]
	return present
}

func NewExternalSession(userID, email, name string, proofExpiry time.Time) (string, error) {
	now := time.Now()
	if !proofExpiry.After(now) {
		return "", ErrNotSessionToken
	}
	if IsTemporarilyDisabledUser(userID, email) {
		return "", ErrTemporarilyDisabledUser
	}
	end := proofExpiry
	for _, cap := range []time.Time{now.Add(AuthTokenTTL()), now.Add(time.Hour)} {
		if cap.Before(end) {
			end = cap
		}
	}
	sid, err := NewSessionID()
	if err != nil {
		return "", err
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": userID, "email": email, "name": name, "sid": sid, "iat": now.Unix(), "exp": end.Unix(),
		SessionProvenanceClaim: SessionProvenanceV1, ExternalProviderClaim: "supabase:qcpgqehqjescuwqhnmie",
	}).SignedString(JWTSecret())
}
