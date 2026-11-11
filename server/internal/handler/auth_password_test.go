package handler

import (
	"context"
	"net/http"
	"testing"

	"github.com/jerry-halo2026/morchat.co/server/internal/auth"
	"github.com/jerry-halo2026/morchat.co/server/internal/middleware"
	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
)

const (
	passwordTestInitial = "Passw0rd!2026"
	passwordTestRotated = "Rotated!Passw0rd2026"
)

// giveTestUserPassword installs a credential on the shared fixture user and
// strips it again when the test ends, so tests that expect a password-less
// account still see one.
func giveTestUserPassword(t *testing.T, plaintext string, mustChange bool) {
	t.Helper()
	hash, err := auth.Hash(plaintext)
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	if _, err := testHandler.Queries.SetUserPassword(context.Background(), db.SetUserPasswordParams{
		ID:                 parseUUID(testUserID),
		PasswordHash:       strToText(hash),
		MustChangePassword: mustChange,
	}); err != nil {
		t.Fatalf("set fixture password: %v", err)
	}
	t.Cleanup(func() {
		if _, err := testPool.Exec(context.Background(),
			`UPDATE "user" SET password_hash = NULL, password_updated_at = NULL, must_change_password = false WHERE id = $1`,
			testUserID); err != nil {
			t.Errorf("clear fixture password: %v", err)
		}
		passwordLoginFailures.reset()
	})
}

func passwordLoginRequest(email, password string) *http.Request {
	return testutil.JSONRequest(http.MethodPost, "/auth/password/login", PasswordLoginRequest{Email: email, Password: password})
}

func TestPasswordLoginSucceedsWithCorrectPassword(t *testing.T) {
	passwordLoginFailures.reset()
	giveTestUserPassword(t, passwordTestInitial, false)

	res := testutil.Call(t, testHandler.PasswordLogin, passwordLoginRequest(handlerTestEmail, passwordTestInitial)).Want(http.StatusOK)

	var body PasswordLoginResponse
	res.JSON(&body)
	if body.Token == "" {
		t.Fatal("login response has no token")
	}
	if body.User.Email != handlerTestEmail {
		t.Errorf("user.email = %q, want %q", body.User.Email, handlerTestEmail)
	}
	if body.MustChangePassword {
		t.Error("must_change_password = true, want false for a normal credential")
	}
	cookies := res.Result().Cookies()
	if len(cookies) == 0 {
		t.Error("login did not set any cookies")
	}
}

func TestPasswordLoginRejectsWrongPassword(t *testing.T) {
	passwordLoginFailures.reset()
	giveTestUserPassword(t, passwordTestInitial, false)

	res := testutil.Call(t, testHandler.PasswordLogin, passwordLoginRequest(handlerTestEmail, "not-the-password")).Want(http.StatusUnauthorized)
	if got := res.Map()["code"]; got != "invalid_credentials" {
		t.Errorf("code = %v, want invalid_credentials", got)
	}
}

func TestPasswordLoginRejectsAccountWithoutPassword(t *testing.T) {
	passwordLoginFailures.reset()
	// No giveTestUserPassword: password_hash is NULL, so the account is a
	// code-only account and a password guess is a wrong password, not a 500.
	res := testutil.Call(t, testHandler.PasswordLogin, passwordLoginRequest(handlerTestEmail, passwordTestInitial)).Want(http.StatusUnauthorized)
	if got := res.Map()["code"]; got != "invalid_credentials" {
		t.Errorf("code = %v, want invalid_credentials", got)
	}
}

func TestPasswordLoginLocksOutAfterFiveFailures(t *testing.T) {
	passwordLoginFailures.reset()
	giveTestUserPassword(t, passwordTestInitial, false)

	for attempt := 1; attempt <= passwordLoginMaxFailures; attempt++ {
		res := testutil.Call(t, testHandler.PasswordLogin, passwordLoginRequest(handlerTestEmail, "wrong-password")).Want(http.StatusUnauthorized)
		if got := res.Map()["code"]; got != "invalid_credentials" {
			t.Fatalf("attempt %d code = %v, want invalid_credentials", attempt, got)
		}
	}

	// The budget is spent: even the correct password is refused until the
	// window closes.
	res := testutil.Call(t, testHandler.PasswordLogin, passwordLoginRequest(handlerTestEmail, passwordTestInitial)).Want(http.StatusTooManyRequests)
	if got := res.Map()["code"]; got != "too_many_attempts" {
		t.Errorf("code = %v, want too_many_attempts", got)
	}
	if res.Header().Get("Retry-After") == "" {
		t.Error("429 response is missing Retry-After")
	}
}

