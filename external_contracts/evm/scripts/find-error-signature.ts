import { ethers } from "hardhat";

/**
 * Try to find the error signature for 0xdd61275e
 */

async function main() {
  const targetSelector = "0xdd61275e";
  
  console.log("🔍 Searching for error signature:", targetSelector, "\n");

  // List of possible error signatures to check
  const possibleErrors = [
    // Common OpenZeppelin errors
    "ERC1967InvalidImplementation(address)",
    "UUPSUnauthorizedCallContext()",
    "UUPSUnsupportedProxiableUUID(bytes32)",
    "AccessControlUnauthorizedAccount(address,bytes32)",
    "InvalidInitialization()",
    "NotInitializing()",
    "EnforcedPause()",
    "ExpectedPause()",
    "ReentrancyGuardReentrantCall()",
    
    // Custom errors from TokenBridge
    "InvalidAddress()",
    "InvalidAmount()",
    "UnsupportedToken()",
    "UnsupportedChain()",
    "InvalidChainIdentifier()",
    "InvalidReleaseOnSameChain()",
    "InsufficientLockedBalance()",
    "InvalidSourceChain()",
    
    // Possible upgrade-related errors
    "UpgradeNotReady()",
    "UpgradeDelayNotMet()",
    "NoUpgradeProposed()",
    "InvalidUpgrade()",
    "UpgradeAlreadyProposed()",
    
    // Try variations
    "InvalidImplementation()",
    "InvalidImplementation(address)",
    "UnauthorizedUpgrade()",
    "UnauthorizedUpgrade(address)",
    "UpgradeNotAuthorized()",
    "UpgradeNotAuthorized(address)",
  ];

  console.log("Checking", possibleErrors.length, "possible error signatures...\n");

  for (const errorSig of possibleErrors) {
    const selector = ethers.id(errorSig).substring(0, 10);
    if (selector === targetSelector) {
      console.log("✅ FOUND MATCH!");
      console.log("Error signature:", errorSig);
      console.log("Selector:", selector);
      return;
    }
  }

  console.log("❌ No match found in common errors");
  console.log("\nTrying to brute force common patterns...\n");

  // Try common patterns
  const patterns = [
    "Upgrade",
    "Implementation",
    "Delay",
    "Timelock",
    "Proposed",
    "Ready",
    "Authorized",
    "Invalid",
  ];

  for (const pattern1 of patterns) {
    for (const pattern2 of patterns) {
      const errorSig = `${pattern1}${pattern2}()`;
      const selector = ethers.id(errorSig).substring(0, 10);
      if (selector === targetSelector) {
        console.log("✅ FOUND MATCH!");
        console.log("Error signature:", errorSig);
        console.log("Selector:", selector);
        return;
      }
    }
  }

  console.log("❌ Still no match found");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

