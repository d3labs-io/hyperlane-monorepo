#![cfg(test)]
//! Security Tests for Token Bridge Contract
//!
//! This module contains tests for security vulnerabilities identified in the security audit.
//! Tests are organized by severity: Critical, High, Medium, Low
//!
//! Reference: stellar/docs/token_bridge_security_audit_2025-11-11.md

use super::*;
use soroban_sdk::{
    testutils::Address as _, token::{StellarAssetClient, TokenClient}, Address, Env, String
};

// ============ Test Helpers ============

/// Helper to create test environment with bridge and token
fn setup_test_env(
    env: &Env,
) -> (
    Address,                  // bridge_id
    TokenBridgeClient,        // bridge_client
    Address,                  // token_id
    TokenClient,              // token_client
    StellarAssetClient,       // stellar_asset_client
    Address,                  // owner
    Address,                  // system_wallet
) {
    let owner = Address::generate(&env);
    let system_wallet = Address::generate(&env);
    let current_chain_id = String::from_str(&env, "stellar:testnet");

    let bridge_id = env.register(
        TokenBridge,
        (owner.clone(), system_wallet.clone(), current_chain_id)
    );
    let bridge_client = TokenBridgeClient::new(&env, &bridge_id);

    let asset_admin = Address::generate(&env);
    let token_contract = env.register_stellar_asset_contract_v2(asset_admin.clone());
    let token_id = token_contract.address();
    let token_client = TokenClient::new(&env, &token_id);
    let stellar_asset_client = StellarAssetClient::new(&env, &token_id);

    stellar_asset_client.set_admin(&bridge_id);

    (bridge_id, bridge_client, token_id, token_client, stellar_asset_client, owner, system_wallet)
}

/// Helper to execute bridge operation
#[allow(clippy::too_many_arguments)]
fn execute_bridge_op(
    bridge_client: &TokenBridgeClient,
    operation: u32,
    from_token: &String,
    to_token: &String,
    amount: i128,
    from_address: &String,
    to_address: &String,
    from_network: &String,
    to_network: &String,
    transaction_id: i128,
    email: &String,
    caller: &Address,
) {
    let bridge_data = TokenBridgeData {
        from_token: from_token.clone(),
        to_token: to_token.clone(),
        amount,
        from_address: from_address.clone(),
        to_address: to_address.clone(),
        from_network: from_network.clone(),
        to_network: to_network.clone(),
        transaction_id,
        email: email.clone(),
    };

    bridge_client.execute_bridge_operation(&operation, &bridge_data, caller);
}

// ============================================================================
// CRITICAL SEVERITY TESTS (C-1, C-2, C-3)
// ============================================================================

// ----------------------------------------------------------------------------
// C-1: Unvalidated Address Conversion from String
// ----------------------------------------------------------------------------

#[test]
#[should_panic]
fn test_c1_invalid_stellar_address_string_causes_panic() {
    let env = Env::default();
    env.mock_all_auths();

    let (_, bridge_client, token_id, _, _, _, system_wallet) = setup_test_env(&env);

    // Try to mint with invalid recipient address (not 56 chars)
    let invalid_recipient = String::from_str(&env, "invalid_address");
    
    execute_bridge_op(
        &bridge_client,
        3u32, // Mint
        &token_id.to_string(),
        &token_id.to_string(),
        1000,
        &String::from_str(&env, "0x1234"),
        &invalid_recipient, // Invalid address - should panic
        &String::from_str(&env, "eip155:1"),
        &String::from_str(&env, "stellar:testnet"),
        1001,
        &String::from_str(&env, "test@example.com"),
        &system_wallet,
    );
}

#[test]
#[should_panic]
fn test_c1_lock_operation_with_malformed_token_address() {
    let env = Env::default();
    env.mock_all_auths();

    let (_, bridge_client, _, _, _, _, _) = setup_test_env(&env);
    let user = Address::generate(&env);

    // Try to lock with malformed token address
    let malformed_token = String::from_str(&env, "not_a_valid_address");
    
    execute_bridge_op(
        &bridge_client,
        0u32, // Lock
        &malformed_token, // Invalid token address
        &malformed_token,
        1000,
        &user.to_string(),
        &String::from_str(&env, "0xdest"),
        &String::from_str(&env, "stellar:testnet"),
        &String::from_str(&env, "eip155:1"),
        1002,
        &String::from_str(&env, "test@example.com"),
        &user,
    );
}

