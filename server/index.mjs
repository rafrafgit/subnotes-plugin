#!/usr/bin/env node
// MCP server for Subnotes. Reads notebook files and writes inbox files; it
// never touches SwiftData. The app owns every store access — a second process
// writing to a CloudKit-mirrored store is the failure mode this project has
// already spent five rounds on.
//
// No dependencies, deliberately. The whole surface is four tools over
// newline-delimited JSON-RPC on stdio, which is less code than the wiring to
// use an SDK, and it removes the install step entirely: no package-lock, no
// 60-second dependency fetch on first cache, nothing to go stale. Revisit if
// this ever needs sampling, resources or notifications.

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';

const PROTOCOL_VERSION = '2024-11-05';
const CONNECTOR_VERSION = 1;   // the contract number in manifest.json

// Read from plugin.json rather than declared here. A second constant beside
// CONNECTOR_VERSION would drift the first time one is bumped and the other is
// forgotten, and plugin.json is the field `claude plugin tag` validates
// against the marketplace entry, so it is the one guaranteed honest at release
// time. Resolved from this file's own location: ${CLAUDE_PLUGIN_ROOT} is
// substituted into the launch arguments, not exported into the environment.
//
// Unreadable is not fatal. This is diagnostic information the app uses to say
// "update the plugin" earlier than it otherwise could; failing a write over it
// would trade a real feature for a cosmetic one.
const PLUGIN_VERSION = (() => {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const manifestPath = join(here, '..', '.claude-plugin', 'plugin.json');
    return JSON.parse(readFileSync(manifestPath, 'utf8')).version ?? null;
  } catch {
    return null;
  }
})();
const PRIORITIES = ['Today', 'Next', 'Soon', 'Someday'];

// The connector folder lives at a fixed, known path inside the app's own
// container. It is not user-chosen, so the plugin does not ask: an install
// prompt demanding a constant is a step that can only be got wrong, and it
// used to deadlock first run — the folder does not exist until a notebook is
// connected, so there was nothing to copy the path from yet.
//
// The `folder` user config remains as an override for an unusual setup; an
// unset one arrives here as an empty string from ${user_config.folder}, not as
// undefined, which is why this tests for truthiness rather than existence.
const DEFAULT_DIR = join(homedir(), 'Library/Containers/com.subnotes.app/Data/Documents/Connector');
const DIR = process.env.SUBNOTES_DIR?.trim() || DEFAULT_DIR;

// Every message the user could see when something is wrong says which of the
// two halves to fix. A bare failure is the one outcome the manifest exists to
// prevent.
class UserError extends Error {}

function manifest() {
  const path = join(DIR, 'manifest.json');
  if (!existsSync(path)) throw new UserError(
    `No Subnotes connector folder at ${DIR}. Subnotes 1.4 or later is required, and at least one notebook must be connected — open Settings in Subnotes (⌘,) and turn one on.`);

  let m;
  try {
    m = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new UserError(`The Subnotes manifest could not be read (${e.message}). Reopening Subnotes will rewrite it.`);
  }

  if (m.connectorVersion > CONNECTOR_VERSION) throw new UserError(
    'This plugin is older than your Subnotes. Update the plugin.');
  if (m.connectorVersion < CONNECTOR_VERSION) throw new UserError(
    'Subnotes is older than this plugin expects. Update Subnotes.');
  return m;
}

// Rendered one per line rather than comma-joined. Headings routinely contain a
// comma ("Subnotes 1.4, plugin 1.0") and a double quote ('Mattias "feedback"'),
// so neither a comma nor quoting delimits them unambiguously — and a heading
// that reads as two costs a failed write whose error then lists the very name
// it called missing, which looks like a bug in this server. A heading is always
// one line, so a newline is the one delimiter the content cannot contain.
function onePerLine(items) {
  return items?.length ? items.map(s => `- ${s}`).join('\n') : '- (none)';
}

