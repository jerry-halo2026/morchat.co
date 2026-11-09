package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestExternalSessionBounded(t *testing.T) {
	t.Setenv("JWT_SECRET", "external-session-unit-test-secret-long-enough")
	end := time.Now().Add(90 * time.Second).Truncate(time.Second)
	token, err := NewExternalSession("ea65bf1b-9362-4bef-9d22-a222e13b2a31", "a@example.com", "A", end)
	if err != nil {
		t.Fatal(err)
	}
	claims, err := ParseSessionToken(token)
	if err != nil {
		t.Fatal(err)
	}
	if !SessionExpiry(claims).Equal(end) || claims[SessionProvenanceClaim] != SessionProvenanceV1 || !IsExternalSession(claims) {
		t.Fatal("missing bounded native lineage")
	}
	if _, _, err := RenewSessionToken(claims); err == nil {
		t.Fatal("provider proof silently extended")
	}
	rec := httptest.NewRecorder()
	if err := SetAuthCookies(rec, token); err != nil {
		t.Fatal(err)
	}
	var csrf string
	req := httptest.NewRequest(http.MethodPost, "/api/test", nil)
	for _, c := range rec.Result().Cookies() {
		if c.Expires.After(end.Add(time.Second)) || c.MaxAge > 90 {
			t.Fatal("cookie outlives proof")
		}
		if c.Name == AuthCookieName {
			req.AddCookie(c)
		}
		if c.Name == SessionCSRFCookieName {
			csrf = c.Value
		}
	}
	req.Header.Set(CSRFHeaderName, csrf)
	if !ValidateCSRF(req) {
		t.Fatal("native CSRF invalid")
	}
}
func TestExternalSessionRejectExpired(t *testing.T) {
	if _, err := NewExternalSession("id", "email", "name", time.Now().Add(-time.Second)); err == nil {
		t.Fatal("expired proof accepted")
	}
}

func TestExternalSessionDisabledUser(t *testing.T) {
	if _, err := NewExternalSession("514492f7-b30f-4147-bd33-c0e8ce5d6d4f", "unit@example.com", "Unit", time.Now().Add(time.Hour)); err != ErrTemporarilyDisabledUser {
		t.Fatal("disabled native user received session")
	}
}
func TestExternalSessionMaximumLifetime(t *testing.T) {
	now := time.Now()
	token, err := NewExternalSession("ea65bf1b-9362-4bef-9d22-a222e13b2a31", "unit@example.com", "Unit", now.Add(2*time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	claims, err := ParseSessionToken(token)
	if err != nil {
		t.Fatal(err)
	}
	end := SessionExpiry(claims)
	if end.After(now.Add(time.Hour)) || end.After(now.Add(AuthTokenTTL())) {
		t.Fatal("external session exceeds local bound")
	}
}
