'use strict';

const https = require('https');

class EmailDelivery {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.RESEND_API_KEY;
  }

  async send(to, subject, html, missionId) {
    if (!this.apiKey) {
      console.warn(JSON.stringify({ level: 'warn', service: 'aria-service', message: 'No RESEND_API_KEY, skipping email delivery' }));
      return { success: false, reason: 'no_api_key' };
    }

    const payload = JSON.stringify({
      from: 'noreply@aria.omni-flow.net',
      to,
      subject,
      html,
      tags: [
        { name: 'mission_id', value: missionId },
        { name: 'source', value: 'carbon-copy-v2' },
      ],
    });

    return new Promise((resolve, reject) => {
      const req = https.request('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ success: true, id: result.id });
            } else {
              resolve({ success: false, error: result.message });
            }
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  buildHtml(mission, output) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#333}
      .container{max-width:600px;margin:0 auto;padding:20px}
      .header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:30px;border-radius:8px}
      .body{padding:20px;background:#f5f5f5;margin:20px 0;border-radius:8px}
      .footer{text-align:center;color:#999;font-size:12px;padding-top:20px;border-top:1px solid #ddd}
      </style></head><body><div class="container">
      <div class="header"><h1>${output.title || mission.goal}</h1><p>${output.summary || 'Research complete'}</p></div>
      <div class="body">
      ${output.findings && output.findings.length ? `<h3>Key Findings</h3><ul>${output.findings.map(f => `<li>${f}</li>`).join('')}</ul>` : ''}
      ${output.recommendations && output.recommendations.length ? `<h3>Recommendations</h3><ul>${output.recommendations.map(r => `<li>${r}</li>`).join('')}</ul>` : ''}
      </div>
      <div class="footer"><p>Carbon-Copy v2 — ARIA Intelligence Platform</p></div>
      </div></body></html>`;
  }
}

module.exports = EmailDelivery;
