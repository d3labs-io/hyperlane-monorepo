# TokenBridge API Reference - Stellar Implementation

**Document Version:** 2.0
**Date:** November 12, 2025
**Platform:** Stellar Blockchain (Soroban Smart Contracts)
**Contract:** TokenBridge v1.0
**Rust Version:** 1.75.0+
**Soroban SDK:** Latest stable

---

## Executive Summary

The TokenBridge smart contract enables secure cross-chain token transfers on Stellar using two mechanisms:
1. **Lock/Release:** Lock tokens on source chain, release on destination chain
2. **Burn/Mint:** Burn tokens on source chain, mint on destination chain

### Role-Based Access Control

The contract uses three distinct roles for access control:

| Role | Symbol | Capabilities |
|------|--------|--------------|
| **Owner** | `owner` | Upgrade contract, manage admins, set token admin, propose ownership transfer |
| **Admin** | `admin` | Pause/unpause contract, manage system wallets |
| **System Wallet** | `sys_wlt` | Execute release and mint operations |

**Note:** The owner also has all admin capabilities. Multiple addresses can have the same role (especially useful for system wallets).

### Quick Reference

| Function Category | Function Count | Description |
|-------------------|----------------|-------------|
| **Initialization** | 1 | Contract deployment and setup |
| **Bridge Operations** | 1 (unified) | Execute lock/burn/release/mint |
| **Admin Functions** | 5 | Pause, unpause, system wallet management |
| **Owner Functions** | 6 | Ownership transfer (2-step), admin, upgrade |
| **View Functions** | 10 | Query state (no transaction) |
| **AccessControl Functions** | 7 | Low-level role management (trait) |

### Integration Libraries

- **Soroban CLI:** Command-line tool for contract interaction
- **Stellar SDK (JavaScript/TypeScript):** For web/mobile applications
- **Soroban SDK (Rust):** For Rust-based integrations
- See "Platform-Specific Integration Notes" section for setup examples

---

## Function Catalog by Type

### View/Query Functions (Read-Only, No Transaction)

| Function | Returns | Description |
|----------|---------|-------------|
| `get_system_wallet()` | `Address` | Get first system wallet (deprecated) |
| `get_system_wallets()` | `Vec<Address>` | Get all system wallet addresses |
| `get_system_wallet_count()` | `u32` | Get count of system wallets |
| `is_system_wallet(Address)` | `bool` | Check if address is system wallet |
| `get_locked_balance(Address)` | `i128` | Get locked balance for token |
| `is_admin(Address)` | `bool` | Check if address is admin |
| `get_owner()` | `Address` | Get owner address |
| `get_current_chain_id()` | `String` | Get current chain identifier |
| `is_transaction_used(i128)` | `bool` | Check if transaction ID has been used |
| `paused()` | `bool` | Check if contract is paused |

### State-Changing Functions (Require Transaction)

| Function | Access | Description |
|----------|--------|-------------|
| `execute_bridge_operation()` | Public/System | Execute bridge operation |
| `pause(Address)` | Admin | Pause contract |
| `unpause(Address)` | Admin | Unpause contract |
| `add_system_wallet(Address, Address)` | Admin | Add system wallet |
| `remove_system_wallet(Address, Address)` | Admin | Remove system wallet |
| `update_system_wallet(Address, Address)` | Admin | Update system wallet (deprecated) |
| `propose_new_owner(Address, Address)` | Owner | Propose new owner (step 1) |
| `accept_ownership(Address)` | Proposed Owner | Accept ownership (step 2) |
| `grant_admin(Address, Address)` | Owner | Grant admin role |
| `revoke_admin(Address, Address)` | Owner | Revoke admin role |
| `set_admin_token(Address, Address, Address)` | Owner | Set token admin |
| `upgrade(BytesN<32>, Address)` | Owner | Upgrade contract |
| `extend_ttl(u32, u32)` | Public | Extend contract TTL |

---

## Function Catalog by Role

### Public Functions (Anyone Can Call)

#### execute_bridge_operation (Lock)
- **Operation:** Lock tokens
- **Caller:** Token owner
- **Operation Code:** 0

#### execute_bridge_operation (Burn)
- **Operation:** Burn tokens
- **Caller:** Token owner
- **Operation Code:** 1

### System Wallet Functions (Only System Wallet)

#### execute_bridge_operation (Release)
- **Operation:** Release locked tokens
- **Caller:** System wallet only
- **Operation Code:** 2

#### execute_bridge_operation (Mint)
- **Operation:** Mint tokens
- **Caller:** System wallet only
- **Operation Code:** 3

### Admin Functions (Admin or Owner)

- `pause(caller: Address)`
- `unpause(caller: Address)`
- `add_system_wallet(new_system_wallet: Address, caller: Address)`
- `remove_system_wallet(system_wallet: Address, caller: Address)`
- `update_system_wallet(new_system_wallet: Address, caller: Address)` - Deprecated

### Owner Functions (Only Owner)

- `propose_new_owner(new_owner: Address, caller: Address)`
- `accept_ownership(caller: Address)` - Called by proposed owner to accept
- `grant_admin(admin: Address, caller: Address)`
- `revoke_admin(admin: Address, caller: Address)`
- `set_admin_token(admin_token: Address, new_admin: Address, caller: Address)`
- `upgrade(new_wasm_hash: BytesN<32>, caller: Address)`

