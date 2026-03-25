# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**PRUV Bridge SC** is D3Labs' fork of the Hyperlane interchain messaging protocol, customized for the PRUV bridge product. It enables cross-chain token transfers with built-in fee collection, sender whitelisting, and RWA (Real World Asset) token support.

The monorepo contains four main components:

1. **Smart Contracts (Solidity)** - Core Hyperlane messaging + D3Labs custom contracts (fee tokens, whitelisting)
2. **TypeScript SDK** - Developer tools, multi-protocol abstractions, and Starknet bindings
3. **Rust Agents** - Off-chain relayer network and validator infrastructure
4. **External Contracts** - Standalone bridge contracts for EVM and Stellar chains

## D3Labs Custom Contracts

The following contracts are D3Labs additions on top of the Hyperlane base:

### Token with Fee (`solidity/contracts/token/extensions/token_with_fee/`)
- `HypERC20CollateralWithFee.sol` - ERC20 collateral router with cross-chain fee collection
- `HypFiatTokenWithFee.sol` - Fiat-backed token (e.g., USDC/USDT) router with fee support
- `RouterFeeCollector.sol` - Fee collection contract (max 10 USD, uses USDT/USDC 6 decimals)

### Custom Hooks (`solidity/contracts/hooks/`)
- `SenderWhitelistHook.sol` - Restricts bridge usage to whitelisted senders (for zero-gas chains)

### External Contracts (`external_contracts/`)
- `evm/` - Standalone EVM bridge: `TokenBridge.sol`, `BridgeStorage.sol`, `BridgeUserOperations.sol`, `BridgeSystemOperations.sol`
- `stellar/` - Soroban token bridge contracts

### Deployment Scripts (`deployment_scripts/`)
- `deploy_router_fee_collector.sh` - Deploy RouterFeeCollector
- `deploy_rwa_token.sh` - Deploy RWA token contracts
- `deploy_sender_whitelist_hook.sh` - Deploy SenderWhitelistHook

### Deployment Asset Scripts (`external_contracts/deployment-asset-script/`)
- Hardhat-based deployment scripts for external bridge assets
- Separate `package.json` (uses npm, not yarn)
- Contains contracts, scripts, and tests for asset deployment

### Bridge Scripts (`scripts/`)
- `scripts-usdt/` - TypeScript scripts for programmatic USDT bridging between Kaia and PRUV
- `scripts-rwa/` - TypeScript scripts for RWA token bridge operations

## Supported Chains
- **EVM**: Ethereum, Avalanche Fuji, Kaia (mainnet), Kairos (Kaia testnet)
- **Stellar**: Soroban contracts
- **Starknet**: Cairo contracts (via TypeScript bindings)
- **Solana**: In development (`feat/solana-bridge` branch)

## Development Commands

### Building

```bash
# Build everything using Turbo
yarn build

# Build specific workspaces
yarn --cwd solidity build          # Solidity contracts with Hardhat + Forge
yarn --cwd typescript/sdk build    # TypeScript SDK
cd rust/main && cargo build        # Rust agents
```

### Testing

```bash
# Run all tests
yarn test

# Solidity tests
yarn --cwd solidity test           # Both Hardhat and Forge tests
yarn --cwd solidity test:hardhat   # Hardhat tests only
yarn --cwd solidity test:forge     # Forge tests only

# TypeScript SDK tests
yarn --cwd typescript/sdk test     # Unit, Hardhat, and Foundry tests
yarn --cwd typescript/sdk test:unit

# Rust tests
cd rust/main && cargo test

# End-to-end testing
cd rust/main && cargo run --release --bin run-locally
```

### Linting & Formatting

```bash
yarn lint                          # Lint all workspaces
yarn prettier                      # Format all workspaces
yarn --cwd solidity lint           # Solidity-specific linting with solhint
cd rust/main && cargo clippy       # Rust linting
```

### Development Workflows

```bash
# Solidity development
yarn --cwd solidity hardhat-esm compile    # Compile contracts
yarn --cwd solidity fixtures               # Generate test fixtures
forge test -vvv --decode-internal          # Detailed Forge testing

# Generate gas snapshots
yarn --cwd solidity gas

# Run single Rust test
cd rust/main && cargo test <test_name>

# Run specific VM E2E tests
cargo test --release --package run-locally --features cosmos -- cosmos::test --nocapture
cargo test --release --package run-locally --features sealevel -- sealevel::test --nocapture
```

## Architecture

### Message Flow

1. **Dispatch**: Applications send messages via `Mailbox.dispatch()` on origin chain
2. **Index**: Rust relayer agents index dispatched messages from chain events
3. **Security**: Relayers fetch required security metadata from validators/ISMs
4. **Delivery**: Messages are delivered to destination `Mailbox.process()` with proofs
5. **Handle**: Destination applications receive messages via `IMessageRecipient.handle()`

### Core Contracts (`solidity/contracts/`)

**Mailbox** (`Mailbox.sol`)

- Central hub for message dispatch and processing
- Maintains merkle tree of dispatched messages
- Processes inbound messages with security verification

