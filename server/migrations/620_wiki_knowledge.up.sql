-- 620: knowledge domain — port of the Paperclip LLM-wiki schema.
--
-- Source: D:\dev\refs\paperclip\packages\plugins\plugin-llm-wiki\migrations
-- (001_llm_wiki.sql, 002_paperclip_distillation.sql, 003_spaces.sql), MIT.
-- Structural changes on the way in:
--   * the plugin schema indirection (`plugin_llm_wiki_<hash>.`) is dropped;
--     every table lands in `public` and is renamed `knowledge_*`;
--   * `company_id` becomes `workspace_id` and references public.workspace;
--   * Paperclip's `public.issues` / `public.projects` / `public.agents`
--     references become our `public.issue` / `public.project` scoped by
--     workspace_id, so a cross-workspace id can never satisfy a child row;
--   * the plugin's `wiki_operations` / `wiki_query_sessions` /
--     `wiki_resource_bindings` tables are not ported (no consumer in P0);
--   * `paperclip_source_snapshots` / `paperclip_page_bindings` are not
--     ported — distillation keeps its three scheduling tables only.
--
-- Optional extensions are all fail-soft, following 032_issue_search_index:
-- a database without them still migrates, only the accelerated search path is
-- skipped. `vector` is deliberately NOT required: the embedding column is added
-- only when pgvector is present, so this migration applies on a stock Postgres
-- and on the pgvector image alike. See the 4th DO block below.

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgcrypto not available, relying on the built-in gen_random_uuid()';
END
$$;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm not available, skipping trigram indexes';
END
$$;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_bigm;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_bigm not available, skipping bigram indexes';
END
$$;

-- pgvector is optional by contract (docs/plans/KNOWLEDGE-INTEGRATION-PLAN.md
-- §6): the keyword channel must work without it. Attempt an install, but never
-- fail the migration when the server has no pgvector package.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgvector not available, knowledge_chunks.embedding will be absent until it is installed';
END
$$;

-- ---------------------------------------------------------------------------
-- Space layer (003_spaces.sql)
-- ---------------------------------------------------------------------------
CREATE TABLE public.knowledge_instances (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL,
    wiki_id text NOT NULL DEFAULT 'default',
    root_folder_key text NOT NULL DEFAULT 'wiki-root',
    configured_root_path text,
    schema_version integer NOT NULL DEFAULT 1,
    search_mode text NOT NULL DEFAULT 'hybrid',
    settings jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT knowledge_instances_pkey PRIMARY KEY (id),
    CONSTRAINT knowledge_instances_workspace_wiki_key UNIQUE (workspace_id, wiki_id),
    CONSTRAINT knowledge_instances_mode_check CHECK (search_mode IN ('keyword', 'vector', 'hybrid')),
    CONSTRAINT knowledge_instances_workspace_fkey FOREIGN KEY (workspace_id)
        REFERENCES public.workspace(id)
        ON UPDATE NO ACTION ON DELETE CASCADE NOT DEFERRABLE
);

CREATE TABLE public.knowledge_spaces (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL,
    wiki_id text NOT NULL DEFAULT 'default',
    slug text NOT NULL,
    display_name text NOT NULL,
    space_type text NOT NULL DEFAULT 'local_folder',
    folder_mode text NOT NULL DEFAULT 'managed_subfolder',
    root_folder_key text NOT NULL DEFAULT 'wiki-root',
    path_prefix text,
    configured_root_path text,
    access_scope text NOT NULL DEFAULT 'shared',
    owner_id uuid,
    team_key text,
    settings jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT knowledge_spaces_pkey PRIMARY KEY (id),
    CONSTRAINT knowledge_spaces_workspace_id_key UNIQUE (workspace_id, id),
    CONSTRAINT knowledge_spaces_workspace_wiki_slug_key UNIQUE (workspace_id, wiki_id, slug),
    CONSTRAINT knowledge_spaces_instance_fkey FOREIGN KEY (workspace_id, wiki_id)
        REFERENCES public.knowledge_instances(workspace_id, wiki_id)
        ON UPDATE NO ACTION ON DELETE CASCADE NOT DEFERRABLE
);

CREATE INDEX knowledge_spaces_instance_status_idx
    ON public.knowledge_spaces(workspace_id, wiki_id, status);

