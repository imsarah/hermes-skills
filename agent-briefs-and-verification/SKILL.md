---
name: agent-briefs-and-verification
description: "Use when delegating coding work to an agent and proving the result. Brief anatomy, tool fences, queue gates, verification discipline — works with Hermes subagents or any agent CLI, no vendor required."
version: 1.0.0
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [delegation, briefs, verification, subagents, review, quality]
---

# Agent briefs and verification

How to hand a bounded piece of work to another agent — a Hermes `delegate_task` child, a Claude Code or
Codex pass, a cloud session — and how to decide the work is actually done. Nothing here depends on a vendor
CLI or a particular stack: a PHP site, a Next.js app and a three.js scene fail the same way.

A copy-paste skeleton with two worked examples: `references/brief-template.md`.

## The economics: turns x context

Every turn of a delegated run resends the whole conversation, so cost grows with **turns**, not with the size
of the diff. A session measured at 304 turns and ~230k context per turn accounts for ~70M tokens while its
final diff was a few hundred lines; a comparable clean pass over 300+ rewritten lines finished in ~50 turns.
That ratio — not the task's size — is how you prove a pass looped.

Two consequences drive everything below: keep the turn count small (a brief precise enough to finish in 1–2
turns), and never let the child spend turns on work you can do once at the end (build, typecheck, test suite).

## Brief anatomy

1. **Goal in the user's own words**, one line. Only sub-questions that serve it — a brief that widens into
   "investigate and recommend everything" comes back long, correct and useless.
2. **Coordinates first**, before any explanation:

   ```
   START EDITING ON YOUR FIRST TURN.
   The only file is <abs path>. The only section is lines <N>–<M> (headed "<comment>").
   The helper you need is <fn> at line <L>. Do not modify anything else.
   ```

   A brief that names only a filename spends its whole budget grepping and dies at the cap with an empty
   `git diff`. Measured: same task went from 40 turns and an empty diff to 13 tool calls and a landed edit
   purely by naming the line ranges.
3. **Internal budget**: "finish both fixes within 12 tool calls", "make the edits before you explain
   anything". The wrapper's cap is what kills the child; the internal number is what makes it write early.
4. **Negative constraints in the same paragraph as the goal**: no new elements, no git, no version bumps, no
   regeneration; if the approved geometry makes the goal impossible, stop and report the blocker with options
   instead of inventing scope. Invented scope is a violation to revert, not an improvement to review.
5. **Definition of done as evidence**, not adjectives: which command must pass, which artifact must exist,
   which viewport must be rendered.
6. **Closing lists**: ask every pass to end with (a) done / done-differently / not-done-with-reason and
   (b) problems deliberately left for the owner. The second list is the next pass's brief — that is how a
   review converges without you re-reading every file.
7. **Round count in the brief**: "one pass then stop" or "max three rounds". Without a number, a fix request
   turns into an unrequested design loop.

## Fence the child's tools

Give it read/edit/search only, and keep execution out of its hands. Whichever mechanism your agent offers —
an `--allowedTools` list, per-tool approval, a sandbox profile — the shape is the same:

```
Read, Edit, Write, Grep, Glob        # reads and writes files
Bash                                 # executes anything: git, npm, rm, curl
```

With no execution, the child cannot commit, cannot delete, cannot install, and cannot spend its turns
re-reading a build log. You stay the only writer of git history and the only one who runs the checks.

When it genuinely must execute, permit exactly one thing rather than opening the shell: `Bash(npm test)`,
`Bash(python3:*)`, or a path-scoped binary rule like `Bash(/opt/blender/blender:*)`. Give it the renderer and
it can close a visual loop itself; give it the whole shell and it will loop on `npm install`.

**Empty output plus a clean exit is a permission wall, not a slow run.** A child told to run something it is
not allowed to run writes the script, gets asked for approval it cannot obtain, and summarises as if finished.
Probe the binary yourself, and treat an empty output directory as the failure signal.

## One scope per pass

