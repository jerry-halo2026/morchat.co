package knowledge

import (
	"context"
	"fmt"
	"strings"
	"time"
)

// Writing back into the knowledge base.
//
// Reading was the whole tool surface until now: an agent could find a passage and
// open the document it came from, and that was it. Anything it worked out during a
// task died with the task's workdir. This is the other direction - the one that lets
// a run leave something behind.
//
// It reuses the import pipeline rather than writing rows by hand: chunking, item and
// document versioning, and the ACL rules all live there, and a second write path
// would be a second place for them to drift.

// defaultSpaceSlug is the space a note lands in when the caller does not name one.
// One per workspace, created on first write.
const defaultSpaceSlug = "general"

// defaultSpaceName is what that space is called in the UI.
const defaultSpaceName = "General"

// WriteRequest is one note an agent wants to keep.
type WriteRequest struct {
	WorkspaceID string
	OwnerID     string
	SpaceID     string
	Title       string
	Content     string
	SourceRef   string
	// Wait bounds how long the call blocks for the pipeline. Zero uses the default.
	Wait time.Duration
}

// WriteResult names what the write produced.
type WriteResult struct {
	TaskID     string `json:"task_id"`
	SpaceID    string `json:"space_id"`
	ItemID     string `json:"item_id,omitempty"`
	DocumentID string `json:"document_id,omitempty"`
	Chunks     int    `json:"chunk_count"`
	Status     string `json:"status"`
}

// writeWaitDefault is generous: chunking a few pages with an embedder configured is
// the slow case, and a timeout here surfaces as "nothing was written", which an agent
// cannot distinguish from "the write failed".
const writeWaitDefault = 45 * time.Second

// EnsureDefaultSpace returns the space notes land in, creating it on first use.
//
// The insert is an upsert on (workspace_id, slug), so two concurrent runs that both
// find nothing cannot mint two "General" spaces.
func (s *Service) EnsureDefaultSpace(ctx context.Context, workspaceID string) (string, error) {
	if strings.TrimSpace(workspaceID) == "" {
		return "", fmt.Errorf("%w: workspace_id is required", ErrInvalidField)
	}
	var id string
	// A space hangs off a wiki instance, and a workspace that never opened the
	// knowledge base has none yet - the same prerequisite CreateSpace handles. Both
	// inserts are upserts, so two concurrent runs converge on one row each.
	if _, err := s.db.Exec(ctx, `
		INSERT INTO knowledge_instances (workspace_id, wiki_id)
		VALUES ($1, $2)
		ON CONFLICT (workspace_id, wiki_id) DO NOTHING`, workspaceID, DefaultWikiID); err != nil {
		return "", fmt.Errorf("ensure knowledge instance: %w", err)
	}
	err := s.db.QueryRow(ctx, `
		INSERT INTO knowledge_spaces (workspace_id, wiki_id, slug, display_name)
		VALUES ($1::uuid, $2, $3, $4)
		ON CONFLICT (workspace_id, wiki_id, slug) DO UPDATE SET updated_at = now()
		RETURNING id::text`, workspaceID, DefaultWikiID, defaultSpaceSlug, defaultSpaceName).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("ensure default knowledge space: %w", err)
	}
	return id, nil
}

// WriteDocument stores content as a knowledge item and waits for the pipeline.
//
// Status is carried back rather than turned into an error: a task that failed has a
// reason the caller can read, and the caller here is a model deciding what to tell
// the user.
func (s *Service) WriteDocument(ctx context.Context, in WriteRequest) (WriteResult, error) {
	if strings.TrimSpace(in.Content) == "" {
		return WriteResult{}, fmt.Errorf("%w: content is required", ErrInvalidField)
	}
	spaceID := strings.TrimSpace(in.SpaceID)
	if spaceID == "" {
		var err error
		if spaceID, err = s.EnsureDefaultSpace(ctx, in.WorkspaceID); err != nil {
			return WriteResult{}, err
		}
	}

	task, err := s.StartImport(ctx, ImportRequest{
		WorkspaceID: in.WorkspaceID,
		SpaceID:     spaceID,
		Title:       strings.TrimSpace(in.Title),
		SourceType:  SourceTypeUpload,
		SourceRef:   strings.TrimSpace(in.SourceRef),
		MIME:        "text/markdown",
		Content:     []byte(in.Content),
		OwnerID:     in.OwnerID,
	})
	if err != nil {
		return WriteResult{}, err
	}

	wait := in.Wait
	if wait <= 0 {
		wait = writeWaitDefault
	}
	deadline := time.Now().Add(wait)
	for {
		current, err := s.GetImportTask(ctx, in.WorkspaceID, task.ID)
		if err != nil {
			return WriteResult{}, err
		}
		if current.Terminal() {
			result := WriteResult{
				TaskID:  current.ID,
				SpaceID: spaceID,
				Chunks:  current.ChunkCount,
				Status:  current.Status,
			}
			if current.ItemID != nil {
				result.ItemID = *current.ItemID
			}
			if current.DocumentID != nil {
				result.DocumentID = *current.DocumentID
			}
			if current.Status == ImportStatusFailed && current.Error != nil {
				return result, fmt.Errorf("%w: %s", ErrWriteFailed, *current.Error)
			}
			return result, nil
		}
		if time.Now().After(deadline) {
			return WriteResult{TaskID: task.ID, SpaceID: spaceID, Status: current.Status},
				fmt.Errorf("%w: import %s still %s after %s", ErrWriteTimeout, task.ID, current.Status, wait)
		}
		select {
		case <-ctx.Done():
			return WriteResult{TaskID: task.ID, SpaceID: spaceID, Status: current.Status}, ctx.Err()
		case <-time.After(150 * time.Millisecond):
		}
	}
}

// ErrWriteFailed marks a pipeline that finished unsuccessfully.
var ErrWriteFailed = fmt.Errorf("knowledge: write failed")

// ErrWriteTimeout marks a pipeline that outlived the caller's patience. The task keeps
// running; a later read will find the document if it lands.
var ErrWriteTimeout = fmt.Errorf("knowledge: write timed out")
