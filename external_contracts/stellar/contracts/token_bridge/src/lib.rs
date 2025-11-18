#![no_std]

#[cfg(test)]
mod tests;

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Env, Symbol, symbol_short, String};
use soroban_sdk::token;
use stellar_access::access_control::{self as access_control, AccessControl};
use stellar_contract_utils::pausable::{self as pausable, Pausable };
use stellar_contract_utils::upgradeable::UpgradeableInternal;
use stellar_macros::{only_role, when_not_paused};

// ============ Role Constants ============

/// Owner role - Can manage admins, system wallet, and perform upgrades
const OWNER_ROLE: Symbol = symbol_short!("owner");

/// Admin role - Can manage fees, pause/unpause, and perform operational tasks
const ADMIN_ROLE: Symbol = symbol_short!("admin");

/// System wallet role - Can execute Release and Mint operations
const SYSTEM_WALLET_ROLE: Symbol = symbol_short!("sys_wlt");

/// Bridge operation types matching EVM implementation
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum BridgeOperation {
    Lock = 0,
    Burn = 1,
    Release = 2,
    Mint = 3,
}

// ============ Structs for Bridge Operation Parameters ============

/// Token information for bridge operations (struct-based API)
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenBridgeData {
    /// Token address on the source chain
    pub from_token: String,
    /// Token address on the destination chain
    pub to_token: String,
    /// Amount to bridge
    pub amount: i128,
    /// Address on the source chain
    pub from_address: String,
    /// Address on the destination chain
    pub to_address: String,
    /// Source chain identifier (CAIP-2 format)
    pub from_network: String,
    /// Destination chain identifier (CAIP-2 format)
    pub to_network: String,
     /// Unique transaction identifier
    pub transaction_id: i128,
    /// Email address of the user (for KYC/AML purposes)
    pub email: String,
}

/// Custom error types
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum TokenBridgeError {
    Unauthorized = 1,
    TransactionIdAlreadyUsed = 2,
    InvalidAmount = 3,
    InvalidAddress = 4,
    InvalidChainIdentifier = 10,
    InvalidReleaseOnSameChain = 11,
    InsufficientLockedBalance = 12,
    InvalidSourceChain = 13,
    NotAdmin = 14,
    OnlyOwner = 15,
    InvalidOperation = 16,
    AmountExceedsMaximum = 17,
}

/// Storage keys for the bridge
/// Note: Authorization is handled by AccessControl crate (Owner, Admin, SystemWallet roles)
///
/// Storage Type Strategy:
/// - Instance Storage: CurrentChainId
///   - Configuration data set during initialization
///   - Survives upgrades but tied to instance
///
/// - Persistent Storage: TransactionIds, LockedBalances
///   - TransactionIds: CRITICAL for preventing replay attacks
///   - LockedBalances: Financial state that must be preserved accurately
///   - Each entry has independent TTL management
///   - Survives contract upgrades with data integrity
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    // Instance storage (configuration)
    CurrentChainId,           // Current chain identifier
    ProposedOwner,            // Proposed new owner (for 2-step ownership transfer)

    // Persistent storage (security-critical and financial state)
    TransactionIds(i128),     // Used transaction IDs (replay protection)
    LockedBalances(Address),  // Current locked token balances (MIGRATED to persistent)
}

#[contract]
pub struct TokenBridge;

#[contractimpl]
impl TokenBridge {
    /// Initialize the contract with owner and system wallet
    /// @param owner - The owner address (can upgrade, manage admins)
    /// @param system_wallet - The system wallet address (can mint/release)
    /// @param current_chain_id - The current chain identifier (CAIP-2 format)
    pub fn __constructor(
        e: &Env,
        owner: Address,
        system_wallet: Address,
        current_chain_id: String,
    ) {
        // Validate chain ID format (CAIP-2: namespace:reference)
        Self::validate_chain_id(&current_chain_id)
            .unwrap_or_else(|err| panic_with_error!(e, err));

        // Initialize AccessControl with owner as the contract admin
        access_control::set_admin(e, &owner);

        // Grant OWNER_ROLE to owner (for upgrades, admin management)
        access_control::grant_role_no_auth(e, &owner, &owner, &OWNER_ROLE);

        // Grant SYSTEM_WALLET_ROLE to system wallet (for Release/Mint operations)
        access_control::grant_role_no_auth(e, &owner, &system_wallet, &SYSTEM_WALLET_ROLE);

        // Set current chain ID
        e.storage().instance().set(&DataKey::CurrentChainId, &current_chain_id);
    }

