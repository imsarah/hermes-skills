# Driving a browser-hosted Claude Code session over CDP

Use when the agent's session is a web UI (claude.ai/code/...) inside a local browser container, not a CLI you can pipe to.

## Attach to the right tab

```bash
curl -s http://127.0.0.1:9222/json/list   # find the tab whose url contains the session id
```

Do not assume a single page target. Filter on `type == "page"` **and** the session id; the active tab is often a different chat.

Keep that filter parameterized in your driver. A helper written for opening a *new* session matches `x.url === 'https://claude.ai/code'`, which stops matching the moment that tab navigates to `/session_<uuid>` — the follow-up call then prints `NO_TARGET` and looks like the tab vanished. Match `x.url.includes(SESSION_ID)` for anything sent into an existing conversation, and reuse the one session for a review → fix → re-review loop instead of opening a new one per round.

## Runtime: use node's built-in WebSocket

A helper script run as bare `python3 helper.py` can fail with `ModuleNotFoundError: websockets` because the system interpreter is not the Hermes one. Two reliable options:

- Run from `execute_code` and invoke `sys.executable`, which has the dependency.
- Or skip Python entirely and use `node -e` with the global `WebSocket` (Node 22+):

```js
fetch('http://127.0.0.1:9222/json/list').then(r=>r.json()).then(ts=>{
  const t = ts.find(x => x.url.includes('session_ID'));
  const w = new WebSocket(t.webSocketDebuggerUrl);
  w.onopen = () => w.send(JSON.stringify({id:1, method:'Runtime.evaluate',
    params:{expression:'document.body.innerText.slice(-12000)', returnByValue:true}}));
  w.onmessage = e => { const d = JSON.parse(e.data); if (d.id===1) { console.log(d.result.result.value); w.close(); } };
});
```

## Read the transcript

- `document.body.innerText.slice(-N)` returns the visible tail: status line, tool calls, the agent's final message, and the outputs list.
- The transcript is lazy-loaded. Old messages are behind "Load earlier messages"; the tail is enough for current-state questions.
- Detect run state from the text, e.g. `Claude is responding` / `Working…` vs `Claude finished the response`. Do not infer completion from the last visible paragraph alone.
- Messages the user just sent render without a `You said:` prefix; an unsent draft also appears near the composer. Check the composer before concluding a message was delivered.
- `Runtime.evaluate` can hang forever — the socket stays open and no reply ever arrives — while the page renders or the renderer is stuck. Do not answer that with longer timeouts. Send `Page.reload`, wait ~15s, then poll a cheap expression (`document.querySelectorAll('img').length`, a short `innerText` slice) until content returns. A reload of a `claude.ai/code/...` URL may land on the session *list* instead of the open conversation: confirm the conversation title is on screen, or navigate to the session URL again, before extracting anything — otherwise you conclude the work vanished.

## Send a prompt

1. Read `document.querySelector('[contenteditable=true][role=textbox]')` first. **Abort if it already has text** — that is the user's half-typed message.
2. **Never build a long prompt inline in a shell string.** Apostrophes, backticks and `$` in the text silently truncate or break the command (a possessive like `Sam's` ends a single-quoted `node -e '...'` and the rest is executed as shell). Write the prompt to a file, read it in the driver, and inject it with `json.dumps(prompt)` / `JSON.stringify(prompt)`.
3. Insert with `execCommand('insertText', ...)`; setting `innerText` does not update React state. CDP `Input.insertText` is no better in this composer: it returns without error and the field stays empty, so a run that only dispatches Enter afterwards sends nothing and the page keeps looking like a fresh session. Focus the composer, collapse the selection to the end, type through `document.execCommand('insertText', false, text)`, and read the composer's `innerText` back before pressing Enter.
4. Dispatch `Input.dispatchKeyEvent` `keyDown` then `keyUp` with `key/code = 'Enter'`, `windowsVirtualKeyCode: 13`.
5. Verify all three: the composer is empty again, the transcript got longer, and the status line reads `Working` / `Claude is responding`. A filled composer is not a sent message, and a cleared composer alone is no better — React clears the draft on a failed submit too. Send Enter as `keyDown` then `keyUp` with `nativeVirtualKeyCode: 13` as well as `windowsVirtualKeyCode: 13`; some builds ignore the event without it.
6. The driver helper file you used last session is often gone — scratch is pruned and the path may not exist now. Re-create the driver or drive websockets directly; do not assume a saved helper is still on disk.

## Answer the agent's own multiple-choice question

The agent sometimes stops and asks the user to pick with a form instead of guessing. Submit rather than describing the choice in prose:

