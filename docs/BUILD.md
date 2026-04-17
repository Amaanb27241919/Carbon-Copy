# Carbon Core — Build & Development Workflow

_Last updated: 2026-04-17_

---

## Quick Start

### Without Docker (fastest for local dev)

```bash
bash dev.sh
```

- Dashboard: http://localhost:3006/app
- Carbon Core API: http://localhost:3001/api/v2/ping

### With Docker

```bash
docker compose up
```

All 8+ services start automatically. Auto-login: `admin / OmniFlow2026!`

---

## Hot Reload with Poltergeist

**Poltergeist** is a universal file watcher + auto-rebuild daemon by steipete. It keeps builds fresh as you edit, similar to `pnpm run dev` but for any language or build system.

**Repo**: https://github.com/steipete/poltergeist  
**Cloned to**: /Users/amaankhan/Desktop/OmniFlow/Raw/poltergeist

### Installation

```bash
# macOS (Homebrew — recommended)
brew tap steipete/tap
brew install steipete/tap/poltergeist

# Or via npm (all platforms)
npm install -g @steipete/poltergeist
```

**Requires Watchman:**
```bash
brew install watchman
```

### Setting Up Hot Reload for Carbon Core

1. Initialize Poltergeist in the repo root (auto-detects project type):

```bash
cd ~/Desktop/OmniFlow/Carbon-Copy
poltergeist init
```

This creates `poltergeist.config.json`. Review and adjust the generated targets.

2. Start the background watcher daemon:

```bash
poltergeist haunt
```

3. Check status:

```bash
poltergeist status
poltergeist status --verbose
```

### Example poltergeist.config.json for Carbon Core

```json
{
  "targets": {
    "web-app": {
      "buildCommand": "cd web-app && pnpm build",
      "watchPaths": ["web-app/src"],
      "outputPath": "web-app/.next",
      "debounceInterval": 800
    },
    "core": {
      "buildCommand": "echo 'Node.js — no compile step'",
      "watchPaths": ["core"],
      "debounceInterval": 500
    },
    "aria-service": {
      "buildCommand": "echo 'Node.js — no compile step'",
      "watchPaths": ["aria-service/src"],
      "debounceInterval": 500
    }
  }
}
```

### Running Fresh Builds with `polter`

Use `polter <target>` to wait for a build to complete before running:

```bash
polter web-app       # Waits for web-app build, then launches
polter core          # Ensures core is up-to-date before running
```

### Live Dashboard

```bash
poltergeist panel    # Full-screen TUI showing all targets + git status
```

### Manual Trigger

```bash
poltergeist build web-app   # Force a rebuild of a specific target
```

---

## Common Dev Commands

```bash
# Rebuild one Docker service (fast)
docker compose build --no-cache <service>
docker compose up -d --force-recreate <service>

# View logs
docker logs carbon-aria     --tail 50 -f
docker logs carbon-gateway  --tail 50 -f
docker logs carbon-web-app  --tail 50 -f

# Check all containers
docker ps --format "{{.Names}}\t{{.Status}}" | grep carbon | sort

# Apply DB schema
docker exec -i carbon-postgres psql -U carbon -d carbon_db < database/init/05_aria.sql
```

---

## Environment Setup

Copy `.env.example` to `.env` and fill in:

```bash
cp .env.example .env
# Edit .env with your API keys:
#   ANTHROPIC_API_KEY=
#   OPENAI_API_KEY=
#   OLLAMA_DEFAULT_MODEL=llama3.2
```

---

## CI/CD

Automated checks run on every push via GitHub Actions. Check status:

```bash
gh run list
gh run view <run-id>
```
