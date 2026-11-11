package main

import (
	"bufio"
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"text/tabwriter"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/spf13/cobra"

	"github.com/jerry-halo2026/morchat.co/server/internal/auth"
	"github.com/jerry-halo2026/morchat.co/server/internal/cli"
	"github.com/jerry-halo2026/morchat.co/server/internal/util"
	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
)

// Credential provisioning for a self-hosted deployment. These subcommands talk
// to PostgreSQL directly, not to the API: only the database holds the hash, and
// the alternative 鈥?an unauthenticated "create a user" endpoint on a public
// server 鈥?would be an invitation. `multica user import` is the same story for
// bulk onboarding: it writes user + member rows so a fresh instance can be
// populated before anyone can sign in.
//
// The database URL comes from --database-url, then DATABASE_URL, then
// MULTICA_DATABASE_URL (the same variable the server and migrate read).

const minCLIPasswordRunes = 10

var userCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a user with an email + password",
	Long: "Create an account that can sign in with email + password on a " +
		"self-hosted deployment. Idempotency is explicit: an existing email is an " +
		"error that points at `multica user password` instead of silently " +
		"overwriting the credential.",
	RunE: runUserCreate,
}

var userPasswordCmd = &cobra.Command{
	Use:   "password",
	Short: "Set a user's password",
	Long: "Replace the password of an existing account. Reads --password, or one " +
		"line from stdin when the flag is omitted so the secret stays out of the " +
		"shell history.",
	RunE: runUserPassword,
}

var userImportCmd = &cobra.Command{
	Use:   "import",
	Short: "Import users and workspace memberships from a CSV",
	Long: "Provision accounts from a CSV with columns email, name, role, password " +
		"(name, role, and password optional; role defaults to member). Each row " +
		"writes a user row and a member row for --workspace. Re-running the same " +
		"file is safe: existing emails and memberships are skipped, and every row " +
		"that changed something leaves an activity_log audit entry.",
	RunE: runUserImport,
}

func init() {
	userCmd.AddCommand(userCreateCmd)
	userCmd.AddCommand(userPasswordCmd)
	userCmd.AddCommand(userImportCmd)

	userCreateCmd.Flags().String("email", "", "Account email (required)")
	userCreateCmd.Flags().String("password", "", "Initial password, at least 10 characters (required)")
	userCreateCmd.Flags().String("name", "", "Display name (defaults to the email local part)")
	userCreateCmd.Flags().String("database-url", "", "PostgreSQL URL (env: DATABASE_URL)")
	userCreateCmd.Flags().String("output", "table", "Output format: table or json")

	userPasswordCmd.Flags().String("email", "", "Account email (required)")
	userPasswordCmd.Flags().String("password", "", "New password, at least 10 characters (defaults to one line from stdin)")
	userPasswordCmd.Flags().String("database-url", "", "PostgreSQL URL (env: DATABASE_URL)")
	userPasswordCmd.Flags().String("output", "table", "Output format: table or json")

	userImportCmd.Flags().String("csv", "", "Path to the CSV file (required)")
	userImportCmd.Flags().String("workspace", "", "Workspace id or slug the members are added to (required)")
	userImportCmd.Flags().String("database-url", "", "PostgreSQL URL (env: DATABASE_URL)")
}

