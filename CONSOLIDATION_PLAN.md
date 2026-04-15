# Carbon-Copy v2 → Carbon-Copy Consolidation

**Status**: Ready to Execute  
**Date**: April 13, 2026

---

## Goal
Merge all Phase 2-4 features from Carbon-Copy-v2 into the main Carbon-Copy Docker platform.

**Result**: Single, unified self-hosted AI intelligence platform (aria-service fully integrated).

---

## What's Moving

From `~/Desktop/OmniFlow/Carbon-Copy-v2/` → `~/Desktop/OmniFlow/Carbon-Copy/aria-service/src/`

### Core Services
```
budget-service.js          → services/budget.js
files-manager.js           → services/files.js
chat-streaming-service.js  → services/chat.js
claude-code-agent.js       → services/claude-code.js
proposal-generator.js      → services/proposals.js
```

### API Routes
```
api-routes-budget.js       → routes/budget.js
(consolidate into routes/index.js)
```

### Database Migrations
```
New tables:
- cost_tracking
- budget_policies
- cost_alerts
```

---

## File Changes

### 1. `aria-service/src/index.js` (UPDATED)
Integrate all new services into the Express app

```javascript
const BudgetService = require('./services/budget');
const FilesManager = require('./services/files');
const ChatStreamingService = require('./services/chat');
const ClaudeCodeAgent = require('./services/claude-code');
const ProposalGenerator = require('./services/proposals');

const budgetService = new BudgetService(DB_PATH);
const filesManager = new FilesManager();
const chatService = new ChatStreamingService();
const codeAgent = new ClaudeCodeAgent();
const proposalGen = new ProposalGenerator(DB_PATH);
```

### 2. `aria-service/src/routes/index.js` (NEW)
Consolidate all routes:

```javascript
module.exports = (app, services) => {
  require('./missions')(app, services);
  require('./agents')(app, services);
  require('./budget')(app, services);
  require('./files')(app, services);
  require('./chat')(app, services);
  require('./claude-code')(app, services);
  require('./proposals')(app, services);
  require('./clients')(app, services);
};
```

### 3. `docker-compose.yml` (UPDATED)
- Keep aria-service as single service
- Add BUDGET_*, MINIO_* env vars if needed
- No changes to other services

### 4. Database (NEW TABLES)
- Run migration on existing postgres:5432
- cost_tracking, budget_policies, cost_alerts

---

## Steps

### 1. Copy Services
```bash
cp ~/Desktop/OmniFlow/Carbon-Copy-v2/budget-service.js ~/Desktop/OmniFlow/Carbon-Copy/aria-service/src/services/budget.js
cp ~/Desktop/OmniFlow/Carbon-Copy-v2/files-manager.js ~/Desktop/OmniFlow/Carbon-Copy/aria-service/src/services/files.js
# ... (5 more files)
```

### 2. Update aria-service/src/index.js
- Import all services
- Initialize them with correct paths
- Wire them into Express

### 3. Create route handlers
- `routes/budget.js`
- `routes/files.js`
- `routes/chat.js`
- `routes/claude-code.js`
- `routes/proposals.js`

### 4. Update database init
- Add new tables to `database/init/05_aria.sql`

### 5. Test
```bash
docker-compose down
docker-compose up
curl http://localhost:3008/api/budget/status
curl http://localhost:3008/api/files
```

### 6. Clean up
```bash
rm -rf ~/Desktop/OmniFlow/Carbon-Copy-v2/  # keep git history
```

---

## Benefits
- **Single deployment** — no managing 2 repos
- **Unified logging** — all services in one container
- **Shared database** — consistent cost/mission tracking
- **Easier maintenance** — one git repo, one docker-compose
- **Production-ready** — everything runs on Railway

---

## Timeline
- **Now**: Stripe go-live for ARIA
- **After Stripe approved**: Merge v2 into main
- **By May 15**: Full deployment live

---

## Git
After consolidation, Carbon-Copy-v2 becomes historical. Main repo:
```
https://github.com/Amaanb27241919/Carbon-Copy
```
