#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Env, String, vec, Vec};

// Helper function to create a test environment with contract
fn create_test_contract() -> (Env, Address, TokenBridgeClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    // Create owner and system wallet addresses for constructor
    let owner = Address::generate(&env);
    let system_wallet = Address::generate(&env);
    let current_chain_id = String::from_str(&env, "stellar:testnet");

    // Register contract with new constructor arguments
    let contract_id = env.register(
        TokenBridge,
        (owner.clone(), system_wallet.clone(), current_chain_id)
    );
    let client = TokenBridgeClient::new(&env, &contract_id);

    (env, contract_id, client, owner, system_wallet)
}

// ============ Constructor and Initialization Tests ============

#[test]
fn test_constructor_initializes_correctly() {
    let (env, _, client, owner, system_wallet) = create_test_contract();

    // Verify owner role
    assert_eq!(client.get_owner(), owner);

    // Verify system wallet role
    assert_eq!(client.get_system_wallet(), system_wallet);

    // Verify chain ID
    assert_eq!(client.get_current_chain_id(), String::from_str(&env, "stellar:testnet"));
}

#[test]
fn test_owner_is_admin() {
    let (_, _, client, owner, _) = create_test_contract();

    // Owner should also be considered an admin
    assert_eq!(client.is_admin(&owner), true);
}

// ============ Transaction ID Tests ============

#[test]
fn test_transaction_id_starts_unused() {
    let (_, _, client, _, _) = create_test_contract();

    // Transaction IDs should not be used initially
    let tx_id_1: i128 = 1001;
    let tx_id_2: i128 = 1002;
    let tx_id_3: i128 = 1003;

    assert_eq!(client.is_transaction_used(&tx_id_1), false);
    assert_eq!(client.is_transaction_used(&tx_id_2), false);
    assert_eq!(client.is_transaction_used(&tx_id_3), false);
}

#[test]
fn test_transaction_id_uniqueness() {
    let (_, _, _, _, _) = create_test_contract();

    // Different transaction IDs should be independent
    let tx_id_1: i128 = 1001;
    let tx_id_2: i128 = 1002;
    let tx_id_3: i128 = 1003;

    // All should be different
    assert_ne!(tx_id_1, tx_id_2);
    assert_ne!(tx_id_1, tx_id_3);
    assert_ne!(tx_id_2, tx_id_3);
}

#[test]
fn test_transaction_id_numeric_formats() {
    let (_, _, client, _, _) = create_test_contract();

    // Test various transaction ID numeric formats
    let small_id: i128 = 12345;
    let large_id: i128 = 999999999999;
    let timestamp_id: i128 = 1762167632;
    let sequential_id: i128 = 1;

    // All should start as unused
    assert_eq!(client.is_transaction_used(&small_id), false);
    assert_eq!(client.is_transaction_used(&large_id), false);
    assert_eq!(client.is_transaction_used(&timestamp_id), false);
    assert_eq!(client.is_transaction_used(&sequential_id), false);
}

// Note: Comprehensive integration tests with actual token contracts
// are in integration_test.rs. These unit tests focus on the transaction ID
// deduplication mechanism itself.

#[test]
fn test_transaction_id_negative_values() {
    let (_, _, client, _, _) = create_test_contract();

    // Transaction IDs can be negative (though not recommended in practice)
    let tx_negative: i128 = -1001;
    let tx_zero: i128 = 0;
    let tx_positive: i128 = 1001;

    // All should be different and unused
    assert_eq!(client.is_transaction_used(&tx_negative), false);
    assert_eq!(client.is_transaction_used(&tx_zero), false);
    assert_eq!(client.is_transaction_used(&tx_positive), false);
}

