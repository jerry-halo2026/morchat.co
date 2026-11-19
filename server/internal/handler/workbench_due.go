package handler

// The due scan that turns a passed date into an inbox notice (docs/engineering/
// COLLAB-MODEL.md §4, batch B4-2).
//
// Shape, deliberately the same as `heartbeat_scheduler.go`: a ticker loop started
// once from `cmd/server/main.go`, an interval constant with the reasoning next to
// it, a `FlushNow` so tests can assert without sleeping, and a drain on shutdown.
// It is not a new worker process and it does not own a queue — the database is the
// queue, and this only asks it three questions on a schedule.
//
// Three properties of the scan itself:
//
//   - **One statement per source.** Each scan is a bulk `INSERT … SELECT` in
//     `workbench_flow.sql`, so the cost is one round trip per source per tick no
//     matter how many rows are due. Nothing here reads a row and then writes it.
//   - **One notice per subject per day.** The idempotency key is
//     `(subject_type, subject_id, type, 当日)` and it lives inside the INSERT's
//     `NOT EXISTS`, so a second tick in the same day inserts nothing. The day is
//     the database's `now()`, not Go's clock: one authority for "today".
//   - **No assignee, no notice.** A row nobody was handed has no recipient, and
//     the recipient is the assignee — member *or* agent. Both halves are enforced
//     in SQL (the assignee pair must resolve to a live member/agent of the
//     workspace), so an agent assignee is notified like a person and a stale
//     assignee id is skipped rather than written as a dead recipient.

import (
	"context"
	"log/slog"
	"sync"
	"time"

	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
)

// DefaultWorkbenchDueInterval is how often the due scan runs in production.
//
// Fifteen minutes, not thirty seconds: the calendar facts it reads (a passed
// follow-up date, a quote expiring inside a week, a settlement day gone by) change
// at the resolution of a day, and the notices they produce are deduplicated per
// day. A faster tick would cost statements without changing a single row. It is
// also short enough that a workspace created mid-day has its first notices within
// one coffee break rather than tomorrow.
const DefaultWorkbenchDueInterval = 15 * time.Minute

// WorkbenchDueScan is one tick's result: how many notices each source inserted.
// Reported separately because "42 rows" from three scans is not a number anyone
// can act on — "12 follow-ups, 30 quotes" is.
type WorkbenchDueScan struct {
	FollowUps   int64 `json:"followups"`
	Quotes      int64 `json:"quotes"`
	Settlements int64 `json:"settlements"`
}

// Total is what the log line and the tests assert on.
func (s WorkbenchDueScan) Total() int64 { return s.FollowUps + s.Quotes + s.Settlements }

// WorkbenchDueScheduler runs the due scan on a tick.
type WorkbenchDueScheduler struct {
	queries      *db.Queries
	tickInterval time.Duration
	logger       *slog.Logger

	stopOnce sync.Once
	stopCh   chan struct{}
	doneCh   chan struct{}
}

func NewWorkbenchDueScheduler(queries *db.Queries, tickInterval time.Duration, logger *slog.Logger) *WorkbenchDueScheduler {
	if tickInterval <= 0 {
		tickInterval = DefaultWorkbenchDueInterval
	}
	if logger == nil {
		logger = slog.Default()
	}
	return &WorkbenchDueScheduler{
		queries:      queries,
		tickInterval: tickInterval,
		logger:       logger,
		stopCh:       make(chan struct{}),
		doneCh:       make(chan struct{}),
	}
}

// Run drives the periodic scan. Intended to be invoked once in its own goroutine
// from main.go, next to the heartbeat scheduler.
func (s *WorkbenchDueScheduler) Run(ctx context.Context) {
	defer close(s.doneCh)
	ticker := time.NewTicker(s.tickInterval)
	defer ticker.Stop()
	for {
		select {
		case <-s.stopCh:
			// A final pass on shutdown, with its own deadline: the notices are
			// cheap and a cancelled parent context must not drop the last one.
			drainCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			_, _ = s.FlushNow(drainCtx)
			cancel()
			return
		case <-ctx.Done():
			drainCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			_, _ = s.FlushNow(drainCtx)
			cancel()
			return
		case <-ticker.C:
			if _, err := s.FlushNow(ctx); err != nil {
				// A failing scan must not stop the loop: tomorrow's notices would
				// then never be written. The error is logged per tick.
				s.logger.Error("workbench due scan failed", "error", err)
			}
		}
	}
}

// Stop signals Run to drain and exit, and blocks until it has.
func (s *WorkbenchDueScheduler) Stop() {
	s.stopOnce.Do(func() { close(s.stopCh) })
	<-s.doneCh
}

// FlushNow scans every source once. Exposed so a test can assert the second run of
// a day inserts nothing without waiting for a tick.
func (s *WorkbenchDueScheduler) FlushNow(ctx context.Context) (WorkbenchDueScan, error) {
	var scan WorkbenchDueScan

	followUps, err := s.queries.CreateDueFollowUpInboxItems(ctx)
	if err != nil {
		return scan, err
	}
	scan.FollowUps = followUps

	quotes, err := s.queries.CreateExpiringQuoteInboxItems(ctx)
	if err != nil {
		return scan, err
	}
	scan.Quotes = quotes

	settlements, err := s.queries.CreateOverdueSettlementInboxItems(ctx)
	if err != nil {
		return scan, err
	}
	scan.Settlements = settlements

	if scan.Total() > 0 {
		s.logger.Info("workbench due notices written",
			"followups", scan.FollowUps,
			"quotes", scan.Quotes,
			"settlements", scan.Settlements,
		)
	}
	return scan, nil
}
