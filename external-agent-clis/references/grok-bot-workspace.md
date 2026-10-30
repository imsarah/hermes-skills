# Handing the same discipline to Grok Bot

Grok Bot is not a chat wrapper: it runs on a persistent cloud computer with a browser, a shell and a
`/workspace` directory, so a Bot can actually edit a repo — which means every rule in this skill about
bounding a child agent applies to it too. Facts below are from the official docs, last updated 22 Oct 2026:

- `https://docs.x.ai/grok-bot/computer-and-apps`
- `https://docs.x.ai/grok-bot/approvals-security-and-privacy`

## What it actually has

- **One cloud computer per account, shared by every Bot** — browser cookies, signed-in sessions, files and
  command-line credentials are common to all of them. Each Bot gets its own screen, but screens are work
  surfaces, not security boundaries. Anything you would not let a second Bot read must not go in
  `/workspace`.
- **Local execution is separate and off by default**: Settings → General → Agent → Execution on Local
  Computer, with a policy of *Ask every time* / *Always allow* / *Never allow*. That policy is independent
  of the approvals that govern the cloud computer.
- **Skills exist**: `/` in the composer references a saved skill, `@` attaches an app. So this skill can be
  installed as a Bot skill instead of pasted into instructions.
- **Unattended runs lose approvals**: a card from a routine, a trigger or another Bot expires after about
  10 minutes and the action does not run. A queue that needs a click per item cannot run alone.

## What maps, and what does not

| Here (Claude Code, headless) | Grok Bot |
|---|---|
| `scripts/runclaude.mjs` turn cap | no equivalent counter — bound the task with an explicit "one pass, then stop" and a time window |
| `--allowedTools` fence (no `Bash`, no `git`) | Auto-review rules ("Ask first before `git push`") plus a request-level boundary |
| plan limits / usage page | Grok's own limits; the same rule applies — say the number, not "it's used up" |
| brief with file + line range | identical, and equally necessary |
| verify the diff, the build, the pixels yourself | identical |

## Brief shape for a Bot

The Bot has a computer, so it will happily build the habit of exploring first. Write the same opening the
Claude brief uses, and add the workspace path:

```
Work only in /workspace/<repo>, on branch <branch>. Read only src/<file>.tsx lines <N>-<M>.
Make the edit before you explain anything. Budget: 12 tool calls, then stop and report.
Do not run git push, do not install packages, do not touch <files>.
Finish with: files changed, what you verified, what you could not verify.
```

Two Grok-specific additions:

1. **Name the boundary the Bot cannot cross on its own.** "Do not push, do not deploy, do not message
   anyone" — the docs' own example of a good boundary is *show current value, proposed value, impact, then
   ask*. A Bot with a shared computer and shared credentials will otherwise use them.
2. **Ask it to write its report to a file** (`/workspace/<repo>/report.md`) as well as the chat. Chat output
   is where long answers get truncated, and the file survives the session.

## What to verify when it says it is done

Same standard as anywhere else: `git -C /workspace/<repo> status --short`, `git diff --stat`, the project's
own compile check, then look at the artifact yourself. A Bot reporting "updated and tested" is a claim made
by the same model that made the edit; the file on disk is the only evidence. If the Bot's work started
without you and the approval expired, it may have stopped silently — check for a half-finished edit before
re-dispatching.