---

## Detailed Function Documentation

### 0. Initialization

---

#### __constructor

Initialize the contract with owner, system wallet, and chain identifier.

**Function Signature:**
```rust
pub fn __constructor(
    e: &Env,
    owner: Address,
    system_wallet: Address,
    current_chain_id: String,
)
```

**Description:**
Initializes the TokenBridge contract. This function is called once during contract deployment. It sets up the owner, grants initial roles, and configures the current chain identifier.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `e` | `&Env` | Soroban environment |
| `owner` | `Address` | Owner address (receives OWNER_ROLE) |
| `system_wallet` | `Address` | System wallet address (receives SYSTEM_WALLET_ROLE) |
| `current_chain_id` | `String` | Current chain identifier in CAIP-2 format (e.g., "stellar:testnet") |

**Access Control:** Called during deployment only

**Function Type:** Initialization (one-time)

**Preconditions:**
- Chain ID must be in valid CAIP-2 format (3-64 characters)
- Contract must not be already initialized

**Roles Granted:**
- `owner` receives `OWNER_ROLE` (can upgrade, manage admins)
- `system_wallet` receives `SYSTEM_WALLET_ROLE` (can execute release/mint)
- `owner` is set as the AccessControl admin

**Storage Initialized:**
- `CurrentChainId` set to `current_chain_id` (instance storage)

**Error Conditions:**

| Error Code | Error Name | Condition |
|------------|------------|-----------|
| Error #10 | `InvalidChainIdentifier` | Chain ID invalid (length < 3 or > 64) |

**Example:**
```bash
soroban contract invoke \
    --id CBRIDGE_CONTRACT_ID \
    --source DEPLOYER_SECRET_KEY \
    --network testnet \
    -- __constructor \
    --owner GOWNER_ADDRESS \
    --system_wallet GSYSTEM_WALLET_ADDRESS \
    --current_chain_id "stellar:testnet"
```

---

### 1. Bridge Operations

---

#### execute_bridge_operation

Execute a bridge operation (lock, burn, release, or mint).

**Function Signature:**
```rust
pub fn execute_bridge_operation(
    e: &Env,
    operation: u32,
    bridge_data: TokenBridgeData,
    caller: Address,
)
```

**Description:**  
Unified entry point for all bridge operations. Routes to appropriate internal function based on operation type.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `e` | `&Env` | Soroban environment |
| `operation` | `u32` | Operation type: Lock (0), Burn (1), Release (2), Mint (3) |
| `bridge_data` | `TokenBridgeData` | Struct containing operation parameters |
| `caller` | `Address` | Caller address (must authorize transaction) |

**TokenBridgeData Struct:**

