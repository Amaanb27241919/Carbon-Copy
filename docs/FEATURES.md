# Carbon Core — Feature Reference

_Last updated: April 17, 2026_

Status legend: **live** = working today | **v4-wip** = being built | **planned** = not yet started

---

## Layer 1 — AI Routing

| Feature | Status | File | Notes |
|---------|--------|------|-------|
| Ollama local inference | live | model-router/src/providers/ollama.js | Default provider, free |
| Claude (Anthropic) fallback | live | model-router/src/providers/anthropic.js | claude-sonnet-4-6 default |
| OpenAI fallback | live | model-router/src/providers/openai.js | gpt-4o default |
| HuggingFace inference | live | model-router/src/providers/huggingface.js | Open models |
| Provider auto-selection | live | model-router/src/ | Ollama → Claude → OpenAI order |
| Model registry in DB | live | database/init/02_model_registry.sql | Track all models |
| Streaming chat (SSE) | live | api-server-v2.js /chat | Server-sent events |

---

## Layer 2 — Business Agents

| Feature | Status | File | Notes |
|---------|--------|------|-------|
| Scan (COO orchestrator) | live | core/agent-registry.js | Routes to right agent |
| Ali (Dev Agent) | live | core/agent-registry.js | Code, builds, deploys |
| Quilly (Content Agent) | live | core/agent-registry.js | Scripts, posts, calendar |
| Larry (Sales Agent) | live | core/agent-registry.js | Cold email, proposals |
| Ovi (Research Agent) | live | core/agent-registry.js | Market research, data |
| Cleo (Client Agent) | live | core/agent-registry.js | Onboarding, churn |
| Sam (Finance Agent) | live | core/agent-registry.js | Budget, cost reports |
| ARIA (Intelligence Agent) | live | core/agent-registry.js | Research missions |
| Keyword-based routing | live | core/agent-registry.js routeTask() | Task → best agent |
| Multi-agent recommendation | live | core/agent-registry.js getRecommendedAgents() | Top 3 agents for task |
| v4 API routes for agents | v4-wip | core/v4/api-server-v4.js | GET/POST /api/v4/agents/team |

**Powered by**: agent-registry.js

---

## Layer 3 — Expert Agents (18)

| Agent | Status | Use When |
|-------|--------|----------|
| executor | live | implement, build, code, create |
| verifier | live | verify, check, validate, does it work |
| planner | live | plan, roadmap, break down task |
| architect | live | architecture, design, structure, tradeoffs |
| debugger | live | debug, error, bug, broken, failing |
| code-reviewer | live | review, code review, feedback on |
| product-manager | live | prd, requirements, user story, acceptance criteria |
| analyst | live | analyze, synthesize, extract, summarize |
| test-engineer | live | test, unit test, coverage, jest, pytest |
| designer | live | design, ui, ux, component, wireframe |
| security-reviewer | live | security, vulnerability, auth, injection |
| quality-reviewer | live | quality, assess, ready to ship |
| git-master | live | git, commit, merge, branch, conflict |
| researcher | live | research, find information, look up |
| writer | live | write docs, documentation, readme |
| critic | live | what could go wrong, critique, adversarial |
| build-fixer | live | build fails, compilation error, ci failing |
| performance-reviewer | live | slow, optimize, latency, bottleneck |

**Powered by**: core/expert-agents.js

---

## Layer 4 — Skills (61)

### Content (12 skills)
brand-voice, content-creation, content-strategy, content-ideation-pipeline, copywriting, copy-editing, copy-pipeline, social-content, story-sequence, yt-pipeline, yt-search, yt-spinoff

### Sales (9 skills)
cold-email, email-sequence, proposal, sales, sales-enablement, sales-prep-pipeline, revops, waterfall, steal

### Marketing (9 skills)
marketing-ideas, marketing-psychology, launch-strategy, lead-magnets, community-marketing, referral-program, paid-ads, ad-creative, product-marketing-context

### SEO (7 skills)
ai-seo, seo-audit, programmatic-seo, schema-markup, site-architecture, free-tool-strategy, competitor-alternatives

### CRO (8 skills)
ab-test-setup, form-cro, funnel-pipeline, onboarding-cro, page-cro, paywall-upgrade-cro, popup-cro, signup-flow-cro

### Research (4 skills)
research, customer-research, signal-scan, rag-query

### Tools (7 skills)
gmail, google-calendar, slack, clickup, notebooklm, mcp-creator, skill-creator

### Dev (3 skills) + Product (2 skills)
analytics-tracking, frontend-theme, ship-check, pricing-strategy, churn-prevention

**Status**: Catalog live. `loadSkillContent()` requires `SKILLS_BASE_PATH` env var — hardcoded absolute path is a known blocker.

**Powered by**: core/skills-registry.js

---

## Layer 5 — Multi-Agent Orchestration

