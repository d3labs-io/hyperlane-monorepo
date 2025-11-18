#![cfg(test)]
//! Integration tests for TokenBridge with real Stellar Asset Contracts (SACs)
//!
//! These tests demonstrate how to:
//! 1. Create Stellar assets and deploy their SACs
//! 2. Test mint and burn operations with real token contracts
//! 3. Handle token approvals and authorizations
//! 4. Test cross-token bridge operations
//! 5. Test complete user flows with lock/unlock and mint/burn mechanisms
//! 6. Test multi-user scenarios and vault accounting
//! 7. Test security scenarios (double spending, unauthorized access, etc.)

use super::*;
use soroban_sdk::{
    log, testutils::Address as _, token::{StellarAssetClient, TokenClient}, Address, Env, String
};

// ============ Test Fixtures ============

/// Test fixture for a token using Lock/Unlock mechanism
/// This token is locked on Stellar when bridging out, and unlocked when bridging back
pub struct LockUnlockToken {
    pub token_id: Address,
    pub token_client: TokenClient<'static>,
    pub stellar_asset_client: StellarAssetClient<'static>,
}

/// Test fixture for a token using Mint/Burn mechanism
/// This token is burned on Stellar when bridging out, and minted when bridging back
pub struct MintBurnToken {
    pub token_id: Address,
    pub token_client: TokenClient<'static>,
    pub stellar_asset_client: StellarAssetClient<'static>,
}

/// Complete test environment with bridge and two token types
pub struct TestEnvironment {
    pub bridge_id: Address,
    pub bridge_client: TokenBridgeClient<'static>,
    pub lock_unlock_token: LockUnlockToken,
    pub mint_burn_token: MintBurnToken,
    pub owner: Address,
    pub system_wallet: Address,
}

impl TestEnvironment {
    /// Create a new test environment with bridge and two token types
    pub fn new(env: &Env) -> Self {
        // Create owner and system wallet for TokenBridge
        let owner = Address::generate(&env);
        let system_wallet = Address::generate(&env);
        let current_chain_id = String::from_str(&env, "stellar:testnet");

        log!(&env, "owner: {:?}", owner.clone());
        log!(&env, "system_wallet: {:?}", system_wallet.clone());

        // Register TokenBridge contract
        let bridge_id = env.register(
            TokenBridge,
            (owner.clone(), system_wallet.clone(), current_chain_id)
        );
        let bridge_client = TokenBridgeClient::new(&env, &bridge_id);

        // Create Lock/Unlock token (standard token that gets locked in the bridge)
        let lock_unlock_asset_admin = Address::generate(&env);
        let lock_unlock_contract = env.register_stellar_asset_contract_v2(lock_unlock_asset_admin.clone());
        let lock_unlock_token_id = lock_unlock_contract.address();
        let lock_unlock_token_client = TokenClient::new(&env, &lock_unlock_token_id);
        let lock_unlock_stellar_client = StellarAssetClient::new(&env, &lock_unlock_token_id);

        // Create Mint/Burn token (token that gets burned/minted by the bridge)
        let mint_burn_asset_admin = Address::generate(&env);
        let mint_burn_contract = env.register_stellar_asset_contract_v2(mint_burn_asset_admin.clone());
        let mint_burn_token_id = mint_burn_contract.address();
        let mint_burn_token_client = TokenClient::new(&env, &mint_burn_token_id);
        let mint_burn_stellar_client = StellarAssetClient::new(&env, &mint_burn_token_id);

        // Set the bridge as the admin of the mint/burn token so it can mint/burn
        mint_burn_stellar_client.set_admin(&bridge_id);

        Self {
            bridge_id,
            bridge_client,
            lock_unlock_token: LockUnlockToken {
                token_id: lock_unlock_token_id,
                token_client: lock_unlock_token_client,
                stellar_asset_client: lock_unlock_stellar_client,
            },
            mint_burn_token: MintBurnToken {
                token_id: mint_burn_token_id,
                token_client: mint_burn_token_client,
                stellar_asset_client: mint_burn_stellar_client,
            },
            owner,
            system_wallet,
        }
    }
}

/// Helper function to set up a complete test environment with:
/// - TokenBridge contract
/// - Stellar Asset Contract (SAC)
/// - Owner and system wallet addresses
///
/// Note: This function expects env.mock_all_auths() to be called BEFORE calling this function
fn setup_bridge_and_token(
    env: &Env,
) -> (
    Address,                  // bridge_id
    TokenBridgeClient,        // bridge_client
    Address,                  // token_id
    TokenClient,              // token_client
    StellarAssetClient,       // stellar_asset_client
    Address,                  // owner
    Address,                  // system_wallet
    Address,                  // asset_admin
) {
    // Create owner and system wallet for TokenBridge
    let owner = Address::generate(&env);
    let system_wallet = Address::generate(&env);
    let current_chain_id = String::from_str(&env, "stellar:testnet");

    log!(&env, "owner: {:?}", owner.clone());
    log!(&env, "system_wallet: {:?}", system_wallet.clone());

    // Register TokenBridge contract with new constructor
    let bridge_id = env.register(
        TokenBridge,
        (owner.clone(), system_wallet.clone(), current_chain_id)
    );
    let bridge_client = TokenBridgeClient::new(&env, &bridge_id);

    // Create a Stellar asset and its SAC
    let asset_admin = Address::generate(&env);
    let token_contract = env.register_stellar_asset_contract_v2(asset_admin.clone());
    let token_id = token_contract.address();

    // Create clients for the token
    let token_client = TokenClient::new(&env, &token_id);
    let stellar_asset_client: StellarAssetClient<'_> = StellarAssetClient::new(&env, &token_id);

    // Set the bridge as the admin of the SAC so it can mint tokens
    stellar_asset_client.set_admin(&bridge_id);

    (
        bridge_id,
        bridge_client,
        token_id,
        token_client,
        stellar_asset_client,
        owner,
        system_wallet,
        asset_admin
    )
}

/// Helper function to generate a valid Stellar address string for testing
fn gen_address_str(env: &Env) -> String {
    Address::generate(env).to_string()
}

/// Helper function to execute bridge operation with the new struct-based API
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
        from_token: Address::from_string(&from_token.clone()).to_string(),
        to_token: Address::from_string(&to_token.clone()).to_string(),
        amount,
        from_address: from_address.clone(),
        to_address: to_address.clone(),
        from_network: from_network.clone(),
        to_network: to_network.clone(),
        transaction_id,
        email: email.clone(),
    };

    bridge_client.execute_bridge_operation(
        &operation,
        &bridge_data,
        caller,
    );
}

// ============ Basic Operation Tests ============

#[test]
fn test_mint_with_stellar_asset() {
    let env = Env::default();
    env.mock_all_auths();

    let (_, bridge_client, token_id, token_client, _, _, system_wallet, _) = setup_bridge_and_token(&env);

    // Test recipient
    let recipient = Address::generate(&env);
    let recipient_str = recipient.to_string();

    // Mint tokens through the bridge using execute_bridge_operation
    let operation = 3u32; // Mint operation
    let amount = 1000i128;
    let from_address = String::from_str(&env, "0x1234..."); // Source address on Ethereum
    let from_network = String::from_str(&env, "eip155:1"); // Ethereum mainnet
    let to_network = String::from_str(&env, "stellar:testnet");
    let transaction_id = 1001;

    execute_bridge_op(
        &bridge_client, operation, &token_id.to_string(), &token_id.to_string(), amount,
        &from_address, &recipient_str,
        &from_network, &to_network,
        transaction_id, &String::from_str(&env, "email@example.com"), &system_wallet
    );

    // Verify the balance
    assert_eq!(token_client.balance(&recipient), 1000);

    // Verify transaction ID was consumed
    assert_eq!(bridge_client.is_transaction_used(&transaction_id), true);
}

