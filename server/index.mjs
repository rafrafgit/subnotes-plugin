#!/usr/bin/env node
// MCP server for Subnotes. Reads notebook files and writes inbox files; it
// never touches SwiftData. The app owns every store access — a second process
// writing to a CloudKit-mirrored store is the failure mode this project has
// already spent five rounds on.
//
// No dependencies, deliberately. The whole surface is seventeen tools over
// newline-delimited JSON-RPC on stdio, which is less code than the wiring to
// use an SDK, and it removes the install step entirely: no package-lock, no
// 60-second dependency fetch on first cache, nothing to go stale. Revisit if
// this ever needs sampling, resources or notifications.

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
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
// comma ("Subnotes 1.4, plugin 1.0") and a double quote ('Sam "feedback"'),
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
// The Journal notebook likewise (JOURNAL_NOTEBOOK_SPEC.md in the app's repo).
const JOURNAL_ROLE = "Role: Journal — the user's own entries on how their goals are going. " +
  '/subnotes:journal reads it and files what matters; no other skill reviews it or writes in it.';

function listNotebooks() {
  listedAt = Date.now();
  const m = manifest();
  if (!m.notebooks.length) return "No notebooks are connected. The user turns them on in Subnotes' Settings (⌘,), which lists every notebook with a switch.";
  return m.notebooks.map(n => {
    const lines = [`## ${n.name}`];
    if (n.role === 'goals') lines.push(GOALS_ROLE);
    if (isJournal(n)) lines.push(JOURNAL_ROLE);
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
  if (isJournal(nb)) notes.push(JOURNAL_ROLE);
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

  writeInbox(payload);
  const where = t => t.section ? ` → ${t.section}` : '';
  return `Queued ${validated.length} task${validated.length === 1 ? '' : 's'} for "${nb.name}":\n` +
    validated.map(t => `  • ${t.text}${t.priority ? ` [${t.priority}]` : ''}${where(t)}`).join('\n') +
    `\n\nSubnotes applies queued tasks when it is running, or at next launch if it is closed.`;
}

function writeInbox(payload) {
  const inbox = join(DIR, 'inbox');
  mkdirSync(inbox, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = join(inbox, `${stamp}-${payload.id}.json`);
  // Temp file then rename, so the app's watcher can never read a half-written
  // file. The rename is atomic within the same filesystem.
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(payload, null, 2) + '\n');
  renameSync(tmp, file);
}

// A task's own words: its marker and every trailing [tag] — schedule, date,
// repeat — taken off, since the user may have rescheduled it since it was read.
// Subtasks are included so one can be refused by name rather than not found.
const ANY_TASK_LINE = /^(\t?)•\s*(.+?)\s*$/;

function taskWords(line) {
  const task = ANY_TASK_LINE.exec(line);
  if (!task) return null;
  return { text: task[2].replace(/(\s*\[[^\]]*\])+$/, '').trim(), subtask: task[1] === '\t' };
}

// Writes lines under an existing task, after its subnotes — the one write
// that lands inside a notebook rather than at the top of a section. It still
// only adds. The task is named by its text and must be exactly one line, checked
// here against the export so a wrong match fails in the conversation, and again
// by the app when it applies the write, since the user may have changed the
// line in between (the match precondition in the app's CLAUDE_CODE_PLUGIN_SPEC.md).
function addSubnotes({ notebook, match, subnotes }) {
  const m = manifest();
  const nb = findNotebook(m, notebook);
  const wanted = String(match ?? '').trim();
  if (!wanted) throw new UserError('Name the task to write under: its text, as read_notebook shows it.');
  const lines = (Array.isArray(subnotes) ? subnotes : [subnotes]).map(s => String(s ?? '').trim()).filter(Boolean);
  if (!lines.length) throw new UserError('No subnotes given.');
  if (lines.some(l => l.includes('\n'))) throw new UserError('A subnote is one line. Send several lines as several subnotes.');

  const task = findTask(nb, wanted);
  if (task.subtask) throw new UserError(
    `"${wanted}" is a subtask, which can't have subnotes of its own. Tell the user what to add instead.`);
  const words = task.text;

  const payload = {
    connectorVersion: CONNECTOR_VERSION,
    ...(PLUGIN_VERSION ? { pluginVersion: PLUGIN_VERSION } : {}),
    id: randomUUID().slice(0, 8),
    op: 'add_subnotes',
    notebook: nb.name,
    match: words,
    subnotes: lines,
  };
  writeInbox(payload);
  return `Queued ${lines.length} subnote${lines.length === 1 ? '' : 's'} under "${words}" in "${nb.name}":\n` +
    lines.map(l => `    ${l}`).join('\n') +
    `\n\nSubnotes applies it when it is running, or at next launch if it is closed. ` +
    `A Subnotes older than this plugin can't apply it and sets it aside.`;
}

// The one task, at either level, that a write naming `wanted` means, checked
// against the export so a wrong match fails in the conversation; the app checks
// again when it applies the write. Sent without a schedule tag Claude may have
// copied along, since the app matches the task's words alone. The #idea tag is
// optional too: the review reads an idea's text without it, and the user may
// take it off meanwhile. Returns the line's own words, tag and all, so an app
// that matches them exactly still finds it — or the words as given when the
// notebook can't be read, or the task is only queued.
function findTask(nb, wanted) {
  const words = taskWords(`• ${wanted}`)?.text || wanted;
  const key = withoutIdeaTag(words).toLowerCase();
  const sameTask = t => withoutIdeaTag(String(t ?? '')).toLowerCase() === key;
  let text = null;
  try {
    text = readFileSync(join(DIR, nb.file), 'utf8');
  } catch {}
  if (text === null) return { text: words, subtask: false };
  const hits = text.split('\n').map(taskWords).filter(t => t && sameTask(t.text));
  const queued = queuedTasks(nb).some(t => sameTask(t.text));
  if (!hits.length && !queued) throw new UserError(
    `"${nb.name}" has no task "${wanted}". Pass the task's text as read_notebook shows it, without its schedule tag.`);
  if (hits.length > 1) throw new UserError(
    `"${nb.name}" has ${hits.length} tasks "${wanted}". A write changes exactly one, so this can't be placed — tell the user instead.`);
  return hits[0] ?? { text: words, subtask: false };
}

const SCHEDULES = [...PRIORITIES, 'Done'];

// Reschedules one existing task — the first write that changes a line rather
// than adding one, so the do skill can mark a task done and the review can move
// an idea on once the user agrees. Named by text, like add_subnotes. The app
// applies it through its own When menu's writers: a bucket clears any date,
// Done on a repeating task moves it to its next date, and any schedule but Done
// takes an #idea tag off.
function setSchedule({ notebook, match, schedule }) {
  const m = manifest();
  const nb = findNotebook(m, notebook);
  const wanted = String(match ?? '').trim();
  if (!wanted) throw new UserError('Name the task to reschedule: its text, as read_notebook shows it.');
  const raw = String(schedule ?? '').trim();
  const bucket = SCHEDULES.find(p => p.toLowerCase() === raw.toLowerCase());
  const date = !bucket && /^\d{4}-\d{2}-\d{2}$/.test(raw) && !isNaN(Date.parse(raw)) ? raw : null;
  if (!bucket && !date) throw new UserError(
    `Schedule must be one of ${SCHEDULES.join(', ')}, or a date as yyyy-MM-dd — got "${raw}".`);

  const words = findTask(nb, wanted).text;
  const payload = {
    connectorVersion: CONNECTOR_VERSION,
    ...(PLUGIN_VERSION ? { pluginVersion: PLUGIN_VERSION } : {}),
    id: randomUUID().slice(0, 8),
    op: 'set_schedule',
    notebook: nb.name,
    match: words,
    schedule: bucket ?? date,
  };
  writeInbox(payload);
  return `Queued: "${words}" in "${nb.name}" → ${bucket ?? date}.` +
    `\n\nSubnotes applies it when it is running, or at next launch if it is closed. ` +
    `A Subnotes older than this plugin can't apply it and sets it aside.`;
}

// A line's own words and kind, mirroring the app's Connector.editableParts:
// a task's marker and trailing tags off, a subnote's tab and any list or quote
// marker off. Null for a line with no words to edit.
const LINE_MARKER = /^(\t?)(> |- |\d+\. )?/;

function lineWords(line) {
  if (/^#{1,6} /.test(line)) return { kind: 'heading', text: line.replace(/^#+ /, '').replace(/(\s*\[[^\]]*\])+$/, '').trim() };
  if (!line.trim() || /^\s*\|.*\|\s*$/.test(line) || line.startsWith('```') || line === '---' || line.startsWith('⟦')) return null;
  const task = taskWords(line);
  if (task) return { kind: 'task', text: task.text };
  return { kind: 'line', text: line.slice(LINE_MARKER.exec(line)[0].length).trim() };
}

// Rewords one existing line on the user's yes — so a skill makes an agreed
// wording itself instead of handing the user the edit (ONE_LINE_EDIT_SPEC.md).
// Any line but a heading, a table row or code; never in the Journal. Only the
// words change: the app keeps the marker, a task's schedule, its subnotes and
// its place. Named by its words, checked here and again in the app.
function editLine({ notebook, match, text }) {
  const m = manifest();
  const nb = findNotebook(m, notebook);
  if (isJournal(nb)) throw new UserError(
    `"${nb.name}" is the Journal, the user's own writing: skills read it and never change it.`);
  const wanted = String(match ?? '').trim();
  if (!wanted) throw new UserError('Name the line to edit: its words, as read_notebook shows them.');
  const words = String(text ?? '').trim();
  if (!words || words.includes('\n')) throw new UserError('The new text is one line, and not empty. Edit one line per ask.');
  if (/^(• |#{1,6} |- |\d+\. |> |\||```|⟦)/.test(words) || words === '---' || /\[[^\]]*\]$/.test(words)) throw new UserError(
    `"${words}" starts with a marker or ends with a schedule tag. Send only the line's words: its kind and schedule stay as they are.`);

  let content = null;
  try {
    content = readFileSync(join(DIR, nb.file), 'utf8');
  } catch {}
  let old = wanted;
  if (content !== null) {
    const key = withoutIdeaTag(lineWords(`• ${wanted}`)?.text || wanted).toLowerCase();
    let inCode = false;
    const hits = [];
    for (const line of content.split('\n')) {
      if (line.startsWith('```')) { inCode = !inCode; continue; }
      if (inCode) continue;
      const found = lineWords(line);
      if (found && withoutIdeaTag(found.text).toLowerCase() === key) hits.push(found);
    }
    if (!hits.length) throw new UserError(
      `"${nb.name}" has no line "${wanted}". Pass the line's words as read_notebook shows them, without its marker or schedule tag.`);
    if (hits.length > 1) throw new UserError(
      `"${nb.name}" has ${hits.length} lines "${wanted}". An edit changes exactly one, so this can't be placed — tell the user instead.`);
    if (hits[0].kind === 'heading') throw new UserError(
      `"${wanted}" is a heading. Renaming a section isn't an edit skills make — tell the user instead.`);
    old = hits[0].text;
  }

  const payload = {
    connectorVersion: CONNECTOR_VERSION,
    ...(PLUGIN_VERSION ? { pluginVersion: PLUGIN_VERSION } : {}),
    id: randomUUID().slice(0, 8),
    op: 'edit_line',
    notebook: nb.name,
    match: old,
    text: words,
  };
  writeInbox(payload);
  return `Queued in "${nb.name}":\n  − ${old}\n  + ${words}` +
    `\n\nSubnotes applies it when it is running, or at next launch if it is closed. ` +
    `A Subnotes older than this plugin can't apply it and sets it aside. To undo, edit it back.`;
}

// MARK: - Review notes

// A review agent's memory of one notebook (/subnotes:review): what it noticed,
// what it suggested and what became of it, what it has learned. Plain text, in
// a folder of the connector's own that the app never reads or prunes — it
// only ever deletes its notebook files and the inbox files it has applied —
// so its notes are the agent's alone, and the user's to read and correct.
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
//   agent/review/<notebook>.md     the review's working state (its notes)
//   agent/learnings/<notebook>.md  what any skill has learned about a notebook
//   agent/learnings/shared.md      what any skill has learned that isn't
//                                  about one notebook — the user, mostly
//   agent/questions/…              open questions, the same shape
//   agent/thoughts/<notebook>.json fingerprints of the #idea lines seen, and what became of each
//
// Working state is one skill's own and is rewritten freely. Learnings are
// every skill's, so they are only ever added to or corrected one entry at a
// time, each entry saying which skill wrote it and when: a whole-file rewrite
// would let one skill prune what another learned without knowing what it was
// for.
const NOTES_LIMIT = 20_000;
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
// notes (2026-10-17). The app sends an `id` per notebook that a rename
// doesn't change, and agent/ids.json remembers the name each id last had.
// When one comes back under a new name, its files move to that name — every
// time the manifest is read, so a rename is followed before any tool looks.
// A file already at the new name is left alone rather than overwritten, and
// nothing here ever stops a read: at worst the brain stays where it was.
const RENAMED_FILES = [
  ['review', '.md'], ['review', '.snapshot.json'], ['review', '.pending.json'],
  ['learnings', '.md'], ['learnings', '.cites.json'], ['questions', '.md'], ['thoughts', '.json'],
  ['journal', '.snapshot.json'],
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

// Review notes used to sit at agent/<notebook>.md. Moved on first use rather than
// by a migration step, which a plugin has nowhere to run.
function notesPath(nb) {
  const path = agentFile('review', nb);
  const legacy = join(AGENT_DIR, `${nb.name.replace(/[\/:\0]/g, '-').trim() || 'notebook'}.md`);
  if (!existsSync(path) && existsSync(legacy)) {
    mkdirSync(dirname(path), { recursive: true });
    renameSync(legacy, path);
  }
  return path;
}

function readNotes({ notebook }) {
  const nb = findNotebook(manifest(), notebook);
  const path = notesPath(nb);
  if (!existsSync(path)) return `No notes yet for "${nb.name}" — this is the first review of it.`;
  return readFileSync(path, 'utf8');
}

// Replaces the whole notes file: the agent keeps it short by rewriting it, not
// by appending forever. Temp file then rename, as for the inbox.
function writeNotes({ notebook, content }) {
  const nb = findNotebook(manifest(), notebook);
  const text = String(content ?? '');
  if (!text.trim()) throw new UserError('Notes need content. To start over, write a one-line note saying so.');
  if (text.length > NOTES_LIMIT) throw new UserError(
    `The notes are ${text.length} characters, over the ${NOTES_LIMIT} limit. Summarise older entries and write it again.`);
  const path = notesPath(nb);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, text.endsWith('\n') ? text : text + '\n');
  renameSync(tmp, path);
  keepSnapshot(nb);
  return `Notes for "${nb.name}" saved (${text.length} characters).`;
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

// MARK: - Citations

// A learning can name the line it came from, so the prune can tell when its
// source is gone or Done without reasoning over every entry. Kept beside the
// learnings file rather than in it, so the file stays as readable as it was,
// and as fingerprints, never a copy of the line — the same as thoughts.
// Keyed by the learning's own text, so a correction carries it along.
const citesPath = file => file.replace(/\.md$/, '.cites.json');
const citeKey = text => fingerprint(text.toLowerCase());

function readCites(file) {
  try { return JSON.parse(readFileSync(citesPath(file), 'utf8')); } catch { return {}; }
}

function writeCites(file, cites) {
  const path = citesPath(file);
  if (Object.keys(cites).length) writeEntryFile(path, JSON.stringify(cites, null, 2) + '\n');
  else if (existsSync(path)) unlinkSync(path);
}

// The line a citation names, as a notebook and a fingerprint of its words
// (schedule left out, so rescheduling it doesn't read as the line gone).
function resolveCite(cites, learningNotebook) {
  if (cites === undefined || cites === null) return null;
  const wanted = String(cites.line ?? '').trim();
  if (!wanted) throw new UserError('`cites` needs `line`: the source line\'s words, as read_notebook shows them.');
  const name = cites.notebook ?? learningNotebook;
  if (!name) throw new UserError('`cites` needs `notebook` for a shared learning: the notebook the line is in.');
  const nb = findNotebook(manifest(), name);
  const found = readFileSync(join(DIR, nb.file), 'utf8').split('\n')
    .some(l => lineWords(l)?.text.toLowerCase() === wanted.toLowerCase());
  if (!found) throw new UserError(
    `"${nb.name}" has no line "${wanted}". Pass its words as read_notebook shows them, without its marker or schedule tag.`);
  return { id: nb.id ?? null, notebook: nb.name, line: fingerprint(wanted.toLowerCase()) };
}

// What the prune is told about one cited learning: nothing while its line is
// there and open.
function citeStatus(cite, m, texts) {
  const nb = m.notebooks.find(n => cite.id && n.id === cite.id) ??
    m.notebooks.find(n => n.name === cite.notebook);
  if (!nb) return `its source notebook "${cite.notebook}" is not connected`;
  if (!texts.has(nb.name)) texts.set(nb.name, readFileSync(join(DIR, nb.file), 'utf8').split('\n'));
  const lines = texts.get(nb.name).filter(l => {
    const w = lineWords(l);
    return w && fingerprint(w.text.toLowerCase()) === cite.line;
  });
  if (!lines.length) return `its source line in ${nb.name} is gone`;
  if (lines.every(l => DONE_TAG.test(l))) return `its source task in ${nb.name} is Done`;
  return null;
}

const readLearnings = ({ notebook }) => readEntries('learnings', notebook);
const addLearning = args => {
  const cite = resolveCite(args.cites, args.notebook);
  const done = addEntry('learnings', args);
  if (cite) {
    const { path } = entryTarget('learnings', args.notebook);
    const cites = readCites(path);
    cites[citeKey(oneLine(args.text, 'learning'))] = cite;
    writeCites(path, cites);
  }
  recordPlanCheck(args);
  return cite ? `${done} (cites a line in ${cite.notebook})` : done;
};

// Changes or removes one learning. The old wording stays beside the new, so a
// correction can itself be judged — except in the monthly prune, which
// replaces it outright, keeping its date and skill: chained "was:" versions
// had grown one Goals line to six (2026-10-25).
function correctLearning({ notebook, match, text, reason, source, goal, prune }) {
  const who = sourceName(source);
  const why = String(reason ?? '').trim();
  if (!why) throw new UserError('A correction needs `reason`: why the entry no longer holds.');
  const found = findEntry('learnings', notebook, match);
  const replacement = String(text ?? '').trim();
  if (replacement.includes('\n')) throw new UserError('A learning is one line.');
  if (replacement && prune) {
    const [, date, by] = ENTRY.exec(found.old);
    found.lines[found.i] = `- ${date} · ${by.trim()} · ${replacement}`;
  } else if (replacement) {
    found.lines[found.i] = `- ${today()} · ${who} · ${replacement} (corrected: ${why}; was: "${found.text}")`;
  } else {
    found.lines.splice(found.i, 1);
  }
  writeEntryFile(found.path, found.lines.join('\n'));
  const cites = readCites(found.path);
  const cite = cites[citeKey(found.text)];
  if (cite) {
    delete cites[citeKey(found.text)];
    if (replacement) cites[citeKey(ENTRY.exec(found.lines[found.i])[3])] = cite;
    writeCites(found.path, cites);
  }
  if (replacement) recordPlanCheck({ notebook, source, goal });
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

// A line tagged #idea, anywhere in a notebook, is the user telling the
// agents what's on their mind (THOUGHTS_SPEC.md, "Idea as a task state"): an
// idea is a task that isn't decided yet. It replaced the Thoughts and
// Suggestions sections on 2026-10-18 — the review writes its own suggestions
// as #idea tasks too, and knows them from its notes. Done ones are dealt
// with. Each says where it sits, so the review reads a subtask's idea with the
// task it's about — and so moving one reads as a new thought, as editing one
// does.
//
// The review can only append, so it can't clear what it has read. It keeps a
// fingerprint of each thought instead — a hash of the text, never the text —
// so nothing the user wrote is copied into the agent folder, and an edited
// line reads as a new thought.
const HEADING = /^(#{1,6})\s+(.*?)\s*$/;
const IDEA_TAG = /(^|\s)#idea(?!\w)/i;
const IDEA_TAG_ALL = /(^|\s)#idea(?!\w)/gi;
const DONE_TAG = /\[Done\]\s*$/i;

const withoutIdeaTag = t => t.replace(IDEA_TAG_ALL, ' ').replace(/\s+/g, ' ').trim();

// Any schedule tag on an idea, wherever it sits — a bucket, a date with or
// without a time, a repeat — so rescheduling an idea doesn't make it new
// (2026-10-23: "[Soon] #idea" moved to Someday read as a new thought).
const SCHEDULE_TAG_ANYWHERE = new RegExp(
  `\\s*\\[(?:${[...PRIORITIES, 'Done', 'Daily', 'Weekly', 'Biweekly', 'Monthly', 'Quarterly', 'Yearly'].join('|')}|\\d{4}-\\d{2}-\\d{2}[^\\]]*)\\]`, 'gi');

// Only a tagged line loses its tag, so a thought seen before keeps its
// fingerprint exactly.
const bareLine = l => {
  const bare = l.trim().replace(/^(•|-|\d+\.|>)\s+/, '').replace(PRIORITY_TAG, '').trim();
  return IDEA_TAG.test(bare) ? withoutIdeaTag(bare) : bare;
};

function thoughtsIn(nb) {
  const lines = readFileSync(join(DIR, nb.file), 'utf8').split('\n');
  const thoughts = [];
  let section = null, parent = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h = HEADING.exec(line);
    if (h) { section = h[2].replace(/\s*\[[^\]]*\]\s*$/, '').trim(); parent = null; continue; }
    if (!line.trim()) continue;
    const nested = line.startsWith('\t');
    if (!nested) parent = bareLine(line).replace(SCHEDULE_TAG_ANYWHERE, '').replace(/\s+/g, ' ').trim();
    if (!IDEA_TAG.test(line) || DONE_TAG.test(line)) continue;
    const main = bareLine(line).replace(SCHEDULE_TAG_ANYWHERE, '').replace(/\s+/g, ' ').trim();
    if (!main) continue;
    const subs = [];
    if (!nested) for (let k = i + 1; k < lines.length && lines[k].startsWith('\t'); k++) subs.push(lines[k].trim());
    const where = nested && parent ? `under: ${parent}` : section ? `in: ${section}` : 'at the top';
    thoughts.push({ main, subs, where });
  }
  if (!thoughts.length) return null;
  // Known by its own line and where it sits, not its subnotes: the review
  // writes "Decided …" under an idea it has talked through, and that made the
  // idea new again (2026-10-23). New subnotes still show in `text`. `legacy`
  // is the fingerprint the store used before, of the whole text.
  return thoughts.map(t => {
    const text = (t.subs.length ? `${t.main} — ${t.subs.join('; ')}` : t.main) + ` · ${t.where}`;
    return { text, short: `${t.main} · ${t.where}`, key: fingerprint(`${t.main} · ${t.where}`), legacy: fingerprint(text) };
  });
}

// What the store has for a thought: under its key, or under the fingerprint
// used before.
const seenFor = (seen, t) => seen[t.key] ?? seen[t.legacy];

function fingerprint(text) {
  return createHash('sha256').update(text.trim()).digest('hex').slice(0, 16);
}

function thoughtsStore(nb) {
  return agentFile('thoughts', nb).replace(/\.md$/, '.json');
}

// What the review did with each thought it has seen, by fingerprint:
// { date, became }. A thought stays open while it's in the notebook — the
// user deletes it when it's dealt with (2026-10-18) — so a seen one comes
// back each visit beside what became of it, for the review to follow up.
// The store from before kept bare fingerprints under `handled`.
function seenThoughts(nb) {
  try {
    const stored = JSON.parse(readFileSync(thoughtsStore(nb), 'utf8'));
    const seen = { ...(stored.seen ?? {}) };
    for (const f of stored.handled ?? []) seen[f] ??= {};
    return seen;
  } catch {
    return {};
  }
}

function newThoughts({ notebook }) {
  const nb = findNotebook(manifest(), notebook);
  const thoughts = thoughtsIn(nb);
  if (thoughts === null) return `"${nb.name}" has no #idea lines — nothing to read.`;
  const seen = seenThoughts(nb);
  // The review's own suggestions are #idea tasks too: its notes say which.
  const own = openSuggestionsIn(notesText(nb));
  const mine = t => own.some(o => sameText(t.split(' — ')[0].split(' · ')[0], o)) ? ' (your own open suggestion, from your notes)' : '';
  const fresh = thoughts.filter(t => !seenFor(seen, t));
  const open = thoughts.filter(t => seenFor(seen, t));
  const parts = [];
  if (fresh.length) parts.push(
    `New thoughts in "${nb.name}" — the user's own words, unless marked as yours; handle each, then mark_thoughts_seen:\n` +
    fresh.map((t, i) => `${i + 1}. ${t.text}${mine(t.text)}`).join('\n'));
  else parts.push(`No new thoughts in "${nb.name}".`);
  if (open.length) parts.push(
    `Seen before and still open — the user deletes a thought once it's dealt with:\n` +
    open.map((t, i) => {
      const { date, became } = seenFor(seen, t);
      const note = [date && `seen ${date}`, became && `became: ${became}`].filter(Boolean).join(', ');
      return `${i + 1}. ${t.text} (${note || 'marked under the old rule, which closed it once filed: take it as new, once'})${mine(t.text)}`;
    }).join('\n'));
  return parts.join('\n\n');
}

// Records what the review did with each thought: a thought the notebook has
// now, exactly as new_thoughts gave it, with an optional `became` — what came
// of it, in the review's own words. Thoughts no longer in the notebook are
// dropped, so the store only ever holds what's there.
function markThoughtsSeen({ notebook, thoughts }) {
  const nb = findNotebook(manifest(), notebook);
  const current = thoughtsIn(nb);
  if (current === null) throw new UserError(`"${nb.name}" has no #idea lines.`);
  if (!Array.isArray(thoughts) || !thoughts.length) throw new UserError('No thoughts given.');
  const given = thoughts.map(t => (typeof t === 'string' ? { text: t } : t ?? {}))
    .map(t => ({ text: String(t.text ?? '').trim(), became: t.became ? String(t.became).trim() : undefined }));
  // A thought is matched by its text as new_thoughts gave it, or without the
  // " · in: …" ending, or by its own line alone — whichever picks out one.
  const withoutWhere = s => s.replace(/ · (?:in: .*|under: .*|at the top)$/, '');
  const ways = [t => t.text, t => withoutWhere(t.text), t => withoutWhere(t.short)];
  const find = text => {
    for (const way of ways) {
      const hits = current.filter(t => way(t).trim() === text);
      if (hits.length === 1) return hits[0];
    }
    return null;
  };
  const missing = given.filter(t => !find(t.text)).map(t => t.text);
  // The thoughts as the notebook has them, not the ones passed: echoing
  // those back hid the difference (2026-10-23).
  if (missing.length) throw new UserError(
    `Not a thought in "${nb.name}" as it stands: ${missing.map(t => `"${t}"`).join(', ')}.\n` +
    `Its #idea lines are, exactly:\n` + current.map(t => `- ${t.text}`).join('\n'));
  const stored = seenThoughts(nb);
  const seen = {};
  for (const t of current) {
    const was = seenFor(stored, t);
    if (was) seen[t.key] = was;
  }
  for (const g of given) {
    const t = find(g.text);
    seen[t.key] = { date: today(), became: g.became ?? seen[t.key]?.became };
  }
  writeEntryFile(thoughtsStore(nb), JSON.stringify({ seen }, null, 2) + '\n');
  return `Marked ${given.length} thought${given.length === 1 ? '' : 's'} seen in "${nb.name}".`;
}

// MARK: - What changed since the last visit

// A review used to read every notebook whole to find the one line that moved,
// and the largest notebook is hundreds of lines. Instead the review keeps a
// snapshot of each notebook as it last saw it, and review_context shows only
// what differs from it.
//
// Fingerprints again, as for thoughts: a hash per line, never the line, so
// nothing the user wrote is copied into the agent folder. Section names are
// kept as text — they're already in the manifest — and so is each task's
// priority, which is what lets a changed line say "was Next".
//
// The snapshot is of what review_context showed, not of the notebook when the
// notes are written: an edit made between the two would otherwise be counted
// as seen. review_context leaves it pending; write_notes keeps it. A visit
// that writes no notes keeps the old snapshot, so its changes show again.
const SECTION_HEADING = /^(#{1,6})\s+(.*?)\s*$/;
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

function snapshotOf(text, old = null) {
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
    scheduled: scheduledSnapshot(text, old),
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
    writeEntryFile(snapshotPath(nb), JSON.stringify(snapshotOf(readFileSync(join(DIR, nb.file), 'utf8'), readSnapshot(snapshotPath(nb)))) + '\n');
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

// MARK: - Scheduled lines

// The review reads what the user is working on in order — Today, Next, Soon,
// then ideas — and asks of each line whether it's clear and whether anything
// wants discussing (2026-10-19). A line is a task or a heading, whatever
// carries the schedule. This hands it those lines, grouped and in that order,
// each with what sits under it: a task's deeper-indented lines, a heading's
// lines up to the next heading. A date on or before today counts as Today, and
// one in the coming week as Soon.
//
// Today and Next lines always come whole: they're the user's ongoing work,
// few of them, and the notes under them are where open points wait. Showing
// them only when changed let a point seen once but never talked through drop
// out of every later visit (2026-10-19). Each says whether it's new, changed,
// unchanged, or unmoved for a week (STALL_DAYS) — the "too big for a day"
// case. Soon lines come whole only when new or changed; the rest are named,
// one per line, as context.
//
// The snapshot keeps, per scheduled line, a fingerprint of its block and the
// date it last changed, so "unmoved" survives across visits. A snapshot from
// before this has no such dates: a block it already had is taken as unmoved
// since that snapshot was taken.
const SCHEDULED_GROUPS = ['Today', 'Next', 'Soon'];
const STALL_DAYS = 7;
const BLOCK_SHOWN = 15;      // lines shown under a scheduled line, then counted
const DATE_TAG = /\s*\[(\d{4}-\d{2}-\d{2})\]\s*$/;
const indentOf = line => /^\t*/.exec(line)[0].length;

function scheduledLines(text) {
  const lines = text.split('\n');
  const now = today();
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h = HEADING.exec(line);
    const task = !h && TASK_LINE.exec(line);
    if (!h && !task) continue;
    const body = h ? h[2] : task[1];
    let group = null, due = null;
    const tag = PRIORITY_TAG.exec(body);
    const date = DATE_TAG.exec(body);
    if (tag) group = SCHEDULED_GROUPS.find(g => g.toLowerCase() === tag[1].toLowerCase()) ?? null;
    else if (date && date[1] <= now) { group = 'Today'; due = date[1]; }
    else if (date && daysSince(date[1]) >= -STALL_DAYS) { group = 'Soon'; due = date[1]; }
    if (!group) continue;
    const name = body.slice(0, (tag ?? date).index).trim();
    if (!name) continue;
    const block = [];
    for (let k = i + 1; k < lines.length; k++) {
      const next = lines[k];
      if (h ? HEADING.test(next) : (next.trim() && indentOf(next) <= indentOf(line))) break;
      if (next.trim()) block.push(next);
    }
    found.push({ group, due, name, line, block, at: i, end: i + block.length, heading: !!h,
      key: fingerprint(`${h ? '#' : '•'} ${name.toLowerCase()}`) });
  }
  return found;
}

const blockHash = s => fingerprint([s.line.replace(/\s+$/, ''), ...s.block.map(l => l.replace(/\s+$/, ''))].join('\n'));

function scheduledSnapshot(text, old) {
  const known = old?.scheduled;
  const before = old && new Set(old.sections.flatMap(s => s.lines));
  const out = {};
  for (const s of scheduledLines(text)) {
    if (s.key in out) continue;
    const hash = blockHash(s);
    let since = today();
    if (known?.[s.key]?.hash === hash) since = known[s.key].since ?? since;
    else if (!known && before && [s.line, ...s.block].every(l => before.has(lineFingerprint(l)))) since = old.taken.slice(0, 10);
    out[s.key] = { hash, since };
  }
  return out;
}

const daysSince = date => Math.round((Date.parse(today()) - Date.parse(date)) / 86_400_000);

function scheduledReport(text, old) {
  const all = scheduledLines(text);
  if (!all.length) return 'No line is scheduled Today, Next or Soon.';
  const marks = scheduledSnapshot(text, old);
  const before = old && new Set(old.sections.flatMap(s => s.lines));
  const out = [];
  const shownBlocks = [];
  for (const group of SCHEDULED_GROUPS) {
    const look = [], rest = [];
    for (const s of all.filter(x => x.group === group)) {
      // A task already shown inside a heading's block is only named again.
      const inside = shownBlocks.some(b => s.at > b.at && s.at <= b.end);
      const since = marks[s.key]?.since;
      const days = since ? daysSince(since) : 0;
      const prev = old?.scheduled?.[s.key];
      const changed = prev ? prev.hash !== blockHash(s)
        : !(old && !old.scheduled && [s.line, ...s.block].every(l => before.has(lineFingerprint(l))));
      let status;
      if (!old) status = 'first visit';
      else if (changed) {
        const t = !s.heading && taskOf(s.line);
        const was = t && old.tasks?.[fingerprint(t.text.toLowerCase())];
        status = before && !before.has(lineFingerprint(s.line)) && !was ? 'new'
          : was && was.priority.toLowerCase() !== t.priority.toLowerCase() ? `was ${was.priority}` : 'changed';
      } else if (group !== 'Soon') status = days >= STALL_DAYS ? `unmoved since ${since} (${days} days)` : `unchanged since ${since}`;
      const label = `${s.heading ? 'heading' : 'task'}${s.due ? `, due ${s.due}` : ''}`;
      if (!status || inside) { rest.push(`- ${s.name} (${label}${inside ? ', shown above' : since ? `, unchanged since ${since}` : ''})`); continue; }
      shownBlocks.push(s);
      const shown = s.block.slice(0, BLOCK_SHOWN);
      look.push([`${s.line.trim()}   ← ${label}, ${status}`, ...shown.map(l => `  ${l}`),
        ...(s.block.length > shown.length ? [`  (${s.block.length - shown.length} more lines)`] : [])].join('\n'));
    }
    if (!look.length && !rest.length) continue;
    out.push([`### ${group}`, ...look, ...(rest.length ? [`Unchanged, for context:`, ...rest] : [])].join('\n'));
  }
  return out.join('\n\n');
}

function sharedEntryLines(kind) {
  const lines = (readEntryFile(agentFile(kind, null)) ?? '').split('\n').filter(l => ENTRY.test(l));
  return lines.length ? lines.join('\n') : '(none)';
}

// The suggestions the notes list as open: a notes line is
// "- date — the suggestion's text — why: …", the text as it was written to
// the notebook, without its #idea tag.
function openSuggestionsIn(notes) {
  const block = /^## Open suggestions\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(notes);
  if (!block) return [];
  return block[1].split('\n').filter(l => /^\s*-\s/.test(l)).map(l => {
    const body = l.replace(/^\s*-\s*/, '').replace(/^\d{4}-\d{2}-\d{2}\s*[—-]\s*/, '');
    return withoutIdeaTag(body.split(/\s+—\s+/)[0]);
  }).filter(Boolean);
}

// Case, punctuation and a parenthetical aside don't count.
const normText = t => t.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
function sameText(a, b) {
  const x = normText(a), y = normText(b);
  if (x === y) return true;
  const n = Math.min(x.length, y.length, 40);
  return n >= 15 && x.slice(0, n) === y.slice(0, n);
}

function notesText(nb) {
  const path = notesPath(nb);
  return existsSync(path) ? readFileSync(path, 'utf8').trim() : '';
}

// What became of each suggestion the notes list as open, read from the
// notebook as it stands rather than left to the notes: the notes are the
// review's own notes and goes stale, the notebook doesn't (2026-10-18). A
// suggestion is an #idea task until the user schedules it, marks it Done or
// takes the tag off; the Suggestions section it used to go to still counts,
// for the ones written there before.
function openSuggestionStatus(nb, text, reviewNotes) {
  const wanted = openSuggestionsIn(reviewNotes);
  if (!wanted.length) return [];
  const tasks = [];
  let section = '';
  for (const line of text.split('\n')) {
    const h = HEADING.exec(line);
    if (h) { section = h[2].replace(/\s*\[[^\]]*\]\s*$/, '').trim(); continue; }
    const t = TASK_LINE.exec(line);
    if (!t) continue;
    const tag = /\s*\[([^\]]+)\]\s*$/.exec(t[1]);
    const body = (tag ? t[1].slice(0, tag.index) : t[1]).trim();
    tasks.push({ text: withoutIdeaTag(body), idea: IDEA_TAG.test(body), tag: tag?.[1], section });
  }
  const queued = queuedTasks(nb);
  return wanted.map(w => {
    const found = tasks.find(t => sameText(t.text, w));
    let status;
    if (found) {
      const where = ` in ${found.section || 'the top of the notebook'}`;
      if (found.tag?.toLowerCase() === 'done') status = `done${where} — accepted`;
      else if (found.tag) status = `scheduled [${found.tag}]${where} — accepted`;
      else if (found.idea) status = `still an #idea, unscheduled,${where} — waiting`;
      else if (found.section.toLowerCase() === 'suggestions') status = 'still in Suggestions, unscheduled — waiting';
      else status = `#idea taken off${where} — accepted`;
    } else if (queued.some(q => sameText(withoutIdeaTag(q.text), w))) status = 'queued, not in the notebook yet — waiting';
    else status = 'not in the notebook — declined, cleared after Done, or the notes word it differently';
    return `- ${w}: ${status}`;
  });
}

function contextFor(nb) {
  const text = readFileSync(join(DIR, nb.file), 'utf8');
  const entries = kind => {
    const lines = (readEntryFile(agentFile(kind, nb)) ?? '').split('\n').filter(l => ENTRY.test(l));
    return lines.length ? lines.join('\n') : '(none)';
  };
  const old = readSnapshot(snapshotPath(nb));
  const changes = old ? changesSince(old, text) : null;

  let changed;
  if (!old) changed = 'No snapshot from an earlier visit, so here is the whole notebook:\n\n' + text.replace(/\n*$/, '');
  else if (!changes) changed = `Most of it is new since ${old.taken}, so here is the whole notebook:\n\n` + text.replace(/\n*$/, '');
  else if (!changes.length) changed = `Nothing has changed since the last visit (${old.taken}).`;
  else changed = `Since the last visit (${old.taken}) — "+" is a new or changed line, the rest is unchanged context:\n\n` + changes.join('\n\n');

  // Pending until write_notes keeps it: see the top of this section.
  writeEntryFile(snapshotPath(nb, true), JSON.stringify(snapshotOf(text, old)) + '\n');

  const notes = connectorNotes(nb);
  const reviewNotes = notesText(nb);
  const status = openSuggestionStatus(nb, text, reviewNotes);
  return [
    `# ${nb.name}`,
    ...(nb.purpose ? [`Purpose: ${nb.purpose}`] : []),
    '',
    '## Your notes',
    reviewNotes || 'No notes yet — this is the first review of it.',
    ...(status.length ? ['', '## Your open suggestions, as the notebook has them now', ...status] : []),
    '',
    '## Learnings about this notebook',
    entries('learnings'),
    '',
    '## Open questions about this notebook',
    entries('questions'),
    '',
    '## Scheduled lines — Today, Next, Soon, in that order',
    scheduledReport(text, old),
    '',
    '## Ideas (#idea lines)',
    newThoughts({ notebook: nb.name }),
    '',
    '## What changed',
    changed,
    ...(notes.length ? ['', '## From the connector, not part of the notebook', ...notes] : []),
  ].join('\n');
}

// How long a review run by hand keeps the user waiting, against the 90
// seconds in "What good looks like" (2026-10-19). It starts at the
// list_notebooks just before review_context, the review's first call, and
// ends when review_elapsed is called, just before the report: the time the
// user then takes to keep or drop suggestions isn't the skill's. Each later
// review_context restarts it, since the review reads one notebook at a time
// and the user waits again for each one's first question (2026-10-20).
let listedAt = 0;
let reviewStartedAt = 0;

function reviewElapsed() {
  if (!reviewStartedAt) return 'No review has started in this session.';
  const secs = Math.round((Date.now() - reviewStartedAt) / 1000);
  return `${secs >= 60 ? `${Math.floor(secs / 60)} min ${secs % 60} s` : `${secs} s`} since the review started.`;
}

// Everything one visit needs, for every notebook the review is visiting, in
// one call: the shared learnings and questions once, then per notebook its
// notes, learnings, questions, scheduled lines, new thoughts and what changed.
function reviewContext({ notebooks }) {
  const m = manifest();
  const names = (Array.isArray(notebooks) ? notebooks : [notebooks]).filter(n => String(n ?? '').trim());
  if (!names.length) throw new UserError('Name at least one notebook.');
  const nbs = names.map(n => findNotebook(m, n));
  const now = Date.now();
  reviewStartedAt = now - listedAt < 120_000 ? listedAt : now;
  listedAt = 0;
  return [
    '# Shared learnings — hold in every notebook',
    sharedEntryLines('learnings'),
    '',
    '# Shared open questions',
    sharedEntryLines('questions'),
    ...nbs.flatMap(nb => ['', contextFor(nb)]),
  ].join('\n');
}

// Everything review-ideas reads, in one call: it used to take thirteen reads
// over two turns, while the review waited (2026-10-19). Read-only, unlike
// review_context, which also leaves the review's snapshot pending. The Goals
// notebook comes whole, named or not: every idea is judged against it.
function ideasContext({ notebooks }) {
  const m = manifest();
  const names = (Array.isArray(notebooks) ? notebooks : [notebooks]).filter(n => String(n ?? '').trim());
  if (!names.length) throw new UserError('Name at least one notebook.');
  const nbs = names.map(n => findNotebook(m, n));
  const goals = m.notebooks.find(n => n.role === 'goals');
  const entries = (kind, nb) => {
    const lines = (readEntryFile(agentFile(kind, nb)) ?? '').split('\n').filter(l => ENTRY.test(l));
    return lines.length ? lines.join('\n') : '(none)';
  };
  return [
    '# Shared learnings — hold in every notebook',
    sharedEntryLines('learnings'),
    '',
    '# Shared open questions',
    sharedEntryLines('questions'),
    ...(goals ? ['', `# Goals notebook: ${goals.name}, whole`, readFileSync(join(DIR, goals.file), 'utf8').replace(/\n*$/, '')] : []),
    ...nbs.flatMap(nb => [
      '',
      `# ${nb.name}`,
      ...(nb.role === 'goals' ? ['Role: Goals'] : []),
      nb.purpose ? `Purpose: ${nb.purpose}` : 'Purpose: (none)',
      nb.sections?.length ? `Sections:\n${sectionOutline(nb)}` : 'Sections: (none)',
      '',
      '## Learnings about this notebook',
      entries('learnings', nb),
      '',
      '## Open questions about this notebook',
      entries('questions', nb),
      '',
      '## Ideas (#idea lines)',
      newThoughts({ notebook: nb.name }),
    ]),
  ].join('\n');
}

// MARK: - What's due

// /subnotes:run picks the skill to run from what's due (RITUALS_SPEC.md, One
// command): a plan check, then a review, then Do. Until the connector reads
// rituals, default rhythms decide, from dates already kept here — a goal's
// plan check, and each notebook's last review visit (2026-10-24).
const PLAN_EVERY_DAYS = 30;
const SCHEDULE_PARTS = /((?:\s*\[[^\[\]]+\])+)\s*$/;
const PLAN_CHECKS = () => join(AGENT_DIR, 'plan', 'checks.json');

// Every heading in Goals with a schedule is a goal: a date, maybe with a
// time, or Today, Next, Soon, Someday (GOALS_NOTEBOOK_SPEC.md). Its text runs
// to the next heading, whatever the level, so a goal's parts are their own.
function goalsIn(text) {
  const lines = text.split('\n');
  const goals = [];
  for (let i = 0; i < lines.length; i++) {
    const h = HEADING.exec(lines[i]);
    const tags = h && SCHEDULE_PARTS.exec(h[2]);
    if (!tags) continue;
    const parts = [...tags[1].matchAll(/\[([^\]]+)\]/g)].map(m => m[1].trim());
    if (parts.some(p => p.toLowerCase() === 'done')) continue;
    const date = parts.map(p => /^(\d{4}-\d{2}-\d{2})/.exec(p)?.[1]).find(Boolean) ?? null;
    const word = parts.find(p => PRIORITIES.some(x => x.toLowerCase() === p.toLowerCase())) ?? null;
    const name = h[2].slice(0, tags.index).trim();
    if (!name || (!date && !word)) continue;
    const block = [lines[i]];
    for (let k = i + 1; k < lines.length && !HEADING.test(lines[k]); k++) if (lines[k].trim()) block.push(lines[k]);
    goals.push({ name, level: h[1].length, date, word,
      hash: fingerprint(block.map(l => l.replace(/\s+$/, '')).join('\n')) });
  }
  return goals;
}

const goalKey = name => normText(name);

function readPlanChecks() {
  try {
    return JSON.parse(readFileSync(PLAN_CHECKS(), 'utf8'));
  } catch {
    return {};
  }
}

// A plan learning in Goals that names its goal records the check: the day,
// and the goal's text as it stood, so a later change to it shows.
function recordPlanCheck({ notebook, source, goal }) {
  if (!goal || String(source ?? '').trim().toLowerCase() !== 'plan') return;
  const m = manifest();
  const nb = notebook && findNotebook(m, notebook);
  if (nb?.role !== 'goals') return;
  const found = goalsIn(readFileSync(join(DIR, nb.file), 'utf8')).find(g => goalKey(g.name) === goalKey(goal));
  if (!found) return;
  const checks = readPlanChecks();
  checks[goalKey(found.name)] = { name: found.name, checked: today(), hash: found.hash };
  writeEntryFile(PLAN_CHECKS(), JSON.stringify(checks, null, 2) + '\n');
}

// The newest plan learning in Goals: the check date for a goal checked
// before checks were recorded by goal.
function newestPlanLearning(goals) {
  const lines = (readEntryFile(agentFile('learnings', goals)) ?? '').split('\n')
    .map(l => ENTRY.exec(l)).filter(e => e && e[2].trim() === 'plan');
  return lines.map(e => e[1]).sort().pop() ?? null;
}

function planDue(m) {
  const goalsNb = m.notebooks.find(n => n.role === 'goals');
  if (!goalsNb) return { due: [], lines: ['No Goals notebook is connected, so no plan check is due.'] };
  const goals = goalsIn(readFileSync(join(DIR, goalsNb.file), 'utf8'));
  if (!goals.length) return { due: [{ name: '(none)', why: 'Goals has no goal yet' }],
    lines: [`- Goals ("${goalsNb.name}") has no goal yet — a heading with a schedule.`] };
  const checks = readPlanChecks();
  const fallback = newestPlanLearning(goalsNb);
  const now = today();
  const due = [], lines = [];
  for (const g of goals) {
    const c = checks[goalKey(g.name)];
    const checked = c?.checked ?? fallback;
    const whys = [];
    if (g.date && g.date < now) whys.push(`its date, ${g.date}, has passed`);
    if (!checked) whys.push('never checked');
    else if (daysSince(checked) >= PLAN_EVERY_DAYS) whys.push(`last checked ${checked}, ${daysSince(checked)} days ago`);
    if (c && c.hash !== g.hash) whys.push(`its text changed since the check on ${c.checked} — due only if more than rewording`);
    const when = g.date ? `[${g.date}]` : `[${g.word}], no date yet`;
    const was = !checked ? 'never checked'
      : c ? `checked ${c.checked}` : `checked ${checked} (the newest plan learning; not recorded by goal)`;
    lines.push(`${'  '.repeat(g.level - 1)}- ${g.name} ${when} — ${was}${whys.length ? ` — DUE: ${whys.join('; ')}` : ''}`);
    if (whys.length) due.push({ name: g.name, why: whys.join('; ') });
  }
  return { due, lines };
}

// The review is due once a day, in the notebooks that changed since their
// last visit (RITUALS_SPEC.md). Once it has visited any notebook today it
// isn't due again until tomorrow: a notebook skipped or not reached waits,
// so the next /subnotes:run goes on to Do (2026-10-24). Due tasks aren't the
// review's: they're Do's.
function reviewDue(m) {
  const now = today();
  const rows = [];
  for (const nb of m.notebooks) {
    if ((!nb.purpose && nb.role !== 'goals') || isJournal(nb)) continue;
    let text;
    try { text = readFileSync(join(DIR, nb.file), 'utf8'); } catch { continue; }
    const old = readSnapshot(snapshotPath(nb));
    const visited = old?.taken?.slice(0, 10) ?? null;
    const changes = old ? changesSince(old, text) : null;
    rows.push({ name: nb.name, visited, changed: !old || changes === null || changes.length > 0 });
  }
  const ranToday = rows.some(r => r.visited === now);
  const due = [], lines = [];
  for (const r of rows) {
    let state;
    if (r.visited === now) state = `visited today${r.changed ? ', changed since' : ''}`;
    else if (!r.visited) state = 'never reviewed';
    else state = r.changed ? `changed since the last visit, ${r.visited}` : `no change since the last visit, ${r.visited}`;
    const waiting = r.changed && r.visited !== now;
    if (waiting && !ranToday) { state += ' — DUE'; due.push(r.name); }
    else if (waiting) state += ' — waits until tomorrow';
    lines.push(`- ${r.name} — ${state}`);
  }
  if (ranToday) lines.unshift('The review already ran today, so it is due again tomorrow.');
  return { due, lines };
}

// The Journal notebook, marked by role as Goals is (2026-10-25), so a rename
// keeps it; by its name only for an app too old to mark it. Journal reads
// what changed in it since its last run, the review's own way of telling, but
// from a snapshot of its own: the review doesn't read the journal.
const isJournal = nb => nb.role === 'journal' || (!nb.role && nb.name.trim().toLowerCase() === 'journal');
const journalSnapshotPath = nb => agentFile('journal', nb).replace(/\.md$/, '.snapshot.json');

function journalNotebook(m) {
  return m.notebooks.find(isJournal) ?? null;
}

// True when the Journal notebook has an entry since Journal last ran: any
// change at all, or any text on a first run.
function journalHasNew(nb) {
  const text = readFileSync(join(DIR, nb.file), 'utf8');
  const old = readSnapshot(journalSnapshotPath(nb));
  if (!old) return text.split('\n').some(l => l.trim() && !HEADING.test(l));
  const changes = changesSince(old, text);
  return changes === null || changes.length > 0;
}

function journalEntries() {
  const nb = journalNotebook(manifest());
  if (!nb) return 'No Journal notebook is connected. The user creates one and connects it in Subnotes\' Settings (⌘,).';
  const text = readFileSync(join(DIR, nb.file), 'utf8');
  const old = readSnapshot(journalSnapshotPath(nb));
  const changes = old ? changesSince(old, text) : null;
  let body;
  if (!old) body = 'First run, so here is the whole notebook:\n\n' + text.replace(/\n*$/, '');
  else if (!changes) body = `Most of it is new since ${old.taken}, so here is the whole notebook:\n\n` + text.replace(/\n*$/, '');
  else if (!changes.length) body = `Nothing new since the last run (${old.taken}).`;
  else body = `Since the last run (${old.taken}) — "+" is a new or changed line, the rest is context:\n\n` + changes.join('\n\n');
  return [`# ${nb.name}`, ...(nb.purpose ? [`Purpose: ${nb.purpose}`] : []), '', body].join('\n');
}

// Called once Journal has handled what journal_entries gave it, so the next
// run starts after it.
function markJournalRead() {
  const nb = journalNotebook(manifest());
  if (!nb) throw new UserError('No Journal notebook is connected.');
  const path = journalSnapshotPath(nb);
  writeEntryFile(path, JSON.stringify(snapshotOf(readFileSync(join(DIR, nb.file), 'utf8'), readSnapshot(path))) + '\n');
  return `Journal read up to now (${localTime(new Date())}).`;
}

// What Do would pick up: tasks, not headings, Today or overdue, then Next,
// and Soon when those are fewer than three.
function doCounts(m) {
  let now = 0, next = 0, soon = 0;
  for (const nb of m.notebooks) {
    let text;
    try { text = readFileSync(join(DIR, nb.file), 'utf8'); } catch { continue; }
    for (const s of scheduledLines(text)) {
      if (s.heading || /\[Done\]\s*$/i.test(s.line)) continue;
      if (s.group === 'Today') now++;
      else if (s.group === 'Next') next++;
      else if (s.group === 'Soon') soon++;
    }
  }
  return { now, next, soon };
}

// MARK: - Prune

// The brain is pruned once a month from /subnotes:run (2026-10-25), in place of
// the Calibrate skill: counting what was kept couldn't tell a finished task
// the user deleted from a declined one, but a run by hand found stale,
// duplicate and contradicting learnings, and the brain of a notebook no longer
// connected. Learnings and questions are read whole, every file, connected or
// not; the prune changes them one entry at a time like any skill.
const PRUNE_EVERY_DAYS = 30;
const PRUNED = () => join(AGENT_DIR, 'prune.json');
const BRAIN_FOLDERS = [...new Set(RENAMED_FILES.map(([folder]) => folder))];

function lastPruned() {
  try { return JSON.parse(readFileSync(PRUNED(), 'utf8')).pruned ?? null; } catch { return null; }
}

// Brain files kept for a notebook that isn't connected now: its name, and
// the files. A rename is followed before this runs, so these are notebooks
// turned off or deleted.
function orphanBrains(m) {
  const connected = new Set();
  for (const nb of m.notebooks) for (const [folder, ext] of RENAMED_FILES)
    connected.add(agentFile(folder, nb).replace(/\.md$/, ext));
  const orphans = new Map();
  for (const folder of BRAIN_FOLDERS) {
    let files;
    try { files = readdirSync(join(AGENT_DIR, folder)); } catch { continue; }
    for (const f of files) {
      const path = join(AGENT_DIR, folder, f);
      const ext = RENAMED_FILES.find(([d, e]) => d === folder && f.endsWith(e))?.[1];
      if (!ext || f === `${SHARED}${ext}` || connected.has(path)) continue;
      const name = f.slice(0, -ext.length);
      if (!orphans.has(name)) orphans.set(name, []);
      orphans.get(name).push(path);
    }
  }
  return orphans;
}

function crowdedFiles() {
  const crowded = [];
  let files = [];
  try { files = readdirSync(join(AGENT_DIR, 'learnings')).filter(f => f.endsWith('.md')); } catch {}
  for (const f of files) {
    const n = entryCount(readFileSync(join(AGENT_DIR, 'learnings', f), 'utf8'));
    if (n > 40) crowded.push(`${f.slice(0, -3)} (${n})`);
  }
  return crowded;
}

function pruneDue(m) {
  const last = lastPruned();
  const whys = [];
  if (!last) whys.push('never pruned');
  else if (daysSince(last) >= PRUNE_EVERY_DAYS) whys.push(`last pruned ${last}, ${daysSince(last)} days ago`);
  const lines = [last ? `Last pruned ${last}.` : 'Never pruned.'];
  const crowded = crowdedFiles();
  if (crowded.length) lines.push(`Over 40 learnings: ${crowded.join(', ')}.`);
  const orphans = [...orphanBrains(m).keys()];
  if (orphans.length) lines.push(`Kept for notebooks not connected now: ${orphans.join(', ')}.`);
  return { due: whys.length > 0, why: whys.join('; '), lines };
}

// For the prune: every learnings and questions file whole, with how many
// entries each has, and the brains of notebooks not connected now. A learning
// whose cited line is gone or Done says so after it.
function pruneContext() {
  const m = manifest();
  const out = [`Today: ${today()}`, `Last pruned: ${lastPruned() ?? 'never'}`, '',
    `Connected: ${m.notebooks.map(n => n.name + (n.role ? ` (role ${n.role})` : '')).join(', ')}`];
  const orphans = orphanBrains(m);
  out.push(orphans.size
    ? `Not connected, brain still kept: ${[...orphans.keys()].join(', ')} — remove_notebook_brain removes one`
    : 'Not connected, brain still kept: none');
  const texts = new Map();
  for (const kind of ['learnings', 'questions']) {
    let files = [];
    try { files = readdirSync(join(AGENT_DIR, kind)).filter(f => f.endsWith('.md')).sort(); } catch {}
    for (const f of files) {
      const text = readFileSync(join(AGENT_DIR, kind, f), 'utf8');
      const name = f.slice(0, -3);
      const off = orphans.has(name) ? ', not connected' : '';
      const cites = kind === 'learnings' ? readCites(join(AGENT_DIR, kind, f)) : {};
      const flagged = l => {
        const cite = cites[citeKey(ENTRY.exec(l)[3])];
        const status = cite && citeStatus(cite, m, texts);
        return status ? `${l}  ← ${status}` : l;
      };
      out.push('', `## ${kind} — ${name} (${entryCount(text)} entries${off})`, '',
        ...text.split('\n').filter(l => ENTRY.test(l)).map(flagged));
    }
  }
  return out.join('\n');
}

function removeNotebookBrain({ notebook }) {
  const name = String(notebook ?? '').trim();
  const m = manifest();
  if (m.notebooks.some(n => n.name.toLowerCase() === name.toLowerCase()))
    throw new UserError(`"${name}" is connected: its brain is still in use. Remove single entries with correct_learning.`);
  const orphans = orphanBrains(m);
  const key = [...orphans.keys()].find(k => k.toLowerCase() === name.toLowerCase());
  if (!key) throw new UserError(`No brain kept for "${name}". Kept for notebooks not connected: ${[...orphans.keys()].join(', ') || 'none'}.`);
  for (const path of orphans.get(key)) unlinkSync(path);
  return `Removed the brain kept for "${key}": ${orphans.get(key).map(p => p.slice(AGENT_DIR.length + 1)).join(', ')}.`;
}

function markPruned() {
  writeEntryFile(PRUNED(), JSON.stringify({ pruned: today() }, null, 2) + '\n');
  return `Pruned ${today()}; due again in ${PRUNE_EVERY_DAYS} days.`;
}

function whatsDue() {
  const m = manifest();
  if (!m.notebooks.length) return "No notebooks are connected. The user turns them on in Subnotes' Settings (⌘,).";
  const plan = planDue(m), review = reviewDue(m), prune = pruneDue(m), work = doCounts(m);
  const journal = journalNotebook(m);
  let journalNew = false;
  try { journalNew = !!journal && journalHasNew(journal); } catch {}
  const run = plan.due.length ? 'Plan' : journalNew ? 'Journal' : review.due.length ? 'Review' : prune.due ? 'Prune' : 'Do';
  return [
    `Today: ${today()}`,
    `Run: ${run}`,
    '',
    `## Plan — ${plan.due.length ? `due for ${plan.due.length} goal${plan.due.length > 1 ? 's' : ''}` : 'not due'}`,
    `A goal is due ${PLAN_EVERY_DAYS} days after its last check, when its text has changed since, or when its date has passed.`,
    ...plan.lines,
    '',
    `## Journal — ${journalNew ? 'due' : 'not due'}`,
    !journal ? 'No Journal notebook is connected.'
      : journalNew ? `"${journal.name}" has an entry since Journal last ran.` : `Nothing new in "${journal.name}" since Journal last ran.`,
    '',
    `## Review — ${review.due.length ? `due in ${review.due.join(', ')}` : 'not due'}`,
    'Due once a day, in the notebooks that changed since their last visit.',
    ...review.lines,
    '',
    `## Prune — ${prune.due ? `due: ${prune.why}` : 'not due'}`,
    `Due ${PRUNE_EVERY_DAYS} days after the last prune.`,
    ...prune.lines,
    '',
    '## Do',
    `${work.now} task${work.now === 1 ? '' : 's'} Today or overdue, ${work.next} Next, ${work.soon} Soon, across the connected notebooks.`,
    work.now + work.next < 3 && work.soon ? 'Fewer than three Today or Next, so Do adds Soon ones.' : null,
  ].filter(l => l !== null).join('\n');
}

// MARK: - Search

// A skill that needs "anything about X" used to read whole notebooks to find
// a few lines — the costliest call there is. Plain words, no embeddings: a
// line matches when it holds every word, ignoring case and accents. Each hit
// says where it sits, so the skill rarely needs the notebook after it.
const SEARCH_LIMIT = 40;
const searchable = t => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function searchNotes({ query, notebooks }) {
  const words = searchable(String(query ?? '')).split(/\s+/).filter(Boolean);
  if (!words.length) throw new UserError('Give `query` one or more words to look for.');
  const m = manifest();
  const named = Array.isArray(notebooks) && notebooks.length;
  const nbs = named ? notebooks.map(n => findNotebook(m, n)) : m.notebooks;
  const matches = line => { const t = searchable(line); return words.every(w => t.includes(w)); };

  const groups = [];
  let total = 0;
  const add = (title, hits) => {
    if (!hits.length) return;
    total += hits.length;
    groups.push({ title, hits });
  };

  for (const nb of nbs) {
    const hits = [];
    let section = TOP, parent = null;
    for (const line of readFileSync(join(DIR, nb.file), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const h = HEADING.exec(line);
      if (h) { section = h[2].replace(/\s*\[[^\]]*\]\s*$/, '').trim() || '(untitled)'; parent = null; }
      else if (indentOf(line) === 0) parent = line.trim();
      if (!matches(line)) continue;
      const under = !h && indentOf(line) > 0 && parent ? ` (under: ${parent})` : '';
      hits.push(`- ${section} › ${line.trim()}${under}`);
    }
    add(`## ${nb.name}`, hits);
  }

  const brain = [...nbs, ...(named ? [] : [null])];
  for (const kind of ['learnings', 'questions']) {
    for (const nb of brain) {
      const text = readEntryFile(agentFile(kind, nb));
      if (!text) continue;
      const hits = text.split('\n').filter(l => ENTRY.test(l) && matches(l));
      add(`## ${KINDS[kind].title} — ${nb ? nb.name : 'shared'}`, hits);
    }
  }

  if (!total) return `No line holds all of: ${words.join(', ')}. Try fewer or other words.`;
  let left = SEARCH_LIMIT;
  const shown = groups.map(g => {
    const hits = g.hits.slice(0, Math.max(left, 0));
    left -= hits.length;
    return hits.length ? `${g.title}\n${hits.join('\n')}` : null;
  }).filter(Boolean);
  const more = total > SEARCH_LIMIT ? `\n\n${total - SEARCH_LIMIT} more not shown. Add a word, or name the notebooks, to narrow it.` : '';
  return `${total} line${total === 1 ? '' : 's'} with ${words.join(', ')}:\n\n${shown.join('\n\n')}${more}`;
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
    name: 'search_notes',
    description: "Find the lines that hold every word of a query, across the connected notebooks and what the skills have learned and asked: each with its notebook, section and schedule, and a subnote with the task it's under. Use it instead of read_notebook when you need what's written about something, not a whole notebook.",
    inputSchema: { type: 'object', properties: {
      query: { type: 'string', description: 'Words to look for; a line matches when it holds all of them, ignoring case and accents.' },
      notebooks: { type: 'array', items: { type: 'string' }, description: 'Connected notebooks to look in, with their learnings and questions. Leave out for all of them and the shared ones.' },
    }, required: ['query'] },
    run: searchNotes,
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
    name: 'add_subnotes',
    description: 'Write detail lines under one existing task, after the subnotes it already has — such as a decision talked through in Claude Code, under the idea it settles. Adds only: it cannot change or remove the task or its subnotes. The task is named by its text and must be exactly one top-level task in the notebook.',
    inputSchema: { type: 'object', properties: {
      notebook: { type: 'string' },
      match: { type: 'string', description: "The task's text, as read_notebook shows it, without its schedule tag; its #idea tag may be left out." },
      subnotes: { type: 'array', items: { type: 'string' }, description: 'The lines to add, one subnote each.' },
    }, required: ['notebook', 'match', 'subnotes'] },
    run: addSubnotes,
  },
  {
    name: 'set_schedule',
    description: "Reschedule one existing task: Today, Next, Soon, Someday, Done, or a date. Only when the user has asked for it or agreed to it — such as marking a task done that was just finished, or accepting an idea. Scheduling an #idea takes its tag off; Done leaves it. Done on a repeating task moves it to its next date. The task is named by its text and must be exactly one task in the notebook; a subtask is fine.",
    inputSchema: { type: 'object', properties: {
      notebook: { type: 'string' },
      match: { type: 'string', description: "The task's text, as read_notebook shows it, without its schedule tag; its #idea tag may be left out." },
      schedule: { type: 'string', description: 'Today, Next, Soon, Someday or Done, or a date as yyyy-MM-dd.' },
    }, required: ['notebook', 'match', 'schedule'] },
    run: setSchedule,
  },
  {
    name: 'edit_line',
    description: "Change the words of one existing line — a task, subtask, subnote, list item, quote or body text — only after showing the user the old and new line and getting their yes. Never a heading, a table row, code, or the Journal notebook. Keeps the line's kind, schedule, subnotes and place; one line per ask. To undo, edit it back.",
    inputSchema: { type: 'object', properties: {
      notebook: { type: 'string' },
      match: { type: 'string', description: "The line's words, as read_notebook shows them, without its marker or schedule tag; a task's #idea tag may be left out." },
      text: { type: 'string', description: 'The new words, one line, with no marker or schedule tag.' },
    }, required: ['notebook', 'match', 'text'] },
    run: editLine,
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
      goal: { type: 'string', description: "For a plan check's learning in Goals: the goal's heading, without its schedule. Records the check, so /subnotes:run knows when it's next due." },
      cites: { type: 'object', description: "The line it came from, when there is one — a task, a Journal entry's line — so the prune knows when that line is gone or Done. Kept beside the learning, not in it.", properties: {
        line: { type: 'string', description: "The line's words, as read_notebook shows them, without its marker or schedule tag." },
        notebook: { type: 'string', description: "The notebook the line is in. Leave out when it's the learning's own notebook." },
      }, required: ['line'] },
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
      goal: { type: 'string', description: "For a plan check's learning in Goals: the goal's heading, without its schedule. Records the check." },
      prune: { type: 'boolean', description: 'Only for the monthly prune: replace the entry outright, keeping its date and skill, with no old wording beside it.' },
    }, required: ['match', 'reason', 'source'] },
    run: correctLearning,
  },
  {
    name: 'prune_context',
    description: "For the monthly prune: every learnings and questions file whole, with entry counts, and the brains still kept for notebooks not connected now. Read-only.",
    inputSchema: { type: 'object', properties: {} },
    run: pruneContext,
  },
  {
    name: 'remove_notebook_brain',
    description: "For the monthly prune, on the user's yes: delete everything kept for a notebook that isn't connected now — its learnings, questions and review notes. Refuses a connected notebook.",
    inputSchema: { type: 'object', properties: { notebook: { type: 'string', description: 'The name prune_context lists as not connected.' } }, required: ['notebook'] },
    run: removeNotebookBrain,
  },
  {
    name: 'mark_pruned',
    description: 'For the monthly prune, last: records today as the last prune, so /subnotes:run makes it due again in 30 days.',
    inputSchema: { type: 'object', properties: {} },
    run: markPruned,
  },
  {
    name: 'read_questions',
    description: "Read the open questions: what isn't settled yet but decisions depend on — about one notebook, if named, and always the shared ones. Read before suggesting or doing work that may hang on one.",
    inputSchema: { type: 'object', properties: { notebook: { type: 'string', description: 'A connected notebook. Leave out for the shared questions alone.' } } },
    run: readQuestions,
  },
  {
    name: 'add_question',
    description: "Record one open question, as one line: something unsettled that decisions depend on (\"Is Sam as committed as I am to the side project?\"). Not a task, not a learning. Refuses one already open.",
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
    description: "A notebook's lines tagged #idea, anywhere, each with where it sits — what the user wrote about what's on their mind: the new ones, then those seen before and still open, with what became of them. Says so when there are none of either.",
    inputSchema: { type: 'object', properties: { notebook: { type: 'string' } }, required: ['notebook'] },
    run: newThoughts,
  },
  {
    name: 'mark_thoughts_seen',
    description: 'Record what you did with each thought, exactly as new_thoughts gave it, with what it became. A thought stays open until the user deletes it: it comes back each visit as seen, beside what became of it. Keeps a fingerprint and your note, never the text.',
    inputSchema: { type: 'object', properties: {
      notebook: { type: 'string' },
      thoughts: { type: 'array', items: { anyOf: [
        { type: 'string' },
        { type: 'object', properties: {
          text: { type: 'string', description: 'The thought, exactly as new_thoughts gave it.' },
          became: { type: 'string', description: 'What came of it, in your words, never quoting it: "suggestion: Pick a name for Goals", "a learning", "nothing".' },
        }, required: ['text'] },
      ] } },
    }, required: ['notebook', 'thoughts'] },
    run: markThoughtsSeen,
  },
  {
    name: 'review_context',
    description: "For /subnotes:review: everything a visit needs, for every notebook named, in one call — the shared learnings and questions once, then per notebook its notes, what the notebook shows now of each suggestion the notes list as open, learnings, open questions, the lines scheduled Today, Next and Soon (Today and Next always whole, with whether each is new, changed, unchanged or unmoved for a week; Soon whole when new or changed, else named), thoughts, and only what changed since the review last wrote that notebook's notes (the whole notebook on a first visit). Call it once with all the notebooks to visit, instead of read_notes, read_notebook, read_learnings, read_questions and new_thoughts for each.",
    inputSchema: { type: 'object', properties: {
      notebooks: { type: 'array', items: { type: 'string' }, description: 'The connected notebooks to visit.' },
    }, required: ['notebooks'] },
    run: reviewContext,
  },
  {
    name: 'review_elapsed',
    description: "For /subnotes:review run by hand: how long since the review started (its list_notebooks, or review_context). Call it last before showing the report, so the time leaves out the user's answer.",
    inputSchema: { type: 'object', properties: {} },
    run: reviewElapsed,
  },
  {
    name: 'ideas_context',
    description: "For review-ideas: everything it reads, for every notebook named, in one read-only call — the shared learnings and questions and the Goals notebook whole, then per notebook its purpose, sections, learnings, open questions and #idea lines (as new_thoughts gives them). Call it once instead of list_notebooks, read_notebook, read_learnings, read_questions and new_thoughts.",
    inputSchema: { type: 'object', properties: {
      notebooks: { type: 'array', items: { type: 'string' }, description: 'The connected notebooks whose ideas to read.' },
    }, required: ['notebooks'] },
    run: ideasContext,
  },
  {
    name: 'whats_due',
    description: "For /subnotes: what's due, read-only — each goal's last plan check, each notebook's last review visit and whether it changed since, and the tasks Do would pick up — and which to run first: Plan, Journal, Review, Prune or Do.",
    inputSchema: { type: 'object', properties: {} },
    run: whatsDue,
  },
  {
    name: 'journal_entries',
    description: "For the Journal skill: what's new in the user's Journal notebook since Journal last ran (the whole notebook on a first run), read-only. Call mark_journal_read once it's handled.",
    inputSchema: { type: 'object', properties: {} },
    run: journalEntries,
  },
  {
    name: 'mark_journal_read',
    description: 'For the Journal skill: record that the Journal notebook has been read up to now, so its next run starts after it. Call last, once every entry is handled.',
    inputSchema: { type: 'object', properties: {} },
    run: markJournalRead,
  },
  {
    name: 'read_notes',
    description: "Read the review agent's notes for one connected notebook (/subnotes:review): its notes from earlier reviews. Says so when there is none yet.",
    inputSchema: { type: 'object', properties: { notebook: { type: 'string' } }, required: ['notebook'] },
    run: readNotes,
  },
  {
    name: 'write_notes',
    description: "Replace the review agent's notes for one connected notebook with new content — the whole notes file, kept short by rewriting rather than appending. Only for /subnotes:review; never the notebook itself.",
    inputSchema: { type: 'object', properties: { notebook: { type: 'string' }, content: { type: 'string' } }, required: ['notebook', 'content'] },
    run: writeNotes,
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
