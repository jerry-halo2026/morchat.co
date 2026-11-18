// orange-sync mirrors the orange 达人 (creator lead) database into one
// workspace, and is the only writer of the mirror columns added in migration
// 785. See docs/engineering/ORANGE-SYNC.md.
//
//	go run ./cmd/orange-sync -workspace xinghe -account <uuid> [-since RFC3339] [-dry-run] [-limit 500]
//
// The command prints one JSON summary on stdout. A run that succeeded with
// warnings still exits 0 — warnings are data-quality notes about the upstream
// rows, not failures of this run. Anything that stopped the mirror from being
// correct (missing configuration, bad workspace, database error) exits 1.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
	"github.com/jerry-halo2026/morchat.co/server/pkg/orange"
)

// printedWarnings caps how many warnings the summary carries: a broken upstream
// column can produce one per row, and a 623-line JSON blob is not a report.
const printedWarnings = 20

type summary struct {
	WorkspaceID  string           `json:"workspace_id"`
	Workspace    string           `json:"workspace"`
	AccountID    string           `json:"account_id"`
	DryRun       bool             `json:"dry_run"`
	Since        *string          `json:"since,omitempty"`
	Scanned      int              `json:"scanned"`
	Created      int              `json:"created"`
	Updated      int              `json:"updated"`
	Archived     int              `json:"archived"`
	Skipped      int              `json:"skipped"`
	WarningCount int              `json:"warning_count"`
	Warnings     []orange.Warning `json:"warnings"`
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "orange-sync: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	flag.Usage = func() {
		fmt.Fprintln(flag.CommandLine.Output(), "usage: orange-sync -workspace <slug|uuid> -account <uuid> [-since RFC3339] [-dry-run] [-limit 500]")
		flag.PrintDefaults()
	}
	workspaceFlag := flag.String("workspace", "", "workspace slug or uuid to mirror into (required)")
	accountFlag := flag.String("account", "", "orange account id to mirror (required)")
	sinceFlag := flag.String("since", "", "only rows updated at or after this RFC3339 instant; also disables archiving")
	dryRunFlag := flag.Bool("dry-run", false, "run the whole sync inside a transaction and roll it back")
	limitFlag := flag.Int("limit", 500, "upstream page size")
	flag.Parse()

	if strings.TrimSpace(*workspaceFlag) == "" {
		return errors.New("-workspace is required")
	}
	if strings.TrimSpace(*accountFlag) == "" {
		return errors.New("-account is required")
	}
	if *limitFlag < 1 {
		return errors.New("-limit must be at least 1")
	}

	accountID, err := uuid.Parse(strings.TrimSpace(*accountFlag))
	if err != nil {
		return fmt.Errorf("-account %q is not a uuid: %w", *accountFlag, err)
	}

	var since time.Time
	if *sinceFlag != "" {
		since, err = time.Parse(time.RFC3339, *sinceFlag)
		if err != nil {
			return fmt.Errorf("-since %q is not RFC3339: %w", *sinceFlag, err)
		}
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://multica:multica@localhost:5432/multica?sslmode=disable"
	}
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		return fmt.Errorf("connect to database: %w", err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		return fmt.Errorf("ping database: %w", err)
	}

	queries := db.New(pool)
	workspace, err := resolveWorkspace(ctx, queries, *workspaceFlag)
	if err != nil {
		return err
	}
	workspaceID := uuid.UUID(workspace.ID.Bytes)

	// Claiming the account is the mapping decision (§ orange_account): one
	// upstream account is mirrored into exactly one workspace, and a second
	// workspace must fail here instead of quietly duplicating the mirror.
	if *dryRunFlag {
		if _, err := queries.GetOrangeAccount(ctx, pguuid(accountID)); err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("read orange account mapping: %w", err)
		}
	} else {
		claimed, err := queries.RecordOrangeAccount(ctx, db.RecordOrangeAccountParams{
			WorkspaceID: workspace.ID,
			AccountID:   pguuid(accountID),
		})
		if err != nil {
			return fmt.Errorf("record orange account mapping: %w", err)
		}
		if claimed == 0 {
			mapping, err := queries.GetOrangeAccount(ctx, pguuid(accountID))
			if err != nil {
				return fmt.Errorf("read orange account mapping: %w", err)
			}
			if uuid.UUID(mapping.WorkspaceID.Bytes) != workspaceID {
				return fmt.Errorf(
					"orange account %s is already mirrored into workspace %s; one upstream account belongs to one workspace",
					accountID, uuid.UUID(mapping.WorkspaceID.Bytes),
				)
			}
		}
	}

	client, err := orange.NewFromEnv(ctx)
	if err != nil {
		if errors.Is(err, orange.ErrDisabled) {
			return fmt.Errorf("set %s to the orange connection string", orange.EnvDatabaseURL)
		}
		return err
	}
	defer client.Close()

	result, err := client.SyncCreators(ctx, pool, orange.SyncOptions{
		WorkspaceID: workspaceID,
		AccountID:   accountID,
		Since:       since,
		Limit:       *limitFlag,
		DryRun:      *dryRunFlag,
	})
	if err != nil {
		return err
	}

	payload := summary{
		WorkspaceID:  workspaceID.String(),
		Workspace:    workspace.Slug,
		AccountID:    accountID.String(),
		DryRun:       *dryRunFlag,
		Scanned:      result.Scanned,
		Created:      result.Created,
		Updated:      result.Updated,
		Archived:     result.Archived,
		Skipped:      result.Skipped,
		WarningCount: len(result.Warnings),
		Warnings:     result.Warnings,
	}
	if !since.IsZero() {
		stamp := since.UTC().Format(time.RFC3339)
		payload.Since = &stamp
	}
	if len(payload.Warnings) > printedWarnings {
		payload.Warnings = payload.Warnings[:printedWarnings]
	}

	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	return encoder.Encode(payload)
}

// resolveWorkspace accepts either the slug a person types or the uuid a script
// has. Both are resolved against this database, so a typo fails here instead of
// creating a workspace_id that matches nothing.
func resolveWorkspace(ctx context.Context, queries *db.Queries, raw string) (db.Workspace, error) {
	trimmed := strings.TrimSpace(raw)
	if id, err := uuid.Parse(trimmed); err == nil {
		workspace, err := queries.GetWorkspace(ctx, pguuid(id))
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return db.Workspace{}, fmt.Errorf("workspace %s does not exist", id)
			}
			return db.Workspace{}, fmt.Errorf("read workspace: %w", err)
		}
		return workspace, nil
	}
	workspace, err := queries.GetWorkspaceBySlug(ctx, trimmed)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return db.Workspace{}, fmt.Errorf("workspace %q does not exist", trimmed)
		}
		return db.Workspace{}, fmt.Errorf("read workspace: %w", err)
	}
	return workspace, nil
}

func pguuid(id uuid.UUID) pgtype.UUID {
	return pgtype.UUID{Bytes: id, Valid: true}
}
