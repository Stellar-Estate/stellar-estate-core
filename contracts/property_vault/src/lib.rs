#![no_std]
#![allow(clippy::too_many_arguments)]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, String, Symbol, Vec,
};
use stellar_estate_shared::{
    ContractError, PropertyMetadata, RecipientPayout, RevenueEntry, SettlementExecutionArgs,
    SettlementRecord, SettlementStatus, VaultFinancialState, VaultStatus,
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
    Settlement(String),
    SettlementPayouts(String),
    SettlementCount,
    ConsumedRevenue(u32),
    TotalSettledRevenue,
}

const EVENT_VAULT_INIT: Symbol = symbol_short!("init_vlt");
const EVENT_REV_REC: Symbol = symbol_short!("rev_rec");
const EVENT_STATUS_CHG: Symbol = symbol_short!("stat_chg");
const EVENT_SETTLE: Symbol = symbol_short!("settle");

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
        env.storage().instance().set(&DataKey::SettlementCount, &0u32);
        env.storage().instance().set(&DataKey::TotalSettledRevenue, &0i128);

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

    /// Validates eligibility for distribution agreements
    pub fn check_waterfall_readiness(env: Env) -> Result<bool, ContractError> {
        let financials = Self::get_financials(env)?;
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

    /// Execute a deterministic multi-recipient settlement against verified revenue
    pub fn execute_settlement(
        env: Env,
        caller: Address,
        args: SettlementExecutionArgs,
        payouts: Vec<RecipientPayout>,
    ) -> Result<(), ContractError> {
        caller.require_auth();

        let status: VaultStatus = env
            .storage()
            .instance()
            .get(&DataKey::VaultStatusKey)
            .ok_or(ContractError::NotInitialized)?;

        if status != VaultStatus::Active {
            return Err(ContractError::VaultPaused);
        }

        // 1. Double settlement check: settlement ID must be unique
        if env.storage().persistent().has(&DataKey::Settlement(args.settlement_id.clone())) {
            return Err(ContractError::AlreadySettled);
        }

        // 2. Revenue existence & double-spending protection
        let revenue_entry = Self::get_revenue_entry(env.clone(), args.revenue_id)?;
        if env.storage().persistent().has(&DataKey::ConsumedRevenue(args.revenue_id)) {
            return Err(ContractError::AlreadySettled);
        }

        if args.gross_revenue <= 0 || revenue_entry.amount < args.gross_revenue {
            return Err(ContractError::InsufficientRevenue);
        }

        // 3. Agreement hash protection: if vault has active agreement hash set, must match exactly
        if let Ok((_agr_contract, active_hash)) = Self::get_active_agreement(env.clone()) {
            if active_hash != args.agreement_hash {
                return Err(ContractError::HashMismatch);
            }
        }

        // 4. Invariant: gross_revenue == expenses + reserve + fees + distributable_amount
        if args.expenses < 0 || args.reserve < 0 || args.fees < 0 || args.distributable_amount < 0 {
            return Err(ContractError::InvalidSettlementAmount);
        }

        let calculated_total = args.expenses
            .checked_add(args.reserve).ok_or(ContractError::Overflow)?
            .checked_add(args.fees).ok_or(ContractError::Overflow)?
            .checked_add(args.distributable_amount).ok_or(ContractError::Overflow)?;

        if calculated_total != args.gross_revenue {
            return Err(ContractError::InvalidSettlementAmount);
        }

        // 5. Payouts validation: sum of recipient payouts must equal distributable_amount
        if payouts.is_empty() {
            return Err(ContractError::RecipientAllocationMismatch);
        }

        let mut sum_payouts: i128 = 0;
        let mut sum_bps: u32 = 0;
        for payout in payouts.iter() {
            if payout.amount <= 0 {
                return Err(ContractError::InvalidAmount);
            }
            sum_payouts = sum_payouts.checked_add(payout.amount).ok_or(ContractError::Overflow)?;
            sum_bps = sum_bps.checked_add(payout.basis_points).ok_or(ContractError::Overflow)?;
        }

        if sum_payouts != args.distributable_amount || sum_bps > 10_000 {
            return Err(ContractError::RecipientAllocationMismatch);
        }

        // 6. Mark revenue as consumed (prevent replay & double-settlement)
        env.storage().persistent().set(&DataKey::ConsumedRevenue(args.revenue_id), &true);

        // 7. Update vault financial reserves
        let mut financials: VaultFinancialState = env
            .storage()
            .instance()
            .get(&DataKey::FinancialState)
            .ok_or(ContractError::NotInitialized)?;

        financials.reserve_balance = financials
            .reserve_balance
            .checked_add(args.reserve)
            .ok_or(ContractError::Overflow)?;

        env.storage().instance().set(&DataKey::FinancialState, &financials);

        // 8. Track total settled revenue and settlement count
        let total_settled: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalSettledRevenue)
            .unwrap_or(0);
        let new_total_settled = total_settled.checked_add(args.gross_revenue).ok_or(ContractError::Overflow)?;
        env.storage().instance().set(&DataKey::TotalSettledRevenue, &new_total_settled);

        let settlement_count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::SettlementCount)
            .unwrap_or(0);
        let new_settlement_count = settlement_count.checked_add(1).ok_or(ContractError::Overflow)?;
        env.storage().instance().set(&DataKey::SettlementCount, &new_settlement_count);

        // 9. Persist immutable settlement record and payouts
        let record = SettlementRecord {
            settlement_id: args.settlement_id.clone(),
            agreement_id: args.agreement_id,
            agreement_version: args.agreement_version,
            agreement_hash: args.agreement_hash,
            gross_revenue: args.gross_revenue,
            expenses: args.expenses,
            reserve: args.reserve,
            fees: args.fees,
            distributable_amount: args.distributable_amount,
            recipient_count: payouts.len(),
            status: SettlementStatus::Settled,
            executed_at: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&DataKey::Settlement(args.settlement_id.clone()), &record);
        env.storage().persistent().set(&DataKey::SettlementPayouts(args.settlement_id.clone()), &payouts);

        // 10. Emit authoritative settlement event
        env.events().publish(
            (EVENT_SETTLE, caller),
            (args.settlement_id, args.distributable_amount),
        );

        Ok(())
    }

    /// Retrieve an immutable settlement record by ID
    pub fn get_settlement(env: Env, settlement_id: String) -> Result<SettlementRecord, ContractError> {
        env.storage()
            .persistent()
            .get(&DataKey::Settlement(settlement_id))
            .ok_or(ContractError::InvalidState)
    }

    /// Retrieve recipient payouts for a settlement
    pub fn get_settlement_payouts(
        env: Env,
        settlement_id: String,
    ) -> Result<Vec<RecipientPayout>, ContractError> {
        env.storage()
            .persistent()
            .get(&DataKey::SettlementPayouts(settlement_id))
            .ok_or(ContractError::InvalidState)
    }

    /// Check if a revenue ID has already been consumed by settlement
    pub fn is_revenue_consumed(env: Env, revenue_id: u32) -> bool {
        env.storage().persistent().has(&DataKey::ConsumedRevenue(revenue_id))
    }

    /// Retrieve the total number of executed settlements
    pub fn get_settlement_count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::SettlementCount).unwrap_or(0)
    }

    /// Retrieve total revenue settled to date
    pub fn get_total_settled_revenue(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::TotalSettledRevenue).unwrap_or(0)
    }
}

