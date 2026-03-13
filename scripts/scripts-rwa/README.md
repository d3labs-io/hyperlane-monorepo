# PRUV Bridge — RWA Token Bridge Scripts

Programmatic bridge scripts for transferring RWA tokens ("KAIA TEST" / KAI) between **Kaia Kairos Testnet** and **PRUV Testnet** using the Hyperlane warp route infrastructure.

## Contract Addresses

### PRUV Testnet (domain 7336)

| Contract | Address | Type |
|----------|---------|------|
| Warp Route | `0x6a7ac9211E92cF0c4481BC606666b30B2d110592` | HypERC20CollateralWithFee (TransparentUpgradeableProxy → `0x4fB21AC01eE3d35cd6bB537F2cB7dB120e0476Bc`) |
| RWA Token | `0x16cE242211458bd215eC7304367520F60B0D09c9` | "KAIA TEST" (KAI), 6 decimals, ERC1967Proxy |
| Fee Token (USDC) | `0xeCacC484026a02022565496E088CA0581cC36373` | FiatTokenProxy (FiatTokenV2_2), 6 decimals |

### Kaia Kairos Testnet (domain 1001)

| Contract | Address | Type |
|----------|---------|------|
| Warp Route / Token | `0x1daeeb8410741c38ed77fc0d120186bd6b6e0306` | HypERC20 synthetic (warp route IS the token), "KAIA TEST" (KAI), 6 decimals |

### Router Enrollment

Both warp routes are bidirectionally enrolled:

- PRUV `0x6a7ac...` → `routers(1001)` = `0x1daeeb8410741c38ed77fc0d120186bd6b6e0306` (Kaia)
- Kaia `0x1daee...` → `routers(7336)` = `0x6a7ac9211E92cF0c4481BC606666b30B2d110592` (PRUV)

## Bridge Flow

### PRUV → Kaia (Collateral → Synthetic)

The PRUV side is a **HypERC20CollateralWithFee** route. It locks the RWA token as collateral and charges a USDC fee.

| Step | Action | Contract | Details |
|------|--------|----------|---------|
| 1 | **Quote** | Warp Route | `quoteTransferRemote()` returns 3 quotes: gas (native), transfer token (KAI), fee (USDC) |
| 2 | **Approve RWA token** | RWA Token (`0x16cE...`) | `approve(warpRoute, amount)` — allow warp route to pull KAI |
| 3 | **Approve fee token** | USDC (`0xeCac...`) | `approve(warpRoute, feeAmount)` — allow warp route to pull USDC fee |
| 4 | **Bridge** | Warp Route | `transferRemote(1001, recipient, amount)` — locks KAI collateral + collects USDC fee |
| 5 | **Relay** | Hyperlane Relayer | Delivers message to Kaia; synthetic KAI is **minted** on destination |

### Kaia → PRUV (Synthetic → Collateral)

The Kaia side is a **HypERC20** synthetic route. No fee is charged.

| Step | Action | Contract | Details |
|------|--------|----------|---------|
| 1 | **Quote** | Warp Route | `quoteTransferRemote()` returns 1 quote: gas only (native, amount=0) |
| 2 | **Approve synthetic KAI** | Warp Route (`0x1dae...`) | `approve(warpRoute, amount)` — the warp route IS the token |
| 3 | **Bridge** | Warp Route | `transferRemote(7336, recipient, amount)` — **burns** synthetic KAI |
| 4 | **Relay** | Hyperlane Relayer | Delivers message to PRUV; RWA collateral is **released** on destination |

### Key Differences Between Directions

| | PRUV → Kaia | Kaia → PRUV |
|---|---|---|
| **Quote length** | 3 (gas + transfer + fee) | 1 (gas only) |
| **Fee** | 0.1 USDC | None |
| **Token action** | Lock collateral | Burn synthetic |
| **Delivery action** | Mint synthetic | Release collateral |
| **Approvals needed** | 2 (RWA token + USDC fee) | 1 (synthetic KAI) |

