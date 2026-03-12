# PRUV Bridge Transfer Script

Automates cross-chain ERC20 token transfers between **Kaia Kairos Testnet** and **Pruv Testnet** using Hyperlane warp routes.

## Quick Start

```bash
cd scripts
yarn install

# Bridge 1 USDT from Kaia → Pruv (default direction)
yarn bridge --private-key <YOUR_KEY> --token-amount 1

# Bridge from Pruv → Kaia
yarn bridge --source-chain pruv --destination-chain kaia \
  --private-key <YOUR_KEY> \
  --token-amount 1
```

## Setup

### 1. Install dependencies

```bash
cd scripts
yarn install
```

### 2. Configure environment (optional)

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:

```env
PRIVATE_KEY=your_private_key_here
TOKEN_AMOUNT=1
SOURCE_CHAIN=kaia
DESTINATION_CHAIN=pruv
```

## Usage

### Using CLI arguments (overrides .env)

```bash
yarn bridge \
  --private-key <PRIVATE_KEY> \
  --token-amount <AMOUNT> \
  --source-chain <kaia|pruv> \
  --destination-chain <kaia|pruv> \
  --recipient <OPTIONAL_RECIPIENT_ADDRESS>
```

### Using .env file only

```bash
yarn bridge
```

### Using shortcut scripts

```bash
# Kaia → Pruv (reads remaining config from .env)
yarn bridge:kaia-to-pruv

# Pruv → Kaia
yarn bridge:pruv-to-kaia
```

## Parameters

| Parameter | CLI Flag | Env Variable | Required | Default | Description |
|-----------|----------|-------------|----------|---------|-------------|
| Private Key | `--private-key` | `PRIVATE_KEY` | **Yes** | — | Wallet private key (with or without 0x prefix) |
| Token Amount | `--token-amount` | `TOKEN_AMOUNT` | **Yes** | — | Human-readable amount (e.g., `1` = 1 USDT, `0.5` = 0.5 USDT) |
| Source Chain | `--source-chain` | `SOURCE_CHAIN` | No | `kaia` | Source chain identifier |
| Destination Chain | `--destination-chain` | `DESTINATION_CHAIN` | No | `pruv` | Destination chain identifier |
| Recipient | `--recipient` | `RECIPIENT` | No | sender | Recipient address on destination (defaults to sender) |

> **Priority**: CLI arguments override `.env` values.
>
> **Token address** is determined automatically from the source chain — no need to specify it.

## Chain Configuration

| Chain | Domain ID | Chain ID | Warp Route | USDT Address |
|-------|-----------|----------|------------|--------------|
| Kaia Kairos | `1001` | `1001` | `0x8fe41adb2890df3d591160052fb0e502e4f07f11` | `0xd077a400968890eacc75cdc901f0356c943e4fdb` |
| Pruv Testnet | `7336` | `7336` | `0xe0f0a2d91ca9a3db5635048f8b2be4a016bba592` | `0xc547f385c7D0A50Bb4b4889dF4d863F0abAD2885` |

## What the Script Does

1. **Quotes the transfer** — calls `quoteTransferRemote` on the warp route to get:
   - Native gas payment required (msg.value)
   - Transfer token address and amount (e.g., USDT)
   - Fee token address and amount (e.g., USDC) — if the route charges a fee
2. **Validates** — verifies all balances (native, transfer token, fee token)
3. **Approves transfer token** — sets ERC20 allowance for the transfer token (e.g., USDT) to the warp route
4. **Approves fee token** — sets ERC20 allowance for the fee token (e.g., USDC) to the warp route, if a fee is required
5. **Calls `transferRemote`** — sends tokens through Hyperlane warp route with gas payment as msg.value
6. **Waits for delivery** — polls the destination chain for `ReceivedTransferRemote` event

After the transaction is confirmed on the source chain, the Hyperlane relayer picks up the message and delivers it to the destination chain (typically 1–5 minutes).

### Fee Collection Flow

The warp route contracts (`HypERC20CollateralWithFee` / `HypFiatTokenWithFee`) collect a fee during `transferRemote`:

```
quoteTransferRemote() → [gasPayment, transferAmount, feeAmount]
                                                          │
transferRemote() internally does:                         │
  1. feeCollector.quoteFee(destination)  ←────────────────┘
  2. safeTransferFrom(sender → feeCollector, feeAmount)   ← needs approval
  3. _transferRemote(destination, recipient, amount)       ← needs approval
```

The fee token (e.g., USDC) may be **different** from the transfer token (e.g., USDT). The script handles both approvals automatically.

## Example Output

### Kaia → Pruv (no fee)

