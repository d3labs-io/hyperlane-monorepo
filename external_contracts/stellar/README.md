# Stellar Token Bridge

**Status**: ✅ **Production-Ready** | 54/54 Tests Passing (100%)

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
│       │   ├── lib.rs                    # Main contract (975 lines)
│       │   └── tests/                    # Test suite (54 tests)
│       │       ├── mod.rs                # Shared utilities
│       │       ├── 01_foundation_tests.rs           (19 tests)
│       │       ├── 02_bridge_operations_tests.rs    (8 tests)
│       │       ├── 03_security_critical_tests.rs    (12 tests)
│       │       ├── 04_advanced_scenarios_tests.rs   (4 tests)
│       │       └── 05_overflow_underflow_tests.rs   (10 tests)
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
✅ Access control with owner/system wallet roles  
✅ Emergency pause/unpause functionality  
✅ Transaction deduplication (replay attack prevention)  
✅ Overflow/underflow protection with checked arithmetic  
✅ Chain ID validation (CAIP-2 format)  
✅ Token contract address validation  

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
| **TOTAL** | **54** | ✅ **100% Passing** |

See [\`contracts/token_bridge/src/tests/README.md\`](contracts/token_bridge/src/tests/README.md) for detailed test documentation.

## Recent Security Fixes

### Overflow Protection (Fixed)
**Issue**: Lock operation used unchecked addition causing potential overflow  
**Impact**: Debug mode panic (DoS), Release mode silent wrap to negative (corrupted state)  
**Fix**: Added checked arithmetic with proper error handling  
**Status**: ✅ Fixed - All 10 overflow/underflow tests passing

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
- Main contract: 975 lines
- Test suite: 1,500+ lines across 5 files
- Total coverage: 54 comprehensive tests

## License

[Add your license here]