#[test]
#[should_panic]
fn test_c1_release_operation_with_invalid_recipient_address() {
    let env = Env::default();
    env.mock_all_auths();

    let (_, bridge_client, token_id, _, _, _, system_wallet) = setup_test_env(&env);

    // Try to release with empty recipient address
    let empty_recipient = String::from_str(&env, "");
    
    execute_bridge_op(
        &bridge_client,
        2u32, // Release
        &token_id.to_string(),
        &token_id.to_string(),
        1000,
        &String::from_str(&env, "0x1234"),
        &empty_recipient, // Empty address - should panic
        &String::from_str(&env, "eip155:1"),
        &String::from_str(&env, "stellar:testnet"),
        1003,
        &String::from_str(&env, "test@example.com"),
        &system_wallet,
    );
}

#[test]
#[should_panic]
fn test_c1_burn_operation_with_invalid_from_token_address() {
    let env = Env::default();
    env.mock_all_auths();

    let (_bridge_id, bridge_client, _token_id, _, _, _, _) = setup_test_env(&env);
    let user = Address::generate(&env);

    // Try to burn with invalid from_token address (wrong length)
    let invalid_token = String::from_str(&env, "abc");

    execute_bridge_op(
        &bridge_client,
        1u32, // Burn
        &invalid_token, // Invalid token address - should fail validation
        &invalid_token,
        1000,
        &user.to_string(),
        &String::from_str(&env, "0xdest"),
        &String::from_str(&env, "stellar:testnet"),
        &String::from_str(&env, "eip155:1"),
        1004,
        &String::from_str(&env, "test@example.com"),
        &user,
    );
}

// ----------------------------------------------------------------------------
// C-2: Missing Authorization on set_admin_token Function
// ----------------------------------------------------------------------------

#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn test_c2_attacker_cannot_takeover_token_via_set_admin_token() {
    // This test verifies the FIX for C-2 vulnerability
    // After fix: Attacker CANNOT call set_admin_token without authorization
    let env = Env::default();
    // DO NOT mock all auths - we want to test actual authorization

    let (_bridge_id, bridge_client, token_id, _, _stellar_asset_client, _, _) = setup_test_env(&env);

    // Attacker address (not owner)
    let attacker = Address::generate(&env);

    // FIXED: Attacker CANNOT call set_admin_token without authorization
    // This will panic with authorization error
    bridge_client.set_admin_token(&token_id, &attacker, &attacker);

    // This line should never be reached
}

#[test]
#[should_panic] // Panics with Error(Auth, InvalidAction)
fn test_c2_unauthorized_user_cannot_call_set_admin_token() {
    // This test verifies the FIX for C-2 vulnerability
    let env = Env::default();
    // DO NOT mock all auths - we want to test actual authorization

    let (_, bridge_client, token_id, _, _, _, _) = setup_test_env(&env);
    let unauthorized_user = Address::generate(&env);
    let new_admin = Address::generate(&env);

    // This should fail with authorization error (FIXED)
    bridge_client.set_admin_token(&token_id, &new_admin, &unauthorized_user);
}

#[test]
fn test_c2_only_owner_can_call_set_admin_token() {
    // This test verifies owner CAN call set_admin_token after fix
    let env = Env::default();
    env.mock_all_auths();

    let (_, bridge_client, token_id, _, _, owner, _) = setup_test_env(&env);
    let new_admin = Address::generate(&env);

    // Owner should be able to call set_admin_token (FIXED)
    bridge_client.set_admin_token(&token_id, &new_admin, &owner);

    // Should succeed without panic
}

// ----------------------------------------------------------------------------
// C-3: Integer Overflow Risk in Locked Balance Accounting
// ----------------------------------------------------------------------------

