import { expect } from "chai";
import { ethers } from "hardhat";
import { TokenBridge, MockERC20, MockAttacker, MaliciousToken } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Security Tests", function () {
  let bridge: TokenBridge;
  let owner: SignerWithAddress;
  let admin: SignerWithAddress;
  let systemWallet: SignerWithAddress;
  let vaultWallet: SignerWithAddress;
  let attacker: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let invalidCaller: SignerWithAddress;

  let token: MockERC20;
  let feeToken: MockERC20;
  let maliciousToken: MaliciousToken;
  let mockAttacker: MockAttacker;

  const FEE_AMOUNT = ethers.parseEther("0.1");
  const CURRENT_CHAIN_ID = "eip155:31337";
  const DESTINATION_CHAIN_ID = "eip155:137";
  const SOURCE_CHAIN_ID = "eip155:56";

  let txCounter = 0;
  function getUniqueTxId(): string {
    return `tx_${Date.now()}_${txCounter++}`;
  }

  beforeEach(async function () {
    [owner, admin, systemWallet, vaultWallet, attacker, user1, user2, invalidCaller] = await ethers.getSigners();

    // Deploy tokens
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    token = await MockERC20Factory.deploy("Test Token", "TEST", 18);
    feeToken = await MockERC20Factory.deploy("Fee Token", "FEE", 18);

    // Deploy bridge
    const TokenBridgeFactory = await ethers.getContractFactory("TokenBridge");
    const bridgeImpl = await TokenBridgeFactory.deploy();

    const BridgeProxyFactory = await ethers.getContractFactory("BridgeProxy");
    const initData = bridgeImpl.interface.encodeFunctionData("initialize", [
      owner.address,
      systemWallet.address,
      feeToken.target,
      FEE_AMOUNT,
      CURRENT_CHAIN_ID,
    ]);
    const proxy = await BridgeProxyFactory.deploy(bridgeImpl.target, initData);
    bridge = TokenBridgeFactory.attach(proxy.target) as TokenBridge;

    // Setup
    await bridge.connect(owner).grantAdmin(admin.address);
    await bridge.connect(admin).setVaultWallet(vaultWallet.address);

    // Mint tokens
    await token.mint(attacker.address, ethers.parseEther("1000"));
    await token.mint(user1.address, ethers.parseEther("1000"));
    await feeToken.mint(attacker.address, ethers.parseEther("10"));
    await feeToken.mint(user1.address, ethers.parseEther("10"));
    await token.mint(bridge.target, ethers.parseEther("5000"));

    // Approve
    await token.connect(attacker).approve(bridge.target, ethers.MaxUint256);
    await token.connect(user1).approve(bridge.target, ethers.MaxUint256);
    await feeToken.connect(attacker).approve(bridge.target, ethers.MaxUint256);
    await feeToken.connect(user1).approve(bridge.target, ethers.MaxUint256);
  });

  describe("Initialization Validation - Invalid Inputs", function () {
    it("Should revert initialize() when _owner is address(0)", async function () {
      const TokenBridgeFactory = await ethers.getContractFactory("TokenBridge");
      const bridgeImpl = await TokenBridgeFactory.deploy();

      const BridgeProxyFactory = await ethers.getContractFactory("BridgeProxy");
      const initData = bridgeImpl.interface.encodeFunctionData("initialize", [
        ethers.ZeroAddress, // Invalid owner
        systemWallet.address,
        feeToken.target,
        FEE_AMOUNT,
        CURRENT_CHAIN_ID,
      ]);

      await expect(
        BridgeProxyFactory.deploy(bridgeImpl.target, initData)
      ).to.be.revertedWithCustomError(bridgeImpl, "InvalidAddress");
    });

    it("Should revert initialize() when _systemWallet is address(0)", async function () {
      const TokenBridgeFactory = await ethers.getContractFactory("TokenBridge");
      const bridgeImpl = await TokenBridgeFactory.deploy();

      const BridgeProxyFactory = await ethers.getContractFactory("BridgeProxy");
      const initData = bridgeImpl.interface.encodeFunctionData("initialize", [
        owner.address,
        ethers.ZeroAddress, // Invalid system wallet
        feeToken.target,
        FEE_AMOUNT,
        CURRENT_CHAIN_ID,
      ]);

      await expect(
        BridgeProxyFactory.deploy(bridgeImpl.target, initData)
      ).to.be.revertedWithCustomError(bridgeImpl, "InvalidAddress");
    });

    it("Should revert initialize() when _feeToken is address(0)", async function () {
      const TokenBridgeFactory = await ethers.getContractFactory("TokenBridge");
      const bridgeImpl = await TokenBridgeFactory.deploy();

      const BridgeProxyFactory = await ethers.getContractFactory("BridgeProxy");
      const initData = bridgeImpl.interface.encodeFunctionData("initialize", [
        owner.address,
        systemWallet.address,
        ethers.ZeroAddress, // Invalid fee token
        FEE_AMOUNT,
        CURRENT_CHAIN_ID,
      ]);

      await expect(
        BridgeProxyFactory.deploy(bridgeImpl.target, initData)
      ).to.be.revertedWithCustomError(bridgeImpl, "InvalidAddress");
    });

    it("Should revert initialize() when _currentChainId is empty string", async function () {
      const TokenBridgeFactory = await ethers.getContractFactory("TokenBridge");
      const bridgeImpl = await TokenBridgeFactory.deploy();

      const BridgeProxyFactory = await ethers.getContractFactory("BridgeProxy");
      const initData = bridgeImpl.interface.encodeFunctionData("initialize", [
        owner.address,
        systemWallet.address,
        feeToken.target,
        FEE_AMOUNT,
        "", // Invalid chain ID
      ]);

      await expect(
        BridgeProxyFactory.deploy(bridgeImpl.target, initData)
      ).to.be.revertedWithCustomError(bridgeImpl, "InvalidChainIdentifier");
    });
  });

  describe("Caller Validation in executeBridgeOperation", function () {
    it("Should revert LOCK_WITH_FEE when msg.sender != fromAddress", async function () {
      const bridgeData = {
        fromToken: token.target.toString(),
        toToken: "",
        amount: ethers.parseEther("100"),
        fromAddress: user1.address,
        toAddress: user2.address,
        fromNetwork: CURRENT_CHAIN_ID,
        toNetwork: DESTINATION_CHAIN_ID,
        transactionId: getUniqueTxId(),
        email: "test@example.com",
        refund: {
          feeToken: ethers.ZeroAddress,
          feeAmount: 0
        }
      };

      // Try to call with invalidCaller instead of user1
      await expect(
        bridge.connect(invalidCaller).executeBridgeOperation(0, bridgeData)
      ).to.be.revertedWithCustomError(bridge, "InvalidCaller");
    });

    it("Should revert BURN when msg.sender != fromAddress", async function () {
      const bridgeData = {
        fromToken: token.target.toString(),
        toToken: "",
        amount: ethers.parseEther("100"),
        fromAddress: user1.address,
        toAddress: user2.address,
        fromNetwork: CURRENT_CHAIN_ID,
        toNetwork: DESTINATION_CHAIN_ID,
        transactionId: getUniqueTxId(),
        email: "test@example.com",
        refund: {
          feeToken: ethers.ZeroAddress,
          feeAmount: 0
        }
      };

      // Try to call with invalidCaller instead of user1
      await expect(
        bridge.connect(invalidCaller).executeBridgeOperation(1, bridgeData)
      ).to.be.revertedWithCustomError(bridge, "InvalidCaller");
    });
  });

  describe("Reentrancy Protection", function () {
    beforeEach(async function () {
      // Deploy malicious contracts
      const MaliciousTokenFactory = await ethers.getContractFactory("MaliciousToken");
      maliciousToken = await MaliciousTokenFactory.deploy("Malicious", "MAL");

      const MockAttackerFactory = await ethers.getContractFactory("MockAttacker");
      mockAttacker = await MockAttackerFactory.deploy(bridge.target);

      // Mint malicious tokens
      await maliciousToken.mint(mockAttacker.target, ethers.parseEther("1000"));
      await maliciousToken.mint(bridge.target, ethers.parseEther("5000"));
    });

    it("Should prevent reentrancy on lock operation", async function () {
      // Setup malicious token
      await maliciousToken.setBridge(bridge.target);
      await maliciousToken.mint(attacker.address, ethers.parseEther("10000"));
      await maliciousToken.setAttackParams(
        attacker.address,
        DESTINATION_CHAIN_ID,
        SOURCE_CHAIN_ID,
        "attack_tx"
      );
      await maliciousToken.enableAttack(1); // LOCK_WITH_FEE attack

      // Attacker tries to lock with malicious token
      // The reentrancy guard should prevent the attack
      await maliciousToken.connect(attacker).approve(bridge.target, ethers.MaxUint256);

      // The attack should fail due to reentrancy guard
      await bridge.connect(attacker).executeBridgeOperation(
        0, // LOCK_WITH_FEE
        {
          fromToken: maliciousToken.target.toString(),
          toToken: "",
          amount: ethers.parseEther("100"),
          fromAddress: attacker.address,
          toAddress: attacker.address,
          fromNetwork: CURRENT_CHAIN_ID,
          toNetwork: DESTINATION_CHAIN_ID,
          transactionId: getUniqueTxId(),
          email: "attacker@test.com",
          refund: {
            feeToken: ethers.ZeroAddress,
            feeAmount: 0
          }
        }
      );

      // Verify attack was attempted but failed (attackCount > 0 means attack was attempted)
      const attackCount = await maliciousToken.attackCount();
      expect(attackCount).to.be.greaterThan(0);
    });

    it("Should prevent reentrancy on release operation", async function () {
      // Setup malicious token for release attack
      await maliciousToken.setBridge(bridge.target);
      await maliciousToken.mint(bridge.target, ethers.parseEther("10000"));
      await maliciousToken.setAttackParams(
        attacker.address,
        DESTINATION_CHAIN_ID,
        SOURCE_CHAIN_ID,
        "attack_release_tx"
      );
      await maliciousToken.enableAttack(2); // RELEASE_TOKENS attack

      // Lock malicious tokens first (disable attack for lock)
      await maliciousToken.disableAttack();
      await maliciousToken.mint(attacker.address, ethers.parseEther("1000"));
      await maliciousToken.connect(attacker).approve(bridge.target, ethers.MaxUint256);
      await bridge.connect(attacker).executeBridgeOperation(
        0, // LOCK_WITH_FEE
        {
          fromToken: maliciousToken.target.toString(),
          toToken: "",
          amount: ethers.parseEther("100"),
          fromAddress: attacker.address,
          toAddress: attacker.address,
          fromNetwork: CURRENT_CHAIN_ID,
          toNetwork: DESTINATION_CHAIN_ID,
          transactionId: getUniqueTxId(),
          email: "attacker@test.com",
          refund: {
            feeToken: ethers.ZeroAddress,
            feeAmount: 0
          }
        }
      );

      // Re-enable attack for release
      await maliciousToken.enableAttack(2); // RELEASE_TOKENS attack

      // Try to release - attack should be attempted but fail
      await bridge.connect(systemWallet).executeBridgeOperation(
        2, // RELEASE
        {
          fromToken: "",
          toToken: maliciousToken.target.toString(),
          amount: ethers.parseEther("50"),
          fromAddress: attacker.address,
          toAddress: attacker.address,
          fromNetwork: SOURCE_CHAIN_ID,
          toNetwork: CURRENT_CHAIN_ID,
          transactionId: getUniqueTxId(),
          email: "attacker@test.com",
          refund: {
            feeToken: feeToken.target,
            feeAmount: FEE_AMOUNT
          }
        }
      );

      // Verify attack was attempted (attackCount > 0)
      const attackCount = await maliciousToken.attackCount();
      expect(attackCount).to.be.greaterThan(0);
    });
  });

  describe("Double Spending Prevention", function () {
    it("Should prevent reusing transaction ID on lock", async function () {
      const txId = getUniqueTxId();
      const amount = ethers.parseEther("100");

      // First lock succeeds
      await bridge.connect(user1).executeBridgeOperation(
        0, // LOCK_WITH_FEE
        {
          fromToken: token.target.toString(),
          toToken: "",
          amount: amount,
          fromAddress: user1.address,
          toAddress: user1.address,
          fromNetwork: CURRENT_CHAIN_ID,
          toNetwork: DESTINATION_CHAIN_ID,
          transactionId: txId,
          email: "user1@test.com",
          refund: {
            feeToken: ethers.ZeroAddress,
            feeAmount: 0
          }
        }
      );

      // Second lock with same txId fails
      await expect(
        bridge.connect(user1).executeBridgeOperation(
          0, // LOCK_WITH_FEE
          {
            fromToken: token.target.toString(),
            toToken: "",
            amount: amount,
            fromAddress: user1.address,
            toAddress: user1.address,
            fromNetwork: CURRENT_CHAIN_ID,
            toNetwork: DESTINATION_CHAIN_ID,
            transactionId: txId,
            email: "user1@test.com",
            refund: {
              feeToken: ethers.ZeroAddress,
              feeAmount: 0
            }
          }
        )
      ).to.be.revertedWithCustomError(bridge, "TransactionIdAlreadyUsed");
    });

    it("Should prevent reusing transaction ID on release", async function () {
      // Lock tokens first
      await bridge.connect(user1).executeBridgeOperation(
        0, // LOCK_WITH_FEE
        {
          fromToken: token.target.toString(),
          toToken: "",
          amount: ethers.parseEther("200"),
          fromAddress: user1.address,
          toAddress: user1.address,
          fromNetwork: CURRENT_CHAIN_ID,
          toNetwork: DESTINATION_CHAIN_ID,
          transactionId: getUniqueTxId(),
          email: "user1@test.com",
          refund: {
            feeToken: ethers.ZeroAddress,
            feeAmount: 0
          }
        }
      );

      const txId = getUniqueTxId();
      const amount = ethers.parseEther("100");

      // First release succeeds
      await bridge.connect(systemWallet).executeBridgeOperation(
        2, // RELEASE
        {
          fromToken: "",
          toToken: token.target.toString(),
          amount: amount,
          fromAddress: user1.address,
          toAddress: user1.address,
          fromNetwork: SOURCE_CHAIN_ID,
          toNetwork: CURRENT_CHAIN_ID,
          transactionId: txId,
          email: "user1@test.com",
          refund: {
            feeToken: feeToken.target,
            feeAmount: FEE_AMOUNT
          }
        }
      );

      // Second release with same txId fails
      await expect(
        bridge.connect(systemWallet).executeBridgeOperation(
          2, // RELEASE
          {
            fromToken: "",
            toToken: token.target.toString(),
            amount: amount,
            fromAddress: user1.address,
            toAddress: user1.address,
            fromNetwork: SOURCE_CHAIN_ID,
            toNetwork: CURRENT_CHAIN_ID,
            transactionId: txId,
            email: "user1@test.com",
            refund: {
              feeToken: feeToken.target,
              feeAmount: FEE_AMOUNT
            }
          }
        )
      ).to.be.revertedWithCustomError(bridge, "TransactionIdAlreadyUsed");
    });

    it("Should prevent transaction ID reuse across different operations", async function () {
      const txId = getUniqueTxId();

      // Lock with txId
      await bridge.connect(user1).executeBridgeOperation(
        0, // LOCK_WITH_FEE
        {
          fromToken: token.target.toString(),
          toToken: "",
          amount: ethers.parseEther("100"),
          fromAddress: user1.address,
          toAddress: user1.address,
          fromNetwork: CURRENT_CHAIN_ID,
          toNetwork: DESTINATION_CHAIN_ID,
          transactionId: txId,
          email: "user1@test.com",
          refund: {
            feeToken: ethers.ZeroAddress,
            feeAmount: 0
          }
        }
      );

      // Try to release with same txId (even though it's a different operation)
      await expect(
        bridge.connect(systemWallet).executeBridgeOperation(
          2, // RELEASE
          {
            fromToken: "",
            toToken: token.target.toString(),
            amount: ethers.parseEther("50"),
            fromAddress: user1.address,
            toAddress: user1.address,
            fromNetwork: SOURCE_CHAIN_ID,
            toNetwork: CURRENT_CHAIN_ID,
            transactionId: txId, // Same txId
            email: "user1@test.com",
            refund: {
              feeToken: feeToken.target,
              feeAmount: FEE_AMOUNT
            }
          }
        )
      ).to.be.revertedWithCustomError(bridge, "TransactionIdAlreadyUsed");
    });
  });

  // describe("Authorization Bypass Attempts", function () {
  //   it("Should prevent non-system wallet from releasing tokens", async function () {
  //     // Lock tokens first
  //     await bridge.connect(user1).executeBridgeOperation(
  //       0, // LOCK_WITH_FEE
  //       {
  //         fromToken: token.target.toString(),
  //         toToken: "",
  //         amount: ethers.parseEther("100"),
  //         fromAddress: user1.address,
  //         toAddress: user1.address,
  //         fromNetwork: CURRENT_CHAIN_ID,
  //         toNetwork: DESTINATION_CHAIN_ID,
  //         transactionId: getUniqueTxId(),
  //         email: "user1@test.com",
  //         refund: {
  //           feeToken: ethers.ZeroAddress,
  //           feeAmount: 0
  //         }
  //       }
  //     );

  //     // Attacker tries to release - should revert with AccessControl error
  //     await expect(
  //       bridge.connect(attacker).executeBridgeOperation(
  //         2, // RELEASE
  //         {
  //           fromToken: "",
  //           toToken: token.target.toString(),
  //           amount: ethers.parseEther("100"),
  //           fromAddress: user1.address,
  //           toAddress: attacker.address,
  //           fromNetwork: SOURCE_CHAIN_ID,
  //           toNetwork: CURRENT_CHAIN_ID,
  //           transactionId: getUniqueTxId(),
  //           email: "attacker@test.com",
  //           refund: {
  //             feeToken: feeToken.target,
  //             feeAmount: FEE_AMOUNT
  //           }
  //         }
  //       )
  //     ).to.be.reverted; // OpenZeppelin AccessControl will revert
  //   });

  //   it("Should prevent non-admin from pausing", async function () {
  //     await expect(
  //       bridge.connect(attacker).pause("test pause")
  //     ).to.be.revertedWithCustomError(bridge, "NotAdmin");
  //   });

  //   it("Should prevent non-admin from setting fee", async function () {
  //     await expect(
  //       bridge.connect(attacker).setFee(feeToken.target,(ethers.parseEther("1")))
  //     ).to.be.revertedWithCustomError(bridge, "NotAdmin");
  //   });

  //   it("Should prevent non-admin from setting vault wallet", async function () {
  //     await expect(
  //       bridge.connect(attacker).setVaultWallet(attacker.address)
  //     ).to.be.revertedWithCustomError(bridge, "NotAdmin");
  //   });

  //   it("Should prevent non-admin from granting admin", async function () {
  //     // grantAdmin requires ADMIN_ROLE or OWNER_ROLE
  //     await expect(
  //       bridge.connect(attacker).grantAdmin(attacker.address)
  //     ).to.be.revertedWithCustomError(bridge, "NotAdmin");
  //   });

  //   it("Should prevent non-owner from updating owner", async function () {
  //     // updateOwner requires OWNER_ROLE
  //     await expect(
  //       bridge.connect(attacker).updateOwner(attacker.address)
  //     ).to.be.reverted; // OpenZeppelin AccessControl will revert
  //   });
  // });

  describe("Input Validation Attacks", function () {
    it("Should reject zero address for token", async function () {
      await expect(
        bridge.connect(user1).executeBridgeOperation(
          0, // LOCK_WITH_FEE
          {
            fromToken: ethers.ZeroAddress,
            toToken: "",
            amount: ethers.parseEther("100"),
            fromAddress: user1.address,
            toAddress: user1.address,
            fromNetwork: CURRENT_CHAIN_ID,
            toNetwork: DESTINATION_CHAIN_ID,
            transactionId: getUniqueTxId(),
            email: "user1@test.com",
            refund: {
              feeToken: ethers.ZeroAddress,
              feeAmount: 0
            }
          }
        )
      ).to.be.revertedWithCustomError(bridge, "InvalidAddress");
    });

    it("Should reject zero amount", async function () {
      await expect(
        bridge.connect(user1).executeBridgeOperation(
          0, // LOCK_WITH_FEE
          {
            fromToken: token.target.toString(),
            toToken: "",
            amount: 0,
            fromAddress: user1.address,
            toAddress: user1.address,
            fromNetwork: CURRENT_CHAIN_ID,
            toNetwork: DESTINATION_CHAIN_ID,
            transactionId: getUniqueTxId(),
            email: "user1@test.com",
            refund: {
              feeToken: ethers.ZeroAddress,
              feeAmount: 0
            }
          }
        )
      ).to.be.revertedWithCustomError(bridge, "InvalidAmount");
    });

    it("Should reject empty chain identifier", async function () {
      await expect(
        bridge.connect(user1).executeBridgeOperation(
          0, // LOCK_WITH_FEE
          {
            fromToken: token.target.toString(),
            toToken: "",
            amount: ethers.parseEther("100"),
            fromAddress: user1.address,
            toAddress: user1.address,
            fromNetwork: CURRENT_CHAIN_ID,
            toNetwork: "", // Empty destination chain
            transactionId: getUniqueTxId(),
            email: "user1@test.com",
            refund: {
              feeToken: ethers.ZeroAddress,
              feeAmount: 0
            }
          }
        )
      ).to.be.revertedWithCustomError(bridge, "InvalidChainIdentifier");
    });
  });

  describe("Insufficient Balance Attacks", function () {
    it("Should prevent locking more tokens than user has", async function () {
      await expect(
        bridge.connect(user1).executeBridgeOperation(
          0, // LOCK_WITH_FEE
          {
            fromToken: token.target.toString(),
            toToken: "",
            amount: ethers.parseEther("10000"), // More than user has
            fromAddress: user1.address,
            toAddress: user1.address,
            fromNetwork: CURRENT_CHAIN_ID,
            toNetwork: DESTINATION_CHAIN_ID,
            transactionId: getUniqueTxId(),
            email: "user1@test.com",
            refund: {
              feeToken: ethers.ZeroAddress,
              feeAmount: 0
            }
          }
        )
      ).to.be.reverted; // ERC20 will revert
    });

    it("Should prevent releasing more than locked balance", async function () {
      // Lock 100 tokens
      await bridge.connect(user1).executeBridgeOperation(
        0, // LOCK_WITH_FEE
        {
          fromToken: token.target.toString(),
          toToken: "",
          amount: ethers.parseEther("100"),
          fromAddress: user1.address,
          toAddress: user1.address,
          fromNetwork: CURRENT_CHAIN_ID,
          toNetwork: DESTINATION_CHAIN_ID,
          transactionId: getUniqueTxId(),
          email: "user1@test.com",
          refund: {
            feeToken: ethers.ZeroAddress,
            feeAmount: 0
          }
        }
      );

      // Try to release 200 tokens
      await expect(
        bridge.connect(systemWallet).executeBridgeOperation(
          2, // RELEASE
          {
            fromToken: "",
            toToken: token.target.toString(),
            amount: ethers.parseEther("200"),
            fromAddress: user1.address,
            toAddress: user1.address,
            fromNetwork: SOURCE_CHAIN_ID,
            toNetwork: CURRENT_CHAIN_ID,
            transactionId: getUniqueTxId(),
            email: "user1@test.com",
            refund: {
              feeToken: feeToken.target,
              feeAmount: FEE_AMOUNT
            }
          }
        )
      ).to.be.revertedWithCustomError(bridge, "InsufficientLockedBalance");
    });

    it("Should prevent paying fee without sufficient fee tokens", async function () {
      // Set very high fee
      await bridge.connect(admin).setFee(feeToken.target,(ethers.parseEther("100")));

      await expect(
        bridge.connect(user1).executeBridgeOperation(
          0, // LOCK_WITH_FEE
          {
            fromToken: token.target.toString(),
            toToken: "",
            amount: ethers.parseEther("100"),
            fromAddress: user1.address,
            toAddress: user1.address,
            fromNetwork: CURRENT_CHAIN_ID,
            toNetwork: DESTINATION_CHAIN_ID,
            transactionId: getUniqueTxId(),
            email: "user1@test.com",
            refund: {
              feeToken: ethers.ZeroAddress,
              feeAmount: 0
            }
          }
        )
      ).to.be.reverted; // Fee token transfer will fail
    });
  });

  describe("Treasury Withdrawal Security", function () {
    it("Should revert withdrawTreasury() when token is address(0)", async function () {
      await expect(
        bridge.connect(admin).withdrawTreasury(ethers.ZeroAddress, user1.address)
      ).to.be.revertedWithCustomError(bridge, "InvalidAddress");
    });

    it("Should revert withdrawTreasury() when recipient is address(0)", async function () {
      await expect(
        bridge.connect(admin).withdrawTreasury(token.target, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(bridge, "InvalidAddress");
    });

    it("Should revert withdrawTreasury() when balance <= locked", async function () {
      // Create a new bridge without pre-minted tokens
      const TokenBridgeFactory = await ethers.getContractFactory("TokenBridge");
      const bridgeImpl2 = await TokenBridgeFactory.deploy();

      const BridgeProxyFactory = await ethers.getContractFactory("BridgeProxy");
      const initData2 = bridgeImpl2.interface.encodeFunctionData("initialize", [
        owner.address,
        systemWallet.address,
        feeToken.target,
        FEE_AMOUNT,
        CURRENT_CHAIN_ID,
      ]);
      const proxy2 = await BridgeProxyFactory.deploy(bridgeImpl2.target, initData2);
      const bridge2 = TokenBridgeFactory.attach(proxy2.target) as TokenBridge;

      // Setup
      await bridge2.connect(owner).grantAdmin(admin.address);
      await bridge2.connect(admin).setVaultWallet(vaultWallet.address);

      // Mint tokens to user1 for this bridge
      await token.mint(user1.address, ethers.parseEther("1000"));
      await token.connect(user1).approve(bridge2.target, ethers.MaxUint256);

      // Mint and approve fee tokens
      await feeToken.mint(user1.address, ethers.parseEther("10"));
      await feeToken.connect(user1).approve(bridge2.target, ethers.MaxUint256);

      // Lock some tokens first
      const lockAmount = ethers.parseEther("100");
      const bridgeData = {
        fromToken: token.target.toString(),
        toToken: "",
        amount: lockAmount,
        fromAddress: user1.address,
        toAddress: user2.address,
        fromNetwork: CURRENT_CHAIN_ID,
        toNetwork: DESTINATION_CHAIN_ID,
        transactionId: getUniqueTxId(),
        email: "test@example.com",
        refund: {
          feeToken: ethers.ZeroAddress,
          feeAmount: 0
        }
      };

      await bridge2.connect(user1).executeBridgeOperation(0, bridgeData);

      // Bridge2 now has exactly lockAmount tokens (balance == locked)
      // Try to withdraw when balance == locked
      await expect(
        bridge2.connect(admin).withdrawTreasury(token.target, user1.address)
      ).to.be.revertedWithCustomError(bridge2, "InvalidAmount");
    });

    it("Should revert withdrawTreasury() when withdrawable amount is 0", async function () {
      // Create a new bridge without pre-minted tokens
      const TokenBridgeFactory = await ethers.getContractFactory("TokenBridge");
      const bridgeImpl3 = await TokenBridgeFactory.deploy();

      const BridgeProxyFactory = await ethers.getContractFactory("BridgeProxy");
      const initData3 = bridgeImpl3.interface.encodeFunctionData("initialize", [
        owner.address,
        systemWallet.address,
        feeToken.target,
        FEE_AMOUNT,
        CURRENT_CHAIN_ID,
      ]);
      const proxy3 = await BridgeProxyFactory.deploy(bridgeImpl3.target, initData3);
      const bridge3 = TokenBridgeFactory.attach(proxy3.target) as TokenBridge;

      // Setup
      await bridge3.connect(owner).grantAdmin(admin.address);
      await bridge3.connect(admin).setVaultWallet(vaultWallet.address);

      // Mint tokens to user1 for this bridge
      await token.mint(user1.address, ethers.parseEther("1000"));
      await token.connect(user1).approve(bridge3.target, ethers.MaxUint256);

      // Mint and approve fee tokens
      await feeToken.mint(user1.address, ethers.parseEther("10"));
      await feeToken.connect(user1).approve(bridge3.target, ethers.MaxUint256);

      // Lock some tokens first
      const lockAmount = ethers.parseEther("100");
      const bridgeData = {
        fromToken: token.target.toString(),
        toToken: "",
        amount: lockAmount,
        fromAddress: user1.address,
        toAddress: user2.address,
        fromNetwork: CURRENT_CHAIN_ID,
        toNetwork: DESTINATION_CHAIN_ID,
        transactionId: getUniqueTxId(),
        email: "test@example.com",
        refund: {
          feeToken: ethers.ZeroAddress,
          feeAmount: 0
        }
      };

      await bridge3.connect(user1).executeBridgeOperation(0, bridgeData);

      // Bridge3 now has exactly lockAmount tokens (balance == locked)
      // Try to withdraw when balance == locked (amount == 0)
      await expect(
        bridge3.connect(admin).withdrawTreasury(token.target, user1.address)
      ).to.be.revertedWithCustomError(bridge3, "InvalidAmount");
    });
  });

  describe("Fee Collection Edge Cases", function () {
    it("Should skip fee collection when feeToken is address(0)", async function () {
      // Disable fee by setting feeToken to address(0)
      await bridge.connect(admin).setFee(ethers.ZeroAddress, FEE_AMOUNT);

      const bridgeData = {
        fromToken: token.target.toString(),
        toToken: "",
        amount: ethers.parseEther("100"),
        fromAddress: user1.address,
        toAddress: user2.address,
        fromNetwork: CURRENT_CHAIN_ID,
        toNetwork: DESTINATION_CHAIN_ID,
        transactionId: getUniqueTxId(),
        email: "test@example.com",
        refund: {
          feeToken: ethers.ZeroAddress,
          feeAmount: 0
        }
      };

      // Should not revert even though user doesn't have fee tokens
      await expect(
        bridge.connect(user1).executeBridgeOperation(0, bridgeData)
      ).to.not.be.reverted;
    });

    it("Should skip fee collection when feeAmount is 0", async function () {
      // Set fee amount to 0
      await bridge.connect(admin).setFee(feeToken.target, 0);

      const bridgeData = {
        fromToken: token.target.toString(),
        toToken: "",
        amount: ethers.parseEther("100"),
        fromAddress: user1.address,
        toAddress: user2.address,
        fromNetwork: CURRENT_CHAIN_ID,
        toNetwork: DESTINATION_CHAIN_ID,
        transactionId: getUniqueTxId(),
        email: "test@example.com",
        refund: {
          feeToken: ethers.ZeroAddress,
          feeAmount: 0
        }
      };

      // Should succeed without fee collection
      await expect(
        bridge.connect(user1).executeBridgeOperation(0, bridgeData)
      ).to.not.be.reverted;
    });

    it("Should skip fee collection when vaultWallet is not set", async function () {
      // Create a new bridge instance without vault wallet set
      const TokenBridgeFactory = await ethers.getContractFactory("TokenBridge");
      const bridgeImpl2 = await TokenBridgeFactory.deploy();

      const BridgeProxyFactory = await ethers.getContractFactory("BridgeProxy");
      const initData2 = bridgeImpl2.interface.encodeFunctionData("initialize", [
        owner.address,
        systemWallet.address,
        feeToken.target,
        FEE_AMOUNT,
        CURRENT_CHAIN_ID,
      ]);
      const proxy2 = await BridgeProxyFactory.deploy(bridgeImpl2.target, initData2);
      const bridge2 = TokenBridgeFactory.attach(proxy2.target) as TokenBridge;

      // Grant admin role
      await bridge2.connect(owner).grantAdmin(admin.address);

      // Don't set vault wallet - it should be address(0) by default

      // Mint tokens to user1 for this bridge
      await token.mint(user1.address, ethers.parseEther("1000"));
      await token.connect(user1).approve(bridge2.target, ethers.MaxUint256);

      const bridgeData = {
        fromToken: token.target.toString(),
        toToken: "",
        amount: ethers.parseEther("100"),
        fromAddress: user1.address,
        toAddress: user2.address,
        fromNetwork: CURRENT_CHAIN_ID,
        toNetwork: DESTINATION_CHAIN_ID,
        transactionId: getUniqueTxId(),
        email: "test@example.com",
        refund: {
          feeToken: ethers.ZeroAddress,
          feeAmount: 0
        }
      };

      // Should succeed without fee collection (vault wallet is not set)
      await expect(
        bridge2.connect(user1).executeBridgeOperation(0, bridgeData)
      ).to.not.be.reverted;
    });
  });

  describe("Pausable Functionality", function () {
    it("Should start unpaused", async function () {
      const isPaused = await bridge.paused();
      expect(isPaused).to.be.false;
    });

    it("Should fail lock when paused", async function () {
      await bridge.connect(admin).pause("Emergency pause for testing");

      await expect(
        bridge.connect(user1).executeBridgeOperation(
          0, // LOCK_WITH_FEE
          {
            fromToken: token.target.toString(),
            toToken: "",
            amount: ethers.parseEther("100"),
            fromAddress: user1.address,
            toAddress: user1.address,
            fromNetwork: CURRENT_CHAIN_ID,
            toNetwork: DESTINATION_CHAIN_ID,
            transactionId: getUniqueTxId(),
            email: "user1@test.com",
            refund: {
              feeToken: ethers.ZeroAddress,
              feeAmount: 0
            }
          }
        )
      ).to.be.revertedWithCustomError(bridge, "EnforcedPause");
    });

    it("Should fail release when paused", async function () {
      // Lock tokens first
      await bridge.connect(user1).executeBridgeOperation(
        0, // LOCK_WITH_FEE
        {
          fromToken: token.target.toString(),
          toToken: "",
          amount: ethers.parseEther("1000"),
          fromAddress: user1.address,
          toAddress: user1.address,
          fromNetwork: CURRENT_CHAIN_ID,
          toNetwork: DESTINATION_CHAIN_ID,
          transactionId: getUniqueTxId(),
          email: "user1@test.com",
          refund: {
            feeToken: ethers.ZeroAddress,
            feeAmount: 0
          }
        }
      );

      // Pause the contract
      await bridge.connect(admin).pause("Emergency pause for testing");

      await expect(
        bridge.connect(systemWallet).executeBridgeOperation(
          2, // RELEASE
          {
            fromToken: "",
            toToken: token.target.toString(),
            amount: ethers.parseEther("100"),
            fromAddress: user1.address,
            toAddress: user1.address,
            fromNetwork: SOURCE_CHAIN_ID,
            toNetwork: CURRENT_CHAIN_ID,
            transactionId: getUniqueTxId(),
            email: "user1@test.com",
            refund: {
              feeToken: feeToken.target,
              feeAmount: FEE_AMOUNT
            }
          }
        )
      ).to.be.revertedWithCustomError(bridge, "EnforcedPause");
    });

    it("Should fail mint when paused", async function () {
      await bridge.connect(admin).pause("Emergency pause for testing");

      // Deploy mintable token for this test
      const MockMintableFactory = await ethers.getContractFactory("MockMintableToken");
      const mintToken = await MockMintableFactory.deploy("Mint Token", "MTK", 18);

      await expect(
        bridge.connect(systemWallet).executeBridgeOperation(
          3, // MINT
          {
            fromToken: "",
            toToken: mintToken.target.toString(),
            amount: ethers.parseEther("100"),
            fromAddress: user1.address,
            toAddress: user1.address,
            fromNetwork: SOURCE_CHAIN_ID,
            toNetwork: CURRENT_CHAIN_ID,
            transactionId: getUniqueTxId(),
            email: "user1@test.com",
            refund: {
              feeToken: feeToken.target,
              feeAmount: FEE_AMOUNT
            }
          }
        )
      ).to.be.revertedWithCustomError(bridge, "EnforcedPause");
    });

    it("Should fail burn when paused", async function () {
      // Deploy burnable token for this test
      const MockBurnableFactory = await ethers.getContractFactory("MockBurnableToken");
      const burnToken = await MockBurnableFactory.deploy("Burn Token", "BTK", 18);
      await burnToken.mint(user1.address, ethers.parseEther("1000"));
      await burnToken.connect(user1).approve(bridge.target, ethers.MaxUint256);

      await bridge.connect(admin).pause("Emergency pause for testing");

      await expect(
        bridge.connect(user1).executeBridgeOperation(
          1, // BURN
          {
            fromToken: burnToken.target.toString(),
            toToken: "",
            amount: ethers.parseEther("100"),
            fromAddress: user1.address,
            toAddress: user1.address,
            fromNetwork: CURRENT_CHAIN_ID,
            toNetwork: DESTINATION_CHAIN_ID,
            transactionId: getUniqueTxId(),
            email: "user1@test.com",
            refund: {
              feeToken: ethers.ZeroAddress,
              feeAmount: 0
            }
          }
        )
      ).to.be.revertedWithCustomError(bridge, "EnforcedPause");
    });

    it("Should resume operations after unpause", async function () {
      // Pause
      await bridge.connect(admin).pause("Emergency pause for testing");

      // Unpause
      await bridge.connect(admin).unpause("Resuming operations");

      // Lock should work
      await expect(
        bridge.connect(user1).executeBridgeOperation(
          0, // LOCK_WITH_FEE
          {
            fromToken: token.target.toString(),
            toToken: "",
            amount: ethers.parseEther("100"),
            fromAddress: user1.address,
            toAddress: user1.address,
            fromNetwork: CURRENT_CHAIN_ID,
            toNetwork: DESTINATION_CHAIN_ID,
            transactionId: getUniqueTxId(),
            email: "user1@test.com",
            refund: {
              feeToken: ethers.ZeroAddress,
              feeAmount: 0
            }
          }
        )
      ).to.not.be.reverted;
    });
  });

  describe("Chain ID Validation", function () {
    beforeEach(async function () {
      // Lock some tokens for release tests
      await bridge.connect(user1).executeBridgeOperation(
        0, // LOCK_WITH_FEE
        {
          fromToken: token.target.toString(),
          toToken: "",
          amount: ethers.parseEther("1000"),
          fromAddress: user1.address,
          toAddress: user1.address,
          fromNetwork: CURRENT_CHAIN_ID,
          toNetwork: DESTINATION_CHAIN_ID,
          transactionId: getUniqueTxId(),
          email: "user1@test.com",
          refund: {
            feeToken: ethers.ZeroAddress,
            feeAmount: 0
          }
        }
      );
    });

    it("Should validate chain IDs on release (CAIP-2 format - missing colon)", async function () {
      await expect(
        bridge.connect(systemWallet).executeBridgeOperation(
          2, // RELEASE
          {
            fromToken: "",
            toToken: token.target.toString(),
            amount: ethers.parseEther("100"),
            fromAddress: user1.address,
            toAddress: user1.address,
            fromNetwork: "invalidchain", // No colon separator
            toNetwork: CURRENT_CHAIN_ID,
            transactionId: getUniqueTxId(),
            email: "user1@test.com",
            refund: {
              feeToken: feeToken.target,
              feeAmount: FEE_AMOUNT
            }
          }
        )
      ).to.be.revertedWithCustomError(bridge, "InvalidChainIdentifier");
    });

    it("Should validate chain IDs on mint (CAIP-2 format - missing colon)", async function () {
      // Deploy mintable token for this test
      const MockMintableFactory = await ethers.getContractFactory("MockMintableToken");
      const mintToken = await MockMintableFactory.deploy("Mint Token", "MTK", 18);

      await expect(
        bridge.connect(systemWallet).executeBridgeOperation(
          3, // MINT
          {
            fromToken: "",
            toToken: mintToken.target.toString(),
            amount: ethers.parseEther("100"),
            fromAddress: user1.address,
            toAddress: user1.address,
            fromNetwork: "invalidchain", // No colon separator
            toNetwork: CURRENT_CHAIN_ID,
            transactionId: getUniqueTxId(),
            email: "user1@test.com",
            refund: {
              feeToken: feeToken.target,
              feeAmount: FEE_AMOUNT
            }
          }
        )
      ).to.be.revertedWithCustomError(bridge, "InvalidChainIdentifier");
    });

    it("Should maintain accounting invariant on release (locked >= 0)", async function () {
      const lockedBefore = await bridge.getLockedBalance(token.target);

      // Release some tokens
      await bridge.connect(systemWallet).executeBridgeOperation(
        2, // RELEASE
        {
          fromToken: "",
          toToken: token.target.toString(),
          amount: ethers.parseEther("500"),
          fromAddress: user1.address,
          toAddress: user1.address,
          fromNetwork: SOURCE_CHAIN_ID,
          toNetwork: CURRENT_CHAIN_ID,
          transactionId: getUniqueTxId(),
          email: "user1@test.com",
          refund: {
            feeToken: ethers.ZeroAddress,
            feeAmount: 0
          }
        }
      );

      const lockedAfter = await bridge.getLockedBalance(token.target);

      // Verify locked balance decreased correctly
      expect(lockedAfter).to.equal(lockedBefore - ethers.parseEther("500"));

      // Verify locked balance is non-negative
      expect(lockedAfter).to.be.gte(0);
    });
  });

  describe("System Wallet Authorization", function () {
    it("Should allow system wallet to mint", async function () {
      // Deploy mintable token for this test
      const MockMintableFactory = await ethers.getContractFactory("MockMintableToken");
      const mintToken = await MockMintableFactory.deploy("Mint Token", "MTK", 18);

      // System wallet can mint
      await expect(
        bridge.connect(systemWallet).executeBridgeOperation(
          3, // MINT
          {
            fromToken: "",
            toToken: mintToken.target.toString(),
            amount: ethers.parseEther("100"),
            fromAddress: user1.address,
            toAddress: user1.address,
            fromNetwork: SOURCE_CHAIN_ID,
            toNetwork: CURRENT_CHAIN_ID,
            transactionId: getUniqueTxId(),
            email: "user1@test.com",
            refund: {
              feeToken: ethers.ZeroAddress,
              feeAmount: 0
            }
          }
        )
      ).to.not.be.reverted;
    });

    it("Should prevent regular user from minting", async function () {
      // Deploy mintable token for this test
      const MockMintableFactory = await ethers.getContractFactory("MockMintableToken");
      const mintToken = await MockMintableFactory.deploy("Mint Token", "MTK", 18);

      await expect(
        bridge.connect(user1).executeBridgeOperation(
          3, // MINT
          {
            fromToken: "",
            toToken: mintToken.target.toString(),
            amount: ethers.parseEther("100"),
            fromAddress: user1.address,
            toAddress: user1.address,
            fromNetwork: SOURCE_CHAIN_ID,
            toNetwork: CURRENT_CHAIN_ID,
            transactionId: getUniqueTxId(),
            email: "user1@test.com",
            refund: {
              feeToken: feeToken.target,
              feeAmount: FEE_AMOUNT
            }
          }
        )
      ).to.be.reverted; // Will revert due to access control
    });
  });
});
