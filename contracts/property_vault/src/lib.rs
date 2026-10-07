#![no_std]
#![allow(clippy::too_many_arguments)]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, String, Symbol,
};
use stellar_estate_shared::{
    ContractError, PropertyMetadata, RevenueEntry, VaultFinancialState, VaultStatus,
};

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    PropertyMeta,
    AcceptedAsset,
    VaultStatusKey,
    FinancialState,
    RevenueNonce,
    RevenueRecord(u32),
    ActiveAgreementContract,
    ActiveAgreementHash,
}

const EVENT_VAULT_INIT: Symbol = symbol_short!("init_vlt");
const EVENT_REV_REC: Symbol = symbol_short!("rev_rec");
const EVENT_STATUS_CHG: Symbol = symbol_short!("stat_chg");

#[contract]
pub struct PropertyVaultContract;

#[contractimpl]
impl PropertyVaultContract {
    /// Initialize the Property Vault contract
    pub fn initialize(
        env: Env,
        admin: Address,
        property_id: String,
        name: String,
        location: String,
        valuation: i128,
        total_units: u32,
        occupied_units: u32,
        accepted_asset: Address,
    ) -> Result<(), ContractError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(ContractError::AlreadyInitialized);
        }

        if valuation <= 0 {
            return Err(ContractError::InvalidAmount);
        }

        admin.require_auth();

        let meta = PropertyMetadata {
            property_id,
            name,
            location,
            valuation,
            total_units,
            occupied_units,
        };

        let initial_financials = VaultFinancialState {
            total_revenue_received: 0,
            total_revenue_recorded: 0,
            reserve_balance: 0,
            last_revenue_timestamp: env.ledger().timestamp(),
            deposit_count: 0,
        };

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::PropertyMeta, &meta);
        env.storage().instance().set(&DataKey::AcceptedAsset, &accepted_asset);
        env.storage().instance().set(&DataKey::VaultStatusKey, &VaultStatus::Active);
        env.storage().instance().set(&DataKey::FinancialState, &initial_financials);
        env.storage().instance().set(&DataKey::RevenueNonce, &0u32);

        // Emit vault initialization event
        env.events().publish(
            (EVENT_VAULT_INIT, admin),
            meta.valuation,
        );

        Ok(())
    }

    /// Record a verified property revenue payment into the vault
    pub fn record_revenue(
        env: Env,
        caller: Address,
        source: String,
        amount: i128,
    ) -> Result<u32, ContractError> {
        caller.require_auth();

        let status: VaultStatus = env
            .storage()
            .instance()
            .get(&DataKey::VaultStatusKey)
            .ok_or(ContractError::NotInitialized)?;

        if status != VaultStatus::Active {
            return Err(ContractError::VaultPaused);
        }

        if amount <= 0 {
            return Err(ContractError::InvalidAmount);
        }

        let mut financials: VaultFinancialState = env
            .storage()
            .instance()
            .get(&DataKey::FinancialState)
            .ok_or(ContractError::NotInitialized)?;

        let mut nonce: u32 = env
            .storage()
            .instance()
            .get(&DataKey::RevenueNonce)
            .unwrap_or(0);

        nonce = nonce.checked_add(1).ok_or(ContractError::Overflow)?;

        financials.total_revenue_received = financials
            .total_revenue_received
            .checked_add(amount)
            .ok_or(ContractError::Overflow)?;

        financials.total_revenue_recorded = financials
            .total_revenue_recorded
            .checked_add(amount)
            .ok_or(ContractError::Overflow)?;

        financials.last_revenue_timestamp = env.ledger().timestamp();
        financials.deposit_count = nonce;

        let entry = RevenueEntry {
            revenue_id: nonce,
            source,
            amount,
            depositor: caller.clone(),
            timestamp: env.ledger().timestamp(),
            reconciled: true,
        };

        env.storage().instance().set(&DataKey::FinancialState, &financials);
        env.storage().instance().set(&DataKey::RevenueNonce, &nonce);
        env.storage().persistent().set(&DataKey::RevenueRecord(nonce), &entry);

        // Emit revenue recorded event
        env.events().publish(
            (EVENT_REV_REC, caller),
            (nonce, amount),
        );

        Ok(nonce)
    }

    /// Retrieve the vault financial state
    pub fn get_financials(env: Env) -> Result<VaultFinancialState, ContractError> {
        env.storage()
            .instance()
            .get(&DataKey::FinancialState)
            .ok_or(ContractError::NotInitialized)
    }

    /// Retrieve the property metadata
    pub fn get_property_metadata(env: Env) -> Result<PropertyMetadata, ContractError> {
        env.storage()
            .instance()
            .get(&DataKey::PropertyMeta)
            .ok_or(ContractError::NotInitialized)
    }

    /// Retrieve a specific revenue record by ID
    pub fn get_revenue_entry(env: Env, revenue_id: u32) -> Result<RevenueEntry, ContractError> {
        env.storage()
            .persistent()
            .get(&DataKey::RevenueRecord(revenue_id))
            .ok_or(ContractError::InvalidState)
    }

    /// Set vault operational status (Admin only)
    pub fn set_status(env: Env, caller: Address, new_status: VaultStatus) -> Result<(), ContractError> {
        caller.require_auth();

        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(ContractError::NotInitialized)?;

        if caller != admin {
            return Err(ContractError::Unauthorized);
        }

        env.storage().instance().set(&DataKey::VaultStatusKey, &new_status);

        env.events().publish((EVENT_STATUS_CHG, caller), new_status as u32);
        Ok(())
    }

    /// Level 2/3 Extension Hook: Validates eligibility for future distribution agreements
    pub fn check_waterfall_readiness(env: Env) -> Result<bool, ContractError> {
        let financials = Self::get_financials(env.clone())?;
        Ok(financials.total_revenue_recorded > 0)
    }

    /// Link an authoritative locked distribution agreement to this property vault
    pub fn set_distribution_agreement(
        env: Env,
        caller: Address,
        agreement_contract: Address,
        agreement_hash: String,
    ) -> Result<(), ContractError> {
        caller.require_auth();

        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(ContractError::NotInitialized)?;

        if caller != admin {
            return Err(ContractError::Unauthorized);
        }

        env.storage().instance().set(&DataKey::ActiveAgreementContract, &agreement_contract);
        env.storage().instance().set(&DataKey::ActiveAgreementHash, &agreement_hash);

        Ok(())
    }

    /// Retrieve the currently bound distribution agreement contract & hash
    pub fn get_active_agreement(env: Env) -> Result<(Address, String), ContractError> {
        let contract: Address = env
            .storage()
            .instance()
            .get(&DataKey::ActiveAgreementContract)
            .ok_or(ContractError::AgreementNotFound)?;
        let hash: String = env
            .storage()
            .instance()
            .get(&DataKey::ActiveAgreementHash)
            .ok_or(ContractError::AgreementNotFound)?;
        Ok((contract, hash))
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env, String};

    #[test]
    fn test_vault_initialization_and_financials() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(PropertyVaultContract, ());
        let client = PropertyVaultContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let accepted_asset = Address::generate(&env);

        let prop_id = String::from_str(&env, "prop-meridian-01");
        let name = String::from_str(&env, "The Meridian");
        let location = String::from_str(&env, "Abuja, Nigeria");

        // Valid initialization
        client.initialize(
            &admin,
            &prop_id,
            &name,
            &location,
            &50_000_000_000, // 500,000 USD (in cents/stroops)
            &10,
            &9,
            &accepted_asset,
        );

        let meta = client.get_property_metadata();
        assert_eq!(meta.property_id, prop_id);
        assert_eq!(meta.total_units, 10);
        assert_eq!(meta.occupied_units, 9);

        let financials = client.get_financials();
        assert_eq!(financials.total_revenue_received, 0);
        assert_eq!(financials.deposit_count, 0);
    }

    #[test]
    fn test_record_revenue_success_and_replay_protection() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(PropertyVaultContract, ());
        let client = PropertyVaultContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let accepted_asset = Address::generate(&env);
        let depositor = Address::generate(&env);

        client.initialize(
            &admin,
            &String::from_str(&env, "prop-01"),
            &String::from_str(&env, "The Meridian"),
            &String::from_str(&env, "Abuja, Nigeria"),
            &50_000_000_000,
            &10,
            &9,
            &accepted_asset,
        );

        let source = String::from_str(&env, "rental_revenue");
        let amount: i128 = 800_000_000; // 8,000 units

        let rev_id_1 = client.record_revenue(&depositor, &source, &amount);
        assert_eq!(rev_id_1, 1);

        let rev_id_2 = client.record_revenue(&depositor, &source, &amount);
        assert_eq!(rev_id_2, 2);

        let financials = client.get_financials();
        assert_eq!(financials.total_revenue_received, 1_600_000_000);
        assert_eq!(financials.deposit_count, 2);

        let entry = client.get_revenue_entry(&1);
        assert_eq!(entry.amount, amount);
        assert_eq!(entry.reconciled, true);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")] // InvalidAmount
    fn test_zero_amount_rejected() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(PropertyVaultContract, ());
        let client = PropertyVaultContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let accepted_asset = Address::generate(&env);
        let depositor = Address::generate(&env);

        client.initialize(
            &admin,
            &String::from_str(&env, "prop-01"),
            &String::from_str(&env, "The Meridian"),
            &String::from_str(&env, "Abuja, Nigeria"),
            &50_000_000_000,
            &10,
            &9,
            &accepted_asset,
        );

        client.record_revenue(&depositor, &String::from_str(&env, "rent"), &0);
    }
}
