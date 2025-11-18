import { ethers } from "hardhat";

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

  const tx = await tokenBridge.connect(deployer).executeBridgeOperation(
    3,
    {
      fromToken: "",
      toToken: "0x3fF42C68835Bc72cA15BE9ddc6758357FEC0B30e",
      amount: ethers.parseUnits("1", 6),
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

  console.log("Succesfully minted...");
  console.log("tx:", tx.hash);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