func runUserCreate(cmd *cobra.Command, _ []string) error {
	email, err := normalizeAccountEmail(cmd)
	if err != nil {
		return err
	}
	password, _ := cmd.Flags().GetString("password")
	if err := validateCLIPassword(password); err != nil {
		return err
	}
	name, _ := cmd.Flags().GetString("name")
	name = strings.TrimSpace(name)
	if name == "" {
		name = defaultDisplayName(email)
	}

	ctx, cancel := cli.APIContext(context.Background())
	defer cancel()
	pool, queries, err := openUserAdminDB(cmd)
	if err != nil {
		return err
	}
	defer pool.Close()

	existing, err := queries.GetUserByEmail(ctx, email)
	if err == nil {
		return fmt.Errorf("user %s already exists (id %s); run `multica user password --email %s` to set a new password",
			email, uuidText(existing.ID), email)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return fmt.Errorf("look up user: %w", err)
	}

	hash, err := auth.Hash(password)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}
	created, err := queries.CreateUserWithPassword(ctx, db.CreateUserWithPasswordParams{
		Name:               name,
		Email:              email,
		PasswordHash:       pgText(hash),
		MustChangePassword: false,
	})
	if err != nil {
		return fmt.Errorf("create user: %w", err)
	}

	output, _ := cmd.Flags().GetString("output")
	if output == "json" {
		return cli.PrintJSON(os.Stdout, map[string]any{
			"id":                   uuidText(created.ID),
			"email":                created.Email,
			"name":                 created.Name,
			"must_change_password": created.MustChangePassword,
			"password_updated_at":  timestampText(created.PasswordUpdatedAt),
		})
	}

	w := tabwriter.NewWriter(os.Stdout, 0, 4, 2, ' ', 0)
	defer w.Flush()
	fmt.Fprintf(w, "ID\t%s\n", uuidText(created.ID))
	fmt.Fprintf(w, "EMAIL\t%s\n", created.Email)
	fmt.Fprintf(w, "NAME\t%s\n", created.Name)
	fmt.Fprintf(w, "PASSWORD UPDATED\t%s\n", timestampText(created.PasswordUpdatedAt))
	return nil
}

func runUserPassword(cmd *cobra.Command, _ []string) error {
	email, err := normalizeAccountEmail(cmd)
	if err != nil {
		return err
	}
	password, _ := cmd.Flags().GetString("password")
	if strings.TrimSpace(password) == "" {
		if password, err = readPasswordFromStdin(); err != nil {
			return err
		}
	}
	if err := validateCLIPassword(password); err != nil {
		return err
	}

	ctx, cancel := cli.APIContext(context.Background())
	defer cancel()
	pool, queries, err := openUserAdminDB(cmd)
	if err != nil {
		return err
	}
	defer pool.Close()

	user, err := queries.GetUserByEmail(ctx, email)
	if errors.Is(err, pgx.ErrNoRows) {
		return fmt.Errorf("user %s not found; create it first with `multica user create --email %s`", email, email)
	}
	if err != nil {
		return fmt.Errorf("look up user: %w", err)
	}

	hash, err := auth.Hash(password)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}
	updated, err := queries.SetUserPassword(ctx, db.SetUserPasswordParams{
		ID:                 user.ID,
		PasswordHash:       pgText(hash),
		MustChangePassword: false,
	})
	if err != nil {
		return fmt.Errorf("set password: %w", err)
	}

	output, _ := cmd.Flags().GetString("output")
	if output == "json" {
		return cli.PrintJSON(os.Stdout, map[string]any{
			"id":                   uuidText(updated.ID),
			"email":                updated.Email,
			"must_change_password": updated.MustChangePassword,
			"password_updated_at":  timestampText(updated.PasswordUpdatedAt),
		})
	}

	w := tabwriter.NewWriter(os.Stdout, 0, 4, 2, ' ', 0)
	defer w.Flush()
	fmt.Fprintf(w, "ID\t%s\n", uuidText(updated.ID))
	fmt.Fprintf(w, "EMAIL\t%s\n", updated.Email)
	fmt.Fprintf(w, "PASSWORD UPDATED\t%s\n", timestampText(updated.PasswordUpdatedAt))
	return nil
}

