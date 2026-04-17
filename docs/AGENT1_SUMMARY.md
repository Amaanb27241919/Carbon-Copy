# Agent 1 Summary — Tool Architecture + Utility Layer

_Completed: 2026-04-17_

---

## What Was Built

### A) `core/v4/agent-tools.js` (709 lines)

Full Claude Code tool execution architecture for Carbon Core v4. Mirrors the claw-cli `Tool<Input, Output>` contract exactly.

**Architecture:**

```
agent-tools.js
  ├── BaseTool          — abstract base (call, checkPermissions, isReadOnly, isDestructive)
  ├── BashToolImpl      — shell command execution with safety blocklist + read-only detection
  ├── FileEditToolImpl  — exact-match string replacement (unique match required)
  ├── FileReadToolImpl  — file read with offset/limit support
  ├── FileWriteToolImpl — file write with mkdirSync for missing dirs
  └── AgentToolImpl     — sub-agent spawner via `claude --print` CLI subprocess
```

**Permission system (mirrors claw-cli PermissionMode):**

| Mode | Behavior |
|------|----------|
| `default` | Blocks known dangerous ops, allows read-only automatically |
| `acceptEdits` | Auto-allows all file edits |
| `bypassPermissions` | No restrictions (use with care) |
| `plan` | Read-only only — no writes, execs, or agent spawns |
| `dontAsk` | Deny unless explicitly in allowlist |

**Blocked patterns (always refused):**
- `rm -rf /`, `rmdir /`, `mkfs.*`, `dd if=`, fork bombs, raw disk writes, system shutdown

**Hooks integration:**
- Every tool call fires `HookEvents.PRE_TOOL` before execution
- Fires `HookEvents.POST_TOOL` after completion
- Pre-hook can block execution (`preHook.allowed === false`)
- All hook events logged to audit-v2.js

**Exports:**
```js
{ getTool, listTools, executeTool, registerCustomTool,
  PermissionMode, allow, deny,
  BaseTool, BashToolImpl, FileEditToolImpl, FileReadToolImpl, FileWriteToolImpl, AgentToolImpl }
```

---

### B) `core/v4/vision-tool.js` (193 lines)

macOS screenshot and GUI automation for vision-capable agents. Wraps [steipete/Peekaboo](https://github.com/steipete/Peekaboo) CLI.

**Requires:** macOS 15+ (Sequoia) + Screen Recording permission granted to terminal/agent process.

**Functions:**

| Function | What |
|----------|------|
| `captureScreen(opts)` | Full screen capture → base64 PNG |
| `captureWindow(appName, opts)` | Capture specific app window → base64 PNG |
| `listWindows()` | List all open windows across apps |
| `listApps()` | List running applications |

All functions return `{ base64, mimeType, path, width, height }` ready for Claude/GPT vision API.

**Peekaboo resolution order:**
1. `/opt/homebrew/bin/peekaboo`
2. `/usr/local/bin/peekaboo`
3. `npx -y @steipete/peekaboo` (fallback, no install needed)

---

### C) `core/v4/token-math.js` (187 lines)

LLM token counting and cost calculation. Inlined from [steipete/tokentally](https://github.com/steipete/tokentally) (MIT).

**Functions:**

| Function | What |
|----------|------|
| `normalizeTokenUsage(raw)` | Normalize any provider's token response into `{ input, output, cache_read, cache_write }` |
| `pricingFromUsdPerMillion(rates)` | Build a pricing object from per-million rates |
| `estimateUsdCost({ usage, pricing })` | Calculate `{ inputUsd, outputUsd, cacheUsd, totalUsd }` |
| `tallyCosts(runs)` | Aggregate cost totals across multiple runs |
| `MODEL_PRICING` | Static table: Claude (Opus/Sonnet/Haiku), GPT-4o/mini, Ollama (free) |

**Example:**
```js
const usage   = normalizeTokenUsage({ prompt_tokens: 1000, completion_tokens: 250 });
const pricing = MODEL_PRICING['claude-sonnet-4-6'];
const cost    = estimateUsdCost({ usage, pricing });
// { inputUsd: 0.003, outputUsd: 0.00375, totalUsd: 0.00675 }
```

---

### D) `core/v4/progress-reporter.js` (153 lines)

Terminal progress bars for long-running agent operations. Wraps [steipete/osc-progress](https://github.com/steipete/osc-progress) (MIT) using OSC 9;4 escape sequences.

**Works in:** Ghostty, WezTerm, Windows Terminal. Falls back to ASCII spinner/counter elsewhere.

**Usage:**
```js
const { createProgress } = require('./progress-reporter');
const p = createProgress('Downloading knowledge vault', 100);
for (let i = 0; i <= 100; i++) {
  await doWork(i);
  p.update(i);
}
p.done();
```

---

### E) `core/v4/html-to-markdown.js` (131 lines)

HTML → Markdown converter for agents that need to process web content. Strategy (in order of availability):

1. `@mozilla/readability` + `turndown` — best accuracy for web pages (removes nav/footers/ads)
2. `turndown` alone — good for clean HTML
3. Regex strip fallback — zero deps, last resort

**Exports:** `htmlToMarkdown(html)`, `htmlPageToMarkdown(url)` (fetches + converts).

---

## Dependencies Introduced

| File | New Deps (optional) |
|------|---------------------|
| `agent-tools.js` | None — uses only Node.js builtins |
| `vision-tool.js` | `peekaboo` CLI (or `npx @steipete/peekaboo`) |
| `token-math.js` | None — pure JS |
| `progress-reporter.js` | None — pure JS with terminal escapes |
| `html-to-markdown.js` | `turndown`, `@mozilla/readability`, `jsdom` (all optional) |

---

## Integration Points

- `agent-tools.js` integrates with `core/hooks-engine.js` (PRE_TOOL / POST_TOOL events) and `core/audit-v2.js` (AGENT_STARTED / AGENT_COMPLETED / AGENT_FAILED).
- `token-math.js` used by `api-server-v4.js` for cost tracking in agent runs.
- `vision-tool.js` available to any agent that needs to "see" the screen (e.g. automated UI testing, screenshot capture for Dossier).
- `progress-reporter.js` used by long-running operations (knowledge ingest, ralph loop, orchestration).
- `html-to-markdown.js` used by knowledge ingest (convert crawled HTML to Markdown before chunking).
