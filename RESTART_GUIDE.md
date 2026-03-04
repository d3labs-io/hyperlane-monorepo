# Local Hyperlane Bridge - Restart Guide

Complete guide to set up the local Hyperlane bridge (EVM-EVM and EVM-Solana) after a computer restart.

## Prerequisites

- Anvil (for EVM chains)
- Solana CLI tools
- Node.js and yarn
- Rust and Cargo
- Hyperlane CLI built (`yarn build` in `typescript/cli`)
- Sealevel client built (`cargo build` in `rust/sealevel`)
- Hyperlane agents built (`cargo build --bin validator --bin relayer` in `rust/main`)

## Chain Reference

| Name          | Type   | Domain / Chain ID | Port | RPC URL               |
| ------------- | ------ | ----------------- | ---- | --------------------- |
| test4         | EVM    | 31337             | 8545 | http://127.0.0.1:8545 |
| evmtest2      | EVM    | 31338             | 8546 | http://127.0.0.1:8546 |
| sealeveltest1 | Solana | 13375             | 8899 | http://127.0.0.1:8899 |

Default Anvil key (used for all deployments):

```
Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
Address:     0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

---

## Step 1: Start Local Blockchains (3 terminals)

**Terminal 1 - EVM Chain 1 (test4):**

```bash
anvil --port 8545 --chain-id 31337
```

**Terminal 2 - EVM Chain 2 (evmtest2):**

```bash
anvil --port 8546 --chain-id 31338
```

**Terminal 3 - Solana:**

```bash
solana-test-validator --reset
```

---

## Step 2: Deploy Hyperlane Core (EVM)

```bash
cd typescript/cli

# Deploy to test4
node dist/cli.js core deploy \
  --registry .hyperlane \
  --config examples/core-config.yaml \
  --chain test4 \
  --key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --yes

# Deploy to evmtest2
node dist/cli.js core deploy \
  --registry .hyperlane \
  --config examples/core-config.yaml \
  --chain evmtest2 \
  --key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --yes
```

Both chains use deterministic deployment so addresses are the same each time on a fresh Anvil.

---

## Step 3: Deploy Hyperlane Core (Solana)

```bash
cd rust/sealevel

./target/debug/hyperlane-sealevel-client core deploy \
  --local-domain 13375 \
  --environment local-e2e \
  --environments-dir ./environments/local-e2e \
  --chain sealeveltest1 \
  --built-so-dir ./target/deploy
```

Output writes program IDs to `environments/local-e2e/local-e2e/sealeveltest1/core/program-ids.json`.

### Files to update after Solana core deploy

**`rust/sealevel/environments/local-e2e/solalocal/core/program-ids.json`** -- copy the program IDs from the output above so the `solalocal` environment matches:

```json
{
  "mailbox": "<MAILBOX_PROGRAM_ID>",
  "validator_announce": "<VALIDATOR_ANNOUNCE_ID>",
  "multisig_ism_message_id": "<MULTISIG_ISM_ID>",
  "igp_program_id": "<IGP_PROGRAM_ID>",
  "overhead_igp_account": "<OVERHEAD_IGP_ACCOUNT>",
  "igp_account": "<IGP_ACCOUNT>"
}
```

**`agent-config.json`** -- update the `sealeveltest1` section with the new `mailbox`, `interchainGasPaymaster`, and `validatorAnnounce` addresses from the deployment output.

---

## Step 4: Deploy RWA Token

```bash
cd external_contracts/deployment-asset-script

TOKEN_NAME="RWA Token" TOKEN_SYMBOL="RWA" \
npx hardhat run scripts/deploy.ts --network evmtest2
```

Save the deployed token address from the output.

---

## Step 5: Create Warp Route Config

Create `typescript/cli/configs/local-evm-evm-warp.yaml`:

```yaml
---
evmtest2:
  type: collateral
  token: '<RWA_TOKEN_ADDRESS_FROM_STEP_4>'

test4:
  type: synthetic
```

---

## Step 6: Deploy EVM Warp Routes

```bash
cd typescript/cli

node dist/cli.js warp deploy \
  --config configs/local-evm-evm-warp.yaml \
  --key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --yes \
  --registry .hyperlane