```
────────────────────────────────────────────────────────────
🌉 PRUV Bridge — Transfer Remote
────────────────────────────────────────────────────────────
  Source:      Kaia Kairos Testnet (domain 1001)
  Destination: Pruv Testnet (domain 7336)
  Token:       0xd077a400968890eacc75cdc901f0356c943e4fdb
  Amount:      0.4
────────────────────────────────────────────────────────────

  Sender:      0x3AA0...Bfb3
  Recipient:   0x3AA0...Bfb3
  Raw amount:  400000 (6 decimals)

📊 Step 1: Quoting transfer...
  Gas quote:       0.0 native token
  Transfer token:  0xd077...4fDb (USD₮)
  Transfer amount: 0.4 USD₮
  Fee:             None

🔍 Pre-flight checks...
  Native balance:  1.2
  USD₮ balance:    5.0
  ✅ All checks passed
────────────────────────────────────────────────────────────

📝 Step 2: Approving transfer token...
  Approve tx:  https://kairos.kaiascan.io/tx/0xf686...42cd
  ✅ USD₮ approval confirmed

📝 Step 3: No fee token approval needed

🚀 Step 4: Calling transferRemote...
  📤 Tx hash:  0xd1ef...42e2
  Explorer:    https://kairos.kaiascan.io/tx/0xd1ef...42e2
  Waiting for confirmation...
────────────────────────────────────────────────────────────

✅ Transfer submitted successfully!
  Block:       211586230
  Gas used:    152973
  Status:      Success
────────────────────────────────────────────────────────────

📋 Summary:
  Bridged 0.4 USD₮ from Kaia Kairos Testnet → Pruv Testnet
  Recipient: 0x3AA0...Bfb3

  ⏳ The relayer will deliver the message to the destination chain.

⏳ Step 5: Waiting for delivery on Pruv Testnet...
  ✅ Delivered in block 11277083
  Tx:  https://explorer.testnet.pruv.network/tx/0xbfed...8c38
  Amount received: 0.4 USD₮
```

### Pruv → Kaia (with USDC fee)

```
────────────────────────────────────────────────────────────
🌉 PRUV Bridge — Transfer Remote
────────────────────────────────────────────────────────────
  Source:      Pruv Testnet (domain 7336)
  Destination: Kaia Kairos Testnet (domain 1001)
  Token:       0xc547f385c7D0A50Bb4b4889dF4d863F0abAD2885
  Amount:      0.5
────────────────────────────────────────────────────────────

  Sender:      0x3AA0...Bfb3
  Recipient:   0x3AA0...Bfb3
  Raw amount:  500000 (6 decimals)

📊 Step 1: Quoting transfer...
  Gas quote:       0.0 native token
  Transfer token:  0xc547...2885 (USDT)
  Transfer amount: 0.5 USDT
  Fee token:       0xeCac...6373 (USDC)
  Fee amount:      0.1 USDC

🔍 Pre-flight checks...
  Native balance:  2.0
  USDT balance:    3.5
  USDC balance:    1.0 (fee token)
  ✅ All checks passed
────────────────────────────────────────────────────────────

📝 Step 2: Approving transfer token...
  Approve tx:  https://explorer.testnet.pruv.network/tx/0xfcd6...cedd
  ✅ USDT approval confirmed

📝 Step 3: Approving fee token (USDC)...
  Approve tx:  https://explorer.testnet.pruv.network/tx/0xd220...4e8f
  ✅ USDC (fee) approval confirmed

🚀 Step 4: Calling transferRemote...
  📤 Tx hash:  0x1cbe...3b06
  Explorer:    https://explorer.testnet.pruv.network/tx/0x1cbe...3b06
  Waiting for confirmation...
────────────────────────────────────────────────────────────

✅ Transfer submitted successfully!
  Block:       11277093
  Gas used:    165455
  Status:      Success
────────────────────────────────────────────────────────────

📋 Summary:
  Bridged 0.5 USDT from Pruv Testnet → Kaia Kairos Testnet
  Fee paid: 0.1 USDC
  Recipient: 0x3AA0...Bfb3

  ⏳ The relayer will deliver the message to the destination chain.

⏳ Step 5: Waiting for delivery on Kaia Kairos Testnet...
  ✅ Delivered in block 211586288
  Tx:  https://kairos.kaiascan.io/tx/0x3d42...41e1
  Amount received: 0.5 USDT
```

> **Note:** Kaia → Pruv transfers have no fee. Pruv → Kaia transfers charge a USDC fee (collected by the fee collector contract on Pruv).

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `Insufficient balance` | Not enough transfer tokens | Fund wallet with tokens on source chain |
| `Insufficient fee balance` | Not enough fee tokens (e.g., USDC) | Fund wallet with fee tokens on source chain |
| `Failed to quote transfer` | Warp route not configured for destination | Verify chain domain IDs and warp route address |
| `Transaction reverted` | Possible: insufficient approval, contract paused | Check approvals, native balance, contract state |
| `PRIVATE_KEY missing` | Neither CLI arg nor .env provided | Pass `--private-key` or set in `.env` |

## Security

- **Never commit `.env` files** — they contain your private key
- `.env` is gitignored; use `.env.example` as template
- For production, use a dedicated bridge wallet with limited funds
- Consider using hardware wallet signing for mainnet operations

## Project Structure

```
scripts/
├── src/
│   ├── main.ts            # Entry point — bridge orchestration (Steps 1–5)
│   ├── types.ts           # All interfaces (ChainConfig, BridgeArgs, Quote, FlowLog, etc.)
│   ├── config.ts          # Chain configs (incl. token addresses), ABIs, constants
│   ├── args.ts            # CLI argument parsing + validation
│   ├── helpers.ts         # Utility functions (addressToBytes32, getTokenInfo, ensureAllowance)
│   ├── flow-logger.ts     # output.md generation (appendToOutputMd)
│   └── relay-listener.ts  # Destination chain polling (waitForRelayedMessage)
├── .env.example           # Environment variable template
├── package.json
├── tsconfig.json
└── README.md
```
