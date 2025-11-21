import { ethers } from "hardhat";
import { MockERC20, TokenBridge } from "../typechain-types";

async function main() {
  // Get the deployer's address
  const [user] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", user.address);
  console.log(
    "Account balance:",
    (await ethers.provider.getBalance(user.address)).toString()
  );

  const proxyAddress = process.env.PROXY_ADDRESS || "";
  console.log("Proxy address:", proxyAddress);
  const tokenAddress = "0xeCacC484026a02022565496E088CA0581cC36373";

  const tokenBridge = await ethers.getContractAt(
    "TokenBridge",
    proxyAddress
  );

  const token = await ethers.getContractAt(
    "MockERC20",
    tokenAddress
  ) as MockERC20;

  let balance = await token.balanceOf(user.address);

  let tx = await token.connect(user).approve(tokenBridge.target, balance);
  await tx.wait();
  console.log("Approved...");

  tx = await tokenBridge.connect(user).executeBridgeOperation(
    1,
    {
      fromToken: "0xeCacC484026a02022565496E088CA0581cC36373",
      toToken: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
      amount: ethers.parseUnits("2", 6),
      fromAddress: "0xCcA55A052F2140541b6650093890A0a21405dCc7",
      toAddress: "GCME6YKLF3YSCDRYSCVJRYAFFO3VA62IHZYZRH4B22I3S4LHFXQPJUM7",
      fromNetwork: "pruv:testnet",
      toNetwork: "stellar:testnet",
      transactionId: Math.floor(Date.now() / 1000).toString(), // Should be unique in each transaction
      email: "anh.le3@ekotek.vn",
      refund: {

        feeToken: ethers.ZeroAddress,
        feeAmount: 0

      }
    }
  );
  await tx.wait();

  console.log("Succesfully burned...");
  console.log("tx:", tx.hash);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