One file or one scope. A nine-file sweep with no per-file verification is what turns into a loop. Two writers
on one file collide: the second reports the file changed under it and refuses, or lands a duplicate
block-scoped declaration — serialise the work or give each pass a different file.

## Queue a defect list instead of re-deriving scope

When the user hands over N independent defects, drive a queue: a JSON file of `{id, title, brief}`, a loop
that runs one pass per item, and a state file so a re-run skips what is done. The gates are the point — after
each item require, in order:

1. a non-empty `git diff`,
2. the repo's own compile/typecheck,
3. regeneration of any derived artifacts,
4. the render or the test that proves the item.

Stop the **entire** run on any of: no diff, compile failure, unbuildable artifact, or a plan-limit string in
the log. A queue that continues past a no-diff item silently re-runs the same useless pass on every remaining
defect; one that continues past a compile failure buries the first break under later work.

A verification step that always renders the same variant verifies nothing: before trusting a sheet, render two
cases that must differ (two configurations, two locales) and confirm they do.

## Verification discipline

The child's "done" is a claim, not evidence.

- **Read the diff, rebuild, run the checks, look at the image.** Then say which parts you verified and which
  you did not.
- **Verification artifacts are not the source you edited.** A bundled or served build (`public/`, `dist/`, a
  generated CSS file) keeps the pre-edit code until rebuilt, so a screenshot after a landed edit can show the
  old state and read as "the change did nothing". Rebuild before every verification shot.
- **Prove stored state, not the screen.** Read the persistence layer (`localStorage`, the DB row) and test with
  a setting that cannot be visually hidden — a saved value proved nothing while an overlay covered its effect.
- **Check the symbol is actually used.** A pass can import the module the brief named, declare every requested
  constant and reference none of them: non-empty diff, clean typecheck, unchanged render. Grep each symbol and
  read its call sites before shooting the frame.
- **A pixel-identical render means you edited code the running composition never executes.** Count the
  builders in a large file and match them to the flag that is actually rendering, instead of nudging the same
  wrong function three times.
- **Identify the subject before diagnosing it.** A close-up captioned "this is the one" framed the wrong object
  while the intended one stood further back. When two objects look alike, log the state the component built, or
  give the subject a colour that cannot occur in the palette — one rebuild answers it.
