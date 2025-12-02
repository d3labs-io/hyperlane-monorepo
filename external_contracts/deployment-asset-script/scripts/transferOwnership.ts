import { ethers } from "hardhat";

async function main() {
  const args = process.argv.slice(2);
  
  // Get token address from env or first CLI arg
  const tokenAddress = (process.env.TOKEN_ADDRESS || args[0] || "").trim();
  
  // Get proxy address from env or second CLI arg
  const proxyAddress = (process.env.PROXY_ADDRESS || args[1] || "").trim();

  if (!tokenAddress) {
    throw new Error("Token address is required as TOKEN_ADDRESS env or first CLI arg");
  }

  if (!proxyAddress) {
    throw new Error("Proxy address is required as PROXY_ADDRESS env or second CLI arg");
  }

  const [deployer] = await ethers.getSigners();

  console.log("Running ownership transfer with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());
  
  // Normalize addresses to prevent ENS resolution issues
  const normalizedTokenAddress = ethers.getAddress(tokenAddress);
  const normalizedProxyAddress = ethers.getAddress(proxyAddress);
  
  console.log("Using token:", normalizedTokenAddress);
  console.log("Proxy recipient:", normalizedProxyAddress);

  const myToken = await ethers.getContractAt("MyToken", normalizedTokenAddress);

  const tx = await myToken.transferOwnership(normalizedProxyAddress);
  console.log("Submitted transferOwnership tx:", tx.hash);
  const receipt = await tx.wait();

  if (!receipt) {
    throw new Error("Ownership transfer transaction was not mined");
  }

  console.log("Ownership transferred in block:", receipt.blockNumber);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });