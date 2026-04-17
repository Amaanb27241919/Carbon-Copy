# External Dependencies — Carbon Core v4

_Scouted: 2026-04-17_

Full table of all external repos evaluated during the GitHub scout of `steipete` and `Amaanb27241919`.

---

## steipete Repos

| Repo | Stars | Language | Tier | Purpose | Integration Status |
|------|-------|----------|------|---------|-------------------|
| agent-rules | 5672 | Shell | 1 | Shared agent coding rules | Appended to CLAUDE.md |
| agent-scripts | 2404 | Python | 1 | Agent scripts + AGENTS.MD | Cloned to Raw/agent-scripts; studied |
| tokentally | 60 | TypeScript | 1 | LLM token + cost math | Inlined in core/v4/token-math.js |
| osc-progress | 18 | TypeScript | 1 | Terminal progress bars (OSC 9;4) | Wrapped in core/v4/progress-reporter.js |
| poltergeist | 378 | TypeScript | 1 | Universal hot reload + file watcher | Documented in docs/BUILD.md |
| Peekaboo | 3130 | Swift | 1 | macOS screenshot + GUI automation | Wrapped in core/v4/vision-tool.js |
| conduit-mcp | 62 | TypeScript | 1 | File ops + web fetch MCP server | Documented in docs/MCP_SERVERS.md |
| claude-code-mcp | 1235 | JavaScript | 1 | Claude Code as one-shot MCP server | Documented in docs/MCP_SERVERS.md |
| mcporter | 4019 | TypeScript | 1 | Call any MCP from TypeScript/CLI | Documented in docs/MCP_SERVERS.md |
| sweetlink | 121 | TypeScript | 1 | Browser control / agent loop closure | Documented in docs/VIBETUNNEL.md |
| Demark | 213 | Swift | 1 | HTML → Markdown (Swift/WebKit) | Node.js equivalent in core/v4/html-to-markdown.js |
| Terminator | 91 | Swift | 1 | Terminal control MCP | Documented in docs/MCP_SERVERS.md |
| iterm-mcp | 5 | TypeScript | 1 | iTerm MCP server | Cloned; similar to Terminator |
| macos-automator-mcp | 759 | TypeScript | 1 | AppleScript/JXA MCP server | Cloned; deferred — macOS-specific automation |
| mcp-agentify | 21 | TypeScript | 1 | Convert MCP servers to agents | Cloned; useful for agent orchestration |
| pi-mono | 6 | TypeScript | 1 | TUI lib + agent framework | Documented in docs/VIBETUNNEL.md |
| Markdansi | 44 | TypeScript | 1 | Markdown → ANSI terminal output | Cloned; useful for agent CLI output |
| summarize | 5609 | TypeScript | 1 | URL/YouTube/podcast → summary CLI | Cloned; useful for ARIA research |
| oracle | 1926 | TypeScript | 1 | Bundle prompt+files for 2nd model | Cloned; useful for agent escalation |
| CodexBar | 10823 | Swift | 2 | macOS menu bar: OpenAI/Claude usage | Tier 2 — Swift/macOS app, not embeddable |
| Tachikoma | 247 | Swift | 2 | Swift SDK for AI providers | Tier 2 — Swift only |
| TauTUI | 132 | Swift | 2 | Swift TUI library | Tier 2 — Swift only |
| Matcha | 59 | Swift | 2 | Swift TUI library | Tier 2 — Swift only |
| imsg | 993 | Swift | 2 | iMessage CLI | Tier 2 — macOS/Swift only |
| remindctl | 196 | Swift | 2 | Apple Reminders CLI | Tier 2 — Swift/macOS only |
| Trimmy | 618 | Swift | 2 | Flatten multi-line shell snippets | Tier 2 — macOS app |
| AXorcist | 221 | Swift | 2 | macOS Accessibility wrapper | Tier 2 — Swift only |
| sag | 241 | Go | 2 | macOS say command with modern voice | Tier 2 — macOS TTS |
| brabble | 132 | Go | 2 | Voice-activated agent trigger | Tier 2 — macOS microphone |
| gogcli | 6859 | Go | 2 | Google Suite CLI | Tier 2 — not immediately needed |
| wacli | 1805 | Go | 2 | WhatsApp CLI | Tier 2 — not immediately needed |
| discrawl | 620 | Go | 2 | Discord CLI | Tier 2 — not immediately needed |
| birdclaw | 164 | TypeScript | 2 | Twitter/X data for agents | Tier 2 — deferred |
| stats-store | 42 | TypeScript | 2 | Privacy-first analytics for Sparkle | Tier 2 — Sparkle specific |
| tmuxwatch | 191 | Go | 2 | Watch tmux sessions TUI | Tier 2 — deferred |
| camsnap | 76 | Go | 2 | RTSP/ONVIF camera snapshots | Tier 2 — camera hardware |
| gifgrep | 115 | Go | 3 | Search GIFs | Tier 3 — too niche |
| eightctl | 59 | Go | 3 | Eight Sleep bed control | Tier 3 — IoT appliance |
| ordercli | 63 | Go | 3 | Food delivery CLI | Tier 3 — too niche |
| spogo | 178 | Go | 3 | Spotify terminal CLI | Tier 3 — too niche |
| sonoscli | 116 | Go | 3 | Sonos speaker control | Tier 3 — IoT |
| songsee | 51 | Go | 3 | Audio spectrograms | Tier 3 — audio viz |
| metcli | 28 | Go | 3 | Meta data export | Tier 3 — too niche |
| sweet-cookie | 148 | TypeScript | 3 | Browser cookie extractor | Tier 3 — deferred |
| sweetcookie | 14 | Go | 3 | Browser cookies in Go | Tier 3 — deferred |
| VibeMeter | 378 | Swift | 3 | AI cost meter menu bar app | Tier 3 — Swift desktop app |
| CodeLooper | 136 | Swift | 3 | macOS menu bar for Claude Code loops | Tier 3 — Swift app |
| reloaderoo | 1 | TypeScript | 3 | MCP debugging proxy | Tier 3 — dev tool only |
| research | 8 | — | 3 | Async research inspiration | Tier 3 — reference only |
| lore.md | 10 | TypeScript | 3 | Random markdown website generator | Tier 3 — too niche |
| bench | 6 | TypeScript | 3 | React playground | Tier 3 — experiment |
| cc-env-setup | 6 | Shell | 3 | Claude Code env setup scripts | Tier 3 — personal setup |
| dupcanon | 7 | Python | 3 | Canonical duplicate detection | Tier 3 — too niche |
| steipete.me | 393 | Astro | 3 | Personal website | Tier 3 — blog |
| SOUL.md | 22 | HTML | 3 | SOUL.md website | Tier 3 — content |
| demark-landing | 2 | TypeScript | 3 | Demark landing page | Tier 3 — marketing site |
| clawdbot.com | 18 | HTML | 3 | Clawdbot website | Tier 3 — static site |
| speaking | 191 | — | 3 | Speaking engagements list | Tier 3 — personal |
| steipete | 96 | — | 3 | GitHub profile readme | Tier 3 — profile |

---

## Amaanb27241919 Repos

| Repo | Stars | Language | Tier | Purpose | Integration Status |
|------|-------|----------|------|---------|-------------------|
| Carbon-Copy | 0 | JavaScript | — | This project | Already local |
| aria-runtime | 0 | JavaScript | 1 | ARIA autonomous research runtime | Cloned to Raw/aria-runtime; reviewed |
| aria-intel-spark | 0 | TypeScript | 1 | ARIA intelligence spark (TypeScript variant) | Cloned to Raw/aria-intel-spark; reviewed |
| aria-fresh | 0 | JavaScript | 1 | ARIA fresh build | Cloned to Raw/aria-fresh; reviewed |
| OmniFlow-Technologies | 0 | TypeScript | 2 | Marketing/landing site only | Tier 2 — no runtime logic |
| amchicago | 0 | TypeScript | 2 | Unknown purpose | Tier 2 — deferred |
| CMSC-2200 | 0 | Java | 3 | Coursework | Tier 3 — academic |
| FA21-KHAN-CMSC2200 | 0 | Java | 3 | Coursework | Tier 3 — academic |
