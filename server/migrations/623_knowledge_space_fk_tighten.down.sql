-- 623 (down): widen the page foreign keys back to workspace-only.
--
-- Inverse of 623_knowledge_space_fk_tighten.up.sql, in reverse order: drop the
-- three composite keys, restore the (workspace_id, page_id) keys 620 created
-- under their original names, then drop the target unique constraint 623 may
-- have added (621 owns its own copy under a different name and is left alone).
--
-- Widening is always satisfiable: the composite keys are strictly stronger, so
-- every row a database could hold under them satisfies the restored ones. The
-- statements are individually guarded so a rollback replayed by hand converges
-- instead of failing on an object that is already gone (or already back).

ALTER TABLE public.knowledge_page_revisions
    DROP CONSTRAINT IF EXISTS knowledge_page_revisions_page_fkey;

ALTER TABLE public.knowledge_page_backlinks
    DROP CONSTRAINT IF EXISTS knowledge_page_backlinks_source_fkey,
    DROP CONSTRAINT IF EXISTS knowledge_page_backlinks_target_fkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'knowledge_page_revisions_page_fkey'
      AND conrelid = 'public.knowledge_page_revisions'::regclass
  ) THEN
    ALTER TABLE public.knowledge_page_revisions
        ADD CONSTRAINT knowledge_page_revisions_page_fkey
            FOREIGN KEY (workspace_id, page_id)
            REFERENCES public.knowledge_pages (workspace_id, id)
            ON UPDATE NO ACTION ON DELETE CASCADE NOT DEFERRABLE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'knowledge_page_backlinks_source_fkey'
      AND conrelid = 'public.knowledge_page_backlinks'::regclass
  ) THEN
    ALTER TABLE public.knowledge_page_backlinks
        ADD CONSTRAINT knowledge_page_backlinks_source_fkey
            FOREIGN KEY (workspace_id, source_page_id)
            REFERENCES public.knowledge_pages (workspace_id, id)
            ON UPDATE NO ACTION ON DELETE CASCADE NOT DEFERRABLE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'knowledge_page_backlinks_target_fkey'
      AND conrelid = 'public.knowledge_page_backlinks'::regclass
  ) THEN
    ALTER TABLE public.knowledge_page_backlinks
        ADD CONSTRAINT knowledge_page_backlinks_target_fkey
            FOREIGN KEY (workspace_id, target_page_id)
            REFERENCES public.knowledge_pages (workspace_id, id)
            ON UPDATE NO ACTION ON DELETE CASCADE NOT DEFERRABLE;
  END IF;
END
$$;

-- Present only on a database that lacked knowledge_pages(workspace_id, space_id,
-- id) when 623 ran; 621's knowledge_pages_workspace_space_id_621_key is a
-- different object and stays.
ALTER TABLE public.knowledge_pages
    DROP CONSTRAINT IF EXISTS knowledge_pages_workspace_space_id_623_key;