#[test]
fn test_transaction_id_large_numbers() {
    let (_, _, client, _, _) = create_test_contract();

    // Test transaction IDs with large numbers (timestamps, etc.)
    let timestamp_2024: i128 = 1704067200000; // Jan 1, 2024 in milliseconds
    let timestamp_2025: i128 = 1735689600000; // Jan 1, 2025 in milliseconds
    let max_safe_int: i128 = 9007199254740991; // JavaScript MAX_SAFE_INTEGER
    let very_large: i128 = 999999999999999999;

    // All should be unused
    assert_eq!(client.is_transaction_used(&timestamp_2024), false);
    assert_eq!(client.is_transaction_used(&timestamp_2025), false);
    assert_eq!(client.is_transaction_used(&max_safe_int), false);
    assert_eq!(client.is_transaction_used(&very_large), false);
}

#[test]
fn test_long_transaction_ids() {
    let (_, _, client, _, _) = create_test_contract();

    // Test with very large transaction IDs
    let large_tx_1: i128 = 170000000000000000000;
    let large_tx_2: i128 = 999999999999999999999;

    assert_eq!(client.is_transaction_used(&large_tx_1), false);
    assert_eq!(client.is_transaction_used(&large_tx_2), false);
}

// ============ Chain ID Validation Tests ============

#[test]
#[should_panic(expected = "Error(Contract, #10)")]
fn test_constructor_rejects_invalid_chain_id_too_short() {
    let env = Env::default();
    env.mock_all_auths();

    let owner = Address::generate(&env);
    let system_wallet = Address::generate(&env);
    let invalid_chain_id = String::from_str(&env, "ab"); // Too short (< 3 chars)

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
    // Chain ID longer than 64 characters
    let invalid_chain_id = String::from_str(&env, "this_is_a_very_long_chain_identifier_that_exceeds_the_maximum_allowed_length_of_64_characters");

    env.register(
        TokenBridge,
        (owner, system_wallet, invalid_chain_id)
    );
}

#[test]
fn test_valid_chain_id_formats() {
    let env = Env::default();
    env.mock_all_auths();

    let owner = Address::generate(&env);
    let system_wallet = Address::generate(&env);

    // Test various valid CAIP-2 formats
    let valid_chain_ids: Vec<String> = vec![
        &env,
        String::from_str(&env, "stellar:testnet"),
        String::from_str(&env, "eip155:1"),
        String::from_str(&env, "eip155:56"),
        String::from_str(&env, "cosmos:cosmoshub-4"),
    ];

    for chain_id in valid_chain_ids.iter() {
        let contract_id = env.register(
            TokenBridge,
            (owner.clone(), system_wallet.clone(), chain_id.clone())
        );
        let client = TokenBridgeClient::new(&env, &contract_id);
        assert_eq!(client.get_current_chain_id(), chain_id.clone());
    }
}

// ============ Access Control Tests ============

#[test]
fn test_owner_can_grant_admin() {
    let (_, _, client, owner, _) = create_test_contract();

    let new_admin = Address::generate(&client.env);

    // Owner should be able to grant admin role
    client.grant_admin(&new_admin, &owner);

    // Verify new admin has admin role
    assert_eq!(client.is_admin(&new_admin), true);
}

#[test]
fn test_owner_can_revoke_admin() {
    let (_, _, client, owner, _) = create_test_contract();

    let admin = Address::generate(&client.env);

    // Grant admin role first
    client.grant_admin(&admin, &owner);
    assert_eq!(client.is_admin(&admin), true);

    // Revoke admin role
    client.revoke_admin(&admin, &owner);

    // Verify admin role was revoked
    assert_eq!(client.is_admin(&admin), false);
}

#[test]
fn test_owner_can_update_system_wallet() {
    let (_, _, client, owner, old_system_wallet) = create_test_contract();

    let new_system_wallet = Address::generate(&client.env);

    // Verify old system wallet
    assert_eq!(client.get_system_wallet(), old_system_wallet);

    // Update system wallet using new functions
    client.remove_system_wallet(&old_system_wallet, &owner);
    client.add_system_wallet(&new_system_wallet, &owner);

    // Verify new system wallet
    assert_eq!(client.get_system_wallet(), new_system_wallet);
}

