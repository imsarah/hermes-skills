# Hermes skills

[![English](https://img.shields.io/badge/English-selected-2f81f7?style=flat-square)](#) [![廣東話](https://img.shields.io/badge/%E5%BB%A3%E6%9D%B1%E8%A9%B1-switch-d0d7de?style=flat-square)](README.zh-HK.md)

Plain-markdown skills for [Hermes Agent](https://hermes-agent.nousresearch.com/docs). Each folder is one
skill: a `SKILL.md` with YAML frontmatter, plus optional `references/`, `scripts/` and `templates/`
directories that the skill links to. No plugins, no build step — just files the agent reads.

Two skills, and **you can use the first one without owning any external agent**:

- **`agent-briefs-and-verification`** — how to brief an agent and prove the result. Works with Hermes's own
  `delegate_task` subagents, any model, any stack (Next.js, PHP, three.js fail the same way). No Claude Code,
  no Codex account, nothing to install.
- **`external-agent-clis`** — optional. The mechanics of dispatching to Claude Code, Codex, OpenCode or a
  `claude.ai` web session: probing, the turn-capped wrapper, plan limits.

## Install

```bash
git clone https://github.com/imsarah/hermes-skills.git

# the general one — this is the useful half on its own
cp -R hermes-skills/agent-briefs-and-verification ~/.hermes/skills/

# optional: only if you dispatch to Claude Code / Codex / OpenCode
cp -R hermes-skills/external-agent-clis ~/.hermes/skills/
```

That is the whole install. Then start a **new** Hermes session (skills are loaded at session start) — or, in a
session that is already running, ask the agent:

```
skill_view(name="agent-briefs-and-verification")
```

One profile only: copy into `~/.hermes/profiles/<profile>/skills/`. Check it landed:

```bash
ls ~/.hermes/skills/agent-briefs-and-verification
```

## How to use it

There is nothing to run. A skill is a set of instructions the agent reads **when it is relevant** — you talk
to your agent the way you normally would and let it pick the skill up. Prompts that trigger the first skill:

- "Delegate this to a subagent, but write the brief properly first: file, line range, function name, and what
  it must not touch."
- "The subagent says it's done. Prove it before you tell me it works."
- "There are five defects here — run them as a queue, and stop the whole run if any item produces no diff."
- "It edited the file but the screen looks the same. Find out whether the change is even wired up."

Prompts that need the second skill too:

- "Hand this to Claude Code in a worktree and verify it."
- "My Claude plan ran out of tokens again — check the usage page and show me where the burn went."

What you should get back, instead of a promise: a written brief, a dispatch command with a turn budget, and
verification — the diff read back, the build or typecheck run, the artifact rebuilt, both viewports rendered,
the stored state checked.

Rule of thumb: use it when the task is bigger than a single-file edit and you want working code rather than a
description of it.

## What `agent-briefs-and-verification` covers

- **the economics**: cost is turns x context, not diff size — one measured pass burned ~70M tokens over 304
  turns for a few hundred lines;
- **brief anatomy**: coordinates on the first line, an internal tool-call budget, negative constraints, a
  bounded round count, two closing lists;
- **fencing the child's tools**: read/edit only, no shell, no git — plus the narrow permits to use when it must
  execute something;
- **queueing a defect list** with a gate per item, stopping the whole run on a no-diff or a failed build;
- **verification discipline**: rebuild before you shoot, prove stored state, grep that the new symbol is
  actually called, check which commit the green tick verified, committed vs pushed;
- **recovering a capped pass**: the edit may have landed anyway; two zero-diff passes mean the next edit is
  yours;
- **judgement**: options belong to the owner, "change" may mean "remove", brief a verified diagnosis.

`references/brief-template.md` is a copy-paste skeleton with two worked examples.

## What `external-agent-clis` covers

- choosing Claude Code / Codex / OpenCode / Grok Bot per task shape, and probing before dispatch;
- one-shot, tmux/PTY, PR review, parallel scored design rounds, and a child that renders its own pixels;
- `scripts/runclaude.mjs` — hard turn and time budget, `CLAUDE_ALLOWED_TOOLS`, and why it exits 0 even when it
  killed the child;
- plan limits: the usage page, the free reset, session vs week, and why fan-out does not buy throughput;
- driving `claude.ai/code` over CDP when no local CLI is available (`references/claude-web-session-cdp.md`).

## Keep it up to date

```bash
cd hermes-skills && git pull
cp -R agent-briefs-and-verification ~/.hermes/skills/
```

## Licence

MIT. See `LICENSE`.
