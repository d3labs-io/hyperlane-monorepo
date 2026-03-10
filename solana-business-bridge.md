# Solana Bridge — Business & Cost Reference

This document covers the financial and operational aspects of the Pruv ↔ Solana Testnet bridge:
the one-time deployment costs, what tokens users send and receive, the fees users pay per bridge transaction,
and the ongoing costs to keep the bridge running.

For the step-by-step deployment guide, see [TESTNET_GUIDE.md](TESTNET_GUIDE.md).

---

## Table of Contents

1. [Token Mechanics — What Users Send and Receive](#1-token-mechanics--what-users-send-and-receive)
2. [One-Time Deployment Costs](#2-one-time-deployment-costs)
3. [User Bridge Transaction Fees](#3-user-bridge-transaction-fees)
4. [Ongoing Operational Costs](#4-ongoing-operational-costs)
5. [Solana Rent — How It Works](#5-solana-rent--how-it-works)
6. [Monthly Cost Summary](#6-monthly-cost-summary)
7. [Cost Scaling: Adding More Tokens](#7-cost-scaling-adding-more-tokens)

---

## 1. Token Mechanics — What Users Send and Receive

The bridge uses Hyperlane's **Lock & Mint / Burn & Release** Warp Route model.

### Pruv → Solana Direction

| Token bridged from pruvtest | Type on pruvtest | What lands on Solana | Type on Solana                   |
| --------------------------- | ---------------- | -------------------- | -------------------------------- |
| PRUV (native gas token)     | Native coin      | Wrapped PRUV (SPL)   | Synthetic SPL token (9 decimals) |
| USDC (ERC20)                | ERC20 collateral | Wrapped USDC (SPL)   | Synthetic SPL token (9 decimals) |
| Custom ERC20                | ERC20 collateral | Wrapped ERC20 (SPL)  | Synthetic SPL token (9 decimals) |

**What "synthetic" means**: The bridge creates a brand-new SPL token (Solana's token standard) on Solana.
It is minted when tokens arrive from pruvtest and burned when they return. It has no independent market —
its value is backed 1:1 by the locked tokens on the pruvtest side.

**Decimal conversion**: pruvtest tokens use 18 decimals; the Solana SPL tokens use 9 decimals (Solana standard).
Hyperlane's warp route handles the conversion automatically — users always see the correct human-readable amount.

### Solana → Pruv Direction (reverse bridge)

The bridge is **fully bidirectional**. No extra deployment is needed — the same contracts handle both directions.

| Token on Solana     | Action on Solana       | What lands on pruvtest  | Action on pruvtest               |
| ------------------- | ---------------------- | ----------------------- | -------------------------------- |
| Wrapped PRUV (SPL)  | Burned by warp program | PRUV released to wallet | Unlocked from HypNative contract |
| Wrapped USDC (SPL)  | Burned by warp program | USDC (ERC20) released   | Unlocked from HypERC20Collateral |
| Wrapped ERC20 (SPL) | Burned by warp program | ERC20 released          | Unlocked from HypERC20Collateral |

---

## 2. One-Time Deployment Costs

These costs are paid once to set up the bridge. Most are Solana rent that stays locked for as long as the programs exist.

### 2.1 Solana Testnet — Core Programs

These four programs are the shared backbone of the bridge. They handle all tokens; you deploy them once.

| Program                        | File Size  | Rent Cost (SOL) | Note                                      |
| ------------------------------ | ---------- | --------------- | ----------------------------------------- |
| `mailbox`                      | 205 KB     | ~1.46 SOL       | Central message hub                       |
| `igp` (gas paymaster)          | 243 KB     | ~1.73 SOL       | Collects cross-chain gas fees             |
| `validator_announce`           | 134 KB     | ~0.96 SOL       | Registers validator checkpoint storage    |
| `multisig_ism_message_id`      | 190 KB     | ~1.35 SOL       | Verifies pruvtest validator signatures    |
| Deploy transaction fees        | —          | ~0.50 SOL       | ~15 transactions during core deploy       |
| **Core total (net permanent)** | **772 KB** | **~6.0 SOL**    | This SOL stays locked in program accounts |

> **Liquidity note during deploy**: Each program needs a temporary upload buffer account of the same size.
> You need ~11–12 SOL liquid while deploying. After the buffer accounts close (automatically after success),
> ~5.5 SOL is returned. The net permanent lock is ~6.0 SOL.

### 2.2 Solana Testnet — Warp Route Programs (per token)

Each token gets its own Solana warp program. These are the "token bridge contracts" on Solana.

| Token                     | Program Used          | File Size | Rent Cost (SOL) |
| ------------------------- | --------------------- | --------- | --------------- |
| PRUV (native)             | `token_native.so`     | 327 KB    | ~2.28 SOL       |
| USDC (collateral)         | `token_collateral.so` | 354 KB    | ~2.47 SOL       |
| Custom ERC20 (collateral) | `token_collateral.so` | 354 KB    | ~2.47 SOL       |

> Rent numbers are per program account only and do not include the temporary buffer during upload.
> Each warp program deploy also requires ~0.10–0.15 SOL in transaction fees.

### 2.3 Solana Testnet — ATA Payer PDAs (per token)

Each Solana warp program has a special account (ATA payer PDA) that pays rent to create token accounts
for new recipients. This is a one-time top-up, but must be refilled as recipients accumulate.

| Token             | ATA Payer Funding             |
| ----------------- | ----------------------------- |
| PRUV warp         | 0.5 SOL (recommended minimum) |
| USDC warp         | 0.5 SOL (recommended minimum) |
| Custom ERC20 warp | 0.5 SOL (recommended minimum) |

> Per new unique recipient: ~0.002 SOL is consumed from the ATA payer to create their token account.
> This is a one-time cost per recipient address — second and subsequent transfers to the same address are free.

### 2.4 pruvtest (EVM) — Warp Route Contracts

| Contract                    | Gas (approx.) | PRUV cost (at 1 Gwei) |
| --------------------------- | ------------- | --------------------- |
| HypNative (PRUV)            | ~3,500,000    | ~0.0035 PRUV          |
| HypERC20Collateral (USDC)   | ~3,800,000    | ~0.0038 PRUV          |
| HypERC20Collateral (custom) | ~3,800,000    | ~0.0038 PRUV          |
| ERC20 token contracts × 2   | ~2,400,000    | ~0.0024 PRUV          |
| enrollRemoteRouter × 3      | ~240,000      | ~0.00024 PRUV         |
| ISM config × 3              | ~360,000      | ~0.00036 PRUV         |

> Run `npx ts-node scripts/estimate-testnet-fees.ts` to get live PRUV costs based on the current gas price.

### 2.5 Full Deployment Cost Summary

| Category                                  | SOL              | PRUV            |
| ----------------------------------------- | ---------------- | --------------- |
| Solana core programs (permanent rent)     | **~6.0 SOL**     | —               |
| Solana warp programs × 3 (permanent rent) | **~7.2 SOL**     | —               |
| ATA payer PDAs × 3 (refillable)           | **~1.5 SOL**     | —               |
| Solana transaction fees                   | **~1.0 SOL**     | —               |
| pruvtest EVM contracts                    | —                | **~0.015 PRUV** |
| **Grand total**                           | **~15.7 SOL**    | **~0.015 PRUV** |
| Liquid SOL needed during deploy (buffer)  | **~22 SOL peak** | —               |
| SOL returned after buffer closes          | **~6.3 SOL**     | —               |
| **Net permanent lock**                    | **~15.7 SOL**    | —               |

---

## 3. User Bridge Transaction Fees

Every time a user bridges a token, they pay fees on both the sending and receiving chains.

### 3.1 Fees Paid by the User on pruvtest (EVM side)

When a user calls `transferRemote` on the EVM warp contract, they pay two costs:

| Fee                                  | Amount                                                | Where it goes                                 |
| ------------------------------------ | ----------------------------------------------------- | --------------------------------------------- |
| EVM gas for `transferRemote`         | ~250,000 gas × gas price ≈ **0.00025 PRUV** at 1 Gwei | pruvtest validators/miners                    |
| Interchain gas pre-payment (IGP fee) | Returned by `quoteGasPayment()` call                  | Paid into the IGP contract; relayer claims it |

**The IGP fee** is the amount the user pre-pays to cover the relayer's cost of delivering the message on Solana.
The user does not need to hold any SOL — all Solana-side costs are covered from this prepayment.

The IGP fee depends on the `gas-oracle-configs.json` settings. In the current testnet config:

```json
"pruvtest": {
  "solanatestnet": {
    "oracleConfig": {
      "tokenExchangeRate": "1500000000000000",  // SOL/PRUV price ratio × 1e18
      "gasPrice": "1000",                        // Solana compute units price
      "tokenDecimals": 9
    },
    "overhead": 600000                            // Solana compute units overhead per delivery
  }
}
```

At these settings, a typical bridge delivery costs approximately **0.0006 SOL worth of PRUV** as an IGP fee.
This is a small amount on testnet — mainnet values will reflect real market prices.

> **Summary**: A typical user bridge transaction costs approximately:
>
> - EVM gas: ~0.00025 PRUV (negligible at low gas prices)
> - IGP prepayment: ~0.0006 PRUV equivalent (covers relayer's Solana costs)
> - **Total user cost: < 0.001 PRUV per bridge transfer** on testnet

### 3.2 Fees Paid by the User on Solana (reverse bridge, Solana → pruvtest)

When a user bridges back from Solana to pruvtest, they call the Solana warp program:

| Fee                                  | Amount                                         | Who pays                      |
| ------------------------------------ | ---------------------------------------------- | ----------------------------- |
| Solana transaction fee               | ~0.000005 SOL (5,000 lamports)                 | User (from their SOL balance) |
| Compute unit fee                     | Variable, ~0.0001 SOL at current priority fees | User                          |
| IGP fee (to cover pruvtest delivery) | Paid in SOL into the Solana IGP                | User                          |

The user must hold a small amount of SOL to initiate a reverse bridge transfer. No PRUV is needed on Solana.

### 3.3 Fees Paid by the Operator (you)

The relayer payer wallet pays the actual Solana transaction fee when the relayer delivers a message:

| Cost per delivery                 | Amount                              |
| --------------------------------- | ----------------------------------- |
| Base transaction fee              | ~0.000005 SOL                       |
| Priority fee (compute units)      | ~0.0001–0.001 SOL during congestion |
| ATA creation (new recipient only) | ~0.002 SOL (one-time per recipient) |

The relayer reclaims the IGP fee that the user pre-paid to offset these costs. On testnet the amounts are minimal.

---

## 4. Ongoing Operational Costs

### 4.1 Validator Infrastructure

The validator watches the pruvtest Mailbox and signs checkpoints. It must run continuously for the bridge to work.

| Resource           | Spec                                   | Estimated cost |
| ------------------ | -------------------------------------- | -------------- |
| Server (cloud VM)  | 2 vCPU, 4 GB RAM, 50 GB SSD            | ~$20–40/month  |
| Network egress     | Minimal (JSON-RPC calls only)          | Included       |
| pruvtest RPC       | Public endpoint sufficient for testnet | Free           |
| Checkpoint storage | Local filesystem on the VM             | Included       |

> For production: use S3/GCS for checkpoint storage (~$0.02/GB/month). Validator checkpoints are small (<1 MB).

### 4.2 Relayer Infrastructure

The relayer watches both chains and delivers messages. It runs alongside the validator (same VM is fine for testnet).

| Resource                    | Spec                             | Estimated cost |
| --------------------------- | -------------------------------- | -------------- |
| Server                      | Shared with validator on testnet | $0 additional  |
| Solana testnet RPC          | Public endpoint (rate-limited)   | Free           |
| Solana relayer payer wallet | Must maintain SOL balance        | See 4.3        |

> For production: use a dedicated Solana RPC (Helius, Triton, QuickNode). Paid plans start at ~$50/month.

### 4.3 Relayer Payer SOL Balance (Solana)

The relayer pays real Solana transaction fees when delivering messages to the Solana side.
These are recovered via the IGP fee the user pre-pays, but you must maintain a working balance.

| Scenario                                | SOL consumed per delivery |
| --------------------------------------- | ------------------------- |
| Delivery to existing recipient          | ~0.0001 SOL               |
| Delivery to new recipient (creates ATA) | ~0.002 SOL                |

**Recommended minimum balance**: 0.5 SOL at all times. Top up when balance drops below 0.2 SOL.

### 4.4 Solana Rent — Ongoing Obligations

Solana rent is **not a recurring monthly charge**. Deployed programs are rent-exempt: they maintain a
minimum balance proportional to their size that stays locked in the account forever (until the account is closed).

| What                                        | Rent model                                           |
| ------------------------------------------- | ---------------------------------------------------- |
| Core programs (mailbox, IGP, etc.)          | One-time deposit, locked permanently                 |
| Warp route programs                         | One-time deposit per token, locked permanently       |
| ATA payer PDA                               | Top up as it gets consumed paying for recipient ATAs |
| Message storage (mailbox internal accounts) | Small per-message rent, typically covered by IGP     |

> **There is no monthly rent bill for Solana programs.** The rent you deposit at deploy time stays in the account.
> If you ever close (upgrade or remove) a program, the rent is returned to you.

### 4.5 ATA Payer PDA Top-Up Schedule

The ATA payer PDA is the only account that will decrease over time as new users receive bridged tokens.

| Bridge usage                       | ATA cost per month |
| ---------------------------------- | ------------------ |
| 100 new unique recipients/month    | ~0.2 SOL/month     |
| 1,000 new unique recipients/month  | ~2.0 SOL/month     |
| 10,000 new unique recipients/month | ~20 SOL/month      |

> After the first transfer to a recipient, their token account exists permanently. Subsequent transfers to the same address cost nothing from the ATA payer.

---

## 5. Solana Rent — How It Works

Understanding Solana's rent model helps explain why the "ongoing cost" is low after initial deployment.

### Rent-Exemption Model

Every account on Solana must maintain a minimum balance to remain "rent-exempt". The formula is:

```
minimum_balance = account_size_bytes × 6.96 lamports/byte + 128 × 6.96 lamports (base overhead)
```

Accounts below this minimum are eventually purged. Accounts at or above it are kept forever.

When you deploy a Hyperlane program, the deploy command automatically deposits the rent-exempt minimum
into the program account. This balance is **locked in the account** — not spent, not recurring.

### What This Means Practically

| Scenario                              | Cost                                       |
| ------------------------------------- | ------------------------------------------ |
| Deploying a 205 KB program            | Deposit ~1.46 SOL once → locked in account |
| Running the program for 1 year        | $0 in rent                                 |
| Running the program for 10 years      | $0 in rent                                 |
| Closing the program (upgrade)         | Get ~1.46 SOL back                         |
| Adding a new token (new warp program) | Deposit ~2.4 SOL once → locked in account  |

### Accounts That Do Consume Rent Over Time

| Account type         | Why it costs over time                                                            |
| -------------------- | --------------------------------------------------------------------------------- |
| ATA payer PDA        | Pays ~0.002 SOL to create each recipient's token account (ATAs do not auto-close) |
| Relayer payer wallet | Pays transaction fees for every message delivery                                  |
| New message storage  | Small accounts created per message — typically negligible and included in IGP     |

---

## 6. Monthly Cost Summary

This section summarizes what the bridge operator should budget monthly after initial deployment.

### Infrastructure (testnet)

| Item                                  | Monthly Cost      |
| ------------------------------------- | ----------------- |
| Validator + relayer server (cloud VM) | $20–40            |
| Solana RPC (public testnet endpoint)  | Free              |
| pruvtest RPC                          | Free              |
| S3/GCS for checkpoint storage         | ~$1               |
| **Testnet infrastructure total**      | **~$21–41/month** |

### Solana Token Costs (testnet, low traffic)

| Item                                         | Monthly Cost  |
| -------------------------------------------- | ------------- |
| ATA payer top-up (~100 new recipients/month) | ~0.2 SOL      |
| Relayer payer top-up (bridge deliveries)     | ~0.05 SOL     |
| **Total SOL per month (low traffic)**        | **~0.25 SOL** |

> At ~$150/SOL (testnet SOL has no real value), equivalent production cost would be ~$37/month for moderate traffic.

### Infrastructure (production/mainnet estimate)

| Item                                           | Monthly Cost        |
| ---------------------------------------------- | ------------------- |
| Validator server (higher reliability)          | $80–150             |
| Dedicated Solana RPC (e.g. Helius Growth plan) | $99–299             |
| pruvtest RPC (if dedicated)                    | $50–100             |
| S3 for validator checkpoints                   | ~$5                 |
| **Production infrastructure total**            | **~$234–554/month** |

---

## 7. Cost Scaling: Adding More Tokens

Adding a new token to the bridge does **not** require redeploying core programs or restarting agents.

| Cost item                              | Per additional token            |
| -------------------------------------- | ------------------------------- |
| Deploy Solana warp program (rent)      | ~2.4 SOL (permanent)            |
| ATA payer funding                      | 0.5 SOL (refillable)            |
| Deploy EVM warp contract (gas)         | ~0.0038 PRUV                    |
| Deploy ERC20 token (gas, if new token) | ~0.0012 PRUV                    |
| enrollRemoteRouter (gas)               | ~0.00008 PRUV                   |
| ISM config (gas)                       | ~0.00012 PRUV                   |
| Ongoing monthly ATA top-up             | ~0.002 SOL / 100 new recipients |

**One-time cost per additional token: ~2.9 SOL + ~0.005 PRUV**

---

## Quick Reference

| Question                                   | Answer                                                                            |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| What do users receive on Solana?           | A synthetic SPL token (wrapped PRUV, USDC, or custom ERC20)                       |
| Can users bridge back from Solana to Pruv? | Yes — same contracts, fully bidirectional                                         |
| How much does a user pay per bridge?       | < 0.001 PRUV equivalent on testnet                                                |
| What is the one-time deploy cost?          | ~15.7 SOL (permanent) + ~0.015 PRUV                                               |
| Is there monthly rent on Solana?           | No — rent is a one-time deposit, not a recurring charge                           |
| What costs recur monthly?                  | Infrastructure (~$20–40/month testnet), ATA top-ups (~0.25 SOL/month low traffic) |
| How much to add one more token?            | ~2.9 SOL + ~0.005 PRUV one-time                                                   |
| What if I close a program later?           | All rent is returned to your wallet                                               |
