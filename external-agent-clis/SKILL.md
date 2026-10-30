---
name: external-agent-clis
description: "Use when dispatching coding work to Claude Code, Codex or OpenCode CLIs, or to a claude.ai web session. Probing, interaction modes, turn-capped wrapper, plan limits."
version: 1.0.0
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [agents, claude-code, codex, opencode, delegation, cdp, plan-limits]
---

# External agent CLIs

Mechanics for driving an external coding agent — the binary, the session, the plan meter. **How to write the
brief and how to verify the result are in the `agent-briefs-and-verification` skill; read that first.** This
skill assumes you already have a brief that names its file, its lines and what must not be touched.

## Selection guide

- **Claude Code** — interactive coding sessions, long refactors, PR-sized changes, when the CLI is
  authenticated.
- **Codex** — one-shot terminal-driven coding, reviews, worktree-parallel issue fixing.
- **OpenCode** — OpenCode-compatible providers, PR review workflows, background sessions.
- **Grok Bot** — cloud computer with a `/workspace`, optional local execution; the briefing and verification
  discipline maps, the mechanics do not — see `references/grok-bot-workspace.md`.
- **claude.ai web session** — when no CLI is available or the account is signed in only in the browser; driven
  over CDP, see `references/claude-web-session-cdp.md`.

## Before you dispatch: probe

"Binary installed" is not "ready to dispatch".

```bash
which claude codex opencode
claude -p 'reply with exactly: ok'      # must print: ok
```

`Not logged in · Please run /login` means delegation is impossible until the user authenticates; there is no
agent-side workaround. Do not queue a fix behind that — either drive the browser session or take the bounded
fix yourself on a fresh branch. A "not logged in" from an earlier turn is stale until re-probed.

## Interaction modes

- **One-shot** — non-interactive command mode, capture stdout/stderr, explicit test command and output format
  in the brief. The default for bounded work.
- **Interactive / PTY** — tmux when the agent needs a TUI: `tmux send-keys` for follow-ups, capture panes for
  progress, close sessions when done.
- **PR review** — ask for findings with file/line evidence, then independently check every high-severity claim
  before posting or acting on it.
- **Browser-hosted** — `claude.ai/code` over CDP on `127.0.0.1:9222`. The in-app browser tool refuses that
  address as private: enumerate tabs and `Runtime.evaluate` from a small node script instead (Node 22+ has a
  global `WebSocket`, so no npm install). Full recipe: `references/claude-web-session-cdp.md`.
- **Parallel design exploration** — one agent per direction, one worktree each, same rubric in every brief,
  per-round score file committed, rounds capped, and you score the delivered images yourself: the child's
  self-score is advisory only. Keep one branch per direction; never merge a winner without the user's pick.

### Delegated visual iteration (a child that renders and judges its own pixels)

For asset work (mesh, shader, layout) a child can close the loop itself: it writes the generator, renders,
reads its own PNG, and iterates. It only works when the brief supplies the renderer and a testable rubric:

1. Give the absolute path of the renderer, the engine, and the exact output path per variant.
2. **Put the renderer in the capability fence as well as the brief.** With no `Bash` in the allow-list the
   child writes the generator and stops — `out/` stays empty and it still exits 0. Dispatch with a
   path-scoped rule rather than opening the shell:

   ```
   CLAUDE_ALLOWED_TOOLS='Read,Edit,Write,Grep,Glob,Bash(/abs/path/to/blender:*),Bash(python3:*)' \
     node runclaude.mjs brief.txt <cwd> 30 45
   ```

   Confirm the wrapper reads the variable (`grep CLAUDE_ALLOWED_TOOLS runclaude.mjs`): an older copy
   hard-codes the allow-list, silently ignores the override, and the child stops at "every attempt needs your
   approval" with `out/` empty. Probe the binary yourself first (`<binary> --version`).