| Field | Type | Description |
|-------|------|-------------|
| `from_token` | `String` | Token address on source chain (Stellar address format) |
| `to_token` | `String` | Token address on destination chain |
| `amount` | `i128` | Amount to bridge (in token's smallest unit) |
| `from_address` | `String` | Sender address on source chain |
| `to_address` | `String` | Recipient address on destination chain |
| `from_network` | `String` | Source chain ID (CAIP-2 format, e.g., "stellar:testnet") |
| `to_network` | `String` | Destination chain ID (CAIP-2 format, e.g., "eip155:1") |
| `transaction_id` | `i128` | Unique transaction identifier (prevents replay attacks) |
| `email` | `String` | User email for notifications |

**Access Control:**
- **Lock (0):** Caller must authorize transaction
- **Burn (1):** Caller must authorize transaction
- **Release (2):** Caller must have `SYSTEM_WALLET_ROLE`
- **Mint (3):** Caller must have `SYSTEM_WALLET_ROLE`

**Function Type:** State-changing

**Preconditions:**
- Contract must not be paused
- Transaction ID must not have been used before
- For Lock/Burn: User must have sufficient token balance and approval
- For Release: Contract must have sufficient locked balance
- Chain IDs must be in valid CAIP-2 format (3-64 characters)
- Amount must be positive (> 0)

**Events Emitted:**

**Lock Operation:**
```rust
("locked",) => (
    operation: u32,           // 0
    from_token: String,
    to_token: String,
    amount: i128,
    caller: Address,
    destination_address: String,
    current_chain_id: String,
    destination_chain: String,
    transaction_id: i128,
    email: String,
    executor: Address
)
```

**Burn Operation:**
```rust
("burned",) => (
    operation: u32,           // 1
    from_token: String,
    to_token: String,
    amount: i128,
    caller: Address,
    destination_address: String,
    current_chain_id: String,
    destination_chain: String,
    transaction_id: i128,
    email: String,
    executor: Address
)
```

**Release Operation:**
```rust
("released",) => (
    operation: u32,           // 2
    from_token: String,
    to_token: String,
    amount: i128,
    source_address: String,
    recipient: Address,
    source_chain: String,
    current_chain_id: String,
    transaction_id: i128,
    email: String,
    executor: Address
)
```

**Mint Operation:**
```rust
("minted",) => (
    operation: u32,           // 3
    from_token: String,
    to_token: String,
    amount: i128,
    source_address: String,
    recipient: Address,
    source_chain: String,
    current_chain_id: String,
    transaction_id: i128,
    email: String,
    executor: Address
)
```

**Error Conditions:**

| Error Code | Error Name | Condition |
|------------|------------|-----------|
| Error #1 | `Unauthorized` | Caller lacks SYSTEM_WALLET_ROLE (for Release/Mint) |
| Error #2 | `TransactionIdAlreadyUsed` | Transaction ID has been used |
| Error #3 | `InvalidAmount` | Amount is zero or negative |
| Error #4 | `InvalidAddress` | Token address is invalid |
| Error #6 | Contract Paused | Contract is paused |
| Error #10 | `InvalidChainIdentifier` | Chain ID invalid (length < 3 or > 64) |
| Error #11 | `InvalidReleaseOnSameChain` | Source and destination chains are the same |
| Error #12 | `InsufficientLockedBalance` | Not enough locked tokens (for Release) |
| Error #16 | `InvalidOperation` | Operation code not 0-3 |

**Usage Example:**

See "Common Integration Patterns" section for complete examples.

---

### 2. Admin Functions

---

#### pause

Pause all bridge operations in case of emergency.

**Function Signature:**
```rust
pub fn pause(e: &Env, caller: Address)
```

**Description:**
Halts all bridge operations (lock, burn, release, mint). Used for emergency situations or maintenance.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `e` | `&Env` | Soroban environment |
| `caller` | `Address` | Caller address (must be admin or owner) |

**Access Control:** Admin or Owner only

**Function Type:** State-changing

**Preconditions:**
- Caller must have `ADMIN_ROLE` or `OWNER_ROLE`
- Caller must authorize transaction
- Contract must not already be paused

**Events Emitted:**
```rust
("pause", caller) => timestamp
```

**Error Conditions:**

| Error Code | Error Name | Condition |
|------------|------------|-----------|
| Error #14 | `NotAdmin` | Caller lacks admin privileges |

---

#### unpause

Resume bridge operations after pause.

**Function Signature:**
```rust
pub fn unpause(e: &Env, caller: Address)
```

**Description:**
Resumes all bridge operations after emergency pause.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `e` | `&Env` | Soroban environment |
| `caller` | `Address` | Caller address (must be admin or owner) |

**Access Control:** Admin or Owner only

**Function Type:** State-changing

**Preconditions:**
- Caller must have `ADMIN_ROLE` or `OWNER_ROLE`
- Caller must authorize transaction
- Contract must be paused

**Events Emitted:**
```rust
("unpause", caller) => timestamp
```

**Error Conditions:**

| Error Code | Error Name | Condition |
|------------|------------|-----------|
| Error #14 | `NotAdmin` | Caller lacks admin privileges |

---

#### add_system_wallet

Add a system wallet address (supports multiple system wallets).

**Function Signature:**
```rust
pub fn add_system_wallet(e: &Env, new_system_wallet: Address, caller: Address)
```

**Description:**
Grants `SYSTEM_WALLET_ROLE` to an address, allowing it to execute release and mint operations.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `e` | `&Env` | Soroban environment |
| `new_system_wallet` | `Address` | Address to grant system wallet role |
| `caller` | `Address` | Caller address (must be admin or owner) |

**Access Control:** Admin or Owner only

**Function Type:** State-changing

**Preconditions:**
- Caller must have `ADMIN_ROLE` or `OWNER_ROLE`
- Caller must authorize transaction

**Events Emitted:**
```rust
("sys_add", caller, new_system_wallet) => timestamp
```

**Error Conditions:**

| Error Code | Error Name | Condition |
|------------|------------|-----------|
| Error #14 | `NotAdmin` | Caller lacks admin privileges |

---

#### remove_system_wallet

Remove a system wallet address.

**Function Signature:**
```rust
pub fn remove_system_wallet(e: &Env, system_wallet: Address, caller: Address)
```

**Description:**
Revokes `SYSTEM_WALLET_ROLE` from an address.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `e` | `&Env` | Soroban environment |
| `system_wallet` | `Address` | Address to revoke system wallet role |
| `caller` | `Address` | Caller address (must be admin or owner) |

**Access Control:** Admin or Owner only

**Function Type:** State-changing

**Preconditions:**
- Caller must have `ADMIN_ROLE` or `OWNER_ROLE`
- Caller must authorize transaction

**Events Emitted:**
```rust
("sys_rmv", caller, system_wallet) => timestamp
```

**Error Conditions:**

| Error Code | Error Name | Condition |
|------------|------------|-----------|
| Error #14 | `NotAdmin` | Caller lacks admin privileges |

---

#### update_system_wallet

Update the system wallet address (deprecated - use add_system_wallet and remove_system_wallet instead).

**Function Signature:**
```rust
pub fn update_system_wallet(e: &Env, new_system_wallet: Address, caller: Address)
```

**Description:**
Replaces the first system wallet with a new one. This is a legacy function for backward compatibility. It revokes `SYSTEM_WALLET_ROLE` from the first existing system wallet (if any) and grants it to the new wallet.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `e` | `&Env` | Soroban environment |
| `new_system_wallet` | `Address` | New system wallet address |
| `caller` | `Address` | Caller address (must be admin or owner) |

**Access Control:** Admin or Owner only

**Function Type:** State-changing

**Preconditions:**
- Caller must have `ADMIN_ROLE` or `OWNER_ROLE`
- Caller must authorize transaction

**Events Emitted:**
```rust
("sys_upd", caller, new_system_wallet) => timestamp
```

**Error Conditions:**

| Error Code | Error Name | Condition |
|------------|------------|-----------|
| Error #14 | `NotAdmin` | Caller lacks admin privileges |

**Note:** This function is deprecated. Use `add_system_wallet()` and `remove_system_wallet()` for better control over multiple system wallets.

---

### 3. Owner Functions

---

#### propose_new_owner

Propose a new owner address (step 1 of 2-step ownership transfer).

**Function Signature:**
```rust
pub fn propose_new_owner(e: &Env, new_owner: Address, caller: Address)
```

**Description:**
Proposes a new owner address. This is the first step of a two-step ownership transfer process to prevent accidental transfers. The proposed owner must call `accept_ownership()` to complete the transfer.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `e` | `&Env` | Soroban environment |
| `new_owner` | `Address` | Address of proposed new owner |
| `caller` | `Address` | Caller address (must be current owner) |

**Access Control:** Owner only

**Function Type:** State-changing

**Preconditions:**
- Caller must have `OWNER_ROLE`
- Caller must authorize transaction

**Events Emitted:**
```rust
("own_pro", caller, new_owner) => timestamp
```

**Error Conditions:**

| Error Code | Error Name | Condition |
|------------|------------|-----------|
| Error #15 | `OnlyOwner` | Caller lacks OWNER_ROLE |

---

#### accept_ownership

Accept ownership transfer (step 2 of 2-step ownership transfer).

**Function Signature:**
```rust
pub fn accept_ownership(e: &Env, caller: Address)
```

**Description:**
Accepts the ownership transfer. This is the second step of a two-step ownership transfer process. Only the proposed owner can call this function. Upon success, the caller becomes the new owner and the previous owner loses `OWNER_ROLE`.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `e` | `&Env` | Soroban environment |
| `caller` | `Address` | Caller address (must be proposed owner) |

**Access Control:** Proposed owner only

**Function Type:** State-changing

**Preconditions:**
- Caller must be the proposed owner (set via `propose_new_owner`)
- Caller must authorize transaction
- A proposed owner must exist

**Events Emitted:**
```rust
("own_acc", caller) => timestamp
```

**Error Conditions:**

| Error Code | Error Name | Condition |
|------------|------------|-----------|
| Error #1 | `Unauthorized` | Caller is not the proposed owner or no proposed owner exists |

---

#### grant_admin

Grant admin role to an address.

**Function Signature:**
```rust
pub fn grant_admin(e: &Env, admin: Address, caller: Address)
```

**Description:**
Grants `ADMIN_ROLE` to an address.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `e` | `&Env` | Soroban environment |
| `admin` | `Address` | Address to grant admin role |
| `caller` | `Address` | Caller address (must be owner) |

**Access Control:** Owner only

**Function Type:** State-changing

**Preconditions:**
- Caller must have `OWNER_ROLE`
- Caller must authorize transaction

**Events Emitted:**
```rust
("adm_grt", caller, admin) => timestamp
```

**Error Conditions:**

| Error Code | Error Name | Condition |
|------------|------------|-----------|
| Error #15 | `OnlyOwner` | Caller lacks OWNER_ROLE |

---

#### revoke_admin

Revoke admin role from an address.

**Function Signature:**
```rust
pub fn revoke_admin(e: &Env, admin: Address, caller: Address)
```

**Description:**
Revokes `ADMIN_ROLE` from an address.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `e` | `&Env` | Soroban environment |
| `admin` | `Address` | Address to revoke admin role |
| `caller` | `Address` | Caller address (must be owner) |

**Access Control:** Owner only

**Function Type:** State-changing

**Preconditions:**
- Caller must have `OWNER_ROLE`
- Caller must authorize transaction

**Events Emitted:**
```rust
("adm_rvk", caller, admin) => timestamp
```

**Error Conditions:**

| Error Code | Error Name | Condition |
|------------|------------|-----------|
| Error #15 | `OnlyOwner` | Caller lacks OWNER_ROLE |

---

#### set_admin_token

Set admin for a token contract.

**Function Signature:**
```rust
pub fn set_admin_token(e: &Env, admin_token: Address, new_admin: Address, caller: Address)
```

**Description:**
Sets the admin of a Stellar Asset Contract. Only owner can call to prevent unauthorized takeover.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `e` | `&Env` | Soroban environment |
| `admin_token` | `Address` | Token contract address |
| `new_admin` | `Address` | New admin address for the token |
| `caller` | `Address` | Caller address (must be owner) |

**Access Control:** Owner only

**Function Type:** State-changing

**Preconditions:**
- Caller must have `OWNER_ROLE`
- Caller must authorize transaction
- Bridge must be current admin of the token

**Events Emitted:**
```rust
("set_admin", admin_token, new_admin) => caller
```

**Error Conditions:**

| Error Code | Error Name | Condition |
|------------|------------|-----------|
| Error #15 | `OnlyOwner` | Caller lacks OWNER_ROLE |

---

#### upgrade

Upgrade the contract to a new WASM hash.

**Function Signature:**
```rust
pub fn upgrade(e: &Env, new_wasm_hash: BytesN<32>, caller: Address)
```

**Description:**
Upgrades the contract to a new WASM binary. Only owner can upgrade.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `e` | `&Env` | Soroban environment |
| `new_wasm_hash` | `BytesN<32>` | Hash of the new WASM binary |
| `caller` | `Address` | Caller address (must be owner) |

**Access Control:** Owner only

**Function Type:** State-changing

**Preconditions:**
- Caller must have `OWNER_ROLE`
- Caller must authorize transaction
- New WASM must be deployed to network

**Events Emitted:**
```rust
("upgraded", caller, new_wasm_hash) => timestamp
```

**Error Conditions:**

| Error Code | Error Name | Condition |
|------------|------------|-----------|
| Error #15 | `OnlyOwner` | Caller lacks OWNER_ROLE |

---

### 4. View Functions

---

#### get_system_wallet

Get the first system wallet address (deprecated - use get_system_wallets instead).

**Function Signature:**
```rust
pub fn get_system_wallet(e: &Env) -> Address
```

**Description:** Returns the first system wallet address. Deprecated in favor of `get_system_wallets()`.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `e` | `&Env` | Soroban environment |

**Returns:** `Address` - First system wallet address

**Access Control:** Public (anyone can call)

**Function Type:** View (read-only, no transaction)

---

#### get_system_wallets

Get all system wallet addresses.

**Function Signature:**
```rust
pub fn get_system_wallets(e: &Env) -> Vec<Address>
```

**Description:** Returns array of all addresses with system wallet role.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `e` | `&Env` | Soroban environment |

**Returns:** `Vec<Address>` - Vector of system wallet addresses

**Access Control:** Public (anyone can call)

**Function Type:** View (read-only, no transaction)

---

#### get_system_wallet_count

Get the count of system wallets.

**Function Signature:**
```rust
pub fn get_system_wallet_count(e: &Env) -> u32
```

**Description:** Returns the number of system wallets.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `e` | `&Env` | Soroban environment |

**Returns:** `u32` - Count of system wallets

**Access Control:** Public (anyone can call)

**Function Type:** View (read-only, no transaction)

---

#### is_system_wallet

Check if an address is a system wallet.

**Function Signature:**
```rust
pub fn is_system_wallet(e: &Env, account: Address) -> bool
```

**Description:** Checks if an address has system wallet role.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `e` | `&Env` | Soroban environment |
| `account` | `Address` | Address to check |

**Returns:** `bool` - True if address has SYSTEM_WALLET_ROLE

**Access Control:** Public (anyone can call)

**Function Type:** View (read-only, no transaction)

---

#### get_locked_balance

Get locked balance for a token.

**Function Signature:**
```rust
pub fn get_locked_balance(e: &Env, token: Address) -> i128
```

**Description:** Returns the amount of tokens locked in the bridge.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `e` | `&Env` | Soroban environment |
| `token` | `Address` | Token contract address |

**Returns:** `i128` - Locked balance in token's smallest unit (stroops)

**Access Control:** Public (anyone can call)

**Function Type:** View (read-only, no transaction)

---

#### is_admin

Check if an address is an admin.

**Function Signature:**
```rust
pub fn is_admin(e: &Env, account: Address) -> bool
```

**Description:** Checks if an address has admin or owner role.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `e` | `&Env` | Soroban environment |
| `account` | `Address` | Address to check |

**Returns:** `bool` - True if address has ADMIN_ROLE or OWNER_ROLE

**Access Control:** Public (anyone can call)

**Function Type:** View (read-only, no transaction)

---

#### get_owner

Get the owner address.

**Function Signature:**
```rust
pub fn get_owner(e: &Env) -> Address
```

**Description:** Returns the current owner address.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `e` | `&Env` | Soroban environment |

**Returns:** `Address` - Owner address

**Access Control:** Public (anyone can call)

**Function Type:** View (read-only, no transaction)

---

#### get_current_chain_id

Get the current chain identifier.

**Function Signature:**
```rust
pub fn get_current_chain_id(e: &Env) -> String
```

**Description:** Returns the chain ID of the current Stellar network (CAIP-2 format).

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `e` | `&Env` | Soroban environment |

**Returns:** `String` - Chain ID (e.g., "stellar:testnet", "stellar:pubnet")

**Access Control:** Public (anyone can call)

**Function Type:** View (read-only, no transaction)

---

#### is_transaction_used

Check if a transaction ID has been used.

**Function Signature:**
```rust
pub fn is_transaction_used(e: &Env, transaction_id: i128) -> bool
```

**Description:** Checks if a transaction ID has already been used in a bridge operation. This is useful for preventing replay attacks and verifying transaction uniqueness before submitting.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `e` | `&Env` | Soroban environment |
| `transaction_id` | `i128` | Transaction ID to check |

**Returns:** `bool` - True if transaction ID has been used

**Access Control:** Public (anyone can call)

**Function Type:** View (read-only, no transaction)

**Note:** Transaction IDs are stored in persistent storage with 1-year TTL. After TTL expiration, the transaction ID may be reused (though this is unlikely in practice with proper ID generation).

---

#### paused

Check if the contract is paused.

**Function Signature:**
```rust
pub fn paused(e: &Env) -> bool
```

**Description:** Returns whether the contract is currently paused.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `e` | `&Env` | Soroban environment |

**Returns:** `bool` - True if contract is paused

**Access Control:** Public (anyone can call)

**Function Type:** View (read-only, no transaction)

---

#### extend_ttl

Extend the Time To Live (TTL) for contract instance and persistent storage.

**Function Signature:**
```rust
pub fn extend_ttl(e: &Env, threshold: u32, extend_to: u32)
```

**Description:** Extends the TTL for contract instance and persistent storage entries (transaction IDs, locked balances).

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `e` | `&Env` | Soroban environment |
| `threshold` | `u32` | Minimum ledgers remaining before extension |
| `extend_to` | `u32` | Number of ledgers to extend to |

**Access Control:** Public (anyone can call)

**Function Type:** State-changing (requires transaction)

**Preconditions:** None

**Events Emitted:** None

---

### 5. AccessControl Trait Functions

The TokenBridge contract implements the `AccessControl` trait from the `stellar_access` crate. These functions provide low-level role management capabilities. Most users should use the higher-level functions like `grant_admin`, `revoke_admin`, etc.

---

#### has_role

Check if an account has a specific role.

**Function Signature:**
```rust
pub fn has_role(e: &Env, account: Address, role: Symbol) -> Option<u32>
```

**Description:** Returns the index of the account in the role's member list if it has the role, or None if it doesn't.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `e` | `&Env` | Soroban environment |
| `account` | `Address` | Address to check |
| `role` | `Symbol` | Role symbol (e.g., "owner", "admin", "sys_wlt") |

**Returns:** `Option<u32>` - Some(index) if account has role, None otherwise

**Access Control:** Public (anyone can call)

**Function Type:** View (read-only, no transaction)

---

#### get_admin

Get the AccessControl admin address.

**Function Signature:**
```rust
pub fn get_admin(e: &Env) -> Option<Address>
```

**Description:** Returns the AccessControl admin address (typically the owner).

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `e` | `&Env` | Soroban environment |

**Returns:** `Option<Address>` - Admin address if set

**Access Control:** Public (anyone can call)

**Function Type:** View (read-only, no transaction)

---

#### get_role_member_count

Get the number of members with a specific role.

**Function Signature:**
```rust
pub fn get_role_member_count(e: &Env, role: Symbol) -> u32
```

**Description:** Returns the count of addresses that have the specified role.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `e` | `&Env` | Soroban environment |
| `role` | `Symbol` | Role symbol (e.g., "owner", "admin", "sys_wlt") |

**Returns:** `u32` - Number of members with the role

**Access Control:** Public (anyone can call)

**Function Type:** View (read-only, no transaction)

---

#### get_role_member

Get a role member by index.

**Function Signature:**
```rust
pub fn get_role_member(e: &Env, role: Symbol, index: u32) -> Address
```

**Description:** Returns the address of the role member at the specified index.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `e` | `&Env` | Soroban environment |
| `role` | `Symbol` | Role symbol (e.g., "owner", "admin", "sys_wlt") |
| `index` | `u32` | Index in the role's member list (0-based) |

**Returns:** `Address` - Address of the role member

**Access Control:** Public (anyone can call)

**Function Type:** View (read-only, no transaction)

---

#### grant_role

Grant a role to an account (requires admin authorization).

**Function Signature:**
```rust
pub fn grant_role(e: &Env, admin: Address, account: Address, role: Symbol)
```

**Description:** Grants a role to an account. The admin must authorize the transaction.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `e` | `&Env` | Soroban environment |
| `admin` | `Address` | Admin address (must authorize) |
| `account` | `Address` | Address to grant role to |
| `role` | `Symbol` | Role symbol to grant |

**Access Control:** Admin must authorize

**Function Type:** State-changing

**Note:** Most users should use higher-level functions like `grant_admin()` instead.

---

#### revoke_role

Revoke a role from an account (requires admin authorization).

**Function Signature:**
```rust
pub fn revoke_role(e: &Env, admin: Address, account: Address, role: Symbol)
```

**Description:** Revokes a role from an account. The admin must authorize the transaction.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `e` | `&Env` | Soroban environment |
| `admin` | `Address` | Admin address (must authorize) |
| `account` | `Address` | Address to revoke role from |
| `role` | `Symbol` | Role symbol to revoke |

**Access Control:** Admin must authorize

**Function Type:** State-changing

**Note:** Most users should use higher-level functions like `revoke_admin()` instead.

---

#### renounce_role

Renounce a role (caller gives up their own role).

**Function Signature:**
```rust
pub fn renounce_role(e: &Env, account: Address, role: Symbol)
```

**Description:** Allows an account to renounce their own role.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `e` | `&Env` | Soroban environment |
| `account` | `Address` | Address renouncing the role (must authorize) |
| `role` | `Symbol` | Role symbol to renounce |

**Access Control:** Account must authorize

**Function Type:** State-changing

---

## Common Integration Patterns

### Pattern 1: Complete Lock/Release Flow

**Scenario:** User locks tokens on Stellar, receives release on Ethereum.

**Step 1: Lock tokens on Stellar (User)**

```bash
# Generate unique transaction ID
TX_ID=$(date +%s)$(shuf -i 1000-9999 -n 1)

# Execute lock operation
soroban contract invoke \
    --id CBRIDGE_CONTRACT_ID \
    --source USER_SECRET_KEY \
    --network testnet \
    -- execute_bridge_operation \
    --operation 0 \
    --bridge_data '{
        "from_token": "CTOKEN_ADDRESS_ON_STELLAR",
        "to_token": "0xETH_TOKEN_ADDRESS",
        "amount": "1000000000",
        "from_address": "GUSER_ADDRESS_ON_STELLAR",
        "to_address": "0xETH_RECIPIENT_ADDRESS",
        "from_network": "stellar:testnet",
        "to_network": "eip155:1",
        "transaction_id": "'$TX_ID'",
        "email": "user@example.com"
    }' \
    --caller GUSER_ADDRESS_ON_STELLAR
```

**Step 2: Release tokens on Ethereum (System Wallet)**

```javascript
// System wallet monitors Stellar events and executes release on Ethereum
// This is done by the bridge backend service
```

---

### Pattern 2: Check Transaction ID Before Bridging

**Scenario:** Verify transaction ID hasn't been used (Stellar doesn't have a public query for this, so use unique IDs).

```bash
# Generate unique transaction ID using timestamp + random
TX_ID=$(date +%s)$(shuf -i 100000-999999 -n 1)

# Use this TX_ID in bridge operation
# The contract will panic if TX_ID is already used
```

---

### Pattern 3: Query Locked Balances

**Scenario:** Check how many tokens are locked in the bridge.

```bash
# Get locked balance for a specific token
soroban contract invoke \
    --id CBRIDGE_CONTRACT_ID \
    --network testnet \
    -- get_locked_balance \
    --token CTOKEN_ADDRESS

# Output: 1000000000 (in stroops/smallest unit)
```

---

### Pattern 4: Handle Errors and Panics

**Scenario:** Properly handle transaction failures.

```bash
# Execute operation and capture result
RESULT=$(soroban contract invoke \
    --id CBRIDGE_CONTRACT_ID \
    --source USER_SECRET_KEY \
    --network testnet \
    -- execute_bridge_operation \
    --operation 0 \
    --bridge_data '...' \
    --caller GUSER_ADDRESS 2>&1)

# Check for errors
if echo "$RESULT" | grep -q "Error #1"; then
    echo "Unauthorized - caller lacks system wallet role"
elif echo "$RESULT" | grep -q "Error #2"; then
    echo "Transaction ID already used"
elif echo "$RESULT" | grep -q "Error #3"; then
    echo "Invalid amount (zero or negative)"
elif echo "$RESULT" | grep -q "Error #6"; then
    echo "Contract is paused"
elif echo "$RESULT" | grep -q "Error #12"; then
    echo "Insufficient locked balance for release"
else
    echo "Success: $RESULT"
fi
```

---

## Platform-Specific Integration Notes

### Soroban CLI Integration

**Installation:**
```bash
cargo install --locked soroban-cli
```

**Network Configuration:**
```bash
# Add testnet network
soroban network add testnet \
    --rpc-url https://soroban-testnet.stellar.org \
    --network-passphrase "Test SDF Network ; September 2015"

# Add mainnet network
soroban network add mainnet \
    --rpc-url https://soroban-mainnet.stellar.org \
    --network-passphrase "Public Global Stellar Network ; September 2015"
```

**Identity Management:**
```bash
# Generate new identity
soroban keys generate user --network testnet

# Get public key
soroban keys address user
```

**Contract Invocation:**
```bash
# View function (no transaction)
soroban contract invoke \
    --id CONTRACT_ID \
    --network testnet \
    -- FUNCTION_NAME \
    --param1 VALUE1

# State-changing function (requires transaction)
soroban contract invoke \
    --id CONTRACT_ID \
    --source SECRET_KEY \
    --network testnet \
    -- FUNCTION_NAME \
    --param1 VALUE1 \
    --caller CALLER_ADDRESS
```

---

### JavaScript/TypeScript Integration

**Setup:**
```javascript
import * as StellarSdk from '@stellar/stellar-sdk';
import { Contract, SorobanRpc, xdr } from '@stellar/stellar-sdk';

const server = new SorobanRpc.Server('https://soroban-testnet.stellar.org');
const sourceKeypair = StellarSdk.Keypair.fromSecret('SECRET_KEY');
const contractId = 'CBRIDGE_CONTRACT_ID';
```