-- ---------------------------------------------------------------------------
-- 条目 (the K1 domain object the enums registry describes)
-- ---------------------------------------------------------------------------
CREATE TABLE public.knowledge_items (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL,
    project_id uuid,
    title text NOT NULL,
    kind text NOT NULL DEFAULT 'doc',
    source_type text NOT NULL DEFAULT 'upload',
    source_ref text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'draft',
    owner_id uuid,
    acl_mode text NOT NULL DEFAULT 'workspace',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT knowledge_items_pkey PRIMARY KEY (id),
    CONSTRAINT knowledge_items_workspace_id_key UNIQUE (workspace_id, id),
    CONSTRAINT knowledge_items_kind_check CHECK (kind IN ('doc', 'link', 'repo', 'issue_artifact', 'note')),
    CONSTRAINT knowledge_items_source_type_check CHECK (source_type IN ('upload', 'url', 'obsidian_vault', 'nas_path', 's3_key', 'issue_attachment')),
    CONSTRAINT knowledge_items_status_check CHECK (status IN ('draft', 'active', 'deprecated')),
    CONSTRAINT knowledge_items_acl_mode_check CHECK (acl_mode IN ('workspace', 'project', 'private')),
    CONSTRAINT knowledge_items_workspace_fkey FOREIGN KEY (workspace_id)
        REFERENCES public.workspace(id)
        ON UPDATE NO ACTION ON DELETE CASCADE NOT DEFERRABLE,
    -- Nullable half of a composite key: MATCH SIMPLE skips the check when
    -- project_id is NULL, so workspace-private items stay legal.
    CONSTRAINT knowledge_items_project_fkey FOREIGN KEY (workspace_id, project_id)
        REFERENCES public.project(workspace_id, id)
        ON UPDATE NO ACTION ON DELETE CASCADE NOT DEFERRABLE
);

CREATE INDEX knowledge_items_workspace_status_idx
    ON public.knowledge_items(workspace_id, status, updated_at DESC);
CREATE INDEX knowledge_items_workspace_kind_idx
    ON public.knowledge_items(workspace_id, kind);
CREATE INDEX knowledge_items_workspace_project_idx
    ON public.knowledge_items(workspace_id, project_id);

-- ---------------------------------------------------------------------------
-- Sources, pages, revisions (001_llm_wiki.sql)
-- ---------------------------------------------------------------------------
CREATE TABLE public.knowledge_sources (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL,
    space_id uuid NOT NULL,
    source_type text NOT NULL,
    title text,
    url text,
    raw_path text NOT NULL,
    content_hash text NOT NULL,
    status text NOT NULL DEFAULT 'captured',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT knowledge_sources_pkey PRIMARY KEY (id),
    CONSTRAINT knowledge_sources_workspace_id_key UNIQUE (workspace_id, id),
    CONSTRAINT knowledge_sources_space_fkey FOREIGN KEY (workspace_id, space_id)
        REFERENCES public.knowledge_spaces(workspace_id, id)
        ON UPDATE NO ACTION ON DELETE CASCADE NOT DEFERRABLE
);

CREATE INDEX knowledge_sources_space_idx
    ON public.knowledge_sources(workspace_id, space_id, created_at DESC);

CREATE TABLE public.knowledge_pages (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL,
    space_id uuid NOT NULL,
    path text NOT NULL,
    title text,
    page_type text,
    frontmatter jsonb NOT NULL DEFAULT '{}'::jsonb,
    source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
    content_hash text,
    current_revision_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT knowledge_pages_pkey PRIMARY KEY (id),
    CONSTRAINT knowledge_pages_workspace_id_key UNIQUE (workspace_id, id),
    CONSTRAINT knowledge_pages_space_path_key UNIQUE (workspace_id, space_id, path),
    CONSTRAINT knowledge_pages_space_fkey FOREIGN KEY (workspace_id, space_id)
        REFERENCES public.knowledge_spaces(workspace_id, id)
        ON UPDATE NO ACTION ON DELETE CASCADE NOT DEFERRABLE
);

CREATE INDEX knowledge_pages_space_updated_idx
    ON public.knowledge_pages(workspace_id, space_id, updated_at DESC);

CREATE TABLE public.knowledge_page_revisions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL,
    space_id uuid NOT NULL,
    page_id uuid,
    operation_id uuid,
    path text NOT NULL,
    content_hash text NOT NULL,
    summary text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT knowledge_page_revisions_pkey PRIMARY KEY (id),
    CONSTRAINT knowledge_page_revisions_page_fkey FOREIGN KEY (workspace_id, page_id)
        REFERENCES public.knowledge_pages(workspace_id, id)
        ON UPDATE NO ACTION ON DELETE CASCADE NOT DEFERRABLE,
    CONSTRAINT knowledge_page_revisions_space_fkey FOREIGN KEY (workspace_id, space_id)
        REFERENCES public.knowledge_spaces(workspace_id, id)
        ON UPDATE NO ACTION ON DELETE CASCADE NOT DEFERRABLE
);

