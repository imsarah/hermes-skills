# Brief template

Copy this, fill it in, and keep it under one screen. A brief longer than a page is usually two scopes.

## Skeleton

```
GOAL (one line, the user's own words):
<what the user asked for>

START EDITING ON YOUR FIRST TURN. Do not explore first.
- File: <abs path> — the only file you may modify.
- Scope: lines <N>–<M>, inside <function/component name> (line <L>).
- The helper/constant you need is <name> at line <L>.
- Read only what you need to make this change; do not read the whole repo.

CHANGES (numbered, each one an observable edit):
1. <exact edit — from what to what>
2. <exact edit>

MUST NOT (scope guard):
- Add new files, components, props, styles or copy.
- Touch git, package versions, lockfiles, generated files.
- Rename or reformat anything outside the lines above.
- If the goal is impossible without adding something, stop and report it — do not invent scope.

BUDGET:
- Finish within <8–12> tool calls.
- Make the edits before you explain anything.

DONE MEANS (evidence, not adjectives):
- <command that must pass>
- <artifact that must exist>

CLOSE WITH TWO LISTS:
1. done / done-differently / not-done-with-reason
2. problems deliberately left for the owner to decide
```

## Worked example — a code fix

```
GOAL: the phone layout hides the price. Show it under the title on mobile only.

START EDITING ON YOUR FIRST TURN. Do not explore first.
- File: /repo/src/components/ProductCard.tsx — the only file you may modify.
- Scope: the return block of ProductCard, lines 41–96.
- The formatter you need is formatPrice at /repo/src/lib/format.ts:12.

CHANGES:
1. Inside the mobile branch, render <span className="price">{formatPrice(product.price)}</span>
   directly under the <h3> title.
2. Keep the desktop branch exactly as it is.

MUST NOT: new component, new CSS file, new dependency; no tailwind class renames; no git.
BUDGET: 8 tool calls, edits before explanation.

DONE MEANS: `npx tsc --noEmit` passes; the phone screenshot at 390x844 shows the price under the title.

CLOSE WITH: 1) done / done-differently / not-done+reason  2) anything you left for the owner.
```

## Worked example — a visual fix you have already seen

The rule: describe what you saw in the pixels, not the mood.

```
GOAL: the desktop close-up puts the info panel over another object.

START EDITING ON YOUR FIRST TURN.
- File: /repo/src/render/layout.ts — only file.
- Scope: private layoutPanel() from line 812 to the closing brace at 948.
- Camera parameters live in CAM at line 60; the panel offset is PANEL_OFFSET_X at line 74.

CHANGES (only these two):
1. PANEL_OFFSET_X 1.8 -> 2.35 so the panel clears the object standing at z=3.1.
2. In the close-up branch, camera target y 1.55 -> 1.42 so the panel is fully in frame.

MUST NOT: move that object, add furniture, change lighting, touch any other builder —
this file has three other build* functions for other variants and they must render identically.

BUDGET: 6 tool calls.

DONE MEANS: `npm run build` passes; a 1440x900 screenshot shows nothing behind the panel
and no geometry crossing the right frame edge.

CLOSE WITH: the two lists.
```

All identifiers in this example are invented; substitute your own file, function and constant names.

## Why each line is there

- **Coordinates first** — the single change that took one task from 40 turns and an empty diff to 13 tool calls
  and a landed edit.
- **"Do not explore" alone does not work** — if the brief names a feature but not the function, the child greps
  until the budget dies. Name the function and its line.
- **MUST NOT in the same paragraph as the goal** — a child told to "fix X" adds a mechanism when X looks
  impossible; the prohibition has to travel with the instruction.
- **Budget before explanation** — the internal number is what makes it write early; the wrapper's cap only
  kills it late.
- **Two closing lists** — list 2 becomes the next brief, which is how a review converges without re-reading
  every file.
