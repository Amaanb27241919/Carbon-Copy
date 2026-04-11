-- ARIA Intelligence Platform Schema
-- Applied automatically by PostgreSQL on first start

-- ─── Missions ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS aria_missions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID,
  goal         TEXT NOT NULL,
  context      TEXT DEFAULT '',
  blueprint_id VARCHAR(100),
  format       VARCHAR(20) DEFAULT 'json',
  status       VARCHAR(50) DEFAULT 'pending',
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  tokens_used  INT DEFAULT 0,
  cost_usd     NUMERIC(10, 6) DEFAULT 0,
  output       JSONB,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aria_missions_client ON aria_missions(client_id);
CREATE INDEX IF NOT EXISTS idx_aria_missions_status ON aria_missions(status);
CREATE INDEX IF NOT EXISTS idx_aria_missions_created ON aria_missions(created_at DESC);

-- ─── Agent State ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS aria_agents_state (
  agent_id     VARCHAR(50) PRIMARY KEY,
  status       VARCHAR(50) DEFAULT 'idle',
  current_task TEXT,
  tokens_today INT DEFAULT 0,
  cost_today   NUMERIC(10, 6) DEFAULT 0,
  last_update  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default agents
INSERT INTO aria_agents_state (agent_id, status) VALUES
  ('scan',       'idle'),
  ('research',   'idle'),
  ('synthesis',  'idle'),
  ('delivery',   'idle'),
  ('client_mgr', 'idle')
ON CONFLICT (agent_id) DO NOTHING;

-- ─── Clients ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS aria_clients (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(200) NOT NULL,
  industry       VARCHAR(100),
  email_to       VARCHAR(200),
  monthly_budget NUMERIC(10, 2) DEFAULT 1000,
  current_spend  NUMERIC(10, 2) DEFAULT 0,
  slack_webhook  TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aria_clients_name ON aria_clients(name);

-- ─── Audit Log ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS aria_audit_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor      VARCHAR(100),
  action     VARCHAR(100),
  entity_id  VARCHAR(200),
  details    JSONB,
  timestamp  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aria_audit_actor ON aria_audit_log(actor);
CREATE INDEX IF NOT EXISTS idx_aria_audit_timestamp ON aria_audit_log(timestamp DESC);

-- ─── WatchDog Monitors ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS aria_watchdog_monitors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL,
  target_entity TEXT NOT NULL,
  signal_types  TEXT[] DEFAULT '{}',
  status        VARCHAR(50) DEFAULT 'active',
  last_check    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aria_watchdog_client ON aria_watchdog_monitors(client_id);
CREATE INDEX IF NOT EXISTS idx_aria_watchdog_status ON aria_watchdog_monitors(status);

-- ─── Dossier Files ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS aria_dossier_files (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID NOT NULL,
  filename       VARCHAR(500) NOT NULL,
  extracted_text TEXT,
  ai_summary     TEXT,
  file_path      VARCHAR(1000),
  uploaded_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aria_dossier_client ON aria_dossier_files(client_id);
CREATE INDEX IF NOT EXISTS idx_aria_dossier_filename ON aria_dossier_files(filename);

-- ─── Blueprints ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS aria_blueprints (
  id            VARCHAR(100) PRIMARY KEY,
  name          VARCHAR(100) NOT NULL UNIQUE,
  category      VARCHAR(100),
  description   TEXT,
  template      JSONB DEFAULT '{}',
  system_prompt TEXT,
  example_goal  TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Seed 10 core blueprints
INSERT INTO aria_blueprints (id, name, category, description, template, system_prompt, example_goal) VALUES
  ('competitive_analysis', 'competitive_analysis', 'Strategy',
   'Deep competitive landscape analysis with market positioning and differentiation insights',
   '{"sections":["executive_summary","competitor_profiles","market_positioning","swot","recommendations"]}',
   'You are a competitive intelligence expert. Identify and analyze all relevant competitors.',
   'Analyze the competitive landscape for {company_name} in the {industry} sector'),
  ('market_research', 'market_research', 'Strategy',
   'Comprehensive market sizing, trends, and opportunity analysis',
   '{"sections":["market_size","growth_drivers","key_segments","customer_personas","entry_strategy"]}',
   'You are a market research expert. Provide rigorous, data-backed market analysis.',
   'Size the {market_name} market and identify key growth drivers and headwinds'),
  ('company_research', 'company_research', 'Intelligence',
   'Full company profile including financials, leadership, products, and recent news',
   '{"sections":["company_overview","leadership","financials","products","recent_news","risk_factors"]}',
   'You are an expert business intelligence analyst specializing in company research.',
   'Research {company_name} including business model, financials, and competitive position'),
  ('ma_research', 'ma_research', 'M&A',
   'Merger and acquisition target analysis with valuation signals and strategic fit assessment',
   '{"sections":["target_overview","strategic_fit","valuation_signals","synergies","risks","recommendation"]}',
   'You are an M&A advisor. Evaluate acquisition targets with rigorous analysis.',
   'Evaluate {company_name} as a potential acquisition target'),
  ('financial_analysis', 'financial_analysis', 'Finance',
   'Financial performance review including revenue trends, margins, and key ratios',
   '{"sections":["revenue_trends","margin_analysis","key_ratios","peer_comparison","outlook"]}',
   'You are a financial analyst. Provide rigorous financial assessment.',
   'Analyze the financial health and performance of {company_name}'),
  ('general_research', 'general_research', 'General',
   'General intelligence research and synthesis on any topic',
   '{"sections":["executive_summary","key_findings","analysis","implications","recommendations"]}',
   'You are an expert business intelligence analyst. Provide actionable insights.',
   'Research and analyze {topic} with key findings and recommendations'),
  ('due_diligence', 'due_diligence', 'Legal',
   'Pre-investment or pre-acquisition due diligence checklist and findings summary',
   '{"sections":["corporate_structure","key_contracts","ip_review","regulatory","financial_health","red_flags"]}',
   'You are a due diligence expert. Identify risks and verify key facts.',
   'Conduct due diligence on {company_name} for a potential investment'),
  ('prospect_research', 'prospect_research', 'Sales',
   'Sales intelligence on target prospect including decision makers and buying signals',
   '{"sections":["company_profile","decision_makers","pain_points","buying_signals","outreach_angle"]}',
   'You are a sales intelligence expert. Identify decision makers and buying signals.',
   'Research {company_name} to identify decision makers and craft an outreach strategy'),
  ('industry_analysis', 'industry_analysis', 'Strategy',
   'Industry-level analysis covering dynamics, key players, and emerging trends',
   '{"sections":["industry_overview","key_players","value_chain","disruption_signals","opportunity_map"]}',
   'You are an industry analyst. Map the landscape with key players and trends.',
   'Analyze the {industry} industry — key players, dynamics, and emerging trends'),
  ('regulatory_scan', 'regulatory_scan', 'Compliance',
   'Regulatory landscape scan for a given market or product category',
   '{"sections":["regulatory_bodies","key_regulations","compliance_requirements","risks","recent_changes"]}',
   'You are a regulatory compliance expert. Map requirements and risks.',
   'Scan the regulatory landscape for {product_or_market} in {jurisdiction}')
ON CONFLICT (id) DO NOTHING;

-- ─── Budget Tracking ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS aria_budget (
  id           UUID DEFAULT gen_random_uuid(),
  date         DATE NOT NULL UNIQUE,
  tokens_used  INT DEFAULT 0,
  cost_usd     NUMERIC(10, 6) DEFAULT 0,
  missions_run INT DEFAULT 0,
  PRIMARY KEY (date)
);

CREATE INDEX IF NOT EXISTS idx_aria_budget_date ON aria_budget(date DESC);