func TestPasswordLoginSuccessResetsFailureBudget(t *testing.T) {
	passwordLoginFailures.reset()
	giveTestUserPassword(t, passwordTestInitial, false)

	for attempt := 1; attempt < passwordLoginMaxFailures; attempt++ {
		testutil.Call(t, testHandler.PasswordLogin, passwordLoginRequest(handlerTestEmail, "wrong-password")).Want(http.StatusUnauthorized)
	}
	testutil.Call(t, testHandler.PasswordLogin, passwordLoginRequest(handlerTestEmail, passwordTestInitial)).Want(http.StatusOK)

	// A success clears the key, so the next failure is the first of a new
	// budget rather than the one that trips the lock.
	testutil.Call(t, testHandler.PasswordLogin, passwordLoginRequest(handlerTestEmail, "wrong-password")).Want(http.StatusUnauthorized)
}

func TestPasswordLoginDisabledByConfig(t *testing.T) {
	t.Setenv("AUTH_PASSWORD_ENABLED", "false")
	passwordLoginFailures.reset()
	giveTestUserPassword(t, passwordTestInitial, false)

	res := testutil.Call(t, testHandler.PasswordLogin, passwordLoginRequest(handlerTestEmail, passwordTestInitial)).Want(http.StatusForbidden)
	if got := res.Map()["code"]; got != "password_login_disabled" {
		t.Errorf("code = %v, want password_login_disabled", got)
	}
}

func TestPasswordChangeRequiresCurrentPassword(t *testing.T) {
	passwordLoginFailures.reset()
	giveTestUserPassword(t, passwordTestInitial, false)

	req := testutil.JSONRequest(http.MethodPost, "/api/me/password", ChangePasswordRequest{NewPassword: passwordTestRotated})
	req.Header.Set("X-User-ID", testUserID)
	testutil.Call(t, testHandler.ChangeMyPassword, req).Want(http.StatusUnauthorized)

	req = testutil.JSONRequest(http.MethodPost, "/api/me/password", ChangePasswordRequest{
		CurrentPassword: "wrong-current-password",
		NewPassword:     passwordTestRotated,
	})
	req.Header.Set("X-User-ID", testUserID)
	res := testutil.Call(t, testHandler.ChangeMyPassword, req).Want(http.StatusUnauthorized)
	if got := res.Map()["code"]; got != "invalid_credentials" {
		t.Errorf("code = %v, want invalid_credentials", got)
	}
}

func TestPasswordChangeRejectsWeakPassword(t *testing.T) {
	giveTestUserPassword(t, passwordTestInitial, false)

	req := testutil.JSONRequest(http.MethodPost, "/api/me/password", ChangePasswordRequest{
		CurrentPassword: passwordTestInitial,
		NewPassword:     "short",
	})
	req.Header.Set("X-User-ID", testUserID)
	res := testutil.Call(t, testHandler.ChangeMyPassword, req).Want(http.StatusBadRequest)
	if got := res.Map()["code"]; got != "weak_password" {
		t.Errorf("code = %v, want weak_password", got)
	}
}

func TestPasswordChangeRotatesCredential(t *testing.T) {
	passwordLoginFailures.reset()
	giveTestUserPassword(t, passwordTestInitial, false)

	req := testutil.JSONRequest(http.MethodPost, "/api/me/password", ChangePasswordRequest{
		CurrentPassword: passwordTestInitial,
		NewPassword:     passwordTestRotated,
	})
	req.Header.Set("X-User-ID", testUserID)
	testutil.Call(t, testHandler.ChangeMyPassword, req).Want(http.StatusOK)

	// The new password signs in; the old one does not.
	testutil.Call(t, testHandler.PasswordLogin, passwordLoginRequest(handlerTestEmail, passwordTestRotated)).Want(http.StatusOK)
	testutil.Call(t, testHandler.PasswordLogin, passwordLoginRequest(handlerTestEmail, passwordTestInitial)).Want(http.StatusUnauthorized)
}

