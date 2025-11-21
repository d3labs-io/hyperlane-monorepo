# TokenBridge Contract Deployment Guide

This guide covers the complete deployment process for the TokenBridge smart contract on Stellar networks.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Step 1: Build the Contract](#step-1-build-the-contract)
- [Step 2: Deploy to Network](#step-2-deploy-to-network)
- [Step 3: Verify Deployment](#step-3-verify-deployment)
- [Using Makefile Commands](#using-makefile-commands)
- [Network Configuration](#network-configuration)
- [Troubleshooting](#troubleshooting)
- [Upgrading the Contract](#upgrading-the-contract)
- [Next Steps](#next-steps)

---

## Prerequisites

Before deploying the contract, ensure you have:

1. **Stellar Soroban CLI installed**
   ```bash
   # Install via cargo
   cargo install --locked stellar-cli --features opt
   
   # Verify installation
   stellar --version
   ```

2. **Funded deployer account**
   ```bash
   # Generate a new keypair (or use existing)
   stellar keys generate admin --network testnet
   
   # Fund the account (testnet only)
   stellar keys fund admin --network testnet
   
   # Check balance
   stellar keys address admin
   ```

3. **Network configuration**

   **Testnet (Pre-configured):**

   The testnet network is already configured by default when you install the Stellar CLI. You can verify this by running:
   ```bash
   stellar network ls
   ```

   You should see `testnet` in the list. If not, you can add it manually:
   ```bash
   stellar network add \
     --global testnet \
     --rpc-url https://soroban-testnet.stellar.org:443 \
     --network-passphrase "Test SDF Network ; September 2015"
   ```

   **Mainnet (Requires Third-Party RPC):**

   ⚠️ **Important:** For mainnet deployment, you need to obtain an RPC endpoint from a third-party provider, as Stellar does not provide a public mainnet RPC endpoint.

   **Third-party RPC providers include:**
   - **Validation Cloud** - https://validationcloud.io/
   - **Ankr** - https://www.ankr.com/rpc/stellar/
   - **NowNodes** - https://nownodes.io/nodes/stellar
   - **QuickNode** - https://www.quicknode.com/chains/xlm

   Once you have obtained an RPC endpoint, configure mainnet:
   ```bash
   stellar network add \
     --global mainnet \
     --rpc-url <YOUR_THIRD_PARTY_RPC_URL> \
     --network-passphrase "Public Global Stellar Network ; September 2015"
   ```

   Example with a third-party provider:
   ```bash
   stellar network add \
     --global mainnet \
     --rpc-url https://your-provider.com/stellar-mainnet \
     --network-passphrase "Public Global Stellar Network ; September 2015"
   ```

---

## Step 1: Build the Contract

Build the contract to generate the compiled WASM file:

```bash
stellar contract build
```

**Output:**
- Compiled WASM file: `target/wasm32v1-none/release/inter_token.wasm`
- The build process optimizes the contract for deployment

**Using Makefile:**
```bash
make build
```

---

## Step 2: Deploy to Network

Deploy the contract to your target network with initialization parameters.

### Deployment Command Structure

```bash
stellar contract deploy \
  --source-account <DEPLOYER_ACCOUNT> \
  --wasm target/wasm32v1-none/release/inter_token.wasm \
  --network <NETWORK> \
  -- \
  --owner <OWNER_ADDRESS> \
  --system_wallet <SYSTEM_WALLET_ADDRESS> \
  --current_chain_id <CHAIN_ID>
```

### Parameter Explanations

| Parameter | Description | Example |
|-----------|-------------|---------|
| `--source-account` | The deployer account that pays for deployment. Must be created via `stellar keys` CLI and funded with XLM. Can be an alias (e.g., 'admin') or full address. | `admin` or `GBUQW...` |
| `--wasm` | Path to the compiled WASM file from Step 1 | `target/wasm32v1-none/release/inter_token.wasm` |
| `--network` | The Stellar network to deploy to | `testnet` or `mainnet` |
| `--owner` | **Contract initialization parameter** - The address that will own the contract. This address can upgrade the contract, manage admins, and perform administrative tasks. | `admin` or `GBUQW...` |
| `--system_wallet` | **Contract initialization parameter** - The address for the backend hot wallet. This address can execute bridge operations (mint/release tokens). | `admin` or `GBUQW...` |
| `--current_chain_id` | **Contract initialization parameter** - The chain identifier in CAIP-2 format. Must be either `stellar:testnet` or `stellar:mainnet` depending on the target network. | `stellar:testnet` |

### Example: Deploy to Testnet

```bash
stellar contract deploy \
  --source-account admin \
  --wasm target/wasm32v1-none/release/inter_token.wasm \
  --network testnet \
  -- \
  --owner admin \
  --system_wallet admin \
  --current_chain_id stellar:testnet
```

### Example: Deploy to Mainnet

```bash
stellar contract deploy \
  --source-account deployer \
  --wasm target/wasm32v1-none/release/inter_token.wasm \
  --network mainnet \
  -- \
  --owner GBUQW... \
  --system_wallet GCZYX... \
  --current_chain_id stellar:mainnet
```

**Important Notes:**
- The `--owner` and `--system_wallet` can be the same address for testing, but should be different in production
- The `--current_chain_id` must match the network you're deploying to
- Save the contract ID returned by the deployment command - you'll need it for all future interactions

**Using Makefile:**
```bash
# Deploy to testnet
make deploy NETWORK=testnet SOURCE_ACCOUNT=admin OWNER=admin SYSTEM_WALLET=admin

# Deploy to mainnet
make deploy NETWORK=mainnet SOURCE_ACCOUNT=deployer OWNER=GBUQW... SYSTEM_WALLET=GCZYX...
```

---

## Step 3: Verify Deployment

After deployment, verify the contract is working correctly:

```bash
# Get contract information
stellar contract info --id <CONTRACT_ID> --network <NETWORK>

# Test: Get owner
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network <NETWORK> \
  -- \
  get_owner

# Test: Get system wallet
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network <NETWORK> \
  -- \
  get_system_wallet

# Test: Get current chain ID
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network <NETWORK> \
  -- \
  get_current_chain_id
```

```

---

## Using Makefile Commands

The Makefile provides convenient commands for the entire deployment workflow:

### Available Commands

```bash
# Build the contract
make build

# Deploy to network
make deploy NETWORK=testnet SOURCE_ACCOUNT=admin OWNER=admin SYSTEM_WALLET=admin

# Complete deployment workflow
make deploy-complete NETWORK=testnet SOURCE_ACCOUNT=admin OWNER=admin SYSTEM_WALLET=admin
```

### Environment Variables

You can set environment variables to avoid repeating parameters:

```bash
export NETWORK=testnet
export SOURCE_ACCOUNT=admin
export OWNER=admin
export SYSTEM_WALLET=admin

make deploy
```

---

## Network Configuration

### Testnet (Pre-configured by Default)

The testnet network is **automatically configured** when you install the Stellar CLI. No additional setup is required.

- **Status:** ✅ Pre-configured by default
- **RPC URL:** `https://soroban-testnet.stellar.org:443` (Stellar Foundation)
- **Network Passphrase:** `Test SDF Network ; September 2015`
- **Chain ID:** `stellar:testnet`
- **Faucet:** Available via `stellar keys fund <ACCOUNT> --network testnet`
- **Cost:** Free (test XLM)

**Verify testnet configuration:**
```bash
stellar network ls
```

### Mainnet (Requires Third-Party RPC Provider)

⚠️ **Important:** Mainnet requires you to obtain an RPC endpoint from a **third-party provider**. Stellar does not provide a public mainnet RPC endpoint.

- **Status:** ⚙️ Requires manual configuration
- **RPC URL:** Must be obtained from a third-party provider (see below)
- **Network Passphrase:** `Public Global Stellar Network ; September 2015`
- **Chain ID:** `stellar:mainnet`
- **Faucet:** Not available (requires real XLM)
- **Cost:** Real XLM required for transactions

**Third-party RPC providers:**
- **Validation Cloud** - https://validationcloud.io/
- **Ankr** - https://www.ankr.com/rpc/stellar/
- **NowNodes** - https://nownodes.io/nodes/stellar
- **QuickNode** - https://www.quicknode.com/chains/xlm

**Configure mainnet after obtaining RPC endpoint:**
```bash
stellar network add \
  --global mainnet \
  --rpc-url <YOUR_THIRD_PARTY_RPC_URL> \
  --network-passphrase "Public Global Stellar Network ; September 2015"
```

**Example:**
```bash
stellar network add \
  --global mainnet \
  --rpc-url https://your-provider.com/stellar-mainnet \
  --network-passphrase "Public Global Stellar Network ; September 2015"
```

---

## Troubleshooting

### Common Issues

**1. "Account not found" error**
- Ensure your deployer account is funded with XLM
- For testnet: `stellar keys fund <ACCOUNT> --network testnet`

**2. "Invalid chain ID" error**
- Verify `--current_chain_id` matches the network (`stellar:testnet` or `stellar:mainnet`)
- Chain ID must be between 3-64 characters and follow CAIP-2 format

**3. "Insufficient balance" error**
- Fund your deployer account with more XLM
- Deployment costs vary based on contract size

**4. "WASM file not found" error**
- Run `make build` or `stellar contract build` first
- Verify the WASM path: `target/wasm32v1-none/release/inter_token.wasm`

**5. "Network not found" or "Connection refused" error (Mainnet)**
- Mainnet is **not pre-configured** - you must add it manually with a third-party RPC provider
- Verify network configuration: `stellar network ls`
- If mainnet is not listed, configure it with a third-party RPC endpoint (see [Network Configuration](#network-configuration))
- Ensure your RPC provider URL is correct and accessible
- Check if your RPC provider requires authentication or API keys

**6. "Network not found" error (Testnet)**
- Testnet should be pre-configured, but if missing, add it manually:
  ```bash
  stellar network add \
    --global testnet \
    --rpc-url https://soroban-testnet.stellar.org:443 \
    --network-passphrase "Test SDF Network ; September 2015"
  ```

### Getting Help

- Check contract logs: `stellar contract invoke --help`
- View network status: `stellar network ls`
- Stellar Discord: https://discord.gg/stellar
- Documentation: https://developers.stellar.org/docs/smart-contracts

---

## Upgrading the Contract

After deploying your contract, you may need to upgrade it in the future to add new features, fix bugs, or improve performance. The TokenBridge contract supports upgrades through the `upgrade` function.

### Upgrade Process Overview

The upgrade process consists of four steps:

1. **Build the contract** - Rebuild the contract with your changes
2. **Upload WASM to network** - Install the new WASM binary and get its hash
3. **Get the WASM hash** - Extract the hash from the upload process
4. **Invoke the upgrade function** - Call the contract's `upgrade` function with the new WASM hash

### Step-by-Step Upgrade Instructions

#### Step 1: Build the Contract

Make your code changes, then rebuild the contract:

```bash
stellar contract build
```

Or using Makefile:
```bash
make build
```

**Output:** Updated WASM file at `target/wasm32v1-none/release/inter_token.wasm`

---

#### Step 2: Upload WASM to Network

Upload the new WASM binary to the network to get its hash:

```bash
stellar contract upload \
  --source-account admin \
  --wasm target/wasm32v1-none/release/inter_token.wasm \
  --network testnet
```

**Using Makefile:**
```bash
make upload-wasm NETWORK=testnet SOURCE_ACCOUNT=admin
```

**Output Example:**
```
92065e8291dbc52d4dbe9187610aa043d35c84ed87049db2dc50e136f23c1363
```

**Important:** Save this WASM hash - you'll need it for the next step!

---

#### Step 3: Get the WASM Hash

The WASM hash is returned from the upload command in Step 2. You can save it to a variable:

```bash
# Save hash to variable
WASM_HASH=$(stellar contract upload \
  --source-account admin \
  --wasm target/wasm32v1-none/release/inter_token.wasm \
  --network testnet)

echo $WASM_HASH
```

Or save it to a file:
```bash
stellar contract upload \
  --source-account admin \
  --wasm target/wasm32v1-none/release/inter_token.wasm \
  --network testnet > wasm_hash.txt

cat wasm_hash.txt
```

---

#### Step 4: Invoke the Upgrade Function

Call the contract's `upgrade` function with the new WASM hash:

```bash
stellar contract invoke \
  --id CALC65ZF6G366W67RVSLLJDR2OF5RYEOVYZHULVGTLDDE42APBZ7SDLN \
  --source-account admin \
  --network testnet \
  -- \
  upgrade \
  --new_wasm_hash 92065e8291dbc52d4dbe9187610aa043d35c84ed87049db2dc50e136f23c1363 \
  --caller admin
```

**Parameter Explanations:**

| Parameter | Description | Example |
|-----------|-------------|---------|
| `--id` | The deployed contract ID that you want to upgrade | `CALC65ZF6G366W67RVSLLJDR2OF5RYEOVYZHULVGTLDDE42APBZ7SDLN` |
| `--source-account` | The account that will sign the transaction (must be the owner) | `admin` |
| `--network` | The network where the contract is deployed | `testnet` or `mainnet` |
| `--new_wasm_hash` | The WASM hash from Step 2 | `92065e82...` |
| `--caller` | The caller address (must be the contract owner) | `admin` |

**Using Makefile:**
```bash
make upgrade-contract \
  CONTRACT_ID=CALC65ZF6G366W67RVSLLJDR2OF5RYEOVYZHULVGTLDDE42APBZ7SDLN \
  NETWORK=testnet \
  SOURCE_ACCOUNT=admin \
  WASM_HASH=92065e8291dbc52d4dbe9187610aa043d35c84ed87049db2dc50e136f23c1363
```

---

### Complete Upgrade Workflow (One Command)

For convenience, you can use the `upgrade-complete` Makefile command that handles all steps automatically:

```bash
make upgrade-complete \
  CONTRACT_ID=CALC65ZF6G366W67RVSLLJDR2OF5RYEOVYZHULVGTLDDE42APBZ7SDLN \
  NETWORK=testnet \
  SOURCE_ACCOUNT=admin
```

This command will:
1. Build the contract
2. Upload the WASM and capture the hash
3. Invoke the upgrade function automatically

---

---

### Important Notes

⚠️ **Authorization Required:**
- Only the contract **owner** can upgrade the contract
- The `--source-account` and `--caller` must be the owner address
- Ensure the owner account has sufficient XLM for transaction fees

⚠️ **Data Persistence:**
- **Instance Storage** (CurrentChainId): Survives upgrades automatically
- **Persistent Storage** (TransactionIds, LockedBalances): Survives upgrades with data integrity
- All existing data is preserved during the upgrade

⚠️ **Testing:**
- Always test upgrades on testnet first before upgrading mainnet contracts
- Verify all contract functions work correctly after upgrade
- Check that existing data is still accessible

⚠️ **Rollback:**
- If you need to rollback, you can upgrade again to a previous WASM hash
- Keep track of previous WASM hashes for rollback purposes

---

### Upgrade Examples

**Example 1: Testnet Upgrade (Step-by-Step)**
```bash
# Step 1: Build
make build

# Step 2: Upload and get hash
stellar contract upload \
  --source-account admin \
  --wasm target/wasm32v1-none/release/inter_token.wasm \
  --network testnet
# Output: 92065e8291dbc52d4dbe9187610aa043d35c84ed87049db2dc50e136f23c1363

# Step 3: Upgrade (use hash from step 2)
stellar contract invoke \
  --id CALC65ZF6G366W67RVSLLJDR2OF5RYEOVYZHULVGTLDDE42APBZ7SDLN \
  --source-account admin \
  --network testnet \
  -- \
  upgrade \
  --new_wasm_hash 92065e8291dbc52d4dbe9187610aa043d35c84ed87049db2dc50e136f23c1363 \
  --caller admin
```

**Example 1b: Using Makefile Commands**
```bash
# Step 1: Upload and get hash
make upload-wasm NETWORK=testnet SOURCE_ACCOUNT=admin

# Step 2: Upgrade (use hash from step 1)
make upgrade-contract \
  CONTRACT_ID=CALC65... \
  NETWORK=testnet \
  SOURCE_ACCOUNT=admin \
  WASM_HASH=92065e82...
```

**Example 2: Mainnet Upgrade (Complete Workflow)**
```bash
make upgrade-complete \
  CONTRACT_ID=CALC65... \
  NETWORK=mainnet \
  SOURCE_ACCOUNT=deployer
```

---

## Next Steps

After successful deployment:

1. **Save the contract ID** - You'll need it for all interactions
2. **Configure additional admins** - Use `grant_role` to add admin addresses
3. **Add more system wallets** - Use `add_system_wallet` for multiple backend wallets
4. **Set up monitoring** - Monitor contract events and transactions
5. **Test bridge operations** - Execute test lock/mint and burn/release operations
6. **Plan for upgrades** - Keep track of WASM hashes for future upgrades or rollbacks

