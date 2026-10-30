# Running a headless pass that must build and render

## Give it the tools it needs

`scripts/runclaude.mjs` reads `CLAUDE_ALLOWED_TOOLS` and defaults to
`Read,Edit,Write,Grep,Glob`. Any task whose loop is "edit, then run something" — a Blender script, an
esbuild bundle, a Playwright shot, `tsc` — needs `Bash` in that list:

```
CLAUDE_ALLOWED_TOOLS=Read,Edit,Write,Grep,Glob,Bash node runclaude.mjs brief.txt <cwd> 45 50
```

Without it the child does not fail loudly: it writes the script, tries to run it, is asked for
approval it cannot obtain, and ends the run with a summary that sounds complete ("I've written the
generator and the preview script, but I can't run Blender"). The log shows a short run and an empty
output directory — check for produced artifacts, not the exit code.

## One pass per worktree

Killing the wrapper's `bash` process leaves its `node … runclaude.mjs` child alive. If you relaunch
into the same directory, two agents edit the same file with different instructions and the newer one
stops to report the conflict:

```
pgrep -af "claude" | grep -v hermes      # list strays
kill <pid> …                              # kill every one, wrapper and child
```

Then relaunch. Confirm afterwards with the log tail: `[done] exit=0 turns=38 seconds=104` means the
pass spent 38 turns and two minutes — plausible for one file, not for a whole queued task.

## Judge the artifacts, not the report

A pass reporting "done" has only proven it stopped. Before accepting: `git status --porcelain` for
which files changed, `git diff --stat` for how much, and the presence and timestamps of the renders or
bundles it was supposed to produce. A pass that changed four files and drew nothing did not do a
render-driven task no matter what its summary claims.