#[test]
fn test_burn_with_stellar_asset() {
    let env = Env::default();
    env.mock_all_auths();

    let (bridge_id, bridge_client, token_id, token_client, stellar_asset_client, _, _, _) =
        setup_bridge_and_token(&env);

    // Create a user and mint them some tokens first
    let user = Address::generate(&env);
    stellar_asset_client.mint(&user, &5000);

    // Verify initial balance
    assert_eq!(token_client.balance(&user), 5000);

    // Approve bridge to burn tokens
    token_client.approve(&user, &bridge_id, &1000, &99999);

    // Burn tokens through the bridge using execute_bridge_operation
    let operation = 1u32; // Burn operation
    let amount = 1000i128;
    let from_address = gen_address_str(&env); // User's Stellar address
    let to_address = String::from_str(&env, "0xuser_address"); // Destination Ethereum address
    let from_network = String::from_str(&env, "stellar:testnet");
    let to_network = String::from_str(&env, "eip155:1"); // Ethereum mainnet
    let transaction_id = 1007;

    execute_bridge_op(
        &bridge_client, operation, &token_id.to_string(), &token_id.to_string(), amount,
        &from_address, &to_address,
        &from_network, &to_network,
        transaction_id, &String::from_str(&env, "email@example.com"), &user
    );

    // Verify the balance decreased
    assert_eq!(token_client.balance(&user), 4000);

    // Verify transaction ID was consumed
    assert_eq!(bridge_client.is_transaction_used(&transaction_id), true);
}

#[test]
fn test_lock_operation() {
    let env = Env::default();
    env.mock_all_auths();

    let (bridge_id, bridge_client, token_id, token_client, stellar_asset_client, _, _, _) =
        setup_bridge_and_token(&env);

    // Create a user and mint them some tokens
    let user = Address::generate(&env);
    stellar_asset_client.mint(&user, &5000);

    // Approve bridge to lock tokens
    token_client.approve(&user, &bridge_id, &1000, &99999);

    // Lock tokens through the bridge
    let operation = 0u32; // Lock operation
    let amount = 1000i128;
    let from_address = gen_address_str(&env);
    let to_address = String::from_str(&env, "0xdest_address");
    let from_network = String::from_str(&env, "stellar:testnet");
    let to_network = String::from_str(&env, "eip155:1");
    let transaction_id = 1002;

    execute_bridge_op(
        &bridge_client, operation, &token_id.to_string(), &token_id.to_string(), amount,
        &from_address, &to_address,
        &from_network, &to_network,
        transaction_id, &String::from_str(&env, "email@example.com"), &user
    );

    // Verify user balance decreased
    assert_eq!(token_client.balance(&user), 4000);

    // Verify bridge balance increased
    assert_eq!(token_client.balance(&bridge_id), 1000);

    // Verify locked balance increased
    assert_eq!(bridge_client.get_locked_balance(&token_id), 1000);

    // Verify transaction ID was consumed
    assert_eq!(bridge_client.is_transaction_used(&transaction_id), true);
}

