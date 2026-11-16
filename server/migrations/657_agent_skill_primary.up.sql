-- Which of an agent's skills is its role skill (the "主技能"). A skill can be
-- primary for at most one agent; the flag is advisory to ordering and badges,
-- not a permission.
ALTER TABLE agent_skill ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;