CREATE INDEX knowledge_page_revisions_page_idx
    ON public.knowledge_page_revisions(page_id, created_at DESC);
CREATE INDEX knowledge_page_revisions_space_idx
    ON public.knowledge_page_revisions(workspace_id, space_id, created_at DESC);

-- Backlinks are materialised as edges instead of Paperclip's `backlinks jsonb`
-- array: the reader needs "what links *to* this page" without parsing every
-- page body, and the writer can diff one page's edge set atomically.
-- `target_path` is kept even when target_page_id resolves, so a link to a page
-- that does not exist yet (a "red link") survives until the page is created.
CREATE TABLE public.knowledge_page_backlinks (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL,
    space_id uuid NOT NULL,
    source_page_id uuid NOT NULL,
    target_page_id uuid,
    target_path text NOT NULL,
    anchor text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT knowledge_page_backlinks_pkey PRIMARY KEY (id),
    CONSTRAINT knowledge_page_backlinks_edge_key UNIQUE (workspace_id, space_id, source_page_id, target_path),
    CONSTRAINT knowledge_page_backlinks_source_fkey FOREIGN KEY (workspace_id, source_page_id)
        REFERENCES public.knowledge_pages(workspace_id, id)
        ON UPDATE NO ACTION ON DELETE CASCADE NOT DEFERRABLE,
    CONSTRAINT knowledge_page_backlinks_target_fkey FOREIGN KEY (workspace_id, target_page_id)
        REFERENCES public.knowledge_pages(workspace_id, id)
        ON UPDATE NO ACTION ON DELETE CASCADE NOT DEFERRABLE,
    CONSTRAINT knowledge_page_backlinks_space_fkey FOREIGN KEY (workspace_id, space_id)
        REFERENCES public.knowledge_spaces(workspace_id, id)
        ON UPDATE NO ACTION ON DELETE CASCADE NOT DEFERRABLE
);

CREATE INDEX knowledge_page_backlinks_target_page_idx
    ON public.knowledge_page_backlinks(workspace_id, target_page_id);
CREATE INDEX knowledge_page_backlinks_target_path_idx
    ON public.knowledge_page_backlinks(workspace_id, space_id, target_path);

-- ---------------------------------------------------------------------------
-- Documents and chunks (plan §5; Evose chunk semantics in EVOSE-KB-API §4)
-- ---------------------------------------------------------------------------
CREATE TABLE public.knowledge_documents (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL,
    item_id uuid NOT NULL,
    version integer NOT NULL DEFAULT 1,
    mime text NOT NULL DEFAULT 'text/markdown',
    bytes bigint NOT NULL DEFAULT 0,
    sha256 text NOT NULL DEFAULT '',
    storage_key text,
    parsed_at timestamptz,
    parse_engine text NOT NULL DEFAULT 'native',
    generation integer NOT NULL DEFAULT 1,
    active_generation integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT knowledge_documents_pkey PRIMARY KEY (id),
    CONSTRAINT knowledge_documents_workspace_id_key UNIQUE (workspace_id, id),
    CONSTRAINT knowledge_documents_item_version_key UNIQUE (item_id, version),
    CONSTRAINT knowledge_documents_parse_engine_check CHECK (parse_engine IN ('native', 'ragflow_deepdoc')),
    CONSTRAINT knowledge_documents_item_fkey FOREIGN KEY (workspace_id, item_id)
        REFERENCES public.knowledge_items(workspace_id, id)
        ON UPDATE NO ACTION ON DELETE CASCADE NOT DEFERRABLE
);

CREATE INDEX knowledge_documents_item_idx
    ON public.knowledge_documents(item_id, version DESC);

-- `content` carries plan §5's `text` chunk body. The DDL name avoids colliding
-- with the type name in every hand-written query; the API field is `content` on
-- both sides of the wire (internal/knowledge/enums.go, packages/views/lib).
CREATE TABLE public.knowledge_chunks (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL,
    document_id uuid NOT NULL,
    generation integer NOT NULL DEFAULT 1,
    ord integer NOT NULL,
    content text NOT NULL,
    tokens integer NOT NULL DEFAULT 0,
    heading_path text,
    page_from integer,
    page_to integer,
    acl_tags text[] NOT NULL DEFAULT '{}'::text[],
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT knowledge_chunks_pkey PRIMARY KEY (id),
    CONSTRAINT knowledge_chunks_workspace_id_key UNIQUE (workspace_id, id),
    -- Re-segmentation bumps `generation`; the old generation stays queryable
    -- until the new one is promoted, so ordinal alone cannot be unique.
    CONSTRAINT knowledge_chunks_document_generation_ord_key UNIQUE (document_id, generation, ord),
    CONSTRAINT knowledge_chunks_document_fkey FOREIGN KEY (workspace_id, document_id)
        REFERENCES public.knowledge_documents(workspace_id, id)
        ON UPDATE NO ACTION ON DELETE CASCADE NOT DEFERRABLE
);

