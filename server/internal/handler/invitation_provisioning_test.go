package handler

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/jerry-halo2026/morchat.co/server/internal/supabaseauth"
	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

// Invitation-time account provisioning: with a Supabase service key the
// invitation also creates the invitee's provider account **with a password**, so
// the person signs in immediately with email + password and no mail is sent. A
// provider failure must never lose the invitation, and the password is returned
// exactly once (it is not stored).

type fakeProvisioner struct {
	result    supabaseauth.ProvisionResult
	err       error
	resetErr  error
	emails    []string
	passwords []string
	resets    []string
}

func (f *fakeProvisioner) CreateAccount(_ context.Context, email, password string) (supabaseauth.ProvisionResult, error) {
	f.emails = append(f.emails, email)
	f.passwords = append(f.passwords, password)
	return f.result, f.err
}

func (f *fakeProvisioner) ResetPassword(_ context.Context, subject, password string) error {
	f.resets = append(f.resets, subject+"|"+password)
	return f.resetErr
}

// withProvisioner swaps the handler field for one test and restores it after.
func withProvisioner(t *testing.T, p supabaseauth.Provisioner) {
	t.Helper()
	previous := testHandler.SupabaseProvisioner
	testHandler.SupabaseProvisioner = p
	t.Cleanup(func() { testHandler.SupabaseProvisioner = previous })
}

// deleteInvitation removes the row this test created. The partial unique index
// on pending invitations is per email, so a leftover row would make a rerun 409.
func deleteInvitationForEmail(t *testing.T, email string) {
	t.Helper()
	t.Cleanup(func() {
		_, _ = testPool.Exec(context.Background(),
			`DELETE FROM workspace_invitation WHERE workspace_id = $1 AND invitee_email = $2`,
			testWorkspaceID, email)
	})
}

func inviteOnce(t *testing.T, extra map[string]any) (InvitationResponse, string) {
	t.Helper()
	email := fmt.Sprintf("provision-%d@example.com", time.Now().UnixNano())
	deleteInvitationForEmail(t, email)
	body := map[string]any{"email": email, "role": "member"}
	for key, value := range extra {
		body[key] = value
	}
	resp := testutil.Decode[InvitationResponse](t, testHandler.CreateInvitation,
		withURLParam(newRequest("POST", "/api/workspaces/"+testWorkspaceID+"/members", body), "id", testWorkspaceID),
		http.StatusCreated)
	return resp, email
}