**Calling View Functions:**
```javascript
// Build operation
const contract = new Contract(contractId);
const operation = contract.call('get_locked_balance', tokenAddress);

// Simulate (no transaction)
const account = await server.getAccount(sourceKeypair.publicKey());
const transaction = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: StellarSdk.Networks.TESTNET
})
.addOperation(operation)
.setTimeout(30)
.build();

const simulation = await server.simulateTransaction(transaction);
const result = StellarSdk.scValToNative(simulation.result.retval);
console.log('Locked balance:', result);
```

**Calling State-Changing Functions:**
```javascript
// Build transaction
const contract = new Contract(contractId);
const operation = contract.call(
    'execute_bridge_operation',
    0, // operation
    bridgeData,
    sourceKeypair.publicKey()
);

const account = await server.getAccount(sourceKeypair.publicKey());
const transaction = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: StellarSdk.Networks.TESTNET
})
.addOperation(operation)
.setTimeout(30)
.build();

// Sign and submit
transaction.sign(sourceKeypair);
const result = await server.sendTransaction(transaction);

// Wait for confirmation
let status;
do {
    await new Promise(resolve => setTimeout(resolve, 1000));
    status = await server.getTransaction(result.hash);
} while (status.status === 'PENDING');

console.log('Transaction status:', status.status);
```