#[test]
fn test_release_operation() {
    let env = Env::default();
    env.mock_all_auths();

    let (bridge_id, bridge_client, token_id, token_client, stellar_asset_client, _, system_wallet, _) =
        setup_bridge_and_token(&env);

    // First, lock some tokens to have locked balance
    let user = Address::generate(&env);
    stellar_asset_client.mint(&user, &5000);
    token_client.approve(&user, &bridge_id, &2000, &99999);

    // Lock tokens
    let lock_operation = 0u32;
    let lock_tx_id = 1002;
    execute_bridge_op(
        &bridge_client, lock_operation, &token_id.to_string(), &token_id.to_string(), 2000,
        &gen_address_str(&env), &String::from_str(&env, "0xdest"),
        &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "eip155:1"),
        lock_tx_id, &String::from_str(&env, "email@example.com"), &user
    );

    // Now release tokens to a recipient
    let recipient = Address::generate(&env);
    let recipient_str = recipient.to_string();
    let operation = 2u32; // Release operation
    let amount = 1000i128;
    let from_address = String::from_str(&env, "0xsource_address");
    let from_network = String::from_str(&env, "eip155:1");
    let to_network = String::from_str(&env, "stellar:testnet");
    let transaction_id = 1003;

    execute_bridge_op(
        &bridge_client, operation, &token_id.to_string(), &token_id.to_string(), amount,
        &from_address, &recipient_str,
        &from_network, &to_network,
        transaction_id, &String::from_str(&env, "email@example.com"), &system_wallet
    );

    // Verify recipient received tokens
    assert_eq!(token_client.balance(&recipient), 1000);

    // Verify locked balance decreased
    assert_eq!(bridge_client.get_locked_balance(&token_id), 1000);

    // Verify transaction ID was consumed
    assert_eq!(bridge_client.is_transaction_used(&transaction_id), true);
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_cannot_reuse_transaction_id() {
    let env = Env::default();
    env.mock_all_auths();

    let (_, bridge_client, token_id, _, _, _, system_wallet, _) = setup_bridge_and_token(&env);

    let transaction_id = 1028;

    // First mint with transaction ID
    execute_bridge_op(
        &bridge_client, 3u32, &token_id.to_string(), &token_id.to_string(), 1000,
        &String::from_str(&env, "0x1234..."), &gen_address_str(&env),
        &String::from_str(&env, "eip155:1"), &String::from_str(&env, "stellar:testnet"),
        transaction_id, &String::from_str(&env, "email@example.com"), &system_wallet
    );

    // Try to mint again with same transaction ID (should panic)
    execute_bridge_op(
        &bridge_client, 3u32, &token_id.to_string(), &token_id.to_string(), 1000,
        &String::from_str(&env, "0x1234..."), &gen_address_str(&env),
        &String::from_str(&env, "eip155:1"), &String::from_str(&env, "stellar:testnet"),
        transaction_id, &String::from_str(&env, "email@example.com"), &system_wallet
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_invalid_amount_zero() {
    let env = Env::default();
    env.mock_all_auths();

    let (_, bridge_client, token_id, _, _, _, system_wallet, _) = setup_bridge_and_token(&env);

    // Generate a valid recipient address
    let recipient = Address::generate(&env);
    let recipient_str = recipient.to_string();

    // Try to mint with zero amount (should panic)
    execute_bridge_op(
        &bridge_client, 3u32, &token_id.to_string(), &token_id.to_string(), 0, // Invalid: zero amount,
        &String::from_str(&env, "0x1234..."), &recipient_str,
        &String::from_str(&env, "eip155:1"), &String::from_str(&env, "stellar:testnet"),
        1001, &String::from_str(&env, "email@example.com"), &system_wallet
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_invalid_amount_negative() {
    let env = Env::default();
    env.mock_all_auths();

    let (_, bridge_client, token_id, _, _, _, system_wallet, _) = setup_bridge_and_token(&env);

    // Generate a valid recipient address
    let recipient = Address::generate(&env);
    let recipient_str = recipient.to_string();

    // Try to mint with negative amount (should panic)
    execute_bridge_op(
        &bridge_client, 3u32, &token_id.to_string(), &token_id.to_string(), -100, // Invalid: negative amount,
        &String::from_str(&env, "0x1234..."), &recipient_str,
        &String::from_str(&env, "eip155:1"), &String::from_str(&env, "stellar:testnet"),
        1001, &String::from_str(&env, "email@example.com"), &system_wallet
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #10)")]
fn test_invalid_chain_id_in_operation() {
    let env = Env::default();
    env.mock_all_auths();

    let (_, bridge_client, token_id, _, _, _, system_wallet, _) = setup_bridge_and_token(&env);

    // Try to mint with invalid chain ID (should panic)
    execute_bridge_op(
        &bridge_client, 3u32, &token_id.to_string(), &token_id.to_string(), 1000,
        &String::from_str(&env, "0x1234..."), &gen_address_str(&env),
        &String::from_str(&env, "ab"), &String::from_str(&env, "stellar:testnet"),
        1001, &String::from_str(&env, "email@example.com"), &system_wallet
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #16)")]
fn test_invalid_operation_type() {
    let env = Env::default();
    env.mock_all_auths();

    let (_, bridge_client, token_id, _, _, _, system_wallet, _) = setup_bridge_and_token(&env);

    // Try with invalid operation type (should panic)
    execute_bridge_op(
        &bridge_client, 99u32, &token_id.to_string(), &token_id.to_string(), 1000,
        &String::from_str(&env, "0x1234..."), &gen_address_str(&env),
        &String::from_str(&env, "eip155:1"), &String::from_str(&env, "stellar:testnet"),
        1001, &String::from_str(&env, "email@example.com"), &system_wallet
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #11)")]
fn test_release_on_same_chain_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (_, bridge_client, token_id, _, _, _, system_wallet, _) = setup_bridge_and_token(&env);

    // Try to release tokens where source chain equals current chain (should panic)
    execute_bridge_op(
        &bridge_client, 2u32, &token_id.to_string(), &token_id.to_string(), 1000,
        &String::from_str(&env, "0x1234..."), &gen_address_str(&env),
        &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "stellar:testnet"),
        1001, &String::from_str(&env, "email@example.com"), &system_wallet
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #12)")]
fn test_release_insufficient_locked_balance() {
    let env = Env::default();
    env.mock_all_auths();

    let (_, bridge_client, token_id, _, _, _, system_wallet, _) = setup_bridge_and_token(&env);

    // Try to release more than locked balance (should panic)
    execute_bridge_op(
        &bridge_client, 2u32, &token_id.to_string(), &token_id.to_string(), 1000, // No locked balance exists,
        &String::from_str(&env, "0x1234..."), &gen_address_str(&env),
        &String::from_str(&env, "eip155:1"), &String::from_str(&env, "stellar:testnet"),
        1001, &String::from_str(&env, "email@example.com"), &system_wallet
    );
}

// ============ Pausable Integration Tests ============

#[test]
#[should_panic]
fn test_operations_blocked_when_paused() {
    let env = Env::default();
    env.mock_all_auths();

    let (_, bridge_client, token_id, _, _, owner, system_wallet, _) = setup_bridge_and_token(&env);

    // Pause the contract
    bridge_client.pause(&owner);

    // Try to execute mint operation (should panic because contract is paused)
    execute_bridge_op(
        &bridge_client, 3u32, &token_id.to_string(), &token_id.to_string(), 1000,
        &String::from_str(&env, "0x1234..."), &gen_address_str(&env),
        &String::from_str(&env, "eip155:1"), &String::from_str(&env, "stellar:testnet"),
        1001, &String::from_str(&env, "email@example.com"), &system_wallet
    );
}

#[test]
fn test_operations_work_after_unpause() {
    let env = Env::default();
    env.mock_all_auths();

    let (_, bridge_client, token_id, token_client, _, owner, system_wallet, _) = setup_bridge_and_token(&env);

    // Pause the contract
    bridge_client.pause(&owner);
    assert_eq!(bridge_client.paused(), true);

    // Unpause the contract
    bridge_client.unpause(&owner);
    assert_eq!(bridge_client.paused(), false);

    // Now operations should work
    let recipient = Address::generate(&env);
    let recipient_str = recipient.to_string();
    execute_bridge_op(
        &bridge_client, 3u32, &token_id.to_string(), &token_id.to_string(), 1000,
        &String::from_str(&env, "0x1234..."), &recipient_str,
        &String::from_str(&env, "eip155:1"), &String::from_str(&env, "stellar:testnet"),
        1001, &String::from_str(&env, "email@example.com"), &system_wallet
    );

    // Verify mint succeeded
    assert_eq!(token_client.balance(&recipient), 1000);
}

// ============ Access Control Integration Tests ============

#[test]
fn test_system_wallet_can_mint_and_release() {
    let env = Env::default();
    env.mock_all_auths();

    let (_, bridge_client, token_id, token_client, _, _, system_wallet, _) = setup_bridge_and_token(&env);

    let recipient = Address::generate(&env);
    let recipient_str = recipient.to_string();

    // System wallet should be able to mint
    execute_bridge_op(
        &bridge_client, 3u32, &token_id.to_string(), &token_id.to_string(), 1000,
        &String::from_str(&env, "0x1234..."), &recipient_str,
        &String::from_str(&env, "eip155:1"), &String::from_str(&env, "stellar:testnet"),
        1001, &String::from_str(&env, "email@example.com"), &system_wallet
    );

    assert_eq!(token_client.balance(&recipient), 1000);
}

#[test]
fn test_complete_lock_and_release_flow() {
    let env = Env::default();
    env.mock_all_auths();

    let (bridge_id, bridge_client, token_id, token_client, stellar_asset_client, _, system_wallet, _) =
        setup_bridge_and_token(&env);

    // Step 1: User locks tokens
    let user = Address::generate(&env);
    stellar_asset_client.mint(&user, &5000);
    token_client.approve(&user, &bridge_id, &2000, &99999);

    execute_bridge_op(
        &bridge_client, 0u32, &token_id.to_string(), &token_id.to_string(), 2000,
        &gen_address_str(&env), &String::from_str(&env, "0xdest"),
        &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "eip155:1"),
        1002, &String::from_str(&env, "email@example.com"), &user
    );

    // Verify locked balance
    assert_eq!(bridge_client.get_locked_balance(&token_id), 2000);

    // Step 2: System wallet releases tokens to another user
    let recipient = Address::generate(&env);
    let recipient_str = recipient.to_string();
    execute_bridge_op(
        &bridge_client, 2u32, &token_id.to_string(), &token_id.to_string(), 1000,
        &String::from_str(&env, "0xsource"), &recipient_str,
        &String::from_str(&env, "eip155:1"), &String::from_str(&env, "stellar:testnet"),
        1003, &String::from_str(&env, "email@example.com"), &system_wallet
    );

    // Verify recipient received tokens
    assert_eq!(token_client.balance(&recipient), 1000);

    // Verify locked balance decreased
    assert_eq!(bridge_client.get_locked_balance(&token_id), 1000);
}

// ============ Multiple System Wallet Integration Tests ============

#[test]
fn test_multiple_system_wallets_can_mint() {
    let env = Env::default();
    env.mock_all_auths();

    let (_, bridge_client, token_id, token_client, _, owner, system_wallet1, _) = setup_bridge_and_token(&env);

    // Add a second system wallet
    let system_wallet2 = Address::generate(&env);
    bridge_client.add_system_wallet(&system_wallet2, &owner);

    // Verify both wallets are system wallets
    assert_eq!(bridge_client.is_system_wallet(&system_wallet1), true);
    assert_eq!(bridge_client.is_system_wallet(&system_wallet2), true);
    assert_eq!(bridge_client.get_system_wallet_count(), 2);

    let recipient1 = Address::generate(&env);
    let recipient1_str = recipient1.to_string();
    let recipient2 = Address::generate(&env);
    let recipient2_str = recipient2.to_string();

    // First system wallet mints tokens
    execute_bridge_op(
        &bridge_client, 3u32, &token_id.to_string(), &token_id.to_string(), 1000,
        &String::from_str(&env, "0x1111..."), &recipient1_str,
        &String::from_str(&env, "eip155:1"), &String::from_str(&env, "stellar:testnet"),
        1004, &String::from_str(&env, "email@example.com"), &system_wallet1
    );

    // Second system wallet mints tokens
    execute_bridge_op(
        &bridge_client, 3u32, &token_id.to_string(), &token_id.to_string(), 2000,
        &String::from_str(&env, "0x2222..."), &recipient2_str,
        &String::from_str(&env, "eip155:1"), &String::from_str(&env, "stellar:testnet"),
        1005, &String::from_str(&env, "email@example.com"), &system_wallet2
    );

    // Verify both mints succeeded
    assert_eq!(token_client.balance(&recipient1), 1000);
    assert_eq!(token_client.balance(&recipient2), 2000);
}

#[test]
fn test_multiple_system_wallets_can_release() {
    let env = Env::default();
    env.mock_all_auths();

    let (bridge_id, bridge_client, token_id, token_client, stellar_asset_client, owner, system_wallet1, _) =
        setup_bridge_and_token(&env);

    // Add a second system wallet
    let system_wallet2 = Address::generate(&env);
    bridge_client.add_system_wallet(&system_wallet2, &owner);

    // Lock some tokens first
    let user = Address::generate(&env);
    stellar_asset_client.mint(&user, &10000);
    token_client.approve(&user, &bridge_id, &5000, &99999);

    execute_bridge_op(
        &bridge_client, 0u32, &token_id.to_string(), &token_id.to_string(), 5000,
        &gen_address_str(&env), &String::from_str(&env, "0xdest"),
        &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "eip155:1"),
        1002, &String::from_str(&env, "email@example.com"), &user
    );

    assert_eq!(bridge_client.get_locked_balance(&token_id), 5000);

    let recipient1 = Address::generate(&env);
    let recipient1_str = recipient1.to_string();
    let recipient2 = Address::generate(&env);
    let recipient2_str = recipient2.to_string();

    // First system wallet releases tokens
    execute_bridge_op(
        &bridge_client, 2u32, &token_id.to_string(), &token_id.to_string(), 1500,
        &String::from_str(&env, "0x1111..."), &recipient1_str,
        &String::from_str(&env, "eip155:1"), &String::from_str(&env, "stellar:testnet"),
        1003, &String::from_str(&env, "email@example.com"), &system_wallet1
    );

    // Second system wallet releases tokens
    execute_bridge_op(
        &bridge_client, 2u32, &token_id.to_string(), &token_id.to_string(), 2500,
        &String::from_str(&env, "0x2222..."), &recipient2_str,
        &String::from_str(&env, "eip155:1"), &String::from_str(&env, "stellar:testnet"),
        1006, &String::from_str(&env, "email@example.com"), &system_wallet2
    );

    // Verify both releases succeeded
    assert_eq!(token_client.balance(&recipient1), 1500);
    assert_eq!(token_client.balance(&recipient2), 2500);
    assert_eq!(bridge_client.get_locked_balance(&token_id), 1000);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")] // Unauthorized error
fn test_removed_system_wallet_cannot_mint() {
    let env = Env::default();
    env.mock_all_auths();

    let (_, bridge_client, token_id, _, _, owner, system_wallet, _) = setup_bridge_and_token(&env);

    // Remove the system wallet
    bridge_client.remove_system_wallet(&system_wallet, &owner);

    // Verify wallet was removed
    assert_eq!(bridge_client.is_system_wallet(&system_wallet), false);
    assert_eq!(bridge_client.get_system_wallet_count(), 0);

    // Attempt to mint should fail (will panic due to unauthorized)
    execute_bridge_op(
        &bridge_client, 3u32, &token_id.to_string(), &token_id.to_string(), 1000,
        &String::from_str(&env, "0x1234..."), &gen_address_str(&env),
        &String::from_str(&env, "eip155:1"), &String::from_str(&env, "stellar:testnet"),
        1001, &String::from_str(&env, "email@example.com"), &system_wallet
    );
}

#[test]
fn test_add_and_remove_system_wallets_workflow() {
    let env = Env::default();
    env.mock_all_auths();

    let (_, bridge_client, _, _, _, owner, initial_wallet, _) = setup_bridge_and_token(&env);

    // Initial state
    assert_eq!(bridge_client.get_system_wallet_count(), 1);
    assert_eq!(bridge_client.get_system_wallet(), initial_wallet);

    // Add multiple wallets
    let wallet2 = Address::generate(&env);
    let wallet3 = Address::generate(&env);
    let wallet4 = Address::generate(&env);

    bridge_client.add_system_wallet(&wallet2, &owner);
    bridge_client.add_system_wallet(&wallet3, &owner);
    bridge_client.add_system_wallet(&wallet4, &owner);

    assert_eq!(bridge_client.get_system_wallet_count(), 4);

    // Get all wallets
    let wallets = bridge_client.get_system_wallets();
    assert_eq!(wallets.len(), 4);

    // Remove some wallets
    bridge_client.remove_system_wallet(&wallet2, &owner);
    bridge_client.remove_system_wallet(&wallet4, &owner);

    assert_eq!(bridge_client.get_system_wallet_count(), 2);
    assert_eq!(bridge_client.is_system_wallet(&initial_wallet), true);
    assert_eq!(bridge_client.is_system_wallet(&wallet2), false);
    assert_eq!(bridge_client.is_system_wallet(&wallet3), true);
    assert_eq!(bridge_client.is_system_wallet(&wallet4), false);
}

// ============ Comprehensive User Flow Tests ============

#[test]
fn test_single_user_complete_lock_unlock_flow() {
    let env = Env::default();
    env.mock_all_auths();

    let test_env = TestEnvironment::new(&env);
    let user = Address::generate(&env);

    // Initial setup: User has 10,000 tokens on Stellar
    test_env.lock_unlock_token.stellar_asset_client.mint(&user, &10000);
    assert_eq!(test_env.lock_unlock_token.token_client.balance(&user), 10000);

    // Step 1: User locks 5,000 tokens to bridge to Ethereum
    test_env.lock_unlock_token.token_client.approve(&user, &test_env.bridge_id, &5000, &99999);
    execute_bridge_op(
        &test_env.bridge_client, 0u32, &test_env.lock_unlock_token.token_id.to_string(), &test_env.lock_unlock_token.token_id.to_string(), 5000,
        &user.to_string(), &String::from_str(&env, "0xUserEthAddress"),
        &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "eip155:1"),
        1002, &String::from_str(&env, "user@example.com"), &user
    );

    // Verify: User has 5,000 tokens left, bridge has 5,000 locked
    assert_eq!(test_env.lock_unlock_token.token_client.balance(&user), 5000);
    assert_eq!(test_env.lock_unlock_token.token_client.balance(&test_env.bridge_id), 5000);
    assert_eq!(test_env.bridge_client.get_locked_balance(&test_env.lock_unlock_token.token_id), 5000);

    // Step 2: User receives 5,000 tokens on Ethereum (simulated off-chain)
    // Step 3: User spends 2,000 tokens on Ethereum (simulated off-chain)
    // Step 4: User bridges back 3,000 tokens to Stellar

    execute_bridge_op(
        &test_env.bridge_client, 2u32, &test_env.lock_unlock_token.token_id.to_string(), &test_env.lock_unlock_token.token_id.to_string(), 3000,
        &String::from_str(&env, "0xUserEthAddress"), &user.to_string(),
        &String::from_str(&env, "eip155:1"), &String::from_str(&env, "stellar:testnet"),
        1003, &String::from_str(&env, "user@example.com"), &test_env.system_wallet
    );

    // Verify: User now has 8,000 tokens total (5,000 + 3,000)
    // Bridge has 2,000 tokens locked (5,000 - 3,000)
    assert_eq!(test_env.lock_unlock_token.token_client.balance(&user), 8000);
    assert_eq!(test_env.lock_unlock_token.token_client.balance(&test_env.bridge_id), 2000);
    assert_eq!(test_env.bridge_client.get_locked_balance(&test_env.lock_unlock_token.token_id), 2000);
}

#[test]
fn test_single_user_complete_mint_burn_flow() {
    let env = Env::default();
    env.mock_all_auths();

    let test_env = TestEnvironment::new(&env);
    let user = Address::generate(&env);

    // Initial setup: User has 10,000 tokens on Stellar
    test_env.mint_burn_token.stellar_asset_client.mint(&user, &10000);
    assert_eq!(test_env.mint_burn_token.token_client.balance(&user), 10000);

    // Approve bridge to burn tokens
    test_env.mint_burn_token.token_client.approve(&user, &test_env.bridge_id, &10000, &99999);

    // Step 1: User burns 6,000 tokens to bridge to Ethereum
    execute_bridge_op(
        &test_env.bridge_client, 1u32, &test_env.mint_burn_token.token_id.to_string(), &test_env.mint_burn_token.token_id.to_string(), 6000,
        &user.to_string(), &String::from_str(&env, "0xUserEthAddress"),
        &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "eip155:1"),
        1007, &String::from_str(&env, "user@example.com"), &user
    );

    // Verify: User has 4,000 tokens left (burned 6,000)
    assert_eq!(test_env.mint_burn_token.token_client.balance(&user), 4000);

    // Step 2: User receives 6,000 tokens on Ethereum (simulated off-chain)
    // Step 3: User spends 3,500 tokens on Ethereum (simulated off-chain)
    // Step 4: User bridges back 2,500 tokens to Stellar (minted)

    execute_bridge_op(
        &test_env.bridge_client, 3u32, &test_env.mint_burn_token.token_id.to_string(), &test_env.mint_burn_token.token_id.to_string(), 2500,
        &String::from_str(&env, "0xUserEthAddress"), &user.to_string(),
        &String::from_str(&env, "eip155:1"), &String::from_str(&env, "stellar:testnet"),
        1004, &String::from_str(&env, "user@example.com"), &test_env.system_wallet
    );

    // Verify: User now has 6,500 tokens total (4,000 + 2,500)
    assert_eq!(test_env.mint_burn_token.token_client.balance(&user), 6500);
}

// ============ Multi-User Flow Tests ============

#[test]
fn test_multi_user_lock_unlock_flow() {
    let env = Env::default();
    env.mock_all_auths();

    let test_env = TestEnvironment::new(&env);

    // Create 5 users
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let user3 = Address::generate(&env);
    let user4 = Address::generate(&env);
    let user5 = Address::generate(&env);

    // Give each user different amounts
    test_env.lock_unlock_token.stellar_asset_client.mint(&user1, &10000);
    test_env.lock_unlock_token.stellar_asset_client.mint(&user2, &20000);
    test_env.lock_unlock_token.stellar_asset_client.mint(&user3, &15000);
    test_env.lock_unlock_token.stellar_asset_client.mint(&user4, &25000);
    test_env.lock_unlock_token.stellar_asset_client.mint(&user5, &30000);

    // Each user locks different amounts
    test_env.lock_unlock_token.token_client.approve(&user1, &test_env.bridge_id, &5000, &99999);
    test_env.lock_unlock_token.token_client.approve(&user2, &test_env.bridge_id, &12000, &99999);
    test_env.lock_unlock_token.token_client.approve(&user3, &test_env.bridge_id, &8000, &99999);
    test_env.lock_unlock_token.token_client.approve(&user4, &test_env.bridge_id, &15000, &99999);
    test_env.lock_unlock_token.token_client.approve(&user5, &test_env.bridge_id, &20000, &99999);

    // User 1 locks 5,000
    execute_bridge_op(

        &test_env.bridge_client, 0u32, &test_env.lock_unlock_token.token_id.to_string(), &test_env.lock_unlock_token.token_id.to_string(), 5000,

        &user1.to_string(), &String::from_str(&env, "0xUser1"),

        &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "eip155:1"),

        1008, &String::from_str(&env, "user1@example.com"), &user1

    );

    // User 2 locks 12,000
    execute_bridge_op(

        &test_env.bridge_client, 0u32, &test_env.lock_unlock_token.token_id.to_string(), &test_env.lock_unlock_token.token_id.to_string(), 12000,

        &user2.to_string(), &String::from_str(&env, "0xUser2"),

        &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "eip155:1"),

        1009, &String::from_str(&env, "user2@example.com"), &user2

    );

    // User 3 locks 8,000
    execute_bridge_op(

        &test_env.bridge_client, 0u32, &test_env.lock_unlock_token.token_id.to_string(), &test_env.lock_unlock_token.token_id.to_string(), 8000,

        &user3.to_string(), &String::from_str(&env, "0xUser3"),

        &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "eip155:1"),

        1010, &String::from_str(&env, "user3@example.com"), &user3

    );

    // User 4 locks 15,000
    execute_bridge_op(
        
        &test_env.bridge_client, 0u32, &test_env.lock_unlock_token.token_id.to_string(), &test_env.lock_unlock_token.token_id.to_string(), 15000,

        &user4.to_string(), &String::from_str(&env, "0xUser4"),

        &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "eip155:1"),

        1011, &String::from_str(&env, "user4@example.com"), &user4

    );

    // User 5 locks 20,000
    execute_bridge_op(

        &test_env.bridge_client, 0u32, &test_env.lock_unlock_token.token_id.to_string(), &test_env.lock_unlock_token.token_id.to_string(), 20000,

        &user5.to_string(), &String::from_str(&env, "0xUser5"),

        &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "eip155:1"),

        1012, &String::from_str(&env, "user5@example.com"), &user5

    );

    // Verify total locked balance: 5,000 + 12,000 + 8,000 + 15,000 + 20,000 = 60,000
    assert_eq!(test_env.bridge_client.get_locked_balance(&test_env.lock_unlock_token.token_id), 60000);
    assert_eq!(test_env.lock_unlock_token.token_client.balance(&test_env.bridge_id), 60000);

    // Verify individual user balances
    assert_eq!(test_env.lock_unlock_token.token_client.balance(&user1), 5000);
    assert_eq!(test_env.lock_unlock_token.token_client.balance(&user2), 8000);
    assert_eq!(test_env.lock_unlock_token.token_client.balance(&user3), 7000);
    assert_eq!(test_env.lock_unlock_token.token_client.balance(&user4), 10000);
    assert_eq!(test_env.lock_unlock_token.token_client.balance(&user5), 10000);

    // Now users bridge back different amounts (simulating spending on destination chain)
    // User 1 bridges back 3,000 (spent 2,000)
    execute_bridge_op(
        &test_env.bridge_client, 2u32, &test_env.lock_unlock_token.token_id.to_string(), &test_env. lock_unlock_token.token_id.to_string(), 3000,
        &String::from_str(&env, "0xUser1"), &user1.to_string(),
        &String::from_str(&env, "eip155:1"), &String::from_str(&env, "stellar:testnet"),
        1013, &String::from_str(&env, "user1@example.com"), &test_env.system_wallet
    );

    // User 2 bridges back 10,000 (spent 2,000)
    execute_bridge_op(
        &test_env.bridge_client, 2u32, &test_env.lock_unlock_token.token_id.to_string(), &test_env.lock_unlock_token.token_id.to_string(), 10000,
        &String::from_str(&env, "0xUser2"), &user2.to_string(),
        &String::from_str(&env, "eip155:1"), &String::from_str(&env, "stellar:testnet"),
        1014, &String::from_str(&env, "user2@example.com"), &test_env.system_wallet
    );

    // User 3 bridges back 5,000 (spent 3,000)
    execute_bridge_op(
        &test_env.bridge_client, 2u32, &test_env.lock_unlock_token.token_id.to_string(), &test_env.lock_unlock_token.token_id.to_string(), 5000,
        &String::from_str(&env, "0xUser3"), &user3.to_string(),
        &String::from_str(&env, "eip155:1"), &String::from_str(&env, "stellar:testnet"),
        1015, &String::from_str(&env, "user3@example.com"), &test_env.system_wallet
    );

    // Verify vault still has sufficient balance for remaining users
    // Locked: 60,000 - 3,000 - 10,000 - 5,000 = 42,000
    assert_eq!(test_env.bridge_client.get_locked_balance(&test_env.lock_unlock_token.token_id), 42000);
    assert_eq!(test_env.lock_unlock_token.token_client.balance(&test_env.bridge_id), 42000);

    // Verify user balances after release
    assert_eq!(test_env.lock_unlock_token.token_client.balance(&user1), 8000);  // 5,000 + 3,000
    assert_eq!(test_env.lock_unlock_token.token_client.balance(&user2), 18000); // 8,000 + 10,000
    assert_eq!(test_env.lock_unlock_token.token_client.balance(&user3), 12000); // 7,000 + 5,000

    // User 4 and 5 can still withdraw their full amounts
    execute_bridge_op(
        &test_env.bridge_client, 2u32, &test_env.lock_unlock_token.token_id.to_string(), &test_env.lock_unlock_token.token_id.to_string(), 15000,
        &String::from_str(&env, "0xUser4"), &user4.to_string(),
        &String::from_str(&env, "eip155:1"), &String::from_str(&env, "stellar:testnet"),
        1016, &String::from_str(&env, "user4@example.com"), &test_env.system_wallet
    );

    execute_bridge_op(
        &test_env.bridge_client, 2u32, &test_env.lock_unlock_token.token_id.to_string(), &test_env.lock_unlock_token.token_id.to_string(), 20000,
        &String::from_str(&env, "0xUser5"), &user5.to_string(),
        &String::from_str(&env, "eip155:1"), &String::from_str(&env, "stellar:testnet"),
        1017, &String::from_str(&env, "user5@example.com"), &test_env.system_wallet
    );

    // Verify final state: all locked tokens released
    assert_eq!(test_env.bridge_client.get_locked_balance(&test_env.lock_unlock_token.token_id), 7000);
    assert_eq!(test_env.lock_unlock_token.token_client.balance(&test_env.bridge_id), 7000);

    // Verify final user balances
    assert_eq!(test_env.lock_unlock_token.token_client.balance(&user4), 25000); // 10,000 + 15,000
    assert_eq!(test_env.lock_unlock_token.token_client.balance(&user5), 30000); // 10,000 + 20,000
}

#[test]
fn test_multi_user_mint_burn_flow() {
    let env = Env::default();
    env.mock_all_auths();

    let test_env = TestEnvironment::new(&env);

    // Create 3 users
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let user3 = Address::generate(&env);

    // Give each user tokens
    test_env.mint_burn_token.stellar_asset_client.mint(&user1, &50000);
    test_env.mint_burn_token.stellar_asset_client.mint(&user2, &75000);
    test_env.mint_burn_token.stellar_asset_client.mint(&user3, &100000);

    // Approve bridge to burn
    test_env.mint_burn_token.token_client.approve(&user1, &test_env.bridge_id, &50000, &99999);
    test_env.mint_burn_token.token_client.approve(&user2, &test_env.bridge_id, &75000, &99999);
    test_env.mint_burn_token.token_client.approve(&user3, &test_env.bridge_id, &100000, &99999);

    // Users burn tokens to bridge out
    execute_bridge_op(
        &test_env.bridge_client, 1u32, &test_env.mint_burn_token.token_id.to_string(), &test_env.mint_burn_token.token_id.to_string(), 30000,
        &user1.to_string(), &String::from_str(&env, "0xUser1"),
        &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "eip155:1"),
        1018, &String::from_str(&env, "user1@example.com"), &user1
    );

    execute_bridge_op(


        &test_env.bridge_client, 1u32, &test_env.mint_burn_token.token_id.to_string(), &test_env.mint_burn_token.token_id.to_string(), 50000,


        &user2.to_string(), &String::from_str(&env, "0xUser2"),


        &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "eip155:1"),


        1019, &String::from_str(&env, "user2@example.com"), &user2


    );

    execute_bridge_op(


        &test_env.bridge_client, 1u32, &test_env.mint_burn_token.token_id.to_string(), &test_env.mint_burn_token.token_id.to_string(), 80000,


        &user3.to_string(), &String::from_str(&env, "0xUser3"),


        &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "eip155:1"),


        1020, &String::from_str(&env, "user3@example.com"), &user3


    );

    // Verify balances after burn
    assert_eq!(test_env.mint_burn_token.token_client.balance(&user1), 20000);
    assert_eq!(test_env.mint_burn_token.token_client.balance(&user2), 25000);
    assert_eq!(test_env.mint_burn_token.token_client.balance(&user3), 20000);

    // Users bridge back (mint) different amounts
    execute_bridge_op(
        &test_env.bridge_client, 3u32, &test_env.mint_burn_token.token_id.to_string(), &test_env.mint_burn_token.token_id.to_string(), 25000,
        &String::from_str(&env, "0xUser1"), &user1.to_string(),
        &String::from_str(&env, "eip155:1"), &String::from_str(&env, "stellar:testnet"),
        1021, &String::from_str(&env, "user1@example.com"), &test_env.system_wallet
    );

    execute_bridge_op(
        &test_env.bridge_client, 3u32, &test_env.mint_burn_token.token_id.to_string(), &test_env.mint_burn_token.token_id.to_string(), 40000,
        &String::from_str(&env, "0xUser2"), &user2.to_string(),
        &String::from_str(&env, "eip155:1"), &String::from_str(&env, "stellar:testnet"),
        1022, &String::from_str(&env, "user2@example.com"), &test_env.system_wallet
    );

    execute_bridge_op(
        &test_env.bridge_client, 3u32, &test_env.mint_burn_token.token_id.to_string(), &test_env.mint_burn_token.token_id.to_string(), 70000,
        &String::from_str(&env, "0xUser3"), &user3.to_string(),
        &String::from_str(&env, "eip155:1"), &String::from_str(&env, "stellar:testnet"),
        1023, &String::from_str(&env, "user3@example.com"), &test_env.system_wallet
    );

    // Verify final balances
    assert_eq!(test_env.mint_burn_token.token_client.balance(&user1), 45000);  // 20,000 + 25,000
    assert_eq!(test_env.mint_burn_token.token_client.balance(&user2), 65000);  // 25,000 + 40,000
    assert_eq!(test_env.mint_burn_token.token_client.balance(&user3), 90000);  // 20,000 + 70,000
}

