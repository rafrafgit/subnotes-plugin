# Points: what a worker saves for the run

A worker started by `/subnotes:run` doesn't talk to the user: it saves
points to pending.md (`save_points`) in this one shape, so the run can
rank them across skills and carry out a yes without knowing how the
skill thinks. Working quietly changes only who speaks, never what a skill
notices or proposes. The prune and the skill update hand theirs back
instead, in the same shape, as they run when the session ends.

## The bar

A point that misses it is worse than none: two that clear it beat three
with one that doesn't.

1. **By name**: `noticed` opens with the task, project or goal it's
   about, as the notebook writes it.
2. **Value**: what the user gets, in their work or life, in their words;
   never your own reasons (ratings, what a skill lacks) or names of tools,
   files or steps inside Subnotes.
3. **Checked**: its facts (dates, names, numbers) match the notes.
4. **Made, not offered**: the pick is the thing itself, or as much as
   fits (a draft, the research, the message), never a promise or a rule.
5. **Enough context**: it fits this user, not anyone with the same goal
   (put a stranger with that goal in their place: if it fits them as
   well, it's shallow), and `rests` holds every fact it needs:
   - about the user and their people (what they like, want, have tried,
     who they know): only the notes and learnings count, never a guess;
   - about the world (who hires, what a tool does): look it up.

   A fact about the user that's missing turns the point into a `talk`
   whose pick asks the one or two questions that would fill it ("What do
   you and Meike like doing on a Saturday?"), with `rests: missing: …`.
   An open question that blocks the goal is raised the same way. The run
   writes the answer under the goal, so it isn't asked again.

## The shape

One block per point, most important first:

```
- kind: next-step
  goal: Earn 4k a month from freelance work
  about: review
  value: A second paying client in sight, so June's 4k stops resting on Acme alone.
  noticed: Clients: one so far against a pace of one a month, and nothing lined up; Sam's agency (Freelance › Contacts) hires freelancers.
  rests: one client so far (Freelance › Clients) · Sam works at an agency that hires freelancers (Freelance › Contacts) · two recent projects to show (Freelance › Portfolio)
  pick: The message, ready to send: "Hi Sam, would you introduce me to your agency's design lead? Happy to send two recent projects first." — **Ask Sam for an intro to her design agency** → Freelance › Clients [Next]
  options: Post the portfolio on LinkedIn first · Raise the day rate for new clients
  writes: add_task Freelance "Ask Sam for an intro to her design agency" section "Clients" priority Next
```

- **kind**:
  - `next-step`: what moves a goal that has none lined up
  - `decision`: something the user decides
  - `plan-check`: a goal's plan needs a look; the run holds that talk
  - `today`: a task in today's plan; `pick` says what Claude does ("I'll
    start on it now", the one question it needs, or "only you can do
    this", and why)
  - `prune`: changes to what Claude remembers, applied without asking
  - `change`: something done without asking; `writes` says how to undo it
  - `talk`: something to talk through first, with Claude's ideas; a
    question worth thinking through, from a tension or untested belief in
    the notes, its pick starting "To think through:" with Claude's view
    and a sketch; the
    questions that fill missing context; what's holding something that
    has sat for weeks, with a step worth doing either way; or a goal kept
    up (friends, family), raised as a friend would
- **goal**: the goal it serves, a notebook when none, or `none`.
- **about**: the skill handing it back; a correction is a lesson for it.
- **value**, **noticed**, **pick**: one plain line each, as the bar says;
  a task in the pick in bold, with where it goes.
- **rests**: the facts the pick rests on, each with where it is
  (notebook › section, a learning, the web), split by " · ". Required
  from a review.
- **options**: up to two others, split by " · "; left out when there's
  nothing real to choose.
- **writes**: exactly what a yes does, as tool calls with their values,
  carried out as given; `none` when a yes writes nothing.
