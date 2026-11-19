-- Script (文案工坊) — one version of one topic's copy (§12).
--
-- A row is a *version*, not a document that gets overwritten. Rewriting the body
-- inserts a new row with `version + 1` and leaves the previous one readable: the
-- director asking "what did v1 say" during 复审 is the normal case, and an
-- in-place update would have destroyed the answer. `PATCH /scripts/{id}?inPlace=1`
-- is the escape hatch for edits that are corrections rather than versions
-- (a typo in the CTA), and it is explicit so the two behaviours cannot be
-- confused.
--
-- Version numbering is per topic and monotonic: v1, v2, … with no reuse, even
-- after an intermediate version is archived. The handler computes
-- `COALESCE(MAX(version), 0) + 1` inside the INSERT, so two concurrent rewrites
-- cannot both claim the same number; migration 739's partial unique index is the
-- backstop that turns the loser into a 409 instead of a silent duplicate.
--
-- `ip_id` is denormalised from the topic: nearly every content read is "this
-- IP's scripts", and walking topic → script for it would put a join in front of
-- every screen. It is written from the topic on insert and never edited
-- afterwards (moving a script to another IP means moving its topic, which is a
-- new topic).
--
-- `tags TEXT[]` is the hashtag/标签 line under the copy, ordered as written: the
-- order is part of what the operator composed, so it is an array, not a set.
--
-- `publish_at` is the *plan*: when this version is meant to go out. The fact
-- that it went out lives in `creator_post` — 733 adds `creator_post.media_script_id`,
-- the pointer from a published row back to the script it was shot from. A script
-- can be approved and never published, which is exactly what this column pair
-- lets the 排期 screen show.
--
-- `status` carries its own `archived` value on top of the soft-delete
-- `archived_at`: `archived` is an editor's decision ("this version is superseded
-- in the review flow"), `archived_at` is the row being deleted.
CREATE TABLE media_script (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    topic_id UUID NOT NULL,
    ip_id UUID,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    hook TEXT,
    body TEXT,
    cta TEXT,
    cover_note TEXT,
    tags TEXT[] NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved', 'archived')),
    publish_at TIMESTAMPTZ,
    owner_member_id UUID,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);
