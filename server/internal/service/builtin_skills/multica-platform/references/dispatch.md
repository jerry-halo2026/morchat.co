# Dispatch and collaboration

Your squad instructions say which shape the squad runs in. What follows is what
each shape changes about dispatch, the paths that start work, and what each one
costs.

## Read your squad instructions first

They usually declare the shape outright. Do not infer a different one from the
roster: a squad whose instructions say pipeline is not a hub-and-spoke squad
because two members happen to have overlapping skills.

## The four shapes

| Shape | How work moves | Your job as dispatcher |
|---|---|---|
| pipeline | Sequential relay — A finishes, then B starts | Hand off with what the next link needs; do not start B before A's output exists |
| hub-and-spoke | Members work independently and report back to you | Split by deliverable, and keep the pieces disjoint so two runs never edit the same thing |
| collaborative | Peers work one problem together at the same level | Name who owns which decision; disagreement you cannot settle comes to you |
| on-demand | Members are summoned only when needed | Say why this member is needed now; everyone else stays untouched |

## The paths that start work, and what each costs

| Path | What happens |
|---|---|
| `mention://agent/<agent-id>` | Enqueues one run for that agent immediately |
| `mention://squad/<squad-id>` | Wakes the squad's leader only; members are not fanned out |
| a child issue with `--status todo` | Triggers the assignee at create time — the assignment is the trigger |
| a child issue with `--status backlog` | Sets the assignee and runs nothing until someone promotes it |
| `comment add --steer <run-id>` | Starts no run; binds the comment into a turn already in flight |

The steer path is the cheap one when the agent is mid-task: no new run, no
second workdir, the correction lands in the turn it applies to. It works only
when that run accepts supplements — `can_supplement: true` in
`multica issue runs <issue-id> --active --output json`. Otherwise wait for the
run to end and comment normally.

## Two ways the same work runs twice

- **A `todo` child issue plus a mention of the same agent for the same work.**
  Both are triggers, so the agent runs twice in parallel on one job. Pick one
  path per piece of work.
- **Plain text `@name`.** No link, no parse, no trigger — and the silence reads
  like a slow agent rather than a dispatch that never happened. Every dispatch
  needs the `mention://` link; the roster renders the exact one to paste.

## Closing the loop

A member's final comment is the handback: it wakes the leader, so the member
does not need to mention anyone. The leader reads it, dispatches the next step
or wraps up, and moves the parent to `in_review`. `done` is set by a human or
an integrating webhook, not by the run that did the work.

## When a piece stalls

Do not retry a failing path repeatedly. In one comment: what is blocked, who
owns unblocking it, and the action they need to take. A named owner gets it
moving; a third identical retry only adds noise to the thread.
