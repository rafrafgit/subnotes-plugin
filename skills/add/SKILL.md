---
name: add
description: "Capture one or more tasks the user asked for into the right connected Subnotes notebook and section, and say exactly what was added. Not offered to the user as a command: they ask in their own words."
user-invocable: false
---

Add this to the user's Subnotes: $ARGUMENTS

If that is empty, take what to add from the conversation: what the user just
asked to capture. If it isn't clear what they meant, ask rather than guess.

Call `list_notebooks` first. If the argument names a notebook or a section, use
it — "… in Freelance", "… under Bugs" — matching case-insensitively against what
`list_notebooks` returned. Otherwise place it against the notebooks' purposes,
and if none of them fits, ask where it belongs rather than settling for the
least-bad one. Write it as a physical, visible action.

Then say exactly what was added, one line per task — the user does not see the
tool's own output, and the write cannot be taken back:

```
Tasks added:
 * Deploy the CD_sharedWithAI field to the CloudKit Production schema to Subnotes 1.4, plugin 1.0 in Subnotes.
```

Name the purpose you placed it against too, when you chose the notebook rather
than being told which one.

If the argument is several things, add them in one `add_tasks` call.