CREATE INDEX knowledge_chunks_document_idx
    ON public.knowledge_chunks(document_id, generation, ord);
CREATE INDEX knowledge_chunks_workspace_acl_idx
    ON public.knowledge_chunks USING gin (acl_tags);

-- The embedding column is added only where pgvector exists, and never as a
-- required part of this migration. A later migration can attach it to a
-- database that installs pgvector afterwards.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    EXECUTE 'ALTER TABLE public.knowledge_chunks ADD COLUMN IF NOT EXISTS embedding vector(1536)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx ON public.knowledge_chunks USING hnsw (embedding vector_cosine_ops)';
  ELSE
    RAISE NOTICE 'pgvector absent: skipping knowledge_chunks.embedding';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgvector present but embedding column/index could not be created: %', SQLERRM;
END
$$;

-- ---------------------------------------------------------------------------
-- Distillation scheduling (002_paperclip_distillation.sql)
-- ---------------------------------------------------------------------------
CREATE TABLE public.knowledge_distillation_cursors (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL,
    space_id uuid NOT NULL,
    source_scope text NOT NULL,
    scope_key text NOT NULL,
    project_id uuid,
    root_issue_id uuid,
    source_kind text NOT NULL DEFAULT 'issue_history',
    last_processed_at timestamptz,
    last_observed_at timestamptz,
    pending_event_count integer NOT NULL DEFAULT 0,
    last_successful_run_id uuid,
    last_source_hash text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT knowledge_distillation_cursors_pkey PRIMARY KEY (id),
    CONSTRAINT knowledge_distillation_cursors_workspace_id_key UNIQUE (workspace_id, id),
    CONSTRAINT knowledge_distillation_cursors_scope_key UNIQUE (workspace_id, space_id, source_scope, scope_key, source_kind),
    CONSTRAINT knowledge_distillation_cursors_space_fkey FOREIGN KEY (workspace_id, space_id)
        REFERENCES public.knowledge_spaces(workspace_id, id)
        ON UPDATE NO ACTION ON DELETE CASCADE NOT DEFERRABLE,
    CONSTRAINT knowledge_distillation_cursors_project_fkey FOREIGN KEY (workspace_id, project_id)
        REFERENCES public.project(workspace_id, id)
        ON UPDATE NO ACTION ON DELETE CASCADE NOT DEFERRABLE,
    CONSTRAINT knowledge_distillation_cursors_issue_fkey FOREIGN KEY (workspace_id, root_issue_id)
        REFERENCES public.issue(workspace_id, id)
        ON UPDATE NO ACTION ON DELETE CASCADE NOT DEFERRABLE
);

CREATE TABLE public.knowledge_distillation_work_items (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL,
    space_id uuid NOT NULL,
    work_item_kind text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    priority text NOT NULL DEFAULT 'medium',
    project_id uuid,
    root_issue_id uuid,
    requested_by_issue_id uuid,
    idempotency_key text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT knowledge_distillation_work_items_pkey PRIMARY KEY (id),
    CONSTRAINT knowledge_distillation_work_items_workspace_id_key UNIQUE (workspace_id, id),
    CONSTRAINT knowledge_distillation_work_items_idempotency_key UNIQUE (workspace_id, space_id, idempotency_key),
    CONSTRAINT knowledge_distillation_work_items_space_fkey FOREIGN KEY (workspace_id, space_id)
        REFERENCES public.knowledge_spaces(workspace_id, id)
        ON UPDATE NO ACTION ON DELETE CASCADE NOT DEFERRABLE,
    CONSTRAINT knowledge_distillation_work_items_project_fkey FOREIGN KEY (workspace_id, project_id)
        REFERENCES public.project(workspace_id, id)
        ON UPDATE NO ACTION ON DELETE CASCADE NOT DEFERRABLE,
    CONSTRAINT knowledge_distillation_work_items_issue_fkey FOREIGN KEY (workspace_id, root_issue_id)
        REFERENCES public.issue(workspace_id, id)
        ON UPDATE NO ACTION ON DELETE CASCADE NOT DEFERRABLE,
    CONSTRAINT knowledge_distillation_work_items_requested_by_fkey FOREIGN KEY (workspace_id, requested_by_issue_id)
        REFERENCES public.issue(workspace_id, id)
        ON UPDATE NO ACTION ON DELETE SET NULL NOT DEFERRABLE
);

