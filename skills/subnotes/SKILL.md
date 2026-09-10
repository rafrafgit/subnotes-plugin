---
name: subnotes
description: Read the user's Subnotes notebooks and add tasks to them. Use when they ask to add something to their notes, backlog, or to-do list, when they say to note something down or put it on a list, or when they ask what is on a notebook.
---

## Choosing a notebook

Call `list_notebooks` before writing unless the user named a notebook and a
section explicitly. It returns names, purposes, section headings and open task
counts — enough to place something without reading a whole notebook.

Only connected notebooks are visible. If the user names one that is not listed,
say it is not connected rather than writing somewhere else.

Never invent a section. `add_task` fails if the section does not exist; check
the headings from `list_notebooks` first, or leave `section` out to add at the
top of the notebook.

When several tasks come from one intent, use `add_tasks` once rather than
`add_task` repeatedly.

## Writing tasks

One task per line, in the user's own words where they gave them.

A task names a physical, visible action — something you could watch a person
do. "Email Sara the invoice", not "Invoices". If the user's phrasing already
does that, keep it exactly.

Detail belongs in `subnotes`, not in the task text. A task that needs a
sentence of context is a short task plus a subnote. File paths and links go in
a subnote too.

Priority is one of Today, Next, Soon, Someday, defaulting to Someday. Use Next
only when the user says it is next; do not infer urgency from tone.

Reply in the language the user is writing in.

## What this cannot do

Writes only ever add. There is no way to mark a task done, edit or delete a
line, reorganise a notebook, rename anything, or create a notebook. If asked,
say so plainly and offer to add a task instead.

Reading is limited to connected notebooks. Do not speculate about what an
unconnected notebook contains.
