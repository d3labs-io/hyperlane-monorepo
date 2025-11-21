# TokenBridge API Reference - EVM Implementation

**Document Version:** 1.1
**Date:** November 11, 2025
**Platform:** Ethereum Virtual Machine (EVM)
**Contract:** TokenBridge v1.1
**Solidity Version:** 0.8.28

---

## Executive Summary

The TokenBridge smart contract enables secure cross-chain token transfers using two mechanisms:
1. **Lock/Release:** Lock tokens on source chain, release on destination chain
2. **Burn/Mint:** Burn tokens on source chain, mint on destination chain

### Security Enhancements (v1.1)

This version includes the following security improvements:
- **Two-Step Ownership Transfer:** Ownership changes require both `updateOwner()` and `acceptOwnership()` calls to prevent accidental ownership loss
- **CAIP-2 Chain ID Validation:** All chain identifiers must follow CAIP-2 format (namespace:reference with colon separator)
- **Enhanced Treasury Protection:** `withdrawTreasury()` includes additional validation to prevent DoS conditions
- **Pause Reason Tracking:** `pause()` and `unpause()` functions now require a reason parameter for audit trails
- **Comprehensive NatSpec Documentation:** All internal functions include detailed security annotations

### Quick Reference

| Function Category | Function Count | Gas Cost Range |
|-------------------|----------------|----------------|
| **Bridge Operations** | 1 (unified) | 80,000 - 150,000 |
| **Admin Functions** | 7 | 30,000 - 80,000 |
| **Owner Functions** | 5 | 30,000 - 80,000 |
| **View Functions** | 10 | 0 (read-only) |

### Integration Libraries

- **Ethers.js (v6.x):** Recommended for modern JavaScript/TypeScript projects
- **Web3.js (v4.x):** Alternative JavaScript library
- See "Platform-Specific Integration Notes" section for setup examples

---

## Function Catalog by Type

### View/Query Functions (Read-Only, No Gas Cost)

| Function | Returns | Description |
|----------|---------|-------------|
| `getFeeAmount()` | `uint256` | Get current fee amount |
| `getFeeToken()` | `address` | Get fee token address |
| `getAllSystemWallets()` | `address[]` | Get all system wallet addresses |
| `isSystemWallet(address)` | `bool` | Check if address is system wallet |
| `getLockedBalance(address)` | `uint256` | Get locked balance for token |
| `isAdmin(address)` | `bool` | Check if address is admin |
| `getAllAdmins()` | `address[]` | Get all admin addresses |
| `getOwner()` | `address` | Get owner address |
| `pendingOwner()` | `address` | Get pending owner address |
| `getTransactionIdUsed(string)` | `bool` | Check if transaction ID used |

### State-Changing Functions (Require Gas)

| Function | Access | Gas Estimate | Description |
|----------|--------|--------------|-------------|
| `executeBridgeOperation()` | Public/System | 80k-150k | Execute bridge operation |
| `pause(string)` | Admin | 30k-50k | Pause contract |
| `unpause(string)` | Admin | 30k-50k | Unpause contract |
| `setFee(address, uint256)` | Admin | 40k-60k | Set fee parameters |
| `withdrawTreasury(address)` | Admin | 50k-80k | Withdraw treasury funds |
| `setVaultWallet(address)` | Admin | 30k-50k | Set vault wallet |
| `grantSystemWallet(address)` | Admin | 40k-60k | Grant system wallet role |
| `revokeSystemWallet(address)` | Admin | 30k-50k | Revoke system wallet role |
| `updateOwner(address)` | Owner | 40k-60k | Initiate ownership transfer |
| `acceptOwnership()` | Pending Owner | 50k-70k | Accept ownership transfer |
| `grantAdmin(address)` | Admin/Owner | 40k-60k | Grant admin role |
| `revokeAdmin(address)` | Owner | 30k-50k | Revoke admin role |

---

## Function Catalog by Role

### Public Functions (Anyone Can Call)

#### executeBridgeOperation (LOCK_WITH_FEE)
- **Operation:** Lock tokens with fee payment
- **Caller:** Token owner
- **Gas:** ~100,000 - 150,000

#### executeBridgeOperation (BURN)
- **Operation:** Burn tokens
- **Caller:** Token owner
- **Gas:** ~80,000 - 120,000

### System Wallet Functions (Only System Wallet)

#### executeBridgeOperation (RELEASE)
- **Operation:** Release locked tokens
- **Caller:** System wallet only
- **Gas:** ~90,000 - 130,000

