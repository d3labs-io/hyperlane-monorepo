#![cfg(test)]
//! # Shared Test Utilities
//!
//! This module provides common test fixtures, helpers, and utilities
//! used across all test files to eliminate duplication and improve
//! test readability.

// Include all test modules
mod foundation_tests {
    include!("01_foundation_tests.rs");
}

mod bridge_operations_tests {
    include!("02_bridge_operations_tests.rs");
}

mod security_critical_tests {
    include!("03_security_critical_tests.rs");
}

mod advanced_scenarios_tests {
    include!("04_advanced_scenarios_tests.rs");
}

mod overflow_underflow_tests {
    include!("05_overflow_underflow_tests.rs");
}

mod ttl_resurrection_tests {
    include!("06_ttl_resurrection_tests.rs");
}

use crate::*;
use soroban_sdk::{
    log,
    testutils::Address as _,
    token::{StellarAssetClient, TokenClient},
    Address, Env, String,
};

// ============ Test Fixtures ============

/// Test fixture for a token using Lock/Unlock mechanism
pub struct LockUnlockToken {
    pub token_id: Address,
    pub token_client: TokenClient<'static>,
    pub stellar_asset_client: StellarAssetClient<'static>,
}

/// Test fixture for a token using Mint/Burn mechanism
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
        let owner = Address::generate(&env);
        let system_wallet = Address::generate(&env);
        let current_chain_id = String::from_str(&env, "stellar:testnet");

        log!(&env, "owner: {:?}", owner.clone());
        log!(&env, "system_wallet: {:?}", system_wallet.clone());

        let bridge_id = env.register(
            TokenBridge,
            (owner.clone(), system_wallet.clone(), current_chain_id),
        );
        let bridge_client = TokenBridgeClient::new(&env, &bridge_id);

        let lock_unlock_asset_admin = Address::generate(&env);
        let lock_unlock_contract =
            env.register_stellar_asset_contract_v2(lock_unlock_asset_admin.clone());
        let lock_unlock_token_id = lock_unlock_contract.address();
        let lock_unlock_token_client = TokenClient::new(&env, &lock_unlock_token_id);
        let lock_unlock_stellar_client = StellarAssetClient::new(&env, &lock_unlock_token_id);

        let mint_burn_asset_admin = Address::generate(&env);
        let mint_burn_contract =
            env.register_stellar_asset_contract_v2(mint_burn_asset_admin.clone());
        let mint_burn_token_id = mint_burn_contract.address();
        let mint_burn_token_client = TokenClient::new(&env, &mint_burn_token_id);
        let mint_burn_stellar_client = StellarAssetClient::new(&env, &mint_burn_token_id);

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

// ============ Helper Functions ============

/// Helper function to set up a complete test environment with bridge and token
pub fn setup_bridge_and_token(
    env: &Env,
) -> (
    Address,                     // bridge_id
    TokenBridgeClient<'static>,  // bridge_client
    Address,                     // token_id
    TokenClient<'static>,        // token_client
    StellarAssetClient<'static>, // stellar_asset_client
    Address,                     // owner
    Address,                     // system_wallet
    Address,                     // asset_admin
) {
    let owner = Address::generate(&env);
    let system_wallet = Address::generate(&env);
    let current_chain_id = String::from_str(&env, "stellar:testnet");

    log!(&env, "owner: {:?}", owner.clone());
    log!(&env, "system_wallet: {:?}", system_wallet.clone());

    let bridge_id = env.register(
        TokenBridge,
        (owner.clone(), system_wallet.clone(), current_chain_id),
    );
    let bridge_client = TokenBridgeClient::new(&env, &bridge_id);

    let asset_admin = Address::generate(&env);
    let token_contract = env.register_stellar_asset_contract_v2(asset_admin.clone());
    let token_id = token_contract.address();

    let token_client = TokenClient::new(&env, &token_id);
    let stellar_asset_client = StellarAssetClient::new(&env, &token_id);

    stellar_asset_client.set_admin(&bridge_id);

    (
        bridge_id,
        bridge_client,
        token_id,
        token_client,
        stellar_asset_client,
        owner,
        system_wallet,
        asset_admin,
    )
}

/// Helper function to generate a valid Stellar address string for testing
pub fn gen_address_str(env: &Env) -> String {
    Address::generate(env).to_string()
}

/// Helper function to execute bridge operation
#[allow(clippy::too_many_arguments)]
pub fn execute_bridge_op(
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

pub fn extend_ttl(bridge_client: &TokenBridgeClient, threshold: u32, extend_to: u32, key: DataKey) {
    bridge_client.extend_ttl(&threshold, &extend_to, &key);
}

// ============ Constants ============

pub const INITIAL_USER_BALANCE: i128 = 10_000;
pub const BRIDGE_TRANSFER_AMOUNT: i128 = 5_000;
pub const EXPECTED_REMAINING_BALANCE: i128 = 5_000;
pub const CHAIN_ID: &str = "stellar:testnet";
pub const OPERATION_LOCK: u32 = 0;
pub const OPERATION_BURN: u32 = 1;
pub const OPERATION_RELEASE: u32 = 2;
pub const OPERATION_MINT: u32 = 3;
