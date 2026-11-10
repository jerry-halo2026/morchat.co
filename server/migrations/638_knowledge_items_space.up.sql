-- 638: knowledge_items becomes space-scoped.
--
-- 637 ported the Paperclip wiki schema with two coexisting models: the
-- user/API-facing entry (`knowledge_items`) and the wiki document tree
-- (`knowledge_pages` / `knowledge_sources`). 637 hung space ownership on the
-- wiki side only, so an item had no space of its own and the two models could
-- not be related — the field drift this migration removes.
--
-- Agreed model (KNOWLEDGE-INTEGRATION-PLAN):
--   * `knowledge_items` is the entry users and the API address; it must name
--     the space it lives in, exactly once, and that space must be a space of the
--     item's own workspace;
--   * `knowledge_pages` stays the wiki tree; an item may be distilled from one
--     page, which is a nullable binding, never a second space owner.
--
-- Coherence is expressed as composite foreign keys, matching 637's rule for
-- knowledge_sources / knowledge_pages / knowledge_page_revisions: a
-- cross-workspace (or cross-space) binding must be *unrepresentable*, not merely
-- rejected by the Go layer, so a future writer cannot reintroduce the drift.
--
-- Rollback is in 638_knowledge_items_space.down.sql: constraints and indexes
-- first, then the columns, then the unique constraint this file added when the
-- database lacked it.

-- ---------------------------------------------------------------------------
-- 1. The foreign-key targets this migration needs.
-- ---------------------------------------------------------------------------
-- knowledge_spaces(workspace_id, id): present since 637 as
-- knowledge_spaces_workspace_id_key. Added here only for a database where that
-- constraint is missing, so the composite FKs below can still be created.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'public.knowledge_spaces'::regclass
      AND c.contype IN ('p', 'u')
      AND (
        SELECT array_agg(a.attname ORDER BY k.ord)
        FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
      ) = ARRAY['workspace_id', 'id']::name[]
  ) THEN
    ALTER TABLE public.knowledge_spaces
      ADD CONSTRAINT knowledge_spaces_workspace_id_621_key UNIQUE (workspace_id, id);
    RAISE NOTICE 'migration report: added knowledge_spaces(workspace_id, id) unique constraint required by the knowledge_items space foreign key';
  END IF;
END
$$;

-- knowledge_pages(workspace_id, space_id, id): the item → page binding is only
-- coherent when the page lives in the same workspace *and* the same space as
-- the item, which needs this target. knowledge_pages_pkey alone cannot express
-- that, and 637's (workspace_id, space_id, path) key is a different column set.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'public.knowledge_pages'::regclass
      AND c.contype IN ('p', 'u')
      AND (
        SELECT array_agg(a.attname ORDER BY k.ord)
        FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
      ) = ARRAY['workspace_id', 'space_id', 'id']::name[]
  ) THEN
    ALTER TABLE public.knowledge_pages
      ADD CONSTRAINT knowledge_pages_workspace_space_id_621_key
      UNIQUE (workspace_id, space_id, id);
    RAISE NOTICE 'migration report: added knowledge_pages(workspace_id, space_id, id) unique constraint required by the knowledge_items page foreign key';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. The columns.
-- ---------------------------------------------------------------------------
-- Added nullable first so existing rows survive the NOT NULL below; on a
-- database that only ever ran 637 the table is empty and both steps are no-ops.
ALTER TABLE public.knowledge_items
    ADD COLUMN space_id uuid,
    ADD COLUMN page_id uuid;

-- Items created through 637's API have no space to inherit. Bind those orphans
-- to a default space of their own workspace, the same shape 003_spaces.sql
-- seeds, so the NOT NULL can be established without dropping user data.
-- Runs only where orphan rows exist; a fresh install raises nothing.
DO $$
DECLARE
  r record;
  v_space_id uuid;
  v_workspaces integer := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT workspace_id
    FROM public.knowledge_items
    WHERE space_id IS NULL
  LOOP
    INSERT INTO public.knowledge_instances (workspace_id, wiki_id)
    VALUES (r.workspace_id, 'default')
    ON CONFLICT (workspace_id, wiki_id) DO NOTHING;

    SELECT id INTO v_space_id
    FROM public.knowledge_spaces
    WHERE workspace_id = r.workspace_id AND wiki_id = 'default'
    ORDER BY created_at, id
    LIMIT 1;

    IF v_space_id IS NULL THEN
      INSERT INTO public.knowledge_spaces (workspace_id, wiki_id, slug, display_name)
      VALUES (r.workspace_id, 'default', 'default', 'Default')
      RETURNING id INTO v_space_id;
    END IF;

    UPDATE public.knowledge_items
    SET space_id = v_space_id, updated_at = now()
    WHERE workspace_id = r.workspace_id AND space_id IS NULL;

    v_workspaces := v_workspaces + 1;
  END LOOP;

  IF v_workspaces > 0 THEN
    RAISE NOTICE 'migration report: bound items in % workspace(s) to a default knowledge space', v_workspaces;
  END IF;
END
$$;

ALTER TABLE public.knowledge_items
    ALTER COLUMN space_id SET NOT NULL;

COMMENT ON COLUMN public.knowledge_items.space_id IS
    'Space the item belongs to; (workspace_id, space_id) must reference knowledge_spaces, so a cross-workspace space is unrepresentable.';
COMMENT ON COLUMN public.knowledge_items.page_id IS
    'Optional link to the wiki page this item was distilled from (knowledge_pages); NULL for items with no page.';

-- ---------------------------------------------------------------------------
-- 3. Coherence constraints.
-- ---------------------------------------------------------------------------
-- space_id: mandatory, same workspace. Deleting the space deletes its items,
-- which is what every other knowledge_* table already does with its space FK.
ALTER TABLE public.knowledge_items
    ADD CONSTRAINT knowledge_items_space_fkey
        FOREIGN KEY (workspace_id, space_id)
        REFERENCES public.knowledge_spaces (workspace_id, id)
        ON UPDATE NO ACTION ON DELETE CASCADE NOT DEFERRABLE;

-- page_id: optional, same workspace and same space. ON DELETE SET NULL is
-- column-scoped (PostgreSQL 15+): without it the composite action would also
-- NULL workspace_id and violate its NOT NULL, so dropping a page must clear
-- page_id alone and leave the item in its space.
ALTER TABLE public.knowledge_items
    ADD CONSTRAINT knowledge_items_page_fkey
        FOREIGN KEY (workspace_id, space_id, page_id)
        REFERENCES public.knowledge_pages (workspace_id, space_id, id)
        ON UPDATE NO ACTION ON DELETE SET NULL (page_id) NOT DEFERRABLE;

-- ---------------------------------------------------------------------------
-- 4. Access paths.
-- ---------------------------------------------------------------------------
-- (workspace_id, space_id): "the items of one space", the listing the API
-- needs; it also backs the source side of knowledge_items_space_fkey.
CREATE INDEX knowledge_items_space_idx
    ON public.knowledge_items(workspace_id, space_id);

-- (page_id): "which items were distilled from this page", and the index the
-- ON DELETE SET NULL action scans.
CREATE INDEX knowledge_items_page_idx
    ON public.knowledge_items(page_id);
