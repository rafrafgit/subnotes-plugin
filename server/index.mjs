#!/usr/bin/env node
// MCP server for Subnotes. Reads notebook files and writes inbox files; it
// never touches SwiftData. The app owns every store access — a second process
// writing to a CloudKit-mirrored store is the failure mode this project has
// already spent five rounds on.
//
// No dependencies, deliberately. The whole surface is fifteen tools over
// newline-delimited JSON-RPC on stdio, which is less code than the wiring to
// use an SDK, and it removes the install step entirely: no package-lock, no
// 60-second dependency fetch on first cache, nothing to go stale. Revisit if
// this ever needs sampling, resources or notifications.

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
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
    // A permission failure is not a broken manifest, and telling someone to
    // reopen Subnotes when macOS is the one refusing sends them to rewrite a
    // file that was never damaged. The two are easy to tell apart and they
    // have nothing in common as fixes, so they get separate messages.
    //
    // macOS protects one app's container from another process: stat is
    // allowed (existsSync above succeeds, which is why this is reached at
    // all) while open is refused. The grant that lifts it is Full Disk
    // Access, held by whichever app is running Claude Code — a terminal, or
    // Claude Code itself — and it does not transfer between them, so running
    // from a different terminal than the one that was granted looks exactly
    // like a plugin that broke by itself.
    if (e.code === 'EPERM' || e.code === 'EACCES') throw new UserError(
      `macOS is blocking access to the Subnotes folder at ${DIR}. Grant Full Disk Access to the app running Claude Code (your terminal, or Claude Code itself) in System Settings > Privacy & Security > Full Disk Access, then restart it. Nothing is wrong with Subnotes or the plugin — this is the permission that lets one app read another's files.`);
    throw new UserError(`The Subnotes manifest could not be read (${e.message}). Reopening Subnotes will rewrite it.`);
  }

  if (m.connectorVersion > CONNECTOR_VERSION) throw new UserError(
    'This plugin is older than your Subnotes. Update the plugin.');
  if (m.connectorVersion < CONNECTOR_VERSION) throw new UserError(
    'Subnotes is older than this plugin expects. Update Subnotes.');
  followRenames(m);
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

// MARK: - Tools

// The app marks its Goals notebook by role, not name (GOALS_NOTEBOOK_SPEC.md
// in the app's repo), so a rename doesn't hide it. Said where it's listed,
// because that's what every skill calls first.
const GOALS_ROLE = 'Role: Goals — what the user is working toward and how their notebooks rank. ' +
  'Read it before working in any notebook, and judge each notebook against it as well as its own purpose.';

function listNotebooks() {
  const m = manifest();
  if (!m.notebooks.length) return "No notebooks are connected. The user turns them on in Subnotes' Settings (⌘,), which lists every notebook with a switch.";
  return m.notebooks.map(n => {
    const lines = [`## ${n.name}`];
    if (n.role === 'goals') lines.push(GOALS_ROLE);
    if (n.purpose) lines.push(`Purpose: ${n.purpose}`);
    lines.push(`Open tasks: ${n.openTasks ?? 'unknown'}`);
    const changed = lastChanged(n);
    if (changed) lines.push(`Last changed: ${changed}`);
    lines.push(n.sections?.length ? `Sections:\n${sectionOutline(n)}` : 'Sections: (none)');
    return lines.join('\n');
  }).join('\n\n');
}

function readNotebook({ name }) {
  const m = manifest();
  const nb = findNotebook(m, name);
  const text = readFileSync(join(DIR, nb.file), 'utf8');
  const notes = connectorNotes(nb);
  if (!notes.length) return text;
  return `${text.replace(/\n*$/, '')}\n\n— From the connector, not part of the notebook —\n${notes.join('\n')}\n`;
}

// What the connector knows about a notebook that its text doesn't say.
function connectorNotes(nb) {
  const notes = [];
  if (nb.role === 'goals') notes.push(GOALS_ROLE);
  const changed = lastChanged(nb);
  if (changed) notes.push(`Last changed: ${changed}`);
  const queued = queuedTasks(nb);
  if (queued.length) notes.push(
    'Queued, not yet in the notebook — Subnotes adds these when it next opens:\n' +
    queued.map(t => `  • ${t.text}${t.priority ? ` [${t.priority}]` : ''}` +
      `${t.section ? ` → ${t.section}` : ''} (written ${t.written})`).join('\n'));
  return notes;
}

// When the notebook's text last changed, as the Mac app last exported it. The
// app rewrites a notebook file only when its text differs, so the file's
// modification time is the last change — though only the last one the Mac has
// seen: edits made on the iPhone arrive when the Mac app next opens.
function lastChanged(nb) {
  try {
    return localTime(statSync(join(DIR, nb.file)).mtime);
  } catch {
    return null;
  }
}

