# Stellar Token Bridge

**Status**: ✅ **Production-Ready** | 65/65 Tests Passing (100%)

Cross-chain token bridge built on Soroban (Stellar) enabling secure token transfers between Stellar and other blockchain networks.

## Quick Start

```bash
# Build contracts
cargo build --release

# Run all tests
cargo test --lib

# Run specific test category
cargo test --lib tests::overflow_underflow_tests
```

## Project Structure

```text
stellar/
├── contracts/
│   └── token_bridge/
│       ├── src/
│       │   ├── lib.rs                    # Main contract (996 lines)
│       │   └── tests/                    # Test suite (65 tests, 3,161 lines)
│       │       ├── mod.rs                # Shared utilities
│       │       ├── 01_foundation_tests.rs           (19 tests)
│       │       ├── 02_bridge_operations_tests.rs    (8 tests)
│       │       ├── 03_security_critical_tests.rs    (12 tests)
│       │       ├── 04_advanced_scenarios_tests.rs   (4 tests)
│       │       ├── 05_overflow_underflow_tests.rs   (10 tests)
│       │       └── 06_ttl_resurrection_tests.rs     (12 tests)
│       └── Cargo.toml
├── Cargo.toml
└── README.md
```

## Features

### Core Bridge Operations
- **Lock**: Lock tokens on source chain for cross-chain transfer
- **Burn**: Burn wrapped tokens to unlock on original chain
- **Release**: Release locked tokens (system wallet only)
- **Mint**: Mint wrapped tokens (system wallet only)

### Security Features
✅ Access control with owner/admin/system wallet roles
✅ Emergency pause/unpause functionality
✅ Transaction deduplication (replay attack prevention)
✅ Overflow/underflow protection with checked arithmetic
✅ Chain ID validation (CAIP-2 format)
✅ Token contract address validation
✅ TTL management for persistent storage entries
✅ Upgrade-safe storage architecture

### Role-Based Access Control
Three distinct roles with specific permissions:

**Owner Role** (`owner`)
- Manage admins and system wallets
- Upgrade contract to new WASM
- Transfer ownership (2-step process)
- Full administrative control

**Admin Role** (`admin`)
- Pause/unpause contract operations
- Manage operational parameters
- Emergency response capabilities

**System Wallet Role** (`sys_wlt`)
- Execute Release operations (unlock tokens)
- Execute Mint operations (create wrapped tokens)
- Automated by off-chain relayers

### Cross-Chain Architecture
Event-driven model with off-chain relayers:
1. User initiates Lock/Burn on source chain
2. Bridge emits event with transfer data
3. Off-chain relayer observes and coordinates
4. Relayer calls Release/Mint on destination chain

## Test Coverage

| Category | Tests | Coverage |
|----------|-------|----------|
| Foundation | 19 | Core functionality, access control, initialization |
| Bridge Operations | 8 | Lock, Burn, Release, Mint operations |
| Security Critical | 12 | C-1, C-2, C-3, H-1, H-2, H-3, H-4 vulnerabilities |
| Advanced Scenarios | 4 | Multi-user, concurrent operations, edge cases |
| Overflow/Underflow | 10 | Arithmetic safety, max values, boundary conditions |
| TTL & Resurrection | 12 | Storage TTL extension, expiration, persistence |
| **TOTAL** | **65** | ✅ **100% Passing** |

See [\`contracts/token_bridge/src/tests/README.md\`](contracts/token_bridge/src/tests/README.md) for detailed test documentation.

## Storage Architecture

### Storage Type Strategy
The contract uses Soroban's three storage types strategically:

**Instance Storage** (Configuration)
- `CurrentChainId`: Chain identifier set during initialization
- `ProposedOwner`: Proposed new owner for 2-step ownership transfer
- Survives upgrades, tied to contract instance

**Persistent Storage** (Critical State)
- `LockedBalances(Address)`: Financial state tracking locked tokens
- Must be preserved accurately across upgrades
- Independent TTL management (30 days)
- Auto-extends on Release operations

**Temporary Storage** (Cost-Optimized)
- `TransactionIds(i128)`: Replay attack prevention
- Moved from persistent to temporary to reduce transaction fees
- Minimum TTL (100 ledgers)
- Expires after use to minimize storage costs

### TTL Management
- **Threshold**: 5 days (86,400 ledgers)
- **Extension**: 30 days (518,400 ledgers) for persistent entries
- **Auto-extension**: Triggered on Release operations
- **Resurrection**: Persistent entries can be restored after expiration

## Recent Security Fixes

### Overflow Protection (Fixed)
**Issue**: Lock operation used unchecked addition causing potential overflow
**Impact**: Debug mode panic (DoS), Release mode silent wrap to negative (corrupted state)
**Fix**: Added checked arithmetic with proper error handling
**Status**: ✅ Fixed - All 10 overflow/underflow tests passing

### Storage Optimization (Implemented)
**Change**: Moved TransactionIds from persistent to temporary storage
**Impact**: Reduced transaction fees while maintaining security
**Benefit**: Lower costs for users without compromising replay protection
**Status**: ✅ Implemented - All 12 TTL tests passing

See [\`OVERFLOW_UNDERFLOW_TEST_REPORT.md\`](OVERFLOW_UNDERFLOW_TEST_REPORT.md) for detailed analysis.

## Documentation

- **Test Suite**: [\`contracts/token_bridge/src/tests/README.md\`](contracts/token_bridge/src/tests/README.md)
- **Overflow Analysis**: [\`OVERFLOW_UNDERFLOW_TEST_REPORT.md\`](OVERFLOW_UNDERFLOW_TEST_REPORT.md)
- **Bridge Operations**: [\`BRIDGE_OPERATIONS_REFACTOR_SUMMARY.md\`](BRIDGE_OPERATIONS_REFACTOR_SUMMARY.md)
- **Architecture**: [\`CROSS_CHAIN_ARCHITECTURE_EXPLANATION.md\`](CROSS_CHAIN_ARCHITECTURE_EXPLANATION.md)

## Development

### Prerequisites
- Rust 1.70+
- Soroban CLI
- Stellar SDK

### Building (pre-require: Install soroban cli)
```bash
stellar contract build
```

### Testing
```bash
# All tests
cargo test --lib

# Specific category
cargo test --lib tests::security_critical_tests

# With output
cargo test --lib -- --nocapture
```

### Contract Size
- Main contract: 996 lines
- Test suite: 3,161 lines across 6 test files
- Total coverage: 65 comprehensive tests

### Dependencies
- **soroban-sdk**: 22.0.8
- **stellar-access**: 0.4.0 (Access control with role-based permissions)
- **stellar-macros**: 0.4.0 (Decorators for role checks and pause state)
- **stellar-contract-utils**: 0.4.0 (Pausable and upgradeable utilities)
- **stellar-tokens**: 0.4.0 (Token interface implementations)

## License

[Add your license here]
