'use strict';

const EventEmitter = require('events');
const { query } = require('./services/db');
const modelClient = require('./services/model-client');

class Agent {
  constructor(id, name, role, capabilities) {
    this.id = id;
    this.name = name;
    this.role = role;
    this.capabilities = capabilities;
    this.status = 'idle';
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
  constructor() {
    super();
    this.agents = {
      scan: new Agent('scan', 'Scanner', 'scanner', ['route', 'prioritize', 'monitor']),
      research: new Agent('research', 'Researcher', 'researcher', ['mission', 'parallel-search', 'synthesis']),
      synthesis: new Agent('synthesis', 'Synthesizer', 'synthesizer', ['format', 'structure', 'polish']),
      delivery: new Agent('delivery', 'Delivery', 'deliverer', ['email', 'slack', 'pdf', 'webhook']),
      client_mgr: new Agent('client_mgr', 'Client Manager', 'client_mgr', ['memory', 'preferences', 'history']),
    };
    this.taskQueue = [];
    this.budgetState = {
      dailyLimit: parseFloat(process.env.BUDGET_DAILY_USD) || 50,
      monthlyLimit: parseFloat(process.env.BUDGET_MONTHLY_USD) || 1000,
      spentToday: 0,
      spentThisMonth: 0,
      threshold: 0.8,
    };
    this._syncAgentState();
  }

  // Sync agent state to DB on init
  async _syncAgentState() {
    try {
      for (const agent of Object.values(this.agents)) {
        await query(
          `INSERT INTO aria_agents_state (agent_id, status, current_task, tokens_today, cost_today, last_update)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (agent_id) DO UPDATE SET status = $2, last_update = NOW()`,
          [agent.id, agent.status, agent.currentTask, agent.tokensUsedToday, agent.costToday]
        );
      }
    } catch (e) {
      console.warn(JSON.stringify({ level: 'warn', service: 'aria-service', message: 'Failed to sync agent state', error: e.message }));
    }
  }

  async _persistAgentState(agent) {
    try {
      await query(
        `UPDATE aria_agents_state
         SET status = $2, current_task = $3, tokens_today = $4, cost_today = $5, last_update = NOW()
         WHERE agent_id = $1`,
        [agent.id, agent.status, agent.currentTask, agent.tokensUsedToday, agent.costToday]
      );
    } catch (e) {
      // non-fatal
    }
  }

  async classifyRequest(request) {
    const keywords = (request.goal || '').toLowerCase();
    let type = 'general_research';
    let priority = 'normal';

    if (keywords.includes('competitive') || keywords.includes('competitor')) type = 'competitive_analysis';
    else if (keywords.includes('market') || keywords.includes('sizing')) type = 'market_research';
    else if (keywords.includes('acquisition') || keywords.includes('target')) type = 'ma_research';
    else if (keywords.includes('prospect') || keywords.includes('company')) type = 'company_research';
    else if (keywords.includes('financial') || keywords.includes('revenue')) type = 'financial_analysis';

    if (keywords.includes('urgent') || keywords.includes('asap')) priority = 'high';

    return { type, priority };
  }

  async getBlueprint(type) {
    try {
      const result = await query(
        'SELECT * FROM aria_blueprints WHERE name = $1 LIMIT 1',
        [type]
      );
      if (result.rows.length > 0) return result.rows[0];
    } catch (e) {
      // fallback
    }
    return { id: type, name: type, description: 'Default blueprint', template: {} };
  }

  canExecuteMission() {
    return this.budgetState.spentToday < this.budgetState.dailyLimit &&
           this.budgetState.spentThisMonth < this.budgetState.monthlyLimit;
  }

  async logAudit(actor, action, entityId, details) {
    try {
      await query(
        `INSERT INTO aria_audit_log (id, actor, action, entity_id, details, timestamp)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())`,
        [actor, action, entityId, JSON.stringify(details)]
      );
    } catch (e) {
      // non-fatal
    }
    if (this.budgetState.spentToday > this.budgetState.dailyLimit * this.budgetState.threshold) {
      this.emit('budget:threshold', {
        spent: this.budgetState.spentToday,
        limit: this.budgetState.dailyLimit,
      });
    }
  }

  async runMission(missionId, goal, clientId, context, blueprintId) {
    // Update mission status
    await query(
      `UPDATE aria_missions SET status = 'running', started_at = NOW() WHERE id = $1`,
      [missionId]
    );

    this.agents.scan.setState('planning', `scan:${missionId}`);
    this.emit('agent:status', { agent: 'scan', status: 'planning' });
    await this._persistAgentState(this.agents.scan);

    if (!this.canExecuteMission()) {
      await query(`UPDATE aria_missions SET status = 'failed', output = $2 WHERE id = $1`, [
        missionId,
        JSON.stringify({ error: 'Budget limit reached' }),
      ]);
      this.agents.scan.setState('idle');
      throw new Error('Budget limit reached');
    }

    // Classification
    const classification = await this.classifyRequest({ goal });
    this.agents.scan.setState('idle');
    await this._persistAgentState(this.agents.scan);

    // Research phase
    this.agents.research.setState('executing', `research:${missionId}`);
    this.emit('agent:status', { agent: 'research', status: 'executing' });
    await this._persistAgentState(this.agents.research);

    const blueprint = await this.getBlueprint(blueprintId || classification.type);

    const researchPrompt = [
      {
        role: 'system',
        content: `You are an expert business intelligence analyst. You will conduct thorough research and analysis. Blueprint: ${blueprint.name}. Category: ${classification.type}.`,
      },
      {
        role: 'user',
        content: `Research goal: ${goal}\n\nClient context: ${context || 'N/A'}\n\nProvide a structured analysis with: executive summary, key findings (5-7 bullet points), competitive landscape (if applicable), risks and opportunities, and actionable recommendations.`,
      },
    ];

    const researchResult = await modelClient.chat(researchPrompt);
    this.agents.research.addCost(researchResult.tokensUsed, researchResult.costUSD);
    this.budgetState.spentToday += researchResult.costUSD;
    this.budgetState.spentThisMonth += researchResult.costUSD;
    this.agents.research.setState('idle');
    await this._persistAgentState(this.agents.research);

    // Synthesis phase
    this.agents.synthesis.setState('executing', `synthesis:${missionId}`);
    this.emit('agent:status', { agent: 'synthesis', status: 'executing' });
    await this._persistAgentState(this.agents.synthesis);

    const synthesisPrompt = [
      {
        role: 'system',
        content: 'You are a professional report formatter. Structure the research output into clean JSON with clear sections.',
      },
      {
        role: 'user',
        content: `Format this research into JSON with fields: title, summary, findings (array of strings), recommendations (array of strings), risks (array of strings). Research: ${researchResult.response}`,
      },
    ];

    let structuredOutput = {
      title: goal,
      summary: researchResult.response.substring(0, 300),
      findings: [],
      recommendations: [],
      risks: [],
      raw: researchResult.response,
    };

    try {
      const synthResult = await modelClient.chat(synthesisPrompt);
      this.agents.synthesis.addCost(synthResult.tokensUsed, synthResult.costUSD);
      this.budgetState.spentToday += synthResult.costUSD;
      this.budgetState.spentThisMonth += synthResult.costUSD;

      const jsonMatch = synthResult.response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        structuredOutput = { ...structuredOutput, ...parsed, raw: researchResult.response };
      }
    } catch (e) {
      // use raw output
    }

    this.agents.synthesis.setState('idle');
    await this._persistAgentState(this.agents.synthesis);

    // Save to DB
    const totalTokens = researchResult.tokensUsed + (structuredOutput.tokensUsed || 0);
    const totalCost = researchResult.costUSD;

    await query(
      `UPDATE aria_missions
       SET status = 'completed', completed_at = NOW(), tokens_used = $2, cost_usd = $3, output = $4
       WHERE id = $1`,
      [missionId, totalTokens, totalCost, JSON.stringify(structuredOutput)]
    );

    // Budget tracking
    await query(
      `INSERT INTO aria_budget (id, date, tokens_used, cost_usd, missions_run)
       VALUES (gen_random_uuid(), CURRENT_DATE, $1, $2, 1)
       ON CONFLICT (date) DO UPDATE
       SET tokens_used = aria_budget.tokens_used + $1,
           cost_usd = aria_budget.cost_usd + $2,
           missions_run = aria_budget.missions_run + 1`,
      [totalTokens, totalCost]
    );

    await this.logAudit('orchestrator', 'mission_complete', missionId, { tokens: totalTokens, cost: totalCost });

    this.agents.delivery.setState('idle');
    this.emit('mission:completed', { missionId, output: structuredOutput });

    return structuredOutput;
  }

  getStatus() {
    return {
      agents: Object.values(this.agents).map(a => a.toJSON()),
      budget: this.budgetState,
      queuedTasks: this.taskQueue.length,
    };
  }
}

// Singleton
const orchestrator = new Orchestrator();

module.exports = orchestrator;