function localTime(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Tasks written here that the app hasn't applied yet, because it hasn't been
// running since. Without these, a reader takes a queued suggestion for one the
// user deleted, and the duplicate check lets the same task be queued twice.
// Unreadable files are skipped: this is a view of the inbox, never a gate.
function queuedTasks(nb) {
  let files;
  try {
    files = readdirSync(join(DIR, 'inbox')).filter(f => f.endsWith('.json')).sort();
  } catch {
    return [];
  }
  const found = [];
  for (const f of files) {
    try {
      const p = JSON.parse(readFileSync(join(DIR, 'inbox', f), 'utf8'));
      if (p.notebook !== nb.name || !Array.isArray(p.tasks)) continue;
      const written = localTime(statSync(join(DIR, 'inbox', f)).mtime);
      for (const t of p.tasks) found.push({ ...t, written });
    } catch {}
  }
  return found;
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

function taskOf(line) {
  const task = TASK_LINE.exec(line);
  if (!task) return null;
  const tag = PRIORITY_TAG.exec(task[1]);
  const text = (tag ? task[1].slice(0, tag.index) : task[1]).trim();
  return text ? { text, priority: tag ? tag[1] : 'Someday' } : null;
}

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
    const task = taskOf(line);
    if (!task) continue;
    const key = task.text.toLowerCase();
    if (!found.has(key)) found.set(key, { ...task, section });
  }
  for (const t of queuedTasks(nb)) {
    const key = String(t.text ?? '').trim().toLowerCase();
    if (key && !found.has(key)) found.set(key, { text: t.text, priority: t.priority ?? 'Someday', section: t.section ?? null, queued: true });
  }
  return found;
}

function validateTask(t, nb) {
  const text = String(t.text ?? '').trim();
  if (!text) throw new UserError('A task needs text.');
  if (text.includes('\n')) throw new UserError(
    `A task is one line. Put the detail in subnotes instead: "${text.split('\n')[0]}"`);

  // Left out unless given: the app then starts the task with its section's
  // schedule (a section scheduled Soon, a Soon task), or Someday.
  const priority = t.priority ?? null;
  if (priority !== null && !PRIORITIES.includes(priority)) throw new UserError(
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
  return { text, ...(priority ? { priority } : {}), ...(canonical ? { section: canonical } : {}), ...(subnotes.length ? { subnotes } : {}) };
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
        `"${nb.name}" already has this task${dup.queued ? ' queued, waiting for Subnotes to open' : ''}: "${dup.text}"` +
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
    validated.map(t => `  • ${t.text}${t.priority ? ` [${t.priority}]` : ''}${where(t)}`).join('\n') +
    `\n\nSubnotes applies queued tasks when it is running, or at next launch if it is closed.`;
}

// MARK: - Journals

// A review agent's memory of one notebook (/subnotes:review): what it noticed,
// what it suggested and what became of it, what it has learned. Plain text, in
// a folder of the connector's own that the app never reads or prunes — it
// only ever deletes its notebook files and the inbox files it has applied —
// so a journal is the agent's alone, and the user's to read and correct.
//
// Keyed by the notebook's name, which is how everything here addresses a
// notebook; followRenames moves the files when a notebook is renamed. Only a
// connected notebook has one: findNotebook refuses the rest, as it does for a
// read.
//
// The agent folder has one shape throughout: a folder per kind of memory, and
// in each a file per notebook plus shared.md for what isn't about one
// notebook.
//
//   agent/review/<notebook>.md     the review's working state (its journal)
//   agent/learnings/<notebook>.md  what any skill has learned about a notebook
//   agent/learnings/shared.md      what any skill has learned that isn't
//                                  about one notebook — the user, mostly
//   agent/questions/…              open questions, the same shape
//   agent/thoughts/<notebook>.json fingerprints of the Thoughts handled
//
// Working state is one skill's own and is rewritten freely. Learnings are
// every skill's, so they are only ever added to or corrected one entry at a
// time, each entry saying which skill wrote it and when: a whole-file rewrite
// would let one skill prune what another learned without knowing what it was
// for.
const JOURNAL_LIMIT = 20_000;
const AGENT_DIR = join(DIR, 'agent');
const SHARED = 'shared';

// A name may hold "/" or ":", which a file name can't. "shared" is reserved
// for the file beside the notebooks', so a notebook of that name gets its own.
function agentFile(folder, nb) {
  if (!nb) return join(AGENT_DIR, folder, `${SHARED}.md`);
  let safe = nb.name.replace(/[\/:\0]/g, '-').trim() || 'notebook';
  if (safe.toLowerCase() === SHARED) safe = `${safe} (notebook)`;
  return join(AGENT_DIR, folder, `${safe}.md`);
}

// The brain is filed by notebook name, and a rename used to strand it: the
// notebook came back under its new name with no learnings, questions or
// journal (2026-10-17). The app sends an `id` per notebook that a rename
// doesn't change, and agent/ids.json remembers the name each id last had.
// When one comes back under a new name, its files move to that name — every
// time the manifest is read, so a rename is followed before any tool looks.
// A file already at the new name is left alone rather than overwritten, and
// nothing here ever stops a read: at worst the brain stays where it was.
const RENAMED_FILES = [
  ['review', '.md'], ['review', '.snapshot.json'], ['review', '.pending.json'],
  ['learnings', '.md'], ['questions', '.md'], ['thoughts', '.json'],
];

function followRenames(m) {
  const path = join(AGENT_DIR, 'ids.json');
  try {
    const known = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
    let changed = false;
    for (const nb of m.notebooks) {
      if (!nb.id) continue;
      const was = known[nb.id];
      if (was !== undefined && was !== nb.name) moveBrain(was, nb.name);
      if (was !== nb.name) { known[nb.id] = nb.name; changed = true; }
    }
    if (changed) writeEntryFile(path, JSON.stringify(known, null, 2) + '\n');
  } catch {
    // An unreadable ids.json or a failed move: carry on with the names as
    // they are.
  }
}

function moveBrain(from, to) {
  for (const [folder, ext] of RENAMED_FILES) {
    const src = agentFile(folder, { name: from }).replace(/\.md$/, ext);
    const dst = agentFile(folder, { name: to }).replace(/\.md$/, ext);
    if (src === dst || !existsSync(src) || existsSync(dst)) continue;
    renameSync(src, dst);
    // Learnings and questions files name their notebook in the title line.
    const kind = KINDS[folder];
    if (kind) {
      const text = readFileSync(dst, 'utf8');
      const old = `# ${kind.title} — ${from}\n`;
      if (text.startsWith(old)) writeEntryFile(dst, `# ${kind.title} — ${to}\n` + text.slice(old.length));
    }
  }
}

// Journals used to sit at agent/<notebook>.md. Moved on first use rather than
// by a migration step, which a plugin has nowhere to run.
function journalPath(nb) {
  const path = agentFile('review', nb);
  const legacy = join(AGENT_DIR, `${nb.name.replace(/[\/:\0]/g, '-').trim() || 'notebook'}.md`);
  if (!existsSync(path) && existsSync(legacy)) {
    mkdirSync(dirname(path), { recursive: true });
    renameSync(legacy, path);
  }
  return path;
}

function readJournal({ notebook }) {
  const nb = findNotebook(manifest(), notebook);
  const path = journalPath(nb);
  if (!existsSync(path)) return `No journal yet for "${nb.name}" — this is the first review of it.`;
  return readFileSync(path, 'utf8');
}

// Replaces the whole journal: the agent keeps it short by rewriting it, not
// by appending forever. Temp file then rename, as for the inbox.
function writeJournal({ notebook, content }) {
  const nb = findNotebook(manifest(), notebook);
  const text = String(content ?? '');
  if (!text.trim()) throw new UserError('A journal needs content. To start over, write a one-line note saying so.');
  if (text.length > JOURNAL_LIMIT) throw new UserError(
    `The journal is ${text.length} characters, over the ${JOURNAL_LIMIT} limit. Summarise older entries and write it again.`);
  const path = journalPath(nb);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, text.endsWith('\n') ? text : text + '\n');
  renameSync(tmp, path);
  keepSnapshot(nb);
  return `Journal for "${nb.name}" saved (${text.length} characters).` + scheduleHint();
}

