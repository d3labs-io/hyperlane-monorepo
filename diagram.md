# Hyperlane Bridge — Token Transfer Flow

## High-Level Overview

```mermaid
flowchart LR
    subgraph Source Chain
        User([User]) -->|1. transferRemote| WarpSrc[Warp Route\nCollateral/Synthetic]
        WarpSrc -->|2. lock/burn tokens| WarpSrc
        WarpSrc -->|3. dispatch message| MailboxSrc[Mailbox]
        MailboxSrc -->|4. record in tree| MerkleHook[MerkleTreeHook]
    end

    subgraph Off-Chain Agents
        MerkleHook -.->|5. index & sign checkpoint| Validator[Validator]
        Validator -.->|6. store signature| CheckpointStorage[(Checkpoint\nStorage)]
        CheckpointStorage -.->|7. fetch proof + sig| Relayer[Relayer]
    end

    subgraph Destination Chain
        Relayer -->|8. process message| MailboxDst[Mailbox]
        MailboxDst -->|9. verify via ISM| ISM[MultisigISM]
        ISM -->|10. approved| MailboxDst
        MailboxDst -->|11. handle| WarpDst[Warp Route\nSynthetic/Collateral]
        WarpDst -->|12. mint/unlock tokens| Recipient([Recipient])
    end
```

---

## EVM → EVM Transfer (evmtest2 → test4)

Token: **RWA Token** — Collateral on evmtest2, Synthetic on test4.

```mermaid
sequenceDiagram
    participant User
    participant RWA as RWA Token (ERC20)
    participant Collateral as HypERC20Collateral<br/>evmtest2
    participant Mailbox_Src as Mailbox<br/>evmtest2
    participant Hook as MerkleTreeHook<br/>evmtest2
    participant Fee as ProtocolFee<br/>(requiredHook)
    participant Validator as Validator Agent
    participant Relayer as Relayer Agent
    participant Mailbox_Dst as Mailbox<br/>test4
    participant ISM as MultisigISM<br/>test4
    participant Synthetic as HypERC20<br/>test4
    participant Recipient

    User->>RWA: approve(collateral, amount)
    User->>Collateral: transferRemote(31337, recipient, amount) + ETH fee

    Note over Collateral: Locks RWA tokens in contract
    Collateral->>RWA: transferFrom(user → collateral)

    Collateral->>Mailbox_Src: dispatch(31337, recipient, body)
    Mailbox_Src->>Hook: postDispatch (defaultHook)
    Note over Hook: Inserts message hash into merkle tree
    Mailbox_Src->>Fee: postDispatch (requiredHook)
    Note over Fee: Collects protocol fee

    Mailbox_Src-->>Validator: (indexes new message from chain)
    Validator->>Validator: Sign checkpoint (merkle root + index)
    Validator-->>Relayer: (checkpoint stored on local filesystem)

    Relayer->>Relayer: Build merkle proof + validator signature
    Relayer->>Mailbox_Dst: process(metadata, message)
    Mailbox_Dst->>ISM: verify(metadata, message)
    Note over ISM: Check validator signature ≥ threshold
    ISM-->>Mailbox_Dst: ✓ verified

    Mailbox_Dst->>Synthetic: handle(origin, sender, body)
    Note over Synthetic: Mints synthetic RWA tokens
    Synthetic->>Recipient: mint(recipient, amount)
```

### Reverse: test4 → evmtest2

When sending **back** from test4 to evmtest2, the synthetic tokens are **burned** on test4 and the original collateral tokens are **unlocked** on evmtest2.

---

## EVM → Solana Transfer (evmtest2 → sealeveltest1)

Token: **RWA Token** — Collateral on evmtest2, Synthetic on Solana.