#[test]
fn test_admin_can_update_system_wallet() {
    let (_, _, client, owner, old_system_wallet) = create_test_contract();

    let admin = Address::generate(&client.env);
    let new_system_wallet = Address::generate(&client.env);

    // Grant admin role
    client.grant_admin(&admin, &owner);

    // Admin should be able to update system wallet using new functions
    client.remove_system_wallet(&old_system_wallet, &admin);
    client.add_system_wallet(&new_system_wallet, &admin);

    // Verify new system wallet
    assert_eq!(client.get_system_wallet(), new_system_wallet);
}

// ============ Multiple System Wallet Tests ============

#[test]
fn test_add_multiple_system_wallets() {
    let (_, _, client, owner, initial_wallet) = create_test_contract();

    let wallet2 = Address::generate(&client.env);
    let wallet3 = Address::generate(&client.env);

    // Verify initial state - should have 1 system wallet
    assert_eq!(client.get_system_wallet_count(), 1);
    assert_eq!(client.get_system_wallet(), initial_wallet);

    // Add second system wallet
    client.add_system_wallet(&wallet2, &owner);
    assert_eq!(client.get_system_wallet_count(), 2);
    assert_eq!(client.is_system_wallet(&wallet2), true);

    // Add third system wallet
    client.add_system_wallet(&wallet3, &owner);
    assert_eq!(client.get_system_wallet_count(), 3);
    assert_eq!(client.is_system_wallet(&wallet3), true);

    // Verify all wallets are present
    let wallets = client.get_system_wallets();
    assert_eq!(wallets.len(), 3);
    assert_eq!(client.is_system_wallet(&initial_wallet), true);
    assert_eq!(client.is_system_wallet(&wallet2), true);
    assert_eq!(client.is_system_wallet(&wallet3), true);
}

#[test]
fn test_remove_system_wallet() {
    let (_, _, client, owner, initial_wallet) = create_test_contract();

    let wallet2 = Address::generate(&client.env);
    let wallet3 = Address::generate(&client.env);

    // Add multiple wallets
    client.add_system_wallet(&wallet2, &owner);
    client.add_system_wallet(&wallet3, &owner);
    assert_eq!(client.get_system_wallet_count(), 3);

    // Remove wallet2
    client.remove_system_wallet(&wallet2, &owner);
    assert_eq!(client.get_system_wallet_count(), 2);
    assert_eq!(client.is_system_wallet(&wallet2), false);
    assert_eq!(client.is_system_wallet(&initial_wallet), true);
    assert_eq!(client.is_system_wallet(&wallet3), true);

    // Remove initial wallet
    client.remove_system_wallet(&initial_wallet, &owner);
    assert_eq!(client.get_system_wallet_count(), 1);
    assert_eq!(client.is_system_wallet(&initial_wallet), false);
    assert_eq!(client.is_system_wallet(&wallet3), true);
}

#[test]
fn test_admin_can_add_system_wallet() {
    let (_, _, client, owner, _) = create_test_contract();

    let admin = Address::generate(&client.env);
    let new_wallet = Address::generate(&client.env);

    // Grant admin role
    client.grant_admin(&admin, &owner);

    // Admin should be able to add system wallet
    client.add_system_wallet(&new_wallet, &admin);

    // Verify wallet was added
    assert_eq!(client.is_system_wallet(&new_wallet), true);
    assert_eq!(client.get_system_wallet_count(), 2);
}

#[test]
fn test_admin_can_remove_system_wallet() {
    let (_, _, client, owner, initial_wallet) = create_test_contract();

    let admin = Address::generate(&client.env);

    // Grant admin role
    client.grant_admin(&admin, &owner);

    // Admin should be able to remove system wallet
    client.remove_system_wallet(&initial_wallet, &admin);

    // Verify wallet was removed
    assert_eq!(client.is_system_wallet(&initial_wallet), false);
    assert_eq!(client.get_system_wallet_count(), 0);
}

