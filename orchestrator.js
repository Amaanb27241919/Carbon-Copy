// Carbon-Copy v2 Orchestrator
// Multi-agent system for ARIA mission management + execution + delivery
// Based on Business OS architecture adapted for ARIA

const EventEmitter = require('events');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');

class Agent {
  constructor(id, name, role, capabilities) {
    this.id = id;
    this.name = name;
    this.role = role; // 'scanner', 'researcher', 'synthesizer', 'deliverer', 'client_mgr'
    this.capabilities = capabilities;
    this.status = 'idle'; // idle, planning, executing, outputting, delivered, error
    this.currentTask = null;
    this.tokensUsedToday = 0;
    this.costToday = 0;
    this.lastUpdate = new Date();
  }

  setState(status, task = null) {
    this.status = status;
    this.currentTask = task;
    this.lastUpdate = new Date();
  }

  addCost(tokens, costUSD) {
    this.tokensUsedToday += tokens;
    this.costToday += costUSD;
  }

  reset() {
    this.status = 'idle';
    this.currentTask = null;
    this.tokensUsedToday = 0;
    this.costToday = 0;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      role: this.role,
      status: this.status,
      currentTask: this.currentTask,
      tokensUsedToday: this.tokensUsedToday,
      costToday: this.costToday,
      lastUpdate: this.lastUpdate,
    };
  }
}

class Orchestrator extends EventEmitter {
  constructor(configPath = './carbon-copy-config.json') {
    super();
    this.config = this.loadConfig(configPath);
    this.agents = this.initializeAgents();
    this.db = this.initializeDatabase();
    this.knowledgeVault = this.config.knowledgeVaultPath || path.expandUser('~/aria-knowledge');
    this.taskQueue = [];
    this.missionLog = [];
    this.budgetState = {
      dailyLimit: this.config.budgetDailyUSD || 50,
      monthlyLimit: this.config.budgetMonthlyUSD || 1000,
      spentToday: 0,
      spentThisMonth: 0,
      threshold: 0.8,
    };
  }