// ============ Security Test Cases ============

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_double_spending_prevention_same_transaction_id() {
    let env = Env::default();
    env.mock_all_auths();

    let test_env = TestEnvironment::new(&env);
    let user = Address::generate(&env);

    test_env.lock_unlock_token.stellar_asset_client.mint(&user, &10000);
    test_env.lock_unlock_token.token_client.approve(&user, &test_env.bridge_id, &10000, &99999);

    let tx_id = 1029;

    // First lock succeeds
    execute_bridge_op(

        &test_env.bridge_client, 0u32, &test_env.lock_unlock_token.token_id.to_string(), &test_env.lock_unlock_token.token_id.to_string(), 5000,

        &user.to_string(), &String::from_str(&env, "0xUser"),

        &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "eip155:1"),

        tx_id, &String::from_str(&env, "user@example.com"), &user

    );

    // Second lock with same transaction ID should fail
    execute_bridge_op(

        &test_env.bridge_client, 0u32, &test_env.lock_unlock_token.token_id.to_string(), &test_env.lock_unlock_token.token_id.to_string(), 5000,

        &user.to_string(), &String::from_str(&env, "0xUser"),

        &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "eip155:1"),

        tx_id, &String::from_str(&env, "user@example.com"), &user

    );
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_double_spending_prevention_release_reuse() {
    let env = Env::default();
    env.mock_all_auths();

    let test_env = TestEnvironment::new(&env);
    let user = Address::generate(&env);

    // Lock tokens first
    test_env.lock_unlock_token.stellar_asset_client.mint(&user, &10000);
    test_env.lock_unlock_token.token_client.approve(&user, &test_env.bridge_id, &10000, &99999);
    execute_bridge_op(

        &test_env.bridge_client, 0u32, &test_env.lock_unlock_token.token_id.to_string(), &test_env.lock_unlock_token.token_id.to_string(), 10000,

        &user.to_string(), &String::from_str(&env, "0xUser"),

        &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "eip155:1"),

        1024, &String::from_str(&env, "user@example.com"), &user

    );

    let tx_id = 1030;

    // First release succeeds
    execute_bridge_op(
        &test_env.bridge_client, 2u32, &test_env.lock_unlock_token.token_id.to_string(), &test_env.lock_unlock_token.token_id.to_string(), 5000,
        &String::from_str(&env, "0xUser"), &user.to_string(),
        &String::from_str(&env, "eip155:1"), &String::from_str(&env, "stellar:testnet"),
        tx_id, &String::from_str(&env, "user@example.com"), &test_env.system_wallet
    );

    // Second release with same transaction ID should fail
    execute_bridge_op(
        &test_env.bridge_client, 2u32, &test_env.lock_unlock_token.token_id.to_string(), &test_env.lock_unlock_token.token_id.to_string(), 5000,
        &String::from_str(&env, "0xUser"), &user.to_string(),
        &String::from_str(&env, "eip155:1"), &String::from_str(&env, "stellar:testnet"),
        tx_id, &String::from_str(&env, "user@example.com"), &test_env.system_wallet
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn test_unauthorized_release_by_regular_user() {
    let env = Env::default();
    env.mock_all_auths();

    let test_env = TestEnvironment::new(&env);
    let user = Address::generate(&env);
    let attacker = Address::generate(&env);

    // Lock tokens first
    test_env.lock_unlock_token.stellar_asset_client.mint(&user, &10000);
    test_env.lock_unlock_token.token_client.approve(&user, &test_env.bridge_id, &10000, &99999);
    execute_bridge_op(

        &test_env.bridge_client, 0u32, &test_env.lock_unlock_token.token_id.to_string(), &test_env.lock_unlock_token.token_id.to_string(), 10000,

        &user.to_string(), &String::from_str(&env, "0xUser"),

        &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "eip155:1"),

        1024, &String::from_str(&env, "user@example.com"), &user

    );

    // Attacker tries to release tokens (should fail - not system wallet)
    execute_bridge_op(

        &test_env.bridge_client, 2u32, &test_env.lock_unlock_token.token_id.to_string(), &test_env.lock_unlock_token.token_id.to_string(), 5000,

        &String::from_str(&env, "0xUser"), &attacker.to_string(),

        &String::from_str(&env, "eip155:1"), &String::from_str(&env, "stellar:testnet"),

        1025, &String::from_str(&env, "attacker@example.com"), &attacker

    );
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn test_unauthorized_mint_by_regular_user() {
    let env = Env::default();
    env.mock_all_auths();

    let test_env = TestEnvironment::new(&env);
    let attacker = Address::generate(&env);

    // Attacker tries to mint tokens (should fail - not system wallet)
    execute_bridge_op(

        &test_env.bridge_client, 3u32, &test_env.mint_burn_token.token_id.to_string(), &test_env.mint_burn_token.token_id.to_string(), 1000000,

        &String::from_str(&env, "0xAttacker"), &attacker.to_string(),

        &String::from_str(&env, "eip155:1"), &String::from_str(&env, "stellar:testnet"),

        1026, &String::from_str(&env, "attacker@example.com"), &attacker

    );
}

#[test]
#[should_panic(expected = "Error(Contract, #12)")]
fn test_insufficient_locked_balance_protection() {
    let env = Env::default();
    env.mock_all_auths();

    let test_env = TestEnvironment::new(&env);
    let user = Address::generate(&env);

    // Lock only 5,000 tokens
    test_env.lock_unlock_token.stellar_asset_client.mint(&user, &10000);
    test_env.lock_unlock_token.token_client.approve(&user, &test_env.bridge_id, &5000, &99999);
    execute_bridge_op(

        &test_env.bridge_client, 0u32, &test_env.lock_unlock_token.token_id.to_string(), &test_env.lock_unlock_token.token_id.to_string(), 5000,

        &user.to_string(), &String::from_str(&env, "0xUser"),

        &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "eip155:1"),

        1024, &String::from_str(&env, "user@example.com"), &user

    );

    // Try to release more than locked (should fail)
    execute_bridge_op(
        &test_env.bridge_client, 2u32, &test_env.lock_unlock_token.token_id.to_string(), &test_env.lock_unlock_token.token_id.to_string(), 10000,
        &String::from_str(&env, "0xUser"), &user.to_string(),
        &String::from_str(&env, "eip155:1"), &String::from_str(&env, "stellar:testnet"),
        1027, &String::from_str(&env, "user@example.com"), &test_env.system_wallet
    );
}