// provisionRequest builds the retry request with both path parameters chi needs.
// `withURLParam` installs a fresh route context each call, so the two params have
// to be added to one context or the second call drops the first.
func provisionRequest(workspaceID, invitationID string) *http.Request {
	req := newRequest("POST", "/api/workspaces/"+workspaceID+"/invitations/"+invitationID+"/provision", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", workspaceID)
	rctx.URLParams.Add("invitationId", invitationID)
	return req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
}

func provisionStateOf(t *testing.T, invitationID string) (state string, detail *string) {
	t.Helper()
	// testutil's Row.Scan fails the test on error instead of returning one.
	dbfx.QueryRow(t, `SELECT provision_state, provision_error::text FROM workspace_invitation WHERE id = $1`, invitationID).
		Scan(&state, &detail)
	return state, detail
}

func TestCreateInvitationProvisionsProviderAccount(t *testing.T) {
	fake := &fakeProvisioner{result: supabaseauth.ProvisionResult{Created: true}}
	withProvisioner(t, fake)

	resp, email := inviteOnce(t, nil)
	if resp.ProvisionState != "created" {
		t.Fatalf("provision_state = %q, want created", resp.ProvisionState)
	}
	if resp.InitialPassword == nil || len(*resp.InitialPassword) < 12 {
		t.Fatalf("initial_password = %v, want a generated password", resp.InitialPassword)
	}
	if len(fake.emails) != 1 || fake.emails[0] != email {
		t.Fatalf("provisioner emails = %v, want [%s]", fake.emails, email)
	}
	if len(fake.passwords) != 1 || fake.passwords[0] != *resp.InitialPassword {
		t.Fatalf("provisioner password does not match the one returned to the admin")
	}
	state, detail := provisionStateOf(t, resp.ID)
	if state != "created" || detail != nil {
		t.Fatalf("stored state = %q detail = %v, want created/nil", state, detail)
	}
}

// The admin may choose the password; it is passed through untouched.
func TestCreateInvitationUsesAdminPassword(t *testing.T) {
	fake := &fakeProvisioner{result: supabaseauth.ProvisionResult{Created: true}}
	withProvisioner(t, fake)

	resp, _ := inviteOnce(t, map[string]any{"password": "Handover-2026!x"})
	if resp.InitialPassword == nil || *resp.InitialPassword != "Handover-2026!x" {
		t.Fatalf("initial_password = %v, want the admin's password echoed once", resp.InitialPassword)
	}
	if fake.passwords[0] != "Handover-2026!x" {
		t.Fatalf("provisioner password = %q", fake.passwords[0])
	}
}

// A too-short password is a bad request, not a provider failure.
func TestCreateInvitationRejectsWeakPassword(t *testing.T) {
	withProvisioner(t, &fakeProvisioner{result: supabaseauth.ProvisionResult{Created: true}})
	email := fmt.Sprintf("provision-weak-%d@example.com", time.Now().UnixNano())
	deleteInvitationForEmail(t, email)

	testutil.Call(t, testHandler.CreateInvitation,
		withURLParam(newRequest("POST", "/api/workspaces/"+testWorkspaceID+"/members", map[string]any{
			"email":    email,
			"role":     "member",
			"password": "short",
		}), "id", testWorkspaceID)).
		Want(http.StatusBadRequest)
}

// An address that already has a provider account is a success and gets no
// password: the person signs in with the one they have.
func TestCreateInvitationReportsExistingProviderAccount(t *testing.T) {
	withProvisioner(t, &fakeProvisioner{result: supabaseauth.ProvisionResult{AlreadyExists: true}})

	resp, _ := inviteOnce(t, nil)
	if resp.ProvisionState != "already_exists" {
		t.Fatalf("provision_state = %q, want already_exists", resp.ProvisionState)
	}
	if resp.InitialPassword != nil {
		t.Fatalf("initial_password = %v, want none for an existing account", resp.InitialPassword)
	}
	state, _ := provisionStateOf(t, resp.ID)
	if state != "already_exists" {
		t.Fatalf("stored state = %q", state)
	}
}

// A provider outage keeps the invitation and records why, so an owner can retry.
func TestCreateInvitationKeepsInvitationWhenProvisioningFails(t *testing.T) {
	withProvisioner(t, &fakeProvisioner{err: errors.New("supabase admin: account failed (503): upstream unavailable")})

	resp, _ := inviteOnce(t, nil)
	if resp.Status != "pending" {
		t.Fatalf("invitation status = %q, want pending — a provider failure must not lose the invitation", resp.Status)
	}
	if resp.ProvisionState != "failed" {
		t.Fatalf("provision_state = %q, want failed", resp.ProvisionState)
	}
	if resp.InitialPassword != nil {
		t.Fatalf("initial_password = %v, want none when no account was created", resp.InitialPassword)
	}
	state, detail := provisionStateOf(t, resp.ID)
	if state != "failed" || detail == nil || *detail == "" {
		t.Fatalf("stored state = %q detail = %v, want failed with a reason", state, detail)
	}
}

// No service key: the columns keep the migration default and no provider call is
// made. This is the self-hosted behaviour every deployment gets by default.
func TestCreateInvitationWithoutProvisionerStaysDisabled(t *testing.T) {
	withProvisioner(t, nil)

	resp, _ := inviteOnce(t, nil)
	state, detail := provisionStateOf(t, resp.ID)
	if state != "disabled" || detail != nil {
		t.Fatalf("stored state = %q detail = %v, want disabled/nil", state, detail)
	}
	if resp.InitialPassword != nil {
		t.Fatalf("initial_password = %v, want none without a service key", resp.InitialPassword)
	}
}

// The retry endpoint mints a new password (the first one was never stored), turns
// a failed row into a created one, and stays behind the owner/admin gate.
func TestProvisionInvitationRetriesAfterFailure(t *testing.T) {
	withProvisioner(t, &fakeProvisioner{err: errors.New("supabase admin: account failed (503)")})
	resp, _ := inviteOnce(t, nil)
	if state, _ := provisionStateOf(t, resp.ID); state != "failed" {
		t.Fatalf("precondition: state = %q, want failed", state)
	}

	fake := &fakeProvisioner{result: supabaseauth.ProvisionResult{Created: true, Subject: "provider-subject-1"}}
	testHandler.SupabaseProvisioner = fake
	retried := testutil.Decode[InvitationResponse](t, testHandler.ProvisionInvitation,
		provisionRequest(testWorkspaceID, resp.ID),
		http.StatusOK)
	if retried.ProvisionState != "created" {
		t.Fatalf("retry provision_state = %q, want created", retried.ProvisionState)
	}
	if retried.InitialPassword == nil {
		t.Fatalf("retry did not return a password")
	}
	if state, _ := provisionStateOf(t, resp.ID); state != "created" {
		t.Fatalf("stored state after retry = %q, want created", state)
	}
}

// A second retry on a row this server provisioned is a password reset: the
// invitee's password is replaced and shown again. This is the "I lost it" path.
func TestProvisionInvitationResetsPasswordWhenSubjectKnown(t *testing.T) {
	withProvisioner(t, &fakeProvisioner{result: supabaseauth.ProvisionResult{Created: true, Subject: "provider-subject-2"}})
	resp, _ := inviteOnce(t, nil)
	if resp.ProvisionState != "created" {
		t.Fatalf("precondition: state = %q, want created", resp.ProvisionState)
	}

	// The subject the create call returned is what the reset addresses.
	dbfx.QueryRow(t, `SELECT provision_subject FROM workspace_invitation WHERE id = $1`, resp.ID).Scan(new(string))

	fake := &fakeProvisioner{}
	testHandler.SupabaseProvisioner = fake
	again := testutil.Decode[InvitationResponse](t, testHandler.ProvisionInvitation,
		provisionRequest(testWorkspaceID, resp.ID),
		http.StatusOK)
	if again.ProvisionState != "password_reset" {
		t.Fatalf("provision_state = %q, want password_reset", again.ProvisionState)
	}
	if again.InitialPassword == nil {
		t.Fatalf("reset did not return the new password")
	}
	if len(fake.resets) != 1 || len(fake.emails) != 0 {
		t.Fatalf("resets = %v, creates = %v; want one reset and no create", fake.resets, fake.emails)
	}
	if want := "provider-subject-2|" + *again.InitialPassword; fake.resets[0] != want {
		t.Fatalf("reset target = %q, want %q", fake.resets[0], want)
	}
}

// Without a service key the retry endpoint says so instead of pretending.
func TestProvisionInvitationRequiresConfiguredProvider(t *testing.T) {
	withProvisioner(t, nil)
	resp, _ := inviteOnce(t, nil)
	testutil.Call(t, testHandler.ProvisionInvitation,
		provisionRequest(testWorkspaceID, resp.ID)).
		Want(http.StatusConflict)
}
