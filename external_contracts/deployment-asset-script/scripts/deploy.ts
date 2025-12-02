import { ethers } from "hardhat";

async function main() {
  // Get token name and symbol from command line arguments or use defaults
  const args = process.argv.slice(2);
  const tokenName = process.env.TOKEN_NAME || args[0] || "MyToken";
  const tokenSymbol = process.env.TOKEN_SYMBOL || args[1] || "MTK";

  // Get the deployer's address
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());
  console.log("Token Name:", tokenName);
  console.log("Token Symbol:", tokenSymbol);

  // Deploy MyToken contract
  const MyToken = await ethers.getContractFactory("MyToken");

  // The deployer will be the initial owner
  const myToken = await MyToken.deploy(deployer.address, tokenName, tokenSymbol);

  await myToken.waitForDeployment();

  const tokenAddress = await myToken.getAddress();


  console.log("\n=== Deployment Successful ===");
  console.log("MyToken deployed to:", tokenAddress);
  console.log("Token Name:", tokenName);
  console.log("Token Symbol:", tokenSymbol);
  console.log("Initial Owner:", deployer.address);
  console.log("\nTo verify the contract, run:");
  console.log(`npx hardhat verify --network pruvTestnet ${tokenAddress} ${deployer.address} "${tokenName}" "${tokenSymbol}"`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

