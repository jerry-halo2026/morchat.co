-- 621 (down): remove the space ownership 621 added to knowledge_items.
--
-- Order matters: the foreign keys first (they depend on the columns), then the
-- indexes (they depend on the columns too, and are dropped before the columns so
-- a database left with an orphan index cannot exist), then the columns, and
-- last the unique constraint 621 may have added when the foreign-key targets
-- were missing. Every object that 620 owns is left alone: this rollback removes
-- only what 621 created, so re-running 620's down still works afterwards.

ALTER TABLE public.knowledge_items
    DROP CONSTRAINT IF EXISTS knowledge_items_page_fkey;

ALTER TABLE public.knowledge_items
    DROP CONSTRAINT IF EXISTS knowledge_items_space_fkey;

DROP INDEX IF EXISTS public.knowledge_items_page_idx;
DROP INDEX IF EXISTS public.knowledge_items_space_idx;

ALTER TABLE public.knowledge_items
    DROP COLUMN IF EXISTS page_id;

ALTER TABLE public.knowledge_items
    DROP COLUMN IF EXISTS space_id;

-- Present only on a database that lacked the target constraint (see the 1st DO
-- block of the up file); on a 620-era database this is a no-op.
ALTER TABLE public.knowledge_pages
    DROP CONSTRAINT IF EXISTS knowledge_pages_workspace_space_id_621_key;

ALTER TABLE public.knowledge_spaces
    DROP CONSTRAINT IF EXISTS knowledge_spaces_workspace_id_621_key;