---

### Error Code Handling

**Error Code Reference:**

| Error Code | Error Name | Description | Resolution |
|------------|------------|-------------|------------|
| Error #1 | `Unauthorized` | Caller lacks required role | Use authorized account |
| Error #2 | `TransactionIdAlreadyUsed` | TX ID already used | Use unique transaction ID |
| Error #3 | `InvalidAmount` | Amount is zero or negative | Provide positive amount |
| Error #4 | `InvalidAddress` | Token address is invalid | Provide valid Stellar address |
| Error #6 | Contract Paused | Contract is paused | Wait for unpause |
| Error #10 | `InvalidChainIdentifier` | Chain ID invalid | Use CAIP-2 format (3-64 chars) |
| Error #11 | `InvalidReleaseOnSameChain` | Source = destination chain | Use different chains |
| Error #12 | `InsufficientLockedBalance` | Not enough locked tokens | Check locked balance |
| Error #14 | `NotAdmin` | Caller not admin/owner | Use admin or owner account |
| Error #15 | `OnlyOwner` | Caller not owner | Use owner account |
| Error #16 | `InvalidOperation` | Operation code not 0-3 | Use valid operation code |

**Parsing Errors in JavaScript:**
```javascript
try {
    const result = await server.sendTransaction(transaction);
    // ... wait for confirmation
} catch (error) {
    const errorMessage = error.message || error.toString();

    if (errorMessage.includes('Error #1')) {
        console.error('Unauthorized - missing required role');
    } else if (errorMessage.includes('Error #2')) {
        console.error('Transaction ID already used');
    } else if (errorMessage.includes('Error #3')) {
        console.error('Invalid amount (zero or negative)');
    } else if (errorMessage.includes('Error #6')) {
        console.error('Contract is paused');
    } else if (errorMessage.includes('Error #12')) {
        console.error('Insufficient locked balance');
    } else {
        console.error('Transaction failed:', errorMessage);
    }
}
```

