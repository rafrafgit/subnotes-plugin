#!/usr/bin/env node
// SessionEnd hook: files what a direct chat with Claude learned, so it lands
// in the brain without the user running /subnotes:wrapup. Direct chats left
// nothing behind, since a working chat that ends in commits never wraps up
// (journal, 2026-10-29). Learnings and questions only: tasks need the user's
// yes, so they stay with wrapup. The next /subnotes:run shows what was filed,
// so the user can correct it.
//
// The hook returns at once: the filing runs as a detached `claude -p`, which
// ends a session of its own, so SUBNOTES_CATCHER keeps it from catching itself.

import { readFileSync, writeFileSync, openSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { spawn } from 'node:child_process';

const MIN_USER_TURNS = 3;    // fewer is a quick question, nothing to keep
const MESSAGE_LIMIT = 2000;  // characters kept of one message
const TRANSCRIPT_LIMIT = 80_000; // characters kept of the chat, from its end
const TOOL = 'mcp__plugin_subnotes_subnotes__';
const TOOLS = ['list_notebooks', 'read_learnings', 'read_questions', 'search_notes', 'add_learning', 'add_question']
  .map(t => TOOL + t);

if (process.env.SUBNOTES_CATCHER) process.exit(0);

let input;
try { input = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }
if (!input?.transcript_path) process.exit(0);

let lines;
try {
  lines = readFileSync(input.transcript_path, 'utf8').split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
} catch { process.exit(0); }

const texts = content => typeof content === 'string' ? [content]
  : Array.isArray(content) ? content.filter(b => b?.type === 'text').map(b => b.text) : [];

// A Subnotes run or skill files its own learnings: catching it again would
// file them twice.
const ranSubnotes = lines.some(l =>
  (l.type === 'user' && texts(l.message?.content).some(t => t.includes('<command-name>/subnotes:'))) ||
  (l.type === 'assistant' && Array.isArray(l.message?.content) && l.message.content.some(b =>
    b?.type === 'tool_use' && b.name === 'Skill' && String(b.input?.skill ?? '').startsWith('subnotes:'))));
if (ranSubnotes) process.exit(0);

const turns = [];
for (const l of lines) {
  if ((l.type !== 'user' && l.type !== 'assistant') || l.isMeta) continue;
  // System reminders and command wrappers aren't what anyone said.
  const said = texts(l.message?.content).map(t => t.trim())
    .filter(t => t && !t.startsWith('<')).join('\n').trim();
  if (said) turns.push({ who: l.type === 'user' ? 'User' : 'Claude', said: said.slice(0, MESSAGE_LIMIT) });
}
if (turns.filter(t => t.who === 'User').length < MIN_USER_TURNS) process.exit(0);

let chat = turns.map(t => `${t.who}: ${t.said}`).join('\n\n');
if (chat.length > TRANSCRIPT_LIMIT) chat = '[…earlier part left out]\n\n' + chat.slice(-TRANSCRIPT_LIMIT);

const prompt = `You file what a direct chat between the user and Claude learned into their Subnotes brain. Nobody is at the keyboard: don't ask anything, and write only learnings and questions.

1. Call list_notebooks, to see the notebooks and their purposes.
2. Read the chat below. Keep only what will still hold next time and would change what a skill suggests or does:
   - a decision (a design settled, an option ruled out, a priority) or a principle the user stated: a learning in the notebook it's about, or shared (no notebook) when it holds across them or is about how the user works;
   - a fact a notebook's work depends on (where something stands, how something works, a cause found): a learning in that notebook;
   - something unsettled that other work waits on: one question.
   Leave out what was simply done and is now in the code or a notebook, how the chat went, anything personal, and any task.
3. Before adding to a notebook, call read_learnings (and read_questions) for it, and skip anything already there in other words.
4. Write each with add_learning or add_question, source "caught", one plain line the user may read, ending with "(chat, <date>)". Nothing worth keeping is a fine result: then write nothing.

Today is ${new Date().toISOString().slice(0, 10)}. The chat ran in ${input.cwd ?? 'an unknown folder'}.

<chat>
${chat}
</chat>`;

const dir = join(tmpdir(), 'subnotes-catch');
mkdirSync(dir, { recursive: true });
const promptPath = join(dir, `${input.session_id ?? Date.now()}.txt`);
writeFileSync(promptPath, prompt);
const log = openSync(join(dir, 'catch.log'), 'a');

const child = spawn('claude', ['-p', '--model', 'sonnet', '--allowedTools', TOOLS.join(','), '--max-turns', '20'], {
  cwd: homedir(),
  detached: true,
  stdio: [openSync(promptPath, 'r'), log, log],
  env: { ...process.env, SUBNOTES_CATCHER: '1' },
});
child.on('error', () => {});
child.unref();
