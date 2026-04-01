# Pruv Testnet → Solana Devnet Bridge Guide

Complete guide to deploy and operate the Hyperlane bridge between **pruvtest** (EVM) and **Solana Devnet**, covering three tokens: PRUV native, USDC, and a custom ERC20.

This guide follows the **self-deployment path**: you deploy and own all Hyperlane core programs on Solana Devnet (mailbox, IGP, validator announce, multisig ISM). This gives you full control over your bridge's security model, ISM configuration, and upgrade path.

> For cost breakdowns, ongoing operational fees, and token mechanics, see [solana-business-bridge.md](solana-business-bridge.md).

---

## Table of Contents

1. [Overview and Architecture](#1-overview-and-architecture)
2. [Prerequisites](#2-prerequisites)
3. [Fee Estimation](#3-fee-estimation)
4. [Wallet Setup](#4-wallet-setup)
5. [Deploy Hyperlane Core on Solana Testnet](#5-deploy-hyperlane-core-on-solana-testnet)
6. [Deploy EVM Warp Routes on pruvtest](#6-deploy-evm-warp-routes-on-pruvtest)
7. [Deploy Solana Warp Routes](#7-deploy-solana-warp-routes)
8. [Configure ISM and Enroll Routers](#8-configure-ism-and-enroll-routers)
9. [Configure and Start Agents](#9-configure-and-start-agents)
10. [Test the Bridge](#10-test-the-bridge)
11. [Adding More Tokens to the Bridge](#11-adding-more-tokens-to-the-bridge)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Overview and Architecture

```
pruvtest (EVM, domain 7336)          Solana Devnet (domain 1399811151)
────────────────────────────         ─────────────────────────────────
Mailbox (existing)                   Mailbox (self-deployed, owned by you)
 └─ HypNative          ──dispatch──▶  └─ warp/token_native  → synthetic PRUV (SPL)
 └─ HypERC20Collateral ──dispatch──▶  └─ warp/token_collateral → synthetic USDC (SPL)
 └─ HypERC20Collateral ──dispatch──▶  └─ warp/token_collateral → synthetic ERC20 (SPL)
                                            │
                Validator signs checkpoint  │  Relayer delivers message
                ◀─────────────────────────────────────────────────────
```

**Bridge is bidirectional** — users can also bridge SPL tokens from Solana back to pruvtest. The same warp programs handle both directions.

**What is already deployed on pruvtest (no action needed):**

| Contract               | Address                                      |
| ---------------------- | -------------------------------------------- |
| Mailbox                | `0x72364A5F747a4e6E17b13Be4b421b879E95D95E7` |
| MerkleTreeHook         | `0xA08C7fc82aD1565Ea1b7eEB24618c4B24c2733EC` |
| InterchainGasPaymaster | `0x4D73607C4462cc0D3B2Ab93a7521CEfDB10f1EC5` |
| ValidatorAnnounce      | `0x3B25B046bf50E3D469bbF2610bf564f11a4dC8c2` |
| ProxyAdmin             | `0x823B2406490752fB50e1CABa809Bf643CD233553` |

**What you will deploy on Solana Devnet (Step 5):**

| Program                   | Description                                              |
| ------------------------- | -------------------------------------------------------- |
| `mailbox`                 | Core message dispatch and delivery hub                   |
| `igp`                     | Interchain Gas Paymaster — collects cross-chain gas fees |
| `validator_announce`      | Registers validator checkpoint storage locations         |
| `multisig_ism_message_id` | Verifies pruvtest validator signatures on messages       |

---

## 2. Prerequisites

### Software

| Tool                          | Version | Install                                              |
| ----------------------------- | ------- | ---------------------------------------------------- |
| Node.js                       | ≥ 18    | `nvm install 18`                                     |
| Yarn                          | 4.x     | `npm install -g yarn`                                |
| Solana CLI                    | 1.14.20 | `./rust/sealevel/programs/install-solana-1.14.20.sh` |
| Rust / Cargo                  | stable  | `rustup install stable`                              |
| Hyperlane CLI (built locally) | —       | `yarn --cwd typescript/cli build`                    |
| ts-node                       | —       | included via `tsx` in root `package.json`            |

### Build Hyperlane Solana Programs

```bash
cd rust/sealevel/programs
./build-programs.sh all
# Outputs .so files to rust/sealevel/target/deploy/
```

### Build Hyperlane Agents

```bash
cd rust/main
cargo build --bin validator --bin relayer
```

### Verify `cast` is available

```bash
cast --version
# If missing: https://book.getfoundry.sh/getting-started/installation
```

---

## 3. Fee Estimation

Before funding wallets, run the fee estimation script to get current costs:

```bash
npx ts-node scripts/estimate-testnet-fees.ts
```

The script queries live gas prices from pruvtest and rent costs from Solana Devnet and prints a detailed breakdown.

**Typical costs (estimates — run the script for current values):**

### Solana Devnet SOL Requirements (Self-Deployment)

| Step                                        | SOL Required      |
| ------------------------------------------- | ----------------- |
| Core programs — mailbox (205 KB)            | ~1.46 SOL (rent)  |
| Core programs — IGP (243 KB)                | ~1.73 SOL (rent)  |
| Core programs — validator_announce (134 KB) | ~0.96 SOL (rent)  |
| Core programs — multisig_ism (190 KB)       | ~1.35 SOL (rent)  |
| Transaction fees for core deploy            | ~0.5 SOL          |
| Warp route — PRUV native (token_native)     | ~0.5–0.7 SOL      |
| Warp route — USDC (synthetic)               | ~0.5–0.7 SOL      |
| Warp route — Custom ERC20 (collateral)      | ~0.6–0.8 SOL      |
| ATA payer funding (0.5 SOL × 3 tokens)      | 1.5 SOL           |
| Buffer + transaction overhead               | ~0.5 SOL          |
| **Total (core + 3 tokens)**                 | **~9.5–10.5 SOL** |

> **Liquidity note**: Each program needs a temporary buffer account during upload (same size as the program). You need ~11 SOL liquid during the deploy window; ~5.5 SOL is returned after the buffer accounts are closed. SOL can be obtained free from the Solana Devnet faucet. See Section 4.

> For full rent and ongoing cost analysis, see [solana-business-bridge.md](solana-business-bridge.md).

### pruvtest PRUV Requirements

| Step                                    | Gas (approx.)   | PRUV cost (1 Gwei) |
| --------------------------------------- | --------------- | ------------------ |
| Deploy HypNative (PRUV warp)            | ~3,500,000      | ~0.0035 PRUV       |
| Deploy HypERC20Collateral × 2           | ~7,600,000      | ~0.0076 PRUV       |
| Deploy ERC20 tokens × 2 (USDC + custom) | ~2,400,000      | ~0.0024 PRUV       |
| enrollRemoteRouter × 3                  | ~240,000        | ~0.00024 PRUV      |
| ISM config × 3                          | ~360,000        | ~0.00036 PRUV      |
| **Total (3 tokens)**                    | **~14,100,000** | **~0.015 PRUV**    |

> Gas costs on pruvtest are very low. With 1 Gwei gas price the entire deployment costs less than 0.1 PRUV. Run `estimate-testnet-fees.ts` for the live gas price.

**Recommended wallet funding before starting:**

| Wallet                   | Minimum  | Recommended |
| ------------------------ | -------- | ----------- |
| Solana deployer          | 11.0 SOL | 13.0 SOL    |
| Solana relayer payer     | 0.5 SOL  | 1.0 SOL     |
| pruvtest deployer/signer | 0.1 PRUV | 1.0 PRUV    |

---

## 4. Wallet Setup

### 4.1 Create Solana Devnet Keypairs

You need two Solana wallets:

1. **Deployer** — deploys programs and creates accounts
2. **Relayer payer** — pays for Solana transactions when the relayer delivers messages

```bash
# Deployer keypair (reusable across sessions)
solana-keygen new -o ~/.config/solana/pruv-bridge-deployer.json --no-bip39-passphrase
solana config set --keypair ~/.config/solana/pruv-bridge-deployer.json
solana config set --url https://api.devnet.solana.com

# Print deployer public key
solana address
# Example: 7eHMrPaVnbp1UMfBrPLmZ1VZqYasFjJGajf9pDAVhVvt

# Relayer payer — derive from your EVM private key (same pattern as local setup)
node -e "
const { Keypair } = require('@solana/web3.js');
const evmKey = '<YOUR_EVM_PRIVATE_KEY_NO_0x_PREFIX>';
const seed = Buffer.from(evmKey, 'hex');
const kp = Keypair.fromSeed(seed.slice(0, 32));
console.log('Relayer payer pubkey:', kp.publicKey.toBase58());
"
```

### 4.2 Fund Solana Wallets via Devnet Airdrop

Solana Devnet has a rate limit of ~2 SOL per request. You need ~13 SOL for full self-deployment — request multiple times with a short wait between each.

```bash
# Fund deployer — run 6–7 times (2 SOL each, rate-limited)
for i in 1 2 3 4 5 6; do
  solana airdrop 2 $(solana address) --url https://api.devnet.solana.com
  echo "Airdrop $i complete. Waiting 30s..."
  sleep 30
done
solana balance --url https://api.devnet.solana.com

# Fund relayer payer
RELAYER_PAYER_PUBKEY=$(node -e "
const { Keypair } = require('@solana/web3.js');
const seed = Buffer.from('<YOUR_EVM_PRIVATE_KEY_NO_0x>', 'hex');
console.log(Keypair.fromSeed(seed.slice(0, 32)).publicKey.toBase58());
")
solana airdrop 1 $RELAYER_PAYER_PUBKEY --url https://api.devnet.solana.com

# Check balances
solana balance --url https://api.devnet.solana.com
solana balance $RELAYER_PAYER_PUBKEY --url https://api.devnet.solana.com
```

**Fee for this step**: Free (Solana devnet airdrop)

### 4.3 Verify pruvtest Wallet Balance

```bash
cast balance <YOUR_EVM_ADDRESS> --rpc-url https://rpc.testnet.pruv.network | xargs -I{} cast --from-wei {}
```

If your balance is low, request PRUV from the pruvtest faucet or transfer from another wallet.

---

## 5. Deploy Hyperlane Core on Solana Devnet

You deploy and own all four core programs. This gives you full control over the ISM, validator set, and upgrade path.

### 5.1 Build Programs (if not already built)

```bash
cd rust/sealevel/programs
./build-programs.sh all
# Verify outputs
ls ../target/deploy/*.so
```

Expected `.so` files and their sizes:

| Program File                                    | Size   |
| ----------------------------------------------- | ------ |
| `hyperlane_sealevel_mailbox.so`                 | 205 KB |
| `hyperlane_sealevel_igp.so`                     | 243 KB |
| `hyperlane_sealevel_validator_announce.so`      | 134 KB |
| `hyperlane_sealevel_multisig_ism_message_id.so` | 190 KB |
| `hyperlane_sealevel_token_native.so`            | 327 KB |
| `hyperlane_sealevel_token.so`                   | 349 KB |
| `hyperlane_sealevel_token_collateral.so`        | 354 KB |

### 5.2 Prepare the Environment Directory

The environment is already created at `rust/sealevel/environments/testnet/`. No changes needed.

> **New keypairs required**: Since this is a fresh devnet deployment, generate new keypairs in `rust/sealevel/environments/testnet/solanadevnet/core/keys/` before deploying (see `./build-programs.sh` output for guidance). The existing keypair files in that directory are placeholders.

### 5.3 Deploy Core Programs

```bash
cd rust/sealevel

DEPLOYER_KEYPAIR=~/.config/solana/pruv-bridge-deployer.json
SOLANA_RPC=https://api.devnet.solana.com

./target/debug/hyperlane-sealevel-client core deploy \
  --url $SOLANA_RPC \
  --keypair $DEPLOYER_KEYPAIR \
  --local-domain 1399811151 \
  --environment testnet \
  --environments-dir ./environments \
  --built-so-dir ./target/deploy \
  --chain solanadevnet
```

> This deploys mailbox, IGP, validator_announce, and multisig_ism programs in one command. Program IDs are written automatically to `environments/testnet/solanadevnet/core/program-ids.json`.

**Estimated fee**: ~5.5 SOL net (rent locked permanently) + ~0.5 SOL transaction fees. You need ~11 SOL liquid during the deploy window; ~5.5 SOL is returned when buffer accounts close after deployment.

### 5.4 Record Core Program IDs

```bash
cat rust/sealevel/environments/testnet/solanadevnet/core/program-ids.json
```

Example output:

```json
{
  "mailbox": "NEW_MAILBOX_PROGRAM_ID",
  "validator_announce": "NEW_VA_PROGRAM_ID",
  "multisig_ism_message_id": "NEW_ISM_PROGRAM_ID",
  "igp_program_id": "NEW_IGP_PROGRAM_ID",
  "overhead_igp_account": "NEW_IGP_OVERHEAD_ACCOUNT",
  "igp_account": "NEW_IGP_ACCOUNT"
}
```

Save these values — you will use them in `agent-config-testnet.json` (Section 9).

---

## 6. Deploy EVM Warp Routes on pruvtest

This deploys the EVM side of the bridge for each token. The pruvtest Mailbox is already deployed — you only need warp route contracts.

### 6.1 Deploy ERC20 Tokens (for USDC and Custom ERC20 only)

> Skip this for PRUV native (it uses the native token, no ERC20 to deploy).

```bash
cd external_contracts/deployment-asset-script

# Deploy USDC token
TOKEN_NAME="USDC" TOKEN_SYMBOL="USDC" \
PRIVATE_KEY=<YOUR_PRIVATE_KEY> \
npx hardhat run scripts/deploy.ts --network pruvTestnet
# Save: USDC_TOKEN_ADDRESS=<printed address>

# Deploy custom ERC20 token
TOKEN_NAME="<YOUR_TOKEN_NAME>" TOKEN_SYMBOL="<YOUR_SYMBOL>" \
PRIVATE_KEY=<YOUR_PRIVATE_KEY> \
npx hardhat run scripts/deploy.ts --network pruvTestnet
# Save: CUSTOM_TOKEN_ADDRESS=<printed address>
```

**Estimated fee per ERC20 deployment**: ~0.0012 PRUV at 1 Gwei

### 6.2 Update Warp Route Config Files

**For USDC** — edit `typescript/cli/configs/testnet-warp-usdc.yaml`:

- Replace `REPLACE_WITH_USDC_ERC20_ADDRESS_ON_PRUVTEST` with your USDC token address
- Replace `REPLACE_WITH_YOUR_EVM_ADDRESS` with your deployer address

**For custom ERC20** — edit `typescript/cli/configs/testnet-warp-custom-erc20.yaml`:

- Replace token address, name, symbol, and owner address

**For PRUV native** — edit `typescript/cli/configs/testnet-warp-pruv-native.yaml`:

- Replace `REPLACE_WITH_YOUR_EVM_ADDRESS` with your deployer address

### 6.3 Deploy EVM Warp Contracts

```bash
cd typescript/cli

# Deploy PRUV native warp route
HYP_KEY=<YOUR_PRIVATE_KEY> \
node dist/cli.js warp deploy \
  --config configs/testnet-warp-pruv-native.yaml \
  --registry .hyperlane \
  --yes

# Deploy USDC warp route
HYP_KEY=<YOUR_PRIVATE_KEY> \
node dist/cli.js warp deploy \
  --config configs/testnet-warp-usdc.yaml \
  --registry .hyperlane \
  --yes

# Deploy custom ERC20 warp route
HYP_KEY=<YOUR_PRIVATE_KEY> \
node dist/cli.js warp deploy \
  --config configs/testnet-warp-custom-erc20.yaml \
  --registry .hyperlane \
  --yes
```

**Estimated fee per warp contract deployment**: ~0.003–0.004 PRUV at 1 Gwei

### 6.4 Record EVM Warp Addresses

Warp route deployments are saved to `.hyperlane/deployments/warp_routes/<SYMBOL>/`. Find the `addressOrDenom` for `chainName: pruvtest`:

```bash
# PRUV warp address
cat typescript/cli/.hyperlane/deployments/warp_routes/PRUV/testnet-warp-pruv-native-config.yaml | grep -A5 "pruvtest"

# USDC warp address
cat typescript/cli/.hyperlane/deployments/warp_routes/USDC/testnet-warp-usdc-config.yaml | grep -A5 "pruvtest"

# Custom ERC20 warp address
cat typescript/cli/.hyperlane/deployments/warp_routes/<SYMBOL>/testnet-warp-custom-erc20-config.yaml | grep -A5 "pruvtest"
```

Save these as:

```
PRUV_WARP_EVM_ADDRESS=0x...
USDC_WARP_EVM_ADDRESS=0x...
CUSTOM_WARP_EVM_ADDRESS=0x...
```

---

## 7. Deploy Solana Warp Routes

### 7.1 Generate Warp Route Keypairs

Each token gets its own Solana warp program with a unique keypair. Generate keypairs for each:

```bash
# PRUV native warp
cd rust/sealevel/environments/testnet/warp-routes/pruv-native-solana/keys
solana-keygen new -o hyperlane_sealevel_token-solanadevnet-keypair.json --no-bip39-passphrase
solana-keygen new -o hyperlane_sealevel_token-solanadevnet-buffer.json --no-bip39-passphrase
cd -

# USDC warp
cd rust/sealevel/environments/testnet/warp-routes/usdc-pruv-solana/keys
solana-keygen new -o hyperlane_sealevel_token-solanadevnet-keypair.json --no-bip39-passphrase
solana-keygen new -o hyperlane_sealevel_token-solanadevnet-buffer.json --no-bip39-passphrase
cd -

# Custom ERC20 warp
cd rust/sealevel/environments/testnet/warp-routes/custom-erc20-solana/keys
solana-keygen new -o hyperlane_sealevel_token-solanadevnet-keypair.json --no-bip39-passphrase
solana-keygen new -o hyperlane_sealevel_token-solanadevnet-buffer.json --no-bip39-passphrase
cd -
```

### 7.2 Update Token Config Files

For each warp route, update the `foreignDeployment` in the token-config.json with the EVM warp address from Section 7.4:

```bash
# PRUV
sed -i '' 's/REPLACE_WITH_PRUV_WARP_EVM_ADDRESS/<PRUV_WARP_EVM_ADDRESS>/' \
  rust/sealevel/environments/testnet/warp-routes/pruv-native-solana/token-config.json

# USDC
sed -i '' 's/REPLACE_WITH_USDC_WARP_EVM_ADDRESS/<USDC_WARP_EVM_ADDRESS>/' \
  rust/sealevel/environments/testnet/warp-routes/usdc-pruv-solana/token-config.json

# Custom ERC20 (also update name and symbol)
# Edit manually: rust/sealevel/environments/testnet/warp-routes/custom-erc20-solana/token-config.json
```

### 7.3 Set Solana CLI to Devnet

```bash
solana config set --url https://api.devnet.solana.com
solana config set --keypair ~/.config/solana/pruv-bridge-deployer.json
```

### 7.4 Deploy PRUV Native Warp Route

```bash
cd rust/sealevel

yes | ./target/debug/hyperlane-sealevel-client warp-route deploy \
  --environment testnet \
  --environments-dir ./environments \
  --built-so-dir ./target/deploy \
  --warp-route-name pruv-native-solana \
  --token-config-file ./environments/testnet/warp-routes/pruv-native-solana/token-config.json \
  --registry .hyperlane \
  --url https://api.devnet.solana.com
```

Note the output:

- **Solana Program ID (base58)** — needed for router enrollment
- **Program ID (hex)** — needed for `enrollRemoteRouter` on EVM

**Estimated fee**: ~0.5–0.7 SOL

### 7.5 Deploy USDC Warp Route

```bash
yes | ./target/debug/hyperlane-sealevel-client warp-route deploy \
  --environment testnet \
  --environments-dir ./environments \
  --built-so-dir ./target/deploy \
  --warp-route-name usdc-pruv-solana \
  --token-config-file ./environments/testnet/warp-routes/usdc-pruv-solana/token-config.json \
  --registry .hyperlane \
  --url https://api.devnet.solana.com
```

**Estimated fee**: ~0.5–0.7 SOL

### 7.6 Deploy Custom ERC20 Warp Route

```bash
yes | ./target/debug/hyperlane-sealevel-client warp-route deploy \
  --environment testnet \
  --environments-dir ./environments \
  --built-so-dir ./target/deploy \
  --warp-route-name custom-erc20-solana \
  --token-config-file ./environments/testnet/warp-routes/custom-erc20-solana/token-config.json \
  --registry .hyperlane \
  --url https://api.devnet.solana.com
```

**Estimated fee**: ~0.6–0.8 SOL

### 7.7 Convert Program IDs to Hex

For each deployed Solana warp program, get the hex representation needed for EVM router enrollment:

```bash
node -e "
const { PublicKey } = require('@solana/web3.js');
const programs = {
  'PRUV': '<PRUV_SOLANA_PROGRAM_ID_BASE58>',
  'USDC': '<USDC_SOLANA_PROGRAM_ID_BASE58>',
  'Custom': '<CUSTOM_SOLANA_PROGRAM_ID_BASE58>',
};
for (const [name, id] of Object.entries(programs)) {
  const hex = '0x' + Buffer.from(new PublicKey(id).toBytes()).toString('hex');
  console.log(name + ':', hex);
}
"
```

Save these as:

```
PRUV_SOLANA_PROGRAM_BASE58=<...>
PRUV_SOLANA_PROGRAM_HEX=0x<...>

USDC_SOLANA_PROGRAM_BASE58=<...>
USDC_SOLANA_PROGRAM_HEX=0x<...>

CUSTOM_SOLANA_PROGRAM_BASE58=<...>
CUSTOM_SOLANA_PROGRAM_HEX=0x<...>
```

---

## 8. Configure ISM and Enroll Routers

### 8.1 Set pruvtest Validators in Solana Multisig ISM

The Solana side must know which EVM address (your validator) is authorized to sign checkpoints for pruvtest (domain 7336).

Use your deployed multisig ISM program ID from `program-ids.json`:

```bash
MULTISIG_ISM=$(cat rust/sealevel/environments/testnet/solanadevnet/core/program-ids.json | \
  python3 -c "import json,sys; print(json.load(sys.stdin)['multisig_ism_message_id'])")

./target/debug/hyperlane-sealevel-client multisig-ism-message-id set-validators-and-threshold \
  --program-id $MULTISIG_ISM \
  --domain 7336 \
  --validators <YOUR_VALIDATOR_EVM_ADDRESS> \
  --threshold 1 \
  --url https://api.devnet.solana.com \
  --keypair ~/.config/solana/pruv-bridge-deployer.json
```

> **What is your validator EVM address?** It is the EVM address derived from the private key you use in `agent-config-testnet.json` (`defaultsigner.key`). Get it with:
>
> ```bash
> cast wallet address --private-key <YOUR_PRIVATE_KEY>
> ```

**Estimated fee**: ~0.001 SOL (transaction fees)

### 8.2 Fund ATA Payer PDAs

Each Solana warp program has an ATA payer PDA that pays for creating recipient token accounts. Fund each with at least 0.1 SOL (0.5 SOL recommended).

```bash
for PROGRAM_ID in <PRUV_SOLANA_PROGRAM_BASE58> <USDC_SOLANA_PROGRAM_BASE58> <CUSTOM_SOLANA_PROGRAM_BASE58>; do
  ATA_PAYER=$(node -e "
  const { PublicKey } = require('@solana/web3.js');
  const programId = new PublicKey('$PROGRAM_ID');
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('hyperlane_token'), Buffer.from('-'), Buffer.from('ata_payer')],
    programId
  );
  console.log(pda.toBase58());
  ")
  echo "Program: $PROGRAM_ID"
  echo "ATA Payer PDA: $ATA_PAYER"
  solana transfer $ATA_PAYER 0.5 \
    --url https://api.devnet.solana.com \
    --keypair ~/.config/solana/pruv-bridge-deployer.json \
    --allow-unfunded-recipient
  echo ""
done
```

**Estimated fee**: 0.5 SOL per warp route × 3 = 1.5 SOL total

### 8.3 Enroll Solana Routers on EVM Warp Contracts

Update the enrollment script with your addresses and run it:

```bash
PRIVATE_KEY=<YOUR_EVM_PRIVATE_KEY> \
PRUV_WARP_ADDRESS=<PRUV_WARP_EVM_ADDRESS> \
PRUV_SOLANA_HEX=<PRUV_SOLANA_PROGRAM_HEX> \
USDC_WARP_ADDRESS=<USDC_WARP_EVM_ADDRESS> \
USDC_SOLANA_HEX=<USDC_SOLANA_PROGRAM_HEX> \
CUSTOM_WARP_ADDRESS=<CUSTOM_WARP_EVM_ADDRESS> \
CUSTOM_SOLANA_HEX=<CUSTOM_SOLANA_PROGRAM_HEX> \
npx ts-node scripts/enroll-solana-testnet.ts
```

Or enroll manually via `cast` (one command per token):

```bash
# PRUV
cast send <PRUV_WARP_EVM_ADDRESS> \
  "enrollRemoteRouter(uint32,bytes32)" \
  1399811151 \
  <PRUV_SOLANA_PROGRAM_HEX> \
  --private-key <YOUR_PRIVATE_KEY> \
  --rpc-url https://rpc.testnet.pruv.network

# USDC
cast send <USDC_WARP_EVM_ADDRESS> \
  "enrollRemoteRouter(uint32,bytes32)" \
  1399811151 \
  <USDC_SOLANA_PROGRAM_HEX> \
  --private-key <YOUR_PRIVATE_KEY> \
  --rpc-url https://rpc.testnet.pruv.network

# Custom ERC20
cast send <CUSTOM_WARP_EVM_ADDRESS> \
  "enrollRemoteRouter(uint32,bytes32)" \
  1399811151 \
  <CUSTOM_SOLANA_PROGRAM_HEX> \
  --private-key <YOUR_PRIVATE_KEY> \
  --rpc-url https://rpc.testnet.pruv.network
```

**Estimated fee**: ~0.00008 PRUV per call × 3 = ~0.00024 PRUV

### 8.4 Verify Router Enrollment

> **Note**: `cast call` does not correctly encode `uint32` parameters for this ABI and returns `error code -32602: Invalid params`. Use the Node.js script below instead.

```javascript
// save as /tmp/verify-routers.js and run with: node /tmp/verify-routers.js
const { ethers } = require('ethers');

const RPC = 'https://rpc.testnet.pruv.network';
const SOLANA_DOMAIN = 1399811151;
const WARP_ABI = [
  'function routers(uint32 _domain) external view returns (bytes32)',
];
const WARP_ADDRESSES = [
  '<PRUV_WARP_EVM_ADDRESS>',
  '<USDC_WARP_EVM_ADDRESS>',
  '<CUSTOM_WARP_EVM_ADDRESS>',
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  for (const addr of WARP_ADDRESSES) {
    const contract = new ethers.Contract(addr, WARP_ABI, provider);
    const router = await contract.routers(SOLANA_DOMAIN);
    console.log(`Warp ${addr} → Solana router: ${router}`);
  }
}
main().catch(console.error);
```

The returned `bytes32` value should match the hex representation of your Solana warp program ID. A value of all zeros means the router is NOT enrolled — re-run Section 8.3.

---

## 9. Configure and Start Agents

### 9.1 Update agent-config-testnet.json

Edit `rust/main/config/agent-config-testnet.json`. Replace all `REPLACE_*` placeholders with the values from `program-ids.json` (Step 5.4):

| Placeholder                                         | Value                                                            |
| --------------------------------------------------- | ---------------------------------------------------------------- |
| `REPLACE_WITH_SOLANA_MAILBOX_PROGRAM_ID`            | `mailbox` from `solanadevnet/core/program-ids.json`              |
| `REPLACE_WITH_SOLANA_IGP_OVERHEAD_ACCOUNT`          | `overhead_igp_account` from `solanadevnet/core/program-ids.json` |
| `REPLACE_WITH_SOLANA_VALIDATOR_ANNOUNCE_PROGRAM_ID` | `validator_announce` from `solanadevnet/core/program-ids.json`   |
| `REPLACE_WITH_RELAYER_SOL_PUBKEY`                   | Relayer payer Solana pubkey (from Section 4.1)                   |
| `REPLACE_WITH_YOUR_PRIVATE_KEY`                     | Your EVM private key (0x-prefixed)                               |

**Critical fields to verify in `agent-config-testnet.json`:**

```json
{
  "allowlocalcheckpointsyncers": true,
  "gaspaymentenforcement": [{ "type": "none" }],
  "chains": {
    "pruvtest": {
      "index": { "from": 11488856 }
    }
  }
}
```

> **`allowlocalcheckpointsyncers: true`** — Required when the validator stores checkpoints on the local filesystem. Without this the relayer refuses to read local checkpoint paths even if set correctly.
>
> **`gaspaymentenforcement: [{"type":"none"}]`** — Disables gas payment checks for testnet. Without this, `transferRemote` calls may be rejected for not meeting gas payment requirements.
>
> **`index.from`** — The relayer only scans for messages dispatched at or after this block number. Any `transferRemote` sent from a block earlier than this will **never be picked up** by the relayer, even after a restart. Set this to the block just before your first expected transfer.

### 9.2 Configure Checkpoint Storage

For testnet, you can use local filesystem checkpoints. Create a directory:

```bash
mkdir -p /tmp/hyperlane-pruv-checkpoints/pruvtest
mkdir -p /tmp/hyperlane-pruv-checkpoints/solanadevnet
```

### 9.3 Start Validator (pruvtest)

The validator watches the pruvtest Mailbox and signs checkpoints that the Solana ISM needs to verify messages.

```bash
cd rust/main

# Validator for pruvtest
HYP_ORIGINCHAINNAME="pruvtest" \
HYP_VALIDATOR_KEY="<YOUR_PRIVATE_KEY>" \
HYP_CHECKPOINTSYNCER_TYPE="localStorage" \
HYP_CHECKPOINTSYNCER_PATH="/tmp/hyperlane-pruv-checkpoints/pruvtest" \
HYP_DB="/tmp/hyperlane-pruv-db/validator-pruvtest" \
HYP_TRACING_LEVEL="info" \
HYP_METRICSPORT="9091" \
CONFIG_FILES="<REPO_ROOT>/rust/main/config/agent-config-testnet.json" \
./target/debug/validator
```

Wait for the validator to announce its storage location. You should see in logs:

```
INFO Validator has announced storage location
```

### 9.4 Start Relayer

The relayer watches both chains, fetches validator signatures, and delivers messages.

```bash
cd rust/main

HYP_RELAYCHAINS="pruvtest,solanadevnet" \
HYP_DB="/tmp/hyperlane-pruv-db/relayer" \
HYP_TRACING_LEVEL="info" \
HYP_METRICSPORT="9090" \
HYP_ALLOWLOCALCHECKPOINTSYNCERS="true" \
HYP_DEFAULTSIGNER_KEY="<YOUR_PRIVATE_KEY>" \
HYP_GASPAYMENTENFORCEMENT='[{"type":"none"}]' \
CONFIG_FILES="<REPO_ROOT>/rust/main/config/agent-config-testnet.json" \
./target/debug/relayer
```

> **Note on `allowlocalcheckpointsyncers`**: Set to `true` for testnet with local filesystem checkpoints. For production, use S3 or GCS storage and set this to `false`.

### 9.5 Verify Agents Are Running

```bash
# Check validator metrics
curl -s http://localhost:9091/metrics | grep hyperlane_latest_checkpoint

# Check relayer metrics
curl -s http://localhost:9090/metrics | grep hyperlane_messages_processed
```

---

## 10. Test the Bridge

### 10.1 Obtain Test Tokens

```bash
# For USDC and custom ERC20, mint tokens to yourself (if you're the token owner)
cast send <USDC_TOKEN_ADDRESS> \
  "mint(address,uint256)" \
  <YOUR_EVM_ADDRESS> \
  $(cast --to-wei 1000) \
  --private-key <YOUR_PRIVATE_KEY> \
  --rpc-url https://rpc.testnet.pruv.network

cast send <CUSTOM_TOKEN_ADDRESS> \
  "mint(address,uint256)" \
  <YOUR_EVM_ADDRESS> \
  $(cast --to-wei 1000) \
  --private-key <YOUR_PRIVATE_KEY> \
  --rpc-url https://rpc.testnet.pruv.network
```

### 10.2 Run Bridge Tests

```bash
PRIVATE_KEY=<YOUR_PRIVATE_KEY> \
RECIPIENT_SOLANA_PUBKEY=<YOUR_SOLANA_PUBKEY> \
PRUV_WARP_ADDRESS=<PRUV_WARP_EVM_ADDRESS> \
USDC_WARP_ADDRESS=<USDC_WARP_EVM_ADDRESS> \
USDC_ERC20_ADDRESS=<USDC_TOKEN_ADDRESS> \
CUSTOM_WARP_ADDRESS=<CUSTOM_WARP_EVM_ADDRESS> \
CUSTOM_ERC20_ADDRESS=<CUSTOM_TOKEN_ADDRESS> \
npx ts-node scripts/test-pruv-to-solana.ts
```

### 10.3 Verify Bridge Delivery

**Method A — Relayer logs (fastest)**

Watch the relayer terminal for:

```
Delivering message ... to solanadevnet
Message delivered on solanadevnet
```

If you see `Repreparing message` or `Unable to reach quorum`, the relayer is still retrying.

**Method B — Check Solana SPL token balances**

```bash
spl-token accounts \
  --owner <YOUR_SOLANA_PUBKEY> \
  --url https://api.devnet.solana.com
```

Example output when bridge succeeds:

```
Token                                         Balance
-----------------------------------------------------
<MINT_ADDRESS>   1
```

**Method C — Hyperlane Explorer**

Browse to: `https://explorer.hyperlane.xyz/?origin=pruvtest&destination=solanadevnet`

> **Tip**: You can also look up the Solana transaction directly. After bridging, run the Node.js snippet below to confirm token delivery:
>
> ```javascript
> const { Connection, PublicKey } = require('@solana/web3.js');
> async function main() {
>   const conn = new Connection('<SOLANA_RPC_URL>', 'confirmed');
>   const program = new PublicKey('<SOLANA_WARP_PROGRAM_ID>');
>   const sigs = await conn.getSignaturesForAddress(program, { limit: 5 });
>   for (const sig of sigs) {
>     const tx = await conn.getTransaction(sig.signature, {
>       maxSupportedTransactionVersion: 0,
>     });
>     if (
>       tx?.meta?.logMessages?.some((l) =>
>         l.includes('Warp route transfer completed'),
>       )
>     ) {
>       console.log('Delivery confirmed:', sig.signature);
>       tx.meta.preTokenBalances?.forEach((pre, i) => {
>         const post = tx.meta.postTokenBalances?.[i];
>         if (
>           pre &&
>           post &&
>           pre.uiTokenAmount.uiAmountString !==
>             post.uiTokenAmount.uiAmountString
>         ) {
>           console.log(
>             'Balance change:',
>             pre.uiTokenAmount.uiAmountString,
>             '→',
>             post.uiTokenAmount.uiAmountString,
>           );
>         }
>       });
>     }
>   }
> }
> main().catch(console.error);
> ```

### 10.4 Troubleshooting Delivery

| Symptom                           | Cause                                          | Fix                                                        |
| --------------------------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| `CALL_EXCEPTION` on EVM side      | Missing or wrong protocol fee value            | Ensure `value: quote` is included in `transferRemote` call |
| `Repreparing message` in relayer  | ISM not configured or validator not announcing | Re-run Step 9.1 (ISM validators) and check validator logs  |
| `Transfer: insufficient lamports` | ATA payer PDA out of SOL                       | Fund the ATA payer PDA (Step 9.2)                          |
| `Unable to reach quorum`          | Validator not running or not signing           | Check validator process and checkpoint files               |
| `No logs mentioning solanadevnet` | Agent config missing solanadevnet chain        | Verify `agent-config-testnet.json` has solanadevnet entry  |
| Slow delivery (> 5 min)           | Solana devnet congestion or RPC rate limits    | Wait or switch to a dedicated Solana devnet RPC endpoint   |

---

## 11. Adding More Tokens to the Bridge

Adding a new token does **not** require redeploying Hyperlane core or restarting agents. Only new warp routes are needed. The relayer automatically picks up messages through the shared Mailbox.

**Prerequisites**: Sections 1–9 completed (core deployed, agents running).

### A1. Deploy the New ERC20 Token on pruvtest (skip for native PRUV)

```bash
cd external_contracts/deployment-asset-script

TOKEN_NAME="<YOUR_TOKEN_NAME>" TOKEN_SYMBOL="<YOUR_SYMBOL>" \
PRIVATE_KEY=<YOUR_PRIVATE_KEY> \
npx hardhat run scripts/deploy.ts --network pruvTestnet
```

Save: `NEW_TOKEN_ADDRESS=<printed address>`

**Estimated fee**: ~0.0012 PRUV at 1 Gwei

### A2. Create the EVM Warp Route Config

Create a new YAML file (do **not** overwrite existing configs — each token gets its own file):

```yaml
# typescript/cli/configs/testnet-warp-<SYMBOL>.yaml
pruvtest:
  type: collateral
  token: '<NEW_TOKEN_ADDRESS>'
  owner: '<YOUR_EVM_ADDRESS>'
  name: '<TOKEN_NAME>'
  symbol: '<TOKEN_SYMBOL>'
  decimals: 18
  interchainSecurityModule:
    type: defaultFallbackRoutingIsm
    owner: '<YOUR_EVM_ADDRESS>'
    domains: {}
```

### A3. Deploy the EVM Warp Route

```bash
cd typescript/cli

HYP_KEY=<YOUR_PRIVATE_KEY> \
node dist/cli.js warp deploy \
  --config configs/testnet-warp-<SYMBOL>.yaml \
  --registry .hyperlane \
  --yes
```

Find the warp address:

```bash
cat .hyperlane/deployments/warp_routes/<SYMBOL>/testnet-warp-<SYMBOL>-config.yaml | grep addressOrDenom
```

Save: `NEW_WARP_EVM_ADDRESS=<addressOrDenom for pruvtest>`

**Estimated fee**: ~0.0038 PRUV at 1 Gwei

### A4. Create the Solana Warp Route Directory

```bash
mkdir -p rust/sealevel/environments/testnet/warp-routes/<symbol>-solana/keys
echo '{}' > rust/sealevel/environments/testnet/warp-routes/<symbol>-solana/program-ids.json
```

Create `rust/sealevel/environments/testnet/warp-routes/<symbol>-solana/token-config.json`:

```json
{
  "pruvtest": {
    "foreignDeployment": "<NEW_WARP_EVM_ADDRESS>",
    "type": "collateral",
    "decimals": 18
  },
  "solanadevnet": {
    "type": "synthetic",
    "decimals": 9,
    "remoteDecimals": 18,
    "name": "<TOKEN_NAME>",
    "symbol": "<TOKEN_SYMBOL>"
  }
}
```

### A5. Generate Keypairs and Deploy the Solana Warp Route

```bash
cd rust/sealevel/environments/testnet/warp-routes/<symbol>-solana/keys
solana-keygen new -o hyperlane_sealevel_token-solanadevnet-keypair.json --no-bip39-passphrase
solana-keygen new -o hyperlane_sealevel_token-solanadevnet-buffer.json --no-bip39-passphrase
cd -

cd rust/sealevel
yes | ./target/debug/hyperlane-sealevel-client warp-route deploy \
  --environment testnet \
  --environments-dir ./environments \
  --built-so-dir ./target/deploy \
  --warp-route-name <symbol>-solana \
  --token-config-file ./environments/testnet/warp-routes/<symbol>-solana/token-config.json \
  --registry .hyperlane \
  --url https://api.devnet.solana.com
```

Note the **Solana Program ID (base58)** and get its hex:

```bash
node -e "
const { PublicKey } = require('@solana/web3.js');
const id = '<NEW_SOLANA_PROGRAM_ID_BASE58>';
console.log('Hex:', '0x' + Buffer.from(new PublicKey(id).toBytes()).toString('hex'));
"
```

**Estimated fee**: ~0.6–0.8 SOL

### A6. Fund the ATA Payer PDA

```bash
ATA_PAYER=$(node -e "
const { PublicKey } = require('@solana/web3.js');
const programId = new PublicKey('<NEW_SOLANA_PROGRAM_ID_BASE58>');
const [pda] = PublicKey.findProgramAddressSync(
  [Buffer.from('hyperlane_token'), Buffer.from('-'), Buffer.from('ata_payer')],
  programId
);
console.log(pda.toBase58());
")
echo "ATA Payer PDA: $ATA_PAYER"
solana transfer $ATA_PAYER 0.5 \
  --url https://api.devnet.solana.com \
  --keypair ~/.config/solana/pruv-bridge-deployer.json \
  --allow-unfunded-recipient
```

**Estimated fee**: 0.5 SOL

### A7. Enroll Routers on Both Sides

**EVM side** — enroll the Solana program on the new EVM warp contract:

```bash
cast send <NEW_WARP_EVM_ADDRESS> \
  "enrollRemoteRouter(uint32,bytes32)" \
  1399811151 \
  <NEW_SOLANA_PROGRAM_HEX> \
  --private-key <YOUR_PRIVATE_KEY> \
  --rpc-url https://rpc.testnet.pruv.network
```

**Estimated fee**: ~0.00008 PRUV

### A8. Test the New Token Bridge

```bash
# Mint tokens to yourself if needed
cast send <NEW_TOKEN_ADDRESS> "mint(address,uint256)" \
  <YOUR_EVM_ADDRESS> $(cast --to-wei 1000) \
  --private-key <YOUR_PRIVATE_KEY> \
  --rpc-url https://rpc.testnet.pruv.network

# Approve
cast send <NEW_TOKEN_ADDRESS> "approve(address,uint256)" \
  <NEW_WARP_EVM_ADDRESS> $(cast --to-wei 10) \
  --private-key <YOUR_PRIVATE_KEY> \
  --rpc-url https://rpc.testnet.pruv.network

# Bridge 1 token
FEE=$(cast call <NEW_WARP_EVM_ADDRESS> "quoteGasPayment(uint32)(uint256)" 1399811151 \
  --rpc-url https://rpc.testnet.pruv.network)

cast send <NEW_WARP_EVM_ADDRESS> \
  "transferRemote(uint32,bytes32,uint256)" \
  1399811151 \
  $(node -e "const {PublicKey}=require('@solana/web3.js'); console.log('0x'+Buffer.from(new PublicKey('<RECIPIENT_SOLANA_PUBKEY>').toBytes()).toString('hex'))") \
  $(cast --to-wei 1) \
  --value $FEE \
  --private-key <YOUR_PRIVATE_KEY> \
  --rpc-url https://rpc.testnet.pruv.network
```

Verify delivery using the same methods from Section 10.3.

### Summary: What is Shared vs Per-Token

| Component            | Shared (one per chain)             | Per token                         |
| -------------------- | ---------------------------------- | --------------------------------- |
| Mailbox              | One (already on pruvtest + Solana) |                                   |
| MerkleTreeHook       | One per chain                      |                                   |
| ValidatorAnnounce    | One per chain                      |                                   |
| Multisig ISM         | One per chain                      |                                   |
| Validator & Relayer  | Same agents relay all tokens       |                                   |
| EVM warp contract    |                                    | One per token (collateral/native) |
| Solana warp program  |                                    | One per token (synthetic)         |
| Router enrollment    |                                    | Per warp route pair               |
| ERC20 token contract |                                    | Per token (except native PRUV)    |
| ATA Payer funding    |                                    | Per Solana warp program           |

> **No agent restart needed.** The relayer automatically picks up all messages dispatched through the shared Mailbox, regardless of which warp route sent them.

---

## 12. Troubleshooting

### Validator not announcing storage location

The validator must announce its checkpoint storage so the relayer can find signed checkpoints.

```bash
# Check validator logs for announcement
grep -i "announced\|announce" /tmp/hyperlane-pruv-db/validator-pruvtest/*.log 2>/dev/null || \
  echo "Check validator stdout"
```

If not announcing, verify `HYP_CHECKPOINTSYNCER_TYPE` and `HYP_CHECKPOINTSYNCER_PATH` are set correctly.

### "CouldNotFetchMetadata" in relayer logs

The relayer cannot fetch ISM metadata (validator signatures). Common causes:

1. **ISM not configured**: Re-run Step 9.1 to set validators on the Solana ISM.
2. **Validator checkpoint path mismatch**: Ensure the relayer and validator use the same `CHECKPOINTSYNCER_PATH`.
3. **Validator not yet signed**: Wait for the validator to process the block containing the message.

### "Program not executable" on Solana deploy

The `.so` file is corrupted or the wrong build target was used.

```bash
# Rebuild Solana programs
cd rust/sealevel/programs
./build-programs.sh all
```

### Solana RPC rate limits (429 errors)

Use a dedicated RPC endpoint instead of the public one:

```bash
# Example paid/free alternatives:
# https://rpc.ankr.com/solana_devnet
# https://devnet.helius-rpc.com/?api-key=<KEY>
```

Update `rust/main/config/agent-config-testnet.json` and environment metadata with the new RPC URL.

### "Transaction attempting to announce validator reverted" (Solana validator)

This is expected and non-blocking on Sealevel. The Sealevel implementation does not support on-chain validator announcement. Since `allowlocalcheckpointsyncers: true`, the relayer reads checkpoints from the local filesystem. This error is safe to ignore.

### "Transfer: insufficient lamports" in relayer logs

The ATA payer PDA for the warp route has run out of SOL. Re-fund it:

```bash
solana transfer <ATA_PAYER_PDA> 1 \
  --url https://api.devnet.solana.com \
  --keypair ~/.config/solana/pruv-bridge-deployer.json \
  --allow-unfunded-recipient
```

### "Unable to reach quorum" after a new transfer (stale checkpoint directory)

**Symptom**: The relayer loops with `Could not fetch metadata: Unable to reach quorum` for a message even though the validator has signed a fresh checkpoint on disk.

**Root cause**: The validator announces its checkpoint storage location on-chain via `ValidatorAnnounce`. If you ever ran the validator with a different `CHECKPOINTSYNCER_PATH`, that old path is permanently recorded on-chain. The relayer iterates all announced locations **in reverse order** (newest announcement first). If the newest announced path resolves to an empty or stale directory, the relayer picks up a `LocalStorage` syncer for it, fails to find the checkpoint, and never tries the older (but now active) path.

**Diagnosis**:

```bash
# Count checkpoint files in each announced location
ls /tmp/hyperlane-pruv-validator/         # old announcement
ls /tmp/hyperlane-pruv-checkpoints/pruvtest/  # active path
# Active path should have e.g. 463_with_id.json
```

**Fix — symlink the stale path to the active one**:

```bash
# Remove the stale directory that was announced but is no longer used
rm -rf /tmp/hyperlane-pruv-validator

# Symlink it to the active checkpoint directory
ln -s /tmp/hyperlane-pruv-checkpoints/pruvtest /tmp/hyperlane-pruv-validator

# Restart the relayer — no DB wipe needed
```

> **Prevention**: Use a single, stable `CHECKPOINTSYNCER_PATH` from the start and never change it. Each new path gets permanently recorded on-chain and cannot be removed.

### Messages stuck with `InstructionError(2, InvalidArgument)` on Solana

**Symptom**: The relayer repeatedly simulates the transaction and logs `InstructionError(2, InvalidArgument)` for a set of messages, while newer messages process fine.

**Root cause**: These messages were dispatched from the EVM warp contract **before** you re-enrolled the new Solana warp program ID. They contain the recipient address of the old Solana warp route which is no longer configured correctly, so Solana rejects the instruction with an invalid argument error.

**These messages are permanently stuck and cannot be delivered.** The relayer will keep retrying them up to 66 times before skipping them automatically. You can safely ignore these errors and focus on messages dispatched after the re-enrollment.

> **Prevention**: Always re-enroll the Solana router on the EVM warp contract **before** sending any new test transfers. Verify enrollment (Section 8.4) before running bridge tests.

### Messages skipped after exceeding max retries — do NOT wipe the relayer database

**Symptom**: After many failed delivery attempts (66+), the relayer logs `Skipping message ... too many retries`. You want to reset retry counts but wiping the DB causes the relayer to get stuck at nonce 0.

**Root cause**: When the relayer DB is wiped, `retrieve_highest_seen_message_nonce()` returns `None`, so the internal iterator starts at nonce `0`. If early messages (e.g. nonces 0–445) were dispatched before `index.from` and never indexed, the iterator has nothing to advance with and the relayer appears frozen — it never processes your new messages.

**Fix — restart without wiping the database**:

```bash
# DO NOT rm -rf the relayer DB directory
# Just kill the relayer and restart it:
kill $(pgrep -f "target/debug/relayer")

HYP_RELAYCHAINS="pruvtest,solanadevnet" \
HYP_DB="/tmp/hyperlane-pruv-db/relayer" \
HYP_TRACING_LEVEL="debug" \
HYP_METRICSPORT="9090" \
HYP_ALLOWLOCALCHECKPOINTSYNCERS="true" \
HYP_DEFAULTSIGNER_KEY="<YOUR_PRIVATE_KEY>" \
HYP_GASPAYMENTENFORCEMENT='[{"type":"none"}]' \
CONFIG_FILES="<REPO_ROOT>/rust/main/config/agent-config-testnet.json" \
./target/debug/relayer 2>&1 | tee /tmp/relayer.log
```

On restart the relayer reads the highest nonce it previously saw from the DB and resumes from there, correctly picking up unprocessed messages.

> **Why retries happen**: The relayer uses exponential backoff and retries each message up to `DEFAULT_MAX_MESSAGE_RETRIES = 66` times. Retries consume time but will eventually clear once the underlying issue (ISM config, checkpoint path, ATA payer balance) is fixed.

### Verifying message delivery on Solana

**Symptom**: The relayer shows `delivered: true` for a message but you want to confirm tokens actually arrived.

```javascript
// Check recent transactions for your warp program
const { Connection, PublicKey } = require('@solana/web3.js');
async function main() {
  const conn = new Connection('<SOLANA_RPC_URL>', 'confirmed');
  const warpProgram = new PublicKey('<SOLANA_WARP_PROGRAM_ID_BASE58>');
  const sigs = await conn.getSignaturesForAddress(warpProgram, { limit: 10 });
  for (const sig of sigs.filter((s) => !s.err)) {
    const tx = await conn.getTransaction(sig.signature, {
      maxSupportedTransactionVersion: 0,
    });
    const logs = tx?.meta?.logMessages ?? [];
    if (logs.some((l) => l.includes('Warp route transfer completed'))) {
      console.log('Delivery tx:', sig.signature);
      tx.meta.preTokenBalances?.forEach((pre, i) => {
        const post = tx.meta.postTokenBalances?.[i];
        if (pre && post) {
          const acct =
            tx.transaction.message.staticAccountKeys[
              pre.accountIndex
            ].toString();
          console.log(
            `  ${acct}: ${pre.uiTokenAmount.uiAmountString} → ${post.uiTokenAmount.uiAmountString}`,
          );
        }
      });
    }
  }
}
main().catch(console.error);
```

A successful delivery will show a log line containing `Warp route transfer completed` and a token balance increase for the recipient's ATA.

---

## Script Reference

| Script                                       | Purpose                                                   |
| -------------------------------------------- | --------------------------------------------------------- |
| `scripts/estimate-testnet-fees.ts`           | Estimate SOL and PRUV costs for full deployment           |
| `scripts/enroll-solana-testnet.ts`           | Enroll Solana warp routes on pruvtest EVM warp contracts  |
| `scripts/test-pruv-to-solana.ts`             | Bridge test: send PRUV/USDC/ERC20 from pruvtest to Solana |
| `rust/main/config/agent-config-testnet.json` | Agent configuration template for pruvtest + solanadevnet  |

## File Reference

| File / Directory                                                        | Purpose                                                                |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `typescript/cli/.hyperlane/chains/pruvtest/addresses.yaml`              | pruvtest core contract addresses                                       |
| `typescript/cli/.hyperlane/chains/pruvtest/metadata.yaml`               | pruvtest chain metadata (RPC, chainId, domain)                         |
| `rust/sealevel/environments/testnet/solanadevnet/core/program-ids.json` | Solana core program IDs (fill after deploy)                            |
| `rust/sealevel/environments/testnet/warp-routes/*/token-config.json`    | Warp route token configs (fill before deploy)                          |
| `rust/sealevel/environments/testnet/mock-registry/chains/metadata.yaml` | Chain metadata for Hyperlane sealevel client (solanadevnet + pruvtest) |
| `typescript/cli/configs/testnet-warp-pruv-native.yaml`                  | EVM warp config for PRUV native token                                  |
| `typescript/cli/configs/testnet-warp-usdc.yaml`                         | EVM warp config for USDC collateral                                    |
| `typescript/cli/configs/testnet-warp-custom-erc20.yaml`                 | EVM warp config for custom ERC20 collateral                            |
