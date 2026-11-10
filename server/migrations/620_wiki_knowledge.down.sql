-- 620 (down): remove the knowledge domain added by 620_wiki_knowledge.up.sql.
--
-- Only the objects this migration created are dropped. The optional extensions
-- (pgcrypto / pg_trgm / pg_bigm / vector) stay installed: other migrations
-- (032 .. 446, and any future vector column) may depend on them, and dropping
-- an extension is not this migration's rollback to take.
--
-- The embedding column and its index are removed with the table they live on,
-- so a database that never had pgvector rolls back through the same statements.

DROP TABLE IF EXISTS public.knowledge_distillation_runs;
DROP TABLE IF EXISTS public.knowledge_distillation_work_items;
DROP TABLE IF EXISTS public.knowledge_distillation_cursors;

DROP TABLE IF EXISTS public.knowledge_chunks;
DROP TABLE IF EXISTS public.knowledge_documents;

DROP TABLE IF EXISTS public.knowledge_page_backlinks;
DROP TABLE IF EXISTS public.knowledge_page_revisions;
DROP TABLE IF EXISTS public.knowledge_sources;

-- knowledge_items is dropped before the tables it points at. 621 gives it a
-- foreign key to knowledge_pages (page_id) and to knowledge_spaces (space_id),
-- so dropping a referenced table first is refused with "cannot drop table
-- ... because other objects depend on it". Dropping the referencing table first
-- removes those dependencies; the earlier order happened to work only because
-- no knowledge_* table pointed at knowledge_items' siblings.
DROP TABLE IF EXISTS public.knowledge_items;

DROP TABLE IF EXISTS public.knowledge_pages;

DROP TABLE IF EXISTS public.knowledge_spaces;
DROP TABLE IF EXISTS public.knowledge_instances;