#[test]
fn test_paused_contract_allows_unpause() {
    let env = Env::default();
    env.mock_all_auths();

    let test_env = TestEnvironment::new(&env);
    let user = Address::generate(&env);

    // Setup: mint tokens to user
    test_env.lock_unlock_token.stellar_asset_client.mint(&user, &10000);
    test_env.lock_unlock_token.token_client.approve(&user, &test_env.bridge_id, &10000, &99999);

    // Pause the contract
    test_env.bridge_client.pause(&test_env.owner);
    assert_eq!(test_env.bridge_client.paused(), true);

    // Unpause and verify operations work again
    test_env.bridge_client.unpause(&test_env.owner);
    assert_eq!(test_env.bridge_client.paused(), false);

    // Now lock should work
    execute_bridge_op(

        &test_env.bridge_client, 0u32, &test_env.lock_unlock_token.token_id.to_string(), &test_env.lock_unlock_token.token_id.to_string(), 5000,

        &user.to_string(), &String::from_str(&env, "0xUser"),

        &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "eip155:1"),

        1024, &String::from_str(&env, "user@example.com"), &user

    );

    assert_eq!(test_env.lock_unlock_token.token_client.balance(&user), 5000);
    assert_eq!(test_env.bridge_client.get_locked_balance(&test_env.lock_unlock_token.token_id), 5000);
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_transaction_id_isolation_across_operations() {
    let env = Env::default();
    env.mock_all_auths();

    let test_env = TestEnvironment::new(&env);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    // Setup tokens
    test_env.lock_unlock_token.stellar_asset_client.mint(&user1, &10000);
    test_env.lock_unlock_token.token_client.approve(&user1, &test_env.bridge_id, &10000, &99999);
    test_env.mint_burn_token.stellar_asset_client.mint(&user2, &10000);
    test_env.mint_burn_token.token_client.approve(&user2, &test_env.bridge_id, &10000, &99999);

    let tx_id: i128 = 9999;

    // User1 locks with transaction ID
    execute_bridge_op(

        &test_env.bridge_client, 0u32, &test_env.lock_unlock_token.token_id.to_string(), &test_env.lock_unlock_token.token_id.to_string(), 5000,

        &user1.to_string(), &String::from_str(&env, "0xUser1"),

        &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "eip155:1"),

        tx_id, &String::from_str(&env, "user1@example.com"), &user1

    );

    // User2 tries to burn with same transaction ID (should fail)
    execute_bridge_op(

        &test_env.bridge_client, 1u32, &test_env.mint_burn_token.token_id.to_string(), &test_env.mint_burn_token.token_id.to_string(), 5000,

        &user2.to_string(), &String::from_str(&env, "0xUser2"),

        &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "eip155:1"),

        tx_id, &String::from_str(&env, "user2@example.com"), &user2

    );
}