## Setup

```bash
cd scripts/scripts-rwa
yarn install
cp .env.example .env
# Edit .env with your private key and desired parameters
```

## Usage

```bash
# Bridge RWA from PRUV to Kaia (using .env defaults)
yarn bridge:pruv-to-kaia

# Bridge RWA from Kaia to PRUV
yarn bridge:kaia-to-pruv

# Custom parameters (CLI flags override .env)
yarn bridge --source-chain pruv --destination-chain kaia --token-amount 1 --private-key 0x...

# Send to a different recipient
yarn bridge --source-chain pruv --destination-chain kaia --token-amount 1 --recipient 0x...
```

## CLI Options

| Flag | Env Variable | Description | Default |
|------|-------------|-------------|---------|
| `--private-key` | `PRIVATE_KEY` | Sender wallet private key | (required) |
| `--token-amount` | `TOKEN_AMOUNT` | Amount in human-readable format (e.g., `1` = 1 KAI) | (required) |
| `--source-chain` | `SOURCE_CHAIN` | Source chain: `kaia` or `pruv` | `kaia` |
| `--destination-chain` | `DESTINATION_CHAIN` | Destination chain: `kaia` or `pruv` | `pruv` |
| `--recipient` | `RECIPIENT` | Override recipient address | sender address |

## Reference Transactions (Manual)

These are the original manual transactions used to reverse-engineer the bridge parameters:

