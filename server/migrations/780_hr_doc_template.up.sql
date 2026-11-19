-- HR document templates (docs/engineering/WORKBENCH-API.md section 18).
--
-- The customer confirmed that stamping stays offline: this system generates the
-- file, somebody prints it and stamps it by hand. So the product needs the one
-- thing it never had -- a body of text per document, with slots -- and needs it
-- per workspace, because the company name, the wording of an employment
-- certificate and the signature block are the workspace's own.
--
-- `body` is plain text with `{{placeholder}}` slots. It is TEXT, not a JSON
-- document model, on purpose: whoever edits such a template edits prose, and a
-- structured model would force them to build the sentence out of fields. The
-- renderer (`server/pkg/docgen`) replaces `{{key}}` with a value and leaves an
-- unknown slot in place, so a typo shows up in the generated file instead of
-- silently vanishing.
--
-- `builtin` marks the three templates the server seeds itself (employment
-- certificate, resignation certificate, labour-contract addendum). They are
-- materialised per workspace on the first read and are read-only: editing one
-- would be silently reverted by nothing, but deleting one would come back on the
-- next read, so PATCH and DELETE answer 400 and a client that wants a different
-- wording copies the body into its own row.
--
-- `owner_member_id` carries the write gate, like every other workbench ledger:
-- `owner`/`admin` write anything, a `member` only rows it owns. Reads are
-- member-wide.
--
-- No foreign key, no cascade, `archived_at` is the soft delete. Uniqueness is
-- `(workspace_id, lower(name)) WHERE archived_at IS NULL` -- its own concurrent
-- index, 781 -- so a name freed by a soft delete can be reused.
CREATE TABLE hr_doc_template (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    name TEXT NOT NULL,
    -- What the template is for. A closed enum because it is the list's filter and
    -- because a generated file is filed under its template's kind.
    kind TEXT NOT NULL
        CHECK (kind IN ('employment', 'resignation', 'contract', 'offer', 'other')),
    -- Plain text with `{{placeholder}}` slots; a newline separates paragraphs.
    body TEXT NOT NULL,
    -- Seeded by the server, read-only (see the header).
    builtin BOOLEAN NOT NULL DEFAULT false,
    owner_member_id UUID,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);

COMMENT ON TABLE hr_doc_template IS
    'HR document templates, WORKBENCH-API section 18. body is plain text with {{placeholder}} slots; builtin rows are seeded per workspace and read-only. No foreign key; archived_at is the soft delete.';
COMMENT ON COLUMN hr_doc_template.body IS
    'Plain text with {{placeholder}} slots. Unknown slots are rendered verbatim by the generator, never silently blanked.';
