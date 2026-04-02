-- Sandbox Runs Table
-- Tracks every GitHub repo sandbox run (clone → build → execute)

CREATE TABLE IF NOT EXISTS sandbox_runs (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id        VARCHAR(36) UNIQUE NOT NULL,
    repo_url      TEXT        NOT NULL,
    name          VARCHAR(255),
    project_type  VARCHAR(50),
    container_name VARCHAR(255),
    status        VARCHAR(50) NOT NULL DEFAULT 'pending',
    cpu_limit     FLOAT       DEFAULT 1.0,
    memory_mb     INTEGER     DEFAULT 512,
    logs          TEXT,
    error         TEXT,
    started_at    TIMESTAMPTZ,
    finished_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sandbox_runs_status     ON sandbox_runs(status);
CREATE INDEX IF NOT EXISTS idx_sandbox_runs_created_at ON sandbox_runs(created_at DESC);
