import * as StellarSdk from "@stellar/stellar-sdk";
import dotenv from "dotenv";

dotenv.config();

(async () => {
  const {
    Keypair,
    Contract,
    rpc: StellarRpc,
    TransactionBuilder,
    Networks,
    BASE_FEE,
    Address,
  } = StellarSdk;

  // The source account will be used to sign and send the transaction.
  const sourceKeypair = Keypair.fromSecret(
    process.env.STELLAR_SECRET_KEY || "",
  );

  // Configure the SDK to use the `stellar-rpc` instance of your choosing.
  const server = new StellarRpc.Server(
    "https://soroban-testnet.stellar.org:443",
  );

  // Get contract ID and new admin address from environment or CLI args
  const args = process.argv.slice(2);
  const contractAddress =
    (process.env.ASSET_ID || args[0] || "").trim();

  if (!contractAddress) {
    throw new Error("ASSET_ID (contract id) is required");
  }

  const newAdminAddress = (process.env.NEW_ADMIN_ADDRESS || "").trim();
  if (!newAdminAddress) {
    throw new Error("NEW_ADMIN_ADDRESS is required");
  }

  console.log(`Using contract ID: ${contractAddress}`);
  console.log(`Setting admin to: ${newAdminAddress}`);

  // Create contract instance
  const contract = new Contract(contractAddress);

  // Convert the new admin address to Address object
  const newAdminAddressObj = Address.fromString(newAdminAddress);

  // Transactions require a valid sequence number (which varies from one
  // account to another). We fetch this sequence number from the RPC server.
  const sourceAccount = await server.getAccount(sourceKeypair.publicKey());

  // The transaction begins as pretty standard. The source account, minimum
  // fee, and network passphrase are provided.
  let builtTransaction = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    // The invocation of the `set_admin` function of our contract
    .addOperation(contract.call("set_admin", newAdminAddressObj.toScVal()))
    // This transaction will be valid for the next 30 seconds
    .setTimeout(30)
    .build();

  // We use the RPC server to "prepare" the transaction. This simulating the
  // transaction, discovering the storage footprint, and updating the
  // transaction to include that footprint. If you know the footprint ahead of
  // time, you could manually use `addFootprint` and skip this step.
  let preparedTransaction = await server.prepareTransaction(builtTransaction);

  // Sign the transaction with the source account's keypair.
  preparedTransaction.sign(sourceKeypair);

  // Let's see the base64-encoded XDR of the transaction we just built.
  console.log(
    `Signed prepared transaction XDR: ${preparedTransaction
      .toEnvelope()
      .toXDR("base64")}`,
  );

  // Submit the transaction to the Stellar-RPC server. The RPC server will
  // then submit the transaction into the network for us. Then we will have to
  // wait, polling `getTransaction` until the transaction completes.
  try {
    let sendResponse = await server.sendTransaction(preparedTransaction);
    console.log(`Sent transaction: ${JSON.stringify(sendResponse)}`);

    if (sendResponse.status === "PENDING") {
      let getResponse = await server.getTransaction(sendResponse.hash);
      // Poll `getTransaction` until the status is not "NOT_FOUND"
      while (getResponse.status === "NOT_FOUND") {
        console.log("Waiting for transaction confirmation...");
        // See if the transaction is complete
        getResponse = await server.getTransaction(sendResponse.hash);
        // Wait one second
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      if (getResponse.status === "SUCCESS") {
        console.log("Transaction successful");
        console.log(`Transaction hash: ${sendResponse.hash}`);
      } else {
        throw `Transaction failed: ${getResponse.resultXdr}`;
      }
    } else {
      throw sendResponse.errorResultXdr;
    }
  } catch (err) {
    // Catch and report any errors we've thrown
    console.log("Sending transaction failed");
    console.log(JSON.stringify(err));
  }
})();