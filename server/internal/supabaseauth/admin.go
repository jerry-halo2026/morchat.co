package supabaseauth

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"os"
	"strings"
	"time"
)

// minProvisionedPasswordLength is the floor both the provider and our own
// password policy accept. Generated passwords are longer.
const minProvisionedPasswordLength = 8

// GeneratePassword returns a random password for an invitee account: the result
// always carries upper case, lower case, a digit and a symbol, so it satisfies
// the provider's default policy as well as ours.
func GeneratePassword() (string, error) {
	const (
		upper   = "ABCDEFGHJKLMNPQRSTUVWXYZ" // no I/O
		lower   = "abcdefghijkmnopqrstuvwxyz" // no l
		digits  = "23456789"
		symbols = "!@#$%^&*-_=+"
		all     = upper + lower + digits + symbols
	)
	// One from each class, then fill, then shuffle: a uniform draw over the
	// whole alphabet can (rarely) miss a class, and a rejected retry would be
	// harder to reason about than this.
	out := make([]byte, 0, 20)
	for _, class := range []string{upper, lower, digits, symbols} {
		b, err := randomIndex(len(class))
		if err != nil {
			return "", err
		}
		out = append(out, class[b])
	}
	for len(out) < 20 {
		b, err := randomIndex(len(all))
		if err != nil {
			return "", err
		}
		out = append(out, all[b])
	}
	for i := len(out) - 1; i > 0; i-- {
		j, err := randomIndex(i + 1)
		if err != nil {
			return "", err
		}
		out[i], out[j] = out[j], out[i]
	}
	return string(out), nil
}

func randomIndex(n int) (int, error) {
	max := big.NewInt(int64(n))
	v, err := rand.Int(rand.Reader, max)
	if err != nil {
		return 0, fmt.Errorf("supabase admin: random password: %w", err)
	}
	return int(v.Int64()), nil
}

// AdminClient provisions accounts in the same Supabase project the verifier
// accepts. It exists so an owner/admin can invite an address that has no account
// yet: without it the invitation only emails a link, and a project with signup
// closed can never admit the invitee
// (docs/engineering/ORG-MODEL.md §3, "邀请即开户").
//
// The key is the project's service_role secret. It stays on the server: the
// client never sees it, and `AdminFromEnv` refuses anything that is not the
// approved project paired with a secret key.
type AdminClient struct {
	URL, Key string
	Client   *http.Client
}

// ProvisionResult is what the provider said about the invitee.
type ProvisionResult struct {
	// Created is true when Supabase created the account with the password the
	// caller supplied, so the invitee can sign in immediately — no invitation
	// email is sent.
	Created bool
	// AlreadyExists is true when the address already had an account there. That
	// is not an error: the invitation is still valid, the person just signs in
	// with the password they already have.
	AlreadyExists bool
	// Subject is the provider's user id for the account, when it is known. It is
	// what a later password reset needs.
	Subject string
}

// Provisioner is the narrow surface invitations need. Handlers hold this
// interface so tests never touch the network.
type Provisioner interface {
	CreateAccount(ctx context.Context, email, password string) (ProvisionResult, error)
	// ResetPassword replaces the password of an account this server provisioned.
	ResetPassword(ctx context.Context, subject, password string) error
}

// AdminFromEnv returns nil unless this deployment is configured for the approved
// Supabase project and has a secret key. A nil provisioner means "invitations
// create no provider account", which is the self-hosted default.
func AdminFromEnv() *AdminClient {
	url := strings.TrimSuffix(strings.TrimSpace(os.Getenv("SUPABASE_URL")), "/")
	key := strings.TrimSpace(os.Getenv("SUPABASE_SECRET_KEY"))
	if url != ProjectURL || !strings.HasPrefix(key, "sb_secret_") {
		return nil
	}
	return &AdminClient{URL: url, Key: key}
}

