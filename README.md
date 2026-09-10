# Subnotes plugin for Claude Code

Read your [Subnotes](https://subnotes.app) notebooks from Claude Code, and add
tasks to them — so "let's put that on the backlog" lands in the notebook instead
of dying with the conversation.

**Status: in development.** Requires Subnotes 1.4 (unreleased). See
`CLAUDE_CODE_PLUGIN_SPEC.md` in the app repo for the design and the reasoning.

## What it does

- `list_notebooks` — names, purposes, section headings, open counts
- `read_notebook` — one notebook as plain text
- `add_task` / `add_tasks` — append tasks to a notebook

## Two rules that shape everything

**Writes are append-only.** Tasks can be added; nothing can be edited, deleted,
completed, reordered or renamed, and notebooks cannot be created. A write that
only ever adds cannot lose work.

**Reads are opt-in per notebook.** Only notebooks connected in Subnotes are
exported to the connector folder at all. An unconnected notebook is never
written to disk there, so this plugin cannot read it even if it misbehaves.

The server never touches the app's database. It reads text files the app
exports and writes JSON files the app picks up.

## Development

Before the app can produce a connector folder, build one from a Subnotes backup:

```
node dev/make-fixture.mjs --connect "Work,Personal"
```

It writes to the real container path, so anything surprising about reaching it
from a terminal shows up before the app work, not after.

```
node dev/smoke.mjs        # exercises all four tools over stdio
```