| Feature | Status | File | Notes |
|---------|--------|------|-------|
| Parallel mode | live | core/orchestrator-v2.js | All agents run simultaneously |
| Sequential mode | live | core/orchestrator-v2.js | Chain output to next agent |
| Hierarchical mode | live | core/orchestrator-v2.js | Planner + parallel workers |
| Pipeline mode | live | core/orchestrator-v2.js | Output = next agent input |
| Phased mode | live | core/orchestrator-v2.js | Multi-phase with transitions |
| In-memory run registry | live | core/orchestrator-v2.js | Max 200 runs, lost on restart |
| DB-persisted runs | v4-wip | core/v4/orchestrator-v4.js | Survive restarts |
| Budget check before run | live | core/orchestrator-v2.js | Blocks if limit hit |
| Audit logging | live | core/orchestrator-v2.js | Every run logged |
| Cancel running run | live | core/orchestrator-v2.js cancelRun() | Marks failed immediately |
| v4 API routes | v4-wip | core/v4/api-server-v4.js | GET/POST/DELETE /api/v4/orchestration |

**Powered by**: core/orchestrator-v2.js, core/v4/orchestrator-v4.js (building)

---

## Layer 6 — Ralph Loop

| Feature | Status | File | Notes |
|---------|--------|------|-------|
| Iterative loop execution | live | core/ralph-loop.js | Repeat until completion string |
| Completion promise detection | live | core/ralph-loop.js | Custom completion signal |
| Max iterations safety | live | core/ralph-loop.js | Default 50 |
| Budget check per iteration | live | core/ralph-loop.js | Stops if limit hit |
| In-memory loop state | live | core/ralph-loop.js | Lost on restart |
| Tool-aware loop | v4-wip | core/v4/ralph-engine.js | Uses agent-tools.js internally |
| Completion function support | v4-wip | core/v4/ralph-engine.js | Function-based completion check |
| DB-persisted loop state | v4-wip | core/v4/ralph-engine.js | Survive restarts |
| Full iteration output stored | v4-wip | core/v4/ralph-engine.js | v2 truncates at 500 chars |

**Powered by**: core/ralph-loop.js, core/v4/ralph-engine.js (building)

---

## Layer 7 — Tool Execution (v4)

| Feature | Status | File | Notes |
|---------|--------|------|-------|
| BashTool | live | core/v4/agent-tools.js | Shell with permission modes |
| FileEditTool | live | core/v4/agent-tools.js | Exact-match file edits |
| FileReadTool | live | core/v4/agent-tools.js | Read-only, always allowed |
| FileWriteTool | live | core/v4/agent-tools.js | Create or overwrite files |
| AgentTool | live | core/v4/agent-tools.js | Spawn Claude CLI sub-agent |
| Permission modes | live | core/v4/agent-tools.js | DEFAULT, PLAN, BYPASS_PERMISSIONS, ACCEPT_EDITS, DONT_ASK |
| Blocked command patterns | live | core/v4/agent-tools.js | rm -rf /, mkfs, dd, fork bomb blocked |
| Agent allowlist patterns | live | core/v4/agent-tools.js | Per-agent command whitelist |
| PRE_TOOL / POST_TOOL hooks | live | core/v4/agent-tools.js | Fires through hooks-engine |
| Custom tool registration | live | core/v4/agent-tools.js | registerCustomTool() |
| dryRun mode | live | core/v4/agent-tools.js | Validate without executing |
| Audit logging | live | core/v4/agent-tools.js | Every tool call logged |

**Powered by**: core/v4/agent-tools.js

---

## Layer 8 — Knowledge Base

| Feature | Status | File | Notes |
|---------|--------|------|-------|
| Markdown file ingestion | live | core/knowledge-service.js | Walks directories recursively |
| TF-IDF keyword search | live | core/knowledge-service.js | Title 3x, content 1x scoring |
| In-memory index | live | core/knowledge-service.js | Fast, rebuilt on startup |
| DB persistence | live | core/knowledge-service.js | Survives restarts |
| Category organization | live | core/knowledge-service.js | brand, sales, ops, content, strategy, agents, skills, templates, frameworks |
| Auto-ingest on startup | live | core/knowledge-service.js | Reads knowledge-vault/ directory |
| Snippet extraction | live | core/knowledge-service.js | 200-char snippets around query match |
| v4 search layer | v4-wip | core/v4/knowledge-search.js | Wraps knowledge-service, semantic stub |
| Semantic search | planned | — | pgvector, deferred |

**Powered by**: core/knowledge-service.js, core/v4/knowledge-search.js (building)

---

## Layer 9 — Budget Governance

| Feature | Status | File | Notes |
|---------|--------|------|-------|
| Per-agent daily limits | live | core/budget-v2.js | Auto-pause on hit |
| Per-agent monthly limits | live | core/budget-v2.js | |
| Per-agent lifetime limits | live | core/budget-v2.js | |
| Company-wide limits | live | core/budget-v2.js | scope='company' |
| Warning at 80% | live | core/budget-v2.js | Configurable threshold |
| Auto-pause on hard stop | live | core/budget-v2.js | |
| Manual resume | live | core/budget-v2.js | POST /budget/agents/:id/resume |
| Incident log | live | core/budget-v2.js | Every warning/stop recorded |
| Cost estimation | live | core/budget-v2.js | estimateCost() for pre-run |

