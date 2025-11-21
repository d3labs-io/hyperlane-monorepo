# TokenBridge Deployment Guide

This guide provides step-by-step instructions for deploying the TokenBridge contract to any EVM-compatible network.

## Deployment Flow Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     DEPLOYMENT PROCESS                          │
└─────────────────────────────────────────────────────────────────┘

1. Prerequisites          2. Install           3. Compile
   ┌──────────┐             ┌──────────┐         ┌──────────┐
   │ Node.js  │────────────▶│   npm    │────────▶│ Hardhat  │
   │ Wallet   │             │ install  │         │ compile  │
   └──────────┘             └──────────┘         └──────────┘
                                                        │
                                                        ▼
4. Configure Network    5. Set Environment    6. Deploy Contracts
   ┌──────────────┐       ┌──────────────┐      ┌──────────────┐
   │ hardhat.     │       │    .env      │      │ Implementation│
   │ config.ts    │◀──────│    file      │─────▶│   + Proxy    │
   └──────────────┘       └──────────────┘      └──────────────┘
                                                        │
                                                        ▼
7. Verify Contract      8. Test Deployment    9. Configure
   ┌──────────────┐       ┌──────────────┐      ┌──────────────┐
   │ Block        │       │ Check Owner  │      │ Grant Admins │
   │ Explorer     │◀──────│ Check Fees   │─────▶│ Set Vault    │
   └──────────────┘       └──────────────┘      └──────────────┘
```

## Table of Contents

- [Prerequisites](#prerequisites)
- [Step 1: Install Dependencies](#step-1-install-dependencies)
- [Step 2: Compile Contracts](#step-2-compile-contracts)
- [Step 3: Configure Network](#step-3-configure-network)
- [Step 4: Set Up Environment Variables](#step-4-set-up-environment-variables)
- [Step 5: Deploy Contracts](#step-5-deploy-contracts)
- [Step 6: Verify Deployment](#step-6-verify-deployment)
- [Step 7: Post-Deployment Configuration](#step-7-post-deployment-configuration)
- [Using the Makefile](#using-the-makefile)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher): [Download here](https://nodejs.org/)
- **npm** or **yarn**: Comes with Node.js
- **Git**: [Download here](https://git-scm.org/)
- **A wallet with funds** on the target network for deployment

---

## Step 1: Install Dependencies

Navigate to the `evm` directory and install all required dependencies:

```bash
cd evm
npm install
```

This will install:
- Hardhat (Ethereum development environment)
- OpenZeppelin contracts and upgrades plugin
- TypeScript and related tooling
- Testing frameworks

**Using Makefile:**
```bash
make install
```

---

## Step 2: Compile Contracts

Compile the Solidity contracts to generate artifacts and TypeChain types:

```bash
npx hardhat compile
```

This command will:
- Compile all contracts in the `contracts/` directory
- Generate artifacts in the `artifacts/` directory
- Generate TypeScript types in the `typechain-types/` directory
- Validate contract syntax and dependencies

**Expected output:**
```
Compiled 15 Solidity files successfully
```

**Using Makefile:**
```bash
make compile
```

---

## Step 3: Configure Network

Edit the `hardhat.config.ts` file to add your target network configuration.

### Example: Adding a New Network

```typescript
networks: {
  // Existing network
  pruvTestnet: {
    url: "https://rpc.testnet.pruv.network",
    chainId: 7336,
    accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
  },
  
  // Add your network here
  myNetwork: {
    url: "https://rpc.mynetwork.com",  // RPC endpoint
    chainId: 12345,                     // Chain ID
    accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
  },
}
```

### Network Configuration Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `url` | RPC endpoint URL | `https://rpc.mynetwork.com` |
| `chainId` | Network chain ID (EIP-155) | `1` (Ethereum), `56` (BSC), `137` (Polygon) |
| `accounts` | Array of private keys for deployment | `[process.env.PRIVATE_KEY]` |

### Popular Networks

<details>
<summary>Click to expand network configurations</summary>