#### executeBridgeOperation (MINT)
- **Operation:** Mint tokens
- **Caller:** System wallet only
- **Gas:** ~80,000 - 120,000

### Admin Functions (Admin or Owner)

- `pause(string reason)`
- `unpause(string reason)`
- `setFee(address feeToken, uint256 feeAmount)`
- `withdrawTreasury(address token)`
- `setVaultWallet(address vaultWallet)`
- `grantSystemWallet(address wallet)`
- `revokeSystemWallet(address wallet)`
- `grantAdmin(address admin)` - Admin or Owner can grant

### Owner Functions (Only Owner)

- `updateOwner(address newOwner)` - Initiates ownership transfer (step 1 of 2)
- `acceptOwnership()` - Completes ownership transfer (step 2 of 2, called by pending owner)
- `revokeAdmin(address admin)` - Revoke admin role

**Note:** Ownership transfer is a two-step process for security. The current owner calls `updateOwner()` to propose a new owner, then the new owner must call `acceptOwnership()` to complete the transfer. This prevents accidental ownership loss.

---

## Detailed Function Documentation

### 1. Bridge Operations

---

#### executeBridgeOperation

Execute a bridge operation (lock, burn, release, or mint).

**Function Signature:**
```solidity
function executeBridgeOperation(
    BridgeOperation operation,
    BridgeData calldata bridgeData
) external
```

**Description:**  
Unified entry point for all bridge operations. Routes to appropriate internal function based on operation type.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `operation` | `BridgeOperation` | Operation type: `LOCK_WITH_FEE` (0), `BURN` (1), `RELEASE` (2), `MINT` (3) |
| `bridgeData` | `BridgeData` | Struct containing operation parameters |

**BridgeData Struct:**