// ============ Missing Critical Tests ============

#[test]
#[should_panic(expected = "Error(Contract, #2)")] // TransactionIdAlreadyUsed
fn test_txid_global_scope_different_users_cannot_reuse() {
    let env = Env::default();
    env.mock_all_auths();

    let test_env = TestEnvironment::new(&env);

    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    // Mint tokens to both users
    test_env.lock_unlock_token.stellar_asset_client.mint(&user1, &10000);
    test_env.lock_unlock_token.stellar_asset_client.mint(&user2, &10000);

    let tx_id: i128 = 7777;

    // User1 locks with transaction ID
    execute_bridge_op(
        &test_env.bridge_client, 0u32, &test_env.lock_unlock_token.token_id.to_string(),
        &test_env.lock_unlock_token.token_id.to_string(), 5000,
        &user1.to_string(), &String::from_str(&env, "0xUser1"),
        &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "eip155:1"),
        tx_id, &String::from_str(&env, "user1@example.com"), &user1
    );

    // Verify transaction ID is marked as used
    assert_eq!(test_env.bridge_client.is_transaction_used(&tx_id), true);

    // User2 tries to lock with same transaction ID (should fail - global scope)
    execute_bridge_op(
        &test_env.bridge_client, 0u32, &test_env.lock_unlock_token.token_id.to_string(),
        &test_env.lock_unlock_token.token_id.to_string(), 3000,
        &user2.to_string(), &String::from_str(&env, "0xUser2"),
        &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "eip155:1"),
        tx_id, &String::from_str(&env, "user2@example.com"), &user2
    );
}

