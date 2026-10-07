#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, String, Symbol,
};
use stellar_estate_shared::{ContractError, RevenueEntry};

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    VaultContract,
    DepositCount,
    ReceiptRecord(u32),
}

const EVENT_DEPOSIT_ROUTED: Symbol = symbol_short!("dep_rout");

#[contract]
pub struct RevenueManagerContract;

#[contractimpl]
impl RevenueManagerContract {
    pub fn initialize(env: Env, admin: Address, vault_contract: Address) -> Result<(), ContractError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(ContractError::AlreadyInitialized);
        }

        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::VaultContract, &vault_contract);
        env.storage().instance().set(&DataKey::DepositCount, &0u32);

        Ok(())
    }

    pub fn route_revenue(
        env: Env,
        depositor: Address,
        source: String,
        amount: i128,
    ) -> Result<u32, ContractError> {
        depositor.require_auth();

        if amount <= 0 {
            return Err(ContractError::InvalidAmount);
        }

        let mut count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::DepositCount)
            .unwrap_or(0);

        count = count.checked_add(1).ok_or(ContractError::Overflow)?;

        let entry = RevenueEntry {
            revenue_id: count,
            source,
            amount,
            depositor: depositor.clone(),
            timestamp: env.ledger().timestamp(),
            reconciled: true,
        };

        env.storage().instance().set(&DataKey::DepositCount, &count);
        env.storage().persistent().set(&DataKey::ReceiptRecord(count), &entry);

        env.events().publish((EVENT_DEPOSIT_ROUTED, depositor), (count, amount));

        Ok(count)
    }

    pub fn get_total_deposits(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::DepositCount)
            .unwrap_or(0)
    }

    pub fn get_receipt(env: Env, receipt_id: u32) -> Result<RevenueEntry, ContractError> {
        env.storage()
            .persistent()
            .get(&DataKey::ReceiptRecord(receipt_id))
            .ok_or(ContractError::InvalidState)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env, String};

    #[test]
    fn test_revenue_manager_flow() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(RevenueManagerContract, ());
        let client = RevenueManagerContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let vault = Address::generate(&env);
        let depositor = Address::generate(&env);

        client.initialize(&admin, &vault);

        let receipt_id = client.route_revenue(
            &depositor,
            &String::from_str(&env, "commercial_lease"),
            &150_000_000,
        );

        assert_eq!(receipt_id, 1);
        assert_eq!(client.get_total_deposits(), 1);

        let receipt = client.get_receipt(&1);
        assert_eq!(receipt.amount, 150_000_000);
        assert_eq!(receipt.reconciled, true);
    }
}
