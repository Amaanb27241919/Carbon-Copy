// Carbon-Copy v2 Telegram Bot
// Commands for mission control + status monitoring

const TelegramBot = require('node-telegram-bot-api');

class CarbonCopyBot {
  constructor(token, apiServerUrl = 'http://localhost:3002') {
    this.bot = new TelegramBot(token, { polling: true });
    this.apiUrl = apiServerUrl;
    this.adminUsers = (process.env.ADMIN_USER_IDS || '').split(',').map(id => parseInt(id));

    this.setupHandlers();
  }

  setupHandlers() {
    // Start command
    this.bot.onText(/\/start/, (msg) => {
      this.bot.sendMessage(msg.chat.id, `
🤖 **Carbon-Copy v2 Mission Control**

Commands:
/mission <goal> — Start a new research mission
/status — Show all agent status
/recall <client> — Show client memory + recent missions
/cost — Show daily budget status
/help — Show this help

Example:
/mission Analyze competitor market positioning in AI
      `);
    });

    // Mission command
    this.bot.onText(/\/mission\s+(.+)/, async (msg, match) => {
      const goal = match[1];
      const clientId = `telegram_${msg.from.id}`;

      try {
        const response = await fetch(`${this.apiUrl}/api/missions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId,
            goal,
            context: `Telegram user: ${msg.from.first_name}`,
          }),
        });

        if (!response.ok) throw new Error(await response.text());

        const data = await response.json();

        this.bot.sendMessage(msg.chat.id, `
✅ **Mission Started**

**ID:** \`${data.missionId}\`
**Goal:** ${goal}
**Status:** Queued

Use \`/status\` to monitor progress.
      `);

        // Start monitoring
        this.monitorMission(msg.chat.id, data.missionId);
      } catch (e) {
        this.bot.sendMessage(msg.chat.id, `❌ Error: ${e.message}`);
      }
    });

    // Status command
    this.bot.onText(/\/status/, async (msg) => {
      try {
        const response = await fetch(`${this.apiUrl}/health`);
        const data = await response.json();

        let statusText = `
📊 **System Status**

**Agents:**
`;
        for (const agent of data.agents) {
          const emoji = agent.status === 'idle' ? '⏸️' :
                       agent.status === 'executing' ? '⚙️' :
                       agent.status === 'error' ? '❌' : '✅';
          
          statusText += `${emoji} ${agent.name}: ${agent.status}`;
          if (agent.currentTask) statusText += ` (${agent.currentTask})`;
          statusText += `\n`;
        }

        statusText += `
**Budget:**
$${data.budget.spentToday.toFixed(2)} / $${data.budget.dailyLimit} today
$${data.budget.spentThisMonth.toFixed(2)} / $${data.budget.monthlyLimit} this month

**Queue:** ${data.queuedTasks} tasks pending
        `;

        this.bot.sendMessage(msg.chat.id, statusText);
      } catch (e) {
        this.bot.sendMessage(msg.chat.id, `❌ Error: ${e.message}`);
      }
    });

    // Recall command
    this.bot.onText(/\/recall\s+(.+)/, async (msg, match) => {
      const clientId = match[1].trim();

      try {
        const response = await fetch(`${this.apiUrl}/api/missions?clientId=${clientId}&limit=5`);
        const missions = await response.json();

        if (missions.length === 0) {
          return this.bot.sendMessage(msg.chat.id, `No missions found for client: ${clientId}`);
        }

        let text = `📚 **Client Memory: ${clientId}**\n\n`;

        for (const mission of missions) {
          text += `📌 ${mission.goal}\n`;
          text += `  Status: ${mission.status}\n`;
          text += `  Cost: $${mission.costUSD || 0}\n`;
          text += `  Date: ${new Date(mission.createdAt).toLocaleDateString()}\n\n`;
        }

        this.bot.sendMessage(msg.chat.id, text);
      } catch (e) {
        this.bot.sendMessage(msg.chat.id, `❌ Error: ${e.message}`);
      }
    });

    // Cost command
    this.bot.onText(/\/cost/, async (msg) => {
      try {
        const response = await fetch(`${this.apiUrl}/api/budget`);
        const budget = await response.json();

        const dailyPercent = Math.round((budget.spentToday / budget.dailyLimit) * 100);
        const monthlyPercent = Math.round((budget.spentThisMonth / budget.monthlyLimit) * 100);

        let text = `💰 **Budget Status**\n\n`;
        text += `**Daily:** $${budget.spentToday.toFixed(2)} / $${budget.dailyLimit} (${dailyPercent}%)\n`;
        text += `**Monthly:** $${budget.spentThisMonth.toFixed(2)} / $${budget.monthlyLimit} (${monthlyPercent}%)\n`;

        if (dailyPercent > 80) {
          text += `\n⚠️ Daily budget at ${dailyPercent}% — approaching limit`;
        }

        this.bot.sendMessage(msg.chat.id, text);
      } catch (e) {
        this.bot.sendMessage(msg.chat.id, `❌ Error: ${e.message}`);
      }
    });

    // Help command
    this.bot.onText(/\/help/, (msg) => {
      this.bot.sendMessage(msg.chat.id, `
🤖 **Carbon-Copy v2 Commands**

**/mission <goal>**
Start a new research mission. Example:
\`/mission Analyze competitor market positioning\`

**/status**
Show current agent status and budget.

**/recall <client_id>**
Show client history and recent missions.

**/cost**
Show daily and monthly budget status.

**/help**
Show this help menu.

---
**Dashboard:** http://localhost:3000
**API:** http://localhost:3002/health
      `);
    });

    console.log('[Telegram] Bot handlers registered');
  }

  async monitorMission(chatId, missionId) {
    // Poll mission status and send updates
    let lastStatus = 'pending';

    const check = setInterval(async () => {
      try {
        const response = await fetch(`${this.apiUrl}/api/missions/${missionId}`);
        const mission = await response.json();

        if (mission.status !== lastStatus) {
          const emoji = mission.status === 'researched' ? '🔍' :
                       mission.status === 'synthesized' ? '✨' :
                       mission.status === 'delivered' ? '✅' :
                       '⏳';

          this.bot.sendMessage(chatId, `${emoji} Mission \`${missionId}\` — **${mission.status}**`);
          lastStatus = mission.status;

          if (mission.status === 'delivered') {
            this.bot.sendMessage(chatId, `
✅ **Mission Complete**

Summary: ${mission.output?.summary || 'See dashboard for details'}

Cost: $${mission.costUSD || 0}
Tokens: ${mission.tokensUsed || 0}
            `);
            clearInterval(check);
          }
        }
      } catch (e) {
        console.error('[Telegram] Error monitoring mission:', e);
      }
    }, 5000); // Check every 5 seconds

    // Stop checking after 1 hour
    setTimeout(() => clearInterval(check), 3600000);
  }

  start() {
    console.log('[Telegram] Bot started');
    console.log('[Telegram] Listening for messages...');
  }
}

// Initialize
const token = process.env.TELEGRAM_TOKEN;
if (!token) {
  console.error('[Telegram] TELEGRAM_TOKEN not set in environment');
  process.exit(1);
}

const bot = new CarbonCopyBot(token);
bot.start();

module.exports = CarbonCopyBot;