func TestPasswordChangeFirstTimeNeedsNoCurrentPassword(t *testing.T) {
	// password_hash is NULL: an account that only ever used an emailed code
	// sets its first password without proving an old one.
	req := testutil.JSONRequest(http.MethodPost, "/api/me/password", ChangePasswordRequest{NewPassword: passwordTestRotated})
	req.Header.Set("X-User-ID", testUserID)
	testutil.Call(t, testHandler.ChangeMyPassword, req).Want(http.StatusOK)

	stored, err := testHandler.Queries.GetUser(context.Background(), parseUUID(testUserID))
	if err != nil {
		t.Fatalf("load user: %v", err)
	}
	if !stored.PasswordHash.Valid {
		t.Fatal("password_hash is still NULL after a self-service set")
	}
	if err := auth.Verify(passwordTestRotated, stored.PasswordHash.String); err != nil {
		t.Errorf("stored hash does not verify the new password: %v", err)
	}
	t.Cleanup(func() {
		if _, err := testPool.Exec(context.Background(),
			`UPDATE "user" SET password_hash = NULL, password_updated_at = NULL WHERE id = $1`, testUserID); err != nil {
			t.Errorf("clear fixture password: %v", err)
		}
	})
}

func TestResetUserPasswordRequiresOwnerOrAdmin(t *testing.T) {
	giveTestUserPassword(t, passwordTestInitial, false)

	req := testutil.JSONRequest(http.MethodPost, "/api/users/"+testUserID+"/password", ResetUserPasswordRequest{NewPassword: passwordTestRotated})
	req.Header.Set("X-User-ID", testUserID)
	req = testutil.WithURLParams(req, "id", testUserID)
	req = req.WithContext(middleware.SetMemberContext(req.Context(), testWorkspaceID, db.Member{Role: "member"}))

	res := testutil.Call(t, testHandler.ResetUserPassword, req).Want(http.StatusForbidden)
	if got := res.Map()["code"]; got != "insufficient_role" {
		t.Errorf("code = %v, want insufficient_role", got)
	}
}

func TestResetUserPasswordSetsMustChangePassword(t *testing.T) {
	giveTestUserPassword(t, passwordTestInitial, false)

	req := testutil.JSONRequest(http.MethodPost, "/api/users/"+testUserID+"/password", ResetUserPasswordRequest{NewPassword: passwordTestRotated})
	req.Header.Set("X-User-ID", testUserID)
	req = testutil.WithURLParams(req, "id", testUserID)
	req = req.WithContext(middleware.SetMemberContext(req.Context(), testWorkspaceID, db.Member{Role: "owner"}))

	res := testutil.Call(t, testHandler.ResetUserPassword, req).Want(http.StatusOK)
	var body map[string]any
	res.JSON(&body)
	if body["must_change_password"] != true {
		t.Errorf("must_change_password = %v, want true", body["must_change_password"])
	}

	stored, err := testHandler.Queries.GetUser(context.Background(), parseUUID(testUserID))
	if err != nil {
		t.Fatalf("load user: %v", err)
	}
	if !stored.MustChangePassword {
		t.Error("user row must_change_password = false after an admin reset")
	}
	if err := auth.Verify(passwordTestRotated, stored.PasswordHash.String); err != nil {
		t.Errorf("stored hash does not verify the reset password: %v", err)
	}
}

func TestResetUserPasswordRejectsNonMemberTarget(t *testing.T) {
	giveTestUserPassword(t, passwordTestInitial, false)
	strangerID := dbfx.User(t, "Password Stranger", "password-stranger@multica.ai")

	req := testutil.JSONRequest(http.MethodPost, "/api/users/"+strangerID+"/password", ResetUserPasswordRequest{NewPassword: passwordTestRotated})
	req.Header.Set("X-User-ID", testUserID)
	req = testutil.WithURLParams(req, "id", strangerID)
	req = req.WithContext(middleware.SetMemberContext(req.Context(), testWorkspaceID, db.Member{Role: "owner"}))

	res := testutil.Call(t, testHandler.ResetUserPassword, req).Want(http.StatusNotFound)
	if got := res.Map()["code"]; got != "user_not_found" {
		t.Errorf("code = %v, want user_not_found", got)
	}
}

func TestConfigReportsPasswordAuthFlags(t *testing.T) {
	req := testutil.JSONRequest(http.MethodGet, "/api/config", nil)
	var body AppConfig
	testutil.Call(t, testHandler.GetConfig, req).Want(http.StatusOK).JSON(&body)
	if !body.Auth.PasswordEnabled || !body.Auth.CodeLoginEnabled {
		t.Errorf("auth = %+v, want both methods enabled by default", body.Auth)
	}

	t.Setenv("AUTH_PASSWORD_ENABLED", "false")
	testutil.Call(t, testHandler.GetConfig, testutil.JSONRequest(http.MethodGet, "/api/config", nil)).Want(http.StatusOK).JSON(&body)
	if body.Auth.PasswordEnabled {
		t.Error("password_enabled = true after AUTH_PASSWORD_ENABLED=false")
	}
	if !body.Auth.CodeLoginEnabled {
		t.Error("code_login_enabled = false, want true")
	}
}
