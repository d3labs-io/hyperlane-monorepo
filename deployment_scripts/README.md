# Bridge New RWA From Pruv to Other Chain(s)

## 1. Prerequisites

Ensure you have the following installed and set up before proceeding.

### Clone and Setup Project

```shell
git clone https://github.com/d3labs-io/pruv-bridge-sc.git
cd pruv-bridge-sc
```

### a. Install Yarn

```shell
brew install yarn
```

### b. Install yq

The script uses `yq` for YAML processing.

```shell
brew install yq
```

### c. Build Project

```shell
yarn install && yarn build
```

## 2. Run Deploy Script

Run the deployment script from the project's root directory.

**Syntax:**

```shell
DEPLOYER_KEY=<PRIVATE_KEY> ./deployment_scripts/deploy_rwa_token.sh <environment> --chains <chain_list> --rwa <rwa_address>
```

**Parameters:**

- `environment`: The target environment. Either `testnet` or `mainnet`.
- `--chains`: A comma-separated list of target chains to bridge the RWA to.
- `--rwa`: The RWA token address on the Pruv network (mainnet or testnet).
- `DEPLOYER_KEY`: Your wallet private key.
  > **Warning:** Ensure the account associated with `DEPLOYER_KEY` has sufficient native tokens on all target chains to cover gas fees.

### Deployment Fee Calculation

To estimate the gas fee for each chain, you can create a temporary empty wallet and run the deployment script.

1. Run the script with the empty wallet.
2. The script will detect that you have no balance and display the recommended amount:
   > "At least 0.0xxx ETH recommended but found 0 ETH"

**Example Output:**

```text
? Is this deployment plan correct? yes
Running pre-flight checks for chains...
✅ Pruv signer is valid
✅ Ethereum signer is valid
✅ Binance Smart Chain signer is valid
✅ Chains are valid
WARNING: 0xE030... has low balance on ethereum. At least 0.00085762593 ETH recommended but found 0 ETH
WARNING: 0xE030... has low balance on bsc. At least 0.0015 BNB recommended but found 0 BNB
Deployment may fail due to insufficient balance(s)
? Continue? (Y/n)
```

**Note:** Use the recommended fee as guidance, then abort the script (Ctrl+C), and rerun using a funded wallet.

### Examples

**Deploying to Testnet**

```shell
DEPLOYER_KEY=0xYOUR_KEY ./deployment_scripts/deploy_rwa_token.sh testnet \
  --chains bsctestnet,sepolia,arbitrumsepolia,mantapacifictestnet \
  --rwa 0xTestnetRwaAddress
```

**Deploying to Mainnet**

```shell
DEPLOYER_KEY=0xYOUR_KEY ./deployment_scripts/deploy_rwa_token.sh mainnet \
  --chains bsc,ethereum,polygon,mantapacific \
  --rwa 0xMainnetRwaAddress
```

**You will be prompted to confirm the deployment (press `y` then `Enter`)**

### Output

After a successful run, the script will provide:

- **New Pruv Router Address**: The address of the deployed router on the Pruv network.
- **Finalized Deployment Config**: The path to the generated YAML config file (e.g., `/Users/userA/pruv-bridge-sc/typescript/cli/.hyperlane/latest_deployments/warp-route-deployment-config.yaml`).

Save these details for the subsequent steps.

## 3. Add New Pruv Router to Whitelist

Using the **BRIDGE ADMIN** wallet, call `addToWhitelist(New Pruv Router Address)` on the appropriate contract.

You can use `cast` (part of Foundry) to execute this transaction easily:

**Testnet**

```shell
cast send 0xa679Eb6A2EA00DAE0FA0dDfB240FEd14984e8390 \
  "addToWhitelist(address)" <NEW_PRUV_ROUTER_ADDRESS> \
  --rpc-url https://rpc.testnet.pruv.network \
  --private-key <BRIDGE_ADMIN_PRIVATE_KEY> \
  --legacy
```

or through the Pruv Explorer:

- Explorer: https://explorer.testnet.pruv.network/address/0xa679Eb6A2EA00DAE0FA0dDfB240FEd14984e8390?tab=read_write_contract#0xe43252d7, then input the <NEW_PRUV_ROUTER_ADDRESS> and sign

**Mainnet**

```shell
cast send 0x4358C6355B14cD5e59898FA76C61Dc56A9680633 \
  "addToWhitelist(address)" <NEW_PRUV_ROUTER_ADDRESS> \
  --rpc-url https://rpc.pruv.network/ \
  --private-key <BRIDGE_ADMIN_PRIVATE_KEY> \
  --legacy
```

or through the Pruv Explorer:

- Explorer: https://explorer.pruv.network/address/0x4358C6355B14cD5e59898FA76C61Dc56A9680633?tab=read_write_contract#0xe43252d7, then input the <NEW_PRUV_ROUTER_ADDRESS> and sign

## 4. Add New Token to Front End

1. **Clone the frontend repository** and install dependencies:
   ```shell
   git clone https://github.com/d3labs-io/hyperlane-warp-ui-template.git
   cd hyperlane-warp-ui-template
   yarn install
   ```
2. **Create a new branch** in the frontend repository.
3. **Append tokens** from the **Finalized Deployment Config** (e.g., `/typescript/cli/.hyperlane/latest_deployments/warp-route-deployment-config.yaml`) to `warpRoutes.yaml` in the UI template:
   - **Testnet:** [src/consts/warpRoutes.yaml](https://github.com/d3labs-io/hyperlane-warp-ui-template/blob/staging/src/consts/warpRoutes.yaml)
   - **Mainnet:** [src/consts/warpRoutes.yaml](https://github.com/d3labs-io/hyperlane-warp-ui-template/blob/main/src/consts/warpRoutes.yaml)
4. **Test locally**:
   ```shell
   npm run dev
   ```
   Open the UI in your browser and verify that the token exists.
5. **Create a Pull Request** and merge.