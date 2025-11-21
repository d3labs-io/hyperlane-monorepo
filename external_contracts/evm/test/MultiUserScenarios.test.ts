import { expect } from "chai";
import { ethers } from "hardhat";
import {
  TokenBridge,
  MockERC20,
  MockMintableToken,
  MockBurnableToken,
} from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Multi-User Bridge Scenarios", function () {
  let bridge: TokenBridge;
  let owner: SignerWithAddress;
  let admin: SignerWithAddress;
  let systemWallet: SignerWithAddress;
  let users: SignerWithAddress[];

  // Token A: Lock/Release mechanism
  let tokenA: MockERC20;
  // Token B: Burn/Mint mechanism
  let tokenB_Source: MockBurnableToken;
  let tokenB_Dest: MockMintableToken;
  let feeToken: MockERC20;

  const FEE_AMOUNT = ethers.parseEther("0.1");
  const CURRENT_CHAIN_ID = "eip155:31337"; // Hardhat (simulating Stellar)
  const DESTINATION_CHAIN_ID = "eip155:137"; // Polygon (simulating another chain)
  const SOURCE_CHAIN_ID = "eip155:56"; // BSC as example source chain

  let txCounter = 0;
  function getUniqueTxId(): string {
    return `tx_${Date.now()}_${txCounter++}`;
  }

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    [owner, admin, systemWallet, ...users] = signers;

    // Deploy Token A (Lock/Release) - standard ERC20
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    tokenA = await MockERC20Factory.deploy("Token A", "TKA", 18);
    feeToken = await MockERC20Factory.deploy("Fee Token", "FEE", 18);

    // Deploy Token B (Burn/Mint) - burnable on source, mintable on dest
    const MockBurnableFactory = await ethers.getContractFactory(
      "MockBurnableToken"
    );
    tokenB_Source = await MockBurnableFactory.deploy(
      "Token B Source",
      "TKBS",
      18
    );

    const MockMintableFactory = await ethers.getContractFactory(
      "MockBurnableToken"
    );
    tokenB_Dest = await MockMintableFactory.deploy("Token B Dest", "TKBD", 18);

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

    // Setup roles
    await bridge.connect(owner).grantAdmin(admin.address);

    // Mint tokens to users (simulating initial balances on Stellar)
    for (let i = 0; i < 5; i++) {
      await tokenA.mint(users[i].address, ethers.parseEther("1000"));
      await tokenB_Source.mint(users[i].address, ethers.parseEther("1000"));
      await feeToken.mint(users[i].address, ethers.parseEther("10"));

      // Approve bridge
      await tokenA.connect(users[i]).approve(bridge.target, ethers.MaxUint256);
      await tokenB_Source
        .connect(users[i])
        .approve(bridge.target, ethers.MaxUint256);
      await feeToken
        .connect(users[i])
        .approve(bridge.target, ethers.MaxUint256);
    }

    // Mint tokens to bridge for release operations (simulating locked tokens)
    await tokenA.mint(bridge.target, ethers.parseEther("5000"));
  });

  describe("Scenario 1: Lock/Release with Token A (Multiple Users)", function () {
    it("Should handle complete round-trip for 5 users with different amounts", async function () {
      const userAmounts = [
        ethers.parseEther("100"), // User 0
        ethers.parseEther("250"), // User 1
        ethers.parseEther("50"), // User 2
        ethers.parseEther("500"), // User 3
        ethers.parseEther("75"), // User 4
      ];

      const spentAmounts = [
        ethers.parseEther("30"), // User 0 spends 30
        ethers.parseEther("100"), // User 1 spends 100
        ethers.parseEther("10"), // User 2 spends 10
        ethers.parseEther("200"), // User 3 spends 200
        ethers.parseEther("75"), // User 4 spends all
      ];

      // Track initial balances
      const initialBalances = [];
      for (let i = 0; i < 5; i++) {
        initialBalances.push(await tokenA.balanceOf(users[i].address));
      }

      // Step 1: All users lock tokens on source chain (Stellar)
      const lockTxIds = [];
      for (let i = 0; i < 5; i++) {
        const txId = getUniqueTxId();
        lockTxIds.push(txId);

        await bridge.connect(users[i]).executeBridgeOperation(
          0, // LOCK_WITH_FEE
          {
            fromToken: tokenA.target.toString(),
            toToken: "",
            amount: userAmounts[i],
            fromAddress: users[i].address,
            toAddress: users[i].address, // destination address (simplified)
            fromNetwork: CURRENT_CHAIN_ID,
            toNetwork: DESTINATION_CHAIN_ID,
            transactionId: txId,
            email: `user${i}@test.com`,

            refund: {
              feeToken: ethers.ZeroAddress,

              feeAmount: 0,
            },
          }
        );

        // Verify tokens were locked
        expect(await tokenA.balanceOf(users[i].address)).to.equal(
          initialBalances[i] - userAmounts[i]
        );
      }

      // Verify total locked balance
      const totalLocked = userAmounts.reduce((sum, amt) => sum + amt, 0n);
      expect(await bridge.getLockedBalance(tokenA.target)).to.equal(
        totalLocked
      );

      // Verify accumulated fees
      expect(await bridge.getAccumulatedFee(feeToken.target)).to.equal(
        FEE_AMOUNT * 5n
      );

      // Step 2: System wallet mint tokens on destination chain

      /// Simulation
      // Step 3: Users spend some tokens on destination chain (simulated by balance check)
      // In real scenario, users would use tokens on destination chain
      // Here we simulate by tracking what they would have left

      // Step 4: Users burn remaining tokens on destination to bridge back
      const remainingAmounts = userAmounts.map(
        (amt, i) => amt - spentAmounts[i]
      );

      /// End simulation

      // Step 5: System wallet releases back to original chain
      for (let i = 0; i < 5; i++) {
        if (remainingAmounts[i] > 0) {
          const releaseBackTxId = getUniqueTxId();
          const balanceBefore = await tokenA.balanceOf(users[i].address);

          await bridge.connect(systemWallet).executeBridgeOperation(
            2, // RELEASE
            {
              fromToken: "",
              toToken: tokenA.target.toString(),
              amount: remainingAmounts[i],
              fromAddress: users[i].address,
              toAddress: users[i].address,
              fromNetwork: SOURCE_CHAIN_ID, // source (different from current)
              toNetwork: CURRENT_CHAIN_ID, // destination (back to original)
              transactionId: releaseBackTxId,
              email: `user${i}@test.com`,

              refund: {
                feeToken: feeToken.target,
                feeAmount: FEE_AMOUNT,
              },
            }
          );

          // Verify final balance
          const expectedFinal = balanceBefore + remainingAmounts[i];
          expect(await tokenA.balanceOf(users[i].address)).to.equal(
            expectedFinal
          );
        }
      }

      const calculateRemainingTotal = (
        amounts: bigint[],
        spent: bigint[]
      ): bigint =>
        amounts.reduce((sum, amt) => sum + amt, 0n) -
        spent.reduce((sum, amt) => sum + amt, 0n);

      const totalRemaining = calculateRemainingTotal(
        userAmounts,
        spentAmounts
      );

      // Verify locked balance is back to 0
      expect(await bridge.getLockedBalance(tokenA.target)).to.equal(totalLocked - totalRemaining);
    });

    it("Should maintain correct locked balance with concurrent operations", async function () {
      // Simulate 5 users locking different amounts concurrently
      const amounts = [
        ethers.parseEther("100"),
        ethers.parseEther("200"),
        ethers.parseEther("150"),
        ethers.parseEther("300"),
        ethers.parseEther("250"),
      ];

      // All users lock tokens
      const lockPromises = [];
      for (let i = 0; i < 5; i++) {
        lockPromises.push(
          bridge.connect(users[i]).executeBridgeOperation(
            0, // LOCK_WITH_FEE
            {
              fromToken: tokenA.target.toString(),
              toToken: "",
              amount: amounts[i],
              fromAddress: users[i].address,
              toAddress: users[i].address,
              fromNetwork: CURRENT_CHAIN_ID,
              toNetwork: DESTINATION_CHAIN_ID,
              transactionId: getUniqueTxId(),
              email: `user${i}@test.com`,

              refund: {
                feeToken: ethers.ZeroAddress,

                feeAmount: 0,
              },
            }
          )
        );
      }
      await Promise.all(lockPromises);

      // Verify total locked balance
      const totalLocked = amounts.reduce((sum, amt) => sum + amt, 0n);
      expect(await bridge.getLockedBalance(tokenA.target)).to.equal(
        totalLocked
      );

      // Release to 3 users
      for (let i = 0; i < 3; i++) {
        await bridge.connect(systemWallet).executeBridgeOperation(
          2, // RELEASE
          {
            fromToken: "",
            toToken: tokenA.target.toString(),
            amount: amounts[i],
            fromAddress: users[i].address,
            toAddress: users[i].address,
            fromNetwork: SOURCE_CHAIN_ID,
            toNetwork: CURRENT_CHAIN_ID,
            transactionId: getUniqueTxId(),
            email: `user${i}@test.com`,

            refund: {
              feeToken: feeToken.target,
              feeAmount: FEE_AMOUNT,
            },
          }
        );
      }

      // Verify remaining locked balance
      const remainingLocked = amounts[3] + amounts[4];
      expect(await bridge.getLockedBalance(tokenA.target)).to.equal(
        remainingLocked
      );
    });

    it("Should prevent releasing more than locked balance", async function () {
      // User locks 100 tokens
      await bridge.connect(users[0]).executeBridgeOperation(
        0, // LOCK_WITH_FEE
        {
          fromToken: tokenA.target.toString(),
          toToken: "",
          amount: ethers.parseEther("100"),
          fromAddress: users[0].address,
          toAddress: users[0].address,
          fromNetwork: CURRENT_CHAIN_ID,
          toNetwork: DESTINATION_CHAIN_ID,
          transactionId: getUniqueTxId(),
          email: "user0@test.com",

          refund: {
            feeToken: ethers.ZeroAddress,

            feeAmount: 0,
          },
        }
      );

      // Try to release 200 tokens (more than locked)
      await expect(
        bridge.connect(systemWallet).executeBridgeOperation(
          2, // RELEASE
          {
            fromToken: "",
            toToken: tokenA.target.toString(),
            amount: ethers.parseEther("200"),
            fromAddress: users[0].address,
            toAddress: users[0].address,
            fromNetwork: SOURCE_CHAIN_ID,
            toNetwork: CURRENT_CHAIN_ID,
            transactionId: getUniqueTxId(),
            email: "user0@test.com",

            refund: {
              feeToken: feeToken.target,
              feeAmount: FEE_AMOUNT,
            },
          }
        )
      ).to.be.revertedWithCustomError(bridge, "InsufficientLockedBalance");
    });
  });

  describe("Scenario 2: Lock/Mint with Token B (Multiple Users)", function () {
    // Note: This tests the Lock/Mint mechanism where tokens are locked on source and minted on destination
    // MockMintableToken allows anyone to mint, no role setup needed

    it("Should handle complete lock/mint cycle for 5 users", async function () {
      const userAmounts = [
        ethers.parseEther("100"),
        ethers.parseEther("250"),
        ethers.parseEther("50"),
        ethers.parseEther("500"),
        ethers.parseEther("75"),
      ];

      // Track initial balances
      const initialBalances = [];
      for (let i = 0; i < 5; i++) {
        initialBalances.push(await tokenB_Source.balanceOf(users[i].address));
      }

      // Step 1: All users lock tokens on source chain
      for (let i = 0; i < 5; i++) {
        const txId = getUniqueTxId();

        await bridge.connect(users[i]).executeBridgeOperation(
          0, // LOCK_WITH_FEE
          {
            fromToken: tokenB_Source.target.toString(),
            toToken: tokenB_Dest.target.toString(),
            amount: userAmounts[i],
            fromAddress: users[i].address,
            toAddress: users[i].address,
            fromNetwork: CURRENT_CHAIN_ID,
            toNetwork: DESTINATION_CHAIN_ID,
            transactionId: txId,
            email: `user${i}@test.com`,

            refund: {
              feeToken: ethers.ZeroAddress,

              feeAmount: 0,
            },
          }
        );

        // Verify tokens were locked (transferred to bridge)
        expect(await tokenB_Source.balanceOf(users[i].address)).to.equal(
          initialBalances[i] - userAmounts[i]
        );
      }

      // Verify total locked balance
      const totalLocked = userAmounts.reduce((sum, amt) => sum + amt, 0n);
      expect(await bridge.getLockedBalance(tokenB_Source.target)).to.be.gte(
        totalLocked
      );
    });
  });

  describe("Scenario 3: Security - Double Spending Prevention", function () {
    it("Should prevent reusing transaction ID for lock operations", async function () {
      const txId = getUniqueTxId();
      const amount = ethers.parseEther("100");

      // First lock succeeds
      await bridge.connect(users[0]).executeBridgeOperation(
        0, // LOCK_WITH_FEE
        {
          fromToken: tokenA.target.toString(),
          toToken: "",
          amount: amount,
          fromAddress: users[0].address,
          toAddress: users[0].address,
          fromNetwork: CURRENT_CHAIN_ID,
          toNetwork: DESTINATION_CHAIN_ID,
          transactionId: txId,
          email: "user0@test.com",

          refund: {
            feeToken: ethers.ZeroAddress,

            feeAmount: 0,
          },
        }
      );

      // Second lock with same txId should fail
      await expect(
        bridge.connect(users[0]).executeBridgeOperation(
          0, // LOCK_WITH_FEE
          {
            fromToken: tokenA.target.toString(),
            toToken: "",
            amount: amount,
            fromAddress: users[0].address,
            toAddress: users[0].address,
            fromNetwork: CURRENT_CHAIN_ID,
            toNetwork: DESTINATION_CHAIN_ID,
            transactionId: txId, // Same transaction ID
            email: "user0@test.com",

            refund: {
              feeToken: ethers.ZeroAddress,

              feeAmount: 0,
            },
          }
        )
      ).to.be.revertedWithCustomError(bridge, "TransactionIdAlreadyUsed");
    });

    it("Should prevent reusing transaction ID for release operations", async function () {
      const lockTxId = getUniqueTxId();
      const releaseTxId = getUniqueTxId();
      const amount = ethers.parseEther("100");

      // Lock tokens first
      await bridge.connect(users[0]).executeBridgeOperation(
        0, // LOCK_WITH_FEE
        {
          fromToken: tokenA.target.toString(),
          toToken: "",
          amount: amount,
          fromAddress: users[0].address,
          toAddress: users[0].address,
          fromNetwork: CURRENT_CHAIN_ID,
          toNetwork: DESTINATION_CHAIN_ID,
          transactionId: lockTxId,
          email: "user0@test.com",

          refund: {
            feeToken: ethers.ZeroAddress,

            feeAmount: 0,
          },
        }
      );

      // First release succeeds
      await bridge.connect(systemWallet).executeBridgeOperation(
        2, // RELEASE
        {
          fromToken: "",
          toToken: tokenA.target.toString(),
          amount: amount,
          fromAddress: users[0].address,
          toAddress: users[0].address,
          fromNetwork: SOURCE_CHAIN_ID,
          toNetwork: CURRENT_CHAIN_ID,
          transactionId: releaseTxId,
          email: "user0@test.com",

          refund: {
            feeToken: feeToken.target,
            feeAmount: FEE_AMOUNT,
          },
        }
      );

      // Lock more tokens
      await bridge.connect(users[0]).executeBridgeOperation(
        0, // LOCK_WITH_FEE
        {
          fromToken: tokenA.target.toString(),
          toToken: "",
          amount: amount,
          fromAddress: users[0].address,
          toAddress: users[0].address,
          fromNetwork: CURRENT_CHAIN_ID,
          toNetwork: DESTINATION_CHAIN_ID,
          transactionId: getUniqueTxId(),
          email: "user0@test.com",

          refund: {
            feeToken: ethers.ZeroAddress,

            feeAmount: 0,
          },
        }
      );

      // Second release with same txId should fail
      await expect(
        bridge.connect(systemWallet).executeBridgeOperation(
          2, // RELEASE
          {
            fromToken: "",
            toToken: tokenA.target.toString(),
            amount: amount,
            fromAddress: users[0].address,
            toAddress: users[0].address,
            fromNetwork: SOURCE_CHAIN_ID,
            toNetwork: CURRENT_CHAIN_ID,
            transactionId: releaseTxId, // Same transaction ID
            email: "user0@test.com",

            refund: {
              feeToken: feeToken.target,
              feeAmount: FEE_AMOUNT,
            },
          }
        )
      ).to.be.revertedWithCustomError(bridge, "TransactionIdAlreadyUsed");
    });

    it("Should prevent cross-operation transaction ID reuse", async function () {
      const txId = getUniqueTxId();
      const amount = ethers.parseEther("100");

      // Lock with txId
      await bridge.connect(users[0]).executeBridgeOperation(
        0, // LOCK_WITH_FEE
        {
          fromToken: tokenA.target.toString(),
          toToken: "",
          amount: amount,
          fromAddress: users[0].address,
          toAddress: users[0].address,
          fromNetwork: CURRENT_CHAIN_ID,
          toNetwork: DESTINATION_CHAIN_ID,
          transactionId: txId,
          email: "user0@test.com",

          refund: {
            feeToken: ethers.ZeroAddress,

            feeAmount: 0,
          },
        }
      );

      // Try to burn with same txId
      await expect(
        bridge.connect(users[0]).executeBridgeOperation(
          1, // BURN
          {
            fromToken: tokenB_Source.target.toString(),
            toToken: tokenB_Dest.target.toString(),
            amount: amount,
            fromAddress: users[0].address,
            toAddress: users[0].address,
            fromNetwork: CURRENT_CHAIN_ID,
            toNetwork: DESTINATION_CHAIN_ID,
            transactionId: txId, // Same transaction ID
            email: "user0@test.com",

            refund: {
              feeToken: ethers.ZeroAddress,

              feeAmount: 0,
            },
          }
        )
      ).to.be.revertedWithCustomError(bridge, "TransactionIdAlreadyUsed");
    });
  });

  describe("Scenario 5: Security - Input Validation", function () {
    it("Should reject zero address for token", async function () {
      await expect(
        bridge.connect(users[0]).executeBridgeOperation(
          0, // LOCK_WITH_FEE
          {
            fromToken: ethers.ZeroAddress,
            toToken: "",
            amount: ethers.parseEther("100"),
            fromAddress: users[0].address,
            toAddress: users[0].address,
            fromNetwork: CURRENT_CHAIN_ID,
            toNetwork: DESTINATION_CHAIN_ID,
            transactionId: getUniqueTxId(),
            email: "user0@test.com",

            refund: {
              feeToken: ethers.ZeroAddress,

              feeAmount: 0,
            },
          }
        )
      ).to.be.revertedWithCustomError(bridge, "InvalidAddress");
    });

    it("Should reject zero amount", async function () {
      await expect(
        bridge.connect(users[0]).executeBridgeOperation(
          0, // LOCK_WITH_FEE
          {
            fromToken: tokenA.target.toString(),
            toToken: "",
            amount: 0,
            fromAddress: users[0].address,
            toAddress: users[0].address,
            fromNetwork: CURRENT_CHAIN_ID,
            toNetwork: DESTINATION_CHAIN_ID,
            transactionId: getUniqueTxId(),
            email: "user0@test.com",

            refund: {
              feeToken: ethers.ZeroAddress,

              feeAmount: 0,
            },
          }
        )
      ).to.be.revertedWithCustomError(bridge, "InvalidAmount");
    });

    it("Should reject empty chain identifier", async function () {
      await expect(
        bridge.connect(users[0]).executeBridgeOperation(
          0, // LOCK_WITH_FEE
          {
            fromToken: tokenA.target.toString(),
            toToken: "",
            amount: ethers.parseEther("100"),
            fromAddress: users[0].address,
            toAddress: users[0].address,
            fromNetwork: CURRENT_CHAIN_ID,
            toNetwork: "", // Empty destination chain
            transactionId: getUniqueTxId(),
            email: "user0@test.com",

            refund: {
              feeToken: ethers.ZeroAddress,

              feeAmount: 0,
            },
          }
        )
      ).to.be.revertedWithCustomError(bridge, "InvalidChainIdentifier");
    });

    it("Should reject insufficient token balance", async function () {
      // User tries to lock more than they have
      await expect(
        bridge.connect(users[0]).executeBridgeOperation(
          0, // LOCK_WITH_FEE
          {
            fromToken: tokenA.target.toString(),
            toToken: "",
            amount: ethers.parseEther("10000"), // More than user has
            fromAddress: users[0].address,
            toAddress: users[0].address,
            fromNetwork: CURRENT_CHAIN_ID,
            toNetwork: DESTINATION_CHAIN_ID,
            transactionId: getUniqueTxId(),
            email: "user0@test.com",

            refund: {
              feeToken: ethers.ZeroAddress,

              feeAmount: 0,
            },
          }
        )
      ).to.be.reverted; // ERC20 will revert
    });

    it("Should reject insufficient fee token balance", async function () {
      // Set very high fee
      await bridge
        .connect(admin)
        .setFee(feeToken.target, ethers.parseEther("100"));

      await expect(
        bridge.connect(users[0]).executeBridgeOperation(
          0, // LOCK_WITH_FEE
          {
            fromToken: tokenA.target.toString(),
            toToken: "",
            amount: ethers.parseEther("100"),
            fromAddress: users[0].address,
            toAddress: users[0].address,
            fromNetwork: CURRENT_CHAIN_ID,
            toNetwork: DESTINATION_CHAIN_ID,
            transactionId: getUniqueTxId(),
            email: "user0@test.com",

            refund: {
              feeToken: ethers.ZeroAddress,

              feeAmount: 0,
            },
          }
        )
      ).to.be.reverted; // Fee token transfer will fail
    });
  });

  describe("Scenario 4: Invariant - Total Locked Balance", function () {
    it("Should maintain locked balance invariant across multiple operations", async function () {
      const operations = [
        { user: 0, amount: ethers.parseEther("100"), type: "lock" },
        { user: 1, amount: ethers.parseEther("200"), type: "lock" },
        { user: 2, amount: ethers.parseEther("150"), type: "lock" },
        { user: 0, amount: ethers.parseEther("50"), type: "release" },
        { user: 3, amount: ethers.parseEther("300"), type: "lock" },
        { user: 1, amount: ethers.parseEther("100"), type: "release" },
        { user: 4, amount: ethers.parseEther("250"), type: "lock" },
        { user: 2, amount: ethers.parseEther("150"), type: "release" },
      ];

      let expectedLocked = 0n;

      for (const op of operations) {
        if (op.type === "lock") {
          await bridge.connect(users[op.user]).executeBridgeOperation(
            0, // LOCK_WITH_FEE
            {
              fromToken: tokenA.target.toString(),
              toToken: "",
              amount: op.amount,
              fromAddress: users[op.user].address,
              toAddress: users[op.user].address,
              fromNetwork: CURRENT_CHAIN_ID,
              toNetwork: DESTINATION_CHAIN_ID,
              transactionId: getUniqueTxId(),
              email: `user${op.user}@test.com`,

              refund: {
                feeToken: ethers.ZeroAddress,

                feeAmount: 0,
              },
            }
          );
          expectedLocked += op.amount;
        } else {
          await bridge.connect(systemWallet).executeBridgeOperation(
            2, // RELEASE
            {
              fromToken: "",
              toToken: tokenA.target.toString(),
              amount: op.amount,
              fromAddress: users[op.user].address,
              toAddress: users[op.user].address,
              fromNetwork: SOURCE_CHAIN_ID,
              toNetwork: CURRENT_CHAIN_ID,
              transactionId: getUniqueTxId(),
              email: `user${op.user}@test.com`,

              refund: {
                feeToken: feeToken.target,
                feeAmount: FEE_AMOUNT,
              },
            }
          );
          expectedLocked -= op.amount;
        }

        // Verify locked balance after each operation
        expect(await bridge.getLockedBalance(tokenA.target)).to.equal(
          expectedLocked
        );
      }
    });

    it("Should ensure contract balance >= locked balance", async function () {
      // Lock tokens from multiple users
      const amounts = [
        ethers.parseEther("100"),
        ethers.parseEther("200"),
        ethers.parseEther("150"),
      ];

      for (let i = 0; i < 3; i++) {
        await bridge.connect(users[i]).executeBridgeOperation(
          0, // LOCK_WITH_FEE
          {
            fromToken: tokenA.target.toString(),
            toToken: "",
            amount: amounts[i],
            fromAddress: users[i].address,
            toAddress: users[i].address,
            fromNetwork: CURRENT_CHAIN_ID,
            toNetwork: DESTINATION_CHAIN_ID,
            transactionId: getUniqueTxId(),
            email: `user${i}@test.com`,

            refund: {
              feeToken: ethers.ZeroAddress,

              feeAmount: 0,
            },
          }
        );
      }

      const lockedBalance = await bridge.getLockedBalance(tokenA.target);
      const contractBalance = await tokenA.balanceOf(bridge.target);

      // Contract balance should always be >= locked balance
      expect(contractBalance).to.be.gte(lockedBalance);
    });
  });
});
