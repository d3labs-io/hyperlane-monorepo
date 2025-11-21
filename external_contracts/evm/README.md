# Token Bridge Smart Contract

A secure, upgradeable cross-chain token bridge supporting both EVM and non-EVM blockchains with lock/release and burn/mint mechanisms.

## Features

- **Dual Token Mechanisms**: Lock/Release and Burn/Mint
- **Multi-Chain Support**: EVM and non-EVM chains via CAIP-2 standard
- **Security**: Transaction ID tracking, reentrancy protection, pausable, RBAC
- **Upgradeable**: UUPS proxy pattern with optional time-delayed upgrades
- **Configurable Fees**: ERC20 fee collection with refund support

## Quick Start

```bash
# Install dependencies
make install
# or: npm install

# Compile contracts
make compile
# or: npx hardhat compile

# Run tests
make test
# or: npx hardhat test
```

**For deployment**, see:
- 📘 [Quick Start Guide](./docs/QUICK_START.md) - 5-minute deployment
- 📗 [Full Deployment Guide](./docs/DEPLOYMENT.md) - Comprehensive step-by-step instructions
- 🔧 [Makefile Commands](#makefile-commands) - All available commands

## Architecture

The bridge uses a modular inheritance pattern with these core components:

- **TokenBridge**: Main contract with UUPS upgradeability and RBAC
- **BridgeUserOperations**: User operations (lock, burn)
- **BridgeSystemOperations**: System operations (release, mint)
- **BridgeStorage**: Shared state and events
- **TransactionIdTracker**: Replay attack prevention
- **BridgeProxy**: ERC1967 proxy for upgrades

## Chain Identification (CAIP-2)

The bridge uses **CAIP-2** standard for chain identification, supporting both EVM and non-EVM blockchains.

**Format**: `<namespace>:<reference>`

**Examples**:
- EVM chains: `eip155:1` (Ethereum), `eip155:137` (Polygon), `eip155:56` (BSC)
- Non-EVM chains: `stellar:pubnet`, `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`, `cosmos:cosmoshub-4`

**Benefits**: Zero collision risk, industry standard, future-proof, human-readable

## Access Control

- **OWNER_ROLE**: Full administrative control, grant/revoke roles
- **ADMIN_ROLE**: Configure fees, vault, system wallets, pause/unpause
- **SYSTEM_WALLET_ROLE**: Execute release/mint operations
- **UPGRADER_ROLE**: Propose and execute upgrades

## Security Features

- Transaction ID tracking (prevents replay attacks)
- Reentrancy protection on all state-changing functions
- Pausable for emergency stops
- Two-step ownership transfer
- Locked balance tracking (separate from contract balance)
- Safe ERC20 operations

## Bridge Operations

All operations use the unified `executeBridgeOperation()` interface:

```solidity
enum BridgeOperation {
    LOCK_WITH_FEE,  // User: lock tokens
    BURN,           // User: burn tokens
    RELEASE,        // System: release tokens
    MINT            // System: mint tokens
}
```

**Lock/Release Flow**: User locks tokens → Relayer detects event → System wallet releases on destination chain

**Burn/Mint Flow**: User burns tokens → Relayer detects event → System wallet mints on destination chain

## Deployment

### Quick Deployment

```bash
# 1. Set up environment
make setup-env
# Edit .env with your configuration

# 2. Compile contracts
make compile

# 3. Deploy to network
make deploy NETWORK=pruvTestnet

# 4. Update .env with PROXY_ADDRESS

# 5. Verify contract (optional)
make verify NETWORK=pruvTestnet
```

### Manual Deployment

1. **Configure `.env` file**:
```env
PRIVATE_KEY=your_private_key_without_0x
OWNER_ADDRESS=0x...
SYSTEM_WALLET_ADDRESS=0x...
FEE_TOKEN_ADDRESS=0x...
FEE_AMOUNT=100000000000000000  # 0.1 tokens (18 decimals)
CURRENT_CHAIN_ID=eip155:1  # CAIP-2 format
```

2. **Deploy**:
```bash
npx hardhat run scripts/deploy.ts --network <network>
```

3. **Verify** (optional):
```bash
npx hardhat verify --network <network> <PROXY_ADDRESS>
```

**📘 For detailed deployment instructions, see [DEPLOYMENT.md](./docs/DEPLOYMENT.md)**

## Usage Example

```typescript
// User locks tokens
await bridge.connect(user).executeBridgeOperation(0, {
  fromToken: token.target,
  toToken: "",
  amount: ethers.parseEther("100"),
  fromAddress: user.address,
  toAddress: recipientAddress,
  fromNetwork: "eip155:1",      // Ethereum
  toNetwork: "eip155:137",      // Polygon
  transactionId: "unique-tx-id",
  email: "user@example.com",
  refund: { feeToken: ethers.ZeroAddress, feeAmount: 0 }
});

// System wallet releases tokens on destination chain
await bridge.connect(systemWallet).executeBridgeOperation(2, {
  fromToken: token.target,
  toToken: "",
  amount: ethers.parseEther("100"),
  fromAddress: user.address,
  toAddress: recipientAddress,
  fromNetwork: "eip155:1",
  toNetwork: "eip155:137",
  transactionId: "unique-tx-id",
  email: "user@example.com",
  refund: { feeToken: feeToken.target, feeAmount: FEE_AMOUNT }
});
```

## Key Functions

**Admin**:
- `setFee(address feeToken, uint256 feeAmount)` - Configure fees
- `grantSystemWallet(address wallet)` / `revokeSystemWallet(address wallet)` - Manage system wallets
- `pause(string reason)` / `unpause(string reason)` - Emergency controls
- `updateOwner(address newOwner)` / `acceptOwnership()` - Two-step ownership transfer

**View**:
- `getLockedBalance(address token)` - Check locked token balance
- `getTransactionIdUsed(string transactionId)` - Check if transaction ID is used
- `getAllSystemWallets()` - List all system wallets

## Transaction ID System

The bridge uses **string-based transaction IDs** for replay attack prevention:

- Global scope: unique across all users and operations
- String-based: compatible with any blockchain format
- Case-sensitive
- Each ID can only be used once

Example formats: `"0x1234..."`, `"bridge_tx_12345"`, `"550e8400-e29b-41d4-a716-446655440000"`

## Upgrades

```bash
# Using Makefile
make upgrade NETWORK=pruvTestnet

# Or manually
export PROXY_ADDRESS=0x...
npx hardhat run scripts/upgrade.ts --network <network>
```

- Upgrader must have UPGRADER_ROLE
- All state is preserved (locked balances, roles, configuration)
- Optional timelock can be configured

## Makefile Commands

The project includes a comprehensive Makefile for common operations:

### Installation & Compilation
```bash
make install          # Install dependencies
make compile          # Compile contracts
make clean            # Clean artifacts and cache
make test             # Run all tests
make coverage         # Generate test coverage report
```

### Deployment
```bash
make deploy NETWORK=pruvTestnet              # Deploy to network
make verify NETWORK=pruvTestnet              # Verify contract
make deploy-and-verify NETWORK=pruvTestnet   # Deploy and verify
make check-balance NETWORK=pruvTestnet       # Check deployer balance
```

### Contract Interactions
```bash
make grant-admin NETWORK=pruvTestnet ADMIN_ADDRESS=0x...  # Grant admin role
make lock-tokens NETWORK=pruvTestnet                      # Lock tokens (test)
make unlock-tokens NETWORK=pruvTestnet                    # Unlock tokens
make burn-tokens NETWORK=pruvTestnet                      # Burn tokens (test)
make mint-tokens NETWORK=pruvTestnet                      # Mint tokens
```

### Upgrades
```bash
make upgrade NETWORK=pruvTestnet             # Upgrade contract
make force-import NETWORK=pruvTestnet        # Import existing proxy
```

### Development Tools
```bash
make console NETWORK=pruvTestnet             # Open Hardhat console
make node                                    # Start local Hardhat node
make test-deployment NETWORK=pruvTestnet     # Test deployment
make env-check                               # Check environment variables
make help                                    # Show all commands
```

### Quick Aliases
```bash
make d NETWORK=pruvTestnet    # Alias for deploy
make v NETWORK=pruvTestnet    # Alias for verify
make t                        # Alias for test
make c                        # Alias for compile
make h                        # Alias for help
```

**Run `make help` to see all available commands with descriptions.**

## Emergency Procedures

1. **Pause**: `await bridge.pause("reason")`
2. **Investigate and fix**
3. **Rotate system wallet** (if compromised): `await bridge.grantSystemWallet(newWallet)`
4. **Unpause**: `await bridge.unpause("resolved")`

## Important Events

- `Operation` - All bridge operations (lock, burn, release, mint)
- `FeeCollected` / `FeeRefunded` - Fee tracking
- `EmergencyPause` / `EmergencyUnpause` - Emergency controls
- `OwnershipTransferInitiated` / `OwnerUpdated` - Ownership changes

## License

MIT

---

**⚠️ Security Notice**: Always audit smart contracts before mainnet deployment. This contract handles user funds and requires thorough security review.
