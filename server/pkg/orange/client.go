// Package orange reads the creator-marketing ("达人建联") Postgres database as a
// read-only upstream source of truth.
//
// Creators, their crawled content and the product SKU catalogue live in that
// database; morechat mirrors them and never owns them. Nothing here writes:
// every pooled connection is opened read-only, and each query is a SELECT over
// explicitly named columns.
//
// The source is optional. When ORANGE_DATABASE_URL is unset the client is
// disabled and every method reports ErrDisabled, so a sync job can skip the
// upstream instead of failing the request that triggered it.
package orange

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// EnvDatabaseURL names the connection string of the orange database, for
// example:
//
//	postgres://postgres:orange_dev_pw@127.0.0.1:55433/orange_daren?sslmode=disable
const EnvDatabaseURL = "ORANGE_DATABASE_URL"

const (
	// maxConns keeps the mirror reader inside the upstream's connection budget.
	// The work is a handful of sequential batch SELECTs, not per-request
	// traffic, so a large pool would only hold idle connections against a
	// database we do not own.
	maxConns int32 = 4

	// statementTimeout bounds one batch SELECT so a slow upstream plan cannot
	// stall a mirror run indefinitely.
	statementTimeout = 10 * time.Second

	// connectTimeout bounds the TCP + startup handshake for a new connection.
	connectTimeout = 5 * time.Second

	applicationName = "morchat-orange-reader"

	// readOnlyParam is applied on every connection, not once per pool: a
	// `SET` executed through the pool would only reach the connection it
	// happened to check out.
	readOnlyParam = "default_transaction_read_only"
)

// ErrDisabled reports that ORANGE_DATABASE_URL is not configured. Callers treat
// it as "nothing to sync", never as a failure.
var ErrDisabled = errors.New("orange: " + EnvDatabaseURL + " is not configured")

// Client is a read-only handle on the orange database. The zero value and a nil
// *Client are both disabled clients, so callers may hold one unconditionally.
type Client struct {
	pool *pgxpool.Pool
}

// NewFromEnv builds the client from ORANGE_DATABASE_URL. When the variable is
// empty it returns ErrDisabled together with a disabled client, so a caller can
// keep the handle unconditionally and let every method report ErrDisabled.
func NewFromEnv(ctx context.Context) (*Client, error) {
	return newFromURL(ctx, os.Getenv(EnvDatabaseURL))
}

// newFromURL is the test seam: the real database is reachable in CI only
// through an explicitly supplied URL.
func newFromURL(ctx context.Context, databaseURL string) (*Client, error) {
	if databaseURL == "" {
		return &Client{}, ErrDisabled
	}

	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("orange: parse %s: %w", EnvDatabaseURL, err)
	}
	if cfg.ConnConfig.ConnectTimeout <= 0 {
		cfg.ConnConfig.ConnectTimeout = connectTimeout
	}
	if cfg.ConnConfig.RuntimeParams == nil {
		cfg.ConnConfig.RuntimeParams = map[string]string{}
	}
	// The connection string may already pin either setting; an operator's
	// explicit value wins so the pool never quietly overrides it.
	if _, ok := cfg.ConnConfig.RuntimeParams["statement_timeout"]; !ok {
		cfg.ConnConfig.RuntimeParams["statement_timeout"] = strconv.FormatInt(statementTimeout.Milliseconds(), 10)
	}
	if _, ok := cfg.ConnConfig.RuntimeParams[readOnlyParam]; !ok {
		cfg.ConnConfig.RuntimeParams[readOnlyParam] = "on"
	}
	cfg.ConnConfig.RuntimeParams["application_name"] = applicationName
	cfg.MaxConns = maxConns
	cfg.MinConns = 0

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("orange: open pool: %w", err)
	}

	// Fail closed: a reader that cannot prove it is read-only must not run.
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("orange: connect: %w", err)
	}
	var readOnly string
	if err := pool.QueryRow(ctx, "SHOW "+readOnlyParam).Scan(&readOnly); err != nil {
		pool.Close()
		return nil, fmt.Errorf("orange: read %s: %w", readOnlyParam, err)
	}
	if readOnly != "on" {
		pool.Close()
		return nil, fmt.Errorf("orange: refusing to use a writable connection (%s=%q)", readOnlyParam, readOnly)
	}

	return &Client{pool: pool}, nil
}

// Enabled reports whether the client is configured and connected.
func (c *Client) Enabled() bool {
	return c != nil && c.pool != nil
}

// Close releases the pool. It is safe on a disabled client.
func (c *Client) Close() {
	if !c.Enabled() {
		return
	}
	c.pool.Close()
	c.pool = nil
}

// ensure reports ErrDisabled once, so each query starts with the same guard.
func (c *Client) ensure() error {
	if !c.Enabled() {
		return ErrDisabled
	}
	return nil
}
