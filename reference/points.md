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

1. **Where it comes from, by name**: the task, project or goal it's
   about, as the notebook writes it, opens `noticed`.
2. **Value**: what the user gets from it, in their work or life, in
   their words; never your own reasons (ratings, streaks, what a skill
   lacks), and no names of tools, files or steps inside Subnotes.
3. **An example from the notes**: what the user would see, with its
   facts (dates, times, names, numbers) checked against the notes.
4. **Made, not offered**: the pick is the thing itself, or as much of it
   as fits (a draft, the research, the message), not a promise to make
   it; never a rule or how sessions work.

Two that clear it beat three with one that doesn't.

## The shape

One block per point, most important first:

```
- kind: next-step
  goal: Earn 4k a month from freelance work
  about: review
  value: A second paying client in sight, so June's 4k stops resting on Acme alone.
  noticed: Clients: one so far against a pace of one a month, and nothing lined up; Sam's agency (Freelance › Contacts) hires freelancers.
  pick: The message, ready to send: "Hi Sam, would you introduce me to your agency's design lead? Happy to send two recent projects first." — **Ask Sam for an intro to her design agency** → Freelance › Clients [Next]
  options: Post the portfolio on LinkedIn first · Raise the day rate for new clients
  writes: add_task Freelance "Ask Sam for an intro to her design agency" section "Clients" priority Next
```

- **kind** — one of:
  - `next-step`: what moves a goal, when it has none lined up
  - `decision`: something the user decides
  - `plan-check`: a goal's plan needs a look; the run holds that talk
  - `today`: a task in today's plan, with what Claude will do about it
  - `prune`: changes to what Claude remembers, applied without asking
  - `change`: something done without asking, to say and offer to undo
  - `talk`: a problem or idea to talk through first, with Claude's ideas;
    or one or two questions about something coming up that the notes
    don't explain, so what Claude makes for it fits; or what's holding
    something that has sat for weeks, with a step worth doing either way;
    or a goal kept up (friends, family), raised as a friend would
- **goal** — the goal it serves, a notebook when no goal, or `none`.
- **about** — the skill handing it back. A correction of this point is a
  lesson about that skill.
- **value** — one plain line: what the user gets from it, in their work
  or life, never what Claude or a skill gets ("my suggestions get
  better" is not a value). The session shows it as "Value: …".
- **noticed** — one plain line: what was found, in the user's terms,
  opening with the name of the task, project or goal it's about, as the
  notebook writes it ("Fix reviewers to not give shallow suggestions has
  sat…"), so the user knows where it comes from.
- **pick** — one plain line: the thing itself, made (a draft, the
  research, a date, a wording), never homework or a promise to make it. A task in bold, with where it goes after it.
- **options** — up to two others, one line each; leave out when there's
  nothing real to choose.
- **writes** — exactly what a yes does, as the tool calls with their
  values; `none` when a yes writes nothing. The run carries these out as
  given.

A `today` point puts in `pick` what Claude does with the task: "I'll start
on it now", the one question it needs, or "only you can do this", and why.
A `change` point puts in `writes` how to undo it.

Nothing to save is a fine result only when the goal is reached, its
plan is done, or it's paused: then save nothing.

The prune and the skill update run at the end of a session, beside the
wrap-up, and hand their points back in this same shape instead: there's
no pick left for them to wait for.
