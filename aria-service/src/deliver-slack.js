'use strict';

const https = require('https');

class SlackDelivery {
  async send(webhookUrl, mission, output) {
    if (!webhookUrl) {
      return { success: false, reason: 'no_webhook_url' };
    }

    const payload = JSON.stringify(this.buildPayload(mission, output));

    const { hostname, pathname } = new URL(webhookUrl);

    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname,
          path: pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
        },
        (res) => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ success: true });
            } else {
              resolve({ success: false, error: data });
            }
          });
        }
      );
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  buildPayload(mission, output) {
    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: 'Research Mission Complete', emoji: true },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${output.title || mission.goal}*\n${output.summary || 'Research mission completed successfully'}`,
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Cost*\n$${(mission.cost_usd || 0).toFixed(4)}` },
          { type: 'mrkdwn', text: `*Tokens*\n${mission.tokens_used || 0}` },
          { type: 'mrkdwn', text: `*Status*\n✅ Completed` },
        ],
      },
    ];

    if (output.findings && output.findings.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Key Findings*\n${output.findings.slice(0, 3).map(f => `• ${f}`).join('\n')}`,
        },
      });
    }

    return { blocks };
  }
}

module.exports = SlackDelivery;