```typescript
// Ethereum Mainnet
ethereum: {
  url: "https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY",
  chainId: 1,
  accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
},

// Polygon Mainnet
polygon: {
  url: "https://polygon-rpc.com",
  chainId: 137,
  accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
},

// BSC Mainnet
bsc: {
  url: "https://bsc-dataseed.binance.org",
  chainId: 56,
  accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
},

// Arbitrum One
arbitrum: {
  url: "https://arb1.arbitrum.io/rpc",
  chainId: 42161,
  accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
},
```
</details>

---

## Step 4: Set Up Environment Variables

Create a `.env` file in the `evm` directory by copying the example file:

```bash
cp env.example .env
```

Edit the `.env` file with your deployment parameters:

```bash
# ===========================================
# DEPLOYMENT CONFIGURATION
# ===========================================

# Private key of the deployer account (without 0x prefix)
PRIVATE_KEY=your_private_key_here

# Owner address - has OWNER_ROLE, DEFAULT_ADMIN_ROLE, UPGRADER_ROLE
# This address controls all administrative functions
OWNER_ADDRESS=0xYourOwnerAddress

# System wallet address - has SYSTEM_WALLET_ROLE
# This address is authorized to execute release and mint operations
SYSTEM_WALLET_ADDRESS=0xYourSystemWalletAddress

# Fee token address (ERC20 contract address)
# Set to zero address if no fee initially: 0x0000000000000000000000000000000000000000
FEE_TOKEN_ADDRESS=0xYourFeeTokenAddress

# Fee amount in wei (with token decimals)
# Example for 18 decimals: 1 token = 1000000000000000000
# Example for 6 decimals (USDC): 1 token = 1000000
FEE_AMOUNT=1000000000000000000

# Current chain ID (CAIP-2 format: namespace:reference)
# Examples: "eip155:1" (Ethereum), "eip155:56" (BSC), "pruv:testnet"
CURRENT_CHAIN_ID=eip155:1
```

### Environment Variable Descriptions

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `PRIVATE_KEY` | ✅ Yes | Private key of deployer (without 0x) | `abc123...` |
| `OWNER_ADDRESS` | ✅ Yes | Address that will own the contract | `0x1234...` |
| `SYSTEM_WALLET_ADDRESS` | ✅ Yes | Address authorized for system operations | `0x5678...` |
| `FEE_TOKEN_ADDRESS` | ✅ Yes | ERC20 token used for fees | `0xabcd...` or `0x0000...` |
| `FEE_AMOUNT` | ✅ Yes | Fee amount in smallest unit | `1000000` (1 USDC) |
| `CURRENT_CHAIN_ID` | ✅ Yes | Chain identifier (CAIP-2 format) | `eip155:1` |
| `PROXY_ADDRESS` | ❌ No | Set after deployment | `0x9876...` |

### Security Best Practices

⚠️ **IMPORTANT SECURITY NOTES:**

1. **Never commit your `.env` file** - It contains sensitive private keys
2. **Use different addresses** for owner and system wallet in production
3. **Keep private keys secure** - Consider using hardware wallets for mainnet
4. **Test on testnet first** - Always deploy to testnet before mainnet
5. **Verify all addresses** - Double-check all addresses before deployment

---

## Step 5: Deploy Contracts

Deploy the TokenBridge contract using the deployment script:

```bash
npx hardhat run scripts/deploy.ts --network <network-name>
```

Replace `<network-name>` with your configured network (e.g., `pruvTestnet`, `ethereum`, `polygon`).

### Deployment Process

The deployment script performs the following steps:

1. **Validates environment variables** - Ensures all required variables are set
2. **Deploys TokenBridge implementation** - Deploys the logic contract
3. **Deploys BridgeProxy** - Deploys the UUPS proxy contract
4. **Initializes the proxy** - Calls `initialize()` with your parameters
5. **Outputs addresses** - Displays implementation and proxy addresses

### Example Deployment

```bash
# Deploy to Pruv Testnet
npx hardhat run scripts/deploy.ts --network pruvTestnet
```

