# Hermes 技能包

[![English](https://img.shields.io/badge/English-switch-d0d7de?style=flat-square)](README.md) [![廣東話](https://img.shields.io/badge/%E5%BB%A3%E6%9D%B1%E8%A9%B1-selected-2f81f7?style=flat-square)](#)

寫畀 [Hermes Agent](https://hermes-agent.nousresearch.com/docs) 用嘅純 Markdown 技能包。每個資料夾就係
一個 skill：一個有 YAML frontmatter 嘅 `SKILL.md`，加幾個佢會引用嘅 `references/`、`scripts/`、
`templates/`。冇 plugin、冇 build step，就係一堆 agent 會讀嘅檔案。

入面有兩個 skill，而**第一個唔需要你有任何外部 agent 都用得**：

- **`agent-briefs-and-verification`** — 點派工作、點證明做完。用 Hermes 自己嘅 `delegate_task` 子代理都
  得，任何 model、任何 stack（Next.js、PHP、three.js 中招方式一模一樣）。唔需要 Claude Code、唔需要
  Codex 帳號、冇嘢要裝。
- **`external-agent-clis`** — 選配。派工畀 Claude Code、Codex、OpenCode 或者 `claude.ai` 網頁 session 嘅
  操作細節：探測、turn 上限 wrapper、plan 用量。

## 安裝

```bash
git clone https://github.com/imsarah/hermes-skills.git

# 通用嗰個 —— 只裝呢個都已經有用
cp -R hermes-skills/agent-briefs-and-verification ~/.hermes/skills/

# 選配：只有會派工畀 Claude Code / Codex / OpenCode 才需要
cp -R hermes-skills/external-agent-clis ~/.hermes/skills/
```

裝完就係咁多。跟住**開一個新嘅 Hermes session**（skill 係 session 開始時載入）；如果 session 已經行緊，
就叫 agent：

```
skill_view(name="agent-briefs-and-verification")
```

想只裝畀某一個 profile，就 copy 去 `~/.hermes/profiles/<profile>/skills/`。確認裝好：

```bash
ls ~/.hermes/skills/agent-briefs-and-verification
```

## 點用

冇嘢要跑。個 skill 係一段**相關嘅時候 agent 自己會讀**嘅指示。你照平時咁同 agent 講嘢就得，佢會自己揀返。
會觸發第一個 skill 嘅講法：

- 「派畀子代理做，但先寫好份 brief：檔案、行數範圍、function 名，同埋唔准碰乜。」
- 「個 agent 話做好咗。你證明畀我睇先至好同我講完工。」
- 「有五個 defect，逐個排隊做；任何一項出唔到 diff 就即刻停成個 run。」
- 「佢改咗個檔但畫面一模一樣。查下個改動究竟有冇接上去。」

要埋第二個 skill 嘅講法：

- 「將呢個交畀 Claude Code 喺 worktree 做，做完你自己驗證。」
- 「我 Claude plan 又爆 quota，睇下用量頁，話我知啲 token 燒去邊。」

正常應該收到嘅，唔係一句「搞掂」：一份寫好嘅 brief、一條有 turn 上限嘅指令，同埋驗證——讀返個 diff、
跑 build 或者 typecheck、重新 rebuild 過個 artifact、兩個 viewport 都 render 過、查返實際儲存嘅狀態。

幾時用：個任務大過改一個檔案，而你想要**行得嘅代碼**，唔係一段描述。

## `agent-briefs-and-verification` 包啲咩

- **成本原理**：燒錢係 turns × context，唔係 diff 大細——有一次 304 turns 燒咗約 70M tokens，最後 diff
  只有幾百行；
- **brief 結構**：第一行寫死座標、內部 tool-call 預算、反面約束、限定回合數、結尾兩張清單；
- **限制子代理嘅工具**：只准讀同改，唔准開 shell、唔准掂 git，同埋真係要執行程式時嘅窄權限寫法；
- **缺陷清單排隊**：逐項有閘，冇 diff 或者 build 唔過就停成個 run；
- **驗證紀律**：截圖前先 rebuild、查真實儲存狀態、grep 返新 symbol 有冇真係被叫用、睇清楚綠燈驗嘅係邊個
  commit、committed 同 pushed 係兩件事；
- **收尾救火**：被 cap 殺咗嘅 pass 可能已經改好；同一個 brief 兩次 zero-diff 就自己動手；
- **判斷權**：揀邊個方案係用家嘅事、「改」可能係「刪」、brief 要寫你驗證過嘅病因。

`references/brief-template.md` 係可以直接 copy 嘅骨架，加兩個實例。

## `external-agent-clis` 包啲咩

- 按任務形狀揀 Claude Code / Codex / OpenCode / Grok Bot，派工前先探測；
- one-shot、tmux/PTY、PR review、平行評分設計回合，同埋會自己 render 自己睇圖嘅子代理；
- `scripts/runclaude.mjs`——硬性 turn 同時間上限、`CLAUDE_ALLOWED_TOOLS`，同埋點解佢殺咗 child 都仍然
  exit 0；
- plan 用量：用量頁、免費 reset、session window 同每星期嘅分別、點解開多幾個 terminal 唔會快啲；
- 冇本地 CLI 時用 CDP 操作 `claude.ai/code`（`references/claude-web-session-cdp.md`）。

## 保持更新

```bash
cd hermes-skills && git pull
cp -R agent-briefs-and-verification ~/.hermes/skills/
```

## 授權

MIT，見 `LICENSE`。