**Powered by**: core/budget-v2.js

---

## Layer 10 — Heartbeat Tracking

| Feature | Status | File | Notes |
|---------|--------|------|-------|
| Every agent run tracked | live | core/heartbeat-v2.js | Started, completed, failed |
| Token usage per run | live | core/heartbeat-v2.js | Input, output, cache tokens |
| Cost per run | live | core/heartbeat-v2.js | USD with 6 decimal precision |
| Duration tracking | live | core/heartbeat-v2.js | Milliseconds |
| Provider tracking | live | core/heartbeat-v2.js | Which AI provider was used |
| Local vs cloud flag | live | core/heartbeat-v2.js | is_local boolean |
| Stuck run detection | live | core/heartbeat-v2.js | resetStuckRuns() on startup |

**Powered by**: core/heartbeat-v2.js

---

## Layer 11 — Audit Trail

| Feature | Status | File | Notes |
|---------|--------|------|-------|
| Immutable activity log | live | core/audit-v2.js | Never deleted |
| Actor types | live | core/audit-v2.js | user, agent, system |
| Action types | live | core/audit-v2.js | 20+ typed action constants |
| Entity tracking | live | core/audit-v2.js | entity_type + entity_id |
| JSON detail field | live | core/audit-v2.js | Arbitrary context per event |

**Powered by**: core/audit-v2.js

---

## Layer 12 — VM Management

| Feature | Status | File | Notes |
|---------|--------|------|-------|
| UTM VM list | live | core/utm-client.js | utmctl list |
| UTM VM start | live | core/utm-client.js | utmctl start |
| UTM VM graceful shutdown | live | core/utm-client.js | utmctl stop --request |
| UTM VM force stop | live | core/utm-client.js | utmctl stop --kill |
| UTM VM delete | live | core/utm-client.js | utmctl delete |
| UTM Open GUI | live | core/utm-client.js | open -a UTM |
| Docker KVM list | live | kvm-manager/ service | |
| Docker KVM create | live | kvm-manager/ service | |
| Docker KVM start/stop | live | kvm-manager/ service | |
| noVNC console | live | novnc container | Browser-based VNC |
| Docker container VMs | live | vm-manager/ service | |
| VM to agent assignment | live | schema-v2.sql cc_vm_assignments | |

---

## Layer 13 — ARIA Intelligence Platform

| Feature | Status | File | Notes |
|---------|--------|------|-------|
| 5-agent research pipeline | live | aria-service/src/orchestrator.js | scan→research→synthesis→delivery |
| 88 research blueprints | live | aria-service/blueprints/ | Templates for common research |
| Mission submission | live | aria-service/src/routes/missions.js | POST /api/missions |
| Mission status tracking | live | aria-service/src/routes/missions.js | GET /api/missions/:id |
| WatchDog monitors | live | aria-service/src/watchdog.js | Entity monitoring |
| Dossier document analysis | live | aria-service/src/dossier.js | Upload + analyze docs |
| Client management | live | aria-service/src/routes/clients.js | Multi-client support |
| Budget per provider | live | aria-service/src/routes/budget.js | Daily + monthly |
| Email delivery | live | aria-service/src/deliver-email.js | via Resend API |
| Slack delivery | live | aria-service/src/deliver-slack.js | Webhook |

---

## Layer 14 — Infrastructure

| Feature | Status | Notes |
|---------|--------|-------|
| Docker Compose full stack | live | 15+ services |
| nginx reverse proxy | live | /app, /api routing |
| PostgreSQL 16 + pgvector | live | |
| Redis session cache | live | |
| MinIO object storage | live | S3-compatible |
| Prometheus metrics | live | All services scrape /metrics |
| Grafana dashboards | live | Preconfigured datasource |
| Docker socket proxy | live | Security: restricted API surface |
| PM2 dev mode | live | auto-restart, log management |
| Homelab profile | live | Tailscale, DuckDNS, Pi-hole, Immich, Syncthing, Samba |
| Sandbox runner | live | Safe GitHub repo execution |
| Secret generation | live | scripts/generate-secrets.sh |

---

## Upcoming (Not Yet Started)

| Feature | Layer | Notes |
|---------|-------|-------|
| index-v4.js master entry | v4 | Auto-migrate, register all, start server |
| knowledge-vault seed | Knowledge | Commit example docs to repo |
| skills/ in repo | Skills | Remove external path dependency |
| Web UI: Agents v4 page | Frontend | Connect to /api/v4/agents |
| Web UI: Skills page | Frontend | Browse and search skills |
| Web UI: Ralph v4 page | Frontend | Monitor loop iterations |
| Claude Code agent service | Dev | Sandboxed coding agent |
| Vector search | Knowledge | pgvector embeddings |
| Tailscale + DuckDNS setup | Networking | Remote access from anywhere |
| Auth login page | Auth | Restore proper login flow |
| AI cost per-provider dashboard | Budget | OpenAI + Anthropic breakdown |