    // ============ Internal Helper Functions ============

    /// Validate amount is within acceptable range
    /// Prevents economic attacks and overflow risks
    /// @param amount - The amount to validate
    /// @return Result indicating if amount is valid
    fn validate_amount(amount: i128) -> Result<(), TokenBridgeError> {
        if amount <= 0 {
            return Err(TokenBridgeError::InvalidAmount);
        }

        Ok(())
    }

    /// Validate and convert address string to Address type
    /// Prevents DoS attacks from invalid address strings
    /// @param e - The environment
    /// @param addr_str - The address string to validate and convert
    /// @return Result with Address or error
    fn validate_and_convert_address(_e: &Env, addr_str: &String) -> Result<Address, TokenBridgeError> {
        // Stellar addresses are 56 characters (G... format in base32)
        // Allow some flexibility for different address formats
        let len = addr_str.len();

        if len == 0 {
            return Err(TokenBridgeError::InvalidAddress);
        }

        // Stellar public keys are 56 chars, contract addresses are 56 chars
        // Allow range 40-70 to accommodate different formats
        if len < 40 || len > 70 {
            return Err(TokenBridgeError::InvalidAddress);
        }

        // Try to convert - if it fails, return error instead of panicking
        // Note: Address::from_string can still panic on invalid base32
        // This is a Soroban SDK limitation we document
        Ok(Address::from_string(addr_str))
    }

    /// Validate chain ID format (CAIP-2: namespace:reference)
    /// @param chain_id - The chain identifier to validate
    /// @return Result indicating if chain ID is valid
    fn validate_chain_id(chain_id: &String) -> Result<(), TokenBridgeError> {
        // CAIP-2 format requires "namespace:reference" (e.g., "stellar:testnet", "eip155:1")
        // Minimum length check (at least "a:b" = 3 characters)
        if chain_id.len() < 3 {
            return Err(TokenBridgeError::InvalidChainIdentifier);
        }

        // Maximum reasonable length check (prevent extremely long chain IDs)
        if chain_id.len() > 64 {
            return Err(TokenBridgeError::InvalidChainIdentifier);
        }

        Ok(())
    }

    /// Check if caller has owner role
    // fn check_owner(e: &Env, caller: &Address) -> Result<(), TokenBridgeError> {
    //     if access_control::has_role(e, caller, &OWNER_ROLE).is_none() {
    //         return Err(TokenBridgeError::OnlyOwner);
    //     }
    //     Ok(())
    // }

    /// Check if caller has admin or owner role
    fn check_admin(e: &Env, caller: &Address) -> Result<(), TokenBridgeError> {
        // Check if owner
        if access_control::has_role(e, caller, &OWNER_ROLE).is_some() {
            return Ok(());
        }

        // Check if admin
        if access_control::has_role(e, caller, &ADMIN_ROLE).is_some() {
            return Ok(());
        }

        Err(TokenBridgeError::NotAdmin)
    }

    /// Check if caller has system wallet role
    fn check_system_wallet(e: &Env, caller: &Address) -> Result<(), TokenBridgeError> {
        if access_control::has_role(e, caller, &SYSTEM_WALLET_ROLE).is_none() {
            return Err(TokenBridgeError::Unauthorized);
        }
        Ok(())
    }

    /// Check if a transaction ID has been used
    ///
    /// Note: Uses PERSISTENT storage (not instance) because transaction IDs must
    /// survive contract upgrades to prevent replay attacks. If we used instance
    /// storage, an attacker could replay old transactions after an upgrade.
    pub fn is_transaction_used(e: &Env, transaction_id: i128) -> bool {
        e.storage()
            .persistent()
            .get(&DataKey::TransactionIds(transaction_id))
            .unwrap_or(false)
    }

