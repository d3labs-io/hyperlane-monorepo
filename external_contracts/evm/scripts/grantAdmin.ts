import { ethers } from "hardhat";
import { TokenBridge } from "../typechain-types";

async function main() {
  // Get the deployer's address
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log(
    "Account balance:",
    (await ethers.provider.getBalance(deployer.address)).toString()
  );

  const proxyAddress = process.env.PROXY_ADDRESS || "";
  console.log("Proxy address:", proxyAddress);

  const tokenBridge = await ethers.getContractAt(
    "TokenBridge",
    proxyAddress
  );

  const tx = await tokenBridge.connect(deployer).grantAdmin("0xab0b5c4589f5c5ed669131c86cb4bb0d5801f64c");

  console.log("Succesfully unlocked...");
  console.log("tx:", tx.hash);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
