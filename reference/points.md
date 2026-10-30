# Points: what a worker saves for the run

When `/subnotes:run` starts a skill quietly, the skill doesn't talk to the
user: it saves points to pending.md (`save_points`), and the run raises
them when it picks the next task. Every worker saves them in this one
shape, so the run can merge them, rank them across skills,
and carry out a yes without knowing how the skill thinks.

Being started quietly changes only who speaks. It never changes what a
skill reads, notices or proposes: a quiet review finds every point it would
raise out loud, and a goal with no next step gets one.

## The bar

Every point the user sees is judged by it, so a point that misses it is
worse than none. Before saving one, check all four:

1. **In the user's words.** They could explain it to a friend. No names of
   tools, workers, files or steps inside Subnotes or the plugin: not
   "the checker", "the loop", "pending.md".
2. **The outcome, not the mechanism.** Say what will be different for the
   user when it's done, not how it gets done inside.
3. **Visibly moves the goal,** in the terms of the goal's own text (its
   What line, its number): the user would say "yes, that moves it".
4. **Not already happening:** not a task, not a saved point, not what the
   recent sessions were doing (the goal's notes, the latest learnings).

Two that clear it beat three with one that doesn't.

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

Nothing to save is a fine result: save nothing.

The prune and the skill update run at the end of a session, beside the
wrap-up, and hand their points back in this same shape instead: there's
no pick left for them to wait for.
