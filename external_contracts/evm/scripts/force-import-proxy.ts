import { ethers, upgrades } from "hardhat";

/**
 * Force import an existing proxy into OpenZeppelin's upgrade tracking system
 * 
 * This is needed when:
 * - You have a proxy deployed without using the OpenZeppelin plugin
 * - You want to start using the plugin for future upgrades
 * - You need to validate storage layout compatibility
 * 
 * Usage:
 * npx hardhat run scripts/force-import-proxy.ts --network <network>
 * 
 * Environment variables required:
 * - PROXY_ADDRESS: Address of the existing proxy
 */

async function main() {
  console.log("📦 Force importing existing proxy into OpenZeppelin tracking...\n");

  const proxyAddress = process.env.PROXY_ADDRESS || "";

  if (!proxyAddress || proxyAddress === "") {
    throw new Error("❌ PROXY_ADDRESS environment variable is required");
  }

  console.log("📋 Import Parameters:");
  console.log("- Proxy Address:", proxyAddress, "\n");

  try {
    console.log("🔍 Step 1: Getting contract factory...");
    const TokenBridgeFactory = await ethers.getContractFactory("TokenBridge");

    console.log("🔍 Step 2: Getting current implementation address...");
    const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
    const currentImplAddressRaw = await ethers.provider.getStorage(proxyAddress, IMPLEMENTATION_SLOT);
    const currentImplAddress = ethers.getAddress("0x" + currentImplAddressRaw.slice(-40));
    console.log("- Current implementation:", currentImplAddress);

    console.log("\n🔍 Step 3: Force importing proxy...");
    console.log("   This will:");
    console.log("   - Register the proxy in OpenZeppelin's tracking system");
    console.log("   - Store deployment info in .openzeppelin folder");
    console.log("   - Enable future upgrades with validation");
    console.log();

    await upgrades.forceImport(proxyAddress, TokenBridgeFactory, {
      kind: "uups",
    });

    console.log("✅ Proxy successfully imported!");
    console.log("\n📋 Next Steps:");
    console.log("1. Validate upgrade compatibility:");
    console.log("   npx hardhat run scripts/validate-upgrade.ts --network <network>");
    console.log("\n2. Perform the upgrade:");
    console.log("   npx hardhat run scripts/upgrade.ts --network <network>");

  } catch (error: any) {
    console.error("\n❌ Import failed!");
    console.error("\n📋 Error Details:");
    console.error(error.message);

    if (error.message.includes("not a valid proxy")) {
      console.error("\n💡 The address is not a valid UUPS proxy");
      console.error("Make sure the address is correct and points to a UUPS proxy contract.");
    }

    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