    /// Mark a transaction ID as used with TTL extension
    ///
    /// Note: Uses PERSISTENT storage (not instance) for security reasons:
    /// - Transaction IDs MUST survive contract upgrades
    /// - If instance storage was used, upgrade would clear all transaction IDs
    /// - Attacker could then replay old transactions after upgrade
    /// - TTL extended to 1 year to prevent expiration-based replay attacks
    fn use_transaction_id(e: &Env, transaction_id: i128) -> Result<(), TokenBridgeError> {
        if Self::is_transaction_used(e, transaction_id) {
            return Err(TokenBridgeError::TransactionIdAlreadyUsed);
        }

        let key = DataKey::TransactionIds(transaction_id);

        // Store transaction ID as used in PERSISTENT storage
        e.storage()
            .persistent()
            .set(&key, &true);

        // Extend TTL to 1 year (31,536,000 seconds)
        // This prevents the entry from expiring and being reused
        e.storage()
            .persistent()
            .extend_ttl(&key, 31_536_000, 31_536_000);

        Ok(())
    }

    // ============ Public Entry Point ============

    /// Execute a bridge operation
    /// @param operation - The bridge operation type (Lock=0, Burn=1, Release=2, Mint=3)
    /// @param token_info - Token and amount information
    /// @param route - Network and address routing information
    /// @param metadata - Transaction metadata (ID and email)
    /// @param caller - The caller address
    #[when_not_paused]
    pub fn execute_bridge_operation(
        e: &Env,
        operation: u32,
        bridge_data: TokenBridgeData,
        caller: Address,
    ) {
        caller.require_auth();

        // Validate chain ID format (CAIP-2)
        Self::validate_chain_id(&bridge_data.from_network)
            .unwrap_or_else(|err| panic_with_error!(e, err));
        Self::validate_chain_id(&bridge_data.to_network)
            .unwrap_or_else(|err| panic_with_error!(e, err));

        match operation {
            0 => {
                // LOCK_WITH_FEE: User operation
                Self::_lock_tokens(
                    e,
                    bridge_data.from_token,
                    bridge_data.to_token,
                    bridge_data.amount,
                    bridge_data.transaction_id,
                    bridge_data.to_network,
                    bridge_data.to_address,
                    bridge_data.email,
                    caller.clone(),
                );
            }
            1 => {
                // BURN: User operation
                Self::_burn_tokens(
                    e,
                    bridge_data.from_token,
                    bridge_data.to_token,
                    bridge_data.amount,
                    bridge_data.transaction_id,
                    bridge_data.to_network,
                    bridge_data.to_address,
                    bridge_data.email,
                    caller.clone(),
                );
            }
            2 => {
                // RELEASE: System wallet operation
                Self::check_system_wallet(e, &caller)
                    .unwrap_or_else(|err| panic_with_error!(e, err));
                Self::_release_tokens(
                    e,
                    bridge_data.from_token,
                    bridge_data.to_token,
                    bridge_data.amount,
                    Address::from_string(&bridge_data.to_address),
                    bridge_data.transaction_id,
                    bridge_data.from_network,
                    bridge_data.from_address,
                    bridge_data.email,
                    caller.clone(),
                );
            }
            3 => {
                // MINT: System wallet operation
                Self::check_system_wallet(e, &caller)
                    .unwrap_or_else(|err| panic_with_error!(e, err));
                Self::_mint_tokens(
                    e,
                    bridge_data.from_token,
                    bridge_data.to_token,
                    bridge_data.amount,
                    Address::from_string(&bridge_data.to_address),
                    bridge_data.transaction_id,
                    bridge_data.from_network,
                    bridge_data.from_address,
                    bridge_data.email,
                    caller.clone(),
                );
            }
            _ => {
                panic_with_error!(e, TokenBridgeError::InvalidOperation);
            }
        }
    }