3. Turn the complaint into measurable requirements ("nothing in front below the brow", "the three styles must
   be distinguishable at 100 px tall"), never adjectives.
4. Require at least three iterations and an honest closing verdict per variant: which requirement it still
   fails. A child will otherwise declare success on its first pass.
5. Budget differently from a code edit: generator plus preview plus iterations is a legitimate 20–30 tool
   calls, so the 3–6 turn guidance does not apply — cap it and expect the cap.

A capped pass ends mid-iteration: compare the generator's mtime against the renders in `out/` and re-run it
yourself when the script is newer, or the sheet describes a version that no longer exists. The full
permission-wall recipe, with the exact log signature and the allow-list variants: `references/headless-run-permissions.md`.

## Turn-capped dispatch

`scripts/runclaude.mjs` runs a brief through `claude -p` with a hard budget:

```bash
node runclaude.mjs <brief.txt> <worktree> [maxTurns=6] [maxMinutes=8]
```

It streams `--output-format stream-json --verbose`, counts assistant turns live, kills the child at the
budget, defaults to `Read,Edit,Write,Grep,Glob` (override with `CLAUDE_ALLOWED_TOOLS`), writes a log beside the
brief, and prints:

```
[done] exit=0 turns=4 toolTurns=3 seconds=71
```

**It exits 0 even when the budget stopped the child** — read `stopped:` and `git diff`, never the exit code.
Set 3–6 turns for a scoped edit: a brief that names the file, the function and the change finishes in 1–2
turns, so a pass asking for 30 is a symptom of a vague brief, not of a hard task. Kill and rescope instead of
raising the number.

Invoke it **in place** (`~/.hermes/skills/.../external-agent-clis/scripts/runclaude.mjs`) or copy it somewhere
permanent: a copy in a scratch cache disappears when the cache is pruned and the next dispatch fails with
`MODULE_NOT_FOUND` that looks like a broken installer.

Headless without the wrapper, for a quick bounded edit:

```bash
claude -p "<brief>" --allowedTools "Read,Edit,Write,Grep,Glob" --output-format text
```

No `Bash` and no `git` means the child can only touch files; you review `git diff`, regenerate anything
derived, run the tests and commit. Add `Bash(python3:*)` only when it must validate its own output.

## Plan limits and the usage page

A `claude -p` that hits the session limit prints `You've hit your session limit · resets 12pm (UTC)` to stdout
**and still exits 0**, so a background pass looks successful. The log body is the only evidence, and `git
status` tells you whether it wrote anything before it stopped.

Before reporting that a queue is blocked, read the plan's own usage page in the logged-in browser
(`https://claude.ai/settings/usage` on the CDP port):

- the exact reset clock for the session **and** the week, the split by product, and whether a free reset is
  unused;
- convert the clock to the user's timezone as well as UTC;
- offer `Reset for free` instead of only reporting the wait — pressing it is an account action, so ask first,
  then confirm by re-reading the page (`No usage yet`, both meters 0%) and by the probe returning `ok`.

The limit that bites first is the rolling session window, not the week: `Current session 100% used` beside
`This week 9% used` stops a queue while almost all the weekly allowance is untouched. Say it with both numbers
and the reset clock rather than implying the whole plan is spent.

**Fan-out buys isolation, not throughput.** Every `claude -p` on the machine draws on the same account limit,
so three parallel passes die together the moment it lands.

While blocked, do the free work: open each worktree and branch, write every brief to a file, keep the probe
ready, and dispatch the whole queue in one batch after the reset instead of re-deriving scope pass by pass.
When no free reset is left and the defect is small enough to bound, take that one fix yourself and verify it
the same way — and say which parts you hand-built.

Usage is metered per product: when Code is exhausted a plain `https://claude.ai/new` chat still runs, but it
has no repo access — right for reviews and copy, wrong for code.

### Where the tokens went

Sum the transcripts under `~/.claude/projects/*/*.jsonl` per session and quote turns, output tokens and
cache-read — script and the per-session table are in `references/claude-plan-limits.md`. Burn is turns x
context, not diff size; the table is how you show a pass looped instead of blaming the task.

### Long answers never come back through the log

The wrapper prints only the opening line of the child's final message, so a brief asking for reasoning (a
design recommendation, an audit) returns a truncated sentence you then pay for twice. End such a brief with
"write the complete answer to `<abs path>.md` and stop", then read the file. Ask for **one** recommendation,
not a menu, and require a build order in named milestones plus the real risks — a menu comes back and the
user, who asked because they were lost, has to choose anyway.

## Pitfalls

- **A cloud session that fails its own setup is terminal, not retryable.** `Setup script failed` next to `This
  session can't continue` means the container never reached the agent: fix the setup script / allowed domains
  and start a new session, or run the same bounded brief through the local CLI.
- **The repo chip and branch picker are unreliable and block everything else.** Typing into `Search
  repositories…` via the native value setter can leave the list empty; synthetic clicks and real CDP mouse
  events can land without changing the selection. Budget two attempts, then do the git work yourself in a
  local worktree and tell the user the picker was the blocker.
- **"The agent has no `gh` auth / cannot install packages" is an environment fault before an agent fault.** Open
  Edit cloud environment, fix the allowed-domains list, and confirm token variables are named legally
  (`GH_TOKEN=`, not `key=`). Recipe: `references/claude-web-session-cdp.md`.
- **Scope a settings-dialog edit to the dialog you named.** Cloud-environment settings mount several text
  fields on one page, so a bare `document.querySelector('textarea')` writes into whichever is mounted. Select
  the `[role="dialog"]` whose heading matches the field's title, set the value through the native
  `HTMLTextAreaElement` setter plus an `input` event, screenshot before saving. Invalid content blocks the save:
  press Discard rather than repairing the field, reload, re-read it to prove the stored value is unchanged, and
  tell the user what you touched even when nothing was saved.
- **An idle-looking session can be holding the user's unsent instruction.** Before reporting a task as pending,
  scroll the transcript to its end and read the composer plus the environment chip (`Connecting` / `Not
  connected` means nothing ran). Surface the draft with three options — send it, start fresh, do it yourself —
  instead of re-sending it.
- **"New branch" and "new conversation" are different requests.** A branch inside the running session still
  carries that transcript and its current branch choice. For a new conversation, start a fresh session, have
  it `git fetch && git checkout <branch>` itself, and leave the old session alone — or press Stop so an
  off-target answer stops burning tokens.
- **A web-chat reviewer has no network path to your hosts.** It can critique a plan but cannot log in, run a
  command, or confirm a change landed. Answer with the split — hosted AI reviews, the local agent executes and
  verifies, the user decides — and never accept "I fixed the site" from a chat session.
- Document and artifact reviews ("what do you think of this playbook") go to a plain `https://claude.ai/new`
  chat, not a `/code` session; the send/extract recipe differs and is in `references/claude-web-session-cdp.md`.
- **Do not set ACP command overrides** unless the user explicitly says that CLI is installed and configured.
- Avoid shell-level `&`/`nohup` wrappers; use tracked background processes or tmux.
- External agents have no conversation memory: pass all relevant context in the brief.
