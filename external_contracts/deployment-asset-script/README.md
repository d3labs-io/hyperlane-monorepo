# ERC20 Token Deployment Project

This project provides tools to deploy ERC20 tokens on EVM-compatible networks and Stellar Asset Contracts (SAC) on the Stellar network.

## Features

- Deploy ERC20 tokens to EVM networks (e.g., Pruv Testnet)
- Deploy Stellar Asset Contracts (SAC) to Stellar Testnet
- Easy-to-use Makefile for deployment commands (cross-platform: Windows, Linux, macOS)
- Transfer mint authority/ownership for both EVM and Stellar contracts
- Configurable token parameters

## Prerequisites

- Node.js (v20.0.0 or higher)
- npm or yarn
- A funded wallet for EVM deployments
- A funded Stellar account for SAC deployments

## Installation

1. Clone the repository and navigate to the project directory:

```bash
cd erc20
```

2. Install dependencies:

```bash
make install
# or
npm install
```

3. Set up your environment variables:

```bash
cp .env.example .env
```

4. Edit `.env` and add your private keys:

```env
# EVM Network Configuration
PRIVATE_KEY=your_evm_private_key_here

# Stellar Network Configuration
STELLAR_SECRET_KEY=your_stellar_secret_key_here
```

## Usage

### Quick Start with Makefile

The project includes a Makefile for easy deployment. To see all available commands:

```bash
make help
```

### Deploy ERC20 Token to EVM Network

Deploy with custom token name and symbol:

```bash
make deploy-evm TOKEN_NAME="Ekotek Token" TOKEN_SYMBOL="EKO" NETWORK=pruvTestnet
```

Deploy with default values (MyToken, MTK):

```bash
make deploy-evm
```

Available networks:
- `pruvTestnet` (default)
- Add more networks in `hardhat.config.ts`

### Deploy Stellar Asset Contract (SAC)

Deploy with custom asset code:

```bash
make deploy-stellar ASSET_CODE="EKOTEK"
```

Deploy with default asset code (MYASSET):

```bash
make deploy-stellar
```

**Note:** Stellar asset codes must be:
- Uppercase alphanumeric characters only (A-Z, 0-9)
- Maximum 12 characters
- The script will automatically convert lowercase to uppercase if needed

### Run Tests

```bash
make test
# or
npx hardhat test
```

### Compile Contracts

```bash
make compile
# or
npx hardhat compile
```

### Clean Build Artifacts

```bash
make clean
```

## Manual Deployment (without Makefile)

### EVM Deployment

```bash
TOKEN_NAME="MyToken" TOKEN_SYMBOL="MTK" npx hardhat run scripts/deploy.ts --network pruvTestnet
```

### Stellar Deployment

```bash
ASSET_CODE="MYASSET" node scripts/deploySAC.js
```

### Transfer Mint Authority / Admin

#### EVM (Pruv Testnet or other EVM networks)

To transfer the ERC20 token's mint authority (i.e., `Ownable` owner) to a proxy contract, use `scripts/transferOwnership.ts`.

**Configuration:**
- **Environment variables:**
  - `PRIVATE_KEY` – your EVM deployer/admin private key (already used elsewhere in this project)
- **Inputs (env or CLI args):**
  - `TOKEN_ADDRESS` – the deployed ERC20 token address (required)
  - `PROXY_ADDRESS` – the proxy contract address to transfer ownership to (required), in this case is our Bridge contract: 0xBBC3382D647934025aa295811C7E97080c386746

**Direct Hardhat command examples (Pruv Testnet):**

Using environment variables:
```bash
TOKEN_ADDRESS="0xYourTokenAddress" PROXY_ADDRESS="0xBBC3382D647934025aa295811C7E97080c386746" \
npx hardhat run scripts/transferOwnership.ts --network pruvTestnet
```

