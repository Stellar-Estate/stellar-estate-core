-- ==============================================================================
-- Stellar Estate Financial Core Schema
-- Level 1: Property -> Revenue Foundation with Level 2/3 Future Architecture
-- ==============================================================================

-- 1. Properties
CREATE TABLE IF NOT EXISTS properties (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    location VARCHAR(255) NOT NULL,
    property_type VARCHAR(64) NOT NULL,
    valuation NUMERIC(18, 2) NOT NULL,
    unit_count INTEGER NOT NULL DEFAULT 1,
    occupancy_percentage NUMERIC(5, 2) NOT NULL DEFAULT 100.00,
    vault_stellar_address VARCHAR(56) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    image_url TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Property Units
CREATE TABLE IF NOT EXISTS property_units (
    id VARCHAR(64) PRIMARY KEY,
    property_id VARCHAR(64) NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    unit_identifier VARCHAR(64) NOT NULL,
    unit_type VARCHAR(64) NOT NULL DEFAULT 'RESIDENTIAL',
    monthly_rent NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    occupancy_status VARCHAR(32) NOT NULL DEFAULT 'OCCUPIED',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_property_unit UNIQUE (property_id, unit_identifier)
);

-- 3. Participants / Stakeholders
CREATE TABLE IF NOT EXISTS participants (
    id VARCHAR(64) PRIMARY KEY,
    wallet_address VARCHAR(56) NOT NULL UNIQUE,
    display_name VARCHAR(255),
    role VARCHAR(64) NOT NULL DEFAULT 'PARTICIPANT',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Property Participation (Ownership/Revenue Rights)
CREATE TABLE IF NOT EXISTS property_participations (
    id VARCHAR(64) PRIMARY KEY,
    property_id VARCHAR(64) NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    participant_id VARCHAR(64) NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    share_percentage NUMERIC(6, 4) NOT NULL, -- e.g. 25.5000%
    role VARCHAR(64) NOT NULL DEFAULT 'INVESTOR',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_property_participant UNIQUE (property_id, participant_id)
);

-- 5. Blockchain Transactions (Raw verified on-chain events)
CREATE TABLE IF NOT EXISTS blockchain_transactions (
    id VARCHAR(64) PRIMARY KEY,
    transaction_hash VARCHAR(64) NOT NULL UNIQUE,
    network VARCHAR(32) NOT NULL DEFAULT 'TESTNET',
    asset VARCHAR(32) NOT NULL DEFAULT 'XLM',
    amount NUMERIC(18, 7) NOT NULL,
    sender VARCHAR(56) NOT NULL,
    recipient VARCHAR(56) NOT NULL,
    operation_type VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL,
    ledger_sequence BIGINT,
    verification_result JSONB NOT NULL,
    confirmed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bt_tx_hash ON blockchain_transactions(transaction_hash);
CREATE INDEX IF NOT EXISTS idx_bt_recipient ON blockchain_transactions(recipient);

-- 6. Revenue Records (Core Financial Ingestion)
CREATE TABLE IF NOT EXISTS revenue_records (
    id VARCHAR(64) PRIMARY KEY,
    property_id VARCHAR(64) NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
    source VARCHAR(64) NOT NULL, -- e.g., 'RENTAL_REVENUE', 'COMMERCIAL_LEASE'
    amount NUMERIC(18, 7) NOT NULL,
    asset VARCHAR(32) NOT NULL DEFAULT 'XLM',
    transaction_hash VARCHAR(64) NOT NULL UNIQUE REFERENCES blockchain_transactions(transaction_hash) ON DELETE RESTRICT,
    depositor_address VARCHAR(56) NOT NULL,
    destination_address VARCHAR(56) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'CONFIRMED', -- 'PENDING', 'CONFIRMED', 'RECONCILED', 'FLAGGED'
    verified_at TIMESTAMP WITH TIME ZONE NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rr_property ON revenue_records(property_id);
CREATE INDEX IF NOT EXISTS idx_rr_tx_hash ON revenue_records(transaction_hash);
CREATE INDEX IF NOT EXISTS idx_rr_status ON revenue_records(status);

-- 7. Audit Events
CREATE TABLE IF NOT EXISTS audit_events (
    id VARCHAR(64) PRIMARY KEY,
    event_type VARCHAR(64) NOT NULL,
    entity_type VARCHAR(64) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    actor_address VARCHAR(56),
    payload JSONB NOT NULL,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ae_entity ON audit_events(entity_type, entity_id);

-- 8. Reconciliation Records
CREATE TABLE IF NOT EXISTS reconciliation_records (
    id VARCHAR(64) PRIMARY KEY,
    run_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    total_onchain_transactions INTEGER NOT NULL,
    total_recorded_revenue INTEGER NOT NULL,
    discrepancies_found INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL, -- 'BALANCED', 'DISCREPANCY_DETECTED'
    details JSONB NOT NULL
);

-- ==============================================================================
-- LEVEL 2 & 3 FUTURE-READY ARCHITECTURAL MODELS
-- (Prepared for clean progression without table drops)
-- ==============================================================================

-- 9. Distribution Agreements (Level 2)
CREATE TABLE IF NOT EXISTS distribution_agreements (
    id VARCHAR(64) PRIMARY KEY,
    property_id VARCHAR(64) NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    active_version INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT', -- 'DRAFT', 'LOCKED', 'EXPIRED'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. Distribution Agreement Versions (Level 2)
CREATE TABLE IF NOT EXISTS distribution_agreement_versions (
    id VARCHAR(64) PRIMARY KEY,
    agreement_id VARCHAR(64) NOT NULL REFERENCES distribution_agreements(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    soroban_agreement_hash VARCHAR(64),
    rules_json JSONB NOT NULL,
    effective_from TIMESTAMP WITH TIME ZONE,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING'
);

-- 11. Waterfall Rules (Level 2)
CREATE TABLE IF NOT EXISTS waterfall_rules (
    id VARCHAR(64) PRIMARY KEY,
    agreement_version_id VARCHAR(64) NOT NULL REFERENCES distribution_agreement_versions(id) ON DELETE CASCADE,
    tier_order INTEGER NOT NULL,
    tier_name VARCHAR(64) NOT NULL, -- 'OPERATIONAL_RESERVES', 'SENIOR_DEBT', 'EQUITY_DISTRIBUTION'
    allocation_cap NUMERIC(18, 2),
    percentage_basis_points INTEGER NOT NULL,
    recipient_type VARCHAR(64) NOT NULL
);

-- 12. Settlement Runs (Level 3)
CREATE TABLE IF NOT EXISTS settlement_runs (
    id VARCHAR(64) PRIMARY KEY,
    property_id VARCHAR(64) NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
    agreement_version_id VARCHAR(64) REFERENCES distribution_agreement_versions(id),
    total_distributable_amount NUMERIC(18, 7) NOT NULL,
    asset VARCHAR(32) NOT NULL DEFAULT 'XLM',
    cycle_period VARCHAR(32) NOT NULL, -- '2026-Q1', '2026-10'
    status VARCHAR(32) NOT NULL DEFAULT 'PREPARED', -- 'PREPARED', 'EXECUTING', 'SETTLED', 'FAILED'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 13. Settlement Recipients (Level 3)
CREATE TABLE IF NOT EXISTS settlement_recipients (
    id VARCHAR(64) PRIMARY KEY,
    settlement_run_id VARCHAR(64) NOT NULL REFERENCES settlement_runs(id) ON DELETE CASCADE,
    participant_id VARCHAR(64) NOT NULL REFERENCES participants(id),
    allocated_amount NUMERIC(18, 7) NOT NULL,
    stellar_payout_hash VARCHAR(64),
    payout_status VARCHAR(32) NOT NULL DEFAULT 'PENDING'
);