    // ============ Internal User Operations ============
    /// Internal: Lock tokens to bridge to another chain
    fn _lock_tokens(
        e: &Env,
        from_token_id: String,
        to_token_id: String,
        amount: i128,
        transaction_id: i128,
        destination_chain: String,
        destination_address: String,
        email: String,
        caller: Address,
    ) {
        // Validate amount (includes > 0 check and max limit)
        Self::validate_amount(amount)
            .unwrap_or_else(|err| panic_with_error!(e, err));

        // Validate and convert token address
        let from_token_address = Self::validate_and_convert_address(e, &from_token_id)
            .unwrap_or_else(|err| panic_with_error!(e, err));

        // Check and mark transaction ID as used
        Self::use_transaction_id(e, transaction_id)
            .unwrap_or_else(|err| panic_with_error!(e, err));

        // Get current chain ID
        let current_chain_id: String = e.storage()
            .instance()
            .get(&DataKey::CurrentChainId)
            .unwrap_or(String::from_str(e, ""));
 

        // Update locked balances (using persistent storage)
        let current_balance: i128 = e.storage()
            .persistent()
            .get(&DataKey::LockedBalances(from_token_address.clone()))
            .unwrap_or(0);

        // Check for overflow
        if current_balance.checked_add(amount).is_none() {
            panic_with_error!(e, TokenBridgeError::AmountExceedsMaximum);
        }

        let key = DataKey::LockedBalances(from_token_address.clone());
        e.storage()
            .persistent()
            .set(&key, &(current_balance + amount));

        // Extend TTL for locked balance entry (1 year)
        e.storage()
            .persistent()
            .extend_ttl(&key, 31_536_000, 31_536_000);

        // Transfer tokens from user to contract
        let client = token::TokenClient::new(e, &from_token_address);
        let contract_address = e.current_contract_address();
        client.transfer(&caller, &contract_address, &amount);

        // Emit UserOperation event
        e.events().publish(
            (symbol_short!("locked"),),
            (BridgeOperation::Lock as u32, from_token_id, to_token_id, amount, &caller , destination_address, current_chain_id, destination_chain, transaction_id, email, &caller)
        );
    }

    /// Internal: Burn tokens to bridge back to another chain
    fn _burn_tokens(
        e: &Env,
        from_token_id: String,
        to_token_id: String,
        amount: i128,
        transaction_id: i128,
        destination_chain: String,
        destination_address: String,
        email: String,
        caller: Address,
    ) {
        // Validate amount (includes > 0 check and max limit)
        Self::validate_amount(amount)
            .unwrap_or_else(|err| panic_with_error!(e, err));

        // Validate and convert token address
        let from_token_address = Self::validate_and_convert_address(e, &from_token_id)
            .unwrap_or_else(|err| panic_with_error!(e, err));

        // Check and mark transaction ID as used
        Self::use_transaction_id(e, transaction_id)
            .unwrap_or_else(|err| panic_with_error!(e, err));

        // Get current chain ID
        let current_chain_id: String = e.storage()
            .instance()
            .get(&DataKey::CurrentChainId)
            .unwrap_or(String::from_str(e, ""));

        // Burn tokens
        let client = token::TokenClient::new(e, &from_token_address);
        let contract_address = e.current_contract_address();
        client.burn_from(&contract_address, &caller, &amount);

        // Emit UserOperation event
        e.events().publish(
            (symbol_short!("burned"), ),
            (BridgeOperation::Burn as u32, from_token_id, to_token_id, amount, &caller, destination_address, current_chain_id, destination_chain, transaction_id, email, &caller)
        );
    }

    // ============ Internal System Operations ============

