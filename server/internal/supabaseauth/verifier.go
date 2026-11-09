package supabaseauth

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/mail"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const ProjectURL = "https://qcpgqehqjescuwqhnmie.supabase.co"
const Project = "qcpgqehqjescuwqhnmie"

var ErrInvalidProof = errors.New("invalid provider proof")

type Identity struct {
	Subject, Email string
	ExpiresAt      time.Time
}
type Verifier struct {
	URL, Key string
	Client   *http.Client
}

// FromEnv deliberately accepts only the approved project and a public key.
func FromEnv() *Verifier {
	url := strings.TrimSuffix(strings.TrimSpace(os.Getenv("SUPABASE_URL")), "/")
	key := strings.TrimSpace(os.Getenv("SUPABASE_PUBLISHABLE_KEY"))
	if url != ProjectURL || !strings.HasPrefix(key, "sb_publishable_") {
		return nil
	}
	return &Verifier{URL: url, Key: key}
}

func (v *Verifier) Verify(ctx context.Context, accessToken string) (Identity, error) {
	var zero Identity
	if accessToken == "" || len(accessToken) > 16384 || strings.ContainsAny(accessToken, "\r\n ") {
		return zero, ErrInvalidProof
	}
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, v.URL+"/auth/v1/user", nil)
	if err != nil {
		return zero, ErrInvalidProof
	}
	req.Header.Set("apikey", v.Key)
	req.Header.Set("Authorization", "Bearer "+accessToken)
	client := http.Client{Timeout: 8 * time.Second}
	if v.Client != nil {
		client = *v.Client
	}
	// Never forward bearer credentials through a provider redirect.
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	resp, err := client.Do(req)
	if err != nil {
		return zero, ErrInvalidProof
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return zero, ErrInvalidProof
	}
	var user struct {
		ID          string     `json:"id"`
		Email       string     `json:"email"`
		ConfirmedAt *time.Time `json:"email_confirmed_at"`
		Anonymous   bool       `json:"is_anonymous"`
		Role        string     `json:"role"`
	}
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 65537))
	if err != nil || len(raw) > 65536 {
		return zero, ErrInvalidProof
	}
	if json.Unmarshal(raw, &user) != nil {
		return zero, ErrInvalidProof
	}
	id, err := uuid.Parse(user.ID)
	if err != nil || id == uuid.Nil || id.String() != user.ID || user.Anonymous || user.Role != "authenticated" || user.ConfirmedAt == nil || user.ConfirmedAt.IsZero() {
		return zero, ErrInvalidProof
	}
	email := strings.ToLower(strings.TrimSpace(user.Email))
	address, err := mail.ParseAddress(email)
	if err != nil || address.Address != email || !strings.Contains(email, "@") {
		return zero, ErrInvalidProof
	}
	// The provider just authenticated the token. Decode ONLY to bind its proof
	// lifetime and issuer; this decode alone is never authentication.
	claims := jwt.MapClaims{}
	if _, _, err := jwt.NewParser().ParseUnverified(accessToken, claims); err != nil {
		return zero, ErrInvalidProof
	}
	sub, _ := claims.GetSubject()
	issuer, _ := claims.GetIssuer()
	exp, err := claims.GetExpirationTime()
	if sub != user.ID || issuer != ProjectURL+"/auth/v1" || err != nil || exp == nil || !exp.After(time.Now()) {
		return zero, ErrInvalidProof
	}
	return Identity{Subject: user.ID, Email: email, ExpiresAt: exp.Time}, nil
}
