# Carbon Core v4 — Boot Test Report

**Date:** 2026-04-17  
**Tester:** Boot Test Agent  
**Branch:** main  
**Server:** `http://localhost:3001`

---

## Summary

Carbon Core v4 is **operational**. All 14 tested endpoints pass. One startup bug was fixed (table name mismatch). Knowledge search returns empty results as expected (no knowledge vault seeded).

---

## Fixes Applied

### Bug: `cc_` prefixed table names not in schema

**Root cause:** `core/v4/api-server-v4.js` referenced `cc_heartbeat_runs`, `cc_budget_policies`, and `cc_activity_log` — none of which exist in `schema-v2.sql`. The actual table names are `heartbeat_runs`, `budget_policies`, and `activity_log`. The server crashed at module load time with `SqliteError: no such table: cc_heartbeat_runs`.

**Also discovered:** pm2 was still running the old `api-server-v2.js` from prior sessions (process not re-launched from updated ecosystem.config.js). Deleted and re-started from `ecosystem.config.js`.

**Fix:** Renamed all 5 occurrences in `api-server-v4.js`:
- `cc_heartbeat_runs` → `heartbeat_runs` (lines 119, 132, 142, 151)
- `cc_budget_policies` → `budget_policies` (line 126)
- `cc_activity_log` → `activity_log` (line 157)

---

## Endpoint Test Results

| # | Endpoint | Status | Notes |
|---|----------|--------|-------|
| 1 | `GET /api/v4/ping` | ✅ PASS | `{"ok":true,"version":"4.0.0"}` |
| 2 | `GET /api/v4/health` | ✅ PASS | DB healthy; telegram + model_router unhealthy (expected in dev — no token/service) |
| 3 | `GET /api/v4/agents` | ✅ PASS | Returns 8 agents (scan, ali, quilly, larry, ovi, cleo, sam, aria) |
| 4 | `POST /api/v4/agent/run` | ✅ PASS | Returns `runId` + poll URL; run completes |
| 5 | `GET /api/v4/knowledge/domains` | ✅ PASS | Returns `{domains:{},stats:{total_docs:0}}` — empty (no vault) |
| 6 | `GET /api/v4/knowledge/search?q=agent&limit=3` | ✅ PASS | Returns `{results:[],total:0}` — empty (no vault) |
| 7 | `GET /api/v4/skills` | ✅ PASS | Returns 61-skill catalog |
| 8 | `POST /api/v4/skills/match` | ✅ PASS | Trigger-phrase matching works; "write code" returns empty (no matching trigger); "write content blog post" returns content-creation skill |
| 9 | `GET /api/v4/budget` | ✅ PASS | Returns `{policies:[],paused_agents:[],recent_incidents:[]}` |
| 10 | `POST /api/v4/ralph/run` | ✅ PASS | Returns `loopId` + poll URL |
| 11 | `GET /api/v4/runs` | ✅ PASS | Returns completed orchestration run result |
| 12 | `POST /api/v4/orchestration/run` | ✅ PASS | Parallel mode completed; agents returned Carbon Core summary |
| 13 | `GET /api/v2/ping` | ✅ PASS | Backward-compat route works; returns v4.0.0 |
| 14 | `GET /api/v2/health` | ✅ PASS | Backward-compat route works |

**Bonus endpoints also verified:**
- `GET /api/v4/tools` — ✅ Returns BashTool, FileEditTool, AgentTool definitions
- `GET /api/v4/budget/scan` — ✅ Returns per-agent budget summary

---

## Knowledge Ingest Status

**Status:** Skipped — no `knowledge-vault/` directory exists at project root.

To seed knowledge:
1. Create `knowledge-vault/<category>/` with `.md` files
2. POST to `/api/v4/knowledge/ingest` with `{"path":"./knowledge-vault"}`

The knowledge endpoint infrastructure is functional (no errors, returns empty results cleanly).

---

## Health Subsystem Status

| Subsystem | Status | Notes |
|-----------|--------|-------|
| database | healthy | SQLite OK |
| telegram | unhealthy | TELEGRAM_BOT_TOKEN not set (expected in dev) |
| memory_system | healthy | 0 memories |
| scheduler | healthy | 0 tasks |
| claude_cli | healthy | Claude Code 2.1.108 |
| model_router | unhealthy | unreachable (model-router Docker service not running) |

The two unhealthy subsystems are expected in local dev mode (no Docker stack, no Telegram token).

---

## Overall Assessment

**v4 is boot-ready.** All routes register correctly, DB schema applies cleanly, orchestration runs end-to-end, and the v2 backward-compat layer is intact.

Next steps before ship (from CLAUDE.md critical issues):
1. Fix `skills-registry.js:126` hardcoded path (`loadSkillContent` uses absolute rawclaw-platform path)
2. Fix `knowledge-importer.js:14` hardcoded path
3. Add `knowledge-vault/` seed data to repo
4. Build `index-v4.js` master entry point