#[test]
#[should_panic] // Should panic with overflow error after fix
fn test_c3_locked_balance_overflow_protection() {
    let env = Env::default();
    env.mock_all_auths();

    let (bridge_id, bridge_client, token_id, token_client, stellar_asset_client, _, _) = setup_test_env(&env);
    let user = Address::generate(&env);

    // Mint a very large amount approaching i128::MAX
    let large_amount = i128::MAX - 1000;
    stellar_asset_client.mint(&user, &large_amount);
    token_client.approve(&user, &bridge_id, &large_amount, &99999);

    // First lock succeeds
    execute_bridge_op(
        &bridge_client,
        0u32, // Lock
        &token_id.to_string(),
        &token_id.to_string(),
        large_amount - 500,
        &user.to_string(),
        &String::from_str(&env, "0xdest"),
        &String::from_str(&env, "stellar:testnet"),
        &String::from_str(&env, "eip155:1"),
        1005,
        &String::from_str(&env, "test@example.com"),
        &user,
    );

    // Mint more tokens
    stellar_asset_client.mint(&user, &2000);
    token_client.approve(&user, &bridge_id, &2000, &99999);

    // Second lock should fail with overflow error
    // Currently this will overflow and wrap around (vulnerability)
    execute_bridge_op(
        &bridge_client,
        0u32, // Lock
        &token_id.to_string(),
        &token_id.to_string(),
        2000, // This would cause overflow
        &user.to_string(),
        &String::from_str(&env, "0xdest"),
        &String::from_str(&env, "stellar:testnet"),
        &String::from_str(&env, "eip155:1"),
        1006,
        &String::from_str(&env, "test@example.com"),
        &user,
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #12)")] // InsufficientLockedBalance
fn test_c3_locked_balance_underflow_protection() {
    let env = Env::default();
    env.mock_all_auths();

    let (bridge_id, bridge_client, token_id, token_client, stellar_asset_client, _, system_wallet) = setup_test_env(&env);
    let user = Address::generate(&env);

    // Lock 5000 tokens
    stellar_asset_client.mint(&user, &10000);
    token_client.approve(&user, &bridge_id, &5000, &99999);

    execute_bridge_op(
        &bridge_client,
        0u32, // Lock
        &token_id.to_string(),
        &token_id.to_string(),
        5000,
        &user.to_string(),
        &String::from_str(&env, "0xdest"),
        &String::from_str(&env, "stellar:testnet"),
        &String::from_str(&env, "eip155:1"),
        1007,
        &String::from_str(&env, "test@example.com"),
        &user,
    );

    // Try to release more than locked (should fail with underflow protection)
    execute_bridge_op(
        &bridge_client,
        2u32, // Release
        &token_id.to_string(),
        &token_id.to_string(),
        10000, // More than locked
        &String::from_str(&env, "0xdest"),
        &user.to_string(),
        &String::from_str(&env, "eip155:1"),
        &String::from_str(&env, "stellar:testnet"),
        1008,
        &String::from_str(&env, "test@example.com"),
        &system_wallet,
    );
}

#[test]
fn test_c3_locked_balance_accounting_invariant() {
    // Property test: locked_balance <= total_balance at all times
    let env = Env::default();
    env.mock_all_auths();

    let (bridge_id, bridge_client, token_id, token_client, stellar_asset_client, _, system_wallet) = setup_test_env(&env);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    // Initial state: invariant holds
    let locked = bridge_client.get_locked_balance(&token_id);
    let total = token_client.balance(&bridge_id);
    assert!(locked <= total);

    // Lock operation
    stellar_asset_client.mint(&user1, &5000);
    token_client.approve(&user1, &bridge_id, &5000, &99999);
    execute_bridge_op(
        &bridge_client, 0u32, &token_id.to_string(), &token_id.to_string(), 5000,
        &user1.to_string(), &String::from_str(&env, "0xdest"),
        &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "eip155:1"),
        1009, &String::from_str(&env, "test@example.com"), &user1
    );

    // After lock: invariant must hold
    let locked = bridge_client.get_locked_balance(&token_id);
    let total = token_client.balance(&bridge_id);
    assert!(locked <= total);
    assert_eq!(locked, 5000);
    assert_eq!(total, 5000);

    // Another lock
    stellar_asset_client.mint(&user2, &3000);
    token_client.approve(&user2, &bridge_id, &3000, &99999);
    execute_bridge_op(
        &bridge_client, 0u32, &token_id.to_string(), &token_id.to_string(), 3000,
        &user2.to_string(), &String::from_str(&env, "0xdest"),
        &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "eip155:1"),
        1010, &String::from_str(&env, "test@example.com"), &user2
    );

    // After second lock: invariant must hold
    let locked = bridge_client.get_locked_balance(&token_id);
    let total = token_client.balance(&bridge_id);
    assert!(locked <= total);
    assert_eq!(locked, 8000);
    assert_eq!(total, 8000);

    // Release operation
    execute_bridge_op(
        &bridge_client, 2u32, &token_id.to_string(), &token_id.to_string(), 2000,
        &String::from_str(&env, "0xdest"), &user1.to_string(),
        &String::from_str(&env, "eip155:1"), &String::from_str(&env, "stellar:testnet"),
        1011, &String::from_str(&env, "test@example.com"), &system_wallet
    );

    // After release: invariant must hold
    let locked = bridge_client.get_locked_balance(&token_id);
    let total = token_client.balance(&bridge_id);
    assert!(locked <= total);
    assert_eq!(locked, 6000);
    assert_eq!(total, 6000);

    // Add treasury funds (not locked)
    stellar_asset_client.mint(&bridge_id, &1000);

    // With treasury: invariant must hold
    let locked = bridge_client.get_locked_balance(&token_id);
    let total = token_client.balance(&bridge_id);
    assert!(locked <= total);
    assert_eq!(locked, 6000);
    assert_eq!(total, 7000); // 6000 locked + 1000 treasury
}