**Interchain Security Modules** (`isms/`)

- Pluggable security verification (multisig, merkle proofs, etc.)
- Each destination can specify its required security model
- Key types: `MultisigIsm`, `MerkleRootMultisigIsm`, `AggregationIsm`

**Hooks** (`hooks/`)

- Post-dispatch processing (gas payments, etc.)
- `MerkleTreeHook`: Maintains message merkle tree
- `InterchainGasPaymaster`: Handles gas fee payments

**Token Bridge** (`token/`)

- `HypERC20`: Native token implementations
- `HypERC20Collateral`: Wrapped/collateral token implementations
- Multi-chain token deployments with unified liquidity

### TypeScript SDK (`typescript/sdk/src/`)

**Core Abstractions**

- `MultiProvider`: Multi-chain provider management with protocol adapters
- `HyperlaneCore`: Factory for core contract interactions
- `MultiProtocolCore`: Protocol-agnostic abstractions (EVM, Cosmos, Sealevel, Starknet)

**Key Patterns**

- `ChainMap<T>`: Type-safe per-chain configuration mapping
- `MultiProtocolProvider`: Unified interface across different VMs
- Adapter pattern for protocol-specific implementations

### Rust Agents (`rust/main/`)

**Agent Types**

- **Relayer** (`agents/relayer/`): Indexes origin chains, delivers messages to destinations
- **Validator** (`agents/validator/`): Signs checkpoints for message verification
- **Scraper** (`agents/scraper/`): Indexes chain data for analytics

**Chain Support** (`chains/`)

- `hyperlane-ethereum`: EVM chain support
- `hyperlane-cosmos`: Cosmos ecosystem support
- `hyperlane-sealevel`: Solana/SVM support
- `hyperlane-fuel`: Fuel VM support

**Architecture**

- `hyperlane-core`: Core traits and message types
- `hyperlane-base`: Shared agent utilities and configuration
- Chain-specific implementations provide VM-specific contract interactions

## Key Concepts

**Domain**: Unique identifier for each blockchain (not the same as chain ID)

**Message**: Core data structure containing sender, recipient, origin/destination domains, and body

**ISM (Interchain Security Module)**: Pluggable security verification - destinations choose their security requirements

**Hook**: Post-dispatch processing module (gas payments, message indexing, etc.)

**Checkpoint**: Validator-signed commitment to a message merkle root at specific index

**Gas Price Escalation**: Automatic gas price increases for stuck transactions using formula: `Max(Min(Max(Escalate(oldGasPrice), newEstimatedGasPrice), gasPriceCapMultiplier × newEstimatedGasPrice), oldGasPrice)` - preventing indefinite escalation while maintaining competitiveness and ensuring RBF compatibility. The `gasPriceCapMultiplier` is configurable per chain in transactionOverrides (default: 3)

## Configuration Files

- `rust/main/config/`: Contains chain configurations for mainnet/testnet deployments
- Contract addresses and deployment metadata automatically synced from these configs
- Agents automatically discover and use all configurations in this directory

## Project-Specific Conventions

- **Solidity version**: `0.8.22` (fixed, all D3Labs custom contracts use this explicitly)
- **Foundry**: EVM version `paris`, optimizer runs `999_999`
- **Package manager**: `yarn@4.5.1` (Yarn Berry)
- **Node version**: v20
- **Monorepo tool**: Turborepo
- **Workspaces**: `solidity`, `typescript/*`, `starknet`
- **Git organization**: `d3labs-io` on private GitHub (`github-d3labs.com`)
- **Upstream**: Forked from Hyperlane — periodic sync via merge PRs (e.g., `Feat/sync fork`)
- **External contracts** (`external_contracts/evm/`): Use Hardhat with separate `package.json` (npm, not yarn)

## Incident Debugging & Operations

When debugging Hyperlane operational incidents (stuck messages, RPC failures, validator issues, gas problems, warp route imbalances, etc.), **always check the documentation in `docs/ai-agents/operational-debugging.md`** first. This contains:

- **AI-powered debugging workflows** using Grafana and GCP logging integration
- **Grafana dashboard analysis** with key panels for incident triage (Easy Dashboard, Validator Dashboards, Lander Dashboard, RPC Usage & Errors)
- **Progressive GCP log query strategies** to efficiently analyze logs with minimal token usage
- **Error pattern recognition and decoding techniques** (gas estimation failures, validator delays, RPC issues)
- **Hyperlane Explorer integration** for finding stuck messages before querying logs
- **Specific debugging workflows** for common incident types (queue length alerts, CouldNotFetchMetadata errors, RPC provider issues, etc.)

**Manual Operations Runbook**: The comprehensive [Operations Runbook](https://www.notion.so/hyperlanexyz/Runbook-AI-Agent-24a6d35200d680229b38e8501164ca66) contains detailed procedures for:

- Agent deployment and redeployment procedures
- RPC URL rotation when providers fail
- Validator operations and reorg recovery
- Manual message processing and retry procedures
- Balance management and key funding
- Security incident response protocols
- Lander (transaction submitter) configuration and troubleshooting
