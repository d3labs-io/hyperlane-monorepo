import { ethers } from "hardhat";
import { MockERC20, TokenBridge } from "../typechain-types";

async function main() {
  // Get the deployer's address
  const [deployer, user] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", user.address);
  console.log(
    "Account balance:",
    (await ethers.provider.getBalance(user.address)).toString()
  );

  const proxyAddress = process.env.PROXY_ADDRESS || "";
  console.log("Proxy address:", proxyAddress);
  const tokenAddress = process.env.LOCK_TOKEN_ADDRESS || "";
  console.log("Token address:", tokenAddress);
  const usdcAddress = process.env.USDC_TOKEN_ADDRESS || "";
  console.log("USDC address:", usdcAddress);

  const tokenBridge = await ethers.getContractAt(
    "TokenBridge",
    proxyAddress
  );

  const token = await ethers.getContractAt(
    "MockERC20",
    tokenAddress
  );

  const usdc = await ethers.getContractAt(
    "MockERC20",
    usdcAddress
  );

  let balance = await token.balanceOf(user.address);
  console.log("Token Balance:", balance.toString());

  let usdcBalance = await usdc.balanceOf(user.address);
  console.log("USDC Balance:", usdcBalance);

  let tx = await token.connect(user).approve(tokenBridge.target, balance);
  await tx.wait();
  console.log("Approved...");

  tx = await usdc.connect(user).approve(tokenBridge.target, usdcBalance);
  await tx.wait();
  console.log("Approved USDC...");

  tx = await tokenBridge.connect(user).executeBridgeOperation(
    0,
    {
      fromToken: "",
      toToken: "CDBDKL3ZJB4ZJUFVFCPMJ3QDXIVMB2CYETEU2LEWTGDMIR4B4CQVO5GN",
      amount: ethers.parseEther("0.001"),
      fromAddress: "GCME6YKLF3YSCDRYSCVJRYAFFO3VA62IHZYZRH4B22I3S4LHFXQPJUM7",
      toAddress: "0x8aA13A3CD59bc677829946EcC41d02510f600af0",
      fromNetwork: "stellar:testnet",
      toNetwork: "pruv:testnet",
      transactionId: Math.floor(Date.now() / 1000).toString(), // Should be unique in each transaction
      email: "anh.le3@ekotek.vn",
      refund: {

        feeToken: ethers.ZeroAddress,
        feeAmount: 0

      }
    }
  );
  await tx.wait();

  console.log("Succesfully locked...");
  console.log("tx:", tx.hash);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
