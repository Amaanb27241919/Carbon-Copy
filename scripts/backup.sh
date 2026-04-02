#!/usr/bin/env bash
# Backup PostgreSQL + config to ./storage/backups/
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$PROJECT_DIR/storage/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

cd "$PROJECT_DIR"

if [ ! -f ".env" ]; then
  echo "ERROR: .env not found"
  exit 1
fi

# Load env
set -a; source .env; set +a

mkdir -p "$BACKUP_DIR"

echo "[$TIMESTAMP] Starting Carbon-Copy backup..."

# ── PostgreSQL dump ────────────────────────────────────────────────────────
echo "  Backing up PostgreSQL..."
docker compose exec -T postgres pg_dumpall \
  -U "${POSTGRES_USER}" \
  --clean \
  > "${BACKUP_DIR}/postgres_${TIMESTAMP}.sql"
gzip "${BACKUP_DIR}/postgres_${TIMESTAMP}.sql"
echo "  → ${BACKUP_DIR}/postgres_${TIMESTAMP}.sql.gz"

# ── .env backup (encrypted with openssl) ──────────────────────────────────
echo "  Backing up .env (encrypted)..."
openssl enc -aes-256-cbc -salt -pbkdf2 \
  -in "$PROJECT_DIR/.env" \
  -out "${BACKUP_DIR}/env_${TIMESTAMP}.enc" \
  -pass "pass:${INTERNAL_SERVICE_TOKEN}"
echo "  → ${BACKUP_DIR}/env_${TIMESTAMP}.enc"

# ── Prune old backups (keep last 7) ───────────────────────────────────────
echo "  Pruning old backups (keeping last 7)..."
ls -t "${BACKUP_DIR}"/postgres_*.sql.gz 2>/dev/null | tail -n +8 | xargs -r rm --
ls -t "${BACKUP_DIR}"/env_*.enc 2>/dev/null | tail -n +8 | xargs -r rm --

echo "  Backup complete: ${BACKUP_DIR}/"
