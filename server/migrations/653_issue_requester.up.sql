-- Which human asked for this issue (MUL-3806). An agent-created issue records the
-- agent as its creator, so "created by me" has to read the person behind the
-- request; this column is that person. Nullable and without a foreign key
-- (repository rule): a deleted user is cleaned up in application code, and a NULL
-- simply means the requester was never resolved — older rows and any creator path
-- that is not agent-mediated.
ALTER TABLE issue ADD COLUMN requester_user_id UUID NULL;
