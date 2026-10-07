#![no_std]

use soroban_sdk::{contracterror, contracttype, Address, String};

/// Error codes returned across Stellar Estate Soroban contracts
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ContractError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InvalidAmount = 4,
    InvalidPropertyId = 5,
    InvalidAsset = 6,
    DuplicateRevenue = 7,
    VaultPaused = 8,
    Overflow = 9,
    InvalidState = 10,
    AgreementNotFound = 11,
    WaterfallNotConfigured = 12,
    AgreementLocked = 13,
    IncompleteApprovals = 14,
    InvalidBasisPoints = 15,
    HashMismatch = 16,
    AlreadyApproved = 17,
    StakeholderNotFound = 18,
    VersionMismatch = 19,
    AlreadySettled = 20,
    InvalidSettlementAmount = 21,
    AgreementNotLocked = 22,
    InsufficientRevenue = 23,
    RecipientAllocationMismatch = 24,
}

/// Status of the property vault
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum VaultStatus {
    Active = 1,
    Paused = 2,
    Liquidating = 3,
}

/// Status of a Distribution Agreement Version
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum AgreementStatus {
    Draft = 1,
    PendingApprovals = 2,
    ReadyToLock = 3,
    Locked = 4,
    Superseded = 5,
}

/// Rule types for Waterfall tranches
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum WaterfallRuleType {
    FixedAmount = 1,
    BasisPoints = 2,
    Residual = 3,
}

/// Metadata describing a property financial vault
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PropertyMetadata {
    pub property_id: String,
    pub name: String,
    pub location: String,
    pub valuation: i128,      // Valuation in asset base units (e.g., stroops or cents)
    pub total_units: u32,
    pub occupied_units: u32,
}

/// Financial state of a property vault
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VaultFinancialState {
    pub total_revenue_received: i128,
    pub total_revenue_recorded: i128,
    pub reserve_balance: i128,
    pub last_revenue_timestamp: u64,
    pub deposit_count: u32,
}

/// Record of an ingested revenue event
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RevenueEntry {
    pub revenue_id: u32,
    pub source: String,       // e.g., "rental_income", "commercial_lease"
    pub amount: i128,
    pub depositor: Address,
    pub timestamp: u64,
    pub reconciled: bool,
}

/// Level 2: On-chain Waterfall Rule specification
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WaterfallRule {
    pub rule_id: u32,
    pub priority: u32,
    pub rule_type: WaterfallRuleType,
    pub amount_or_bps: i128,   // Fixed amount in stroops or basis points (e.g. 500 = 5.00%)
    pub description: String,
}

/// Level 2: On-chain Stakeholder allocation record
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Stakeholder {
    pub address: Address,
    pub basis_points: u32,     // 0 to 10,000 (10,000 = 100.00%)
    pub role: String,          // e.g., "Majority Equity", "Operator"
    pub has_approved: bool,
}

/// Level 2: Authoritative On-chain Distribution Agreement Version State
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AgreementVersionState {
    pub version: u32,
    pub agreement_hash: String, // 64 hex character deterministic canonical SHA-256 hash
    pub status: AgreementStatus,
    pub total_stakeholders: u32,
    pub approved_count: u32,
    pub created_at: u64,
    pub locked_at: u64,
}

/// Level 3: Settlement Status state machine
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum SettlementStatus {
    Created = 1,
    Validating = 2,
    Ready = 3,
    Settled = 4,
    Reconciled = 5,
    Failed = 6,
}

/// Level 3: Individual recipient payout entry
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RecipientPayout {
    pub recipient: Address,
    pub basis_points: u32,
    pub amount: i128,
}

/// Level 3: Immutable On-Chain Settlement Record
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SettlementRecord {
    pub settlement_id: String,
    pub agreement_id: String,
    pub agreement_version: u32,
    pub agreement_hash: String,
    pub gross_revenue: i128,
    pub expenses: i128,
    pub reserve: i128,
    pub fees: i128,
    pub distributable_amount: i128,
    pub recipient_count: u32,
    pub status: SettlementStatus,
    pub executed_at: u64,
}