**Expected output:**
```
🚀 Starting TokenBridge deployment...

📋 Deployment Configuration:
- Network: pruvTestnet (Chain ID: 7336)
- Owner: 0xCcA55A052F2140541b6650093890A0a21405dCc7
- System Wallet: 0xCcA55A052F2140541b6650093890A0a21405dCc7
- Fee Token: 0x0d5662c4b6B70433CF32ef3D0c5ccc815A7B17f4
- Fee Amount: 1000000000000000000
- Chain ID: pruv:testnet

👤 Deploying with account: 0xCcA55A052F2140541b6650093890A0a21405dCc7
💰 Account balance: 10.5 ETH

📦 Deploying TokenBridge implementation...
✅ TokenBridge implementation deployed at: 0x1234567890abcdef1234567890abcdef12345678

🔧 Encoding initialization data...
📦 Deploying BridgeProxy...
✅ BridgeProxy deployed at: 0xabcdef1234567890abcdef1234567890abcdef12

✅ Deployment completed successfully!
```

**Using Makefile:**
```bash
# Deploy to configured network
make deploy NETWORK=pruvTestnet

# Or use the default network
make deploy
```

### Save Deployment Addresses

After successful deployment, **update your `.env` file** with the deployed addresses:

```bash
# Add these to your .env file
PROXY_ADDRESS=0xabcdef1234567890abcdef1234567890abcdef12
IMPLEMENTATION_ADDRESS=0x1234567890abcdef1234567890abcdef12345678
```

---

## Step 6: Verify Deployment

After deployment, verify that the contract was deployed correctly:

### 6.1 Check Contract on Block Explorer

Visit your network's block explorer and search for the proxy address:
- Ethereum: https://etherscan.io
- Polygon: https://polygonscan.com
- BSC: https://bscscan.com
- Pruv Testnet: https://explorer.testnet.pruv.network

### 6.2 Verify Contract Source Code

Verify the contract source code on the block explorer:

```bash
npx hardhat verify --network <network-name> <PROXY_ADDRESS>
```

**Using Makefile:**
```bash
make verify NETWORK=pruvTestnet
```

### 6.3 Test Contract Functions

Run a simple test to verify the contract is working:

```bash
npx hardhat console --network <network-name>
```

Then in the console:
```javascript
const TokenBridge = await ethers.getContractFactory("TokenBridge");
const bridge = TokenBridge.attach("YOUR_PROXY_ADDRESS");

// Check owner
const owner = await bridge.getOwner();
console.log("Owner:", owner);

// Check fee parameters
const feeToken = await bridge.getFeeToken();
const feeAmount = await bridge.getFeeAmount();
console.log("Fee Token:", feeToken);
console.log("Fee Amount:", feeAmount.toString());

// Check if contract is paused
const paused = await bridge.paused();
console.log("Paused:", paused);
```

**Using Makefile:**
```bash
make test-deployment NETWORK=pruvTestnet
```

---

## Step 7: Post-Deployment Configuration

After deployment, you may need to perform additional configuration:

### 7.1 Grant Additional Admins

Grant admin role to additional addresses:

```bash
# Edit scripts/grantAdmin.ts to set the admin address
# Then run:
npx hardhat run scripts/grantAdmin.ts --network <network-name>
```

**Using Makefile:**
```bash
make grant-admin NETWORK=pruvTestnet ADMIN_ADDRESS=0x...
```

### 7.2 Grant System Wallets

Grant system wallet role to additional addresses for executing bridge operations:

```javascript
// In Hardhat console or create a script
const bridge = await ethers.getContractAt("TokenBridge", "PROXY_ADDRESS");
await bridge.grantSystemWallet("0xSystemWalletAddress");
```

### 7.3 Update Fee Parameters (Optional)

Update fee token or amount if needed:

```javascript
const bridge = await ethers.getContractAt("TokenBridge", "PROXY_ADDRESS");
await bridge.setFee("0xNewFeeTokenAddress", ethers.parseEther("0.5"));
```

---

## Using the Makefile

The project includes a Makefile to simplify common operations. Here are the available commands:

### Installation & Compilation

```bash
make install          # Install dependencies
make compile          # Compile contracts
make clean            # Clean artifacts and cache
make test             # Run all tests
make coverage         # Generate test coverage report
```

### Deployment

```bash
make deploy NETWORK=pruvTestnet              # Deploy to specified network
make verify NETWORK=pruvTestnet              # Verify contract on block explorer
make deploy-and-verify NETWORK=pruvTestnet   # Deploy and verify in one command
```

### Contract Interactions