1. Options are `button.epitaxy-answer-option`; match on `innerText.startsWith('<option label>')`.
2. A synthetic `.click()` on the option followed by `.click()` on the `Submit` button works; check `Submit.disabled === false` first.
3. After submitting, confirm the form is dismissed and the status line moved to `Claude is responding`. Only then report the decision as delivered.

Treat these forms as genuine product decisions — take the user's answer, never pick a recommended option on their behalf.


## Download the produced artifacts

Outputs are React props, not plain links:

1. Find `button[title="FILENAME"]` in the outputs list.
2. Walk up `__reactFiber` ~18 levels looking for `memoizedProps.href` **or** `memoizedProps.downloadUrl` — the key differs between versions and between attachments.
3. `fetch` the URL inside the page, read as a `FileReader` data URL, return base64, and write it locally, then open it with vision.

If the fetch 401s or the attachment is gone, request a fresh reattach; do not present an old screenshot as current.

Some passes surface their outputs as a plain file list: the rows hold no `<img>`, no reachable `downloadUrl` in the fiber chain, and their CSS coordinates can sit outside the visible window (`innerWidth` wider than the window), so both synthetic `.click()` and `click_at_xy` miss. Do not spend calls reverse-engineering that panel — send a retrieval-only message naming the files and asking for them inline, then read the resulting `img` nodes.

A filename list in the message is not an attachment. Check `document.querySelectorAll('img').length` after expanding any "Load the rest of this message"/"Show more" control: if there is no `<img>` whose src contains `/files/`, the agent never attached the images, however confidently it describes them. Reply with a retrieval-only request naming the missing files, forbidding re-renders, new passes and test reruns, and state that a filename list is not acceptable. Keep the work blocked until real images exist — do not substitute the agent's prose for visual evidence.

Confirm scope cheaply while you are in the repo: `git diff --stat <previous> <new>` shows whether the pass touched only the files the brief allowed (a Landing fix that also edits shared character, clothing or animator code is a scope violation even when the diff is small).

Images the agent posted **inside a message** are not in the outputs list and have no `downloadUrl`. Collect them from `document.querySelectorAll('img')` and match `alt` to the filename; their `src` is `https://claude.ai/api/<session-uuid>/files/<file-uuid>/preview` and it fetches fine from inside the page. The outputs list also lags behind the newest message — an old set of filenames there is not proof the new renders do not exist.

When an agent posts many rounds of the same two screenshots, the `alt` text repeats (`phone.png`, `desktop.png` once per round), so saving by `alt` silently overwrites: ten attachments become two files and the earlier rounds are lost before you ever look at them. Enumerate the `img` nodes in DOM order, assign your own positional names (`A_r2_phone`, `A_r3_phone`, ...) from the ordering the agent stated, and assert `len(files) == len(imgs)` before reviewing.

Rounds run as parallel sub-agents appear under a "Background tasks" heading with a running duration, and finish as "Completed task". To decide whether the whole batch is done, read that list rather than the chat tail: the main thread goes to `finished the response` while its background tasks are still running.

Comparison strips the agent builds (several time-steps side by side) are too small to judge at full width. Crop each panel with PIL and upscale before reviewing, and check every panel rather than the one that looks best.

## Start a new session (rather than posting into the running one)

When the task is unrelated to the open conversation, or the user says "new conversation", do not append to the current transcript — its branch choice and prior context bias the answer.

1. `Target.createTarget` with `url: https://claude.ai/code` on the browser-level websocket (`/json/version`), then re-list `/json/list` and pick the page whose url ends in `/code`. The sidebar `+ New` is unreliable: a synthetic `.click()` matched on its label can leave you in the dead session you were trying to escape (the header still shows the old title and `This session can't continue`), and typing then goes nowhere. Navigate the tab to `https://claude.ai/code` or mouse-press/release (`Input.dispatchMouseEvent`) at the button's measured centre, then confirm the header reads `New session` before typing.
2. The page shows a repo chip (`aria-label="Add repository"`) and a branch chip (`aria-label="Branch: …"`). The repo picker is a text list: locate the leaf element whose `textContent` is exactly `imsarah/<repo>` and click its closest `button/[role=option]/[role=menuitem]` with `.click()` — synthetic mouse events at the measured coordinates often land on a text node and do nothing.
3. Do not fight the branch picker: a just-pushed branch may be missing from its list even through the `Search branches…` input (setting `.value` via the native setter + `input` event works, but the list can stay empty). Start the session on the repo's default branch and put `git fetch origin && git checkout <branch>` as the first instruction of the prompt. Same result, far fewer calls.
4. Type the prompt into the contenteditable composer (see the send recipe above), press Enter, and confirm the URL changed to a new `/session_<uuid>` — that is the proof a fresh conversation started, not just a queued message.
5. Record the new session id and point the monitor at pages whose url contains it; the old poller watches the old id and will never fire.

## Close a review → fix → re-review loop in the same session