```mermaid
sequenceDiagram
    participant User
    participant RWA as RWA Token (ERC20)
    participant Collateral as HypERC20Collateral<br/>evmtest2
    participant Mailbox_EVM as Mailbox<br/>evmtest2
    participant Hook as MerkleTreeHook
    participant Validator as Validator Agent<br/>(evmtest2)
    participant Relayer as Relayer Agent
    participant Mailbox_Sol as Mailbox Program<br/>Solana
    participant ISM_Sol as MultisigISM<br/>Solana
    participant WarpSol as Warp Route Program<br/>Solana
    participant Mint as SPL Token Mint<br/>(PDA)
    participant Recipient as Recipient ATA<br/>(Solana)

    User->>RWA: approve(collateral, amount)
    User->>Collateral: transferRemote(13375, solanaRecipient, amount) + ETH fee

    Note over Collateral: Locks RWA tokens<br/>(18 decimals on EVM)
    Collateral->>RWA: transferFrom(user → collateral)
    Collateral->>Mailbox_EVM: dispatch(13375, recipientBytes32, body)

    Mailbox_EVM->>Hook: postDispatch
    Mailbox_EVM-->>Validator: (indexes message)
    Validator->>Validator: Sign checkpoint

    Relayer->>Relayer: Build proof + signature
    Relayer->>Mailbox_Sol: process(metadata, message)

    Note over Mailbox_Sol: Solana Mailbox is a BPF program
    Mailbox_Sol->>ISM_Sol: verify(metadata, message)
    Note over ISM_Sol: Verify validator sig for domain 31338
    ISM_Sol-->>Mailbox_Sol: ✓ verified

    Mailbox_Sol->>WarpSol: handle(origin=31338, sender, body)

    Note over WarpSol: Decimal conversion:<br/>18 decimals (EVM) → 9 decimals (Solana)<br/>1e18 → 1e9

    WarpSol->>Mint: Mint synthetic tokens
    Note over Mint: PDA-derived mint<br/>DduRaMtxo...
    Mint->>Recipient: Create ATA if needed + transfer
    Note over Recipient: ATA Payer PDA pays<br/>for account creation
```

### Key Differences: EVM vs Solana Destination

| Aspect           | EVM Destination                         | Solana Destination                               |
| ---------------- | --------------------------------------- | ------------------------------------------------ |
| Token standard   | ERC20                                   | SPL Token (Token-2022)                           |
| Decimals         | 18 (same as source)                     | 9 (converted from 18)                            |
| Recipient format | 20-byte address, left-padded to bytes32 | 32-byte ed25519 pubkey                           |
| Account creation | Not needed                              | ATA created automatically, paid by ATA Payer PDA |
| Delivery         | Single EVM transaction                  | Solana transaction with multiple accounts        |
| ISM verification | On-chain Solidity contract              | On-chain BPF program                             |

---

## Account & PDA Relationships (Solana)

```mermaid
flowchart TD
    subgraph Solana Programs
        MailboxProg[Mailbox Program<br/>5h2jES2b...]
        ISMProg[MultisigISM Program<br/>8hdcjrMP...]
        WarpProg[Warp Route Program<br/>34xxeWuY...]
        IGPProg[IGP Program<br/>BUpbCgVm...]
        VAProg[ValidatorAnnounce<br/>5j7QdQzE...]
    end

    subgraph PDAs derived from Warp Route
        MintPDA[Mint PDA<br/>DduRaMtx...]
        ATAPayer[ATA Payer PDA<br/>FKJoajts...]
        HypToken[HyperlaneToken PDA]
    end

    subgraph Token Accounts
        RecipientATA[Recipient ATA<br/>for DduRaMtx... mint]
    end

    WarpProg --> MintPDA
    WarpProg --> ATAPayer
    WarpProg --> HypToken
    MintPDA --> RecipientATA

    MailboxProg -->|calls handle| WarpProg
    MailboxProg -->|verifies via| ISMProg
```

---

## Message Lifecycle States

```mermaid
stateDiagram-v2
    [*] --> Dispatched: User calls transferRemote()
    Dispatched --> Indexed: Validator indexes from chain
    Indexed --> Signed: Validator signs checkpoint
    Signed --> Relayed: Relayer picks up message
    Relayed --> Verified: ISM verifies on destination
    Verified --> Delivered: Mailbox calls handle()
    Delivered --> [*]: Tokens minted/unlocked

    Relayed --> Failed: ISM rejects / tx reverts
    Failed --> Relayed: Relayer retries
```

---

## Address Quick Reference (Local Setup)

### EVM (Deterministic on fresh Anvil)

| Contract              | Address                                      |
| --------------------- | -------------------------------------------- |
| Mailbox (both chains) | `0x8A791620dd6260079BF849Dc5567aDC3F2FdC318` |
| MerkleTreeHook        | `0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e` |
| ValidatorAnnounce     | `0x0B306BF915C4d645ff596e518fAf3F9669b97016` |
| ProtocolFee (IGP)     | `0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0` |

### Solana (Deterministic with reused keypairs)

| Program                          | Address                                        |
| -------------------------------- | ---------------------------------------------- |
| Mailbox                          | `5h2jES2bYcffrQSqUhJ4w6FXcdrZXkHaZXmKHV51Y77e` |
| MultisigISM                      | `8hdcjrMPhexzNuxeWKJnNVCTUoY1MMjvABY7biQuP5gy` |
| ValidatorAnnounce                | `5j7QdQzEdNiERdh3h6e18KeCv2J38tR5PtS5NzVFWg4x` |
| IGP                              | `BUpbCgVm5KVovNtsekPcEGQ3Shhq9DtTgBdTdLP1odCp` |
| Warp Route (changes each deploy) | check `program-ids.json`                       |
