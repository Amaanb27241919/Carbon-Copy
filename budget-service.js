// Budget Service — Per-Provider Cost Tracking
// Tracks spending across Anthropic, OpenAI, Perplexity, and integrates with RawClaw's budget model

const Database = require('better-sqlite3');
const path = require('path');

class BudgetService {
  constructor(dbPath = './carbon-copy.db') {
    this.db = new Database(dbPath);
    this.initializeTables();
    this.providers = ['anthropic', 'openai', 'perplexity', 'ollama'];
  }

  initializeTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cost_tracking (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        tokens_used INTEGER DEFAULT 0,
        cost_usd REAL DEFAULT 0,
        mission_id TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS budget_policies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT UNIQUE NOT NULL,
        daily_limit REAL DEFAULT 20,
        monthly_limit REAL DEFAULT 500,
        enabled BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS cost_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        alert_type TEXT,
        message TEXT,
        threshold_percent REAL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_cost_provider ON cost_tracking(provider);
      CREATE INDEX IF NOT EXISTS idx_cost_mission ON cost_tracking(mission_id);
      CREATE INDEX IF NOT EXISTS idx_cost_timestamp ON cost_tracking(timestamp);
    `);

    // Initialize default budget policies
    this.providers.forEach(provider => {
      try {
        this.db.prepare(`
          INSERT OR IGNORE INTO budget_policies (provider, daily_limit, monthly_limit)
          VALUES (?, ?, ?)
        `).run(provider, 20, 500);
      } catch (e) {
        // Already exists
      }
    });
  }

  // Log a cost transaction
  logCost(provider, model, tokensUsed, costUSD, missionId = null) {
    this.db.prepare(`
      INSERT INTO cost_tracking (provider, model, tokens_used, cost_usd, mission_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(provider, model, tokensUsed, costUSD, missionId);

    // Check if threshold exceeded
    this.checkBudgetThreshold(provider);
  }

  // Get daily spend by provider
  getDailySpend(provider) {
    const result = this.db.prepare(`
      SELECT SUM(cost_usd) as total, SUM(tokens_used) as tokens
      FROM cost_tracking
      WHERE provider = ?
      AND date(timestamp) = date('now')
    `).get(provider);

    return {
      provider,
      spentToday: result.total || 0,
      tokensToday: result.tokens || 0,
    };
  }

  // Get monthly spend by provider
  getMonthlySpend(provider) {
    const result = this.db.prepare(`
      SELECT SUM(cost_usd) as total, SUM(tokens_used) as tokens
      FROM cost_tracking
      WHERE provider = ?
      AND strftime('%Y-%m', timestamp) = strftime('%Y-%m', 'now')
    `).get(provider);

    return {
      provider,
      spentThisMonth: result.total || 0,
      tokensThisMonth: result.tokens || 0,
    };
  }

  // Get budget status for all providers
  getBudgetStatus() {
    const status = {};

    this.providers.forEach(provider => {
      const policy = this.db.prepare('SELECT * FROM budget_policies WHERE provider = ?').get(provider);
      const dailySpend = this.getDailySpend(provider);
      const monthlySpend = this.getMonthlySpend(provider);

      status[provider] = {
        ...policy,
        dailySpend: dailySpend.spentToday,
        dailyTokens: dailySpend.tokensToday,
        dailyPercent: Math.round((dailySpend.spentToday / policy.daily_limit) * 100),
        monthlySpend: monthlySpend.spentThisMonth,
        monthlyTokens: monthlySpend.tokensThisMonth,
        monthlyPercent: Math.round((monthlySpend.spentThisMonth / policy.monthly_limit) * 100),
        canSpend: dailySpend.spentToday < policy.daily_limit && monthlySpend.spentThisMonth < policy.monthly_limit,
      };
    });

    return status;
  }

  // Check if budget threshold exceeded
  checkBudgetThreshold(provider) {
    const dailySpend = this.getDailySpend(provider);
    const policy = this.db.prepare('SELECT * FROM budget_policies WHERE provider = ?').get(provider);

    if (dailySpend.spentToday > (policy.daily_limit * 0.8)) {
      this.db.prepare(`
        INSERT INTO cost_alerts (provider, alert_type, message, threshold_percent)
        VALUES (?, ?, ?, ?)
      `).run(provider, '80%_threshold', `${provider} at 80% of daily limit`, 80);
    }

    if (dailySpend.spentToday >= policy.daily_limit) {
      this.db.prepare(`
        INSERT INTO cost_alerts (provider, alert_type, message, threshold_percent)
        VALUES (?, ?, ?, ?)
      `).run(provider, 'limit_exceeded', `${provider} daily limit exceeded`, 100);
    }
  }

  // Get recent cost history
  getCostHistory(provider = null, limit = 20) {
    let query = `
      SELECT * FROM cost_tracking
    `;
    const params = [];

    if (provider) {
      query += ` WHERE provider = ?`;
      params.push(provider);
    }

    query += ` ORDER BY timestamp DESC LIMIT ?`;
    params.push(limit);

    return this.db.prepare(query).all(...params);
  }

  // Update budget policy for a provider
  setBudgetPolicy(provider, dailyLimit, monthlyLimit) {
    this.db.prepare(`
      UPDATE budget_policies
      SET daily_limit = ?, monthly_limit = ?
      WHERE provider = ?
    `).run(dailyLimit, monthlyLimit, provider);

    return { provider, dailyLimit, monthlyLimit };
  }

  // Get cost breakdown by model
  getCostByModel(provider) {
    return this.db.prepare(`
      SELECT model, SUM(tokens_used) as tokens, SUM(cost_usd) as cost, COUNT(*) as calls
      FROM cost_tracking
      WHERE provider = ?
      GROUP BY model
      ORDER BY cost DESC
    `).all(provider);
  }

  // Get ROI per mission
  getMissionROI(missionId) {
    const costs = this.db.prepare(`
      SELECT SUM(cost_usd) as total_cost, SUM(tokens_used) as total_tokens
      FROM cost_tracking
      WHERE mission_id = ?
    `).get(missionId);

    return {
      missionId,
      totalCost: costs.total_cost || 0,
      totalTokens: costs.total_tokens || 0,
    };
  }

  // Generate daily cost report
  getDailyReport() {
    const report = {};
    let grandTotal = 0;

    this.providers.forEach(provider => {
      const spend = this.getDailySpend(provider);
      report[provider] = spend;
      grandTotal += spend.spentToday;
    });

    report.grandTotal = grandTotal;
    report.date = new Date().toISOString().split('T')[0];

    return report;
  }
}

module.exports = BudgetService;