```bash
make grant-admin NETWORK=pruvTestnet ADMIN_ADDRESS=0x...     # Grant admin role
make lock-tokens NETWORK=pruvTestnet                         # Lock tokens (test)
make unlock-tokens NETWORK=pruvTestnet                       # Unlock tokens (system wallet)
make burn-tokens NETWORK=pruvTestnet                         # Burn tokens (test)
make mint-tokens NETWORK=pruvTestnet                         # Mint tokens (system wallet)
```

### Upgrades

```bash
make upgrade NETWORK=pruvTestnet             # Upgrade contract to new implementation
make force-import NETWORK=pruvTestnet        # Import existing proxy for upgrade tracking
```

### Utilities

```bash
make console NETWORK=pruvTestnet             # Open Hardhat console
make node                                    # Start local Hardhat node
make help                                    # Show all available commands
```

---

## Troubleshooting

### Common Issues and Solutions

#### 1. "Insufficient funds for gas"

**Problem:** Deployer account doesn't have enough native tokens for gas.

**Solution:**
- Check your account balance: `make check-balance NETWORK=pruvTestnet`
- Send more native tokens to your deployer address
- For testnets, use a faucet to get test tokens

#### 2. "Invalid environment variable"

**Problem:** Required environment variables are not set or invalid.

**Solution:**
- Verify your `.env` file exists and has all required variables
- Check that addresses start with `0x` and are valid Ethereum addresses
- Ensure `PRIVATE_KEY` doesn't include the `0x` prefix
- Validate `FEE_AMOUNT` is a valid number

#### 3. "Network not configured"

**Problem:** The specified network is not in `hardhat.config.ts`.

**Solution:**
- Add the network configuration to `hardhat.config.ts` (see Step 3)
- Verify the network name matches exactly (case-sensitive)

#### 4. "Nonce too high" or "Nonce too low"

**Problem:** Transaction nonce is out of sync.

**Solution:**
- Reset your account nonce in MetaMask (Settings → Advanced → Reset Account)
- Wait a few minutes and try again
- Check if there are pending transactions

#### 5. "Contract verification failed"

**Problem:** Block explorer cannot verify the contract source code.

**Solution:**
- Ensure you're verifying the proxy address, not the implementation
- Check that the network is supported by the block explorer
- Verify the compiler version matches (0.8.28)
- For custom networks, configure `etherscan` section in `hardhat.config.ts`

#### 6. "Initialization failed"

**Problem:** Contract initialization reverts during deployment.

**Solution:**
- Check that all addresses are valid (not zero address)
- Verify `CURRENT_CHAIN_ID` is not empty
- Ensure `FEE_TOKEN_ADDRESS` is a valid ERC20 contract (or zero address)

---

## Additional Resources

- **Hardhat Documentation:** https://hardhat.org/docs
- **OpenZeppelin Upgrades:** https://docs.openzeppelin.com/upgrades-plugins/
- **Solidity Documentation:** https://docs.soliditylang.org/
- **EIP-1967 (Proxy Standard):** https://eips.ethereum.org/EIPS/eip-1967
- **CAIP-2 (Chain ID Format):** https://github.com/ChainAgnostic/CAIPs/blob/master/CAIPs/caip-2.md

---

## Security Considerations

### Before Mainnet Deployment

- [ ] Complete security audit by reputable firm
- [ ] Run comprehensive test suite (`make test`)
- [ ] Deploy to testnet and test all functions
- [ ] Verify upgrade mechanism works correctly
- [ ] Test emergency pause functionality
- [ ] Review all role assignments
- [ ] Set up monitoring and alerting
- [ ] Prepare incident response plan
- [ ] Use multi-sig wallet for owner role
- [ ] Document all admin procedures

### Ongoing Security

- [ ] Monitor contract events and transactions
- [ ] Keep private keys in hardware wallets
- [ ] Regularly review admin and system wallet addresses
- [ ] Test upgrades on testnet before mainnet
- [ ] Maintain emergency contact list
- [ ] Keep dependencies updated
- [ ] Regular security reviews

---

## Support

For issues or questions:
1. Check this documentation
2. Review the contract code and comments
3. Check existing GitHub issues
4. Create a new issue with detailed information

---

**Last Updated:** 2025-11-20
**Version:** 1.0.0