// Names are how the user refers to notebooks in conversation, so that is how
// they are addressed. An unknown or ambiguous name lists what is connected
// rather than guessing — writing to the wrong notebook is worse than failing.
function findNotebook(m, name) {
  const wanted = String(name ?? '').trim().toLowerCase();
  const hits = m.notebooks.filter(n => n.name.toLowerCase() === wanted);
  if (hits.length === 1) return hits[0];
  const listed = onePerLine(m.notebooks.map(n => n.name));
  if (hits.length === 0) throw new UserError(
    `No connected notebook called "${name}". A notebook the user has not ` +
    `connected in Subnotes is not visible here. Connected notebooks:\n${listed}`);
  throw new UserError(`"${name}" matches more than one connected notebook. Connected:\n${listed}`);
}

// MARK: - Tools

function listNotebooks() {
  const m = manifest();
  if (!m.notebooks.length) return "No notebooks are connected. The user turns them on in Subnotes' Settings (⌘,), which lists every notebook with a switch.";
  return m.notebooks.map(n => {
    const lines = [`## ${n.name}`];
    if (n.purpose) lines.push(`Purpose: ${n.purpose}`);
    lines.push(`Open tasks: ${n.openTasks ?? 'unknown'}`);
    lines.push(n.sections?.length ? `Sections:\n${sectionOutline(n)}` : 'Sections: (none)');
    return lines.join('\n');
  }).join('\n\n');
}

// Headings come in two levels, and every level is a section a task can be
// added to. A Heading 3 is indented under the Heading 2 above it so the list
// reads like the notebook does; one with no Heading 2 above it stays flush.
// An app older than the two-level headings sends no `headings`, and its flat
// `sections` list is shown as it always was.
function sectionOutline(n) {
  if (!n.headings?.length) return onePerLine(n.sections);
  let underHeading2 = false;
  return n.headings.map(h => {
    if (h.level === 2) underHeading2 = true;
    return `${h.level === 3 && underHeading2 ? '  ' : ''}- ${h.name}`;
  }).join('\n');
}

function readNotebook({ name }) {
  const m = manifest();
  const nb = findNotebook(m, name);
  return readFileSync(join(DIR, nb.file), 'utf8');
}

// The export format's task lines are "• text", with a priority tag trailing and
// subnotes indented beneath. Read from the notebook file because the manifest
// carries section names and counts but never task text — which is exactly why a
// duplicate could not be seen before a write, and how one got appended above a
// copy of itself that was already marked Done.
//
// Keyed on lowercased text; first occurrence wins, matching how the app resolves
// a repeated heading. An absent tag means Someday, which is the one priority the
// export leaves implicit.
const TASK_LINE = /^\s*•\s*(.+?)\s*$/;
const PRIORITY_TAG = new RegExp(`\\s*\\[(${[...PRIORITIES, 'Done'].join('|')})\\]\\s*$`, 'i');

function existingTasks(nb) {
  let text;
  // A safety net, never a gate: an unreadable notebook file must not fail a
  // write that is otherwise valid. Same trade as PLUGIN_VERSION above.
  try {
    text = readFileSync(join(DIR, nb.file), 'utf8');
  } catch {
    return null;
  }
  const found = new Map();
  let section = null;
  for (const line of text.split('\n')) {
    const heading = /^#{2,3}\s+(.*)$/.exec(line);
    if (heading) {
      section = heading[1].trim();
      continue;
    }
    const task = TASK_LINE.exec(line);
    if (!task) continue;
    const tag = PRIORITY_TAG.exec(task[1]);
    const body = (tag ? task[1].slice(0, tag.index) : task[1]).trim();
    if (!body) continue;
    const key = body.toLowerCase();
    if (!found.has(key)) found.set(key, { text: body, priority: tag ? tag[1] : 'Someday', section });
  }
  return found;
}