func runUserImport(cmd *cobra.Command, _ []string) error {
	csvPath, _ := cmd.Flags().GetString("csv")
	if strings.TrimSpace(csvPath) == "" {
		return fmt.Errorf("--csv is required")
	}
	workspaceRef, _ := cmd.Flags().GetString("workspace")
	if strings.TrimSpace(workspaceRef) == "" {
		return fmt.Errorf("--workspace is required (workspace id or slug)")
	}

	ctx, cancel := cli.APIContext(context.Background())
	defer cancel()
	pool, queries, err := openUserAdminDB(cmd)
	if err != nil {
		return err
	}
	defer pool.Close()

	workspace, err := lookupWorkspaceByRef(ctx, queries, workspaceRef)
	if err != nil {
		return err
	}

	file, err := os.Open(csvPath)
	if err != nil {
		return fmt.Errorf("open csv: %w", err)
	}
	defer file.Close()

	reader := csv.NewReader(file)
	reader.FieldsPerRecord = -1
	header, err := reader.Read()
	if err != nil {
		return fmt.Errorf("read csv header: %w", err)
	}
	columns := csvColumnIndexes(header)
	if _, ok := columns["email"]; !ok {
		return fmt.Errorf("csv header must include an email column, got %v", header)
	}

	var createdUsers, existingUsers, addedMemberships, skippedRows int
	for line := 2; ; line++ {
		record, err := reader.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return fmt.Errorf("read csv line %d: %w", line, err)
		}
		row := csvRow(record, columns)
		email := strings.ToLower(strings.TrimSpace(row["email"]))
		if email == "" {
			return fmt.Errorf("csv line %d: email is required", line)
		}
		role := strings.TrimSpace(row["role"])
		if role == "" {
			role = "member"
		}
		if role != "owner" && role != "admin" && role != "member" {
			return fmt.Errorf("csv line %d: role %q must be owner, admin, or member", line, role)
		}
		password := row["password"]
		if strings.TrimSpace(password) != "" {
			if err := validateCLIPassword(password); err != nil {
				return fmt.Errorf("csv line %d: %w", line, err)
			}
		}

		name := strings.TrimSpace(row["name"])
		if name == "" {
			name = defaultDisplayName(email)
		}

		user, err := queries.GetUserByEmail(ctx, email)
		var userCreated bool
		switch {
		case err == nil:
			existingUsers++
		case errors.Is(err, pgx.ErrNoRows):
			hash := pgtype.Text{}
			if strings.TrimSpace(password) != "" {
				derived, hashErr := auth.Hash(password)
				if hashErr != nil {
					return fmt.Errorf("csv line %d: hash password: %w", line, hashErr)
				}
				hash = pgText(derived)
			}
			if hash.Valid {
				user, err = queries.CreateUserWithPassword(ctx, db.CreateUserWithPasswordParams{
					Name:               name,
					Email:              email,
					PasswordHash:       hash,
					MustChangePassword: false,
				})
			} else {
				user, err = queries.CreateUser(ctx, db.CreateUserParams{Name: name, Email: email})
			}
			if err != nil {
				return fmt.Errorf("csv line %d: create user: %w", line, err)
			}
			createdUsers++
			userCreated = true
		default:
			return fmt.Errorf("csv line %d: look up user: %w", line, err)
		}

		membershipCreated := false
		_, err = queries.GetMemberByUserAndWorkspace(ctx, db.GetMemberByUserAndWorkspaceParams{
			UserID:      user.ID,
			WorkspaceID: workspace.ID,
		})
		switch {
		case err == nil:
			skippedRows++
		case errors.Is(err, pgx.ErrNoRows):
			if _, err := queries.CreateMember(ctx, db.CreateMemberParams{
				WorkspaceID: workspace.ID,
				UserID:      user.ID,
				Role:        role,
			}); err != nil {
				return fmt.Errorf("csv line %d: add member: %w", line, err)
			}
			addedMemberships++
			membershipCreated = true
		default:
			return fmt.Errorf("csv line %d: look up membership: %w", line, err)
		}

		if userCreated || membershipCreated {
			if err := recordImportAudit(ctx, queries, workspace.ID, user, role, userCreated, membershipCreated); err != nil {
				return fmt.Errorf("csv line %d: write audit: %w", line, err)
			}
		}
	}

	w := tabwriter.NewWriter(os.Stdout, 0, 4, 2, ' ', 0)
	defer w.Flush()
	fmt.Fprintf(w, "WORKSPACE\t%s (%s)\n", workspace.Name, uuidText(workspace.ID))
	fmt.Fprintf(w, "USERS CREATED\t%d\n", createdUsers)
	fmt.Fprintf(w, "USERS EXISTING\t%d\n", existingUsers)
	fmt.Fprintf(w, "MEMBERSHIPS ADDED\t%d\n", addedMemberships)
	fmt.Fprintf(w, "ROWS SKIPPED\t%d\n", skippedRows)
	return nil
}

