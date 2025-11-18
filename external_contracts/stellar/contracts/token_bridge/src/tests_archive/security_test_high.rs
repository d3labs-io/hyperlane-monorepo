#![cfg(test)]
//! High Severity Security Tests (H-2, H-3, H-4)
//!
//! This module contains high severity security tests for:
//! - H-2: Missing TTL Extension for Persistent Storage
//! - H-3: Burn Operation Requires Pre-Approval
//! - H-4: No Maximum Amount Validation

use super::*;
use soroban_sdk::{
    testutils::Address as _, token::{StellarAssetClient, TokenClient}, Address, Env, String
};

// ============ Test Helpers ============

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

// ----------------------------------------------------------------------------
// H-2: Missing TTL Extension for Persistent Storage
// ----------------------------------------------------------------------------

#[test]
fn test_h2_transaction_id_should_have_ttl_extension() {
    // NOTE: This test documents the INTENDED behavior
    // Currently transaction IDs are stored without TTL extension (vulnerability)
    let env = Env::default();
    env.mock_all_auths();

    let (_, bridge_client, token_id, _, stellar_asset_client, _, system_wallet) = setup_test_env(&env);
    let recipient = Address::generate(&env);

    let tx_id = 2001i128;

    // Mint operation stores transaction ID
    execute_bridge_op(
        &bridge_client, 3u32, &token_id.to_string(), &token_id.to_string(), 1000,
        &String::from_str(&env, "0x1234"), &recipient.to_string(),
        &String::from_str(&env, "eip155:1"), &String::from_str(&env, "stellar:testnet"),
        tx_id, &String::from_str(&env, "test@example.com"), &system_wallet
    );

    // Verify transaction ID is marked as used
    assert_eq!(bridge_client.is_transaction_used(&tx_id), true);

    // TODO: After fix, verify TTL is set
    // let ttl = env.storage().persistent().get_ttl(&DataKey::TransactionIds(tx_id));
    // assert!(ttl >= 31_536_000); // At least 1 year
}

#[test]
fn test_h2_transaction_id_replay_vulnerability_after_ttl_expiration() {
    // NOTE: This test demonstrates the replay attack vulnerability
    // After TTL expiration, the same transaction ID could be reused
    // This is a theoretical vulnerability that requires time manipulation
    
    let env = Env::default();
    env.mock_all_auths();

    let (_, bridge_client, token_id, _, _, _, system_wallet) = setup_test_env(&env);
    let recipient = Address::generate(&env);

    let tx_id = 2002i128;

    // First use of transaction ID
    execute_bridge_op(
        &bridge_client, 3u32, &token_id.to_string(), &token_id.to_string(), 1000,
        &String::from_str(&env, "0x1234"), &recipient.to_string(),
        &String::from_str(&env, "eip155:1"), &String::from_str(&env, "stellar:testnet"),
        tx_id, &String::from_str(&env, "test@example.com"), &system_wallet
    );

    assert_eq!(bridge_client.is_transaction_used(&tx_id), true);

    // TODO: Simulate TTL expiration (requires time manipulation in test env)
    // After expiration, the same TX ID could be reused (vulnerability)
    // This would allow replay attacks
}

// ----------------------------------------------------------------------------
// H-3: Burn Operation Requires Pre-Approval
// ----------------------------------------------------------------------------

#[test]
#[should_panic] // Should panic with insufficient allowance
fn test_h3_burn_operation_without_approval_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (bridge_id, bridge_client, token_id, token_client, stellar_asset_client, _, _) = setup_test_env(&env);
    let user = Address::generate(&env);

    // Mint tokens to user but DON'T approve bridge
    stellar_asset_client.mint(&user, &10000);

    // Verify user has tokens
    assert_eq!(token_client.balance(&user), 10000);

    // Verify bridge has NO allowance
    assert_eq!(token_client.allowance(&user, &bridge_id), 0);

    // Try to burn without approval - should fail
    execute_bridge_op(
        &bridge_client, 1u32, &token_id.to_string(), &token_id.to_string(), 1000,
        &user.to_string(), &String::from_str(&env, "0xdest"),
        &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "eip155:1"),
        2003, &String::from_str(&env, "test@example.com"), &user
    );
}

