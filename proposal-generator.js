// Proposal Generator — Auto-Generate Proposals from Missions
// Leverages mission data to create structured proposals

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class ProposalGenerator {
  constructor(dbPath = './carbon-copy.db', knowledgeVaultPath = '~/.aria-knowledge') {
    this.db = new Database(dbPath);
    this.knowledgeVault = knowledgeVaultPath.replace('~', process.env.HOME);
  }

  // Generate proposal from mission
  async generateProposal(missionId, clientId) {
    // Fetch mission data
    const mission = this.db.prepare(`
      SELECT * FROM missions WHERE id = ?
    `).get(missionId);

    if (!mission) {
      throw new Error(`Mission not found: ${missionId}`);
    }

    // Fetch client data
    const client = this.db.prepare(`
      SELECT * FROM clients WHERE id = ?
    `).get(clientId);

    if (!client) {
      throw new Error(`Client not found: ${clientId}`);
    }

    // Build proposal structure
    const proposal = {
      proposalId: `prop_${Date.now()}`,
      clientId,
      clientName: client.name,
      industry: client.industry || 'Unknown',
      mission: mission.goal,
      missionDate: mission.created_at,
      
      // Key sections
      headline: this.generateHeadline(mission, client),
      painPoints: this.extractPainPoints(mission),
      buildPhases: this.generatePhases(mission),
      roiProjection: this.calculateROI(mission, client),
      timeline: this.generateTimeline(mission),
      investment: this.calculateInvestment(mission),
      
      // Auto-generated email draft
      emailDraft: null,
      
      // Metadata
      generatedAt: new Date().toISOString(),
      status: 'draft',
    };

    // Generate email draft
    proposal.emailDraft = this.generateEmailDraft(proposal);

    return proposal;
  }

  generateHeadline(mission, client) {
    const goal = mission.goal || 'AI-Powered Intelligence';
    return `${goal} for ${client.name}`;
  }

  extractPainPoints(mission) {
    // Simple NLP-based extraction (can be enhanced with Claude)
    const keywords = {
      'slow': 'Process inefficiency',
      'manual': 'Manual labor overhead',
      'expensive': 'High operational costs',
      'difficult': 'Complex decision-making',
      'risk': 'Risk exposure',
      'data': 'Data intelligence gap',
    };

    const painPoints = [];
    const missionLower = (mission.goal || '').toLowerCase();

    Object.keys(keywords).forEach(keyword => {
      if (missionLower.includes(keyword)) {
        painPoints.push(keywords[keyword]);
      }
    });

    return painPoints.length > 0 ? painPoints : ['Process optimization', 'Cost reduction', 'Decision support'];
  }

  generatePhases(mission) {
    // Generic 3-phase approach (customize per mission type)
    return [
      {
        phase: 1,
        name: 'Discovery & Analysis',
        duration: '1 week',
        deliverables: ['Current state assessment', 'Data audit', 'Opportunity mapping'],
      },
      {
        phase: 2,
        name: 'Implementation',
        duration: '2 weeks',
        deliverables: ['System setup', 'Agent training', 'Integration testing'],
      },
      {
        phase: 3,
        name: 'Optimization & Handoff',
        duration: '1 week',
        deliverables: ['Performance tuning', 'Documentation', 'Training'],
      },
    ];
  }

  calculateROI(mission, client) {
    // Estimate ROI based on industry and mission type
    const monthlyBudget = client.monthly_budget || 5000;
    const estimatedSavings = monthlyBudget * 0.20; // Assume 20% efficiency gain

    return {
      year1Savings: estimatedSavings * 12,
      paybackMonths: 2,
      roi: '300-400%',
      description: 'Based on typical efficiency gains in your industry',
    };
  }

  generateTimeline(mission) {
    return {
      startDate: new Date().toISOString().split('T')[0],
      completionDate: new Date(Date.now() + 4 * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      duration: '4 weeks',
    };
  }

  calculateInvestment(mission) {
    // Estimate cost based on complexity
    const basePrice = 5000;
    const missionLength = (mission.goal || '').split(' ').length;
    const complexity = missionLength > 20 ? 1.5 : 1;

    return {
      basePrice: basePrice * complexity,
      currency: 'USD',
      includesSupport: true,
      supportMonths: 3,
    };
  }

  generateEmailDraft(proposal) {
    const template = `
Hi ${proposal.clientName},

Thank you for sharing your mission. Based on our understanding, here's a tailored proposal:

**${proposal.headline}**

**Your Challenge:**
${proposal.painPoints.map(p => `• ${p}`).join('\n')}

**Our Approach:**
${proposal.buildPhases.map(ph => `${ph.phase}. ${ph.name} (${ph.duration})`).join('\n')}

**Expected Impact:**
• Year 1 Savings: $${proposal.roiProjection.year1Savings.toLocaleString()}
• Payback Period: ${proposal.roiProjection.paybackMonths} months
• ROI: ${proposal.roiProjection.roi}

**Investment:** $${proposal.investment.basePrice.toLocaleString()} USD
**Timeline:** ${proposal.timeline.duration} (${proposal.timeline.startDate} to ${proposal.timeline.completionDate})

Let's discuss how we can deliver this for you.

Best regards,
OmniFlow Advisory
    `.trim();

    return template;
  }

  // Save proposal to vault
  saveProposal(proposal) {
    const proposalDir = path.join(this.knowledgeVault, 'proposals', proposal.clientId);
    
    if (!fs.existsSync(proposalDir)) {
      fs.mkdirSync(proposalDir, { recursive: true });
    }

    const filePath = path.join(proposalDir, `${proposal.proposalId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(proposal, null, 2));

    return { success: true, path: filePath, proposalId: proposal.proposalId };
  }

  // List proposals for client
  listProposals(clientId) {
    const proposalDir = path.join(this.knowledgeVault, 'proposals', clientId);
    
    if (!fs.existsSync(proposalDir)) {
      return [];
    }

    return fs.readdirSync(proposalDir)
      .filter(f => f.endsWith('.json'))
      .map(f => ({
        filename: f,
        path: path.join(proposalDir, f),
      }));
  }

  // Export proposal as markdown
  exportAsMarkdown(proposal) {
    let md = `# Proposal: ${proposal.headline}\n\n`;
    md += `**Client:** ${proposal.clientName}\n`;
    md += `**Industry:** ${proposal.industry}\n`;
    md += `**Generated:** ${proposal.generatedAt}\n\n`;

    md += `## Pain Points\n`;
    proposal.painPoints.forEach(p => {
      md += `- ${p}\n`;
    });

    md += `\n## Approach\n`;
    proposal.buildPhases.forEach(ph => {
      md += `### Phase ${ph.phase}: ${ph.name}\n`;
      md += `**Duration:** ${ph.duration}\n`;
      md += `**Deliverables:**\n`;
      ph.deliverables.forEach(d => {
        md += `- ${d}\n`;
      });
    });

    md += `\n## Investment\n`;
    md += `**Price:** $${proposal.investment.basePrice.toLocaleString()} USD\n`;
    md += `**Timeline:** ${proposal.timeline.duration}\n`;
    md += `**Support:** ${proposal.investment.includesSupport ? `Included for ${proposal.investment.supportMonths} months` : 'Not included'}\n`;

    md += `\n## Expected ROI\n`;
    md += `- Year 1 Savings: $${proposal.roiProjection.year1Savings.toLocaleString()}\n`;
    md += `- Payback Period: ${proposal.roiProjection.paybackMonths} months\n`;
    md += `- ROI: ${proposal.roiProjection.roi}\n`;

    md += `\n## Email Draft\n\`\`\`\n${proposal.emailDraft}\n\`\`\`\n`;

    return md;
  }
}

module.exports = ProposalGenerator;
