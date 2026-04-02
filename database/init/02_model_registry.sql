CREATE TABLE IF NOT EXISTS model_registry (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider VARCHAR(50) NOT NULL,       -- 'ollama','openai','claude','huggingface'
    model_name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    is_local BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    capabilities JSONB DEFAULT '[]',     -- ['chat','embed','code']
    config JSONB DEFAULT '{}',           -- provider-specific config
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(provider, model_name)
);

-- Seed common models
INSERT INTO model_registry (provider, model_name, display_name, is_local, capabilities) VALUES
    ('openai',       'gpt-4o',                    'GPT-4o',                  false, '["chat","embed","code"]'),
    ('openai',       'gpt-4o-mini',               'GPT-4o Mini',             false, '["chat","embed","code"]'),
    ('openai',       'text-embedding-3-small',     'OpenAI Embeddings Small', false, '["embed"]'),
    ('claude',       'claude-sonnet-4-6',          'Claude Sonnet 4.6',       false, '["chat","code"]'),
    ('claude',       'claude-opus-4-6',            'Claude Opus 4.6',         false, '["chat","code"]'),
    ('claude',       'claude-haiku-4-5-20251001',  'Claude Haiku 4.5',        false, '["chat","code"]'),
    ('ollama',       'llama3.2',                   'Llama 3.2 (local)',        true,  '["chat","embed"]'),
    ('ollama',       'codellama',                  'Code Llama (local)',       true,  '["chat","code"]'),
    ('ollama',       'mistral',                    'Mistral (local)',          true,  '["chat"]'),
    ('ollama',       'nomic-embed-text',           'Nomic Embed (local)',      true,  '["embed"]'),
    ('huggingface',  'mistralai/Mistral-7B-Instruct-v0.3', 'Mistral 7B', false, '["chat"]'),
    ('huggingface',  'meta-llama/Llama-3.1-8B-Instruct',  'Llama 3.1 8B', false, '["chat"]')
ON CONFLICT (provider, model_name) DO NOTHING;
