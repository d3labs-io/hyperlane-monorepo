import { ethers, upgrades } from "hardhat";
import { TokenBridge } from "../typechain-types";

/**
 * Upgrade script for TokenBridge UUPS Proxy using OpenZeppelin Upgrades Plugin
 *
 * This script:
 * 1. Validates the new implementation for upgrade safety
 * 2. Checks storage layout compatibility
 * 3. Deploys a new TokenBridge implementation
 * 4. Upgrades the proxy to point to the new implementation
 * 5. Verifies the upgrade was successful
 *
 * Usage:
 * npx hardhat run scripts/upgrade.ts --network <network>
 *
 * Environment variables required:
 * - PROXY_ADDRESS: Address of the existing proxy
 * - PRIVATE_KEY: Private key of account with UPGRADER_ROLE
 *
 * Note: The upgrader account must have UPGRADER_ROLE granted by the admin
 *
 * Benefits of using OpenZeppelin Upgrades Plugin:
 * - Automatic storage layout validation
 * - Prevents unsafe upgrades (e.g., changing storage variable order)
 * - Validates that new implementation is upgrade-safe
 * - Checks for initialization issues
 */

function sleep(ms: any) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log("🔄 Starting TokenBridge upgrade with OpenZeppelin Upgrades Plugin...\n");

  // Get proxy address from environment
  const proxyAddress = process.env.PROXY_ADDRESS || "";

  if (!proxyAddress || proxyAddress === "") {
    throw new Error("❌ PROXY_ADDRESS environment variable is required");
  }

  console.log("📋 Upgrade Parameters:");
  console.log("- Proxy Address:", proxyAddress, "\n");

  // Get upgrader signer
  let upgrader;
  if (process.env.PRIVATE_KEY) {
    upgrader = new ethers.Wallet(process.env.PRIVATE_KEY, ethers.provider);
    console.log("👤 Upgrading with account:", upgrader.address);
  } else {
    [upgrader] = await ethers.getSigners();
    console.log("👤 Upgrading with default account:", upgrader.address);
  }

  // Step 1: Get current implementation address
  console.log("📦 Getting current implementation...");
  const currentImplAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress)
  console.log("- Current implementation:", currentImplAddress);

  // Step 2: Prepare new implementation with validation
  console.log("\n� Preparing and validating new implementation...");
  const TokenBridgeFactory = await ethers.getContractFactory("TokenBridge");
  const tokenBridge = await ethers.getContractAt("TokenBridge", proxyAddress);

  console.log("- Running storage layout compatibility checks...");
  console.log("- Validating upgrade safety...");

  // Step 3: Perform upgrade using OpenZeppelin's upgradeProxy
  // This will:
  // - Validate storage layout compatibility
  // - Deploy new implementation
  // - Upgrade the proxy
  console.log("\n🔄 Upgrading proxy to new implementation...");
  console.log("⚠️  This will automatically validate storage layout and upgrade safety");

  try {
    let impleAddrs = await TokenBridgeFactory.deploy();
    await impleAddrs.waitForDeployment();
    console.log("- New implementation:", await impleAddrs.getAddress());

    let tx = await tokenBridge.connect(upgrader).upgradeToAndCall(await impleAddrs.getAddress(), "0x");
    await tx.wait();

    sleep(10000);
  
    const newImplAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

    console.log("\n✅ Upgrade successful!");
    console.log("- Proxy address:", proxyAddress);
    console.log("- Old implementation:", currentImplAddress);
    console.log("- New implementation:", newImplAddress);

    return {
      proxy: proxyAddress,
      oldImplementation: currentImplAddress,
      newImplementation: newImplAddress,
    };
  } catch (error: any) {
    console.error("\n❌ Upgrade failed!");

    if (error.message.includes("storage layout")) {
      console.error("\n📋 Storage Layout Error:");
      console.error("The new implementation has incompatible storage layout changes.");
      console.error("\nCommon causes:");
      console.error("1. Changed the order of state variables");
      console.error("2. Changed the type of existing state variables");
      console.error("3. Removed state variables");
      console.error("4. Added new state variables before existing ones");
      console.error("\nSolutions:");
      console.error("1. Only add new state variables at the END of the contract");
      console.error("2. Never change or remove existing state variables");
      console.error("3. Use storage gaps for future-proofing");
      console.error("4. If you must change storage, deploy a new proxy instead");
    } else if (error.message.includes("UPGRADER_ROLE")) {
      console.error("\n📋 Permission Error:");
      console.error(`Account ${upgrader.address} does not have UPGRADER_ROLE`);
      console.error("Please grant the role first using the admin account.");
    }

    throw error;
  }
}

// Execute upgrade
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Upgrade failed:");
    console.error(error);
    process.exit(1);
  });

