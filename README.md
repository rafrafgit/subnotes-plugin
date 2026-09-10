# Subnotes plugin for Claude Code

Read your [Subnotes](https://subnotes.app) notebooks from Claude Code, and add
tasks to them — so "let's put that on the backlog" lands in the notebook instead
of dying with the conversation.

**Requires Subnotes 1.4 or later, on macOS.** Connect a notebook by
right-clicking it in Subnotes and choosing **Connect to Claude Code**. Only the
notebooks you connect are visible here.

## What it does

- `list_notebooks` — names, purposes, section headings, open counts
- `read_notebook` — one notebook as plain text
- `add_task` / `add_tasks` — append tasks to a notebook

Ask what is on a notebook, or what to pick up next — reading is half the point.
Say "put that on the backlog" mid-conversation and it lands in the right
notebook and section, or use `/subnotes:add <thing>` to be explicit.

## Two rules that shape everything

**Writes are append-only.** Tasks can be added; nothing can be edited, deleted,
completed, reordered or renamed, and notebooks cannot be created. A write that
only ever adds cannot lose work.

**Reads are opt-in per notebook.** Only notebooks connected in Subnotes are
exported to the connector folder at all. An unconnected notebook is never
written to disk there, so this plugin cannot read it even if it misbehaves — it
is invisible rather than private-but-visible.

The server never touches the app's database. It reads text files the app
exports and writes JSON files the app picks up, inside the app's own container.
It has no dependencies: `node:fs`, `node:path`, `node:crypto` and
`node:readline` only, speaking JSON-RPC over stdio.

## Configuration

None, normally. The server defaults to the folder Subnotes exports to inside
its own app container. The optional `folder` setting is there only for an
unusual install location.

## Development

```
node dev/make-fixture.mjs --connect "Work,Personal"
```

Builds a connector folder from a Subnotes backup. This is a development
stand-in only — a running Subnotes 1.4 supersedes it, exporting connected
notebooks itself and deleting files for anything not connected.

```
node dev/smoke.mjs        # exercises all four tools over stdio
```