#[cfg(test)]
#[allow(clippy::all)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, vec, Env, String};

    fn setup_test_vault(env: &Env) -> (PropertyVaultContractClient<'_>, Address, Address) {
        let contract_id = env.register(PropertyVaultContract, ());
        let client = PropertyVaultContractClient::new(env, &contract_id);
        let admin = Address::generate(env);
        let accepted_asset = Address::generate(env);

        client.initialize(
            &admin,
            &String::from_str(env, "prop-meridian-01"),
            &String::from_str(env, "The Meridian"),
            &String::from_str(env, "Abuja, Nigeria"),
            &50_000_000_000,
            &10,
            &9,
            &accepted_asset,
        );

        (client, admin, accepted_asset)
    }

    #[test]
    fn test_vault_initialization_and_financials() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _admin, _asset) = setup_test_vault(&env);

        let meta = client.get_property_metadata();
        assert_eq!(meta.property_id, String::from_str(&env, "prop-meridian-01"));
        assert_eq!(meta.total_units, 10);
        assert_eq!(meta.occupied_units, 9);

        let financials = client.get_financials();
        assert_eq!(financials.total_revenue_received, 0);
        assert_eq!(financials.deposit_count, 0);
        assert_eq!(client.get_settlement_count(), 0);
        assert_eq!(client.get_total_settled_revenue(), 0);
    }

    #[test]
    fn test_record_revenue_success_and_accounting() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _admin, _asset) = setup_test_vault(&env);
        let depositor = Address::generate(&env);

        let source = String::from_str(&env, "rental_revenue");
        let amount: i128 = 1_000_000_000; // $10,000 in stroops

        let rev_id_1 = client.record_revenue(&depositor, &source, &amount);
        assert_eq!(rev_id_1, 1);

        let financials = client.get_financials();
        assert_eq!(financials.total_revenue_received, 1_000_000_000);
        assert_eq!(financials.deposit_count, 1);

        let entry = client.get_revenue_entry(&1);
        assert_eq!(entry.amount, amount);
        assert!(entry.reconciled);
        assert!(!client.is_revenue_consumed(&1));
    }

    #[test]
    fn test_settlement_execution_success() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, admin, _asset) = setup_test_vault(&env);
        let depositor = Address::generate(&env);

        // 1. Record $10,000 revenue
        let rev_id = client.record_revenue(
            &depositor,
            &String::from_str(&env, "rental_revenue"),
            &1_000_000_000,
        );

        // 2. Set active distribution agreement
        let agreement_contract = Address::generate(&env);
        let agreement_hash = String::from_str(&env, "a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0");
        client.set_distribution_agreement(&admin, &agreement_contract, &agreement_hash);

        // 3. Prepare payouts for Alice (40%), Bob (35%), Charlie (25%)
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        let charlie = Address::generate(&env);

        let payouts = vec![
            &env,
            RecipientPayout {
                recipient: alice.clone(),
                basis_points: 4000,
                amount: 304_000_000, // $3,040
            },
            RecipientPayout {
                recipient: bob.clone(),
                basis_points: 3500,
                amount: 266_000_000, // $2,660
            },
            RecipientPayout {
                recipient: charlie.clone(),
                basis_points: 2500,
                amount: 190_000_000, // $1,900
            },
        ];

        let settlement_id = String::from_str(&env, "STL-MERIDIAN-001");
        let agr_id = String::from_str(&env, "MERIDIAN-REV-001");

        let args = SettlementExecutionArgs {
            settlement_id: settlement_id.clone(),
            agreement_id: agr_id,
            agreement_version: 2u32,
            agreement_hash,
            revenue_id: rev_id,
            gross_revenue: 1_000_000_000,
            expenses: 100_000_000,
            reserve: 100_000_000,
            fees: 40_000_000,
            distributable_amount: 760_000_000,
        };

        // Execute settlement
        client.execute_settlement(&admin, &args, &payouts);

        // Verify state
        assert!(client.is_revenue_consumed(&rev_id));
        assert_eq!(client.get_settlement_count(), 1);
        assert_eq!(client.get_total_settled_revenue(), 1_000_000_000);

        let record = client.get_settlement(&settlement_id);
        assert_eq!(record.settlement_id, settlement_id);
        assert_eq!(record.gross_revenue, 1_000_000_000);
        assert_eq!(record.distributable_amount, 760_000_000);
        assert_eq!(record.recipient_count, 3);
        assert_eq!(record.status, SettlementStatus::Settled);

        let stored_payouts = client.get_settlement_payouts(&settlement_id);
        assert_eq!(stored_payouts.len(), 3);
        assert_eq!(stored_payouts.get(0).unwrap().amount, 304_000_000);

        let financials = client.get_financials();
        assert_eq!(financials.reserve_balance, 100_000_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #20)")] // AlreadySettled
    fn test_double_spending_revenue_prevention() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, admin, _asset) = setup_test_vault(&env);
        let depositor = Address::generate(&env);

        let rev_id = client.record_revenue(
            &depositor,
            &String::from_str(&env, "rental_revenue"),
            &1_000_000_000,
        );

        let agreement_contract = Address::generate(&env);
        let agreement_hash = String::from_str(&env, "hash1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab");
        client.set_distribution_agreement(&admin, &agreement_contract, &agreement_hash);

        let alice = Address::generate(&env);
        let payouts = vec![
            &env,
            RecipientPayout {
                recipient: alice,
                basis_points: 10_000,
                amount: 760_000_000,
            },
        ];

        let agr_id = String::from_str(&env, "MERIDIAN-REV-001");

        let args1 = SettlementExecutionArgs {
            settlement_id: String::from_str(&env, "STL-001"),
            agreement_id: agr_id.clone(),
            agreement_version: 1u32,
            agreement_hash: agreement_hash.clone(),
            revenue_id: rev_id,
            gross_revenue: 1_000_000_000,
            expenses: 100_000_000,
            reserve: 100_000_000,
            fees: 40_000_000,
            distributable_amount: 760_000_000,
        };

        // 1st settlement consumes revenue
        client.execute_settlement(&admin, &args1, &payouts);

        let args2 = SettlementExecutionArgs {
            settlement_id: String::from_str(&env, "STL-002"),
            agreement_id: agr_id,
            agreement_version: 1u32,
            agreement_hash,
            revenue_id: rev_id,
            gross_revenue: 1_000_000_000,
            expenses: 100_000_000,
            reserve: 100_000_000,
            fees: 40_000_000,
            distributable_amount: 760_000_000,
        };

        // 2nd settlement attempting to reuse the same revenue must fail with AlreadySettled
        client.execute_settlement(&admin, &args2, &payouts);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #16)")] // HashMismatch
    fn test_settlement_hash_mismatch_rejected() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, admin, _asset) = setup_test_vault(&env);
        let depositor = Address::generate(&env);

        let rev_id = client.record_revenue(
            &depositor,
            &String::from_str(&env, "rental_revenue"),
            &1_000_000_000,
        );

        let agreement_contract = Address::generate(&env);
        let locked_hash = String::from_str(&env, "locked_canonical_hash_abc_1234567890abcdef1234567890abcdef12345678");
        client.set_distribution_agreement(&admin, &agreement_contract, &locked_hash);

        let alice = Address::generate(&env);
        let payouts = vec![
            &env,
            RecipientPayout {
                recipient: alice,
                basis_points: 10_000,
                amount: 760_000_000,
            },
        ];

        let wrong_hash = String::from_str(&env, "tampered_fake_hash_99999999999999999999999999999999999999999999999");

        let args = SettlementExecutionArgs {
            settlement_id: String::from_str(&env, "STL-TAMPERED-001"),
            agreement_id: String::from_str(&env, "MERIDIAN-REV-001"),
            agreement_version: 2u32,
            agreement_hash: wrong_hash,
            revenue_id: rev_id,
            gross_revenue: 1_000_000_000,
            expenses: 100_000_000,
            reserve: 100_000_000,
            fees: 40_000_000,
            distributable_amount: 760_000_000,
        };

        // Attempt settlement with mismatched hash
        client.execute_settlement(&admin, &args, &payouts);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #21)")] // InvalidSettlementAmount
    fn test_accounting_invariant_violation_rejected() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, admin, _asset) = setup_test_vault(&env);
        let depositor = Address::generate(&env);

        let rev_id = client.record_revenue(
            &depositor,
            &String::from_str(&env, "rental_revenue"),
            &1_000_000_000,
        );

        let agreement_hash = String::from_str(&env, "valid_hash");
        let alice = Address::generate(&env);
        let payouts = vec![
            &env,
            RecipientPayout {
                recipient: alice,
                basis_points: 10_000,
                amount: 800_000_000,
            },
        ];

        // Expenses (100) + Reserve (100) + Fees (40) + Distributable (800) = 1_040 != Gross (1_000)
        let args = SettlementExecutionArgs {
            settlement_id: String::from_str(&env, "STL-INVALID-001"),
            agreement_id: String::from_str(&env, "MERIDIAN-REV-001"),
            agreement_version: 1u32,
            agreement_hash,
            revenue_id: rev_id,
            gross_revenue: 1_000_000_000,
            expenses: 100_000_000,
            reserve: 100_000_000,
            fees: 40_000_000,
            distributable_amount: 800_000_000, // Invariant violated!
        };

        client.execute_settlement(&admin, &args, &payouts);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #24)")] // RecipientAllocationMismatch
    fn test_recipient_payout_sum_mismatch_rejected() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, admin, _asset) = setup_test_vault(&env);
        let depositor = Address::generate(&env);

        let rev_id = client.record_revenue(
            &depositor,
            &String::from_str(&env, "rental_revenue"),
            &1_000_000_000,
        );

        let agreement_hash = String::from_str(&env, "valid_hash");
        let alice = Address::generate(&env);
        let payouts = vec![
            &env,
            RecipientPayout {
                recipient: alice,
                basis_points: 10_000,
                amount: 750_000_000, // $7,500 instead of distributable $7,600!
            },
        ];

        let args = SettlementExecutionArgs {
            settlement_id: String::from_str(&env, "STL-MISMATCH-001"),
            agreement_id: String::from_str(&env, "MERIDIAN-REV-001"),
            agreement_version: 1u32,
            agreement_hash,
            revenue_id: rev_id,
            gross_revenue: 1_000_000_000,
            expenses: 100_000_000,
            reserve: 100_000_000,
            fees: 40_000_000,
            distributable_amount: 760_000_000,
        };

        client.execute_settlement(&admin, &args, &payouts);
    }
}
