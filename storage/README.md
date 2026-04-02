# Carbon-Copy Local Storage

This directory is mounted into homelab services for network-accessible file storage.

| Folder | Service | Access |
|---|---|---|
| `shared/` | Samba + Syncthing | SMB share `\\HOST\shared`, synced to all devices |
| `ai-outputs/` | Samba | SMB share `\\HOST\ai-outputs` — AI model outputs exported here |
| `backups/` | Backup scripts | Automated database + config backups |

## Accessing from iPhone
1. Open the **Files** app
2. Tap **...** → **Connect to Server**
3. Enter `smb://YOUR_HOST_IP`
4. Log in with the Samba username/password from your `.env`

## Accessing from Windows
Open File Explorer → address bar → `\\YOUR_HOST_IP\shared`

## Accessing from macOS
Finder → Go → Connect to Server → `smb://YOUR_HOST_IP`