#[test]
fn test_get_system_wallets_returns_all() {
    let (_, _, client, owner, initial_wallet) = create_test_contract();

    let wallet2 = Address::generate(&client.env);
    let wallet3 = Address::generate(&client.env);

    // Add wallets
    client.add_system_wallet(&wallet2, &owner);
    client.add_system_wallet(&wallet3, &owner);

    // Get all wallets
    let wallets = client.get_system_wallets();
    assert_eq!(wallets.len(), 3);

    // Verify all wallets are in the list
    let mut found_initial = false;
    let mut found_wallet2 = false;
    let mut found_wallet3 = false;

    for wallet in wallets.iter() {
        if wallet == initial_wallet {
            found_initial = true;
        } else if wallet == wallet2 {
            found_wallet2 = true;
        } else if wallet == wallet3 {
            found_wallet3 = true;
        }
    }

    assert!(found_initial);
    assert!(found_wallet2);
    assert!(found_wallet3);
}

#[test]
fn test_is_system_wallet_check() {
    let (_, _, client, owner, initial_wallet) = create_test_contract();

    let wallet2 = Address::generate(&client.env);
    let non_system_wallet = Address::generate(&client.env);

    // Initial wallet should be a system wallet
    assert_eq!(client.is_system_wallet(&initial_wallet), true);

    // Non-added wallet should not be a system wallet
    assert_eq!(client.is_system_wallet(&non_system_wallet), false);

    // Add wallet2
    client.add_system_wallet(&wallet2, &owner);
    assert_eq!(client.is_system_wallet(&wallet2), true);

    // Remove wallet2
    client.remove_system_wallet(&wallet2, &owner);
    assert_eq!(client.is_system_wallet(&wallet2), false);
}

#[test]
fn test_owner_can_transfer_ownership() {
    let (_, _, client, owner, _) = create_test_contract();

    let new_owner = Address::generate(&client.env);

    // Transfer ownership
    client.propose_new_owner(&new_owner, &owner);
    client.accept_ownership(&new_owner);

    // Verify new owner
    assert_eq!(client.get_owner(), new_owner);

    // Old owner should no longer be owner
    assert_eq!(client.is_admin(&owner), false);
}

// ============ Pausable Tests ============

#[test]
fn test_contract_starts_unpaused() {
    let (_, _, client, _, _) = create_test_contract();

    // Contract should start unpaused
    assert_eq!(client.paused(), false);
}

#[test]
fn test_admin_can_pause() {
    let (_, _, client, owner, _) = create_test_contract();

    // Owner (who is also admin) should be able to pause
    client.pause(&owner);

    // Verify contract is paused
    assert_eq!(client.paused(), true);
}

#[test]
fn test_admin_can_unpause() {
    let (_, _, client, owner, _) = create_test_contract();

    // Pause first
    client.pause(&owner);
    assert_eq!(client.paused(), true);

    // Unpause
    client.unpause(&owner);

    // Verify contract is unpaused
    assert_eq!(client.paused(), false);
}

#[test]
fn test_granted_admin_can_pause() {
    let (_, _, client, owner, _) = create_test_contract();

    let admin = Address::generate(&client.env);

    // Grant admin role
    client.grant_admin(&admin, &owner);

    // Admin should be able to pause
    client.pause(&admin);

    // Verify contract is paused
    assert_eq!(client.paused(), true);
}

// ============ View Function Tests ============

#[test]
fn test_get_locked_balance_starts_zero() {
    let (env, _, client, _, _) = create_test_contract();

    let token = Address::generate(&env);

    // Locked balance should start at 0
    assert_eq!(client.get_locked_balance(&token), 0);
}
