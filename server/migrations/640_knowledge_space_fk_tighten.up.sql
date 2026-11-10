-- 640: the two wiki child tables stop being able to name a space their page does
-- not belong to.
--
-- 637 gave knowledge_page_revisions and knowledge_page_backlinks their own
-- space_id, but bound the page on (workspace_id, page_id) only. A row could
-- therefore carry space A and a page of space B inside one workspace: the
-- foreign key was satisfied, while every reader that trusts space_id (the space
-- listing, the ACL filter, the backlink panel) disagreed with the page tree.
-- 638 removed the same drift from knowledge_items' page binding; this file
-- removes it from the two tables that still have it.
--
-- knowledge_documents and knowledge_chunks keep their workspace-only foreign
-- keys deliberately: they carry no space_id of their own, they inherit the
-- space of their item / document, so there is no second field to disagree with.
--
-- Shape: replace
--   (workspace_id, page_id)          -> knowledge_pages(workspace_id, id)
-- with
--   (workspace_id, space_id, page_id) -> knowledge_pages(workspace_id, space_id, id)
-- on all three edges (revisions.page_id, backlinks.source_page_id,
-- backlinks.target_page_id). The old and the new key must not coexist: two
-- foreign keys over the same column pair make the delete path run two different
-- checks and make a future rollback ambiguous, so each old key is dropped in the
-- same transaction that creates its replacement, under the same name.
--
-- Existing rows are checked, never repaired. A database that already contains a
-- drifted row aborts the migration and reports the counts, so the operator
-- decides what the space should be instead of this file guessing.
--
-- Rollback (640_knowledge_space_fk_tighten.down.sql) is the inverse: drop the
-- three composite keys and restore the workspace-only ones.

-- ---------------------------------------------------------------------------
-- 1. The foreign-key target this migration needs.
-- ---------------------------------------------------------------------------
-- knowledge_pages(workspace_id, space_id, id) is what makes "same workspace *and*
-- same space" expressible. 638 added it as
-- knowledge_pages_workspace_space_id_621_key; this block covers a database where
-- 638's constraint is absent, and is a no-op everywhere else.
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
      ADD CONSTRAINT knowledge_pages_workspace_space_id_623_key
      UNIQUE (workspace_id, space_id, id);
    RAISE NOTICE 'migration report: added knowledge_pages(workspace_id, space_id, id) unique constraint required by the 640 space foreign keys';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Coherence precheck of the rows already stored.
-- ---------------------------------------------------------------------------
-- Runs before the swap, so a database that cannot accept the new keys fails
-- here with a count instead of failing on the ALTER with PostgreSQL's generic
-- "violates foreign key constraint" on the first offending row. Every child
-- column checked below is either NOT NULL or matched only when non-NULL, which
-- is exactly how the composite keys behave (MATCH SIMPLE): a revision with no
-- page, and a backlink with no resolved target, have nothing to disagree with.
DO $$
DECLARE
  v_revisions bigint;
  v_backlink_sources bigint;
  v_backlink_targets bigint;
BEGIN
  SELECT count(*) INTO v_revisions
  FROM public.knowledge_page_revisions r
  JOIN public.knowledge_pages p
    ON p.workspace_id = r.workspace_id
   AND p.id = r.page_id
  WHERE p.space_id IS DISTINCT FROM r.space_id;

  SELECT count(*) INTO v_backlink_sources
  FROM public.knowledge_page_backlinks b
  JOIN public.knowledge_pages p
    ON p.workspace_id = b.workspace_id
   AND p.id = b.source_page_id
  WHERE p.space_id IS DISTINCT FROM b.space_id;

  SELECT count(*) INTO v_backlink_targets
  FROM public.knowledge_page_backlinks b
  JOIN public.knowledge_pages p
    ON p.workspace_id = b.workspace_id
   AND p.id = b.target_page_id
  WHERE p.space_id IS DISTINCT FROM b.space_id;

  IF v_revisions > 0 OR v_backlink_sources > 0 OR v_backlink_targets > 0 THEN
    RAISE EXCEPTION
      'migration 640: % knowledge_page_revisions row(s), % knowledge_page_backlinks source edge(s) and % knowledge_page_backlinks target edge(s) name a space that is not the space of their page',
      v_revisions, v_backlink_sources, v_backlink_targets
      USING ERRCODE = 'integrity_constraint_violation',
            HINT = 'Set space_id on those rows to the space of their page (or drop them) and re-run migration 640; this migration deliberately does not rewrite data.';
  END IF;

  RAISE NOTICE 'migration report: 640 coherence precheck found 0 rows whose space_id differs from their page space';
END
$$;

-- ---------------------------------------------------------------------------
-- 3. knowledge_page_revisions.page_id: workspace + space + page.
-- ---------------------------------------------------------------------------
-- page_id stays nullable (a revision may describe a delete of a path no row
-- answers for); MATCH SIMPLE therefore skips the check for those rows, and
-- ON DELETE CASCADE keeps 637's behaviour for the rest: dropping a page drops
-- its revisions.
ALTER TABLE public.knowledge_page_revisions
    DROP CONSTRAINT IF EXISTS knowledge_page_revisions_page_fkey;

ALTER TABLE public.knowledge_page_revisions
    ADD CONSTRAINT knowledge_page_revisions_page_fkey
        FOREIGN KEY (workspace_id, space_id, page_id)
        REFERENCES public.knowledge_pages (workspace_id, space_id, id)
        ON UPDATE NO ACTION ON DELETE CASCADE NOT DEFERRABLE;

-- ---------------------------------------------------------------------------
-- 4. knowledge_page_backlinks: both edges, workspace + space + page.
-- ---------------------------------------------------------------------------
-- source_page_id is NOT NULL, so every backlink is checked; target_page_id stays
-- nullable for a "red link" (a link to a page that does not exist yet) and
-- cascades with the page it resolves to, as in 637.
ALTER TABLE public.knowledge_page_backlinks
    DROP CONSTRAINT IF EXISTS knowledge_page_backlinks_source_fkey,
    DROP CONSTRAINT IF EXISTS knowledge_page_backlinks_target_fkey;

ALTER TABLE public.knowledge_page_backlinks
    ADD CONSTRAINT knowledge_page_backlinks_source_fkey
        FOREIGN KEY (workspace_id, space_id, source_page_id)
        REFERENCES public.knowledge_pages (workspace_id, space_id, id)
        ON UPDATE NO ACTION ON DELETE CASCADE NOT DEFERRABLE,
    ADD CONSTRAINT knowledge_page_backlinks_target_fkey
        FOREIGN KEY (workspace_id, space_id, target_page_id)
        REFERENCES public.knowledge_pages (workspace_id, space_id, id)
        ON UPDATE NO ACTION ON DELETE CASCADE NOT DEFERRABLE;

-- No index is added here: the delete path of each new key is already served by
-- an index whose leading columns are the referencing columns —
-- knowledge_page_revisions_page_idx (page_id), and for backlinks
-- knowledge_page_backlinks_edge_key (workspace_id, space_id, source_page_id,
-- target_path) and knowledge_page_backlinks_target_page_idx
-- (workspace_id, target_page_id).