CREATE INDEX knowledge_distillation_work_items_pending_idx
    ON public.knowledge_distillation_work_items(workspace_id, status, priority, created_at);

CREATE TABLE public.knowledge_distillation_runs (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL,
    space_id uuid NOT NULL,
    cursor_id uuid,
    work_item_id uuid,
    project_id uuid,
    root_issue_id uuid,
    source_window_start timestamptz,
    source_window_end timestamptz,
    source_hash text,
    status text NOT NULL,
    operation_issue_id uuid,
    retry_count integer NOT NULL DEFAULT 0,
    cost_cents integer NOT NULL DEFAULT 0,
    warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT knowledge_distillation_runs_pkey PRIMARY KEY (id),
    CONSTRAINT knowledge_distillation_runs_workspace_id_key UNIQUE (workspace_id, id),
    CONSTRAINT knowledge_distillation_runs_cursor_fkey FOREIGN KEY (workspace_id, cursor_id)
        REFERENCES public.knowledge_distillation_cursors(workspace_id, id)
        ON UPDATE NO ACTION ON DELETE SET NULL NOT DEFERRABLE,
    CONSTRAINT knowledge_distillation_runs_work_item_fkey FOREIGN KEY (workspace_id, work_item_id)
        REFERENCES public.knowledge_distillation_work_items(workspace_id, id)
        ON UPDATE NO ACTION ON DELETE SET NULL NOT DEFERRABLE,
    CONSTRAINT knowledge_distillation_runs_space_fkey FOREIGN KEY (workspace_id, space_id)
        REFERENCES public.knowledge_spaces(workspace_id, id)
        ON UPDATE NO ACTION ON DELETE CASCADE NOT DEFERRABLE,
    CONSTRAINT knowledge_distillation_runs_project_fkey FOREIGN KEY (workspace_id, project_id)
        REFERENCES public.project(workspace_id, id)
        ON UPDATE NO ACTION ON DELETE SET NULL NOT DEFERRABLE,
    CONSTRAINT knowledge_distillation_runs_issue_fkey FOREIGN KEY (workspace_id, root_issue_id)
        REFERENCES public.issue(workspace_id, id)
        ON UPDATE NO ACTION ON DELETE SET NULL NOT DEFERRABLE,
    CONSTRAINT knowledge_distillation_runs_operation_issue_fkey FOREIGN KEY (workspace_id, operation_issue_id)
        REFERENCES public.issue(workspace_id, id)
        ON UPDATE NO ACTION ON DELETE SET NULL NOT DEFERRABLE
);

CREATE INDEX knowledge_distillation_runs_space_idx
    ON public.knowledge_distillation_runs(workspace_id, space_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Keyword search channel (fail-soft, mirroring 032 / 137 / 446)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS knowledge_items_title_trgm_idx
    ON public.knowledge_items USING gin (title gin_trgm_ops);
  CREATE INDEX IF NOT EXISTS knowledge_chunks_content_trgm_idx
    ON public.knowledge_chunks USING gin (content gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'skipping trigram indexes (pg_trgm not installed)';
END
$$;

-- pg_bigm is the CJK-preferred channel; a database without it keeps the trigram
-- indexes above. Both are best-effort: the search query stays correct without
-- either, it only loses the index.
DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS knowledge_items_title_bigm_idx
    ON public.knowledge_items USING gin (title gin_bigm_ops);
  CREATE INDEX IF NOT EXISTS knowledge_chunks_content_bigm_idx
    ON public.knowledge_chunks USING gin (content gin_bigm_ops);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'skipping bigram indexes (pg_bigm not installed)';
END
$$;

COMMENT ON TABLE public.knowledge_instances IS
    'Knowledge container per (workspace_id, wiki_id); ported from Paperclip plugin-llm-wiki 001 (MIT).';
COMMENT ON TABLE public.knowledge_items IS
    'Canonical knowledge item; enum columns are owned by server/internal/knowledge/enums.go.';
COMMENT ON TABLE public.knowledge_page_backlinks IS
    'Derived link edges (target_page_id NULL = red link to an unwritten page).';
COMMENT ON TABLE public.knowledge_chunks IS
    'Segmented document text. Unique per (document_id, generation, ord); embedding appears only when pgvector is installed.';
