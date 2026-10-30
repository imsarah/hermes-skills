#!/usr/bin/env node
// Run an English brief through Claude Code with a hard turn budget, so one pass cannot
// burn a 5-hour plan window re-sending its context.
//   node runclaude.mjs <brief.txt> <worktree> [maxTurns=6] [maxMinutes=8]
// Prints turn/tool-turn/second counts and writes a log beside the brief. Exits 0 even when
// the budget stopped the child - read the printed `stopped:` field, not the exit code.
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const [briefPath, cwd, maxTurnsArg, maxMinArg] = process.argv.slice(2);
if (!briefPath || !cwd) {
  console.error('usage: runclaude.mjs <brief.txt> <worktree> [maxTurns=6] [maxMinutes=8]');
  process.exit(2);
}
const maxTurns = Number(maxTurnsArg || 6);
const maxMin = Number(maxMinArg || 8);
const brief = fs.readFileSync(briefPath, 'utf8');
const logPath = briefPath.replace(/\.txt$/, '') + `-${Date.now()}.log`;
const log = fs.createWriteStream(logPath, { flags: 'a' });

// No Bash in the default allow-list: the child cannot spend turns building or running tsc.
// A brief that must execute a binary (e.g. headless Blender) sets CLAUDE_ALLOWED_TOOLS to a
// path-scoped rule, e.g. 'Read,Edit,Write,Grep,Glob,Bash(/opt/blender/blender:*),Bash(python3:*)'.
const allowedTools = process.env.CLAUDE_ALLOWED_TOOLS || 'Read,Edit,Write,Grep,Glob';
const child = spawn('claude', ['-p', brief, '--output-format', 'stream-json', '--verbose',
  '--allowedTools', allowedTools], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });

let turns = 0, tools = 0, killedFor = null, buf = '';
const started = Date.now();
const note = (line) => log.write(line + '\n');

child.stdout.on('data', (chunk) => {
  buf += chunk.toString();
  const lines = buf.split('\n');
  buf = lines.pop() || '';
  for (const line of lines) {
    if (!line.trim()) continue;
    let ev; try { ev = JSON.parse(line); } catch { continue; }
    if (ev.type === 'assistant') {
      turns += 1;
      const blocks = ev.message?.content ?? [];
      const said = blocks.filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();
      const used = blocks.filter((b) => b.type === 'tool_use').map((b) => b.name).join(',');
      if (used) tools += 1;
      note(`[turn ${turns}] ${used ? 'tools:' + used : ''} ${said.slice(0, 160)}`);
      if (turns >= maxTurns) { killedFor = `turn budget ${maxTurns}`; child.kill('SIGTERM'); }
    } else if (ev.type === 'result') {
      note(`[result] ${String(ev.result ?? '').slice(0, 300)}`);
    }
  }
});
child.stderr.on('data', (d) => note('[stderr] ' + d.toString().trim().slice(0, 300)));

const clock = setInterval(() => {
  if (Date.now() - started > maxMin * 60_000) { killedFor = `time budget ${maxMin}m`; child.kill('SIGTERM'); }
}, 5_000);

child.on('exit', (code) => {
  clearInterval(clock);
  const secs = Math.round((Date.now() - started) / 1000);
  const summary = `[done] exit=${code} turns=${turns} toolTurns=${tools} seconds=${secs}`
    + `${killedFor ? ' stopped:' + killedFor : ''} log=${logPath}`;
  note(summary);
  console.log(summary);
  process.exit(0);
});