| Field | Type | Description |
|-------|------|-------------|
| `fromToken` | `string` | Token address on source chain (hex string with 0x prefix) |
| `toToken` | `string` | Token address on destination chain (hex string with 0x prefix) |
| `amount` | `uint256` | Amount to bridge (in token's smallest unit) |
| `fromAddress` | `string` | Sender address on source chain (hex string with 0x prefix) |
| `toAddress` | `string` | Recipient address on destination chain (hex string with 0x prefix) |
| `fromNetwork` | `string` | Source chain ID (CAIP-2 format, e.g., "eip155:1") |
| `toNetwork` | `string` | Destination chain ID (CAIP-2 format, e.g., "stellar:testnet") |
| `transactionId` | `string` | Unique transaction identifier (prevents replay attacks) |
| `email` | `string` | User email for notifications |
| `refund` | `BridgeRefund` | Refund information (see BridgeRefund struct below) |

**BridgeRefund Struct:**

| Field | Type | Description |
|-------|------|-------------|
| `feeToken` | `address` | Address of the fee token to refund (use `address(0)` for user operations) |
| `feeAmount` | `uint256` | Amount of fee to refund (use `0` for user operations) |

**Refund Field Usage:**

- **For User Operations (LOCK_WITH_FEE, BURN):** Set refund to zero values:
  ```solidity
  refund: {
    feeToken: address(0),
    feeAmount: 0
  }
  ```

- **For System Operations (RELEASE, MINT):** Set refund to the actual fee token and amount that should be refunded to the user:
  ```solidity
  refund: {
    feeToken: <fee_token_address>,
    feeAmount: <fee_amount_collected_during_lock>
  }
  ```

  The refund field is used by the system wallet to specify which fee token and amount should be refunded to the user when releasing or minting tokens. This ensures that fees collected during lock operations are properly refunded.

**Access Control:**
- **LOCK_WITH_FEE:** Caller must be `fromAddress`
- **BURN:** Caller must be `fromAddress`
- **RELEASE:** Caller must have `SYSTEM_WALLET_ROLE`
- **MINT:** Caller must have `SYSTEM_WALLET_ROLE`

**Function Type:** State-changing

**Preconditions:**
- Contract must not be paused
- Transaction ID must not have been used before
- For LOCK/BURN: User must have sufficient token balance and approval
- For RELEASE: Contract must have sufficient locked balance
- For RELEASE/MINT: Refund field must contain valid fee token address and non-zero fee amount
- Chain IDs must be in valid CAIP-2 format (namespace:reference with colon separator, e.g., "eip155:1")

**Events Emitted:**
```solidity
event Operation(
    BridgeOperation indexed operation,
    string fromToken,
    string toToken,
    uint256 amount,
    uint256 feeAmount,
    string fromAddress,
    string toAddress,
    string fromNetwork,
    string toNetwork,
    string transactionId,
    string email,
    address indexed executor,
    address feeToken
);
```

**Error Conditions:**

| Error | Condition |
|-------|-----------|
| `EnforcedPause()` | Contract is paused |
| `InvalidCaller()` | Caller is not fromAddress (for LOCK/BURN) |
| `Unauthorized()` | Caller lacks SYSTEM_WALLET_ROLE (for RELEASE/MINT) |
| `TransactionIdAlreadyUsed()` | Transaction ID has been used |
| `InvalidAddress()` | Token address is zero address |
| `InvalidAmount()` | Amount is zero |
| `InvalidChainIdentifier()` | Chain ID is empty or missing colon separator (invalid CAIP-2 format) |
| `InsufficientLockedBalance()` | Not enough locked tokens (for RELEASE) |
| `InvalidReleaseOnSameChain()` | Source and destination chains are the same (for RELEASE/MINT) |
| `InvalidRefund()` | Refund data is invalid for RELEASE/MINT operations (both feeToken and feeAmount must be non-zero) |

**Code Examples:**

**Example 1: LOCK_WITH_FEE Operation (User)**
```typescript
const bridgeData = {
  fromToken: "0x1234567890123456789012345678901234567890",
  toToken: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
  amount: ethers.parseEther("100"),
  fromAddress: userAddress,
  toAddress: recipientAddress,
  fromNetwork: "eip155:1",
  toNetwork: "stellar:testnet",
  transactionId: "tx_unique_id_12345",
  email: "user@example.com",
  refund: {
    feeToken: ethers.ZeroAddress,  // Zero address for user operations
    feeAmount: 0                     // Zero amount for user operations
  }
};

await bridge.executeBridgeOperation(0, bridgeData);  // 0 = LOCK_WITH_FEE
```

**Example 2: RELEASE Operation (System Wallet)**
```typescript
const bridgeData = {
  fromToken: "",
  toToken: "0x1234567890123456789012345678901234567890",
  amount: ethers.parseEther("100"),
  fromAddress: originalSenderAddress,
  toAddress: recipientAddress,
  fromNetwork: "stellar:testnet",
  toNetwork: "eip155:1",
  transactionId: "tx_unique_id_12345",
  email: "user@example.com",
  refund: {
    feeToken: feeTokenAddress,      // Fee token address from lock operation
    feeAmount: ethers.parseEther("0.1")  // Fee amount collected during lock
  }
};

await bridge.connect(systemWallet).executeBridgeOperation(2, bridgeData);  // 2 = RELEASE
```

**Usage Example:**

See "Common Integration Patterns" section for complete examples.

**Gas Considerations:**
- LOCK_WITH_FEE: ~100,000 - 150,000 gas (includes fee transfer)
- BURN: ~80,000 - 120,000 gas
- RELEASE: ~90,000 - 130,000 gas
- MINT: ~80,000 - 120,000 gas

---

### 2. Admin Functions

---

#### pause

Pause all bridge operations in case of emergency.

**Function Signature:**
```solidity
function pause(string calldata reason) external
```

**Description:**
Halts all bridge operations (lock, burn, release, mint). Used for emergency situations or maintenance.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `reason` | `string` | Reason for pausing (logged in event) |

**Access Control:** Admin or Owner only

**Function Type:** State-changing

**Preconditions:**
- Caller must have `ADMIN_ROLE` or `OWNER_ROLE`
- Contract must not already be paused

**Events Emitted:**
```solidity
event EmergencyPause(address indexed admin, string reason, uint256 timestamp);
event Paused(address account);
```

**Error Conditions:**

| Error | Condition |
|-------|-----------|
| `NotAdmin()` | Caller lacks admin privileges |
| `EnforcedPause()` | Contract already paused |

**Gas Considerations:** ~30,000 - 50,000 gas

---

#### unpause

Resume bridge operations after pause.

**Function Signature:**
```solidity
function unpause(string calldata reason) external
```

**Description:**
Resumes all bridge operations after emergency pause.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `reason` | `string` | Reason for unpausing (logged in event) |

**Access Control:** Admin or Owner only

**Function Type:** State-changing

**Preconditions:**
- Caller must have `ADMIN_ROLE` or `OWNER_ROLE`
- Contract must be paused

**Events Emitted:**
```solidity
event EmergencyUnpause(address indexed admin, string reason, uint256 timestamp);
event Unpaused(address account);
```

**Error Conditions:**

| Error | Condition |
|-------|-----------|
| `NotAdmin()` | Caller lacks admin privileges |
| `ExpectedPause()` | Contract not paused |

**Gas Considerations:** ~30,000 - 50,000 gas

---

#### setFee

Update fee token and amount.

**Function Signature:**
```solidity
function setFee(address feeToken, uint256 feeAmount) external
```

**Description:**
Updates the fee token address and fee amount charged for lock operations.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `feeToken` | `address` | Address of token used for fees |
| `feeAmount` | `uint256` | Fee amount in token's smallest unit |

**Access Control:** Admin or Owner only

**Function Type:** State-changing

**Preconditions:**
- Caller must have `ADMIN_ROLE` or `OWNER_ROLE`

**Events Emitted:**
```solidity
event FeeParamsUpdated(address indexed feeToken, uint256 feeAmount);
```

**Error Conditions:**

| Error | Condition |
|-------|-----------|
| `NotAdmin()` | Caller lacks admin privileges |

**Gas Considerations:** ~40,000 - 60,000 gas

---

#### withdrawTreasury

Withdraw unlocked tokens from bridge treasury.

**Function Signature:**
```solidity
function withdrawTreasury(address token) external
```

**Description:**
Withdraws tokens that are not locked (i.e., fees collected). Cannot withdraw locked tokens.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `token` | `address` | Token address to withdraw |

**Access Control:** Admin or Owner only

**Function Type:** State-changing

**Preconditions:**
- Caller must have `ADMIN_ROLE` or `OWNER_ROLE`
- Contract balance must be greater than locked balance
- Withdrawable amount must be greater than zero

**Events Emitted:** None (transfer event from token contract)

**Error Conditions:**

| Error | Condition |
|-------|-----------|
| `NotAdmin()` | Caller lacks admin privileges |
| `InvalidAddress()` | Token address is zero |
| `InvalidAmount()` | No tokens available to withdraw |

**Gas Considerations:** ~50,000 - 80,000 gas

---

#### setVaultWallet

Set the vault wallet address for fee collection.

**Function Signature:**
```solidity
function setVaultWallet(address vaultWallet) external
```

**Description:**
Updates the vault wallet address where fees are sent.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `vaultWallet` | `address` | New vault wallet address |

**Access Control:** Admin or Owner only

**Function Type:** State-changing

**Preconditions:**
- Caller must have `ADMIN_ROLE` or `OWNER_ROLE`
- Vault wallet address must not be zero

**Events Emitted:**
```solidity
event VaultWalletUpdated(address indexed vaultWallet);
```

**Error Conditions:**

| Error | Condition |
|-------|-----------|
| `NotAdmin()` | Caller lacks admin privileges |
| `InvalidAddress()` | Vault wallet is zero address |

**Gas Considerations:** ~30,000 - 50,000 gas

---

#### grantSystemWallet

Grant system wallet role to an address.

**Function Signature:**
```solidity
function grantSystemWallet(address wallet) external
```

**Description:**
Grants `SYSTEM_WALLET_ROLE` to an address, allowing it to execute release and mint operations.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `wallet` | `address` | Address to grant system wallet role |

**Access Control:** Admin or Owner only

**Function Type:** State-changing

**Preconditions:**
- Caller must have `ADMIN_ROLE` or `OWNER_ROLE`
- Wallet address must not be zero

**Events Emitted:**
```solidity
event SystemWalletGranted(address indexed wallet, address indexed grantedBy, uint256 timestamp);
event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender);
```

**Error Conditions:**

| Error | Condition |
|-------|-----------|
| `NotAdmin()` | Caller lacks admin privileges |
| `InvalidAddress()` | Wallet is zero address |

**Gas Considerations:** ~40,000 - 60,000 gas

---

#### revokeSystemWallet

Revoke system wallet role from an address.

**Function Signature:**
```solidity
function revokeSystemWallet(address wallet) external
```

**Description:**
Revokes `SYSTEM_WALLET_ROLE` from an address.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `wallet` | `address` | Address to revoke system wallet role |

**Access Control:** Admin or Owner only

**Function Type:** State-changing

**Preconditions:**
- Caller must have `ADMIN_ROLE` or `OWNER_ROLE`
- Wallet address must not be zero

**Events Emitted:**
```solidity
event SystemWalletRevoked(address indexed wallet, address indexed revokedBy, uint256 timestamp);
event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender);
```

**Error Conditions:**

| Error | Condition |
|-------|-----------|
| `NotAdmin()` | Caller lacks admin privileges |
| `InvalidAddress()` | Wallet is zero address |

**Gas Considerations:** ~30,000 - 50,000 gas

---

### 3. Owner Functions

---

#### updateOwner

Initiate ownership transfer (two-step process).

**Function Signature:**
```solidity
function updateOwner(address newOwner) external
```

**Description:**
Initiates ownership transfer. New owner must call `acceptOwnership()` to complete transfer.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `newOwner` | `address` | Address of new owner |

**Access Control:** Owner only

**Function Type:** State-changing

**Preconditions:**
- Caller must have `OWNER_ROLE`
- New owner address must not be zero

**Events Emitted:**
```solidity
event OwnershipTransferInitiated(address indexed currentOwner, address indexed pendingOwner, uint256 timestamp);
```

**Error Conditions:**

| Error | Condition |
|-------|-----------|
| `AccessControlUnauthorizedAccount()` | Caller lacks OWNER_ROLE |
| `InvalidAddress()` | New owner is zero address |

**Gas Considerations:** ~40,000 - 60,000 gas

---

#### acceptOwnership

Accept ownership transfer.

**Function Signature:**
```solidity
function acceptOwnership() external
```

**Description:**
Completes ownership transfer. Can only be called by pending owner.

**Parameters:** None

**Access Control:** Pending owner only

**Function Type:** State-changing

**Preconditions:**
- Caller must be the pending owner (set by `updateOwner()`)

**Events Emitted:**
```solidity
event OwnerUpdated(address indexed oldOwner, address indexed newOwner, uint256 timestamp);
event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender);
event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender);
```

**Error Conditions:**

| Error | Condition |
|-------|-----------|
| `InvalidCaller()` | Caller is not pending owner |

**Gas Considerations:** ~50,000 - 70,000 gas

**Code Example - Two-Step Ownership Transfer:**

```typescript
// Step 1: Current owner initiates transfer
const currentOwner = await ethers.getSigner(ownerAddress);
const newOwnerAddress = "0x1234...";

// Initiate ownership transfer
await bridge.connect(currentOwner).updateOwner(newOwnerAddress);

// Check pending owner
const pending = await bridge.pendingOwner();
console.log("Pending owner:", pending); // Should be newOwnerAddress

// Current owner is still the owner
const currentOwnerCheck = await bridge.getOwner();
console.log("Current owner:", currentOwnerCheck); // Still ownerAddress

// Step 2: New owner accepts ownership
const newOwner = await ethers.getSigner(newOwnerAddress);
await bridge.connect(newOwner).acceptOwnership();

// Verify ownership transfer completed
const finalOwner = await bridge.getOwner();
console.log("New owner:", finalOwner); // Now newOwnerAddress

const pendingAfter = await bridge.pendingOwner();
console.log("Pending owner:", pendingAfter); // Now address(0)
```

---

#### grantAdmin

Grant admin role to an address.

**Function Signature:**
```solidity
function grantAdmin(address admin) external
```

**Description:**
Grants `ADMIN_ROLE` to an address. Can be called by admin or owner.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `admin` | `address` | Address to grant admin role |

**Access Control:** Admin or Owner

**Function Type:** State-changing

**Preconditions:**
- Caller must have `ADMIN_ROLE` or `OWNER_ROLE`
- Admin address must not be zero

**Events Emitted:**
```solidity
event AdminGranted(address indexed admin, address indexed grantedBy, uint256 timestamp);
event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender);
```

**Error Conditions:**

| Error | Condition |
|-------|-----------|
| `NotAdmin()` | Caller lacks admin privileges |
| `InvalidAddress()` | Admin is zero address |

**Gas Considerations:** ~40,000 - 60,000 gas

---

#### revokeAdmin

Revoke admin role from an address.

**Function Signature:**
```solidity
function revokeAdmin(address admin) external
```

**Description:**
Revokes `ADMIN_ROLE` from an address. Only owner can revoke.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `admin` | `address` | Address to revoke admin role |

**Access Control:** Owner only

**Function Type:** State-changing

**Preconditions:**
- Caller must have `OWNER_ROLE`
- Admin address must not be zero

**Events Emitted:**
```solidity
event AdminRevoked(address indexed admin, address indexed revokedBy, uint256 timestamp);
event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender);
```

**Error Conditions:**

| Error | Condition |
|-------|-----------|
| `AccessControlUnauthorizedAccount()` | Caller lacks OWNER_ROLE |
| `InvalidAddress()` | Admin is zero address |

**Gas Considerations:** ~30,000 - 50,000 gas

---

### 4. View Functions

---

#### getFeeAmount

Get the current fee amount.

**Function Signature:**
```solidity
function getFeeAmount() external view returns (uint256)
```

**Description:** Returns the fee amount charged for lock operations.

**Parameters:** None

**Returns:** `uint256` - Fee amount in fee token's smallest unit

**Access Control:** Public (anyone can call)

**Function Type:** View (read-only, no gas cost)

---

#### getFeeToken

Get the fee token address.

**Function Signature:**
```solidity
function getFeeToken() external view returns (address)
```

**Description:** Returns the address of the token used for fees.

**Parameters:** None

**Returns:** `address` - Fee token contract address

**Access Control:** Public (anyone can call)

**Function Type:** View (read-only, no gas cost)

---

#### getAllSystemWallets

Get all system wallet addresses.

**Function Signature:**
```solidity
function getAllSystemWallets() external view returns (address[] memory)
```

**Description:** Returns array of all addresses with system wallet role.

**Parameters:** None

**Returns:** `address[]` - Array of system wallet addresses

**Access Control:** Public (anyone can call)

**Function Type:** View (read-only, no gas cost)

---

#### isSystemWallet

Check if an address is a system wallet.

**Function Signature:**
```solidity
function isSystemWallet(address wallet) external view returns (bool)
```

**Description:** Checks if an address has system wallet role.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `wallet` | `address` | Address to check |

**Returns:** `bool` - True if address has SYSTEM_WALLET_ROLE

**Access Control:** Public (anyone can call)

**Function Type:** View (read-only, no gas cost)

---

#### getLockedBalance

Get locked balance for a token.

**Function Signature:**
```solidity
function getLockedBalance(address token) external view returns (uint256)
```

**Description:** Returns the amount of tokens locked in the bridge.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `token` | `address` | Token contract address |

**Returns:** `uint256` - Locked balance in token's smallest unit

**Access Control:** Public (anyone can call)

**Function Type:** View (read-only, no gas cost)

---

#### isAdmin

Check if an address is an admin.

**Function Signature:**
```solidity
function isAdmin(address account) external view returns (bool)
```

**Description:** Checks if an address has admin or owner role.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `account` | `address` | Address to check |

**Returns:** `bool` - True if address has ADMIN_ROLE or OWNER_ROLE

**Access Control:** Public (anyone can call)

**Function Type:** View (read-only, no gas cost)

---

#### getAllAdmins

Get all admin addresses.

**Function Signature:**
```solidity
function getAllAdmins() external view returns (address[] memory)
```

**Description:** Returns array of all addresses with admin role.

**Parameters:** None

**Returns:** `address[]` - Array of admin addresses

**Access Control:** Public (anyone can call)

**Function Type:** View (read-only, no gas cost)

---

#### getOwner

Get the owner address.

**Function Signature:**
```solidity
function getOwner() external view returns (address)
```

**Description:** Returns the current owner address.

**Parameters:** None

**Returns:** `address` - Owner address

**Access Control:** Public (anyone can call)

**Function Type:** View (read-only, no gas cost)

---

#### pendingOwner

Get the pending owner address.

**Function Signature:**
```solidity
function pendingOwner() external view returns (address)
```

**Description:** Returns the address of the pending owner in a two-step ownership transfer. Returns `address(0)` if no transfer is pending.

**Parameters:** None

**Returns:** `address` - Pending owner address (or zero address if no transfer pending)

**Access Control:** Public (anyone can call)

**Function Type:** View (read-only, no gas cost)

**Usage Note:** This is a public state variable that can be queried to check if an ownership transfer is in progress. After `updateOwner()` is called, this will contain the proposed new owner's address until `acceptOwnership()` is called.

---

#### getTransactionIdUsed

Check if a transaction ID has been used.

**Function Signature:**
```solidity
function getTransactionIdUsed(string memory transactionId) external view returns (bool)
```

**Description:** Checks if a transaction ID has already been used (prevents replay attacks).

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `transactionId` | `string` | Transaction ID to check |

**Returns:** `bool` - True if transaction ID has been used

**Access Control:** Public (anyone can call)

**Function Type:** View (read-only, no gas cost)

---