#[test]
fn test_txid_global_uniqueness_across_all_users() {
    let env = Env::default();
    env.mock_all_auths();

    let test_env = TestEnvironment::new(&env);

    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let user3 = Address::generate(&env);

    // Mint tokens to all users
    test_env.lock_unlock_token.stellar_asset_client.mint(&user1, &10000);
    test_env.lock_unlock_token.stellar_asset_client.mint(&user2, &10000);
    test_env.lock_unlock_token.stellar_asset_client.mint(&user3, &10000);

    let tx_id_1: i128 = 8881;
    let tx_id_2: i128 = 8882;
    let tx_id_3: i128 = 8883;

    // User1 uses transaction ID
    execute_bridge_op(
        &test_env.bridge_client, 0u32, &test_env.lock_unlock_token.token_id.to_string(),
        &test_env.lock_unlock_token.token_id.to_string(), 1000,
        &user1.to_string(), &String::from_str(&env, "0xUser1"),
        &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "eip155:1"),
        tx_id_1, &String::from_str(&env, "user1@example.com"), &user1
    );

    // User2 uses different TX ID (should succeed)
    execute_bridge_op(
        &test_env.bridge_client, 0u32, &test_env.lock_unlock_token.token_id.to_string(),
        &test_env.lock_unlock_token.token_id.to_string(), 2000,
        &user2.to_string(), &String::from_str(&env, "0xUser2"),
        &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "eip155:1"),
        tx_id_2, &String::from_str(&env, "user2@example.com"), &user2
    );

    // User3 uses different TX ID (should succeed)
    execute_bridge_op(
        &test_env.bridge_client, 0u32, &test_env.lock_unlock_token.token_id.to_string(),
        &test_env.lock_unlock_token.token_id.to_string(), 3000,
        &user3.to_string(), &String::from_str(&env, "0xUser3"),
        &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "eip155:1"),
        tx_id_3, &String::from_str(&env, "user3@example.com"), &user3
    );

    // Verify all TX IDs are marked as used globally
    assert_eq!(test_env.bridge_client.is_transaction_used(&tx_id_1), true);
    assert_eq!(test_env.bridge_client.is_transaction_used(&tx_id_2), true);
    assert_eq!(test_env.bridge_client.is_transaction_used(&tx_id_3), true);
}

