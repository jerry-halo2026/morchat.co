-- Inverse of 641_knowledge_import.up.sql, in reverse order: the two search
-- columns and their index go, then the task table.
--
-- `embedding_model` is only dropped when 620 did not create it — which is always
-- true, 620 never did — but the guard keeps the rollback honest on a database
-- someone hand-added it to.
DROP INDEX IF EXISTS public.knowledge_chunks_content_tsv_idx;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'knowledge_chunks'
          AND column_name = 'content_tsv'
    ) THEN
        ALTER TABLE public.knowledge_chunks DROP COLUMN content_tsv;
        RAISE NOTICE 'migration report: dropped knowledge_chunks.content_tsv';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'knowledge_chunks'
          AND column_name = 'embedding_model'
    ) THEN
        ALTER TABLE public.knowledge_chunks DROP COLUMN embedding_model;
        RAISE NOTICE 'migration report: dropped knowledge_chunks.embedding_model';
    END IF;
END $$;

-- acl_tags is 620's column and stays: 641 only ever adds it to a database that
-- was missing it, and dropping it here would break 620's indexes on a database
-- whose 620 owns the column.

DROP INDEX IF EXISTS public.knowledge_import_tasks_unfinished_idx;
DROP INDEX IF EXISTS public.knowledge_import_tasks_workspace_created_idx;
DROP TABLE IF EXISTS public.knowledge_import_tasks;
