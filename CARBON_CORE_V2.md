# Carbon Core v2 — Architecture

Production-grade self-hosted AI intelligence platform built on SQLite + Express.

## Architecture Overview

```
index-v2.js (master entry)
├── DB init (better-sqlite3, WAL mode)
├── schema-v2.sql (applied on startup)
├── Register DB functions (no circular imports)
└── Mount all services

services/
├── budget-v2.js       — Budget governance (policies, incidents, auto-pause)
├── heartbeat-v2.js    — Execution tracking (every agent run traced)
├── audit-v2.js        — Immutable activity log (ring buffer + SQLite)
├── health-v2.js       — 5-subsystem health monitor (5min interval)
├── orchestrator-v2.js — Multi-agent orchestration (4 modes)
├── usage-tracker.js   — Claude JSONL scanner (cost tracking)
├── proposal-service.js — AI proposal generation from transcripts
├── knowledge-service.js — Markdown RAG knowledge base
├── plugin-system.js   — JSON manifest plugin loader
└── dashboard-v2.js    — All /api/v2/* routes + SSE stream
```

## Database

SQLite (WAL mode) primary. All tables in `carbon-copy.db`.

Tables added by `schema-v2.sql`:

| Table | Purpose |
|-------|---------|
| `budget_policies` | Per-agent/company spend limits |
| `budget_incidents` | Warning/hard-stop events |
| `heartbeat_runs` | Every agent execution tracked |
| `activity_log` | Immutable audit trail |
| `orchestration_runs` | Multi-agent run history |
| `plugins` | Plugin registry |
| `knowledge_docs` | Indexed markdown documents |
| `proposals` | Generated sales proposals |
| `usage_sessions` | Claude CLI session data |
| `usage_turns` | Per-turn token usage |

## API Routes

All routes under `/api/v2/`:

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/health` | Full SystemHealth object (5 subsystems) |
| GET | `/ping` | Version ping |
| GET | `/budget` | Budget dashboard (policies, incidents) |
| GET | `/budget?agent_id=X` | Per-agent budget summary |
| POST | `/budget/policies` | Create budget policy |
| POST | `/budget/agents/:id/resume` | Resume paused agent |
| GET | `/heartbeat` | Recent runs + active runs + total |
| GET | `/heartbeat?agent_id=X` | Per-agent stats |
| GET | `/activity` | Audit log (filterable by entity_type, actor_id) |
| GET | `/usage` | Claude usage stats + session breakdown |
| POST | `/usage/scan` | Trigger JSONL scan |
| GET | `/orchestration` | All orchestration runs |
| GET | `/orchestration/:runId` | Single run |
| POST | `/orchestration` | Start new orchestration |
| GET | `/knowledge/search?q=` | RAG search |
| GET | `/knowledge/stats` | Knowledge base stats |
| GET | `/knowledge/docs` | All docs (filterable by category) |
| POST | `/proposal` | Generate proposal from transcript |
| GET | `/proposals` | Recent proposals |
| GET | `/proposals/:id` | Single proposal |
| GET | `/plugins` | All loaded plugins |
| POST | `/plugins/:id/event` | Emit event to plugin |
| GET | `/stream` | SSE real-time activity feed |

## Service Patterns

### No Circular Imports
All services use `registerXxx(fns)` pattern. DB functions injected from `index-v2.js` after DB init.

### Budget Governance
```js
const { checkBudget } = require('./services/budget-v2.js');
const result = checkBudget('agent-id');
// result: { allowed, current_spend, limit_usd, utilization, warning }
```

### Heartbeat Execution
```js
const { executeWithHeartbeat } = require('./services/heartbeat-v2.js');
const { run, result } = await executeWithHeartbeat(prompt, {
  agentId: 'my-agent',
  source: 'on_demand',
  model: 'claude-sonnet-4-6',
});
```

### Activity Audit
```js
const { logAgentAction, ActionTypes } = require('./services/audit-v2.js');
logAgentAction(ActionTypes.TASK_COMPLETED, 'task', taskId, { result: 'ok' });
```

### Multi-Agent Orchestration
```js
const { orchestrate } = require('./services/orchestrator-v2.js');
const { runId } = orchestrate({
  task: 'Write a market analysis for SaaS tools',
  mode: 'parallel', // parallel | sequential | hierarchical | pipeline
  agents: [
    { name: 'researcher', systemPrompt: 'Research market data...' },
    { name: 'analyst', systemPrompt: 'Analyze and synthesize...' },
  ],
});
```

### Knowledge RAG
```js
const { search } = require('./services/knowledge-service.js');
const results = search('sales objection handling', { limit: 5, category: 'sales' });
```

### Proposal Generation
```js
const { generateProposal } = require('./services/proposal-service.js');
const { success, proposal, extraction } = await generateProposal(leadData, transcript);
```

## Orchestration Modes

| Mode | Description |
|------|-------------|
| `parallel` | All agents run simultaneously, results merged |
| `sequential` | Agents run in order, each gets previous output |
| `hierarchical` | First agent decomposes task, rest handle subtasks |
| `pipeline` | Each agent transforms previous agent's output |

## Health Subsystems

1. **database** — SQLite ping
2. **telegram** — Token env check
3. **memory_system** — Memory count query
4. **scheduler** — Active tasks count
5. **claude_cli** — `claude --version` spawn

## Plugin System

Drop a directory in `plugins/<name>/` with `plugin.json`:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "events": ["pre_message", "post_message"],
  "tools": []
}
```

And `index.js`:

```js
module.exports = {
  init(ctx) { console.log('Plugin initialized'); },
  shutdown() {},
  onEvent(eventType, payload) { return { handled: true }; },
};
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT_V2` | 3001 | Server port |
| `DB_PATH` | `carbon-copy.db` | SQLite database path |
| `TELEGRAM_BOT_TOKEN` | — | Telegram bot token (optional) |
| `SUPABASE_URL` | — | Supabase cloud sync (optional) |
| `SUPABASE_KEY` | — | Supabase anon key (optional) |
| `ANTHROPIC_API_KEY` | — | For proposal generation |

## Starting

```bash
# Production
node index-v2.js

# Or via script
./start-v2.sh

# Development (nodemon)
NODE_ENV=development ./start-v2.sh

# Custom port
PORT_V2=4000 node index-v2.js
```

## Source Attribution

Built from:
- `rawclaw/src/budget.ts` → budget-v2.js
- `rawclaw/src/heartbeat.ts` → heartbeat-v2.js
- `rawclaw/src/audit.ts` → audit-v2.js
- `rawclaw/src/health.ts` → health-v2.js
- `rawclaw-platform/lib/agents/orchestrator.js` → orchestrator-v2.js
- `claude-usage/scanner.py` → usage-tracker.js
- `proposal-generator/proposal-template.md` → proposal-service.js
- `rawgrowth-os/knowledge/` structure → knowledge-service.js
- `rawclaw/src/plugins.ts` → plugin-system.js
