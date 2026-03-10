# Solana Bridge — Business & Cost Reference

This document covers the financial and operational aspects of the Pruv ↔ Solana bridge:
the one-time deployment costs, what tokens users send and receive, the fees users pay per bridge transaction,
and the ongoing on-chain costs to keep the bridge running.

> **Pruv is currently a gasless chain.** All transaction fees on the Pruv side are **0 PRUV** at this time.
> This will change in the future when Pruv introduces gas — all zero-cost items below will need to be
> re-evaluated against the gas price at that time.

For the step-by-step deployment guide, see [TESTNET_GUIDE.md](TESTNET_GUIDE.md).

---

## Table of Contents

1. [Token Mechanics — What Users Send and Receive](#1-token-mechanics--what-users-send-and-receive)
2. [One-Time Deployment Costs](#2-one-time-deployment-costs)
3. [User Bridge Transaction Fees](#3-user-bridge-transaction-fees)
4. [Ongoing On-Chain Costs](#4-ongoing-on-chain-costs)
5. [Solana Rent — How It Works](#5-solana-rent--how-it-works)
6. [On-Chain Cost Summary](#6-on-chain-cost-summary)
7. [Cost Scaling: Adding More Tokens](#7-cost-scaling-adding-more-tokens)

---

## 1. Token Mechanics — What Users Send and Receive

The bridge uses Hyperlane's **Lock & Mint / Burn & Release** Warp Route model.

### Pruv → Solana Direction

| Token bridged from Pruv | Type on Pruv     | What lands on Solana | Type on Solana                   |
| ----------------------- | ---------------- | -------------------- | -------------------------------- |
| PRUV (native gas token) | Native coin      | Wrapped PRUV (SPL)   | Synthetic SPL token (9 decimals) |
| USDC (ERC20)            | ERC20 collateral | Wrapped USDC (SPL)   | Synthetic SPL token (9 decimals) |
| Custom ERC20            | ERC20 collateral | Wrapped ERC20 (SPL)  | Synthetic SPL token (9 decimals) |

**What "synthetic" means**: The bridge creates a brand-new SPL token (Solana's token standard) on Solana.
It is minted when tokens arrive from Pruv and burned when they return. It has no independent market value —
it is backed 1:1 by the locked tokens on the Pruv side.

**Decimal conversion**: Pruv tokens use 18 decimals; Solana SPL tokens use 9 decimals (Solana standard).
Hyperlane's warp route handles the conversion automatically — users always see the correct human-readable amount.

### Solana → Pruv Direction (reverse bridge)

The bridge is **fully bidirectional**. No extra deployment is needed — the same contracts handle both directions.

| Token on Solana     | Action on Solana       | What lands on Pruv      | Action on Pruv                   |
| ------------------- | ---------------------- | ----------------------- | -------------------------------- |
| Wrapped PRUV (SPL)  | Burned by warp program | PRUV released to wallet | Unlocked from HypNative contract |
| Wrapped USDC (SPL)  | Burned by warp program | USDC (ERC20) released   | Unlocked from HypERC20Collateral |
| Wrapped ERC20 (SPL) | Burned by warp program | ERC20 released          | Unlocked from HypERC20Collateral |

---

## 2. One-Time Deployment Costs

These are paid once when setting up the bridge. Solana costs are rent deposited into program accounts
(locked permanently, not spent). Pruv costs are zero because the chain is currently gasless.

### 2.1 Solana — Core Programs

These four programs are the shared backbone of the bridge. They handle all tokens; you deploy them once.

| Program                        | File Size  | Rent Deposit (SOL) | Note                                      |
| ------------------------------ | ---------- | ------------------ | ----------------------------------------- |
| `mailbox`                      | 205 KB     | ~1.46 SOL          | Central message hub                       |
| `igp` (gas paymaster)          | 243 KB     | ~1.73 SOL          | Collects cross-chain gas prepayments      |
| `validator_announce`           | 134 KB     | ~0.96 SOL          | Registers validator checkpoint storage    |
| `multisig_ism_message_id`      | 190 KB     | ~1.35 SOL          | Verifies Pruv validator signatures        |
| Deploy transaction fees        | —          | ~0.50 SOL          | ~15 transactions during core deploy       |
| **Core total (net permanent)** | **772 KB** | **~6.0 SOL**       | This SOL stays locked in program accounts |

> **Liquidity note during deploy**: Each program needs a temporary upload buffer account of the same size.
> You need ~11–12 SOL liquid during the deploy window. After buffer accounts close automatically on success,
> ~5.5 SOL is returned. The net permanent lock is ~6.0 SOL.

### 2.2 Solana — Warp Route Programs (per token)

Each token gets its own Solana warp program — the "token bridge contracts" on Solana.

| Token                     | Program Used          | File Size | Rent Deposit (SOL) |
| ------------------------- | --------------------- | --------- | ------------------ |
| PRUV (native)             | `token_native.so`     | 327 KB    | ~2.28 SOL          |
| USDC (collateral)         | `token_collateral.so` | 354 KB    | ~2.47 SOL          |
| Custom ERC20 (collateral) | `token_collateral.so` | 354 KB    | ~2.47 SOL          |

> Rent amounts are per program account only and do not include the temporary buffer during upload.
> Each warp program deploy also requires ~0.10–0.15 SOL in transaction fees.

### 2.3 Solana — ATA Payer PDAs (per token)

Each Solana warp program has an ATA payer PDA that pays rent to create token accounts for new recipients.
This is funded once at deploy and refilled as the bridge is used.

| Token             | Initial Funding (SOL)         |
| ----------------- | ----------------------------- |
| PRUV warp         | 0.5 SOL (recommended minimum) |
| USDC warp         | 0.5 SOL (recommended minimum) |
| Custom ERC20 warp | 0.5 SOL (recommended minimum) |

> Per new unique recipient: ~0.002 SOL is consumed to create their Associated Token Account (ATA).
> This is a one-time cost per recipient — subsequent transfers to the same address cost nothing from this PDA.

### 2.4 Pruv — Warp Route Contracts

> **Pruv is currently gasless. All deployment transactions cost 0 PRUV.**
> The gas unit estimates below are included for reference for when Pruv introduces gas fees in the future.

| Contract                    | Gas (approx.) | PRUV cost (current) | PRUV cost (future, at 1 Gwei) |
| --------------------------- | ------------- | ------------------- | ----------------------------- |
| HypNative (PRUV warp)       | ~3,500,000    | **0 PRUV**          | ~0.0035 PRUV                  |
| HypERC20Collateral (USDC)   | ~3,800,000    | **0 PRUV**          | ~0.0038 PRUV                  |
| HypERC20Collateral (custom) | ~3,800,000    | **0 PRUV**          | ~0.0038 PRUV                  |
| ERC20 token contracts × 2   | ~2,400,000    | **0 PRUV**          | ~0.0024 PRUV                  |
| enrollRemoteRouter × 3      | ~240,000      | **0 PRUV**          | ~0.00024 PRUV                 |
| ISM config × 3              | ~360,000      | **0 PRUV**          | ~0.00036 PRUV                 |

### 2.5 Full Deployment Cost Summary

| Category                                  | SOL              | PRUV (current) | PRUV (future gas estimate) |
| ----------------------------------------- | ---------------- | -------------- | -------------------------- |
| Solana core programs (permanent rent)     | **~6.0 SOL**     | —              | —                          |
| Solana warp programs × 3 (permanent rent) | **~7.2 SOL**     | —              | —                          |
| ATA payer PDAs × 3 (refillable)           | **~1.5 SOL**     | —              | —                          |
| Solana transaction fees                   | **~1.0 SOL**     | —              | —                          |
| Pruv warp + ERC20 contracts               | —                | **0 PRUV**     | ~0.015 PRUV                |
| **Grand total**                           | **~15.7 SOL**    | **0 PRUV**     | ~0.015 PRUV                |
| Liquid SOL needed during deploy (buffer)  | **~22 SOL peak** | —              | —                          |
| SOL returned after buffer closes          | **~6.3 SOL**     | —              | —                          |
| **Net permanent SOL lock**                | **~15.7 SOL**    | —              | —                          |

---

## 3. User Bridge Transaction Fees

Every time a user bridges a token, fees are charged on the origin chain.

### 3.1 Fees Paid by the User on Pruv (Pruv → Solana)

> **Pruv is currently gasless. Users pay 0 PRUV in gas fees.**
> The only on-chain cost is the IGP prepayment, which covers the relayer's Solana delivery costs.
> When Pruv introduces gas in the future, users will also pay a small gas fee for the `transferRemote` call.

| Fee                                 | Amount (current)                | Amount (future, at 1 Gwei)      | Where it goes                              |
| ----------------------------------- | ------------------------------- | ------------------------------- | ------------------------------------------ |
| Pruv gas for `transferRemote`       | **0 PRUV** (gasless)            | ~0.00025 PRUV (~250,000 gas)    | Pruv validators/miners (future)            |
| Interchain gas prepayment (IGP fee) | Returned by `quoteGasPayment()` | Returned by `quoteGasPayment()` | Paid into IGP; relayer claims to cover SOL |

**The IGP fee** is what the user pre-pays to cover the relayer's cost of delivering the message on Solana.
The user does not need to hold any SOL — all Solana-side delivery costs are covered by this prepayment in PRUV.

The IGP fee is determined by the `gas-oracle-configs.json` settings, which encode the SOL/PRUV price ratio
and the estimated Solana compute units per delivery:

```json
"pruvtest": {
  "solanatestnet": {
    "oracleConfig": {
      "tokenExchangeRate": "1500000000000000",  // SOL/PRUV price ratio × 1e18
      "gasPrice": "1000",                        // Solana compute unit price (lamports)
      "tokenDecimals": 9
    },
    "overhead": 600000                            // Solana compute units consumed per delivery
  }
}
```

At these settings, a typical delivery consumes ~600,000 compute units at 1000 lamports/unit = ~0.0006 SOL worth of PRUV as the IGP fee. This value scales with actual market prices and should be updated on mainnet deployment.

> **User cost summary (Pruv → Solana):**
>
> - Pruv gas: **0 PRUV** (gasless; will be ~0.00025 PRUV after gas is introduced)
> - IGP prepayment: small amount of PRUV equivalent to ~0.0006 SOL at current oracle rates
> - **The bridge is effectively free for users on the Pruv side today**

### 3.2 Fees Paid by the User on Solana (reverse bridge, Solana → Pruv)

When a user bridges back from Solana to Pruv, they call the Solana warp program directly.
They must hold a small amount of SOL. No PRUV is needed on Solana.

| Fee                              | Amount                                       | Who pays                      |
| -------------------------------- | -------------------------------------------- | ----------------------------- |
| Solana base transaction fee      | ~0.000005 SOL (5,000 lamports)               | User (from their SOL balance) |
| Compute unit priority fee        | ~0.0001–0.001 SOL (varies with network load) | User                          |
| IGP fee (to cover Pruv delivery) | Small SOL amount quoted by Solana IGP        | User                          |

> Since Pruv is gasless, the Solana IGP oracle for the reverse direction sets `gasPrice: 0` for the Pruv chain,
> meaning the IGP fee on this side is also effectively **~0 SOL** beyond base transaction costs.
> When Pruv introduces gas, the Solana IGP oracle config will need to be updated to reflect this.

### 3.3 Fees Paid by the Operator (relayer delivery)

The relayer payer wallet pays Solana transaction fees when delivering messages to the Solana side.
These are offset by the IGP fees users pre-pay.

| Cost per delivery                 | Amount                                |
| --------------------------------- | ------------------------------------- |
| Base Solana transaction fee       | ~0.000005 SOL                         |
| Compute unit priority fee         | ~0.0001–0.001 SOL (network-dependent) |
| ATA creation (new recipient only) | ~0.002 SOL (one-time per recipient)   |

---

## 4. Ongoing On-Chain Costs

These are the pure on-chain costs to keep the bridge running.

### 4.1 Relayer Payer SOL Balance (Solana)

The relayer pays Solana transaction fees every time it delivers a message. You must maintain a positive balance.

| Scenario                              | SOL consumed per delivery |
| ------------------------------------- | ------------------------- |
| Delivery to an existing recipient     | ~0.0001 SOL               |
| Delivery to a new recipient (new ATA) | ~0.002 SOL                |

**Recommended minimum balance**: 0.5 SOL at all times. Top up when balance drops below 0.2 SOL.

The relayer recovers the IGP fees that users pre-paid, which offsets these costs over time.

### 4.2 ATA Payer PDA Top-Up Schedule

The ATA payer PDA is the only Solana account that continuously decreases as new users receive bridged tokens.

| Bridge traffic                      | ATA cost per month |
| ----------------------------------- | ------------------ |
| 100 new unique recipients / month   | ~0.2 SOL           |
| 1,000 new unique recipients / month | ~2.0 SOL           |
| 10,000 new unique recipients/month  | ~20 SOL            |

> Once a recipient's ATA is created it persists permanently. Subsequent transfers to the same address
> cost **nothing** from the ATA payer — only brand-new wallets trigger a deduction.

### 4.3 Solana Rent — Ongoing Obligations

Solana rent is **not a recurring charge**. Deployed programs are rent-exempt: they lock a minimum balance
proportional to their size that stays in the account forever unless the account is explicitly closed.

| Account type                          | Rent model                                                |
| ------------------------------------- | --------------------------------------------------------- |
| Core programs (mailbox, IGP, ISM, VA) | One-time deposit at deploy, locked permanently            |
| Warp route programs (per token)       | One-time deposit per token, locked permanently            |
| ATA payer PDA                         | Decreases with each new recipient; must be topped up      |
| Message storage (mailbox internal)    | Small per-message accounts; typically covered by IGP fees |

> **There is no monthly rent bill for Solana programs.** The deposit stays in the account indefinitely.
> If you close or upgrade a program, the full deposit is returned to your wallet.

---

## 5. Solana Rent — How It Works

Understanding Solana's rent model explains why ongoing costs are low after the initial deployment.

### Rent-Exemption Model

Every account on Solana must maintain a minimum balance to remain "rent-exempt". The formula is:

```
minimum_balance = account_size_bytes × 6.96 lamports/byte + 128 × 6.96 lamports (base overhead)
1 SOL = 1,000,000,000 lamports
```

Accounts below this minimum are eventually purged by the network. Accounts at or above it are kept forever
at no additional cost.

When the Hyperlane deployment command creates a program, it automatically deposits the rent-exempt minimum
into the program account. This SOL is **locked in the account** — it is not spent or burned.

### What This Means Practically

| Scenario                              | Cost                                       |
| ------------------------------------- | ------------------------------------------ |
| Deploying a 205 KB mailbox program    | Deposit ~1.46 SOL once → locked in account |
| Running the program for 1 year        | 0 SOL additional rent                      |
| Running the program for 10 years      | 0 SOL additional rent                      |
| Closing/upgrading the program         | ~1.46 SOL returned to your wallet          |
| Adding a new token (new warp program) | Deposit ~2.4 SOL once → locked in account  |

### Accounts That Do Consume SOL Over Time

| Account              | Why it decreases                                                                   |
| -------------------- | ---------------------------------------------------------------------------------- |
| ATA payer PDA        | Pays ~0.002 SOL per new recipient to create their token account (ATAs don't close) |
| Relayer payer wallet | Pays Solana transaction fees (~0.0001 SOL) for every message delivery              |

---

## 6. On-Chain Cost Summary

This section summarizes what the bridge operator should budget for on-chain costs only.

### Initial On-Chain Funding Required

| Item                                   | SOL           | PRUV         |
| -------------------------------------- | ------------- | ------------ |
| Solana core program rent (permanent)   | ~6.0 SOL      | —            |
| Solana warp route rent × 3 (permanent) | ~7.2 SOL      | —            |
| ATA payer PDAs × 3 (initial top-up)    | ~1.5 SOL      | —            |
| Deploy + enrollment transaction fees   | ~1.0 SOL      | —            |
| Pruv contract deployments              | —             | **0 PRUV** ¹ |
| Relayer payer working balance          | 0.5 SOL       | —            |
| **Total initial on-chain funding**     | **~16.2 SOL** | **0 PRUV**   |
| Liquid SOL needed at deploy peak       | **~22 SOL**   | —            |
| SOL returned after buffer close        | **~6.3 SOL**  | —            |
| **Net permanent on-chain lock**        | **~15.7 SOL** | —            |

> ¹ Pruv is currently gasless. All Pruv-side deployments are free. See note at top of document.

### Recurring On-Chain Costs

| Item                                       | Cost per month (low traffic) | Cost per month (high traffic) |
| ------------------------------------------ | ---------------------------- | ----------------------------- |
| ATA payer top-up (~100 new recipients)     | ~0.2 SOL                     | ~20 SOL (10,000 recipients)   |
| Relayer payer top-up (deliveries)          | ~0.05 SOL                    | ~0.5 SOL                      |
| Pruv transaction fees (bridge sends)       | **0 PRUV** (gasless) ¹       | **0 PRUV** (gasless) ¹        |
| **Total recurring on-chain (low traffic)** | **~0.25 SOL / month**        | —                             |

> ¹ When Pruv introduces gas, each user `transferRemote` call will cost approximately 250,000 gas × gas price in PRUV. At 1 Gwei that is ~0.00025 PRUV per bridge transaction.

---

## 7. Cost Scaling: Adding More Tokens

Adding a new token does **not** require redeploying core programs or restarting agents.
The relayer picks up new warp routes automatically through the shared Mailbox.

| Cost item                         | Per additional token              | PRUV cost (current) | PRUV cost (future gas) |
| --------------------------------- | --------------------------------- | ------------------- | ---------------------- |
| Deploy Solana warp program (rent) | ~2.4 SOL (permanent)              | —                   | —                      |
| ATA payer funding                 | 0.5 SOL (refillable)              | —                   | —                      |
| Deploy EVM warp contract          | —                                 | **0 PRUV**          | ~0.0038 PRUV           |
| Deploy ERC20 token (if new)       | —                                 | **0 PRUV**          | ~0.0012 PRUV           |
| enrollRemoteRouter                | —                                 | **0 PRUV**          | ~0.00008 PRUV          |
| ISM config                        | —                                 | **0 PRUV**          | ~0.00012 PRUV          |
| Ongoing ATA top-up                | ~0.002 SOL per 100 new recipients | —                   | —                      |

**One-time cost per additional token: ~2.9 SOL + 0 PRUV (gasless) / ~0.005 PRUV (after gas)**

---

## Quick Reference

| Question                                   | Answer                                                                      |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| What do users receive on Solana?           | A synthetic SPL token (wrapped PRUV, USDC, or custom ERC20), 9 decimals     |
| Can users bridge back from Solana to Pruv? | Yes — same contracts, fully bidirectional                                   |
| How much does a user pay per bridge?       | 0 PRUV gas (gasless) + small IGP prepayment; nearly free today              |
| What is the one-time on-chain deploy cost? | ~15.7 SOL (permanent lock) + 0 PRUV (gasless Pruv)                          |
| Is there monthly rent on Solana?           | No — rent is a one-time deposit, not a recurring charge                     |
| What on-chain costs recur monthly?         | ~0.25 SOL/month (ATA payer + relayer fees) at low traffic                   |
| How much to add one more token?            | ~2.9 SOL + 0 PRUV (gasless) one-time                                        |
| What if I close a program later?           | All rent deposit is returned to your wallet                                 |
| When will Pruv fees change?                | When Pruv introduces gas — re-evaluate all "0 PRUV" line items at that time |