function validateTask(t, nb) {
  const text = String(t.text ?? '').trim();
  if (!text) throw new UserError('A task needs text.');
  if (text.includes('\n')) throw new UserError(
    `A task is one line. Put the detail in subnotes instead: "${text.split('\n')[0]}"`);

  const priority = t.priority ?? 'Someday';
  if (!PRIORITIES.includes(priority)) throw new UserError(
    `Priority must be one of ${PRIORITIES.join(', ')} — got "${priority}".`);

  // A typo must not silently invent a heading. The app would have to create it,
  // and "Backlogg" appearing in the user's notebook is worse than an error.
  const section = t.section ? String(t.section).trim() : null;
  if (section && !(nb.sections ?? []).some(s => s.toLowerCase() === section.toLowerCase())) {
    throw new UserError(
      `"${nb.name}" has no section called "${section}". Sections are not created ` +
      `here — leave section out to add at the top of the notebook. Its sections:\n` +
      onePerLine(nb.sections ?? []));
  }
  // Match the manifest's own capitalisation, so the app matches the heading it
  // actually has rather than the one Claude typed.
  const canonical = section ? (nb.sections ?? []).find(s => s.toLowerCase() === section.toLowerCase()) : null;

  const subnotes = (t.subnotes ?? []).map(s => String(s).trim()).filter(Boolean);
  return { text, priority, ...(canonical ? { section: canonical } : {}), ...(subnotes.length ? { subnotes } : {}) };
}

function addTasks({ notebook, tasks, allowDuplicate = false }) {
  const m = manifest();
  const nb = findNotebook(m, notebook);
  if (!Array.isArray(tasks) || !tasks.length) throw new UserError('No tasks given.');
  const validated = tasks.map(t => validateTask(t, nb));

  // Refused rather than warned, for the same reason an invented section is
  // refused: a write cannot be edited or removed from here, so appending a
  // second identical line costs the user a manual delete while a refusal costs
  // one turn. Skipped entirely when the user has said to add it anyway —
  // genuinely repeated tasks exist, and this is not the place to argue.
  if (!allowDuplicate) {
    const existing = existingTasks(nb);
    const inThisWrite = new Set();
    for (const t of validated) {
      const key = t.text.toLowerCase();
      const dup = existing?.get(key);
      if (dup) throw new UserError(
        `"${nb.name}" already has this task: "${dup.text}"` +
        `${dup.section ? ` under "${dup.section}"` : ''}, priority ${dup.priority}. ` +
        `Writes only add, so this would leave two identical lines and neither can be ` +
        `edited or removed from here. Check with the user, then pass allowDuplicate: true ` +
        `if they want it added again.`);
      if (inThisWrite.has(key)) throw new UserError(
        `This write adds "${t.text}" twice. Send it once, or pass allowDuplicate: true if ` +
        `the user really wants two identical lines.`);
      inThisWrite.add(key);
    }
  }

  // `id` makes the write idempotent: the app records applied ids, so a retry
  // after a timeout cannot double-add.
  // pluginVersion is additive and one-sided: Swift's synthesized Codable
  // ignores unknown keys, so an app that predates this field accepts a write
  // carrying it and simply does not look. That is what lets this ship without
  // a connectorVersion bump or an app release — see "What requires which
  // bump" in the spec. Omitted entirely when unknown, rather than sent as a
  // guess.
  const payload = {
    connectorVersion: CONNECTOR_VERSION,
    ...(PLUGIN_VERSION ? { pluginVersion: PLUGIN_VERSION } : {}),
    id: randomUUID().slice(0, 8),
    op: 'add_tasks',
    notebook: nb.name,
    tasks: validated,
  };

  const inbox = join(DIR, 'inbox');
  mkdirSync(inbox, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = join(inbox, `${stamp}-${payload.id}.json`);
  // Temp file then rename, so the app's watcher can never read a half-written
  // file. The rename is atomic within the same filesystem.
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(payload, null, 2) + '\n');
  renameSync(tmp, file);

  const where = t => t.section ? ` → ${t.section}` : '';
  return `Queued ${validated.length} task${validated.length === 1 ? '' : 's'} for "${nb.name}":\n` +
    validated.map(t => `  • ${t.text} [${t.priority}]${where(t)}`).join('\n') +
    `\n\nSubnotes applies queued tasks when it is running, or at next launch if it is closed.`;
}

