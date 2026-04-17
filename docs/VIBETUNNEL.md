# VibeTunnel — Remote Agent Control via Browser

_Scouted: 2026-04-17_

**Note**: VibeTunnel was not found as a standalone public repo under steipete as of this scout date. The concept is described in the agent-scripts AGENTS.MD and pi-mono monorepo. The related tool `sweetlink` (see below) covers the same browser-control use case. This document covers both.

---

## What VibeTunnel Does (Concept)

VibeTunnel turns any browser tab into a terminal you can drive remotely. Instead of screen-sharing or VNC, it exposes a web socket interface that lets an AI agent send commands to and receive output from a running browser session — useful for:

- Driving a web app in your current logged-in browser tab (no headless setup, no cookie re-auth)
- Closing the "agent loop" for web-based tools
- Running smoke tests against a live dev server without Playwright setup

---

## SweetLink — Practical Implementation

**Repo**: https://github.com/steipete/sweetlink  
**Cloned to**: /Users/amaankhan/Desktop/OmniFlow/Raw/sweetlink  
**Language**: TypeScript  
**Stars**: 121

SweetLink is the production implementation of the browser-as-terminal concept. It drives a real Chrome session through a local daemon (WebSocket bridge), avoiding headless browser limitations.

### How It Works

```
Agent → SweetLink CLI → SweetLink Daemon (wss://localhost:4455) → Chrome DevTools Protocol → Tab
```

- `sweetlinkd` is a local TLS WebSocket server that stays connected to your Chrome tab
- `sweetlink open --controlled` launches a Chrome window with DevTools enabled and SweetLink connected
- The agent can then call CLI commands or MCP tools to interact with the tab

### Installation

```bash
# Install Node deps
cd /Users/amaankhan/Desktop/OmniFlow/Raw/sweetlink
pnpm install
pnpm run build

# Install TLS certs (one-time)
brew install mkcert nss
pnpm sweetlink trust-ca

# Start the daemon
pnpm exec sweetlink daemon
```

### Key Commands

| Command | What it does |
|---------|-------------|
| `sweetlink daemon` | Start the background daemon (keep running) |
| `sweetlink open --controlled --path /dashboard` | Launch controlled Chrome window |
| `sweetlink sessions` | List active browser sessions |
| `sweetlink smoke --routes main` | Sweep dashboard/settings/search routes for errors |
| `sweetlink devtools authorize` | Click OAuth consent button automatically |

### Carbon Core Use Case

1. Start the SweetLink daemon alongside `dev.sh`
2. Open the Carbon Core dashboard in the controlled Chrome tab
3. ARIA agents can call SweetLink to:
   - Verify UI state after deploys
   - Check for JS console errors
   - Capture screenshots of the running dashboard
   - Run smoke tests against `http://localhost:3006/app`

### Integration with Carbon Core

```bash
# In dev.sh or a separate terminal:
pnpm --prefix /Users/amaankhan/Desktop/OmniFlow/Raw/sweetlink exec sweetlink daemon &

# Then agents can call:
pnpm --prefix /Users/amaankhan/Desktop/OmniFlow/Raw/sweetlink sweetlink smoke --routes main
```

---

## pi-mono — Agent Framework + TUI Library

**Repo**: https://github.com/steipete/pi-mono  
**Cloned to**: /Users/amaankhan/Desktop/OmniFlow/Raw/pi-mono  
**Language**: TypeScript  
**Stars**: 6

Monorepo containing:
- `pi-tui` — TypeScript TUI library (Ink-based terminal UIs, used by Poltergeist's status panel)
- Agent framework patterns
- Pod management CLI

Useful reference for building Carbon Core's own TUI status panel.