// MARK: - Learnings and open questions

// Two kinds of shared memory with one shape (see the agent folder above): a
// file per notebook plus shared.md, one dated line per entry saying which
// skill wrote it, added and changed one entry at a time. Learnings are what
// holds; open questions are what isn't settled yet but decisions depend on
// (THOUGHTS_SPEC.md in the app's repo). A question, once answered, becomes a
// learning.
const ENTRY_LIMIT = 500;
const ENTRY = /^- (\d{4}-\d{2}-\d{2}) · ([^·]+?) · (.*)$/;
const KINDS = {
  learnings: {
    noun: 'learning', title: 'What agents have learned',
    aboutNotebook: 'About this notebook. Anything not about it is in shared.md.',
    aboutShared: 'Not about one notebook: the owner, how they work, what holds everywhere.',
    added: 'Learned', duplicate: 'Already learned',
  },
  questions: {
    noun: 'question', title: 'Open questions',
    aboutNotebook: "Not settled yet, and decisions here depend on them. Anything not about this notebook is in shared.md.",
    aboutShared: 'Not settled yet, and not about one notebook.',
    added: 'Open question recorded', duplicate: 'Already an open question',
  },
};

function today() {
  return localTime(new Date()).slice(0, 10);
}

// The skill that wrote an entry, as one short word: review, do, plan.
function sourceName(source) {
  const name = String(source ?? '').trim().toLowerCase();
  if (!/^[a-z][a-z-]{0,23}$/.test(name)) throw new UserError(
    'This needs `source`: the skill writing it, as one word — "review", "do", "plan".');
  return name;
}