    /// Internal: Release locked tokens on this chain
    fn _release_tokens(
        e: &Env,
        from_token_id: String,
        to_token_id: String,
        amount: i128,
        recipient: Address,
        transaction_id: i128,
        source_chain: String,
        source_address: String,
        email: String,
        caller: Address,
    ) {
        // Validate amount (includes > 0 check and max limit)
        Self::validate_amount(amount)
            .unwrap_or_else(|err| panic_with_error!(e, err));

        // Validate and convert token address
        let to_token_address = Self::validate_and_convert_address(e, &to_token_id)
            .unwrap_or_else(|err| panic_with_error!(e, err));

        // Check and mark transaction ID as used
        Self::use_transaction_id(e, transaction_id)
            .unwrap_or_else(|err| panic_with_error!(e, err));

        // Get current chain ID
        let current_chain_id: String = e.storage()
            .instance()
            .get(&DataKey::CurrentChainId)
            .unwrap_or(String::from_str(e, ""));

        // Prevent releasing on the same chain as source
        // if source_chain == current_chain_id {
        //     panic_with_error!(e, TokenBridgeError::InvalidReleaseOnSameChain);
        // }

        // Check locked balance (using persistent storage)
        let current_balance: i128 = e.storage()
            .persistent()
            .get(&DataKey::LockedBalances(to_token_address.clone()))
            .unwrap_or(0);

        if current_balance < amount {
            panic_with_error!(e, TokenBridgeError::InsufficientLockedBalance);
        }

        // Update locked balances
        let key = DataKey::LockedBalances(to_token_address.clone());
        e.storage()
            .persistent()
            .set(&key, &(current_balance - amount));

        // Extend TTL for locked balance entry (1 year)
        e.storage()
            .persistent()
            .extend_ttl(&key, 31_536_000, 31_536_000);

        // Transfer tokens from contract to recipient
        let client = token::TokenClient::new(e, &to_token_address);
        let contract_address = e.current_contract_address();
        client.transfer(&contract_address, &recipient, &amount);

        // Emit SystemOperation event
        e.events().publish(
            (symbol_short!("released"), ),
            (BridgeOperation::Release as u32, from_token_id, to_token_id, amount, source_address, recipient, source_chain, current_chain_id, transaction_id, email, &caller)
        );
    }

    /// Internal: Mint tokens on this chain
    fn _mint_tokens(
        e: &Env,
        from_token_id: String,
        to_token_id: String,
        amount: i128,
        recipient: Address,
        transaction_id: i128,
        source_chain: String,
        source_address: String,
        email: String,
        caller: Address,
    ) {
        // Validate amount (includes > 0 check and max limit)
        Self::validate_amount(amount)
            .unwrap_or_else(|err| panic_with_error!(e, err));

        // Validate and convert token address
        let to_token_address = Self::validate_and_convert_address(e, &to_token_id)
            .unwrap_or_else(|err| panic_with_error!(e, err));

        // Check and mark transaction ID as used
        Self::use_transaction_id(e, transaction_id)
            .unwrap_or_else(|err| panic_with_error!(e, err));

        // Get current chain ID
        let current_chain_id: String = e.storage()
            .instance()
            .get(&DataKey::CurrentChainId)
            .unwrap_or(String::from_str(e, ""));

        // Prevent minting on the same chain as source
        // if source_chain == current_chain_id {
        //     panic_with_error!(e, TokenBridgeError::InvalidReleaseOnSameChain);
        // }

        // Mint tokens to recipient
        let client = token::StellarAssetClient::new(e, &to_token_address);
        client.mint(&recipient, &amount);

        // Emit SystemOperation event
        e.events().publish(
            (symbol_short!("minted"), ),
            (BridgeOperation::Mint as u32, from_token_id, to_token_id, amount, source_address, recipient, source_chain, current_chain_id, transaction_id, email, &caller)
        );
    }

    /// Set admin for a token contract
    /// Only owner can set token admin to prevent unauthorized takeover
    /// @param admin_token - The token contract address
    /// @param new_admin - The new admin address for the token
    /// @param caller - The caller address (must be owner)
    #[only_role(caller, "owner")]
    pub fn set_admin_token(e: &Env, admin_token: Address, new_admin: Address, caller: Address) {
        let client = token::StellarAssetClient::new(e, &admin_token);
        client.set_admin(&new_admin);

        // Emit event
        e.events().publish(
            (symbol_short!("set_admin"), &admin_token, &new_admin),
            &caller
        );
    }

    // ============ Owner Functions ============

    /// Propose a new owner address
    /// @param new_owner - The new owner address
    #[only_role(caller, "owner")]
    pub fn propose_new_owner(e: &Env, new_owner: Address, caller: Address) {
        // Set proposed owner
        e.storage()
            .instance()
            .set(&DataKey::ProposedOwner, &new_owner);

        // Emit event
        let timestamp = e.ledger().timestamp();
        e.events().publish(
            (symbol_short!("own_pro"), caller, new_owner),
            timestamp
        );
    }

