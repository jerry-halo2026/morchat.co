-- 624: the import pipeline's durable bookkeeping, plus the two chunk columns
-- retrieval needs to describe a hit instead of guessing at it.
--
-- `knowledge_import_tasks` is the state machine one upload walks through:
-- pending -> parsing -> chunking -> done, or -> failed from anywhere. The row is
-- written before the goroutine starts, so a crash leaves a task a reader can
-- classify (pending/parsing/chunking with an old created_at) instead of nothing
-- at all — which is what an in-memory job table would leave behind. `progress`
-- is the same 0..100 integer the SSE stream emits, so a client that loses the
-- stream and polls GET /api/knowledge/import/{id} reads the identical value.
--
-- The status set is a fresh closed set rather than an entry in
-- internal/knowledge/enums.go: that registry is pinned to the field sets in
-- packages/views/lib/knowledge/types.ts (enums_test.go), and an import task is
-- not part of the wire contract those types describe. The CHECK below is
-- therefore the single declaration, and import.go's transition table is the
-- second half of the same contract.
--
-- `chunk_config` keeps the per-import chunker knobs (512..800 token window,
-- 10..15% overlap, general vs parent_child) as jsonb so a re-segmentation can
-- be shown the configuration that produced the stored generation.

CREATE TABLE IF NOT EXISTS public.knowledge_import_tasks (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL,
    space_id uuid NOT NULL,
    title text NOT NULL DEFAULT '',
    source_type text NOT NULL DEFAULT 'upload',
    source_ref text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'pending',
    progress integer NOT NULL DEFAULT 0,
    error text,
    chunk_config jsonb NOT NULL DEFAULT '{}'::jsonb,
    item_id uuid,
    document_id uuid,
    chunk_count integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    CONSTRAINT knowledge_import_tasks_pkey PRIMARY KEY (id),
    CONSTRAINT knowledge_import_tasks_status_check
        CHECK (status IN ('pending', 'parsing', 'chunking', 'done', 'failed')),
    CONSTRAINT knowledge_import_tasks_progress_check
        CHECK (progress >= 0 AND progress <= 100),
    CONSTRAINT knowledge_import_tasks_workspace_fkey FOREIGN KEY (workspace_id)
        REFERENCES public.workspace(id)
        ON UPDATE NO ACTION ON DELETE CASCADE NOT DEFERRABLE,
    -- Same composite shape 621 gave knowledge_items: a task cannot name a space
    -- of another workspace.
    CONSTRAINT knowledge_import_tasks_space_fkey FOREIGN KEY (workspace_id, space_id)
        REFERENCES public.knowledge_spaces(workspace_id, id)
        ON UPDATE NO ACTION ON DELETE CASCADE NOT DEFERRABLE
);

CREATE INDEX IF NOT EXISTS knowledge_import_tasks_workspace_created_idx
    ON public.knowledge_import_tasks(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS knowledge_import_tasks_unfinished_idx
    ON public.knowledge_import_tasks(workspace_id, status)
    WHERE status IN ('pending', 'parsing', 'chunking');

-- `embedding_model` records which model produced a vector. Without it a stored
-- vector cannot be told apart from one a different model wrote, and comparing
-- the two spaces silently returns noise. 620 only creates `embedding` when
-- pgvector is installed, so this column is added unconditionally (it is plain
-- text) and the vector path stays gated on the embedding column itself.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'knowledge_chunks'
          AND column_name = 'embedding_model'
    ) THEN
        ALTER TABLE public.knowledge_chunks ADD COLUMN embedding_model text;
        RAISE NOTICE 'migration report: added knowledge_chunks.embedding_model';
    END IF;

    -- 620 already creates acl_tags; a database whose 620 predates that column
    -- (or a hand-built one) gets it here so the retrieval ACL filter can rely
    -- on it being present.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'knowledge_chunks'
          AND column_name = 'acl_tags'
    ) THEN
        ALTER TABLE public.knowledge_chunks ADD COLUMN acl_tags text[] NOT NULL DEFAULT '{}'::text[];
        RAISE NOTICE 'migration report: added knowledge_chunks.acl_tags';
    END IF;
END $$;

-- The keyword channel needs to_tsvector('simple', content). A stored generated
-- column is immutable-safe for that function and turns each search into an
-- index scan instead of a sequential re-parse of every chunk; search.go still
-- computes the expression on the fly when this column is absent, so a database
-- migrated by an older 624 keeps working.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'knowledge_chunks'
          AND column_name = 'content_tsv'
    ) THEN
        ALTER TABLE public.knowledge_chunks
            ADD COLUMN content_tsv tsvector
            GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED;
        RAISE NOTICE 'migration report: added knowledge_chunks.content_tsv';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS knowledge_chunks_content_tsv_idx
    ON public.knowledge_chunks USING gin (content_tsv);