// CreateAccount creates the invitee's account with a password the workspace
// admin will hand over out of band, so the person can sign in immediately with
// email + password. `email_confirm: true` means no confirmation mail is sent.
//
// The provider's invite endpoint is deliberately not used: it depends on the
// project's SMTP and email rate limit, and an admin who wants an account now
// should not be blocked by mail delivery.
func (c *AdminClient) CreateAccount(ctx context.Context, email, password string) (ProvisionResult, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" {
		return ProvisionResult{}, errors.New("supabase admin: empty email")
	}
	if len(password) < minProvisionedPasswordLength {
		return ProvisionResult{}, fmt.Errorf("supabase admin: password must be at least %d characters", minProvisionedPasswordLength)
	}

	payload, err := json.Marshal(map[string]any{
		"email":         email,
		"password":      password,
		"email_confirm": true,
	})
	if err != nil {
		return ProvisionResult{}, fmt.Errorf("supabase admin: encode account: %w", err)
	}

	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.URL+"/auth/v1/admin/users", bytes.NewReader(payload))
	if err != nil {
		return ProvisionResult{}, fmt.Errorf("supabase admin: build account: %w", err)
	}
	req.Header.Set("apikey", c.Key)
	req.Header.Set("Authorization", "Bearer "+c.Key)
	req.Header.Set("Content-Type", "application/json")

	client := http.Client{Timeout: 8 * time.Second}
	if c.Client != nil {
		client = *c.Client
	}
	// The service key must never follow a redirect to another host.
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }

	resp, err := client.Do(req)
	if err != nil {
		return ProvisionResult{}, fmt.Errorf("supabase admin: account request failed: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<10))
	switch {
	case resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusCreated:
		var created struct {
			ID string `json:"id"`
		}
		_ = json.Unmarshal(body, &created)
		return ProvisionResult{Created: true, Subject: created.ID}, nil
	case resp.StatusCode == http.StatusUnprocessableEntity,
		resp.StatusCode == http.StatusConflict,
		resp.StatusCode == http.StatusBadRequest:
		// Supabase answers 422 `email_exists` (or "already been registered") for
		// an address that already has an account. That is a successful outcome
		// for the invitation: the person signs in with the password they have.
		lower := strings.ToLower(string(body))
		if strings.Contains(lower, "email_exists") || strings.Contains(lower, "already") {
			return ProvisionResult{AlreadyExists: true}, nil
		}
		return ProvisionResult{}, fmt.Errorf("supabase admin: account rejected (%d): %s", resp.StatusCode, truncateForError(body))
	default:
		return ProvisionResult{}, fmt.Errorf("supabase admin: account failed (%d): %s", resp.StatusCode, truncateForError(body))
	}
}

// ResetPassword replaces the password of an account this server created. The
// initial password is shown once and never stored, so this is the only answer to
// "I lost it"; it needs the provider subject the create call returned.
func (c *AdminClient) ResetPassword(ctx context.Context, subject, password string) error {
	subject = strings.TrimSpace(subject)
	if subject == "" {
		return errors.New("supabase admin: no provider subject to reset")
	}
	if len(password) < minProvisionedPasswordLength {
		return fmt.Errorf("supabase admin: password must be at least %d characters", minProvisionedPasswordLength)
	}

	payload, err := json.Marshal(map[string]any{"password": password})
	if err != nil {
		return fmt.Errorf("supabase admin: encode password: %w", err)
	}

	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPut, c.URL+"/auth/v1/admin/users/"+subject, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("supabase admin: build reset: %w", err)
	}
	req.Header.Set("apikey", c.Key)
	req.Header.Set("Authorization", "Bearer "+c.Key)
	req.Header.Set("Content-Type", "application/json")

	client := http.Client{Timeout: 8 * time.Second}
	if c.Client != nil {
		client = *c.Client
	}
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("supabase admin: reset request failed: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<10))
	if resp.StatusCode == http.StatusOK {
		return nil
	}
	return fmt.Errorf("supabase admin: reset failed (%d): %s", resp.StatusCode, truncateForError(body))
}

// truncateForError keeps a provider answer short enough for a column and a log
// line, and strips newlines so a multi-line body cannot forge log entries.
func truncateForError(body []byte) string {
	const max = 300
	text := strings.Join(strings.Fields(string(body)), " ")
	if len(text) > max {
		return text[:max] + "…"
	}
	return text
}
