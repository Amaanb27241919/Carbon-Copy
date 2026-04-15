# Carbon Core — Vision Document
**Locked**: April 15, 2026

---

## What It Is

**Carbon Core is a secure, self-hosted AI project build and deployment platform.**

It gives developers and small teams an isolated environment to build, test, and run AI projects — without touching their personal machines or corporate servers.

Think: your own private AI cloud. VMs on demand. Local models. Full intelligence stack. Deploy in minutes.

---

## Who It's For

**Primary buyer**: Developers and small teams who want to test projects in a secure sandbox instead of their personal laptop or corporate network.

**The pain**: You're building something with AI — agents, automations, integrations — but you don't want it running on your work machine (security risk), your personal machine (privacy risk), or cloud SaaS (cost + lock-in risk). You want YOUR OWN isolated environment that you control.

**The answer**: Carbon Core. Spin up a VM, deploy your project, run it safely. Tear it down when done.

---

## Builder Philosophy

**Dogfooding first**: Amaan is building this for himself AND future customers. Every feature ships when it's useful to him. Nothing ships just for marketing.

This means:
- Features are real (not demos)
- Bugs get fixed fast (he hits them first)
- The roadmap is honest (built what's actually needed)

---

## Core Value Props

1. **Privacy**: Your data never leaves your machine. Zero cloud dependency.
2. **Cost**: Run unlimited AI inference locally via Ollama. Pay only when you need cloud.
3. **Control**: Own your infrastructure. No vendor lock-in.
4. **Speed**: Deploy in 10 minutes. Docker Compose. Done.

---

## What It Does

| Layer | What |
|-------|------|
| **VMs** | Provision/start/stop KVM virtual machines on demand |
| **AI** | Local Ollama models + Claude/OpenAI as cloud fallback |
| **ARIA** | Full intelligence platform (research, WatchDog, Dossier) |
| **Budget** | Per-agent spend limits, auto-pause, cost tracking |
| **Storage** | MinIO S3-compatible object storage |
| **Agents** | 7-agent business OS (Scan, Ali, Quilly, Larry, Ovi, Cleo, Sam) |
| **Skills** | 61 skills from research to cold email to code review |
| **Orchestration** | Multi-agent parallel/phased/pipeline workflows |
| **Proposals** | AI proposals from call transcripts |
| **Chat** | Real-time streaming chat with local or cloud models |

---

## Revenue Model

**Now**: Freemium
- Free: self-hosted, open source community edition
- Paid: managed hosting (we run it, charge subscription)

**Later** (by demand): Hybrid
- Source stays free
- Enterprise: support SLA + managed updates + dedicated instance

**Target**: $10K–$100K ARR, 1–5 year horizon, Q3/Q4 2026 ship

---

## Architecture Decisions (Locked)

| Decision | Choice | Why |
|----------|--------|-----|
| DB (dev) | SQLite | Zero-config, works everywhere |
| DB (prod) | PostgreSQL | Scale, concurrent users, pgvector |
| AI routing | Local-first (Ollama → Cloud) | Privacy + cost |
| Containers | Docker-optional | Works bare metal too |
| License | Dual (community + commercial) | Build moat, monetize enterprise |
| Open source | Yes (community edition) | Self-serve GTM, trust, community |
| Decision-making | Community + market-driven | Pay for features = roadmap signal |
| Observability | Full stack (logs + metrics + tracing) | Enterprise-grade from day one |

---

## Success Metrics (12 months)

- 1,000 GitHub stars
- 500 self-hosted deployments
- 50 paying customers
- $10K ARR
- Featured in enterprise software reviews

---

## What Carbon Core Is NOT

- Not a cloud SaaS (that's ARIA at aria.omni-flow.net)
- Not a managed service (yet)
- Not a replacement for corporate IT infrastructure
- Not a coding assistant (that's Claude Code)

---

## The Positioning

**ARIA** = Research intelligence SaaS ($30-60/mo cloud, for consultants + analysts)
**Carbon Core** = Self-hosted AI infrastructure (for devs/teams who want to run ARIA + their own projects privately)

They complement each other. ARIA for intelligence. Carbon Core for deployment.