---

### TTL Considerations

**Understanding TTL:**
- Stellar uses Time To Live (TTL) for persistent storage
- Transaction IDs and locked balances use persistent storage
- TTL is measured in ledgers (~5 seconds per ledger)
- Default TTL: varies by network

**Recommended TTL Values:**
- **Threshold:** 172,800 ledgers (~10 days)
- **Extend To:** 518,400 ledgers (~30 days)

**Automated TTL Extension:**
```bash
# Create cron job to extend TTL weekly
0 0 * * 0 soroban contract invoke \
    --id CBRIDGE_CONTRACT_ID \
    --source ADMIN_SECRET_KEY \
    --network mainnet \
    -- extend_ttl \
    --threshold 172800 \
    --extend_to 518400
```

---

## Best Practices

1. **Always use unique transaction IDs** (timestamp + random component)
2. **Use CAIP-2 format for chain IDs** (e.g., "stellar:testnet", "eip155:1")
3. **Handle error codes gracefully** with proper error messages
4. **Monitor TTL for persistent storage** and extend regularly
5. **Check contract pause status** before attempting operations
6. **Validate addresses** before using them in bridge operations
7. **Use simulation** for view functions to avoid transaction fees
8. **Monitor locked balances** to ensure bridge solvency
9. **Keep system wallets secure** (multi-sig recommended)
10. **Test on testnet** before deploying to mainnet

---

## Stellar-Specific Features

### No Fee Mechanism
Unlike the EVM implementation, the Stellar bridge **does not charge fees** for lock operations. This is an intentional business decision to reduce friction for users.

### Network-Level Reentrancy Protection
Stellar's Soroban runtime provides network-level reentrancy protection, so explicit guards are not needed in the contract code.

### i128 Transaction IDs
Stellar uses `i128` for transaction IDs instead of strings (as in EVM). This provides better performance and storage efficiency.

### Negative Amount Validation
Stellar's `i128` type allows negative values, so the contract explicitly validates that amounts are positive (> 0).

### Persistent Storage with TTL

The contract uses a strategic storage architecture:

**Instance Storage (survives upgrades):**
- `CurrentChainId` - Chain identifier configuration
- `ProposedOwner` - Pending ownership transfer

**Persistent Storage (survives upgrades with TTL):**
- `TransactionIds(i128)` - Used transaction IDs for replay protection
- `LockedBalances(Address)` - Token balances locked in the contract

**Why Persistent Storage for Critical Data:**
- Transaction IDs MUST survive contract upgrades to prevent replay attacks
- Locked balances represent financial state that must be preserved accurately
- Each entry has independent TTL management (extended to 1 year on each operation)
- Requires periodic TTL extension via `extend_ttl()` to prevent data expiration

**Note:** The contract automatically extends TTL to 1 year (31,536,000 seconds) for transaction IDs and locked balances when they are accessed. However, it's recommended to periodically call `extend_ttl()` for the contract instance storage.

### Stellar Asset Contracts (SAC)
The bridge interacts with Stellar Asset Contracts for token operations. These contracts follow the Stellar token standard and support minting/burning operations.

---

## Support

For technical support or questions about the TokenBridge API:
- **Documentation:** This document
- **Test Coverage Report:** `stellar/docs/clients/TokenBridge_Test_Coverage_Report.md`
- **Contract Source:** `stellar/contracts/token_bridge/src/lib.rs`
- **Soroban Documentation:** https://soroban.stellar.org/docs

---

**Document End**

