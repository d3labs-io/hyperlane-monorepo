import * as StellarSdk from "@stellar/stellar-sdk";
import { Server } from "@stellar/stellar-sdk/rpc";
import dotenv from "dotenv";

dotenv.config();

const networkRPC = "https://soroban-testnet.stellar.org";
const server = new Server(networkRPC);
const networkPassphrase = StellarSdk.Networks.TESTNET;

const submitTx = async (transaction) => {
  try {
    console.log("Submitting transaction...");
    let response = await server.sendTransaction(transaction);
    const hash = response.hash;
    console.log(`Transaction hash: ${hash}`);
    console.log("Awaiting confirmation...");

    // Poll for transaction confirmation
    while (true) {
      response = await server.getTransaction(hash);
      if (response.status !== "NOT_FOUND") {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (response.status === "SUCCESS") {
      console.log("Transaction successful.");
      return response;
    } else {
      console.log("Transaction failed.");
      throw new Error("Transaction failed");
    }
  } catch (error) {
    console.error("Error submitting transaction:", error);
    throw error;
  }
};

const deployStellarAssetContract = async () => {
  // Get asset code from command line arguments or environment variable
  const args = process.argv.slice(2);
  let assetCode = (process.env.ASSET_CODE || args[0] || "MYASSET").trim();

  // Validate and normalize asset code
  // Stellar asset codes must be: uppercase alphanumeric, max 12 characters
  if (!assetCode || assetCode.length === 0) {
    throw new Error("Asset code cannot be empty");
  }

  if (assetCode.length > 12) {
    throw new Error(
      `Asset code "${assetCode}" is too long. Maximum 12 characters allowed.`
    );
  }

  // Check if it contains only alphanumeric characters
  if (!/^[A-Za-z0-9]+$/.test(assetCode)) {
    throw new Error(
      `Asset code "${assetCode}" contains invalid characters. Only alphanumeric characters (A-Z, 0-9) are allowed.`
    );
  }

  // Convert to uppercase (Stellar requires uppercase)
  const originalAssetCode = assetCode;
  assetCode = assetCode.toUpperCase();
  if (originalAssetCode !== assetCode) {
    console.log(
      `Note: Asset code converted to uppercase: "${originalAssetCode}" -> "${assetCode}"`
    );
  }

  const sourceSecrets = process.env.STELLAR_SECRET_KEY;
  if (!sourceSecrets) {
    throw new Error("STELLAR_SECRET_KEY environment variable is not set");
  }

  const sourceKeypair = StellarSdk.Keypair.fromSecret(sourceSecrets);
  const sourceAccount = await server.getAccount(sourceKeypair.publicKey());

  try {
    console.log("Asset Code:", assetCode);
    const issuerPublicKey = sourceKeypair.publicKey();
    const customAsset = new StellarSdk.Asset(assetCode, issuerPublicKey);

    const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase,
    })
      .addOperation(
        StellarSdk.Operation.createStellarAssetContract({
          asset: customAsset,
        }),
      )
      .setTimeout(30)
      .build();

    const uploadTx = await server.prepareTransaction(transaction);
    uploadTx.sign(sourceKeypair);

    const feedback = await submitTx(uploadTx);
    const contract = StellarSdk.Address.fromScAddress(
      feedback.returnValue.address(),
    );
    console.log(
      `ContractID of Our ${customAsset.code} Asset is: `,
      contract.toString(),
    );
  } catch (e) {
    console.error("An error occurred while Deploying assets:", e);
  }
};

await deployStellarAssetContract();