// lookupWorkspaceByRef accepts a workspace UUID or slug, the same pair every
// other CLI subcommand accepts through --workspace-id.
func lookupWorkspaceByRef(ctx context.Context, queries *db.Queries, ref string) (db.Workspace, error) {
	ref = strings.TrimSpace(ref)
	if id, err := util.ParseUUID(ref); err == nil {
		workspace, err := queries.GetWorkspace(ctx, id)
		if err == nil {
			return workspace, nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return db.Workspace{}, fmt.Errorf("look up workspace: %w", err)
		}
	}
	workspace, err := queries.GetWorkspaceBySlug(ctx, ref)
	if errors.Is(err, pgx.ErrNoRows) {
		return db.Workspace{}, fmt.Errorf("workspace %q not found (pass a workspace id or slug)", ref)
	}
	if err != nil {
		return db.Workspace{}, fmt.Errorf("look up workspace: %w", err)
	}
	return workspace, nil
}

func recordImportAudit(ctx context.Context, queries *db.Queries, workspaceID pgtype.UUID, user db.User, role string, userCreated, membershipCreated bool) error {
	details, err := json.Marshal(map[string]any{
		"email":              user.Email,
		"user_id":            uuidText(user.ID),
		"role":               role,
		"user_created":       userCreated,
		"membership_created": membershipCreated,
		"source":             "cli:user-import",
	})
	if err != nil {
		return err
	}
	_, err = queries.CreateActivity(ctx, db.CreateActivityParams{
		WorkspaceID: workspaceID,
		ActorType:   pgText("system"),
		Action:      "user_imported",
		Details:     details,
	})
	return err
}

func openUserAdminDB(cmd *cobra.Command) (*pgxpool.Pool, *db.Queries, error) {
	raw, _ := cmd.Flags().GetString("database-url")
	raw = strings.TrimSpace(raw)
	if raw == "" {
		raw = strings.TrimSpace(os.Getenv("DATABASE_URL"))
	}
	if raw == "" {
		raw = strings.TrimSpace(os.Getenv("MULTICA_DATABASE_URL"))
	}
	if raw == "" {
		return nil, nil, fmt.Errorf("no database URL: pass --database-url or set DATABASE_URL")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, raw)
	if err != nil {
		return nil, nil, fmt.Errorf("connect database: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, nil, fmt.Errorf("connect database: %w", err)
	}
	return pool, db.New(pool), nil
}

func normalizeAccountEmail(cmd *cobra.Command) (string, error) {
	raw, _ := cmd.Flags().GetString("email")
	email := strings.ToLower(strings.TrimSpace(raw))
	if email == "" {
		return "", fmt.Errorf("--email is required")
	}
	if at := strings.Index(email, "@"); at <= 0 || at == len(email)-1 {
		return "", fmt.Errorf("--email %q is not a valid email address", raw)
	}
	return email, nil
}

func validateCLIPassword(password string) error {
	if strings.TrimSpace(password) == "" || utf8.RuneCountInString(password) < minCLIPasswordRunes {
		return fmt.Errorf("password must be at least %d characters", minCLIPasswordRunes)
	}
	return nil
}

func readPasswordFromStdin() (string, error) {
	scanner := bufio.NewScanner(os.Stdin)
	if !scanner.Scan() {
		if err := scanner.Err(); err != nil {
			return "", fmt.Errorf("read password from stdin: %w", err)
		}
		return "", fmt.Errorf("no password: pass --password or pipe one line on stdin")
	}
	return strings.TrimRight(scanner.Text(), "\r\n"), nil
}

func defaultDisplayName(email string) string {
	if at := strings.Index(email, "@"); at > 0 {
		return email[:at]
	}
	return email
}

func csvColumnIndexes(header []string) map[string]int {
	columns := make(map[string]int, len(header))
	for i, name := range header {
		columns[strings.ToLower(strings.TrimSpace(strings.TrimPrefix(name, "\ufeff")))] = i
	}
	return columns
}

func csvRow(record []string, columns map[string]int) map[string]string {
	row := make(map[string]string, len(columns))
	for name, index := range columns {
		if index < len(record) {
			row[name] = record[index]
		}
	}
	return row
}

func pgText(s string) pgtype.Text {
	if s == "" {
		return pgtype.Text{}
	}
	return pgtype.Text{String: s, Valid: true}
}

func uuidText(id pgtype.UUID) string {
	return util.UUIDToString(id)
}

func timestampText(ts pgtype.Timestamptz) string {
	if !ts.Valid {
		return "(never)"
	}
	return ts.Time.UTC().Format(time.RFC3339)
}