```

Deployment config is saved to `.hyperlane/deployments/warp_routes/RWA/local-evm-evm-warp-config.yaml`.

---

## Step 7: Enroll EVM Routers

```bash
# From repo root
npx ts-node enroll-routers-simple.ts
```

This reads addresses automatically from the deployment config.

---

## Step 8: Deploy Solana Warp Route (for EVM-Solana bridge)

### 8.1 Update Solana token config

Edit `rust/sealevel/environments/local-e2e/warp-routes/rwa-local/token-config.json` -- set the `foreignDeployment` value under `evmtest2` to the evmtest2 warp address from Step 6:

```json
{
  "evmtest2": {
    "foreignDeployment": "<EVMTEST2_WARP_ADDRESS>",
    "type": "native",
    "decimals": 18
  },
  "solalocal": {
    "type": "synthetic",
    "decimals": 9,
    "remoteDecimals": 18,
    "name": "RWA Token",
    "symbol": "RWA"
  }
}
```

### 8.2 Deploy Solana warp route

```bash
cd rust/sealevel

yes | ./target/debug/hyperlane-sealevel-client warp-route deploy \
  --environment local-e2e \
  --environments-dir ./environments \
  --built-so-dir ./target/deploy \
  --warp-route-name rwa-local \
  --token-config-file ./environments/local-e2e/warp-routes/rwa-local/token-config.json \
  --registry .hyperlane
```

Note the deployed Solana Program ID and its hex representation from the output.

### 8.3 Configure Solana ISM validators

Set the EVM validator for domains 31337 (test4) and 31338 (evmtest2) on the Solana multisig ISM:

```bash
cd rust/sealevel

# For evmtest2 (domain 31338)
./target/debug/hyperlane-sealevel-client multisig-ism-message-id set-validators-and-threshold \
  --program-id <MULTISIG_ISM_PROGRAM_ID> \
  --domain 31338 \
  --validators 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  --threshold 1 \
  --environment local-e2e \
  --environments-dir ./environments/local-e2e \
  --chain sealeveltest1 \
  --built-so-dir ./target/deploy

# For test4 (domain 31337)
./target/debug/hyperlane-sealevel-client multisig-ism-message-id set-validators-and-threshold \
  --program-id <MULTISIG_ISM_PROGRAM_ID> \
  --domain 31337 \
  --validators 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  --threshold 1 \
  --environment local-e2e \
  --environments-dir ./environments/local-e2e \
  --chain sealeveltest1 \
  --built-so-dir ./target/deploy
```

### 8.4 Fund Solana accounts

The relayer's Solana payer and the warp route's ATA payer PDA need SOL:

```bash
# Fund the relayer payer (derive address from the default key)
solana airdrop 10 <RELAYER_SOLANA_PAYER_PUBKEY> --url http://127.0.0.1:8899

# Fund the ATA payer PDA for the warp route
solana transfer <ATA_PAYER_PDA> 5 \
  --url http://127.0.0.1:8899 \
  --keypair ~/.config/solana/local-deployer.json \
  --allow-unfunded-recipient
```

### 8.5 Update scripts with new Solana program ID

**`enroll-solana-simple.ts`** -- update these constants:

- `SOLANA_PROGRAM` -- the base58 program ID from step 8.2
- `programBytes32` -- the hex representation from step 8.2
- `WARP_EVMTEST2` -- the evmtest2 warp address from Step 6

**`test-evm-to-solana.ts`** -- update these constants:

- `RWA_TOKEN` -- token address from Step 4
- `WARP_EVMTEST2` -- evmtest2 warp address from Step 6
- `SOLANA_PROGRAM` -- base58 program ID from step 8.2
- `expectedRouter` -- hex representation from step 8.2

### 8.6 Enroll Solana router on EVM

```bash
# From repo root
npx ts-node enroll-solana-simple.ts
```

---

## Step 9: Start Agents

```bash
# From repo root
./test_scripts/start-agents.sh
```

If validators crash due to bash syntax issues (`${chain_name^^}`), start them manually:

```bash
# See start-agents.sh for full env vars; the key ones per validator are:
# HYP_BASE_ORIGINCHAINNAME, HYP_BASE_DB, HYP_VALIDATOR_VALIDATOR_KEY,
# HYP_VALIDATOR_CHECKPOINTSYNCER_TYPE, HYP_VALIDATOR_CHECKPOINTSYNCER_PATH
# CONFIG_FILES=<path to agent-config.json>
```

Stop agents:

```bash
./test_scripts/stop-agents.sh
```

---

## Step 10: Test the Bridge

### EVM-EVM test

```bash
# Mint tokens first (only needed once after deploy)
npx ts-node mint-tokens.ts

