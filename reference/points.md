# Points: what a skill hands back to the run

When `/subnotes:run` starts a skill quietly, the skill doesn't talk to the
user: it hands back points, and the run says them. Every skill hands them
back in this one shape, so the run can merge them, rank them across skills,
and carry out a yes without knowing how the skill thinks.

Being started quietly changes only who speaks. It never changes what a
skill reads, notices or proposes: a quiet review finds every point it would
raise out loud, and a goal with no next step gets one.

## The shape

One block per point, most important first:

```
- kind: next-step
  goal: Earn 4k a month from freelance work
  about: review
  noticed: One client so far against a pace of one a month, and nothing lined up.
  pick: Ask Sam for an intro this week — **Ask Sam for an intro to her design agency** → Freelance › Clients [Next]
  options: Post the portfolio on LinkedIn first · Raise the day rate for new clients
  writes: add_task Freelance "Ask Sam for an intro to her design agency" section "Clients" priority Next
```

- **kind** — one of:
  - `next-step`: what moves a goal, when it has none lined up
  - `decision`: something the user decides
  - `plan-check`: a goal's plan needs a look; the run holds that talk
  - `ongoing`: a goal kept up (friends, family), raised as a friend would
  - `today`: a task in today's plan, with what Claude will do about it
  - `prune`: changes to what Claude remembers, applied on one yes
  - `change`: something done without asking, to say and offer to undo
  - `talk`: a problem or idea to talk through first, with Claude's ideas
- **goal** — the goal it serves, a notebook when no goal, or `none`.
- **about** — the skill handing it back. A correction of this point is a
  lesson about that skill.
- **noticed** — one plain line: what was found, in the user's terms.
- **pick** — one plain line: Claude's own answer (a draft, a date, a
  wording), never homework. A task in bold, with where it goes after it.
- **options** — up to two others, one line each; leave out when there's
  nothing real to choose.
- **writes** — exactly what a yes does, as the tool calls with their
  values; `none` when a yes writes nothing. The run carries these out as
  given.

A `today` point puts in `pick` what Claude does with the task: "I'll start
on it now", the one question it needs, or "only you can do this", and why.
A `change` point puts in `writes` how to undo it.

Nothing to hand back is a fine result: hand back nothing.