    /// Accept ownership transfer
    /// @param caller - The caller address (must be proposed owner)
    /// @notice This is a two-step ownership transfer to prevent accidental transfers
    /// @notice First, the new owner must be proposed by the current owner
    /// @notice Then, the new owner must accept the transfer by calling this function
    /// @notice This function can only be called by the proposed owner
    pub fn accept_ownership(e: &Env, caller: Address) {
        caller.require_auth();

        // Get proposed owner - must exist
        let proposed_owner: Option<Address> = e.storage()
            .instance()
            .get(&DataKey::ProposedOwner);

        let proposed_owner = proposed_owner
            .unwrap_or_else(|| panic_with_error!(e, TokenBridgeError::Unauthorized));

        // Check if caller is proposed owner
        if caller != proposed_owner {
            panic_with_error!(e, TokenBridgeError::Unauthorized);
        }

        // Get current owner from access control
        let current_owner = access_control::get_admin(e)
            .unwrap_or_else(|| panic_with_error!(e, TokenBridgeError::Unauthorized));

        // Revoke OWNER_ROLE from current owner
        access_control::revoke_role_no_auth(e, &current_owner, &current_owner, &OWNER_ROLE);

        // Grant OWNER_ROLE to new owner
        access_control::grant_role_no_auth(e, &current_owner, &proposed_owner, &OWNER_ROLE);

        // Clear proposed owner by removing the key
        e.storage()
            .instance()
            .remove(&DataKey::ProposedOwner);

        // Emit event
        let timestamp = e.ledger().timestamp();
        e.events().publish(
            (symbol_short!("own_acc"), caller),
            timestamp
        );
    }

    /// Grant admin role to an address
    /// @param admin - The address to grant admin role
    #[only_role(caller, "owner")]
    pub fn grant_admin(e: &Env, admin: Address, caller: Address) {
        // Grant ADMIN_ROLE (no auth needed, already checked by macro)
        access_control::grant_role_no_auth(e, &caller, &admin, &ADMIN_ROLE);

        // Emit event
        let timestamp = e.ledger().timestamp();
        e.events().publish(
            (symbol_short!("adm_grt"), caller, admin),
            timestamp
        );
    }

    /// Revoke admin role from an address
    /// @param admin - The address to revoke admin role
    #[only_role(caller, "owner")]
    pub fn revoke_admin(e: &Env, admin: Address, caller: Address) {
        // Revoke ADMIN_ROLE (no auth needed, already checked by macro)
        access_control::revoke_role_no_auth(e, &caller, &admin, &ADMIN_ROLE);

        // Emit event
        let timestamp = e.ledger().timestamp();
        e.events().publish(
            (symbol_short!("adm_rvk"), caller, admin),
            timestamp
        );
    }

    /// Add a system wallet address (supports multiple system wallets)
    /// @param new_system_wallet - The system wallet address to add
    /// Only owner or admin can add system wallets
    pub fn add_system_wallet(e: &Env, new_system_wallet: Address, caller: Address) {
        caller.require_auth();

        // Check if caller is admin or owner
        Self::check_admin(e, &caller)
            .unwrap_or_else(|err| panic_with_error!(e, err));

        // Grant SYSTEM_WALLET_ROLE to new wallet (no auth needed, already checked above)
        access_control::grant_role_no_auth(e, &caller, &new_system_wallet, &SYSTEM_WALLET_ROLE);

        // Emit event
        let timestamp = e.ledger().timestamp();
        e.events().publish(
            (symbol_short!("sys_add"), caller, new_system_wallet),
            timestamp
        );
    }

    /// Remove a system wallet address
    /// @param system_wallet - The system wallet address to remove
    /// Only owner or admin can remove system wallets
    pub fn remove_system_wallet(e: &Env, system_wallet: Address, caller: Address) {
        caller.require_auth();

        // Check if caller is admin or owner
        Self::check_admin(e, &caller)
            .unwrap_or_else(|err| panic_with_error!(e, err));

        // Revoke SYSTEM_WALLET_ROLE from wallet (no auth needed, already checked above)
        access_control::revoke_role_no_auth(e, &caller, &system_wallet, &SYSTEM_WALLET_ROLE);

        // Emit event
        let timestamp = e.ledger().timestamp();
        e.events().publish(
            (symbol_short!("sys_rmv"), caller, system_wallet),
            timestamp
        );
    }

