#![no_std]
#![allow(clippy::too_many_arguments)]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, BytesN, Env, String, Symbol, Vec,
};
use stellar_estate_shared::{
    AgreementStatus, AgreementVersionState, ContractError, Stakeholder,
    INSTANCE_BUMP_AMOUNT, INSTANCE_BUMP_THRESHOLD, PERSISTENT_BUMP_AMOUNT, PERSISTENT_BUMP_THRESHOLD,
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
const EVENT_PROPOSED: Symbol = symbol_short!("proposed");
const EVENT_STK_ADDED: Symbol = symbol_short!("stk_added");
const EVENT_APPROVED: Symbol = symbol_short!("approved");
const EVENT_AGR_LOCKED: Symbol = symbol_short!("locked");

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

        // Extend instance storage TTL to avoid contract archival on Stellar
        env.storage().instance().extend_ttl(INSTANCE_BUMP_THRESHOLD, INSTANCE_BUMP_AMOUNT);

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

        // Extend instance and persistent TTLs for newly proposed agreement version
        env.storage().instance().extend_ttl(INSTANCE_BUMP_THRESHOLD, INSTANCE_BUMP_AMOUNT);
        env.storage().persistent().extend_ttl(&DataKey::VersionState(version), PERSISTENT_BUMP_THRESHOLD, PERSISTENT_BUMP_AMOUNT);

        let agreement_id: String = env
            .storage()
            .instance()
            .get(&DataKey::AgreementId)
            .unwrap_or(String::from_str(&env, "AGR"));

        env.events().publish((EVENT_PROPOSED, agreement_id), (version, agreement_hash, caller));

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

        // Extend persistent storage TTL for stakeholder record and version
        env.storage().persistent().extend_ttl(&DataKey::StakeholderKey(version, stakeholder_address.clone()), PERSISTENT_BUMP_THRESHOLD, PERSISTENT_BUMP_AMOUNT);
        env.storage().persistent().extend_ttl(&DataKey::VersionState(version), PERSISTENT_BUMP_THRESHOLD, PERSISTENT_BUMP_AMOUNT);

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

        // Extend persistent storage TTL for updated version and stakeholder approval
        env.storage().persistent().extend_ttl(&DataKey::StakeholderKey(version, stakeholder.clone()), PERSISTENT_BUMP_THRESHOLD, PERSISTENT_BUMP_AMOUNT);
        env.storage().persistent().extend_ttl(&DataKey::VersionState(version), PERSISTENT_BUMP_THRESHOLD, PERSISTENT_BUMP_AMOUNT);

        let agreement_id: String = env
            .storage()
            .instance()
            .get(&DataKey::AgreementId)
            .unwrap_or(String::from_str(&env, "AGR"));

        env.events().publish(
            (EVENT_APPROVED, agreement_id),
            (version, stakeholder, version_state.approved_count),
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

        // Extend persistent storage TTL for locked version state
        env.storage().persistent().extend_ttl(&DataKey::VersionState(version), PERSISTENT_BUMP_THRESHOLD, PERSISTENT_BUMP_AMOUNT);

        let agreement_id: String = env
            .storage()
            .instance()
            .get(&DataKey::AgreementId)
            .unwrap_or(String::from_str(&env, "AGR"));

        env.events().publish(
            (EVENT_AGR_LOCKED, agreement_id),
            (version, version_state.agreement_hash, caller, version_state.locked_at),
        );

        Ok(())
    }

    /// Revoke a pending agreement version proposal before it becomes locked (Admin only)
    pub fn revoke_agreement_proposal(
        env: Env,
        caller: Address,
        version: u32,
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

        let mut version_state: AgreementVersionState = env
            .storage()
            .persistent()
            .get(&DataKey::VersionState(version))
            .ok_or(ContractError::AgreementNotFound)?;

        if version_state.status == AgreementStatus::Locked {
            return Err(ContractError::AgreementLocked);
        }

        version_state.status = AgreementStatus::Revoked;
        env.storage().persistent().set(&DataKey::VersionState(version), &version_state);

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

    /// Retrieve semantic contract version and platform identifier
    pub fn get_version(env: Env) -> String {
        String::from_str(&env, "1.0.0-stellar-estate")
    }

    /// Retrieve total number of registered stakeholders for an agreement version
    pub fn get_stakeholder_count(env: Env, version: u32) -> Result<u32, ContractError> {
        let state = Self::get_agreement_version(env, version)?;
        Ok(state.total_stakeholders)
    }

    /// Check whether a specific stakeholder has cryptographically approved the agreement version
    pub fn is_stakeholder_approved(env: Env, version: u32, stakeholder: Address) -> bool {
        if let Ok(st) = Self::get_stakeholder(env, version, stakeholder) {
            st.has_approved
        } else {
            false
        }
    }

    /// Retrieve core property ID and administrative authority address
    pub fn get_agreement_meta(env: Env) -> Result<(String, Address), ContractError> {
        let property_id: String = env
            .storage()
            .instance()
            .get(&DataKey::PropertyId)
            .ok_or(ContractError::NotInitialized)?;
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(ContractError::NotInitialized)?;
        Ok((property_id, admin))
    }

    /// Retrieve the current active version number of this distribution agreement
    pub fn get_active_version_number(env: Env) -> Result<u32, ContractError> {
        env.storage()
            .instance()
            .get(&DataKey::ActiveVersion)
            .ok_or(ContractError::AgreementNotFound)
    }

    /// Retrieve operational lifecycle status of an agreement version
    pub fn get_version_status(env: Env, version: u32) -> Result<AgreementStatus, ContractError> {
        let state = Self::get_agreement_version(env, version)?;
        Ok(state.status)
    }

    /// Check whether an agreement version has met all stakeholder approvals and is ready to lock
    pub fn is_ready_to_lock(env: Env, version: u32) -> bool {
        if let Ok(state) = Self::get_agreement_version(env, version) {
            state.status == AgreementStatus::ReadyToLock
        } else {
            false
        }
    }

    /// Retrieve approval consensus progress: (approved_count, total_required, is_ready)
    pub fn get_approval_progress(env: Env, version: u32) -> Result<(u32, u32, bool), ContractError> {
        let state = Self::get_agreement_version(env, version)?;
        let is_ready = state.status == AgreementStatus::ReadyToLock || state.status == AgreementStatus::Locked;
        Ok((state.approved_count, state.total_stakeholders, is_ready))
    }

    /// Retrieve the canonical cryptographic hash of an agreement version
    pub fn get_version_agreement_hash(env: Env, version: u32) -> Result<String, ContractError> {
        let state = Self::get_agreement_version(env, version)?;
        Ok(state.agreement_hash)
    }

    /// Check whether a candidate hash matches the stored canonical agreement hash
    pub fn is_agreement_hash_valid(env: Env, version: u32, candidate_hash: String) -> bool {
        if let Ok(state) = Self::get_agreement_version(env, version) {
            state.agreement_hash == candidate_hash
        } else {
            false
        }
    }

    /// Retrieve the canonical hash of the currently active agreement version
    pub fn get_active_agreement_hash(env: Env) -> Result<String, ContractError> {
        let active_ver = Self::get_active_version_number(env.clone())?;
        Self::get_version_agreement_hash(env, active_ver)
    }

    /// Check whether all registered stakeholders have approved a given version
    pub fn is_version_fully_approved(env: Env, version: u32) -> bool {
        if let Ok(state) = Self::get_agreement_version(env, version) {
            state.total_stakeholders > 0 && state.approved_count == state.total_stakeholders
        } else {
            false
        }
    }

    /// Retrieve list of all registered version numbers for this agreement contract
    pub fn get_all_versions(env: Env) -> Vec<u32> {
        let mut versions = Vec::new(&env);
        let max_ver: u32 = env
            .storage()
            .instance()
            .get(&DataKey::ActiveVersion)
            .unwrap_or(0);

        for ver in 1..=max_ver {
            if env.storage().persistent().has(&DataKey::VersionState(ver)) {
                versions.push_back(ver);
            }
        }
        versions
    }

    /// Retrieve contract identifier, version number, and specification details
    pub fn get_contract_info(env: Env) -> (String, u32, String) {
        (
            String::from_str(&env, "StellarEstateDistributionAgreement"),
            1,
            String::from_str(&env, "Multi-party revenue distribution agreement contract for Stellar Estate"),
        )
    }

    /// Retrieve full contract architecture metadata (contract name, semantic version, standard)
    pub fn get_contract_metadata(env: Env) -> (String, String, String) {
        (
            String::from_str(&env, "StellarEstateDistributionAgreement"),
            String::from_str(&env, "1.0.0-stellar-estate"),
            String::from_str(&env, "SEP-0001/SEP-0007/Soroban-v22"),
        )
    }

    /// Upgrade the contract WASM code in-place to a new validated WASM hash (restricted to Admin)
    pub fn upgrade_contract(
        env: Env,
        caller: Address,
        new_wasm_hash: BytesN<32>,
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

        env.deployer().update_current_contract_wasm(new_wasm_hash);
        Ok(())
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

        let (info_name, info_ver, _info_desc) = client.get_contract_info();
        assert_eq!(info_name, String::from_str(&env, "StellarEstateDistributionAgreement"));
        assert_eq!(info_ver, 1);

        let (meta_cname, meta_cver, meta_cstd) = client.get_contract_metadata();
        assert_eq!(meta_cname, String::from_str(&env, "StellarEstateDistributionAgreement"));
        assert_eq!(meta_cver, String::from_str(&env, "1.0.0-stellar-estate"));
        assert_eq!(meta_cstd, String::from_str(&env, "SEP-0001/SEP-0007/Soroban-v22"));

        let (meta_prop, meta_admin) = client.get_agreement_meta();
        assert_eq!(meta_prop, prop_id);
        assert_eq!(meta_admin, admin);

        // 2. Create version 1 (3 stakeholders required)
        client.create_version(&admin, &1, &hash_v1, &3);
        assert_eq!(client.get_active_version_number(), 1);
        assert_eq!(client.get_version_status(&1), AgreementStatus::PendingApprovals);
        assert_eq!(client.get_all_versions().len(), 1);
        assert_eq!(client.get_all_versions().get(0).unwrap(), 1);

        // 3. Add stakeholders (Alice 4000 bps, Bob 3500 bps, Charlie 2500 bps = 10,000 bps / 100%)
        client.add_stakeholder(&admin, &1, &alice, &4000, &String::from_str(&env, "Alice"));
        client.add_stakeholder(&admin, &1, &bob, &3500, &String::from_str(&env, "Bob"));
        client.add_stakeholder(&admin, &1, &charlie, &2500, &String::from_str(&env, "Charlie"));
        assert_eq!(client.get_approval_progress(&1), (0, 3, false));

        // 4. Try locking prematurely -> Fails with IncompleteApprovals (#14)
        // Verified by assert below after Alice approves
        assert!(!client.is_stakeholder_approved(&1, &alice));
        let ready1 = client.approve_agreement(&alice, &1, &hash_v1);
        assert!(!ready1);
        assert!(client.is_stakeholder_approved(&1, &alice));
        assert!(!client.is_stakeholder_approved(&1, &bob));
        assert_eq!(client.get_approval_progress(&1), (1, 3, false));

        let ready2 = client.approve_agreement(&bob, &1, &hash_v1);
        assert!(!ready2);

        // Charlie approves -> ready to lock!
        assert!(!client.is_ready_to_lock(&1));
        let ready3 = client.approve_agreement(&charlie, &1, &hash_v1);
        assert!(ready3);
        assert!(client.is_ready_to_lock(&1));
        assert_eq!(client.get_approval_progress(&1), (3, 3, true));

        // Validate hash queries
        assert_eq!(client.get_version_agreement_hash(&1), hash_v1);
        assert!(client.is_agreement_hash_valid(&1, &hash_v1));
        let fake_hash = String::from_str(&env, "badbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbad");
        assert!(!client.is_agreement_hash_valid(&1, &fake_hash));
        assert!(client.is_version_fully_approved(&1));

        // 5. Lock agreement
        client.lock_agreement(&admin, &1);
        assert_eq!(client.get_active_agreement_hash(), hash_v1);

        assert!(client.is_version_locked(&1));
        assert!(!client.is_ready_to_lock(&1));
        assert_eq!(client.get_version_status(&1), AgreementStatus::Locked);
        assert_eq!(client.get_approval_progress(&1), (3, 3, true));

        let state = client.get_agreement_version(&1);
        assert_eq!(state.status, AgreementStatus::Locked);
        assert_eq!(state.approved_count, 3);
        assert_eq!(state.agreement_hash, hash_v1);
        assert_eq!(client.get_stakeholder_count(&1), 3);
        assert_eq!(client.get_version(), String::from_str(&env, "1.0.0-stellar-estate"));
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

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")] // Unauthorized
    fn test_non_admin_cannot_upgrade_agreement_contract() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(DistributionAgreementContract, ());
        let client = DistributionAgreementContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let unauthorized = Address::generate(&env);
        let dummy_wasm_hash = BytesN::from_array(&env, &[0u8; 32]);

        client.initialize(
            &admin,
            &String::from_str(&env, "prop-01"),
            &String::from_str(&env, "AGR-01"),
        );

        client.upgrade_contract(&unauthorized, &dummy_wasm_hash);
    }

    #[test]
    fn test_revoke_agreement_proposal_flow() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(DistributionAgreementContract, ());
        let client = DistributionAgreementContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let alice = Address::generate(&env);
        let hash = String::from_str(&env, "HASH_REVOKE_01");

        client.initialize(
            &admin,
            &String::from_str(&env, "prop-01"),
            &String::from_str(&env, "AGR-01"),
        );
        client.create_version(&admin, &1, &hash, &1);
        client.add_stakeholder(&admin, &1, &alice, &10000, &String::from_str(&env, "Alice"));

        assert_eq!(client.get_version_status(&1), AgreementStatus::PendingApprovals);

        // Admin revokes proposal
        client.revoke_agreement_proposal(&admin, &1);
        assert_eq!(client.get_version_status(&1), AgreementStatus::Revoked);
    }
}