#[test]
fn test_c3_multiple_locks_accumulation_safety() {
    // Test that multiple lock operations don't cause overflow
    let env = Env::default();
    env.mock_all_auths();

    let (bridge_id, bridge_client, token_id, token_client, stellar_asset_client, _, _) = setup_test_env(&env);
    let user = Address::generate(&env);

    // Perform multiple lock operations
    let lock_amount = 1_000_000_000i128; // 1 billion per lock
    let num_locks = 10;

    stellar_asset_client.mint(&user, &(lock_amount * num_locks));
    token_client.approve(&user, &bridge_id, &(lock_amount * num_locks), &99999);

    for i in 0..num_locks {
        execute_bridge_op(
            &bridge_client, 0u32, &token_id.to_string(), &token_id.to_string(), lock_amount,
            &user.to_string(), &String::from_str(&env, "0xdest"),
            &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "eip155:1"),
            1012 + i, &String::from_str(&env, "test@example.com"), &user
        );

        // Verify locked balance is correct after each lock
        let expected_locked = lock_amount * (i + 1);
        let actual_locked = bridge_client.get_locked_balance(&token_id);
        assert_eq!(actual_locked, expected_locked);
    }

    // Final verification
    let total_locked = bridge_client.get_locked_balance(&token_id);
    assert_eq!(total_locked, lock_amount * num_locks);
}

// ============================================================================
// HIGH SEVERITY TESTS (H-1, H-2, H-3, H-4)
// ============================================================================

// ----------------------------------------------------------------------------
// H-1: No Validation of Token Addresses in Bridge Operations
// ----------------------------------------------------------------------------

#[test]
#[should_panic]
fn test_h1_lock_operation_with_non_token_contract_address() {
    let env = Env::default();
    env.mock_all_auths();

    let (_, bridge_client, _, _, _, _, _) = setup_test_env(&env);
    let user = Address::generate(&env);

    // Create a non-token contract address (just a random address)
    let non_token_address = Address::generate(&env);

    // Try to lock with non-token contract address
    // This should fail because the address is not a token contract
    execute_bridge_op(
        &bridge_client,
        0u32, // Lock
        &non_token_address.to_string(),
        &non_token_address.to_string(),
        1000,
        &user.to_string(),
        &String::from_str(&env, "0xdest"),
        &String::from_str(&env, "stellar:testnet"),
        &String::from_str(&env, "eip155:1"),
        1022,
        &String::from_str(&env, "test@example.com"),
        &user,
    );
}

#[test]
#[should_panic]
fn test_h1_mint_operation_with_invalid_token_address() {
    let env = Env::default();
    env.mock_all_auths();

    let (_, bridge_client, _, _, _, _, system_wallet) = setup_test_env(&env);

    // Use a random address that's not a token contract
    let invalid_token = Address::generate(&env);
    let recipient = Address::generate(&env);

    // Try to mint with invalid token address
    execute_bridge_op(
        &bridge_client,
        3u32, // Mint
        &invalid_token.to_string(),
        &invalid_token.to_string(),
        1000,
        &String::from_str(&env, "0x1234"),
        &recipient.to_string(),
        &String::from_str(&env, "eip155:1"),
        &String::from_str(&env, "stellar:testnet"),
        1023,
        &String::from_str(&env, "test@example.com"),
        &system_wallet,
    );
}