- **A green check on the wrong commit verifies nothing.** After merging a child's branch: `git fetch origin
  <branch> && git merge --ff-only FETCH_HEAD && git log --oneline -1` must print the merge commit before you
  run the check, then grep the changed identifiers — a compiler cannot see an enum removed from the type but
  still listed in the runtime option array.
- **"Committed" and "pushed" are different claims.** Confirm with `git ls-remote --heads origin` and compare
  the SHA. Make the new remote SHA a condition of completion: a run that reports success with images and a
  passing test count but no new remote SHA delivered nothing durable.
- **Check whether the feature already exists on another branch** before briefing a build of it:
  `git grep -il "<UI string>" $(git branch --format='%(refname:short)')`. An unmerged branch routinely carries
  the finished screen, or the design note listing each defect, that the default branch does not show.
- **A route your own pass created that returns 500 is "not done"**, not a rendering problem:
  `curl -s -o /dev/null -w "%{http_code}"` it before spending turns screenshotting.

## Recovering a capped or duplicated pass

- The wrapper can kill the child mid-edit and the edit still lands. Reconcile **before** re-dispatching:
  `git diff --stat`, read it, and if it is the intended change, check, render, commit.
- A re-dispatched pass that reports "the file changed under me" is evidence the earlier pass landed, not a
  failure to retry.
- Probe the **agent binary**, not just the wrapper: a killed wrapper leaves a grandchild alive and still
  editing, and the next pass then refuses because a sibling holds the file. That early refusal is the symptom
  of an orphan, not of a bad brief.
- **Two zero-diff passes on a fully specified brief means the next edit is yours.** Make it, run the checks,
  render, and report the split — "two passes landed the structure, I made the last three fixes" — rather than
  implying a pass did work it did not.
- A completion notification can arrive for work already superseded by a later pass. Check branch HEAD and file
  contents before acting on the gap it reports.
- An empty log in the first minutes is normal, not a hang: a pass on an unfamiliar repo reads before writing.
  Check elapsed time (`ps -o pid,etime,cmd -p <pid>`) before killing and re-dispatching.
- An unattended run cannot clear an approval prompt. With nobody watching, any command that trips a gate does
  not run at all and takes every later step in the same call with it. Keep shell calls to one short action and
  prefer file-write/patch tools so a queue keeps moving.

## Judgement belongs to the owner

- When two or more options are on the table, render them, state each trade-off, and wait. Never pick "the
  better one" for the user, and never let the child pick.
- "Change this option" can mean retire it: confirm fix-vs-remove in one line before dispatching — a removal
  touches every user-facing list, keeps the value in the type as a deprecated alias, coerces on load, and
  labels the replacement.
- User numbering refers to the list *you* presented. Restate the mapping before briefing.
- When the user names the cause themselves ("the grey floor is the lighting"), implement their mechanism first
  and escalate only if it visibly fails.
- Brief a diagnosis you verified, never the symptom you inferred. Quote the evidence you hold; label
  assumptions as assumptions.
- A follow-up brief written before the previous pass finished describes a version that no longer exists.
  Render first, then write the follow-up, and mark what is now right as untouchable.
- The child's honest gap list ("this cannot be verified here") is a work queue, not a verdict. Fix it or say
  plainly why not.

## Pitfalls

- **An old issue body is a hypothesis, not a specification.** Verify each claim against the current source
  before implementing; close the item naming the premises that turned out false.
- **A reviewer's prescribed sequence is not a verified procedure.** Ask it for findings, not repairs, and check
  that step A is even possible on that platform before writing it into a document.
- **A delegated "improve this" pass can come back worse than the state it replaced.** Keep the pre-pass render
  and its commit; when the new frames are worse, `git checkout <pre-pass-sha> -- <file>` rather than iterating
  on top of a regression.
- **Do not hand a child an unfinished artifact and ask for a verdict.** A proportion blockout with no materials
  and a distant camera earns "trash" and tells you nothing: say what it deliberately omits and ask a question
  it can answer (silhouette, part split), or show two finished-looking variants.
- **`pkill -f <pattern>` matches the shell that runs it.** Kill explicit PIDs, and probe with a bracketed
  pattern that cannot match itself (`pgrep -af "qa[.]js"`).
- **A slow machine is often a hung child, not a busy one.** Read elapsed time and RSS, kill the whole chain
  (loop → timeout → node → browser), then report the `free -h` delta.
- **A pass you did not start belongs to someone else.** Attribute it before reading, editing or killing:
  another session, profile or room may own it. Snapshot the working artifacts before a second pass anywhere.
- **A verification script that hangs is usually an API argument order, not a slow page.** Playwright's
  `page.waitForFunction(fn, arg, options)` takes the options object **third**: passing `{timeout: 180000}`
  second makes it the page-function argument, the default 30 s applies, and a 45 s first compile returns
  `TimeoutError` on a page that was working.
- **A local static server is one more thing that dies between shots.** When the harness page loads its bundle
  with a relative `<script src>` and fetches nothing itself, drive it straight off disk
  (`file:///abs/path/page.html`, Chromium launched with `--allow-file-access-from-files`) instead of running
  `http.server` — a server that exits mid-run comes back as `ERR_CONNECTION_REFUSED` halfway through a sheet.
- **A delegated audit inherits whatever branch the tree is on**, not the branch named in your brief. Pin the
  baseline: make it print `git rev-parse --abbrev-ref HEAD`, or hand it a worktree created at the exact commit,
  and require the audited HEAD in its report. If it returns the wrong commit, diff the files its findings cite
  between that HEAD and the target — unchanged files mean the findings still stand.
- **Never let a document claim more review than it received.** If the reviews were done by AI systems rather
  than named humans or a security team, the credits must say so, and every measurement claim must be traceable
  to a host plus a command that can be reproduced.
- **A one-file fix must not wait behind a busy agent.** Take it yourself on a fresh branch, run the checks, push
  the branch, and say which parts you made by hand.