#[test]
#[should_panic] // Should panic with insufficient allowance
fn test_h3_burn_operation_with_insufficient_approval() {
    let env = Env::default();
    env.mock_all_auths();

    let (bridge_id, bridge_client, token_id, token_client, stellar_asset_client, _, _) = setup_test_env(&env);
    let user = Address::generate(&env);

    // Mint tokens and approve only 500
    stellar_asset_client.mint(&user, &10000);
    token_client.approve(&user, &bridge_id, &500, &99999);

    // Verify allowance is only 500
    assert_eq!(token_client.allowance(&user, &bridge_id), 500);

    // Try to burn 1000 (more than approved) - should fail
    execute_bridge_op(
        &bridge_client, 1u32, &token_id.to_string(), &token_id.to_string(), 1000,
        &user.to_string(), &String::from_str(&env, "0xdest"),
        &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "eip155:1"),
        2004, &String::from_str(&env, "test@example.com"), &user
    );
}

#[test]
#[should_panic]
fn test_h3_burn_should_check_allowance_before_marking_transaction_used() {
    // CRITICAL: Transaction ID should NOT be consumed if allowance check fails
    // This prevents transaction ID exhaustion attacks
    // NOTE: This test will panic due to insufficient allowance
    // After fix, verify TX ID is not consumed by checking in a separate test
    let env = Env::default();
    env.mock_all_auths();

    let (bridge_id, bridge_client, token_id, token_client, stellar_asset_client, _, _) = setup_test_env(&env);
    let user = Address::generate(&env);

    let tx_id = 2005i128;

    // Mint tokens but don't approve
    stellar_asset_client.mint(&user, &10000);

    // Verify transaction ID is not used
    assert_eq!(bridge_client.is_transaction_used(&tx_id), false);

    // Try to burn without approval - will panic
    execute_bridge_op(
        &bridge_client, 1u32, &token_id.to_string(), &token_id.to_string(), 1000,
        &user.to_string(), &String::from_str(&env, "0xdest"),
        &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "eip155:1"),
        tx_id, &String::from_str(&env, "test@example.com"), &user
    );

    // CRITICAL: Transaction ID should NOT be consumed after panic
    // NOTE: Current implementation may consume TX ID even on failure (vulnerability)
}

#[test]
#[should_panic] // Should panic with InvalidAmount after fix
fn test_h4_release_operation_amount_validation() {
    let env = Env::default();
    env.mock_all_auths();

    let (bridge_id, bridge_client, token_id, token_client, stellar_asset_client, _, system_wallet) = setup_test_env(&env);
    let user = Address::generate(&env);

    // First lock a large amount
    let large_amount = i128::MAX / 10;
    stellar_asset_client.mint(&user, &large_amount);
    token_client.approve(&user, &bridge_id, &large_amount, &99999);
    
    execute_bridge_op(
        &bridge_client, 0u32, &token_id.to_string(), &token_id.to_string(), large_amount,
        &user.to_string(), &String::from_str(&env, "0xdest"),
        &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "eip155:1"),
        2008, &String::from_str(&env, "test@example.com"), &user
    );

    // Try to release an excessive amount
    let excessive_release = i128::MAX / 2;

    execute_bridge_op(
        &bridge_client, 2u32, &token_id.to_string(), &token_id.to_string(), excessive_release,
        &String::from_str(&env, "0xdest"), &user.to_string(),
        &String::from_str(&env, "eip155:1"), &String::from_str(&env, "stellar:testnet"),
        2009, &String::from_str(&env, "test@example.com"), &system_wallet
    );
}