# Run bridge test
npx ts-node test-bridge-auto.ts
```

### EVM-Solana test

```bash
npx ts-node test-evm-to-solana.ts
```

---

## Post-Deployment File Modification Summary

After redeploying, these files need manual updates with new addresses:

| File                                                                           | What to update                                                   | When                              |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------- | --------------------------------- |
| `rust/sealevel/environments/local-e2e/solalocal/core/program-ids.json`         | All Solana core program IDs                                      | After Solana core deploy (Step 3) |
| `agent-config.json`                                                            | `sealeveltest1` mailbox, IGP, validatorAnnounce                  | After Solana core deploy (Step 3) |
| `typescript/cli/configs/local-evm-evm-warp.yaml`                               | RWA token address under `evmtest2.token`                         | After RWA token deploy (Step 4)   |
| `rust/sealevel/environments/local-e2e/warp-routes/rwa-local/token-config.json` | `evmtest2.foreignDeployment` (EVM warp address)                  | After EVM warp deploy (Step 6)    |
| `enroll-solana-simple.ts`                                                      | `SOLANA_PROGRAM`, `programBytes32`, `WARP_EVMTEST2`              | After Solana warp deploy (Step 8) |
| `test-evm-to-solana.ts`                                                        | `RWA_TOKEN`, `WARP_EVMTEST2`, `SOLANA_PROGRAM`, `expectedRouter` | After Solana warp deploy (Step 8) |

EVM addresses are deterministic on fresh Anvil instances so they typically stay the same. Solana addresses change on every `solana-test-validator --reset` unless keypairs are reused.

---

## What Persists Between Restarts

**Persisted:** source code, scripts, config files, built binaries, Solana program keypairs.

**Lost on restart:** all EVM contract state, Solana ledger state, agent checkpoints and databases.

---

## Troubleshooting

**"unexpected argument '--ism' found"** when deploying Solana core:
Use the corrected command from Step 3 (no `--ism` or `--use-existing-keys` flags).

**"Could not find a declaration file for module 'js-yaml'":**
Use `enroll-routers-simple.ts` which has no external dependencies.

**"No contract found at address" / "call revert exception":**
Contracts need redeploying after an Anvil restart. Follow Steps 2-7 in order.

**"No return data from InboxGetRecipientIsm instruction":**
The Solana warp route was initialized with a different mailbox than what agents use. Ensure `solalocal/core/program-ids.json` matches the active `sealeveltest1` core deployment, then redeploy the warp route.

**"Validator has not announced any storage locations":**
Run the ISM validator configuration commands from Step 8.3.

**"Transfer: insufficient lamports" in relayer logs:**
Fund the ATA payer PDA and/or relayer payer as described in Step 8.4.

**Agents not starting:**

```bash
./test_scripts/stop-agents.sh
pkill -f relayer; pkill -f validator
./test_scripts/start-agents.sh
```

---

## Script Reference

| Script                                | Purpose                                     |
| ------------------------------------- | ------------------------------------------- |
| `enroll-routers-simple.ts`            | Enroll EVM-EVM remote routers               |
| `enroll-solana-simple.ts`             | Enroll Solana router on EVM warp contract   |
| `mint-tokens.ts`                      | Mint RWA tokens on evmtest2                 |
| `test-bridge-auto.ts`                 | Test EVM-EVM bridge transfer                |
| `test-evm-to-solana.ts`               | Test EVM-Solana bridge transfer             |
| `test_scripts/start-agents.sh`        | Start all validators and relayer            |
| `test_scripts/stop-agents.sh`         | Stop all agents                             |
| `test_scripts/quick-start.sh`         | Quick start when contracts already deployed |
| `test_scripts/setup-solana-bridge.sh` | Fresh Solana warp route deployment          |
| `test_scripts/test-bridge.sh`         | Shell-based bridge test                     |
| `test_scripts/test-bridge-curl.sh`    | Curl-based bridge test                      |
| `test_scripts/test-solana-status.sh`  | Check Solana bridge status                  |