After you apply a reviewer's findings, send the re-review back into the same session rather than a new one: it still holds the diff context and costs one short turn.

- Name the commit and the exact changed behaviour, then ask it to **confirm or refute** a numbered list ("(1) the retry now fires on the real error, (2) no path applies a write twice, (3) anything else wrong"), capped at ~150 words, findings only, no edits.
- A numbered list is what makes the second pass cheap and checkable; an open "review again" comes back as a fresh opinion instead of a verdict on your fix.
- Do not apply a child's finding blind: reproduce it first (a dead-host or fault-injected run), then fix, then let it re-confirm. A reviewer's plausibility is not evidence that its claim holds in this version of the library.

## Monitor a long pass to completion

When the user says "watch it and tell me when it is done", do not poll by hand in the chat loop. Write one poller that exits on a real completion signal and run it as a tracked background process with notification.

Completion is two conditions, not one: the pass is **not running** (no `running`, `Claude is responding`, `Working…` in the tail and the composer is empty) **and** `git ls-remote --heads origin <branch>` reports a SHA different from the one you recorded before the pass. Either alone lies — the agent finishes a paragraph mid-run, and it commits inside its container long before it pushes. Do not key the poller on one exact phrase such as `Claude finished the response`: the wording is version- and locale-dependent and often never renders, so the poller runs out its iteration budget while the answer is already on screen. Probe a boolean (`/running|Working|Claude is responding/i.test(innerText)`) plus composer emptiness, and also stop when `innerText` length has stopped changing.

```js
// sketch: every 45s, exit 0 only when both conditions hold
const h = execSync(`git ls-remote --heads origin ${BRANCH}`, {cwd: REPO}).toString().trim();
if (state === 'finished' && !h.startsWith(BASELINE_SHA)) { console.log('DONE ' + h); process.exit(0); }
```

Run `node poller.mjs` **directly** as the background command. Wrapping it as `nohup node poller.mjs &` makes the tracked process the wrapper shell, which exits immediately, so the completion notification fires the moment you start it and every later poll is noise. Print only state changes, cap the loop with an iteration budget, and exit non-zero on timeout so a silent stall still notifies.

Watch **every branch the pass can touch**, not just the main one. A scored-loop run spreads its work over one branch per direction, so a poller that reads only the main branch never sees the change and times out while the work is finished. Poll all of them, treat "any SHA differs from its baseline" as the change signal, and report which branch moved.

Stop or restart the poller by PID (`kill $(cat poller.pid)`), never `pkill -f poller.mjs`: the broad pattern also matches Hermes's own process tree, so the call is raised as a self-termination approval prompt and blocks the turn until the user answers. Record the PID when you launch it and reuse that file.

## Variants share one file, so demand a regression check

When several design directions live behind one scene parameter in the same source file, a pass aimed at one direction can leak into the others. Ask for a render check of every other variant at both viewports after each round and treat a changed sibling as a defect, not a side effect.

## Present options, do not choose

When the agent produces alternative designs (composition A/B, layout variants), download every option, review each one yourself, say which you would pick and why, and then stop for the user's choice. Do not forward the agent's own preference. If the user rejects both, stop and ask for direction rather than iterating on a third variant nobody asked for.

## Recover the browser container when keyboard input dies

When the user drives the same Chrome themselves and reports that typing produces nothing, restart the container instead of hunting for a CDP workaround:

1. Find it: `printf 'docker ps --format "{{.Names}} | {{.Ports}}"\n' | newgrp docker` — the container publishing `9222->9222` is the agent's browser (the docker group is not in the session's active groups, so the `newgrp` wrapper is required).
2. `printf 'docker restart <name>\n' | newgrp docker`.
3. Poll `http://127.0.0.1:9222/json/version` until it answers (a few seconds to a minute), then reopen each session tab with `Target.createTarget` — a restart loses every tab, including the conversation the user was in.
4. Verify the input path before claiming a fix: wait until `document.querySelectorAll('[contenteditable=true]').length > 0` (the page shows "Loading" before that), focus the composer, `Input.insertText` a short marker, read `innerText`, then clear it with a range selection + `execCommand('delete')`.
5. Tell the user to reload their own control page (noVNC-style viewers hold the dead session) and that any draft they had typed in the composer is gone.

## Fix the cloud environment (network, env vars, setup script)

When the agent reports it cannot install dependencies, cannot reach an API, or has no `gh` auth, suspect the session's environment before the agent. An `Environment` button opens **Edit cloud environment**: name, network access (e.g. `Limited`), allowed domains, allow-package-managers, network secrets, setup script, environment variables, `Save changes`.

