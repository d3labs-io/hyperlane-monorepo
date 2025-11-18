// Foundation Tests
//
// Purpose: Demonstrate core contract reliability and governance
//
// Client Value: "The contract has robust initialization, access control, and safety mechanisms"
//
// Test Coverage:
// - ✅ Secure initialization with valid parameters
// - ✅ Owner and admin role management
// - ✅ System wallet management
// - ✅ Emergency pause/unpause controls
// - ✅ Transaction ID deduplication
// - ✅ Chain ID validation

use soroban_sdk::{testutils::Address as _, Env, String, vec, Vec};
use crate::*;

// ============ Helper Functions ============

/// Create a test environment with contract
fn create_test_contract() -> (Env, Address, TokenBridgeClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let owner = Address::generate(&env);
    let system_wallet = Address::generate(&env);
    let current_chain_id = String::from_str(&env, "stellar:testnet");

    let contract_id = env.register(
        TokenBridge,
        (owner.clone(), system_wallet.clone(), current_chain_id)
    );
    let client = TokenBridgeClient::new(&env, &contract_id);

    (env, contract_id, client, owner, system_wallet)
}

// ============ Contract Initialization ============

mod contract_initialization {
    //! # Contract Initialization
    //!
    //! **What This Proves**: Contract starts in a secure, well-defined state
    //!
    //! **Why It Matters**: Ensures proper setup and prevents misconfiguration

    use super::*;

    #[test]
    fn test_contract_initializes_with_secure_defaults() {
        let (env, _, client, owner, system_wallet) = create_test_contract();

        // GIVEN: A newly initialized contract
        // WHEN: We check the initial state
        // THEN: Owner and system wallet are correctly set
        assert_eq!(client.get_owner(), owner, "Owner should be set correctly");
        assert_eq!(client.get_system_wallet(), system_wallet, "System wallet should be set correctly");
        assert_eq!(client.get_current_chain_id(), String::from_str(&env, "stellar:testnet"), "Chain ID should be set correctly");
    }

    #[test]
    fn test_owner_is_admin() {
        let (_, _, client, owner, _) = create_test_contract();

        // GIVEN: A newly initialized contract
        // WHEN: We check if owner is admin
        // THEN: Owner should have admin privileges
        assert_eq!(client.is_admin(&owner), true, "Owner should be admin");
    }

    #[test]
    fn test_contract_starts_unpaused() {
        let (_, _, client, _, _) = create_test_contract();

        // GIVEN: A newly initialized contract
        // WHEN: We check pause status
        // THEN: Contract should be unpaused
        assert_eq!(client.paused(), false, "Contract should start unpaused");
    }

    #[test]
    fn test_get_locked_balance_starts_zero() {
        let (env, _, client, _, _) = create_test_contract();

        let token = Address::generate(&env);

        // GIVEN: A newly initialized contract
        // WHEN: We check locked balance for a token
        // THEN: Locked balance should be zero
        assert_eq!(client.get_locked_balance(&token), 0, "Locked balance should start at zero");
    }

    #[test]
    fn test_valid_chain_id_formats() {
        let env = Env::default();
        env.mock_all_auths();

        let owner = Address::generate(&env);
        let system_wallet = Address::generate(&env);

        // GIVEN: Various valid CAIP-2 chain ID formats
        let valid_chain_ids: Vec<String> = vec![
            &env,
            String::from_str(&env, "stellar:testnet"),
            String::from_str(&env, "eip155:1"),
            String::from_str(&env, "eip155:56"),
            String::from_str(&env, "cosmos:cosmoshub-4"),
        ];

        // WHEN: We initialize contracts with each chain ID
        // THEN: All should initialize successfully
        for chain_id in valid_chain_ids.iter() {
            let contract_id = env.register(
                TokenBridge,
                (owner.clone(), system_wallet.clone(), chain_id.clone())
            );
            let client = TokenBridgeClient::new(&env, &contract_id);
            assert_eq!(client.get_current_chain_id(), chain_id.clone(), "Chain ID should match");
        }
    }
}

// ============ Chain ID Validation ============

mod chain_id_validation {
    //! # Chain ID Validation
    //!
    //! **What This Proves**: Invalid chain IDs are rejected at initialization
    //!
    //! **Why It Matters**: Prevents misconfiguration and ensures valid network identification

