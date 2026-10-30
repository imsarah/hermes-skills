# Reading the Claude plan limit, and resetting it

When a `claude -p` pass dies with `You've hit your session limit · resets 12pm (UTC)`
(and still exits 0), the authoritative numbers live on the plan's usage page in the
already-logged-in browser, not in the CLI error.

## Read the page over CDP

The browser that holds the Claude login listens on `127.0.0.1:9222`. Open the usage
page in its own tab and read it with the same Node `WebSocket` approach used for
`claude.ai/code` sessions:

```js
// claude-usage.mjs — node claude-usage.mjs
const CDP = 'http://127.0.0.1:9222';
const tab = await (await fetch(`${CDP}/json/new?${encodeURIComponent('https://claude.ai/settings/usage')}`, { method: 'PUT' })).json();
await new Promise((r) => setTimeout(r, 1200));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
// rpc(ws) helper: send {id, method, params} and resolve on the matching id
await send('Page.enable'); await send('Runtime.enable');
await new Promise((r) => setTimeout(r, 7000));  // the panel renders late
console.log((await send('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true })).result.result.value);
```

`document.body.innerText` taken too early returns only the sidebar (`Claude`, `Search`,
`New`, `Projects`…) — that is a render race, not a login problem. Wait ~7s, and read
the screenshot with vision if the text is still thin.

What the page states, in the form worth quoting back to the user:

- `Current session — NN% used` with `Resets <weekday> <time>`
- `This week — NN% used` with its own `Resets <weekday> <time>`
- `Limit resets` — whether a free reset is available, and its expiry date
- usage split by product (`Claude Code 99%`, `Chats 1%`) when the CLI did the burning

Quote the reset clock in the user's timezone **and** UTC; the page shows the browser's
local time, which is not necessarily theirs.

## The free reset is an account action

`Reset for free` on that page is a real entitlement. Ask before pressing it — it is not
a code fallback — then click by button text and re-read the page:

```js
await evalJs(`(() => {
  const el = [...document.querySelectorAll('button,[role="button"],a')]
    .find((b) => /reset for free/i.test((b.innerText || '').trim()));
  if (!el) return 'not found';
  el.scrollIntoView({ block: 'center' }); el.click(); return 'clicked';
})()`);
```

Success shows `No usage yet. 100% of your weekly limit is available.`, both meters at
0%, and `Limit resets — No resets right now`. A reset clears the session and weekly
meters but does **not** move the weekly cycle date; say so instead of implying the week
restarted.

Verify delegation is actually back with `claude -p 'reply with exactly: ok'` → `ok`
before re-dispatching a queued pass. A page that reads 0% while the CLI still refuses
means you are looking at a different account or a stale tab.

## While the limit is up

Spend the blocked window on everything that needs no tokens: open the branch/worktree
per queued pass, write each English brief to a file, keep the probe ready. After the
reset, dispatch the whole queue in one batch rather than re-deriving scope pass by pass.

## Where the tokens actually went (answer "why is it used up, I barely changed anything")

The CLI keeps every session's transcript under `~/.claude/projects/<slug>/<session>.jsonl`,
with a `usage` block on each assistant message. Summing it per session turns the user's
"you changed almost nothing" into numbers, which is the only satisfying answer:

```python
import json, glob, os, datetime, collections
files = glob.glob(os.path.expanduser('~/.claude/projects/*/*.jsonl'))
today = datetime.date.today()
for f in files:
    s = collections.Counter(); cwd = None; n = 0
    for line in open(f, errors='ignore'):
        try: m = json.loads(line)
        except: continue
        cwd = cwd or m.get('cwd')
        u = (m.get('message') or {}).get('usage') or m.get('usage')
        if not u: continue
        try: d = datetime.datetime.fromisoformat(m.get('timestamp', '').replace('Z', '+00:00')).date()
        except: d = today
        if d != today: continue
        n += 1
        s['out'] += u.get('output_tokens', 0); s['cr'] += u.get('cache_read_input_tokens', 0)
    if n: print(f"{os.path.basename(f)[:8]} turns={n:3d} out={s['out']:>8,} cache_read={s['cr']:>11,}  {(cwd or '?').split('/')[-1]}")
```

What it shows, and the mechanism to explain with it: **the limit is spent by turns x
context, not by the size of the diff.** Every tool call in a headless pass resends the
whole conversation, so a session that took 304 turns at ~230k context per turn accounts
for ~70M tokens while its final diff was a few hundred lines. Compare sessions side by
the side to find the runaway: a clean pass that rewrote 300+ lines finished in ~50 turns,
while another ran 300 turns and delivered a half-finished sweep — that ratio is a loop,
not difficulty.

Mitigations that follow directly, and are worth writing into the next brief:

- One file or one scope per session; a nine-file sweep with no per-file render is what
  turns into a loop.
- Tell the child **not** to run `build`/`tsc` itself — you run it once at the end. A child
  that builds after every edit spends most of its turns re-sending context to read the
  same errors.
- Bound the run with a turn budget instead of watching it: `scripts/runclaude.mjs <brief> <worktree> [maxTurns=6] [maxMinutes=8]` counts assistant turns from `--output-format stream-json --verbose` and kills the child at the budget. A brief that names the file, the function and the exact edit finishes in 1–2 turns, so a budget of 3–6 turns is generous for a scoped change; a pass that runs past it is a vague brief, and the fix is to rewrite the brief smaller, not to raise the number. Kill-and-rescope rather than waiting for the plan limit to kill it for you.
- Do not re-dispatch a superseded pass to "finish" the same work — the second run pays
  the full context cost of the first.

## Fan-out and the per-product split

Several `claude -p` processes dispatched at once do not multiply the work: they draw on
one account limit and stop together the moment it lands (three parallel passes died on
the same second, logging the identical line). Fan-out buys isolation between branches,
not throughput — say exactly that when the user asks whether running more terminals
means more capacity, and never present parallel processes as a way around the cap.

The usage page also splits the week by product (`Claude Code 99%`, `Chats 1%`), which is
the practical fallback: while Code is exhausted, a plain `https://claude.ai/new` chat
may still answer on its own meter. It is right for reviews, copy and spec checking and
wrong for repo work, because a chat session has no access to the machine — say which
one you are using so a report from the cheap meter is not mistaken for verified code.
Do not assume a **browser `claude.ai/code` session** is that fallback: it draws on the
same account session meter as the CLI, so dispatching a task there during an exhausted
window hits the same wall (a modal reading `Session limit reached · resets <clock>`) and
burns the attempt. Probe the CLI first, and treat any browser session as blocked until
the clock passes.