  loadConfig(configPath) {
    try {
      if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
      }
    } catch (e) {
      console.warn(`Could not load config from ${configPath}, using defaults`);
    }
    const homeDir = process.env.HOME || os.homedir();
    return {
      anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
      perplexityApiKey: process.env.PERPLEXITY_API_KEY || '',
      knowledgeVaultPath: process.env.KNOWLEDGE_VAULT_PATH || path.join(homeDir, 'aria-knowledge'),
      budgetDailyUSD: parseFloat(process.env.BUDGET_DAILY_USD) || 50,
      budgetMonthlyUSD: parseFloat(process.env.BUDGET_MONTHLY_USD) || 1000,
      ariaApiUrl: process.env.ARIA_API_URL || 'http://localhost:3001',
      databasePath: process.env.DATABASE_PATH || './carbon-copy.db',
    };
  }

  initializeAgents() {
    return {
      scan: new Agent('scan', 'Scanner', 'scanner', ['route', 'prioritize', 'monitor']),
      research: new Agent('research', 'Researcher', 'researcher', ['mission', 'parallel-search', 'synthesis']),
      synthesis: new Agent('synthesis', 'Synthesizer', 'synthesizer', ['format', 'structure', 'polish']),
      delivery: new Agent('delivery', 'Delivery', 'deliverer', ['email', 'slack', 'pdf', 'webhook']),
      client_mgr: new Agent('client_mgr', 'Client Manager', 'client_mgr', ['memory', 'preferences', 'history']),
    };
  }

  initializeDatabase() {
    const db = new Database(this.config.databasePath);
    db.pragma('journal_mode = WAL');
    
    // Create tables if not exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS missions (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        goal TEXT,
        status TEXT DEFAULT 'pending',
        started_at DATETIME,
        completed_at DATETIME,
        tokens_used INTEGER DEFAULT 0,
        cost_usd REAL DEFAULT 0,
        output_path TEXT,
        output_summary TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS agents_state (
        agent_id TEXT PRIMARY KEY,
        status TEXT DEFAULT 'idle',
        current_task TEXT,
        tokens_today INTEGER DEFAULT 0,
        cost_today REAL DEFAULT 0,
        last_update DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS clients (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        industry TEXT,
        monthly_budget REAL DEFAULT 1000,
        current_spend REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor TEXT,
        action TEXT,
        entity_id TEXT,
        details TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_missions_client ON missions(client_id);
      CREATE INDEX IF NOT EXISTS idx_missions_status ON missions(status);
      CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor);
    `);

    return db;
  }

  // SCANNER — routes incoming requests
  async scan(request) {
    this.agents.scan.setState('planning', `scan:${request.id}`);
    this.emit('agent:status', { agent: 'scan', status: 'planning' });

    try {
      // Classify request type
      const classification = await this.classifyRequest(request);
      
      // Route to appropriate agent
      const task = {
        id: request.id,
        clientId: request.clientId,
        type: classification.type,
        priority: classification.priority,
        goal: request.goal,
        context: request.context,
      };

      this.taskQueue.push(task);
      this.agents.scan.setState('idle');
      this.emit('task:queued', task);

      return { success: true, taskId: task.id, nextAgent: 'research' };
    } catch (e) {
      this.agents.scan.setState('error', e.message);
      this.logAudit('scan', 'error', request.id, e.message);
      throw e;
    }
  }

  // RESEARCH — runs ARIA missions
  async research(task) {
    this.agents.research.setState('executing', `research:${task.id}`);
    this.emit('agent:status', { agent: 'research', status: 'executing' });

    try {
      // Check budget
      if (!this.canExecuteMission(task)) {
        throw new Error('Budget limit reached');
      }

      // Get blueprint from knowledge vault
      const blueprint = await this.getBlueprint(task.type);

      // Run ARIA mission
      const missionResult = await this.runARIAMission({
        goal: task.goal,
        clientId: task.clientId,
        blueprintId: blueprint.id,
        context: task.context,
      });

      // Update cost tracking
      this.agents.research.addCost(missionResult.tokensUsed, missionResult.costUSD);
      this.budgetState.spentToday += missionResult.costUSD;
      this.budgetState.spentThisMonth += missionResult.costUSD;

      // Save output
      const outputPath = await this.saveOutput(missionResult, task);

      task.output = missionResult;
      task.outputPath = outputPath;
      task.status = 'researched';

      this.agents.research.setState('idle');
      this.emit('mission:researched', task);

      return task;
    } catch (e) {
      this.agents.research.setState('error', e.message);
      this.logAudit('research', 'error', task.id, e.message);
      throw e;
    }
  }

  // SYNTHESIS — formats output
  async synthesis(task) {
    this.agents.synthesis.setState('executing', `synthesis:${task.id}`);
    this.emit('agent:status', { agent: 'synthesis', status: 'executing' });

    try {
      // Get output template
      const template = await this.getTemplate(task.type);

      // Format using template
      const formatted = await this.formatOutput({
        output: task.output,
        template: template,
        clientId: task.clientId,
      });

      task.formatted = formatted;
      task.status = 'synthesized';

      this.agents.synthesis.setState('idle');
      this.emit('mission:synthesized', task);

      return task;
    } catch (e) {
      this.agents.synthesis.setState('error', e.message);
      this.logAudit('synthesis', 'error', task.id, e.message);
      throw e;
    }
  }

  // DELIVERY — sends to client
  async delivery(task) {
    this.agents.delivery.setState('executing', `delivery:${task.id}`);
    this.emit('agent:status', { agent: 'delivery', status: 'executing' });

    try {
      const client = this.db.prepare('SELECT * FROM clients WHERE id = ?').get(task.clientId);
      
      // Dispatch based on preferences
      const result = await this.dispatchToClient({
        task: task,
        client: client,
        format: task.format || 'pdf',
      });

      task.delivered = true;
      task.status = 'delivered';
      task.deliveredAt = new Date().toISOString();

      this.agents.delivery.setState('idle');
      this.logAudit('delivery', 'send', task.id, `Delivered to ${client.name}`);
      this.emit('mission:delivered', task);

      return task;
    } catch (e) {
      this.agents.delivery.setState('error', e.message);
      this.logAudit('delivery', 'error', task.id, e.message);
      throw e;
    }
  }

  // CLIENT MANAGER — updates client knowledge
  async clientMgr(task) {
    this.agents.client_mgr.setState('executing', `client_mgr:${task.id}`);

    try {
      // Extract insights from mission
      const insights = await this.extractInsights(task);

      // Update client knowledge vault
      await this.updateClientKnowledge(task.clientId, insights);

      // Update preferences if learned
      await this.updateClientPreferences(task.clientId, insights);

      this.agents.client_mgr.setState('idle');
      this.logAudit('client_mgr', 'update', task.clientId, `Updated from mission ${task.id}`);
      this.emit('client:updated', { clientId: task.clientId, insights });

      return task;
    } catch (e) {
      this.agents.client_mgr.setState('error', e.message);
      this.logAudit('client_mgr', 'error', task.clientId, e.message);
      throw e;
    }
  }

  // Main orchestration loop
  async executeMissionLoop() {
    console.log('[Orchestrator] Starting mission loop...');
    
    while (true) {
      try {
        if (this.taskQueue.length === 0) {
          await this.sleep(5000); // Check every 5 seconds
          continue;
        }

        const task = this.taskQueue.shift();

        // Execute mission through all agents
        await this.scan({ id: task.id, clientId: task.clientId, goal: task.goal, context: task.context });
        await this.research(task);
        await this.synthesis(task);
        await this.delivery(task);
        await this.clientMgr(task);

        this.missionLog.push(task);
      } catch (e) {
        console.error('[Orchestrator] Error in mission loop:', e);
        await this.sleep(5000);
      }
    }
  }

  // HELPERS

  async classifyRequest(request) {
    // Simple classification (can be enhanced with Claude)
    const keywords = (request.goal || '').toLowerCase();
    
    let type = 'general_research';
    let priority = 'normal';

    if (keywords.includes('competitive') || keywords.includes('competitor')) type = 'competitive_analysis';
    if (keywords.includes('market') || keywords.includes('sizing')) type = 'market_research';
    if (keywords.includes('acquisition') || keywords.includes('target')) type = 'ma_research';
    if (keywords.includes('prospect') || keywords.includes('company')) type = 'company_research';

    if (keywords.includes('urgent') || keywords.includes('asap')) priority = 'high';

    return { type, priority };
  }

  async getBlueprint(type) {
    // Load from knowledge vault
    const blueprintPath = path.join(this.knowledgeVault, 'blueprints', `${type}.json`);
    if (fs.existsSync(blueprintPath)) {
      return JSON.parse(fs.readFileSync(blueprintPath, 'utf8'));
    }
    // Fallback to default
    return { id: type, name: type, description: 'Default blueprint' };
  }

  async getTemplate(type) {
    const templatePath = path.join(this.knowledgeVault, 'templates', `${type}.md`);
    if (fs.existsSync(templatePath)) {
      return fs.readFileSync(templatePath, 'utf8');
    }
    return '# {{title}}\n\n{{content}}';
  }

  async runARIAMission(params) {
    // Call ARIA API endpoint
    const response = await fetch(`${this.config.ariaApiUrl}/api/missions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal: params.goal,
        context: params.context,
        blueprintId: params.blueprintId,
      }),
    });

    if (!response.ok) throw new Error(`ARIA API error: ${response.status}`);

    return await response.json();
  }

  async formatOutput(params) {
    const { output, template, clientId } = params;
    
    // Simple template substitution (can be enhanced)
    let formatted = template
      .replace('{{title}}', output.summary || 'Research Results')
      .replace('{{content}}', output.markdown || '');

    return formatted;
  }

  async dispatchToClient(params) {
    const { task, client, format } = params;

    // Default: log to knowledge vault
    const clientPath = path.join(this.knowledgeVault, 'clients', client.id);
    if (!fs.existsSync(clientPath)) fs.mkdirSync(clientPath, { recursive: true });

    const outputFile = path.join(clientPath, `${task.id}.md`);
    fs.writeFileSync(outputFile, task.formatted);

    // TODO: Email, Slack, PDF integration

    return { success: true, path: outputFile };
  }

  async saveOutput(result, task) {
    const outputPath = path.join(this.knowledgeVault, 'research', `${task.id}.json`);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    return outputPath;
  }

  async extractInsights(task) {
    // Extract actionable insights from mission output
    return {
      summary: task.output.summary || '',
      keyFindings: task.output.findings || [],
      recommendations: task.output.recommendations || [],
    };
  }

  async updateClientKnowledge(clientId, insights) {
    const knowledgePath = path.join(this.knowledgeVault, 'clients', clientId, 'knowledge.json');
    let knowledge = { insights: [] };
    
    if (fs.existsSync(knowledgePath)) {
      knowledge = JSON.parse(fs.readFileSync(knowledgePath, 'utf8'));
    }

    knowledge.insights.push({
      ...insights,
      timestamp: new Date().toISOString(),
    });

    fs.mkdirSync(path.dirname(knowledgePath), { recursive: true });
    fs.writeFileSync(knowledgePath, JSON.stringify(knowledge, null, 2));
  }

  async updateClientPreferences(clientId, insights) {
    // Learn from mission patterns
    // TODO: Enhance with ML
  }

  canExecuteMission(task) {
    return this.budgetState.spentToday < this.budgetState.dailyLimit &&
           this.budgetState.spentThisMonth < this.budgetState.monthlyLimit;
  }

  logAudit(actor, action, entityId, details) {
    this.db.prepare(`
      INSERT INTO audit_log (actor, action, entity_id, details)
      VALUES (?, ?, ?, ?)
    `).run(actor, action, entityId, details);

    // Alert on threshold
    if (this.budgetState.spentToday > (this.budgetState.dailyLimit * this.budgetState.threshold)) {
      this.emit('budget:threshold', {
        spent: this.budgetState.spentToday,
        limit: this.budgetState.dailyLimit,
      });
    }
  }

  getStatus() {
    const totalTokensUsed = Object.values(this.agents).reduce((sum, agent) => sum + agent.tokensUsedToday, 0);
    const totalCostToday = Object.values(this.agents).reduce((sum, agent) => sum + agent.costToday, 0);

    return {
      agents: Object.values(this.agents).map(a => a.toJSON()),
      budget: {
        ...this.budgetState,
        totalTokensUsed,
        totalCostToday,
        canSpendToday: this.budgetState.spentToday + totalCostToday <= this.budgetState.dailyLimit,
      },
      queuedTasks: this.taskQueue.length,
      recentMissions: this.missionLog.slice(-10),
    };
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = Orchestrator;