// Optional notebook: named, the notebook's file; left out, shared.md.
function entryTarget(kind, notebook) {
  const given = notebook !== undefined && notebook !== null && String(notebook).trim() !== '';
  const nb = given ? findNotebook(manifest(), notebook) : null;
  return { nb, path: agentFile(kind, nb), label: nb ? `"${nb.name}"` : 'shared' };
}

function entryHeader(kind, nb) {
  const k = KINDS[kind];
  return `# ${k.title} — ${nb ? nb.name : 'shared'}\n\n${nb ? k.aboutNotebook : k.aboutShared}\n` +
    `Written by Subnotes' skills, one line each, saying which skill and when. Yours to read and correct.\n\n`;
}

function readEntryFile(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

function writeEntryFile(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

function entryCount(text) {
  return text.split('\n').filter(l => ENTRY.test(l)).length;
}

function readEntries(kind, notebook) {
  const { nb, path } = entryTarget(kind, notebook);
  const empty = name => `# ${KINDS[kind].title} — ${name}\n\n(nothing yet)\n`;
  const parts = [];
  if (nb) parts.push(readEntryFile(path) ?? empty(nb.name));
  parts.push(readEntryFile(agentFile(kind, null)) ?? empty('shared'));
  return parts.join('\n');
}

function oneLine(text, what) {
  const line = String(text ?? '').trim();
  if (!line) throw new UserError(`A ${what} needs text.`);
  if (line.includes('\n')) throw new UserError(`A ${what} is one line. Split it into two, or say it shorter.`);
  if (line.length > ENTRY_LIMIT) throw new UserError(
    `A ${what} is ${line.length} characters, over the ${ENTRY_LIMIT} limit. Say it shorter.`);
  return line;
}

function addEntry(kind, { notebook, text, source }) {
  const k = KINDS[kind];
  const who = sourceName(source);
  const line = oneLine(text, k.noun);
  const { nb, path, label } = entryTarget(kind, notebook);
  const current = readEntryFile(path) ?? entryHeader(kind, nb);
  // Refused rather than added twice — the same reason as add_task's check.
  const same = current.split('\n').find(l => ENTRY.exec(l)?.[3].trim().toLowerCase() === line.toLowerCase());
  if (same) throw new UserError(`${k.duplicate}, in ${label}: ${same}`);
  // One newline before the entry: a file's last line may lack its own, and a
  // fresh header ends in the blank line that sets it off from the entries.
  const base = entryCount(current) ? current.replace(/\n*$/, '\n') : current;
  writeEntryFile(path, base + `- ${today()} · ${who} · ${line}\n`);
  const n = entryCount(current) + 1;
  const crowded = n > 40 ? ` That is ${n} entries: correct or remove what no longer holds.` : '';
  return `${k.added}, in ${label}: ${line}${crowded}`;
}

// One entry, matched by a piece of its text the way a mutating notebook write
// would be (see the spec's match precondition): it must pick out exactly one,
// or nothing changes.
function findEntry(kind, notebook, match) {
  const needle = String(match ?? '').trim().toLowerCase();
  if (!needle) throw new UserError('`match` is needed: a piece of the entry\'s text that only it contains.');
  const { path, label } = entryTarget(kind, notebook);
  const current = readEntryFile(path);
  if (current === null) throw new UserError(`No ${KINDS[kind].noun}s yet in ${label}.`);
  const lines = current.split('\n');
  const hits = lines.map((l, i) => [l, i]).filter(([l]) => ENTRY.exec(l)?.[3].toLowerCase().includes(needle));
  if (hits.length !== 1) throw new UserError(hits.length
    ? `"${match}" matches ${hits.length} entries in ${label}. Use more of the one you mean:\n${hits.map(([l]) => l).join('\n')}`
    : `No entry in ${label} contains "${match}".`);
  const [old, i] = hits[0];
  return { path, label, lines, i, old, text: ENTRY.exec(old)[3] };
}

const readLearnings = ({ notebook }) => readEntries('learnings', notebook);
const addLearning = args => addEntry('learnings', args);

// Changes or removes one learning. The old wording stays beside the new, so a
// correction can itself be judged.
function correctLearning({ notebook, match, text, reason, source }) {
  const who = sourceName(source);
  const why = String(reason ?? '').trim();
  if (!why) throw new UserError('A correction needs `reason`: why the entry no longer holds.');
  const found = findEntry('learnings', notebook, match);
  const replacement = String(text ?? '').trim();
  if (replacement.includes('\n')) throw new UserError('A learning is one line.');
  if (replacement) {
    found.lines[found.i] = `- ${today()} · ${who} · ${replacement} (corrected: ${why}; was: "${found.text}")`;
  } else {
    found.lines.splice(found.i, 1);
  }
  writeEntryFile(found.path, found.lines.join('\n'));
  return replacement ? `Corrected, in ${found.label}: ${replacement}` : `Removed from ${found.label}: ${found.old}`;
}

const readQuestions = ({ notebook }) => readEntries('questions', notebook);
const addQuestion = args => addEntry('questions', args);

// An answered question leaves the open list and its answer joins the same
// scope's learnings — the learning is written first, so a refused one leaves
// the question open rather than lost.
function closeQuestion({ notebook, match, answer, source }) {
  const said = String(answer ?? '').trim();
  if (!said) throw new UserError('`answer` is needed: what settled it. To drop a question nobody will answer, say that.');
  const found = findEntry('questions', notebook, match);
  const learned = `Answered: ${found.text.replace(/\?$/, '')}? — ${said}`;
  oneLine(learned, 'learning');
  addEntry('learnings', { notebook, text: learned, source });
  found.lines.splice(found.i, 1);
  writeEntryFile(found.path, found.lines.join('\n'));
  return `Closed, in ${found.label}: ${found.text}\nAnd learned: ${learned}`;
}

// MARK: - Thoughts

// A section called Thoughts, in any case, is where the user writes what's on
// their mind about a notebook (THOUGHTS_SPEC.md): the user → agents half of
// the channel Suggestions is the other half of. One word, so a near-miss of
// the name can't silently opt a notebook out.
//
// The review can only append, so it can't clear what it has read. It keeps a
// fingerprint of each thought instead — a hash of the text, never the text —
// so nothing the user wrote is copied into the agent folder, and an edited
// line reads as a new thought.
const THOUGHTS_HEADING = /^(#{1,3})\s+(.*?)\s*$/;

function thoughtsIn(nb) {
  const text = readFileSync(join(DIR, nb.file), 'utf8');
  const lines = text.split('\n');
  const title = l => {
    const h = THOUGHTS_HEADING.exec(l);
    return h ? { level: h[1].length, name: h[2].replace(/\s*\[[^\]]*\]\s*$/, '').trim().toLowerCase() } : null;
  };
  const start = lines.findIndex(l => title(l)?.name === 'thoughts');
  if (start < 0) return null;
  const level = title(lines[start]).level;
  const thoughts = [];
  for (const line of lines.slice(start + 1)) {
    const h = title(line);
    if (h && h.level <= level) break;
    if (!line.trim() || h) continue;
    if (line.startsWith('\t') && thoughts.length) {
      thoughts[thoughts.length - 1].subs.push(line.trim());
      continue;
    }
    const bare = line.trim().replace(/^(•|-|\d+\.|>)\s+/, '').replace(PRIORITY_TAG, '').trim();
    if (bare) thoughts.push({ main: bare, subs: [] });
  }
  return thoughts.map(t => (t.subs.length ? `${t.main} — ${t.subs.join('; ')}` : t.main));
}

function fingerprint(text) {
  return createHash('sha256').update(text.trim()).digest('hex').slice(0, 16);
}

function thoughtsStore(nb) {
  return agentFile('thoughts', nb).replace(/\.md$/, '.json');
}

function handledFingerprints(nb) {
  try {
    return new Set(JSON.parse(readFileSync(thoughtsStore(nb), 'utf8')).handled ?? []);
  } catch {
    return new Set();
  }
}

function newThoughts({ notebook }) {
  const nb = findNotebook(manifest(), notebook);
  const thoughts = thoughtsIn(nb);
  if (thoughts === null) return `"${nb.name}" has no Thoughts section — nothing to read.`;
  const handled = handledFingerprints(nb);
  const fresh = thoughts.filter(t => !handled.has(fingerprint(t)));
  if (!fresh.length) return `No new thoughts in "${nb.name}" (${thoughts.length} handled before).`;
  return `New thoughts in "${nb.name}" — the user's own words; handle each, then mark_thoughts_handled:\n` +
    fresh.map((t, i) => `${i + 1}. ${t}`).join('\n');
}

// Records the given thoughts as handled. Each must be a thought the notebook
// has now, exactly as new_thoughts gave it. Fingerprints of thoughts no longer
// in the notebook are dropped, so the store only ever holds what's there.
function markThoughtsHandled({ notebook, thoughts }) {
  const nb = findNotebook(manifest(), notebook);
  const current = thoughtsIn(nb);
  if (current === null) throw new UserError(`"${nb.name}" has no Thoughts section.`);
  if (!Array.isArray(thoughts) || !thoughts.length) throw new UserError('No thoughts given.');
  const now = new Map(current.map(t => [t.trim(), fingerprint(t)]));
  const missing = thoughts.map(t => String(t).trim()).filter(t => !now.has(t));
  if (missing.length) throw new UserError(
    `Not a thought in "${nb.name}" as it stands — pass each exactly as new_thoughts gave it:\n` +
    missing.map(t => `- ${t}`).join('\n'));
  const keep = new Set(now.values());
  const handled = new Set([...handledFingerprints(nb)].filter(f => keep.has(f)));
  for (const t of thoughts) handled.add(now.get(String(t).trim()));
  const path = thoughtsStore(nb);
  writeEntryFile(path, JSON.stringify({ handled: [...handled] }, null, 2) + '\n');
  return `Marked ${thoughts.length} thought${thoughts.length === 1 ? '' : 's'} handled in "${nb.name}".`;
}

// MARK: - What changed since the last visit

// A review used to read every notebook whole to find the one line that moved,
// and the largest notebook is hundreds of lines. Instead the review keeps a
// snapshot of each notebook as it last saw it, and review_context shows only
// what differs from it.
//
// Fingerprints again, as for Thoughts: a hash per line, never the line, so
// nothing the user wrote is copied into the agent folder. Section names are
// kept as text — they're already in the manifest — and so is each task's
// priority, which is what lets a changed line say "was Next".
//
// The snapshot is of what review_context showed, not of the notebook when the
// journal is written: an edit made between the two would otherwise be counted
// as seen. review_context leaves it pending; write_journal keeps it. A visit
// that writes no journal keeps the old snapshot, so its changes show again.
const SECTION_HEADING = /^(#{1,3})\s+(.*?)\s*$/;
const TOP = '(above the first heading)';
const SHOWN_WHOLE = 12;      // a changed section this short is shown whole
const MOSTLY_NEW = 0.5;      // past this share of new lines, the whole notebook

// Flat: every heading starts a section, whatever its level. A heading's
// schedule tag is not part of its name, so rescheduling one reads as a
// changed line in the same section, not a section removed and another added.
// A repeated heading is numbered so the two stay apart.
function sectionsOf(text) {
  const sections = [{ name: TOP, lines: [] }];
  const seen = new Map();
  for (const line of text.split('\n')) {
    const h = SECTION_HEADING.exec(line);
    if (!h) {
      sections[sections.length - 1].lines.push(line);
      continue;
    }
    const base = h[2].replace(/\s*\[[^\]]*\]\s*$/, '').trim() || '(untitled)';
    const n = (seen.get(base.toLowerCase()) ?? 0) + 1;
    seen.set(base.toLowerCase(), n);
    sections.push({ name: n > 1 ? `${base} (${n})` : base, lines: [line] });
  }
  return sections;
}

const lineFingerprint = line => createHash('sha256').update(line.replace(/\s+$/, '')).digest('hex').slice(0, 16);

function snapshotOf(text) {
  const sections = sectionsOf(text);
  const tasks = {};
  for (const s of sections) for (const line of s.lines) {
    const t = taskOf(line);
    const key = t && fingerprint(t.text.toLowerCase());
    if (key && !(key in tasks)) tasks[key] = { priority: t.priority, section: s.name };
  }
  return {
    taken: localTime(new Date()),
    sections: sections.map(s => ({ name: s.name, lines: s.lines.filter(l => l.trim()).map(lineFingerprint) })),
    tasks,
  };
}

function snapshotPath(nb, pending = false) {
  return agentFile('review', nb).replace(/\.md$/, pending ? '.pending.json' : '.snapshot.json');
}

function readSnapshot(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function keepSnapshot(nb) {
  const pending = snapshotPath(nb, true);
  if (existsSync(pending)) return renameSync(pending, snapshotPath(nb));
  try {
    writeEntryFile(snapshotPath(nb), JSON.stringify(snapshotOf(readFileSync(join(DIR, nb.file), 'utf8'))) + '\n');
  } catch {}
}

// The notebook's changes as text: each changed section with its new lines
// marked "+", a task that changed schedule or section saying what it was, and
// a count of lines gone, which can't be named — only their fingerprints were
// kept. Null when so much is new that the whole notebook reads better.
function changesSince(old, text) {
  const before = new Map(old.sections.map(s => [s.name, s]));
  const out = [];
  let total = 0, fresh = 0;
  for (const s of sectionsOf(text)) {
    const prev = before.get(s.name);
    before.delete(s.name);
    const pool = new Map();
    for (const f of prev?.lines ?? []) pool.set(f, (pool.get(f) ?? 0) + 1);
    const shown = [];
    let added = 0;
    for (const line of s.lines) {
      if (!line.trim()) continue;
      total++;
      const f = lineFingerprint(line);
      if (pool.get(f)) {
        pool.set(f, pool.get(f) - 1);
        shown.push({ line: `  ${line}`, isNew: false });
        continue;
      }
      added++;
      const t = taskOf(line);
      const was = t && old.tasks?.[fingerprint(t.text.toLowerCase())];
      const notes = [];
      if (was && was.section !== s.name) notes.push(`moved from "${was.section}"`);
      if (was && was.priority.toLowerCase() !== t.priority.toLowerCase()) notes.push(`was ${was.priority}`);
      if (t && !was) notes.push('new task');
      shown.push({ line: `+ ${line}${notes.length ? `   ← ${notes.join(', ')}` : ''}`, isNew: true });
    }
    fresh += added;
    const removed = [...pool.values()].reduce((a, b) => a + b, 0);
    if (!added && !removed) continue;
    const head = `### ${s.name}${prev ? '' : ' (new section)'}` +
      (removed ? ` — ${removed} line${removed === 1 ? '' : 's'} gone` : '');
    const body = shown.length <= SHOWN_WHOLE
      ? shown.map(x => x.line)
      : [...shown.filter(x => x.isNew).map(x => x.line), `  (${shown.length - added} unchanged lines not shown)`];
    out.push([head, ...body].join('\n'));
  }
  if (total && fresh / total > MOSTLY_NEW) return null;
  for (const [name, s] of before) out.push(`### ${name} — section gone (${s.lines.length} lines)`);
  return out;
}

function sharedEntryLines(kind) {
  const lines = (readEntryFile(agentFile(kind, null)) ?? '').split('\n').filter(l => ENTRY.test(l));
  return lines.length ? lines.join('\n') : '(none)';
}

function contextFor(nb) {
  const text = readFileSync(join(DIR, nb.file), 'utf8');
  const entries = kind => {
    const lines = (readEntryFile(agentFile(kind, nb)) ?? '').split('\n').filter(l => ENTRY.test(l));
    return lines.length ? lines.join('\n') : '(none)';
  };
  const journal = journalPath(nb);
  const old = readSnapshot(snapshotPath(nb));
  const changes = old ? changesSince(old, text) : null;

  let changed;
  if (!old) changed = 'No snapshot from an earlier visit, so here is the whole notebook:\n\n' + text.replace(/\n*$/, '');
  else if (!changes) changed = `Most of it is new since ${old.taken}, so here is the whole notebook:\n\n` + text.replace(/\n*$/, '');
  else if (!changes.length) changed = `Nothing has changed since the last visit (${old.taken}).`;
  else changed = `Since the last visit (${old.taken}) — "+" is a new or changed line, the rest is unchanged context:\n\n` + changes.join('\n\n');

  // Pending until write_journal keeps it: see the top of this section.
  writeEntryFile(snapshotPath(nb, true), JSON.stringify(snapshotOf(text)) + '\n');

  const notes = connectorNotes(nb);
  return [
    `# ${nb.name}`,
    ...(nb.purpose ? [`Purpose: ${nb.purpose}`] : []),
    '',
    '## Journal',
    existsSync(journal) ? readFileSync(journal, 'utf8').trim() : 'No journal yet — this is the first review of it.',
    '',
    '## Learnings about this notebook',
    entries('learnings'),
    '',
    '## Open questions about this notebook',
    entries('questions'),
    '',
    '## Thoughts',
    newThoughts({ notebook: nb.name }),
    '',
    '## What changed',
    changed,
    ...(notes.length ? ['', '## From the connector, not part of the notebook', ...notes] : []),
  ].join('\n');
}

// Everything one visit needs, for every notebook the review is visiting, in
// one call: the shared learnings and questions once, then per notebook its
// journal, learnings, questions, new thoughts and what changed.
function reviewContext({ notebooks }) {
  const m = manifest();
  const names = (Array.isArray(notebooks) ? notebooks : [notebooks]).filter(n => String(n ?? '').trim());
  if (!names.length) throw new UserError('Name at least one notebook.');
  const nbs = names.map(n => findNotebook(m, n));
  return [
    '# Shared learnings — hold in every notebook',
    sharedEntryLines('learnings'),
    '',
    '# Shared open questions',
    sharedEntryLines('questions'),
    ...nbs.flatMap(nb => ['', contextFor(nb)]),
  ].join('\n');
}

// Offers /subnotes:schedule once, at the end of a review run by hand — the
// moment someone has just seen what a review does. Here rather than in the
// prompt, which would need a shell command (and a permission prompt) to look
// at these files; write_journal is only ever called by the review. Never on
// the daily run itself, never once it's on, and never twice: the marker is
// written as the hint is given.
const SCHEDULE_DIR = join(homedir(), '.claude', 'subnotes');

function scheduleHint() {
  if (process.env.SUBNOTES_REVIEW_RUN) return '';
  const marker = join(SCHEDULE_DIR, 'schedule-hint-shown');
  try {
    if (existsSync(join(SCHEDULE_DIR, 'daily-review')) || existsSync(marker)) return '';
    mkdirSync(SCHEDULE_DIR, { recursive: true });
    writeFileSync(marker, new Date().toISOString() + '\n');
  } catch {
    return '';
  }
  return '\n\nThe daily review is off. End your report with this line: ' +
    '"Run this by itself once a day: /subnotes:schedule"';
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
    priority: { type: 'string', enum: PRIORITIES, description: "Leave out to use the section's schedule (Someday if it has none)." },
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
  {
    name: 'read_learnings',
    description: "Read what Subnotes' skills have learned: about one notebook, if named, and always the shared learnings — the owner and how they work, anything not about one notebook. Read before deciding what to suggest or do.",
    inputSchema: { type: 'object', properties: { notebook: { type: 'string', description: 'A connected notebook. Leave out for the shared learnings alone.' } } },
    run: readLearnings,
  },
  {
    name: 'add_learning',
    description: "Add one thing learned, as one line, to a notebook's learnings or (no notebook) the shared ones. Something that will still hold next time and would change what a skill suggests or does — not what happened today. Adds only; refuses one already there.",
    inputSchema: { type: 'object', properties: {
      notebook: { type: 'string', description: 'The notebook it is about. Leave out when it is about the owner or holds across notebooks.' },
      text: { type: 'string', description: 'One line, plainly written: the owner may read it.' },
      source: { type: 'string', description: 'The skill writing it, one word: review, do, plan.' },
    }, required: ['text', 'source'] },
    run: addLearning,
  },
  {
    name: 'correct_learning',
    description: 'Change or remove one learned entry that no longer holds. `match` must pick out exactly one entry; leave `text` out to remove it. Keeps the old wording beside a change.',
    inputSchema: { type: 'object', properties: {
      notebook: { type: 'string', description: 'Leave out for the shared learnings.' },
      match: { type: 'string', description: "A piece of the entry's text that only it contains." },
      text: { type: 'string', description: 'The corrected line. Leave out to remove the entry.' },
      reason: { type: 'string', description: 'Why it no longer holds.' },
      source: { type: 'string', description: 'The skill correcting it, one word.' },
    }, required: ['match', 'reason', 'source'] },
    run: correctLearning,
  },
  {
    name: 'read_questions',
    description: "Read the open questions: what isn't settled yet but decisions depend on — about one notebook, if named, and always the shared ones. Read before suggesting or doing work that may hang on one.",
    inputSchema: { type: 'object', properties: { notebook: { type: 'string', description: 'A connected notebook. Leave out for the shared questions alone.' } } },
    run: readQuestions,
  },
  {
    name: 'add_question',
    description: "Record one open question, as one line: something unsettled that decisions depend on (\"Is Mattias as committed as I am to the Strategy idea?\"). Not a task, not a learning. Refuses one already open.",
    inputSchema: { type: 'object', properties: {
      notebook: { type: 'string', description: 'The notebook it affects. Leave out when it spans notebooks.' },
      text: { type: 'string', description: 'The question, one line, never quoting the user at length.' },
      source: { type: 'string', description: 'The skill recording it, one word: review, do, plan.' },
    }, required: ['text', 'source'] },
    run: addQuestion,
  },
  {
    name: 'close_question',
    description: 'Close one open question that has been answered. `match` must pick out exactly one; the answer becomes a learning in the same place.',
    inputSchema: { type: 'object', properties: {
      notebook: { type: 'string', description: 'Leave out for the shared questions.' },
      match: { type: 'string', description: "A piece of the question's text that only it contains." },
      answer: { type: 'string', description: 'What settled it, one line.' },
      source: { type: 'string', description: 'The skill closing it, one word.' },
    }, required: ['match', 'answer', 'source'] },
    run: closeQuestion,
  },
  {
    name: 'new_thoughts',
    description: "The thoughts in a notebook's Thoughts section not handled yet — what the user wrote about what's on their mind. Says so when there is no such section.",
    inputSchema: { type: 'object', properties: { notebook: { type: 'string' } }, required: ['notebook'] },
    run: newThoughts,
  },
  {
    name: 'mark_thoughts_handled',
    description: 'Record thoughts as handled, each exactly as new_thoughts gave it, so they are not read again. Keeps a fingerprint, never the text.',
    inputSchema: { type: 'object', properties: {
      notebook: { type: 'string' },
      thoughts: { type: 'array', items: { type: 'string' } },
    }, required: ['notebook', 'thoughts'] },
    run: markThoughtsHandled,
  },
  {
    name: 'review_context',
    description: "For /subnotes:review: everything a visit needs, for every notebook named, in one call — the shared learnings and questions once, then per notebook its journal, learnings, open questions, new thoughts, and only what changed since the review last wrote that notebook's journal (the whole notebook on a first visit). Call it once with all the notebooks to visit, instead of read_journal, read_notebook, read_learnings, read_questions and new_thoughts for each.",
    inputSchema: { type: 'object', properties: {
      notebooks: { type: 'array', items: { type: 'string' }, description: 'The connected notebooks to visit.' },
    }, required: ['notebooks'] },
    run: reviewContext,
  },
  {
    name: 'read_journal',
    description: "Read the review agent's journal for one connected notebook (/subnotes:review): its notes from earlier reviews. Says so when there is none yet.",
    inputSchema: { type: 'object', properties: { notebook: { type: 'string' } }, required: ['notebook'] },
    run: readJournal,
  },
  {
    name: 'write_journal',
    description: "Replace the review agent's journal for one connected notebook with new content — the whole journal, kept short by rewriting rather than appending. Only for /subnotes:review; never the notebook itself.",
    inputSchema: { type: 'object', properties: { notebook: { type: 'string' }, content: { type: 'string' } }, required: ['notebook', 'content'] },
    run: writeJournal,
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
