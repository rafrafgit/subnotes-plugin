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
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';

const PROTOCOL_VERSION = '2024-11-05';
const CONNECTOR_VERSION = 1;   // the contract number in manifest.json
const PRIORITIES = ['Today', 'Next', 'Soon', 'Someday'];

const DIR = process.env.SUBNOTES_DIR;

// Every message the user could see when something is wrong says which of the
// two halves to fix. A bare failure is the one outcome the manifest exists to
// prevent.
class UserError extends Error {}

function manifest() {
  if (!DIR) throw new UserError(
    'The Subnotes folder is not configured. Set it in the plugin settings — Subnotes shows the path under File → Reveal Connector Folder.');
  const path = join(DIR, 'manifest.json');
  if (!existsSync(path)) throw new UserError(
    `No Subnotes connector folder at ${DIR}. Subnotes 1.4 or later is required, and at least one notebook must be connected — right-click a notebook in Subnotes and choose Connect to Claude Code.`);

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

// Names are how the user refers to notebooks in conversation, so that is how
// they are addressed. An unknown or ambiguous name lists what is connected
// rather than guessing — writing to the wrong notebook is worse than failing.
function findNotebook(m, name) {
  const wanted = String(name ?? '').trim().toLowerCase();
  const hits = m.notebooks.filter(n => n.name.toLowerCase() === wanted);
  if (hits.length === 1) return hits[0];
  const listed = m.notebooks.map(n => n.name).join(', ') || '(none)';
  if (hits.length === 0) throw new UserError(
    `No connected notebook called "${name}". Connected notebooks: ${listed}. ` +
    `A notebook the user has not connected in Subnotes is not visible here.`);
  throw new UserError(`"${name}" matches more than one connected notebook. Connected: ${listed}.`);
}

// MARK: - Tools

function listNotebooks() {
  const m = manifest();
  if (!m.notebooks.length) return 'No notebooks are connected. The user connects one by right-clicking a notebook in Subnotes and choosing Connect to Claude Code.';
  return m.notebooks.map(n => {
    const lines = [`## ${n.name}`];
    if (n.purpose) lines.push(`Purpose: ${n.purpose}`);
    lines.push(`Open tasks: ${n.openTasks ?? 'unknown'}`);
    lines.push(n.sections?.length ? `Sections: ${n.sections.join(', ')}` : 'Sections: (none)');
    return lines.join('\n');
  }).join('\n\n');
}

function readNotebook({ name }) {
  const m = manifest();
  const nb = findNotebook(m, name);
  return readFileSync(join(DIR, nb.file), 'utf8');
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
      `"${nb.name}" has no section called "${section}". Its sections are: ${(nb.sections ?? []).join(', ') || '(none)'}. ` +
      `Sections are not created here — leave section out to add at the top of the notebook.`);
  }
  // Match the manifest's own capitalisation, so the app matches the heading it
  // actually has rather than the one Claude typed.
  const canonical = section ? (nb.sections ?? []).find(s => s.toLowerCase() === section.toLowerCase()) : null;

  const subnotes = (t.subnotes ?? []).map(s => String(s).trim()).filter(Boolean);
  return { text, priority, ...(canonical ? { section: canonical } : {}), ...(subnotes.length ? { subnotes } : {}) };
}

function addTasks({ notebook, tasks }) {
  const m = manifest();
  const nb = findNotebook(m, notebook);
  if (!Array.isArray(tasks) || !tasks.length) throw new UserError('No tasks given.');
  const validated = tasks.map(t => validateTask(t, nb));

  // `id` makes the write idempotent: the app records applied ids, so a retry
  // after a timeout cannot double-add.
  const payload = {
    connectorVersion: CONNECTOR_VERSION,
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
    description: 'Append one task to a connected notebook. Appends only: it cannot edit, complete, delete or reorder anything.',
    inputSchema: { type: 'object', properties: { notebook: { type: 'string' }, ...taskShape.properties }, required: ['notebook', 'text'] },
    run: ({ notebook, ...task }) => addTasks({ notebook, tasks: [task] }),
  },
  {
    name: 'add_tasks',
    description: 'Append several tasks to one connected notebook in a single write. Prefer this over repeated add_task calls: one file, one save, one sync cycle.',
    inputSchema: { type: 'object', properties: { notebook: { type: 'string' }, tasks: { type: 'array', items: taskShape } }, required: ['notebook', 'tasks'] },
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
        serverInfo: { name: 'subnotes', version: '0.1.0' },
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
