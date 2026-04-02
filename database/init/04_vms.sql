-- Virtual Machine registry for QEMU/KVM manager

CREATE TABLE IF NOT EXISTS virtual_machines (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name          VARCHAR(64) UNIQUE NOT NULL,
    os            VARCHAR(50) NOT NULL,
    status        VARCHAR(20) NOT NULL DEFAULT 'stopped',
                  -- stopped | running | deleted
    ram_mb        INTEGER NOT NULL DEFAULT 2048,
    cpus          INTEGER NOT NULL DEFAULT 2,
    disk_gb       INTEGER NOT NULL DEFAULT 20,
    ssh_port      INTEGER NOT NULL,
    vnc_display   INTEGER NOT NULL,
    vm_index      INTEGER NOT NULL,          -- slot 0-9, used for port allocation
    description   TEXT,
    kvm_enabled   BOOLEAN DEFAULT false,     -- was hardware KVM used on last start?
    started_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(ssh_port),
    UNIQUE(vnc_display),
    UNIQUE(vm_index)
);

CREATE INDEX IF NOT EXISTS idx_vms_status ON virtual_machines(status);
CREATE INDEX IF NOT EXISTS idx_vms_created_at ON virtual_machines(created_at DESC);
