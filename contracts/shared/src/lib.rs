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

/// Level 2/3 Preparation: Stub for Distribution Agreement state
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DistributionAgreementStub {
    pub agreement_id: u32,
    pub version: u32,
    pub is_active: bool,
    pub stakeholder_count: u32,
}