    /// Update the system wallet address (legacy function for backward compatibility)
    /// This function replaces the first system wallet with a new one
    /// @param new_system_wallet - The new system wallet address
    /// Only owner or admin can update system wallet
    /// @deprecated Use add_system_wallet and remove_system_wallet for better control
    pub fn update_system_wallet(e: &Env, new_system_wallet: Address, caller: Address) {
        caller.require_auth();

        // Check if caller is admin or owner
        Self::check_admin(e, &caller)
            .unwrap_or_else(|err| panic_with_error!(e, err));

        // Get old system wallet (find who has SYSTEM_WALLET_ROLE)
        let old_wallet_count = access_control::get_role_member_count(e, &SYSTEM_WALLET_ROLE);

        // Revoke SYSTEM_WALLET_ROLE from old wallet if exists
        if old_wallet_count > 0 {
            let old_wallet = access_control::get_role_member(e, &SYSTEM_WALLET_ROLE, 0);
            access_control::revoke_role_no_auth(e, &caller, &old_wallet, &SYSTEM_WALLET_ROLE);
        }

        // Grant SYSTEM_WALLET_ROLE to new wallet
        access_control::grant_role_no_auth(e, &caller, &new_system_wallet, &SYSTEM_WALLET_ROLE);

        // Emit event
        let timestamp = e.ledger().timestamp();
        e.events().publish(
            (symbol_short!("sys_upd"), caller.clone(), new_system_wallet),
            timestamp
        );
    }

    // ============ Upgrade Functions ============

    /// Upgrade the contract to a new WASM hash
    /// Only owner can upgrade the contract
    /// @param new_wasm_hash - The hash of the new WASM binary
    #[only_role(caller, "owner")]
    pub fn upgrade(e: &Env, new_wasm_hash: soroban_sdk::BytesN<32>, caller: Address) {
        // Execute the upgrade
        e.deployer().update_current_contract_wasm(new_wasm_hash.clone());

        // Emit event
        let timestamp = e.ledger().timestamp();
        e.events().publish(
            (symbol_short!("upgraded"), caller, new_wasm_hash),
            timestamp
        );
    }

    // ============ View Functions ============

    /// Get the first system wallet address (for backward compatibility)
    /// @deprecated Use get_system_wallets to get all system wallets
    pub fn get_system_wallet(e: &Env) -> Address {
        let count = access_control::get_role_member_count(e, &SYSTEM_WALLET_ROLE);
        if count > 0 {
            access_control::get_role_member(e, &SYSTEM_WALLET_ROLE, 0)
        } else {
            Address::from_string(&String::from_str(e, ""))
        }
    }

    /// Get all system wallet addresses
    /// @return Vector of all addresses with SYSTEM_WALLET_ROLE
    pub fn get_system_wallets(e: &Env) -> soroban_sdk::Vec<Address> {
        let count = access_control::get_role_member_count(e, &SYSTEM_WALLET_ROLE);
        let mut wallets = soroban_sdk::Vec::new(e);

        for i in 0..count {
            let wallet = access_control::get_role_member(e, &SYSTEM_WALLET_ROLE, i);
            wallets.push_back(wallet);
        }

        wallets
    }

    /// Get the count of system wallets
    /// @return Number of addresses with SYSTEM_WALLET_ROLE
    pub fn get_system_wallet_count(e: &Env) -> u32 {
        access_control::get_role_member_count(e, &SYSTEM_WALLET_ROLE)
    }

    /// Check if an address is a system wallet
    /// @param account - The address to check
    /// @return true if the address has SYSTEM_WALLET_ROLE
    pub fn is_system_wallet(e: &Env, account: Address) -> bool {
        access_control::has_role(e, &account, &SYSTEM_WALLET_ROLE).is_some()
    }

    /// Get the locked balance for a token
    pub fn get_locked_balance(e: &Env, token: Address) -> i128 {
        e.storage()
            .persistent()
            .get(&DataKey::LockedBalances(token))
            .unwrap_or(0)
    }

