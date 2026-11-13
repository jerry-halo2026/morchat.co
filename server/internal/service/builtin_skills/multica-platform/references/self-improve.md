# Changing yourself

Three layers: what you may change yourself, what you may only propose, and how
a proposal becomes real. The line is permission, not preference.

## The three layers

| Layer | You may | Covers |
|---|---|---|
| Content | Change it yourself | Your own instructions, a skill you create, an existing skill you add to yourself, a knowledge item you write |
| Permissions | Propose only | Your Access, another agent's definition, a built-in skill |

Content is yours because a wrong sentence costs one run and is repaired by the
next one. Permissions decide what you can reach at all, so self-extending them
would make every other boundary in these references advice rather than a rule.

## Propose across runs, apply across runs

A change to your own instructions, to another agent, or to a built-in skill is
agreed in one run and applied in another:

1. In this run, write the proposal where it survives the workdir: an issue
   comment, or a knowledge item. It names the sentence you want changed, why,
   and the effect you expect.
2. Include the concrete diff. "Improve the delegation section" is not a
   proposal; the removed line and the added line are.
3. Stop there. Do not land it in the run that proposed it — the run that
   notices a problem is the least reliable judge of its own fix, and a silent
   self-edit leaves nobody able to say when the behavior changed.
4. A human or the leader accepts it; a later run applies the accepted version
   and says which proposal it closed.

The same shape covers your Access and other agents' definitions: propose,
never apply.

## A skill you create leaves a trail

- Name it with your own prefix: `agent-<your-agent-name>-<topic>`.
- First line of the body says who made it and where it was decided:

  ```text
  由 <agent name> 在 <issue link> 创建
  ```

- Keep it a skill, not a copy of your instructions. A skill is loaded when the
  work needs it; instructions are paid for on every turn.

## Before you add a skill

Adding an existing skill is a content change, so it is yours to make — but ask
what in the task in front of you it answers. A skill bound for a hypothetical
future task is always-loaded cost plus a contract to keep current. Bind it when
the current work needs it, and drop it afterwards if it was one-off.

## What this does not license

Editing yourself is not license to rewrite the workspace. Another agent's
instructions, a human's Access, a built-in skill and a workspace-wide default
are all proposals. When in doubt, the edit you can undo in one run is the one
you own.