#[test]
#[should_panic(expected = "Error(Contract, #10)")] // Token contract error for insufficient balance
fn test_lock_fails_with_insufficient_user_balance() {
    let env = Env::default();
    env.mock_all_auths();

    let (_, bridge_client, token_id, _, stellar_asset_client, _, _, _) =
        setup_bridge_and_token(&env);

    let user = Address::generate(&env);

    // Mint only 100 tokens to user
    stellar_asset_client.mint(&user, &100);

    // Try to lock 1000 tokens (more than user has) - should fail
    execute_bridge_op(
        &bridge_client, 0u32, &token_id.to_string(), &token_id.to_string(), 1000,
        &user.to_string(), &String::from_str(&env, "0xRecipient"),
        &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "eip155:1"),
        9001, &String::from_str(&env, "user@example.com"), &user
    );
}

#[test]
fn test_concurrent_lock_operations_maintain_correct_balance() {
    let env = Env::default();
    env.mock_all_auths();

    let test_env = TestEnvironment::new(&env);

    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let user3 = Address::generate(&env);

    // Mint tokens to all users
    test_env.lock_unlock_token.stellar_asset_client.mint(&user1, &10000);
    test_env.lock_unlock_token.stellar_asset_client.mint(&user2, &20000);
    test_env.lock_unlock_token.stellar_asset_client.mint(&user3, &15000);

    let initial_locked = test_env.bridge_client.get_locked_balance(&test_env.lock_unlock_token.token_id);

    // User1 locks 5000
    execute_bridge_op(
        &test_env.bridge_client, 0u32, &test_env.lock_unlock_token.token_id.to_string(),
        &test_env.lock_unlock_token.token_id.to_string(), 5000,
        &user1.to_string(), &String::from_str(&env, "0xUser1"),
        &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "eip155:1"),
        5001, &String::from_str(&env, "user1@example.com"), &user1
    );

    // User2 locks 12000
    execute_bridge_op(
        &test_env.bridge_client, 0u32, &test_env.lock_unlock_token.token_id.to_string(),
        &test_env.lock_unlock_token.token_id.to_string(), 12000,
        &user2.to_string(), &String::from_str(&env, "0xUser2"),
        &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "eip155:1"),
        5002, &String::from_str(&env, "user2@example.com"), &user2
    );

    // User3 locks 8000
    execute_bridge_op(
        &test_env.bridge_client, 0u32, &test_env.lock_unlock_token.token_id.to_string(),
        &test_env.lock_unlock_token.token_id.to_string(), 8000,
        &user3.to_string(), &String::from_str(&env, "0xUser3"),
        &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "eip155:1"),
        5003, &String::from_str(&env, "user3@example.com"), &user3
    );

    // Verify total locked balance is correct (5000 + 12000 + 8000 = 25000)
    let final_locked = test_env.bridge_client.get_locked_balance(&test_env.lock_unlock_token.token_id);
    assert_eq!(final_locked, initial_locked + 25000);

    // Verify individual user balances
    assert_eq!(test_env.lock_unlock_token.token_client.balance(&user1), 5000);
    assert_eq!(test_env.lock_unlock_token.token_client.balance(&user2), 8000);
    assert_eq!(test_env.lock_unlock_token.token_client.balance(&user3), 7000);

    // Verify bridge contract has the locked tokens
    assert_eq!(test_env.lock_unlock_token.token_client.balance(&test_env.bridge_id), final_locked);
}

#[test]
fn test_locked_balance_accurate_with_concurrent_lock_and_release() {
    let env = Env::default();
    env.mock_all_auths();

    let test_env = TestEnvironment::new(&env);

    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    // Mint tokens to users
    test_env.lock_unlock_token.stellar_asset_client.mint(&user1, &20000);
    test_env.lock_unlock_token.stellar_asset_client.mint(&user2, &20000);

    // User1 locks 10000
    execute_bridge_op(
        &test_env.bridge_client, 0u32, &test_env.lock_unlock_token.token_id.to_string(),
        &test_env.lock_unlock_token.token_id.to_string(), 10000,
        &user1.to_string(), &String::from_str(&env, "0xUser1"),
        &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "eip155:1"),
        6001, &String::from_str(&env, "user1@example.com"), &user1
    );

    let locked_after_first = test_env.bridge_client.get_locked_balance(&test_env.lock_unlock_token.token_id);
    assert_eq!(locked_after_first, 10000);

    // User2 locks 15000
    execute_bridge_op(
        &test_env.bridge_client, 0u32, &test_env.lock_unlock_token.token_id.to_string(),
        &test_env.lock_unlock_token.token_id.to_string(), 15000,
        &user2.to_string(), &String::from_str(&env, "0xUser2"),
        &String::from_str(&env, "stellar:testnet"), &String::from_str(&env, "eip155:1"),
        6002, &String::from_str(&env, "user2@example.com"), &user2
    );

    let locked_after_second = test_env.bridge_client.get_locked_balance(&test_env.lock_unlock_token.token_id);
    assert_eq!(locked_after_second, 25000);

    // System wallet releases 7000 to user1
    execute_bridge_op(
        &test_env.bridge_client, 2u32, &test_env.lock_unlock_token.token_id.to_string(),
        &test_env.lock_unlock_token.token_id.to_string(), 7000,
        &String::from_str(&env, "0xUser1"), &user1.to_string(),
        &String::from_str(&env, "eip155:1"), &String::from_str(&env, "stellar:testnet"),
        6003, &String::from_str(&env, "user1@example.com"), &test_env.system_wallet
    );

    let locked_after_release = test_env.bridge_client.get_locked_balance(&test_env.lock_unlock_token.token_id);
    assert_eq!(locked_after_release, 18000); // 25000 - 7000

    // Verify accounting invariant: locked balance <= total bridge balance
    let bridge_balance = test_env.lock_unlock_token.token_client.balance(&test_env.bridge_id);
    assert!(locked_after_release <= bridge_balance, "Locked balance should never exceed total bridge balance");
}

