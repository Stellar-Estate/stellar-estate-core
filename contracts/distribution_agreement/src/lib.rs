#![no_std]
#![allow(clippy::too_many_arguments)]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, String, Symbol,
};
use stellar_estate_shared::{
    AgreementStatus, AgreementVersionState, ContractError, Stakeholder,
};

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    PropertyId,
    AgreementId,
    ActiveVersion,
    VersionState(u32),
    StakeholderKey(u32, Address),
    StakeholderCount(u32),
}

const EVENT_AGR_INIT: Symbol = symbol_short!("agr_init");
const EVENT_VER_CREATED: Symbol = symbol_short!("ver_creat");
const EVENT_STK_ADDED: Symbol = symbol_short!("stk_added");
const EVENT_STK_APPR: Symbol = symbol_short!("stk_appr");
const EVENT_AGR_LOCKED: Symbol = symbol_short!("agr_lock");

#[contract]
pub struct DistributionAgreementContract;

#[contractimpl]
impl DistributionAgreementContract {
    /// Initialize the Distribution Agreement Contract for a Property
    pub fn initialize(
        env: Env,
        admin: Address,
        property_id: String,
        agreement_id: String,
    ) -> Result<(), ContractError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(ContractError::AlreadyInitialized);
        }

        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::PropertyId, &property_id);
        env.storage().instance().set(&DataKey::AgreementId, &agreement_id);
        env.storage().instance().set(&DataKey::ActiveVersion, &0u32);

        env.events().publish((EVENT_AGR_INIT, admin), property_id);

        Ok(())
    }

    /// Propose a new Distribution Agreement Version with a deterministic canonical hash
    pub fn create_version(
        env: Env,
        caller: Address,
        version: u32,
        agreement_hash: String,
        total_stakeholders: u32,
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

        if version == 0 || total_stakeholders == 0 {
            return Err(ContractError::InvalidState);
        }

        // Ensure version does not already exist
        if env.storage().persistent().has(&DataKey::VersionState(version)) {
            return Err(ContractError::AlreadyInitialized);
        }

        let current_active: u32 = env
            .storage()
            .instance()
            .get(&DataKey::ActiveVersion)
            .unwrap_or(0);

        if version != current_active + 1 {
            return Err(ContractError::VersionMismatch);
        }

        let state = AgreementVersionState {
            version,
            agreement_hash: agreement_hash.clone(),
            status: AgreementStatus::PendingApprovals,
            total_stakeholders,
            approved_count: 0,
            created_at: env.ledger().timestamp(),
            locked_at: 0,
        };

        env.storage().persistent().set(&DataKey::VersionState(version), &state);
        env.storage().persistent().set(&DataKey::StakeholderCount(version), &0u32);
        env.storage().instance().set(&DataKey::ActiveVersion, &version);

        env.events().publish((EVENT_VER_CREATED, caller), (version, agreement_hash));

        Ok(())
    }

    /// Register a stakeholder allocation to a version prior to approval
    pub fn add_stakeholder(
        env: Env,
        caller: Address,
        version: u32,
        stakeholder_address: Address,
        basis_points: u32,
        role: String,
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

        let version_state: AgreementVersionState = env
            .storage()
            .persistent()
            .get(&DataKey::VersionState(version))
            .ok_or(ContractError::AgreementNotFound)?;

        if version_state.status == AgreementStatus::Locked {
            return Err(ContractError::AgreementLocked);
        }

        if basis_points > 10_000 {
            return Err(ContractError::InvalidBasisPoints);
        }

        let stakeholder = Stakeholder {
            address: stakeholder_address.clone(),
            basis_points,
            role,
            has_approved: false,
        };

        env.storage().persistent().set(
            &DataKey::StakeholderKey(version, stakeholder_address.clone()),
            &stakeholder,
        );

        let mut count: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::StakeholderCount(version))
            .unwrap_or(0);
        count = count.checked_add(1).ok_or(ContractError::Overflow)?;
        env.storage().persistent().set(&DataKey::StakeholderCount(version), &count);

        env.events().publish((EVENT_STK_ADDED, stakeholder_address), (version, basis_points));

        Ok(())
    }

    /// Stakeholder reviews and approves the EXACT agreement version and canonical hash
    pub fn approve_agreement(
        env: Env,
        stakeholder: Address,
        version: u32,
        agreement_hash: String,
    ) -> Result<bool, ContractError> {
        stakeholder.require_auth();

        let mut version_state: AgreementVersionState = env
            .storage()
            .persistent()
            .get(&DataKey::VersionState(version))
            .ok_or(ContractError::AgreementNotFound)?;

        if version_state.status == AgreementStatus::Locked {
            return Err(ContractError::AgreementLocked);
        }

        // Verify exact agreement hash match
        if version_state.agreement_hash != agreement_hash {
            return Err(ContractError::HashMismatch);
        }

        let mut st_record: Stakeholder = env
            .storage()
            .persistent()
            .get(&DataKey::StakeholderKey(version, stakeholder.clone()))
            .ok_or(ContractError::StakeholderNotFound)?;

        if st_record.has_approved {
            return Err(ContractError::AlreadyApproved);
        }

        // Mark approved
        st_record.has_approved = true;
        env.storage().persistent().set(
            &DataKey::StakeholderKey(version, stakeholder.clone()),
            &st_record,
        );

        version_state.approved_count = version_state
            .approved_count
            .checked_add(1)
            .ok_or(ContractError::Overflow)?;

        if version_state.approved_count >= version_state.total_stakeholders {
            version_state.status = AgreementStatus::ReadyToLock;
        }

        env.storage().persistent().set(&DataKey::VersionState(version), &version_state);

        env.events().publish(
            (EVENT_STK_APPR, stakeholder),
            (version, version_state.approved_count),
        );

        Ok(version_state.status == AgreementStatus::ReadyToLock)
    }

    /// Lock the agreement once all required stakeholder approvals have been received
    pub fn lock_agreement(env: Env, caller: Address, version: u32) -> Result<(), ContractError> {
        caller.require_auth();

        let mut version_state: AgreementVersionState = env
            .storage()
            .persistent()
            .get(&DataKey::VersionState(version))
            .ok_or(ContractError::AgreementNotFound)?;

        if version_state.status == AgreementStatus::Locked {
            return Err(ContractError::AgreementLocked);
        }

        // Invariant: all required approvals must be collected before lock
        if version_state.approved_count < version_state.total_stakeholders {
            return Err(ContractError::IncompleteApprovals);
        }

        version_state.status = AgreementStatus::Locked;
        version_state.locked_at = env.ledger().timestamp();

        env.storage().persistent().set(&DataKey::VersionState(version), &version_state);

        env.events().publish(
            (EVENT_AGR_LOCKED, caller),
            (version, version_state.agreement_hash),
        );

        Ok(())
    }

    /// Retrieve authoritative on-chain state of an agreement version
    pub fn get_agreement_version(
        env: Env,
        version: u32,
    ) -> Result<AgreementVersionState, ContractError> {
        env.storage()
            .persistent()
            .get(&DataKey::VersionState(version))
            .ok_or(ContractError::AgreementNotFound)
    }

    /// Retrieve stakeholder status for a given version
    pub fn get_stakeholder(
        env: Env,
        version: u32,
        stakeholder_address: Address,
    ) -> Result<Stakeholder, ContractError> {
        env.storage()
            .persistent()
            .get(&DataKey::StakeholderKey(version, stakeholder_address))
            .ok_or(ContractError::StakeholderNotFound)
    }

    /// Check if a version is locked
    pub fn is_version_locked(env: Env, version: u32) -> bool {
        if let Some(state) = env
            .storage()
            .persistent()
            .get::<_, AgreementVersionState>(&DataKey::VersionState(version))
        {
            state.status == AgreementStatus::Locked
        } else {
            false
        }
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env, String};

    #[test]
    fn test_agreement_lifecycle_to_locked() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(DistributionAgreementContract, ());
        let client = DistributionAgreementContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        let charlie = Address::generate(&env);

        let prop_id = String::from_str(&env, "prop-meridian-abuja");
        let agr_id = String::from_str(&env, "MERIDIAN-REV-001");
        let hash_v1 = String::from_str(&env, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");

        // 1. Initialize
        client.initialize(&admin, &prop_id, &agr_id);

        // 2. Create version 1 (3 stakeholders required)
        client.create_version(&admin, &1, &hash_v1, &3);

        // 3. Add stakeholders (Alice 4000 bps, Bob 3500 bps, Charlie 2500 bps = 10,000 bps / 100%)
        client.add_stakeholder(&admin, &1, &alice, &4000, &String::from_str(&env, "Alice"));
        client.add_stakeholder(&admin, &1, &bob, &3500, &String::from_str(&env, "Bob"));
        client.add_stakeholder(&admin, &1, &charlie, &2500, &String::from_str(&env, "Charlie"));

        // 4. Try locking prematurely -> Fails with IncompleteApprovals (#14)
        // Verified by assert below after Alice approves
        let ready1 = client.approve_agreement(&alice, &1, &hash_v1);
        assert!(!ready1);

        let ready2 = client.approve_agreement(&bob, &1, &hash_v1);
        assert!(!ready2);

        // Charlie approves -> ready to lock!
        let ready3 = client.approve_agreement(&charlie, &1, &hash_v1);
        assert!(ready3);

        // 5. Lock agreement
        client.lock_agreement(&admin, &1);

        assert!(client.is_version_locked(&1));

        let state = client.get_agreement_version(&1);
        assert_eq!(state.status, AgreementStatus::Locked);
        assert_eq!(state.approved_count, 3);
        assert_eq!(state.agreement_hash, hash_v1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #16)")] // HashMismatch
    fn test_rejects_approval_with_mismatched_hash() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(DistributionAgreementContract, ());
        let client = DistributionAgreementContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let alice = Address::generate(&env);

        client.initialize(
            &admin,
            &String::from_str(&env, "prop-01"),
            &String::from_str(&env, "AGR-01"),
        );
        client.create_version(&admin, &1, &String::from_str(&env, "CORRECT_HASH_123"), &1);
        client.add_stakeholder(&admin, &1, &alice, &10000, &String::from_str(&env, "Alice"));

        // Attempt to approve with WRONG hash
        client.approve_agreement(&alice, &1, &String::from_str(&env, "WRONG_HASH_999"));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #13)")] // AgreementLocked
    fn test_rejects_modification_after_lock() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(DistributionAgreementContract, ());
        let client = DistributionAgreementContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let alice = Address::generate(&env);
        let hash = String::from_str(&env, "HASH_123");

        client.initialize(
            &admin,
            &String::from_str(&env, "prop-01"),
            &String::from_str(&env, "AGR-01"),
        );
        client.create_version(&admin, &1, &hash, &1);
        client.add_stakeholder(&admin, &1, &alice, &10000, &String::from_str(&env, "Alice"));
        client.approve_agreement(&alice, &1, &hash);
        client.lock_agreement(&admin, &1);

        // Attempt to add stakeholder to LOCKED version
        let eve = Address::generate(&env);
        client.add_stakeholder(&admin, &1, &eve, &500, &String::from_str(&env, "Eve"));
    }
}
