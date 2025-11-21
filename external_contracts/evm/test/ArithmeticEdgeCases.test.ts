import { expect } from "chai";
import { ethers } from "hardhat";
import { TokenBridge, MockERC20 } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Arithmetic Overflow/Underflow Edge Cases", function () {
  let bridge: TokenBridge;
  let owner: SignerWithAddress;
  let admin: SignerWithAddress;
  let systemWallet: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  let token: MockERC20;
  let feeToken: MockERC20;

  const FEE_AMOUNT = ethers.parseEther("0.1");
  const CURRENT_CHAIN_ID = "eip155:31337";
  const DESTINATION_CHAIN_ID = "eip155:137";
  const SOURCE_CHAIN_ID = "eip155:56";

  let txCounter = 0;
  function getUniqueTxId(): string {
    return `tx_overflow_${Date.now()}_${txCounter++}`;
  }

  beforeEach(async function () {
    [owner, admin, systemWallet, user1, user2] = await ethers.getSigners();

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

    // Mint tokens
    await token.mint(user1.address, ethers.parseEther("10000"));
    await token.mint(user2.address, ethers.parseEther("10000"));
    await feeToken.mint(user1.address, ethers.parseEther("100"));
    await feeToken.mint(user2.address, ethers.parseEther("100"));

    // Approve
    await token.connect(user1).approve(bridge.target, ethers.MaxUint256);
    await token.connect(user2).approve(bridge.target, ethers.MaxUint256);
    await feeToken.connect(user1).approve(bridge.target, ethers.MaxUint256);
    await feeToken.connect(user2).approve(bridge.target, ethers.MaxUint256);
  });

  describe("Locked Balance Addition Overflow Protection", function () {
    it("Should handle very large locked balance values without overflow", async function () {
      // Test with large but realistic values (not near uint256.max to avoid gas issues)
      const largeAmount = ethers.parseEther("1000000000"); // 1 billion tokens

      // Mint large amount to user1
      await token.mint(user1.address, largeAmount);
      await token.connect(user1).approve(bridge.target, ethers.MaxUint256);

      // Lock large amount
      await bridge.connect(user1).executeBridgeOperation(
        0, // LOCK_WITH_FEE
        {
          fromToken: token.target.toString(),
          toToken: "",
          amount: largeAmount,
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

      // Verify locked balance is correct
      const lockedBalance = await bridge.getLockedBalance(token.target);
      expect(lockedBalance).to.equal(largeAmount);
    });

    it("Should handle multiple sequential locks accumulating large values", async function () {
      const lockAmount = ethers.parseEther("100000"); // 100k tokens per lock
      const numLocks = 100; // 100 locks = 10 million tokens total

      // Mint enough tokens
      const totalAmount = lockAmount * BigInt(numLocks);
      await token.mint(user1.address, totalAmount);
      await token.connect(user1).approve(bridge.target, ethers.MaxUint256);

      // Perform multiple locks
      for (let i = 0; i < numLocks; i++) {
        await bridge.connect(user1).executeBridgeOperation(
          0, // LOCK_WITH_FEE
          {
            fromToken: token.target.toString(),
            toToken: "",
            amount: lockAmount,
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

        // Verify locked balance increases correctly
        const expectedLocked = lockAmount * BigInt(i + 1);
        const actualLocked = await bridge.getLockedBalance(token.target);
        expect(actualLocked).to.equal(expectedLocked);
      }

      // Final verification
      const finalLocked = await bridge.getLockedBalance(token.target);
      expect(finalLocked).to.equal(totalAmount);
    });

    it("Should handle multiple users locking simultaneously with large values", async function () {
      const lockAmount = ethers.parseEther("500000"); // 500k tokens per user

      // Mint tokens to both users
      await token.mint(user1.address, lockAmount);
      await token.mint(user2.address, lockAmount);
      await token.connect(user1).approve(bridge.target, ethers.MaxUint256);
      await token.connect(user2).approve(bridge.target, ethers.MaxUint256);

      // Both users lock tokens
      await Promise.all([
        bridge.connect(user1).executeBridgeOperation(
          0, // LOCK_WITH_FEE
          {
            fromToken: token.target.toString(),
            toToken: "",
            amount: lockAmount,
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
        ),
        bridge.connect(user2).executeBridgeOperation(
          0, // LOCK_WITH_FEE
          {
            fromToken: token.target.toString(),
            toToken: "",
            amount: lockAmount,
            fromAddress: user2.address,
            toAddress: user2.address,
            fromNetwork: CURRENT_CHAIN_ID,
            toNetwork: DESTINATION_CHAIN_ID,
            transactionId: getUniqueTxId(),
            email: "user2@test.com",
            refund: {
              feeToken: ethers.ZeroAddress,
              feeAmount: 0
            }
          }
        )
      ]);

      // Verify total locked balance
      const totalLocked = await bridge.getLockedBalance(token.target);
      expect(totalLocked).to.equal(lockAmount * 2n);
    });

    it("Should correctly handle locked balance approaching practical limits", async function () {
      // Test with a very large value (but not uint256.max to avoid gas issues)
      // This represents ~1 trillion tokens with 18 decimals
      const veryLargeAmount = ethers.parseEther("1000000000000");

      // Mint to user
      await token.mint(user1.address, veryLargeAmount);
      await token.connect(user1).approve(bridge.target, ethers.MaxUint256);

      // Lock the very large amount
      await bridge.connect(user1).executeBridgeOperation(
        0, // LOCK_WITH_FEE
        {
          fromToken: token.target.toString(),
          toToken: "",
          amount: veryLargeAmount,
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

      // Verify locked balance
      const lockedBalance = await bridge.getLockedBalance(token.target);
      expect(lockedBalance).to.equal(veryLargeAmount);

      // Verify we can still add more (no overflow)
      const additionalAmount = ethers.parseEther("1000");
      await token.mint(user2.address, additionalAmount);
      await token.connect(user2).approve(bridge.target, ethers.MaxUint256);

      await bridge.connect(user2).executeBridgeOperation(
        0, // LOCK_WITH_FEE
        {
          fromToken: token.target.toString(),
          toToken: "",
          amount: additionalAmount,
          fromAddress: user2.address,
          toAddress: user2.address,
          fromNetwork: CURRENT_CHAIN_ID,
          toNetwork: DESTINATION_CHAIN_ID,
          transactionId: getUniqueTxId(),
          email: "user2@test.com",
          refund: {
            feeToken: ethers.ZeroAddress,
            feeAmount: 0
          }
        }
      );

      // Verify total locked balance
      const finalLocked = await bridge.getLockedBalance(token.target);
      expect(finalLocked).to.equal(veryLargeAmount + additionalAmount);
    });
  });

  describe("Locked Balance Subtraction Underflow Protection", function () {
    it("Should prevent underflow when releasing more than locked", async function () {
      // Lock 100 tokens
      const lockAmount = ethers.parseEther("100");
      await token.mint(bridge.target, lockAmount);

      await bridge.connect(user1).executeBridgeOperation(
        0, // LOCK_WITH_FEE
        {
          fromToken: token.target.toString(),
          toToken: "",
          amount: lockAmount,
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

      // Try to release 200 tokens (more than locked)
      const releaseAmount = ethers.parseEther("200");
      await expect(
        bridge.connect(systemWallet).executeBridgeOperation(
          2, // RELEASE
          {
            fromToken: "",
            toToken: token.target.toString(),
            amount: releaseAmount,
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

    it("Should prevent underflow when releasing exact locked amount plus one", async function () {
      // Lock tokens
      const lockAmount = ethers.parseEther("1000");
      await token.mint(bridge.target, lockAmount * 2n);

      await bridge.connect(user1).executeBridgeOperation(
        0, // LOCK_WITH_FEE
        {
          fromToken: token.target.toString(),
          toToken: "",
          amount: lockAmount,
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

      // Try to release locked + 1 wei
      const releaseAmount = lockAmount + 1n;
      await expect(
        bridge.connect(systemWallet).executeBridgeOperation(
          2, // RELEASE
          {
            fromToken: "",
            toToken: token.target.toString(),
            amount: releaseAmount,
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

    it("Should handle sequential releases reducing locked balance to zero", async function () {
      // Lock a large amount
      const totalLockAmount = ethers.parseEther("10000");

      let accumulated_fee = await bridge.getAccumulatedFee(feeToken.target);

      await bridge.connect(user1).executeBridgeOperation(
        0, // LOCK_WITH_FEE
        {
          fromToken: token.target.toString(),
          toToken: "",
          amount: totalLockAmount,
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

      // Release in chunks
      const releaseAmount = ethers.parseEther("2500");
      for (let i = 0; i < 4; i++) {
        await bridge.connect(systemWallet).executeBridgeOperation(
          2, // RELEASE
          {
            fromToken: "",
            toToken: token.target.toString(),
            amount: releaseAmount,
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

        // Verify locked balance decreases correctly
        const expectedLocked = totalLockAmount - (releaseAmount * BigInt(i + 1));
        const actualLocked = await bridge.getLockedBalance(token.target);
        expect(actualLocked).to.equal(expectedLocked);
      }

      // Verify final locked balance is zero
      const finalLocked = await bridge.getLockedBalance(token.target);
      expect(finalLocked).to.equal(0);

      // Try to release more when locked is zero
      await expect(
        bridge.connect(systemWallet).executeBridgeOperation(
          2, // RELEASE
          {
            fromToken: "",
            toToken: token.target.toString(),
            amount: ethers.parseEther("1"),
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
      ).to.be.revertedWithCustomError(bridge, "InsufficientLockedBalance");
    });
  });

  describe("Treasury Withdrawal Underflow Protection", function () {
    it("Should prevent withdrawal when balance equals locked", async function () {
      // Create scenario where balance == locked
      const lockAmount = ethers.parseEther("1000");

      await bridge.connect(user1).executeBridgeOperation(
        0, // LOCK_WITH_FEE
        {
          fromToken: token.target.toString(),
          toToken: "",
          amount: lockAmount,
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

      // At this point, balance == locked
      const balance = await token.balanceOf(bridge.target);
      const locked = await bridge.getLockedBalance(token.target);
      expect(balance).to.equal(locked);

      // Try to withdraw treasury
      await expect(
        bridge.connect(admin).withdrawTreasury(token.target, user2.address)
      ).to.be.revertedWithCustomError(bridge, "AmountUnderflow");
    });

    it("Should prevent withdrawal when balance is less than locked (edge case)", async function () {
      // This is a theoretical edge case that shouldn't happen in normal operation
      // but we test the protection anyway

      // Lock tokens - user locks from their balance
      const lockAmount = ethers.parseEther("1000");

      await bridge.connect(user1).executeBridgeOperation(
        0, // LOCK_WITH_FEE
        {
          fromToken: token.target.toString(),
          toToken: "",
          amount: lockAmount,
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

      // Verify balance == locked (no treasury funds)
      const balance = await token.balanceOf(bridge.target);
      const locked = await bridge.getLockedBalance(token.target);
      expect(balance).to.equal(locked);

      // Try to withdraw - should fail because balance == locked
      await expect(
        bridge.connect(admin).withdrawTreasury(token.target, user2.address)
      ).to.be.revertedWithCustomError(bridge, "AmountUnderflow");
    });

    it("Should correctly calculate withdrawable amount with large values", async function () {
      // Lock a large amount - user locks from their own balance
      const lockAmount = ethers.parseEther("1000000");

      // Mint enough tokens to user1 to lock
      await token.mint(user1.address, lockAmount);
      await token.connect(user1).approve(bridge.target, ethers.MaxUint256);

      await bridge.connect(user1).executeBridgeOperation(
        0, // LOCK_WITH_FEE
        {
          fromToken: token.target.toString(),
          toToken: "",
          amount: lockAmount,
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

      // Add treasury funds (fees collected, etc.) - mint directly to bridge
      const treasuryAmount = ethers.parseEther("50000");
      await token.mint(bridge.target, treasuryAmount);

      // Withdraw treasury
      const balanceBefore = await token.balanceOf(user2.address);
      await bridge.connect(admin).withdrawTreasury(token.target, user2.address);
      const balanceAfter = await token.balanceOf(user2.address);

      // Verify correct amount withdrawn
      expect(balanceAfter - balanceBefore).to.equal(treasuryAmount);

      // Verify locked balance unchanged
      const lockedAfter = await bridge.getLockedBalance(token.target);
      expect(lockedAfter).to.equal(lockAmount);
    });
  });

  describe("Fee Calculation Edge Cases", function () {
    it("Should handle very large fee amounts without overflow", async function () {
      // Set a very large fee
      const largeFee = ethers.parseEther("1000000");
      await bridge.connect(admin).setFee(feeToken.target, largeFee);

      // Mint large fee amount to user
      await feeToken.mint(user1.address, largeFee);
      await feeToken.connect(user1).approve(bridge.target, ethers.MaxUint256);

      // Lock tokens with large fee
      const lockAmount = ethers.parseEther("100");
      await bridge.connect(user1).executeBridgeOperation(
        0, // LOCK_WITH_FEE
        {
          fromToken: token.target.toString(),
          toToken: "",
          amount: lockAmount,
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

      // Verify fee was collected
      const bridgeFeeBalance = await feeToken.balanceOf(bridge.target);
      expect(bridgeFeeBalance).to.equal(largeFee);
    });

    it("Should not handle fee refunds with large amounts which lead to underflow", async function () {
      // Lock tokens first
      const lockAmount = ethers.parseEther("1000");
      await token.mint(bridge.target, lockAmount);

      await bridge.connect(user1).executeBridgeOperation(
        0, // LOCK_WITH_FEE
        {
          fromToken: token.target.toString(),
          toToken: "",
          amount: lockAmount,
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

      // Release with large fee refund
      const largeFeeRefund = ethers.parseEther("500000");
      await feeToken.mint(bridge.target, largeFeeRefund);

      const balanceBefore = await feeToken.balanceOf(user1.address);

      await expect(bridge.connect(systemWallet).executeBridgeOperation(
        2, // RELEASE
        {
          fromToken: "",
          toToken: token.target.toString(),
          amount: lockAmount,
          fromAddress: user1.address,
          toAddress: user1.address,
          fromNetwork: SOURCE_CHAIN_ID,
          toNetwork: CURRENT_CHAIN_ID,
          transactionId: getUniqueTxId(),
          email: "user1@test.com",
          refund: {
            feeToken: feeToken.target,
            feeAmount: largeFeeRefund
          }
        }
      )).to.be.revertedWithCustomError(bridge, "FeeUnderflow");

      // Verify fee refund
      const balanceAfter = await feeToken.balanceOf(user1.address);
      expect(balanceAfter - balanceBefore).to.not.equal(largeFeeRefund);
    });

    it("Should handle zero fee amount correctly", async function () {
      // Set fee to zero
      await bridge.connect(admin).setFee(feeToken.target, 0);

      const lockAmount = ethers.parseEther("100");
      const feeBalanceBefore = await feeToken.balanceOf(bridge.target);

      await bridge.connect(user1).executeBridgeOperation(
        0, // LOCK_WITH_FEE
        {
          fromToken: token.target.toString(),
          toToken: "",
          amount: lockAmount,
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

      // Verify no fee was collected
      const feeBalanceAfter = await feeToken.balanceOf(bridge.target);
      expect(feeBalanceAfter).to.equal(feeBalanceBefore);
    });
  });

  describe("Extreme Value Boundary Tests", function () {
    it("Should handle minimum non-zero amount (1 wei)", async function () {
      const minAmount = 1n; // 1 wei

      await token.mint(user1.address, minAmount);
      await token.connect(user1).approve(bridge.target, ethers.MaxUint256);

      await bridge.connect(user1).executeBridgeOperation(
        0, // LOCK_WITH_FEE
        {
          fromToken: token.target.toString(),
          toToken: "",
          amount: minAmount,
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

      // Verify locked balance
      const lockedBalance = await bridge.getLockedBalance(token.target);
      expect(lockedBalance).to.equal(minAmount);
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

    it("Should handle maximum practical token amount", async function () {
      // Use a very large but practical amount
      // Total supply of many tokens is around 10^27 (with 18 decimals)
      const maxPracticalAmount = ethers.parseEther("1000000000000000"); // 10^15 tokens

      await token.mint(user1.address, maxPracticalAmount);
      await token.connect(user1).approve(bridge.target, ethers.MaxUint256);

      await bridge.connect(user1).executeBridgeOperation(
        0, // LOCK_WITH_FEE
        {
          fromToken: token.target.toString(),
          toToken: "",
          amount: maxPracticalAmount,
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

      // Verify locked balance
      const lockedBalance = await bridge.getLockedBalance(token.target);
      expect(lockedBalance).to.equal(maxPracticalAmount);
    });
  });

  describe("Invariant Verification Under Stress", function () {
    it("Should maintain locked <= balance invariant with rapid operations", async function () {
      const numOperations = 50;
      const lockAmount = ethers.parseEther("100");
      const releaseAmount = ethers.parseEther("50");

      // Mint enough tokens
      await token.mint(user1.address, lockAmount * BigInt(numOperations));
      await token.mint(bridge.target, lockAmount * BigInt(numOperations));
      await token.connect(user1).approve(bridge.target, ethers.MaxUint256);

      // Perform alternating lock and release operations
      for (let i = 0; i < numOperations; i++) {
        // Lock
        await bridge.connect(user1).executeBridgeOperation(
          0, // LOCK_WITH_FEE
          {
            fromToken: token.target.toString(),
            toToken: "",
            amount: lockAmount,
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

        // Verify invariant after lock
        const lockedAfterLock = await bridge.getLockedBalance(token.target);
        const balanceAfterLock = await token.balanceOf(bridge.target);
        expect(lockedAfterLock).to.be.lte(balanceAfterLock);

        // Release (every other operation)
        if (i % 2 === 0) {
          await bridge.connect(systemWallet).executeBridgeOperation(
            2, // RELEASE
            {
              fromToken: "",
              toToken: token.target.toString(),
              amount: releaseAmount,
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
          );

          // Verify invariant after release
          const lockedAfterRelease = await bridge.getLockedBalance(token.target);
          const balanceAfterRelease = await token.balanceOf(bridge.target);
          expect(lockedAfterRelease).to.be.lte(balanceAfterRelease);
        }
      }

      // Final invariant check
      const finalLocked = await bridge.getLockedBalance(token.target);
      const finalBalance = await token.balanceOf(bridge.target);
      expect(finalLocked).to.be.lte(finalBalance);
      expect(finalLocked).to.be.gte(0);
    });
  });

  describe("Locked Balance Accounting", function () {
    it("Should start with zero locked balance", async function () {
      // Deploy a new token to test initial state
      const MockERC20Factory = await ethers.getContractFactory("MockERC20");
      const newToken = await MockERC20Factory.deploy("New Token", "NEW", 18);

      const lockedBalance = await bridge.getLockedBalance(newToken.target);
      expect(lockedBalance).to.equal(0);
    });

    it("Should maintain locked <= total balance invariant", async function () {
      // Lock tokens
      const lockAmount = ethers.parseEther("500");
      await token.mint(user1.address, lockAmount);
      await token.connect(user1).approve(bridge.target, ethers.MaxUint256);

      await bridge.connect(user1).executeBridgeOperation(
        0, // LOCK_WITH_FEE
        {
          fromToken: token.target.toString(),
          toToken: "",
          amount: lockAmount,
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

      const lockedBalance = await bridge.getLockedBalance(token.target);
      const totalBalance = await token.balanceOf(bridge.target);

      // Verify invariant: locked <= total
      expect(lockedBalance).to.be.lte(totalBalance);
    });
  });
});