| Step | Tx Hash | Description |
|------|---------|-------------|
| Approve USDC (fee) | [`0x7fe34fee...`](https://explorer.testnet.pruv.network/tx/0x7fe34fee81549624052ecbb32b685b4d112c1ed2eb72bb1a1a7cea0fa2bb608a) | Approved 100,000 USDC (0.1 USDC) to warp route `0x6a7ac...` |
| Approve RWA token | [`0x50ca867a...`](https://explorer.testnet.pruv.network/tx/0x50ca867ab5d316868e7eaebad2ff23aaa37c311fabdebbc5b4758d2577d9a3d2) | Approved 1,000,000 KAI (1 KAI) to warp route `0x6a7ac...` |
| Bridge (transferRemote) | [`0x878bbc12...`](https://explorer.testnet.pruv.network/tx/0x878bbc12b9dbbac16ef05a9a2f055f1e4a3232d4d2ce65d8dce7759c129adf84) | Bridged 1 KAI from PRUV → Kaia (domain 1001) |

### Bridge Transaction Decoded

- **Method**: `transferRemote(uint32 _destination, bytes32 _recipient, uint256 _amountOrId)`
- **Parameters**:
  - `_destination`: `1001` (Kaia Kairos)
  - `_recipient`: `0x0000000000000000000000003aa0dde27a8626072253219081ae388aef43bfb3`
  - `_amountOrId`: `1000000` (1 KAI with 6 decimals)
- **Token transfers in tx**:
  - USDC: 100,000 (0.1 USDC fee) → RouterFeeCollector
  - KAI: 1,000,000 (1 KAI) → Warp Route (locked as collateral)
- **Gas used**: 180,109

## Test Results

All tests run on 2026-03-13 with sender `0x3AA0dDE27a8626072253219081AE388AEF43Bfb3`.

### Test 1: PRUV → Kaia (1.5 KAI)

| Step | Tx Hash | Explorer |
|------|---------|----------|
| Approve KAI | `0xb2d92e6a3720c1fa187044864e923995830a90c3c6a847fc5bc543531f945809` | [PRUV](https://explorer.testnet.pruv.network/tx/0xb2d92e6a3720c1fa187044864e923995830a90c3c6a847fc5bc543531f945809) |
| Approve USDC (fee) | `0x49e3654018305193d725298823914da05a1dcb6ddffe065635711f700d1f1002` | [PRUV](https://explorer.testnet.pruv.network/tx/0x49e3654018305193d725298823914da05a1dcb6ddffe065635711f700d1f1002) |
| transferRemote | `0x62378eaec375b26b4ac94b1d1627df41ab9291e441dfb47d4f4964140705bfdb` | [PRUV](https://explorer.testnet.pruv.network/tx/0x62378eaec375b26b4ac94b1d1627df41ab9291e441dfb47d4f4964140705bfdb) |
| Delivery | `0x4c10ee8cdc2e407e0b49c14f4c0c262c79583706ffcf76aa22d5ba0570310fe7` | [Kaia](https://kairos.kaiascan.io/tx/0x4c10ee8cdc2e407e0b49c14f4c0c262c79583706ffcf76aa22d5ba0570310fe7) |

- **Amount**: 1.5 KAI (raw: 1,500,000)
- **Fee**: 0.1 USDC (raw: 100,000)
- **Gas used**: 180,109
- **Source block**: 11,337,786
- **Delivery block**: 211,756,124
- **Status**: Delivered

### Test 2: Kaia → PRUV (1.3 KAI)

| Step | Tx Hash | Explorer |
|------|---------|----------|
| Approve KAI (synthetic) | `0xd0fa23ca6742a6934dfdfe10cb9d7cb6c5c611d5c4e92c933be4cee95cd43708` | [Kaia](https://kairos.kaiascan.io/tx/0xd0fa23ca6742a6934dfdfe10cb9d7cb6c5c611d5c4e92c933be4cee95cd43708) |
| Fee approval | — | No fee on Kaia side |
| transferRemote | `0x05bccce51569f77379b4b46cf52f09f7c77f9532159bc6987ee275a035124871` | [Kaia](https://kairos.kaiascan.io/tx/0x05bccce51569f77379b4b46cf52f09f7c77f9532159bc6987ee275a035124871) |
| Delivery | `0x1ccbc1ace8a80082c83661e86583747c1564f423f91ea228c801510319e665e4` | [PRUV](https://explorer.testnet.pruv.network/tx/0x1ccbc1ace8a80082c83661e86583747c1564f423f91ea228c801510319e665e4) |

- **Amount**: 1.3 KAI (raw: 1,300,000)
- **Fee**: None
- **Gas used**: 136,474
- **Source block**: 211,757,921
- **Delivery block**: 11,338,436
- **Status**: Delivered

## Output

Each bridge execution appends a detailed markdown log to `output.md` with full tx hashes, parameters, quote breakdown, and relay status.

## Project Structure

```
scripts-rwa/
├── .env.example          # Environment template
├── .gitignore
├── package.json
├── tsconfig.json
├── output.md             # Auto-generated execution logs
├── README.md
└── src/
    ├── args.ts           # CLI argument parser (--source-chain, --token-amount, etc.)
    ├── config.ts         # Chain configs, contract addresses, ABIs
    ├── flow-logger.ts    # Appends structured logs to output.md
    ├── helpers.ts        # addressToBytes32, getTokenInfo, ensureAllowance
    ├── main.ts           # Bridge orchestration (quote → approve → transfer → relay)
    ├── relay-listener.ts # Polls destination chain for ReceivedTransferRemote event
    └── types.ts          # TypeScript interfaces (ChainConfig, Quote, FlowLog, etc.)
```

## Technical Notes

- **Quote format differs by route type**: Collateral routes (PRUV) return 3 quotes (gas, transfer, fee). Synthetic routes (Kaia) return only 1 quote (gas). The script handles both cases gracefully.
- **Token decimals**: Both KAI and USDC use 6 decimals. `1 KAI` = `1,000,000` raw units.
- **Gas payment**: Currently `0` for both directions (testnet configuration).
- **Relay time**: Typically 5-10 seconds on testnet.
- **Fee**: 0.1 USDC flat fee on PRUV→Kaia direction only (enforced by RouterFeeCollector on the collateral route).
