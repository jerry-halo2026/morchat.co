package handler

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/multica-ai/multica/server/internal/auth"
	"github.com/multica-ai/multica/server/internal/supabaseauth"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

var errExternalIdentityCollision = errors.New("external identity conflicts with an existing account")

// Only public configuration is returned; no server key or account data.
func (h *Handler) SupabaseConfig(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	v := supabaseauth.FromEnv()
	if v == nil {
		writeJSON(w, http.StatusOK, map[string]bool{"enabled": false})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"enabled": true, "url": v.URL, "publishable_key": v.Key})
}

func (h *Handler) SupabaseLogin(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	v := supabaseauth.FromEnv()
	if v == nil {
		writeError(w, http.StatusNotFound, "password sign-in is not configured")
		return
	}
	// Reject browser-simple form submissions before any proof exchange or cookie
	// replacement. Browsers must preflight cross-origin application/json requests.
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		writeError(w, http.StatusUnsupportedMediaType, "application/json is required")
		return
	}
	var request struct {
		AccessToken string `json:"access_token"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 20*1024))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&request) != nil || decoder.Decode(new(any)) != io.EOF {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	identity, err := v.Verify(r.Context(), request.AccessToken)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "password sign-in could not be verified")
		return
	}
	if auth.IsTemporarilyDisabledUser(identity.Subject, identity.Email) {
		writeError(w, http.StatusForbidden, auth.TemporarilyDisabledUserError)
		return
	}
	user, err := h.findOrCreateSupabaseUser(r.Context(), identity)
	if err != nil {
		var signup SignupError
		switch {
		case errors.Is(err, errExternalIdentityCollision):
			writeError(w, http.StatusConflict, "account identity conflict; contact the administrator")
		case errors.As(err, &signup):
			writeError(w, http.StatusForbidden, signup.Error())
		default:
			writeError(w, http.StatusInternalServerError, "failed to establish local account")
		}
		return
	}
	token, err := auth.NewExternalSession(uuidToString(user.ID), user.Email, user.Name, identity.ExpiresAt)
	if err != nil {
		writeError(w, http.StatusForbidden, "session could not be established")
		return
	}
	if err := auth.SetAuthCookies(w, token); err != nil {
		auth.ClearAuthCookies(w)
		writeError(w, http.StatusInternalServerError, "failed to set session cookies")
		return
	}
	if h.CFSigner != nil {
		claims, _ := auth.ParseSessionToken(token)
		for _, cookie := range h.CFSigner.SignedCookies(auth.SessionExpiry(claims)) {
			http.SetCookie(w, cookie)
		}
	}
	writeJSON(w, http.StatusOK, LoginResponse{Token: token, User: h.userToResponse(user)})
}

// Durable project+sub binding, never an email-based account merge. The local
// transaction owns both rows; no provider table is read or changed here.
func (h *Handler) findOrCreateSupabaseUser(ctx context.Context, identity supabaseauth.Identity) (db.User, error) {
	if h.TxStarter == nil {
		return db.User{}, errors.New("local database unavailable")
	}
	tx, err := h.TxStarter.Begin(ctx)
	if err != nil {
		return db.User{}, err
	}
	defer tx.Rollback(ctx)
	// Serialize the same provider subject; DB unique email/UUID constraints also
	// reject cross-subject races, and any insert failure rolls back both rows.
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, supabaseauth.Project+":"+identity.Subject); err != nil {
		return db.User{}, err
	}
	var userID string
	err = tx.QueryRow(ctx, `SELECT user_id::text FROM external_auth_identity WHERE project=$1 AND subject=$2::uuid`, supabaseauth.Project, identity.Subject).Scan(&userID)
	q := db.New(tx)
	if err == nil {
		user, err := q.GetUser(ctx, parseUUID(userID))
		if err != nil {
			return db.User{}, err
		}
		if userID != identity.Subject || !strings.EqualFold(user.Email, identity.Email) {
			return db.User{}, errExternalIdentityCollision
		}
		if err = tx.Commit(ctx); err != nil {
			return db.User{}, err
		}
		return user, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return db.User{}, err
	}
	var exists bool
	if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM "user" WHERE id=$1::uuid OR lower(email)=lower($2))`, identity.Subject, identity.Email).Scan(&exists); err != nil {
		return db.User{}, err
	}
	if exists {
		return db.User{}, errExternalIdentityCollision
	}
	if err = h.checkSignupAllowed(ctx, identity.Email, true); err != nil {
		return db.User{}, err
	}
	name := strings.SplitN(identity.Email, "@", 2)[0]
	if _, err = tx.Exec(ctx, `INSERT INTO "user" (id,name,email) VALUES ($1::uuid,$2,$3)`, identity.Subject, name, identity.Email); err != nil {
		return db.User{}, err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO external_auth_identity(project,subject,user_id) VALUES($1,$2::uuid,$2::uuid)`, supabaseauth.Project, identity.Subject); err != nil {
		return db.User{}, err
	}
	user, err := q.GetUser(ctx, parseUUID(identity.Subject))
	if err != nil {
		return db.User{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return db.User{}, err
	}
	return user, nil
}