const ALLOW_DUPLICATE = {
  type: 'boolean',
  description: 'Only after the user has confirmed they want a task the notebook already has. Default false, which refuses such a write.',
};

const taskShape = {
  type: 'object',
  properties: {
    text: { type: 'string', description: 'The task, one line, naming a physical visible action.' },
    section: { type: 'string', description: 'An EXISTING section heading from list_notebooks. Omit to add at the top.' },
    priority: { type: 'string', enum: PRIORITIES, description: 'Defaults to Someday.' },
    subnotes: { type: 'array', items: { type: 'string' }, description: 'Detail lines shown under the task. Paths and links go here, not in the text.' },
  },
  required: ['text'],
};

const TOOLS = [
  {
    name: 'list_notebooks',
    description: 'List the connected Subnotes notebooks with their purpose, section headings and open task count. Call this before writing, to choose a notebook and a section without reading a whole notebook.',
    inputSchema: { type: 'object', properties: {} },
    run: listNotebooks,
  },
  {
    name: 'read_notebook',
    description: 'Read one connected notebook as plain text. Only when the answer needs its contents — list_notebooks is usually enough.',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    run: readNotebook,
  },
  {
    name: 'add_task',
    description: 'Append one task to a connected notebook. Appends only: it cannot edit, complete, delete or reorder anything. Refuses a task the notebook already has, unless allowDuplicate is true.',
    inputSchema: { type: 'object', properties: { notebook: { type: 'string' }, ...taskShape.properties, allowDuplicate: ALLOW_DUPLICATE }, required: ['notebook', 'text'] },
    run: ({ notebook, allowDuplicate, ...task }) => addTasks({ notebook, allowDuplicate, tasks: [task] }),
  },
  {
    name: 'add_tasks',
    description: 'Append several tasks to one connected notebook in a single write. Prefer this over repeated add_task calls: one file, one save, one sync cycle. Refuses a task the notebook already has, unless allowDuplicate is true.',
    inputSchema: { type: 'object', properties: { notebook: { type: 'string' }, tasks: { type: 'array', items: taskShape }, allowDuplicate: ALLOW_DUPLICATE }, required: ['notebook', 'tasks'] },
    run: addTasks,
  },
];

// MARK: - JSON-RPC over stdio

function handle(msg) {
  const { id, method, params } = msg;
  const reply = result => ({ jsonrpc: '2.0', id, result });

  switch (method) {
    case 'initialize':
      return reply({
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'subnotes', version: PLUGIN_VERSION ?? '0' },
      });
    case 'tools/list':
      return reply({ tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case 'tools/call': {
      const tool = TOOLS.find(t => t.name === params?.name);
      if (!tool) return reply({ content: [{ type: 'text', text: `Unknown tool: ${params?.name}` }], isError: true });
      try {
        return reply({ content: [{ type: 'text', text: tool.run(params.arguments ?? {}) }] });
      } catch (e) {
        // Reported as a tool error rather than a protocol error, so Claude sees
        // the explanation and can act on it — every message above says what to
        // do next.
        const text = e instanceof UserError ? e.message : `Subnotes connector error: ${e.message}`;
        return reply({ content: [{ type: 'text', text }], isError: true });
      }
    }
    default:
      // Notifications (no id) get no reply at all; unknown requests get the
      // standard method-not-found rather than silence.
      if (id === undefined) return null;
      return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
  }
}

createInterface({ input: process.stdin }).on('line', line => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  const out = handle(msg);
  if (out) process.stdout.write(JSON.stringify(out) + '\n');
});
