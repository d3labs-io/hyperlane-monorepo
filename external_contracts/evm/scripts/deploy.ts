import { ethers } from "hardhat";
import { TokenBridge } from "../typechain-types";

/**
 * Main deployment script for TokenBridge with UUPS Proxy
 *
 * This script deploys:
 * 1. TokenBridge implementation contract
 * 2. BridgeProxy (ERC1967 proxy) pointing to the implementation
 * 3. Initializes the proxy with owner, system wallet, fee token, fee amount, and chain ID
 *
 * Usage:
 * npx hardhat run scripts/deploy.ts --network <network>
 *
 * Environment variables required:
 * - OWNER_ADDRESS: Address of the owner (has OWNER_ROLE, DEFAULT_ADMIN_ROLE, UPGRADER_ROLE)
 * - SYSTEM_WALLET_ADDRESS: Address of the system wallet (has SYSTEM_WALLET_ROLE)
 * - FEE_TOKEN_ADDRESS: Address of the fee token (can be zero address for no fees)
 * - FEE_AMOUNT: Fee amount in wei (default: 0.1 tokens = 100000000000000000)
 * - CURRENT_CHAIN_ID: Chain identifier in CAIP-2 format (e.g., "eip155:1" for Ethereum mainnet, "eip155:11155111" for Sepolia)
 */

async function main() {
  console.log("🚀 Starting TokenBridge deployment...\n");

  // Get deployment parameters from environment or use defaults
  const ownerAddress = process.env.OWNER_ADDRESS || "";
  const systemWalletAddress = process.env.SYSTEM_WALLET_ADDRESS || "";
  const feeTokenAddress = process.env.FEE_TOKEN_ADDRESS || ethers.ZeroAddress;
  const feeAmount = process.env.FEE_AMOUNT || ethers.parseEther("0.1").toString();
  const currentChainId = process.env.CURRENT_CHAIN_ID || "";

  // Validate required parameters
  if (!ownerAddress || ownerAddress === "") {
    throw new Error("❌ OWNER_ADDRESS environment variable is required");
  }
  if (!systemWalletAddress || systemWalletAddress === "") {
    throw new Error("❌ SYSTEM_WALLET_ADDRESS environment variable is required");
  }
  if (!currentChainId || currentChainId === "") {
    throw new Error("❌ CURRENT_CHAIN_ID environment variable is required (e.g., 'eip155:1' for Ethereum mainnet)");
  }

  // Validate chain ID format (CAIP-2: namespace:reference)
  if (!currentChainId.includes(":") || currentChainId.length < 3) {
    throw new Error("❌ CURRENT_CHAIN_ID must be in CAIP-2 format (e.g., 'eip155:1', 'eip155:11155111')");
  }

  console.log("📋 Deployment Parameters:");
  console.log("- Owner Address:", ownerAddress);
  console.log("- System Wallet Address:", systemWalletAddress);
  console.log("- Fee Token Address:", feeTokenAddress);
  console.log("- Fee Amount:", ethers.formatEther(feeAmount), "tokens");
  console.log("- Current Chain ID:", currentChainId, "\n");

  // Get deployer
  const signers = await ethers.getSigners();
  if (!signers || signers.length === 0) {
    throw new Error("❌ No signers available. Make sure you have configured your network and private key.");
  }
  const deployer = signers[0];
  console.log("👤 Deploying with account:", await deployer.getAddress());
  console.log("💰 Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  // Step 1: Deploy TokenBridge implementation
  console.log("📦 Deploying TokenBridge implementation...");
  const TokenBridge = await ethers.getContractFactory("TokenBridge");
  const tokenBridgeImpl = await TokenBridge.deploy();
  await tokenBridgeImpl.waitForDeployment();
  const implAddress = await tokenBridgeImpl.getAddress();
  console.log("✅ TokenBridge implementation deployed at:", implAddress);

  // Step 2: Encode initialization data
  console.log("\n🔧 Encoding initialization data...");
  const initData = TokenBridge.interface.encodeFunctionData("initialize", [
    ownerAddress,
    systemWalletAddress,
    feeTokenAddress,
    feeAmount,
    currentChainId,
  ]);

  // Step 3: Deploy proxy
  console.log("📦 Deploying BridgeProxy...");
  const BridgeProxy = await ethers.getContractFactory("BridgeProxy");
  const proxy = await BridgeProxy.deploy(implAddress, initData);
  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();
  console.log("✅ BridgeProxy deployed at:", proxyAddress);

  console.log("\n✅ Deployment completed successfully!");

  // Return addresses for programmatic use
  return {
    implementation: implAddress,
    proxy: proxyAddress,
  };
}

// Execute deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });

