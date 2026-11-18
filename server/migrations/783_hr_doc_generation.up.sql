-- HR document generation ledger (docs/engineering/WORKBENCH-API.md section 18).
--
-- The system generates a file and stops there: printing and stamping happen
-- offline. That makes this table the only answer to "which document was produced
-- for whom, from which template, when, and with what values" -- the file itself
-- lands in attachments, where it can be deleted, and the template can be edited
-- afterwards.
--
-- **Snapshots, not pointers.** `template_name` and `values` are copies taken at
-- generation time. A template renamed or reworded next month must not rewrite
-- what a document issued today says, and a `values` snapshot is what makes a
-- generated certificate auditable at all: the employee's title may have changed
-- since, but the file that was signed and stamped says what it said.
--
-- `template_id` is kept as a nullable soft pointer (the row it names can be
-- archived, and a workspace teardown clears both tables without a foreign key),
-- `attachment_id` likewise: the file is a normal attachment that can be deleted
-- from the file list, and this row records that it once existed rather than
-- pretending the document never happened.
--
-- `values` is JSONB because its keys are the template's placeholders -- an open
-- set that no column list could hold. It is written from the same map the
-- renderer used, so it is the input, not a re-derivation: an unknown placeholder
-- left verbatim in the file is also absent here, which is what a re-render needs
-- to reproduce the output.
--
-- No foreign key, no cascade. Reads order by `created_at DESC` (a document's
-- interest is "the latest one"), which is the index 784 builds.
CREATE TABLE hr_doc_generation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    -- Points at hr_employee_profile.id (684); soft pointer.
    employee_id UUID NOT NULL,
    -- The template used; soft pointer, NULL once the template row is gone.
    template_id UUID,
    -- Snapshot of the template's name at generation time.
    template_name TEXT NOT NULL,
    format TEXT NOT NULL CHECK (format IN ('docx', 'pdf')),
    -- The produced file, stored as an ordinary attachment; soft pointer.
    attachment_id UUID,
    -- The values the template was rendered with, keyed by placeholder name.
    values JSONB NOT NULL DEFAULT '{}'::jsonb,
    generated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE hr_doc_generation IS
    'HR document generation ledger, WORKBENCH-API section 18. template_name and values are snapshots taken at generation time; the file lives in attachments. Read ordered by created_at DESC.';
COMMENT ON COLUMN hr_doc_generation.values IS
    'The placeholder map the template was rendered with (input snapshot, not a re-derivation). Unknown placeholders were left verbatim in the file and are absent here.';