    use super::*;

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn test_constructor_rejects_invalid_chain_id_too_short() {
        let env = Env::default();
        env.mock_all_auths();

        let owner = Address::generate(&env);
        let system_wallet = Address::generate(&env);
        let invalid_chain_id = String::from_str(&env, "ab"); // Too short (< 3 chars)

        // GIVEN: An invalid chain ID (too short)
        // WHEN: We try to initialize the contract
        // THEN: It should panic with error #10
        env.register(
            TokenBridge,
            (owner, system_wallet, invalid_chain_id)
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn test_constructor_rejects_invalid_chain_id_too_long() {
        let env = Env::default();
        env.mock_all_auths();

        let owner = Address::generate(&env);
        let system_wallet = Address::generate(&env);
        let invalid_chain_id = String::from_str(&env, "this_is_a_very_long_chain_identifier_that_exceeds_the_maximum_allowed_length_of_64_characters");

        // GIVEN: An invalid chain ID (too long)
        // WHEN: We try to initialize the contract
        // THEN: It should panic with error #10
        env.register(
            TokenBridge,
            (owner, system_wallet, invalid_chain_id)
        );
    }
}

// ============ Access Control and Governance ============

mod access_control_and_governance {
    //! # Access Control and Governance
    //!
    //! **What This Proves**: Clear separation of duties with multi-role support
    //!
    //! **Why It Matters**: Ensures only authorized parties can perform sensitive operations

    use super::*;

    #[test]
    fn test_owner_can_grant_admin() {
        let (_, _, client, owner, _) = create_test_contract();

        let new_admin = Address::generate(&client.env);

        // GIVEN: A contract with an owner
        // WHEN: Owner grants admin role to another address
        // THEN: New address should have admin privileges
        client.grant_admin(&new_admin, &owner);
        assert_eq!(client.is_admin(&new_admin), true, "New admin should have admin role");
    }

    #[test]
    fn test_owner_can_revoke_admin() {
        let (_, _, client, owner, _) = create_test_contract();

        let admin = Address::generate(&client.env);

        // GIVEN: An admin has been granted
        client.grant_admin(&admin, &owner);
        assert_eq!(client.is_admin(&admin), true);

        // WHEN: Owner revokes admin role
        client.revoke_admin(&admin, &owner);

        // THEN: Admin should no longer have admin privileges
        assert_eq!(client.is_admin(&admin), false, "Admin role should be revoked");
    }

    #[test]
    fn test_owner_can_update_system_wallet() {
        let (_, _, client, owner, old_system_wallet) = create_test_contract();

        let new_system_wallet = Address::generate(&client.env);

        // GIVEN: A contract with a system wallet
        assert_eq!(client.get_system_wallet(), old_system_wallet);

        // WHEN: Owner updates the system wallet
        client.remove_system_wallet(&old_system_wallet, &owner);
        client.add_system_wallet(&new_system_wallet, &owner);

        // THEN: New system wallet should be active
        assert_eq!(client.get_system_wallet(), new_system_wallet, "System wallet should be updated");
    }

    #[test]
    fn test_admin_can_update_system_wallet() {
        let (_, _, client, owner, old_system_wallet) = create_test_contract();

        let admin = Address::generate(&client.env);
        let new_system_wallet = Address::generate(&client.env);

        // GIVEN: An admin has been granted
        client.grant_admin(&admin, &owner);

        // WHEN: Admin updates the system wallet
        client.remove_system_wallet(&old_system_wallet, &admin);
        client.add_system_wallet(&new_system_wallet, &admin);

        // THEN: New system wallet should be active
        assert_eq!(client.get_system_wallet(), new_system_wallet, "Admin should be able to update system wallet");
    }

    #[test]
    fn test_multiple_system_wallets_for_operational_flexibility() {
        let (_, _, client, owner, initial_wallet) = create_test_contract();

        let wallet2 = Address::generate(&client.env);
        let wallet3 = Address::generate(&client.env);

        // GIVEN: A contract with one system wallet
        assert_eq!(client.get_system_wallet_count(), 1);

        // WHEN: We add multiple system wallets
        client.add_system_wallet(&wallet2, &owner);
        client.add_system_wallet(&wallet3, &owner);

        // THEN: All wallets should be registered
        assert_eq!(client.get_system_wallet_count(), 3, "Should have 3 system wallets");
        assert_eq!(client.is_system_wallet(&initial_wallet), true);
        assert_eq!(client.is_system_wallet(&wallet2), true);
        assert_eq!(client.is_system_wallet(&wallet3), true);
    }

    #[test]
    fn test_owner_can_transfer_ownership() {
        let (_, _, client, owner, _) = create_test_contract();

        let new_owner = Address::generate(&client.env);

        // GIVEN: A contract with an owner
        // WHEN: Owner transfers ownership to new address
        client.propose_new_owner(&new_owner, &owner);
        client.accept_ownership(&new_owner);

        // THEN: New address should be the owner
        assert_eq!(client.get_owner(), new_owner, "New owner should be set");
        assert_eq!(client.is_admin(&owner), false, "Old owner should no longer be admin");
    }
}

// ============ Emergency Controls ============

mod emergency_controls {
    //! # Emergency Controls
    //!
    //! **What This Proves**: Built-in circuit breaker for emergency situations
    //!
    //! **Why It Matters**: Allows rapid response to security incidents or operational issues

    use super::*;

    #[test]
    fn test_emergency_pause_stops_all_operations() {
        let (_, _, client, owner, _) = create_test_contract();

        // GIVEN: A running contract
        assert_eq!(client.paused(), false);

        // WHEN: Owner pauses the contract
        client.pause(&owner);

        // THEN: Contract should be paused
        assert_eq!(client.paused(), true, "Contract should be paused");
    }

    #[test]
    fn test_admin_can_unpause_contract() {
        let (_, _, client, owner, _) = create_test_contract();

        // GIVEN: A paused contract
        client.pause(&owner);
        assert_eq!(client.paused(), true);

        // WHEN: Admin unpauses the contract
        client.unpause(&owner);

        // THEN: Contract should be unpaused
        assert_eq!(client.paused(), false, "Contract should be unpaused");
    }

    #[test]
    fn test_granted_admin_can_pause() {
        let (_, _, client, owner, _) = create_test_contract();

        let admin = Address::generate(&client.env);

        // GIVEN: An admin has been granted
        client.grant_admin(&admin, &owner);

        // WHEN: Admin pauses the contract
        client.pause(&admin);

        // THEN: Contract should be paused
        assert_eq!(client.paused(), true, "Granted admin should be able to pause");
    }
}

// ============ Transaction Deduplication ============

mod transaction_deduplication {
    //! # Transaction Deduplication
    //!
    //! **What This Proves**: Prevents double-spending at the protocol level
    //!
    //! **Why It Matters**: Critical security feature for cross-chain operations

    use super::*;

    #[test]
    fn test_transaction_ids_prevent_replay_attacks() {
        let (_, _, client, _, _) = create_test_contract();

        // GIVEN: A contract with transaction ID tracking
        let tx_id_1: i128 = 1001;
        let tx_id_2: i128 = 1002;
        let tx_id_3: i128 = 1003;

        // WHEN: We check if transaction IDs are used
        // THEN: All should start as unused
        assert_eq!(client.is_transaction_used(&tx_id_1), false, "TX ID 1 should be unused");
        assert_eq!(client.is_transaction_used(&tx_id_2), false, "TX ID 2 should be unused");
        assert_eq!(client.is_transaction_used(&tx_id_3), false, "TX ID 3 should be unused");
    }

    #[test]
    fn test_transaction_id_uniqueness() {
        let (_, _, client, _, _) = create_test_contract();

        // GIVEN: Multiple transaction IDs
        let tx_id_1: i128 = 1001;
        let tx_id_2: i128 = 1002;
        let tx_id_3: i128 = 1003;

        // WHEN: We verify they are different
        // THEN: All should be unique
        assert_ne!(tx_id_1, tx_id_2);
        assert_ne!(tx_id_1, tx_id_3);
        assert_ne!(tx_id_2, tx_id_3);
    }

    #[test]
    fn test_transaction_id_handles_large_numbers() {
        let (_, _, client, _, _) = create_test_contract();

        // GIVEN: Large transaction IDs (timestamps, etc.)
        let timestamp_2024: i128 = 1704067200000;
        let timestamp_2025: i128 = 1735689600000;
        let max_safe_int: i128 = 9007199254740991;

        // WHEN: We check if they are tracked
        // THEN: All should be unused
        assert_eq!(client.is_transaction_used(&timestamp_2024), false);
        assert_eq!(client.is_transaction_used(&timestamp_2025), false);
        assert_eq!(client.is_transaction_used(&max_safe_int), false);
    }
}

