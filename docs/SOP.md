# Carbon-Copy — Standard Operating Procedure

**Version:** 1.0 | **Audience:** Anyone with access to the repository

---

## Table of Contents

1. [What Is Carbon-Copy?](#1-what-is-carbon-copy)
2. [Prerequisites](#2-prerequisites)
3. [First-Time Setup](#3-first-time-setup)
4. [Starting the System](#4-starting-the-system)
5. [Accessing the System](#5-accessing-the-system)
6. [Using the iPhone / iPad App](#6-using-the-iphone--ipad-app)
7. [Running AI Projects (OpenClaw, NemoClaw, etc.)](#7-running-ai-projects)
8. [Creating and Using Virtual Machines (QEMU/KVM)](#8-virtual-machines)
9. [Running Any GitHub AI Repo Safely](#9-sandbox-runner)
10. [Managing AI Models](#10-managing-ai-models)
11. [Cloud Storage and File Access](#11-cloud-storage-and-file-access)
12. [Homelab Services](#12-homelab-services)
13. [Daily Operations](#13-daily-operations)
14. [Troubleshooting](#14-troubleshooting)
15. [Security Guidelines](#15-security-guidelines)

---

## 1. What Is Carbon-Copy?

Carbon-Copy is a self-hosted server platform that runs on your own hardware and gives you:

- **AI Cloud** — Run and use AI services (code analysis, NLP, chat with any model)
- **Virtual Machines** — Full QEMU/KVM VMs you can SSH into, just like a cloud VPS
- **Safe Sandbox** — Run any AI GitHub repo in an isolated container
- **Data Server** — PostgreSQL database + S3-compatible object storage (MinIO)
- **Homelab** — Photo backup, file shares, VPN, ad blocking, file sync
- **Control Panel** — Web app installable on iPhone/iPad like a native app

Everything runs on **your hardware**, behind **your network**. No monthly fees, no cloud dependency.

---

## 2. Prerequisites

### Minimum Hardware
| Resource | Minimum | Recommended |
|---|---|---|
| CPU | 4 cores (x86_64) | 8+ cores with VT-x/AMD-V enabled |
| RAM | 8 GB | 16–32 GB |
| Storage | 50 GB free | 500 GB+ SSD |
| OS | Linux (Ubuntu 22.04+) | Ubuntu 22.04 LTS |

> **macOS / Windows:** Carbon-Copy runs on Docker Desktop. QEMU/KVM VMs will use software emulation (slower). All other services work fully.

### Required Software

**Linux / macOS:**
```bash
# Install Docker
curl -fsSL https://get.docker.com | sh          # Linux
# Or: install Docker Desktop from docker.com     # macOS

# Verify
docker --version          # must be 24+
docker compose version    # must be v2.x
```

**Windows:**
1. Install [Docker Desktop for Windows](https://docs.docker.com/desktop/windows/)
2. Enable WSL2 integration in Docker Desktop settings
3. Open **PowerShell as Administrator** for all commands below

### Check KVM Support (Linux only — needed for full-speed VMs)
```bash
grep -c vmx /proc/cpuinfo    # Intel: should be > 0
grep -c svm /proc/cpuinfo    # AMD:   should be > 0
ls /dev/kvm                  # should exist
```

If `/dev/kvm` doesn't exist:
```bash
sudo modprobe kvm
sudo modprobe kvm_intel       # or kvm_amd
sudo usermod -aG kvm $USER    # add yourself to kvm group, then log out/in
```

---

## 3. First-Time Setup

### Step 1 — Get the code
```bash
git clone https://github.com/Amaanb27241919/Carbon-Copy.git
cd Carbon-Copy
```

### Step 2 — Generate secrets

**Linux / macOS:**
```bash
bash scripts/generate-secrets.sh
```

**Windows (PowerShell):**
```powershell
.\scripts\generate-secrets.ps1
```

This creates a `.env` file with randomised passwords and tokens. **Do not skip this step.**

### Step 3 — Configure your IP address

Open `.env` and set your server's local IP:
```env
HOST_IP=192.168.1.100    # replace with your actual LAN IP
```

Find your IP with:
```bash
ip route get 1 | awk '{print $7; exit}'    # Linux
ipconfig getifaddr en0                      # macOS
(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike '*Loopback*' })[0].IPAddress   # Windows
```

### Step 4 — (Optional) Configure AI providers

By default, Carbon-Copy uses **Ollama** (fully local, no API key needed). To use cloud AI:

```env
# In .env — add whichever you want:
ANTHROPIC_API_KEY=sk-ant-...     # Claude
OPENAI_API_KEY=sk-...            # OpenAI
HF_API_KEY=hf_...               # HuggingFace
```

### Step 5 — (Optional) Homelab extras

```env
TAILSCALE_AUTH_KEY=tskey-auth-...    # VPN — get from tailscale.com
DUCKDNS_TOKEN=...                    # Dynamic DNS — get from duckdns.org
DUCKDNS_SUBDOMAIN=mycarbon          # your chosen subdomain
```

---

## 4. Starting the System

### Core services only
```bash
bash scripts/start.sh           # Linux/macOS
.\scripts\start.ps1             # Windows
```

### Core + Homelab + Storage services
```bash
bash scripts/start-homelab.sh   # Linux/macOS
.\scripts\start-homelab.ps1     # Windows
```

### Stop everything
```bash
bash scripts/stop.sh
```

### Check status
```bash
docker compose ps
```
All services should show `Up` with `healthy` after ~60 seconds.

---

## 5. Accessing the System

Replace `HOST_IP` with your server's IP address in all URLs below.

| What | URL | Notes |
|---|---|---|
| **PWA Dashboard** | `http://HOST_IP/app` | Install on iPhone via Safari |
| **VS Code** | `http://HOST_IP/code` | Password: `CODE_SERVER_PASSWORD` from `.env` |
| **Service Status** | `http://HOST_IP/status` | Uptime Kuma |
| **Photo Backup** | `http://HOST_IP/photos` | Immich (also port 2283) |
| **File Sync** | `http://HOST_IP/sync` | Syncthing |
| **VM Console** | `http://HOST_IP/console` | noVNC browser terminal |
| **API** | `http://HOST_IP/api` | Gateway — requires JWT |

### Default Login
- **Username:** `admin`
- **Password:** `changeme`

**Change the admin password immediately after first login.**

---

## 6. Using the iPhone / iPad App

### Install (no App Store needed)
1. Connect your iPhone to the same WiFi network as your server
2. Open **Safari** and go to `http://YOUR_SERVER_IP/app`
3. Tap the **Share** button (box with arrow)
4. Tap **Add to Home Screen**
5. Tap **Add** — Carbon Cloud appears as a full-screen app

### Remote access (away from home WiFi)
Set up Tailscale (see Section 12) — then access `http://carbon-copy/app` from anywhere in the world using your iPhone's Tailscale connection.

### App Tabs

| Tab | What you can do |
|---|---|
| **Dashboard** | See if all services are running, recent AI activity |
| **Projects** | Start/stop services, run GitHub repos in sandbox |
| **Models** | Chat with any AI model, switch providers, pull local models |
| **Files** | Browse MinIO storage, upload files |
| **Terminal** | View live container logs |
| **Settings** | Switch AI provider, enter API keys |

---

## 7. Running AI Projects

### OpenClaw — Code Analysis & Generation

**Analyze code:**
```bash
# Get a login token first
TOKEN=$(curl -s -X POST http://HOST_IP/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"changeme"}' | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

# Analyze code
curl -X POST http://HOST_IP/api/openclaw/analyze \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "def fib(n): return fib(n-1) + fib(n-2)",
    "language": "python"
  }'
```

**Generate code:**
```bash
curl -X POST http://HOST_IP/api/openclaw/generate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Write a rate limiter in Python using Redis",
    "language": "python"
  }'
```

### NemoClaw — Language Intelligence

```bash
# Classify text
curl -X POST http://HOST_IP/api/nemoclaw/classify \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text": "This GPU delivers amazing performance", "labels": ["tech","finance","sports"]}'

# Summarise text
curl -X POST http://HOST_IP/api/nemoclaw/summarize \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text": "Long article...", "max_length": 100, "style": "bullet-points"}'

# Generate embeddings
curl -X POST http://HOST_IP/api/nemoclaw/embed \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"texts": ["Hello world", "Machine learning is fascinating"]}'
```

### Switch AI Model at Any Time
```bash
# Use Claude for this request
curl -X POST http://HOST_IP/api/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role":"user","content":"Explain quantum computing"}], "provider": "claude"}'

# Use local Ollama
curl -X POST http://HOST_IP/api/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role":"user","content":"Write a haiku"}], "provider": "ollama", "model": "llama3.2"}'
```

---

## 8. Virtual Machines

Carbon-Copy includes a full QEMU/KVM hypervisor. Each VM is a real virtual machine with its own OS that you can SSH into — exactly like an AWS EC2 instance or a VPS, but running on your own hardware.

### Supported Operating Systems
| Key | OS | Default RAM | Default Disk |
|---|---|---|---|
| `ubuntu-22.04` | Ubuntu 22.04 LTS | 2 GB | 20 GB |
| `ubuntu-24.04` | Ubuntu 24.04 LTS | 2 GB | 20 GB |
| `debian-12` | Debian 12 Bookworm | 1 GB | 20 GB |
| `alpine-3.19` | Alpine Linux 3.19 | 512 MB | 8 GB |

### Step 1 — Create a VM
```bash
curl -X POST http://HOST_IP/api/kvm/vms \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-ai-vm",
    "os": "ubuntu-22.04",
    "ram_mb": 4096,
    "cpus": 4,
    "disk_gb": 50,
    "description": "VM for running OpenClaw experiments"
  }'
```

Response:
```json
{
  "id": "3f4a1b2c-...",
  "name": "my-ai-vm",
  "os_display": "Ubuntu 22.04 LTS",
  "status": "stopped",
  "ssh_port": 2200,
  "ssh_command": "ssh user@192.168.1.100 -p 2200"
}
```

### Step 2 — Boot from installation ISO (first time)
```bash
curl -X POST http://HOST_IP/api/kvm/vms/VM_ID/start \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"boot_iso": true}'
```

> This downloads the OS ISO (~1 GB) and boots into the installer. Use the browser console to complete OS installation.

**Open the browser console:**
Go to `http://HOST_IP/console` in your browser to see and interact with the VM screen.

### Step 3 — Complete OS installation
In the noVNC console:
1. Follow the installer prompts
2. **Important:** When asked about SSH, enable OpenSSH server
3. Set a username and password you'll remember
4. Allow installation to complete and VM to reboot

### Step 4 — Boot normally and SSH in
```bash
# Boot from disk (not ISO) after installation
curl -X POST http://HOST_IP/api/kvm/vms/VM_ID/start \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"boot_iso": false}'

# Wait ~30 seconds for the OS to boot, then SSH in
ssh your-username@HOST_IP -p 2200
```

> Port 2200 is VM slot 0. The second VM uses 2201, third uses 2202, etc.

### VM Management Commands

```bash
# List all VMs
curl http://HOST_IP/api/kvm/vms -H "Authorization: Bearer $TOKEN"

# Stop a VM (graceful)
curl -X POST http://HOST_IP/api/kvm/vms/VM_ID/stop \
  -H "Authorization: Bearer $TOKEN"

# Force stop (like pulling the power)
curl -X POST http://HOST_IP/api/kvm/vms/VM_ID/stop \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"force": true}'

# Delete VM (stops it and removes disk)
curl -X DELETE http://HOST_IP/api/kvm/vms/VM_ID \
  -H "Authorization: Bearer $TOKEN"
```

### KVM vs. Software Emulation

| | KVM (Linux host) | Software (macOS/Windows) |
|---|---|---|
| Speed | Near-native | 5–20x slower |
| Requirement | `/dev/kvm` + VT-x/AMD-V | None |
| Status shown in | `kvm_enabled: true` in API response | `kvm_enabled: false` |

The API response includes `kvm_enabled` so you always know which mode is active.

---

## 9. Sandbox Runner

The sandbox safely runs any GitHub AI repository without risking your main system.

### Run a GitHub repo
```bash
curl -X POST http://HOST_IP/api/sandbox/run \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "repoUrl": "https://github.com/username/some-ai-project",
    "name": "my-experiment",
    "cpuLimit": 2,
    "memoryMb": 2048
  }'
```

Response (immediate — job runs in background):
```json
{
  "runId": "abc123",
  "status": "starting",
  "message": "Cloning repo and building container..."
}
```

### Check status and view logs
```bash
# Poll status
curl http://HOST_IP/api/sandbox/runs/abc123 \
  -H "Authorization: Bearer $TOKEN"

# Get logs
curl "http://HOST_IP/api/sandbox/runs/abc123/logs?tail=50" \
  -H "Authorization: Bearer $TOKEN"
```

### Stop a running sandbox
```bash
curl -X POST http://HOST_IP/api/sandbox/runs/abc123/stop \
  -H "Authorization: Bearer $TOKEN"
```

### What the sandbox does automatically
1. Clones the repo (depth 1 — fast)
2. Detects project type: Python → `pip install -r requirements.txt` / Node.js → `npm install` / Go → `go build` / Rust → `cargo build` / Custom `Dockerfile` → builds it
3. Runs in an isolated container with:
   - No internet access during execution (`--network none`)
   - Hard CPU cap (default: 2 cores)
   - Hard RAM cap (default: 2 GB)
   - Auto-killed after 30 minutes
4. Streams logs back in real time
5. Cleans up everything when done

---

## 10. Managing AI Models

### Pull a local Ollama model
```bash
bash scripts/add-model.sh llama3.2          # 2 GB, fast
bash scripts/add-model.sh codellama         # 4 GB, code-focused
bash scripts/add-model.sh mistral           # 4 GB, general purpose
bash scripts/add-model.sh nomic-embed-text  # small, for embeddings
```

**Windows:**
```powershell
.\scripts\add-model.ps1 llama3.2
```

### List available models
```bash
curl http://HOST_IP/api/models \
  -H "Authorization: Bearer $TOKEN"
```

### Switch default provider
Edit `.env`:
```env
DEFAULT_PROVIDER=claude    # or: openai | ollama | huggingface
```

Then restart the model-router service:
```bash
bash scripts/deploy-project.sh model-router
```

---

## 11. Cloud Storage and File Access

### Access from iPhone (Files app)
1. Open **Files** app
2. Tap **...** → **Connect to Server**
3. Enter: `smb://HOST_IP`
4. Username: `carbon` | Password: `SAMBA_PASSWORD` from `.env`
5. Shares appear: `shared`, `ai-outputs`, `photos`

### Access from Windows
Open File Explorer address bar:
```
\\HOST_IP\shared
\\HOST_IP\ai-outputs
```

### Access from macOS
Finder → Go → Connect to Server → `smb://HOST_IP`

### MinIO (S3-compatible API)
```bash
# Upload a file via API
curl -X POST http://HOST_IP/api/data/files \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/your/file.pdf" \
  -F "bucket=carbon-outputs" \
  -F "key=my-folder/file.pdf"

# Download
curl http://HOST_IP/api/data/files/carbon-outputs/my-folder/file.pdf \
  -H "Authorization: Bearer $TOKEN" \
  -o downloaded-file.pdf
```

### Backup
```bash
bash scripts/backup.sh
```
Creates a compressed PostgreSQL dump + encrypted `.env` backup in `storage/backups/`. Run nightly via cron:
```bash
# Add to crontab (Linux/macOS)
crontab -e
# Add this line:
0 2 * * * cd /path/to/Carbon-Copy && bash scripts/backup.sh >> /var/log/carbon-backup.log 2>&1
```

---

## 12. Homelab Services

### VPN — Access from Anywhere (Tailscale)

1. Create a free account at [tailscale.com](https://tailscale.com)
2. Generate an auth key: **Settings → Keys → Generate auth key**
3. Add to `.env`: `TAILSCALE_AUTH_KEY=tskey-auth-xxxxx`
4. Start homelab services: `bash scripts/start-homelab.sh`
5. Install Tailscale on your iPhone from the App Store
6. Your server appears as `carbon-copy` in your Tailscale network
7. Access everything at `http://carbon-copy/app` from anywhere

### Dynamic DNS (DuckDNS)

Gives your home server a stable domain name even when your ISP changes your IP.

1. Create account at [duckdns.org](https://www.duckdns.org)
2. Create a subdomain (e.g. `mycarbon`)
3. Copy your token from the DuckDNS dashboard
4. Add to `.env`:
   ```env
   DUCKDNS_SUBDOMAIN=mycarbon
   DUCKDNS_TOKEN=your-token-here
   ```
5. Your server is reachable at `mycarbon.duckdns.org`

### iPhone Photo Backup (Immich)

1. Start homelab: `bash scripts/start-homelab.sh`
2. Install **Immich** from the App Store
3. Open Immich → tap **+** → Server URL: `http://HOST_IP/photos`
4. Create an account in the Immich web UI (`http://HOST_IP/photos`)
5. Enable **Background App Refresh** in iPhone Settings → Immich
6. Your camera roll backs up automatically over WiFi

### Pi-hole (Ad Blocking)

1. Start homelab services
2. Open Pi-hole admin: `http://HOST_IP/dns`
3. Set your router's DNS to `HOST_IP` (in your router's DHCP settings)
4. All devices on your network now have ad blocking

### Syncthing (File Sync)

1. Open Syncthing UI: `http://HOST_IP/sync` (also port 8384)
2. Install Syncthing on your other devices
3. Add the server as a remote device using the device ID shown in the UI
4. Share the `storage/shared` folder — it syncs to all devices automatically

---

## 13. Daily Operations

### Rebuild a single service after code change
```bash
bash scripts/deploy-project.sh openclaw    # or: nemoclaw, gateway, etc.
```

### View live logs
```bash
docker compose logs -f                     # all services
docker compose logs -f openclaw            # one service
docker compose logs -f kvm-manager         # VM manager
```

### Database access
```bash
docker compose exec postgres psql -U carbon -d carbon_db
```

### Restart a service
```bash
docker compose restart openclaw
```

### Update to latest code
```bash
git pull origin main
docker compose up -d --build
```

---

## 14. Troubleshooting

### Service won't start

```bash
docker compose ps                          # check which services are unhealthy
docker compose logs service-name           # read the error
docker compose restart service-name        # try a restart
```

### VM won't boot / SSH won't connect

```bash
# Check kvm-manager logs
docker compose logs kvm-manager

# Check if KVM is available on the host
ls -la /dev/kvm

# Check if SSH port is open (e.g., port 2200 for VM slot 0)
nc -zv HOST_IP 2200

# Force stop a stuck VM
curl -X POST http://HOST_IP/api/kvm/vms/VM_ID/stop \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"force": true}'
```

### KVM not available (macOS/Windows)

Remove the `devices` block from the `kvm-manager` service in `docker-compose.yml`:
```yaml
# Delete these lines:
devices:
  - /dev/kvm:/dev/kvm
```

VMs will still work — just slower (software emulation).

### AI service returns 502

The upstream AI service (openclaw/nemoclaw) is down or starting up.

```bash
docker compose logs openclaw
docker compose restart openclaw
```

### Forgot admin password

```bash
# Reset it directly in the database
docker compose exec postgres psql -U carbon -d carbon_db -c \
  "UPDATE users SET password_hash = '\$2b\$10\$rOFVAcqS6P2LWjTjxPt4guNjJSSLMDEQHgBBqCYrLNP/7vQ9Lyk4a' WHERE username = 'admin';"
# This resets it to: changeme
```

### Disk space low

```bash
# Check usage
df -h
docker system df

# Clean up stopped containers and unused images
docker system prune -f

# List VM disk images
ls -lh /path/to/vm-images/*.qcow2
```

---

## 15. Security Guidelines

**Before exposing Carbon-Copy to the internet:**

1. **Change the default admin password** — log in and change it immediately
2. **Generate secrets** — always run `generate-secrets.sh` before first use, never use the example placeholders
3. **Never commit `.env`** — it's in `.gitignore` but double-check with `git status`
4. **Use Tailscale instead of port forwarding** — Tailscale is end-to-end encrypted and doesn't expose ports to the internet
5. **Keep VM disk images private** — they may contain sensitive data; treat `storage/` like a personal drive
6. **Rotate `INTERNAL_SERVICE_TOKEN` regularly** — changing it requires a `docker compose restart`
7. **Backup before updates** — run `bash scripts/backup.sh` before `git pull`

**Port exposure summary:**

| Port | Service | Expose to internet? |
|---|---|---|
| 80 | nginx (all web traffic) | Only via Tailscale or with HTTPS |
| 2200–2209 | VM SSH ports | Never — use Tailscale |
| 5900–5909 | VM VNC ports | Never |
| 9001 | MinIO console | Never |
| 8384 | Syncthing | Never |
| 3001 | Uptime Kuma | Optional — read-only |
| 11434 | Ollama | Never |

**The safest setup:** expose nothing to the internet. Use Tailscale to access everything privately and securely from your iPhone anywhere in the world.