- Locate the big fields by **placeholder**, not order: allowed domains carries `example.com\nanthropic.com`; environment variables carries `NODE_ENV=production\nGIT_AUTHOR_NAME=…`.
- Set them with the native setter (`Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set`) plus an `input` event, then click `Save changes` and confirm the modal closed. A plain `.value = …` leaves React state stale and the old text is what gets saved.
- Allowed domains are hostnames only — a database host fragment pasted into that box blocks nothing and reads as configuration. Replace with the real set (`github.com`, `api.github.com`, `codeload.github.com`, `raw.githubusercontent.com`, `objects.githubusercontent.com`, `registry.npmjs.org`, `nodejs.org`, `binaries.prisma.sh`).
- Check the **variable name**, not just that a secret exists: a GitHub token saved as `key=ghp_…` is an invalid identifier, so `gh` still reports no auth. Rewrite that line in-page to `GH_TOKEN=<same value>` and never print the value into the transcript.
- A fatal setup script is the usual reason a cloud session never starts: `set -e` plus `npm ci` fails inside the container and the session shows `Setup script failed` / `This session can't continue` before the agent runs anything. Make it non-fatal instead of deleting it — `npm ci --no-audit --no-fund || npm install --no-audit --no-fund || echo "deps not installed"` — then prove it with a throwaway session whose only prompt is `Reply with exactly: setup ok`. Otherwise leave the setup script empty unless the user accepts the cost: `npm ci` there makes every new session wait a minute or two before the agent can run any check. State the trade-off and let them choose. A setup-script or env change only reaches sessions created **after** the save — the running session keeps the environment it started with, so tell the user which session needs to be recreated before the fix is visible.
- The `Environment` accordion does **not** reopen the editor. The edit control is `button[aria-label="Edit cloud environment"]`, injected into the DOM only while the environment row is hovered — dispatch `Input.dispatchMouseEvent {type:'mouseMoved'}` over the chip's coordinates first, then query for that aria-label. Clicking the row, its name (`Default`), or the accordion header instead just expands and collapses a read-only summary, which reads as "the panel is gone".
- Verify a save by reopening the editor and reading back **structure only** — `textarea.value.split('\n').length` for domains, the `KEY=` names for env vars, the host part of any URL. Printing the whole value leaks a token into the transcript for no diagnostic gain.
- **Never put production credentials in this environment.** The form states the values are visible to anyone using the environment, and the agent you are pointing at it is autonomous: a live pooled `DATABASE_URL` lets it run migrations or writes against production. Point `DATABASE_URL`/`DIRECT_URL` at a disposable localhost value (the repo's own `.env.example` dev URL is enough for `prisma generate` and `next build`) and say plainly why you declined to paste the production URL, offering to change it if they really want live data.

## Document review in a plain claude.ai chat (not /code)

For "ask Claude what it thinks of this" — a playbook, spec or draft — use an ordinary chat (`https://claude.ai/new`). It has no repo chip and no branch picker, so none of the session-start dance applies, and it accepts a long pasted document.

1. Composer is `div[contenteditable="true"]` (plain chat) rather than `[role=textbox]`. Focus it, then `document.execCommand('insertText', false, JSON.parse(<text>))`. When driving from Python, pass the payload as `json.dumps(json.dumps(text))` — the outer encoding makes it a valid JS string literal inside the expression, the inner one makes it valid JSON.
2. Send with keydown/keypress/keyup `Enter` dispatched on the composer element. **Proof of send is the URL**: it changes to `https://claude.ai/chat/<uuid>`; a populated composer is not proof, and either can be stale from a previous attempt.
3. Detect completion by **size, not phrasing**: `(document.querySelector('main')||document.body).innerText.length` jumps by several thousand characters when the answer lands, and the streaming control is a button whose `aria-label` matches `/stop/i`. Poll both; the text length alone is enough once it stops changing.
4. Extract by slicing, not by DOM selectors: the transcript's `innerText` starts with the *echo of your own prompt*, so take `t.slice(t.lastIndexOf('Claude responded:') + 12)`. Long answers exceed one print — read in two slices or the tail shows only the middle.
5. `data-testid="chat-message"` is not present in every build; a selector-based message count returns 0 while the answer is plainly on screen. Do not conclude the send failed from a zero count.

Send the document in the same message as the question ("review X, findings only, under N words") — a chat that has to fetch a URL first will often refuse or give a shallower read. For a second round, post into the *same* chat: paste the revised version and name what changed plus what you could not verify, and it will check the deltas rather than re-deriving the whole review.

## Limits

- Session-local artifacts live in the agent's container (e.g. `/tmp/claude-0/...`) and are unreachable from the host. Only outputs surfaced in the UI are downloadable.
- A local commit in that container is not on GitHub. Verify with `git ls-remote --heads origin` before telling the user work is published.
- Reading the session is not verifying the work: still review the diff and render the result yourself.
