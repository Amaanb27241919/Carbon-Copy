-- Carbon-Copy Database Schema
-- Requires pgvector extension (available in pgvector/pgvector:pg16)

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'user',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Model Outputs ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS model_outputs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project VARCHAR(100) NOT NULL,
    input_data JSONB,
    output_data JSONB,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Service Logs ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service VARCHAR(100) NOT NULL,
    level VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Container Events ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS container_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    container_name VARCHAR(255) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Seed Data ────────────────────────────────────────────────────────────────
-- Default admin user (password: 'changeme' — CHANGE THIS in production)
INSERT INTO users (username, password_hash, role) VALUES
    ('admin', '$2b$10$rOFVAcqS6P2LWjTjxPt4guNjJSSLMDEQHgBBqCYrLNP/7vQ9Lyk4a', 'admin')
ON CONFLICT (username) DO NOTHING;

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_model_outputs_project ON model_outputs(project);
CREATE INDEX IF NOT EXISTS idx_model_outputs_created_at ON model_outputs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_logs_service ON service_logs(service);
CREATE INDEX IF NOT EXISTS idx_service_logs_level ON service_logs(level);
CREATE INDEX IF NOT EXISTS idx_service_logs_created_at ON service_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_container_events_container ON container_events(container_name);
CREATE INDEX IF NOT EXISTS idx_container_events_created_at ON container_events(created_at DESC);
