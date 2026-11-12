// Command backfill-avatars gives every agent without a face an Aora one.
//
// Agents created before avatars were derived carry an `emoji:` value or nothing at
// all, which is why a workspace full of agents still looks like the old product. The
// derived face is keyed on the agent id, so running this twice changes nothing the
// second time.
//
// It is a command rather than a migration on purpose: the derivation lives in Go
// (internal/avatar), and reimplementing the hash in SQL would be a second source of
// truth for the same rule.
package main

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jerry-halo2026/morchat.co/server/internal/avatar"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "backfill-avatars:", err)
		os.Exit(1)
	}
}

func run() error {
	dsn := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if dsn == "" {
		return fmt.Errorf("DATABASE_URL is required")
	}
	dryRun := os.Getenv("DRY_RUN") == "1"

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return fmt.Errorf("connect: %w", err)
	}
	defer pool.Close()

	rows, err := pool.Query(ctx,
		`SELECT id::text, coalesce(name, ''), coalesce(avatar_url, '')
		   FROM agent
		  WHERE archived_at IS NULL
		    AND (avatar_url IS NULL OR avatar_url = '' OR avatar_url LIKE 'emoji:%')
		  ORDER BY created_at`)
	if err != nil {
		return fmt.Errorf("select agents: %w", err)
	}
	type pending struct{ id, name, current string }
	var todo []pending
	for rows.Next() {
		var p pending
		if err := rows.Scan(&p.id, &p.name, &p.current); err != nil {
			rows.Close()
			return fmt.Errorf("scan: %w", err)
		}
		todo = append(todo, p)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate: %w", err)
	}

	if len(todo) == 0 {
		fmt.Println("nothing to backfill")
		return nil
	}

	updated := 0
	for _, p := range todo {
		spec := avatar.DeriveSpec(p.id).Encode()
		if dryRun {
			fmt.Printf("would set %s (%s): %q -> %s\n", p.name, p.id, p.current, spec)
			continue
		}
		tag, err := pool.Exec(ctx,
			`UPDATE agent SET avatar_url = $2, updated_at = now()
			  WHERE id = $1::uuid
			    AND (avatar_url IS NULL OR avatar_url = '' OR avatar_url LIKE 'emoji:%')`,
			p.id, spec)
		if err != nil {
			return fmt.Errorf("update %s: %w", p.id, err)
		}
		updated += int(tag.RowsAffected())
	}

	if dryRun {
		fmt.Printf("%d agents would be backfilled\n", len(todo))
		return nil
	}
	fmt.Printf("backfilled %d of %d agents\n", updated, len(todo))
	return nil
}