Using CLI arguments (first arg = TOKEN_ADDRESS, second arg = PROXY_ADDRESS):
```bash
npx hardhat run scripts/transferOwnership.ts --network pruvTestnet 0xYourTokenAddress 0xBBC3382D647934025aa295811C7E97080c386746
```

**Via Makefile:**

```bash
make transfer-ownership TOKEN_ADDRESS="0xYourTokenAddress" PROXY_ADDRESS="0xBBC3382D647934025aa295811C7E97080c386746" NETWORK=pruvTestnet
```

#### Stellar (Stellar Asset Contract admin)

To change the admin (mint authority / controller) of a Stellar Asset Contract, use `scripts/setAdmin.mjs`.

**Configuration:**
- **Environment variables:**
  - `STELLAR_SECRET_KEY` – secret key of the account authorized to update the SAC admin
- **Inputs (env or CLI):**
  - `ASSET_ID` – the Stellar Asset Contract ID (contract address) for your asset
  - `NEW_ADMIN_ADDRESS` – the new admin address (Stellar address or contract address, depending on your contract), in this case it should be Bridge contract which is: CALC65ZF6G366W67RVSLLJDR2OF5RYEOVYZHULVGTLDDE42APBZ7SDLN

**Direct node command example:**

```bash
ASSET_ID="CBEOJUP5F..." NEW_ADMIN_ADDRESS="CALC65ZF6G366W67RVSLLJDR2OF5RYEOVYZHULVGTLDDE42APBZ7SDLN" \
node scripts/setAdmin.mjs
```

**Via Makefile:**

```bash
make set-admin-stellar ASSET_ID="CBEOJUP5F..." NEW_ADMIN_ADDRESS="CALC65ZF6G366W67RVSLLJDR2OF5RYEOVYZHULVGTLDDE42APBZ7SDLN"
```

## Project Structure

```
.
├── contracts/          # Solidity smart contracts
│   └── ERC20.sol      # ERC20 token contract
├── scripts/           # Deployment and admin scripts
│   ├── deploy.ts      # EVM deployment script
│   ├── deploySAC.mjs  # Stellar Asset Contract deployment script
│   ├── transferOwnership.ts  # Transfer ERC20 ownership to proxy
│   └── setAdmin.mjs   # Set admin for Stellar Asset Contract
├── test/              # Test files
├── hardhat.config.ts  # Hardhat configuration
├── Makefile          # Deployment automation
├── .env.example      # Environment variables template
└── README.md         # This file
```

## Configuration

### EVM Networks

Edit `hardhat.config.ts` to add or modify networks:

```typescript
networks: {
  pruvTestnet: {
    url: "https://rpc.testnet.pruv.network",
    chainId: 7336,
    accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
  },
}
```

### Stellar Network

The Stellar deployment uses Testnet by default. To change networks, edit `scripts/deploySAC.js`:

```javascript
const networkRPC = "https://soroban-testnet.stellar.org";
const networkPassphrase = StellarSdk.Networks.TESTNET;
```

## Examples

### Deploy "Ekotek Token" to Pruv Testnet

```bash
make deploy-evm TOKEN_NAME="Ekotek Token" TOKEN_SYMBOL="EKO" NETWORK=pruvTestnet
```

### Deploy "EKOTEK" Asset on Stellar

```bash
make deploy-stellar ASSET_CODE="EKOTEK"
```

## Troubleshooting

### "Contract already exists" error on Stellar

This means the asset contract has already been deployed for this asset code and issuer. Each combination of asset code and issuer can only be deployed once.

### Insufficient funds

Make sure your wallets are funded:
- EVM: Get testnet tokens from the Pruv Testnet faucet
- Stellar: Get testnet XLM from https://laboratory.stellar.org/#account-creator

## Additional Hardhat Commands

```shell
npx hardhat help
npx hardhat test
REPORT_GAS=true npx hardhat test
npx hardhat node
npx hardhat ignition deploy ./ignition/modules/Lock.ts
```

## License

MIT
