import { expect } from "chai";
import { ethers } from "hardhat";
import { TokenBridge, MockERC20 } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("TransactionIdTracker", function () {
  let bridge: TokenBridge;
  let admin: SignerWithAddress;
  let systemWallet: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let token: MockERC20;

  beforeEach(async function () {
    let owner: SignerWithAddress;
    [owner, admin, systemWallet, user1, user2] = await ethers.getSigners();

    // Deploy mock token
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    token = await MockERC20Factory.deploy("Test Token", "TEST", 18);

    // Deploy bridge implementation
    const TokenBridgeFactory = await ethers.getContractFactory("TokenBridge");
    const bridgeImpl = await TokenBridgeFactory.deploy();

    // Deploy proxy
    const BridgeProxyFactory = await ethers.getContractFactory("BridgeProxy");
    const initData = bridgeImpl.interface.encodeFunctionData("initialize", [
      owner.address,
      systemWallet.address,
      token.target,
      ethers.parseEther("0.1"),
      "eip155:31337",
    ]);
    const proxy = await BridgeProxyFactory.deploy(bridgeImpl.target, initData);

    bridge = TokenBridgeFactory.attach(proxy.target) as TokenBridge;

    // Grant admin role
    await bridge.connect(owner).grantAdmin(admin.address);

  });

  describe("Transaction ID Storage", function () {
    it("Should correctly store and retrieve transaction IDs", async function () {
      const txId1 = "tx_001";
      const txId2 = "tx_002";
      const txId3 = "ethereum_0x123abc";

      expect(await bridge.isTransactionIdUsed(txId1)).to.be.false;
      expect(await bridge.isTransactionIdUsed(txId2)).to.be.false;
      expect(await bridge.isTransactionIdUsed(txId3)).to.be.false;

      await bridge.connect(user1).revokeTransactionId(txId1);
      await bridge.connect(user1).revokeTransactionId(txId2);
      await bridge.connect(user1).revokeTransactionId(txId3);

      expect(await bridge.isTransactionIdUsed(txId1)).to.be.true;
      expect(await bridge.isTransactionIdUsed(txId2)).to.be.true;
      expect(await bridge.isTransactionIdUsed(txId3)).to.be.true;
    });

    it("Should handle different transaction ID formats", async function () {
      const numericId = "12345";
      const hexId = "0xabcdef123456";
      const uuidId = "550e8400-e29b-41d4-a716-446655440000";
      const customId = "chain_ethereum_tx_001";

      await bridge.connect(user1).revokeTransactionId(numericId);
      await bridge.connect(user1).revokeTransactionId(hexId);
      await bridge.connect(user1).revokeTransactionId(uuidId);
      await bridge.connect(user1).revokeTransactionId(customId);

      expect(await bridge.isTransactionIdUsed(numericId)).to.be.true;
      expect(await bridge.isTransactionIdUsed(hexId)).to.be.true;
      expect(await bridge.isTransactionIdUsed(uuidId)).to.be.true;
      expect(await bridge.isTransactionIdUsed(customId)).to.be.true;
    });
  });

  describe("Transaction ID Usage and Prevention of Reuse", function () {
    it("Should mark transaction ID as used after first use", async function () {
      const txId = "tx_test_001";
      expect(await bridge.isTransactionIdUsed(txId)).to.be.false;

      await bridge.connect(user1).revokeTransactionId(txId);

      expect(await bridge.isTransactionIdUsed(txId)).to.be.true;
    });

    it("Should revert when trying to reuse a transaction ID", async function () {
      const txId = "tx_test_002";
      await bridge.connect(user1).revokeTransactionId(txId);

      await expect(bridge.connect(user1).revokeTransactionId(txId))
        .to.be.revertedWithCustomError(bridge, "TransactionIdAlreadyUsed");
    });

    it("Should prevent different users from using the same transaction ID", async function () {
      const txId = "tx_shared_001";

      await bridge.connect(user1).revokeTransactionId(txId);

      // Transaction ID is now global, so user2 cannot use it
      await expect(bridge.connect(user2).revokeTransactionId(txId))
        .to.be.revertedWithCustomError(bridge, "TransactionIdAlreadyUsed");

      expect(await bridge.isTransactionIdUsed(txId)).to.be.true;
    });
  });

  describe("Transaction ID Revocation", function () {
    it("Should emit TransactionIdRevoked event when revoking a transaction ID", async function () {
      const txId = "tx_revoke_001";
      const tx = await bridge.connect(user1).revokeTransactionId(txId);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);

      await expect(tx)
        .to.emit(bridge, "TransactionIdRevoked")
        .withArgs(user1.address, txId, block!.timestamp);
    });

    it("Should allow users to revoke unused transaction IDs", async function () {
      const txId = "tx_revoke_002";
      expect(await bridge.isTransactionIdUsed(txId)).to.be.false;

      await bridge.connect(user1).revokeTransactionId(txId);

      expect(await bridge.isTransactionIdUsed(txId)).to.be.true;
    });
  });

  describe("Transaction ID Global Scope", function () {
    it("Should use global transaction ID scope (not per-user)", async function () {
      const txId = "tx_global_001";

      await bridge.connect(user1).revokeTransactionId(txId);

      expect(await bridge.isTransactionIdUsed(txId)).to.be.true;

      // User2 cannot use the same transaction ID
      await expect(bridge.connect(user2).revokeTransactionId(txId))
        .to.be.revertedWithCustomError(bridge, "TransactionIdAlreadyUsed");
    });

    it("Should enforce global uniqueness across all users", async function () {
      const txIds = ["tx_001", "tx_002", "tx_003"];

      for (const txId of txIds) {
        await bridge.connect(user1).revokeTransactionId(txId);
      }

      for (const txId of txIds) {
        expect(await bridge.isTransactionIdUsed(txId)).to.be.true;
      }

      // User2 cannot use any of these IDs
      for (const txId of txIds) {
        await expect(bridge.connect(user2).revokeTransactionId(txId))
          .to.be.revertedWithCustomError(bridge, "TransactionIdAlreadyUsed");
      }
    });
  });

  describe("Case Sensitivity", function () {
    it("Should treat transaction IDs as case-sensitive", async function () {
      const txLower = "tx_abc";
      const txUpper = "TX_ABC";
      const txMixed = "Tx_AbC";

      await bridge.connect(user1).revokeTransactionId(txLower);
      await bridge.connect(user1).revokeTransactionId(txUpper);
      await bridge.connect(user1).revokeTransactionId(txMixed);

      expect(await bridge.isTransactionIdUsed(txLower)).to.be.true;
      expect(await bridge.isTransactionIdUsed(txUpper)).to.be.true;
      expect(await bridge.isTransactionIdUsed(txMixed)).to.be.true;
    });
  });

  describe("Long Transaction IDs", function () {
    it("Should handle long transaction IDs (e.g., full Ethereum tx hashes)", async function () {
      const ethTxHash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

      await bridge.connect(user1).revokeTransactionId(ethTxHash);

      expect(await bridge.isTransactionIdUsed(ethTxHash)).to.be.true;
    });

    it("Should handle very long custom transaction IDs", async function () {
      const longTxId = "chain_ethereum_mainnet_block_12345678_tx_0x123abc_timestamp_1234567890_user_0xabc";

      await bridge.connect(user1).revokeTransactionId(longTxId);

      expect(await bridge.isTransactionIdUsed(longTxId)).to.be.true;
    });
  });

  describe("Special Characters in Transaction IDs", function () {
    it("Should handle transaction IDs with hyphens and underscores", async function () {
      const txHyphen = "tx-001-abc";
      const txUnderscore = "tx_001_abc";
      const txMixed = "tx-001_abc-def";

      await bridge.connect(user1).revokeTransactionId(txHyphen);
      await bridge.connect(user1).revokeTransactionId(txUnderscore);
      await bridge.connect(user1).revokeTransactionId(txMixed);

      expect(await bridge.isTransactionIdUsed(txHyphen)).to.be.true;
      expect(await bridge.isTransactionIdUsed(txUnderscore)).to.be.true;
      expect(await bridge.isTransactionIdUsed(txMixed)).to.be.true;
    });
  });

  describe("Gas Efficiency", function () {
    it("Should use reasonable gas for transaction ID operations", async function () {
      const txId = "tx_gas_test_001";
      const tx = await bridge.connect(user1).revokeTransactionId(txId);
      const receipt = await tx.wait();

      // String-based operations should still be reasonably gas efficient
      expect(receipt!.gasUsed).to.be.lessThan(150000);
    });
  });

  describe("View Function", function () {
    it("Should correctly return transaction ID usage status", async function () {
      const txId = "tx_view_test_001";

      expect(await bridge.isTransactionIdUsed(txId)).to.be.false;

      await bridge.connect(user1).revokeTransactionId(txId);

      expect(await bridge.isTransactionIdUsed(txId)).to.be.true;
    });
  });
});