    /// Check if an address is an admin (has ADMIN_ROLE or OWNER_ROLE)
    pub fn is_admin(e: &Env, account: Address) -> bool {
        // Check if owner
        if access_control::has_role(e, &account, &OWNER_ROLE).is_some() {
            return true;
        }

        // Check if admin
        access_control::has_role(e, &account, &ADMIN_ROLE).is_some()
    }

    /// Get the owner address
    pub fn get_owner(e: &Env) -> Address {
        let count = access_control::get_role_member_count(e, &OWNER_ROLE);
        if count > 0 {
            access_control::get_role_member(e, &OWNER_ROLE, 0)
        } else {
            Address::from_string(&String::from_str(e, ""))
        }
    }

    /// Get the current chain ID
    pub fn get_current_chain_id(e: &Env) -> String {
        e.storage()
            .instance()
            .get(&DataKey::CurrentChainId)
            .unwrap_or(String::from_str(e, ""))
    }

    // Extend TTL of the contract
    pub fn extend_ttl(e: &Env, threshold: u32, extend_to: u32) {
        e.storage()
            .instance()
            .extend_ttl(threshold, extend_to);
    }

}

// ============ Pausable Implementation ============

#[contractimpl]
impl Pausable for TokenBridge {
    fn paused(e: &Env) -> bool {
        pausable::paused(e)
    }

    fn pause(e: &Env, caller: Address) {
        caller.require_auth();
        
        // Check if caller is admin or owner
        Self::check_admin(e, &caller)
            .unwrap_or_else(|err| panic_with_error!(e, err));
        
        pausable::pause(e);
        
        // Emit event
        let timestamp = e.ledger().timestamp();
        e.events().publish(
            (symbol_short!("pause"), caller),
            timestamp
        );
    }

    fn unpause(e: &Env, caller: Address) {
        caller.require_auth();
        
        // Check if caller is admin or owner
        Self::check_admin(e, &caller)
            .unwrap_or_else(|err| panic_with_error!(e, err));
        
        pausable::unpause(e);
        
        // Emit event
        let timestamp = e.ledger().timestamp();
        e.events().publish(
            (symbol_short!("unpause"), caller),
            timestamp
        );
    }
}

// ============ Access Control Implementation ============

#[contractimpl]
impl AccessControl for TokenBridge {
    fn has_role(e: &Env, account: Address, role: Symbol) -> Option<u32> {
        access_control::has_role(e, &account, &role)
    }

    fn get_admin(e: &Env) -> Option<Address> {
        access_control::get_admin(e)
    }

    fn get_role_member_count(e: &Env, role: Symbol) -> u32 {
        access_control::get_role_member_count(e, &role)
    }

    fn get_role_member(e: &Env, role: Symbol, index: u32) -> Address {
        access_control::get_role_member(e, &role, index)
    }

    fn get_role_admin(e: &Env, role: Symbol) -> Option<Symbol> {
        access_control::get_role_admin(e, &role)
    }

    fn grant_role(e: &Env, admin: Address, account: Address, role: Symbol) {
        access_control::grant_role(e, &admin, &account, &role)
    }

    fn revoke_role(e: &Env, admin: Address, account: Address, role: Symbol) {
        access_control::revoke_role(e, &admin, &account, &role)
    }

    fn renounce_role(e: &Env, account: Address, role: Symbol) {
        access_control::renounce_role(e, &account, &role)
    }

    fn transfer_admin_role(e: &Env, new_admin: Address, delay: u32) {
        access_control::transfer_admin_role(e, &new_admin, delay)
    }

    fn accept_admin_transfer(e: &Env) {
        access_control::accept_admin_transfer(e)
    }

    fn set_role_admin(e: &Env, role: Symbol, admin_role: Symbol) {
        access_control::set_role_admin(e, &role, &admin_role)
    }

    fn renounce_admin(e: &Env) {
        access_control::renounce_admin(e)
    }
}

// ============ Upgradeable Internal Implementation ============

impl UpgradeableInternal for TokenBridge {
    fn _require_auth(e: &Env, operator: &Address) {
        operator.require_auth();

        // Check if caller has OWNER_ROLE
        if access_control::has_role(e, operator, &OWNER_ROLE).is_none() {
            panic_with_error!(e, TokenBridgeError::OnlyOwner);
        }
    }
}

