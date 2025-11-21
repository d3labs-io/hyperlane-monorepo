import { expect } from "chai";
import { ethers } from "hardhat";
import { TokenBridge, MockERC20, MockMintableToken, MockBurnableToken } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Core Bridge Functionality Tests", function () {
  let bridge: TokenBridge;
  let owner: SignerWithAddress;
  let admin: SignerWithAddress;
  let systemWallet: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  
  let lockReleaseToken: MockERC20;
  let burnMintToken_Source: MockBurnableToken;
  let burnMintToken_Dest: MockMintableToken;
  let feeToken: MockERC20;

  const FEE_AMOUNT = ethers.parseEther("0.1");
  const CURRENT_CHAIN_ID = "eip155:31337";
  const DESTINATION_CHAIN_ID = "eip155:137";
  const SOURCE_CHAIN_ID = "eip155:56";

  let txCounter = 0;
  function getUniqueTxId(): string {
    return `tx_${Date.now()}_${txCounter++}`;
  }

  beforeEach(async function () {
    [owner, admin, systemWallet, user1, user2] = await ethers.getSigners();

    // Deploy tokens
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    lockReleaseToken = await MockERC20Factory.deploy("Lock/Release Token", "LRT", 18);
    feeToken = await MockERC20Factory.deploy("Fee Token", "FEE", 18);

    const MockBurnableFactory = await ethers.getContractFactory("MockBurnableToken");
    burnMintToken_Source = await MockBurnableFactory.deploy("Burn Token", "BRNT", 18);

    const MockMintableFactory = await ethers.getContractFactory("MockMintableToken");
    burnMintToken_Dest = await MockMintableFactory.deploy("Mint Token", "MNTT", 18);

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

    // Setup roles and vault
    await bridge.connect(owner).grantAdmin(admin.address);

    // Mint tokens to users
    await lockReleaseToken.mint(user1.address, ethers.parseEther("1000"));
    await lockReleaseToken.mint(user2.address, ethers.parseEther("1000"));
    await burnMintToken_Source.mint(user1.address, ethers.parseEther("1000"));
    await burnMintToken_Source.mint(user2.address, ethers.parseEther("1000"));
    await feeToken.mint(user1.address, ethers.parseEther("10"));
    await feeToken.mint(user2.address, ethers.parseEther("10"));

    // Mint tokens to bridge for release operations
    await lockReleaseToken.mint(bridge.target, ethers.parseEther("5000"));

    // Approve bridge
    await lockReleaseToken.connect(user1).approve(bridge.target, ethers.MaxUint256);
    await lockReleaseToken.connect(user2).approve(bridge.target, ethers.MaxUint256);
    await burnMintToken_Source.connect(user1).approve(bridge.target, ethers.MaxUint256);
    await burnMintToken_Source.connect(user2).approve(bridge.target, ethers.MaxUint256);
    await feeToken.connect(user1).approve(bridge.target, ethers.MaxUint256);
    await feeToken.connect(user2).approve(bridge.target, ethers.MaxUint256);

    // Note: MockMintableToken allows anyone to mint, no role setup needed
  });

  describe("Lock/Release Mechanism", function () {
    it("Should lock tokens and update locked balance", async function () {
      const amount = ethers.parseEther("100");
      const balanceBefore = await lockReleaseToken.balanceOf(user1.address);

      await bridge.connect(user1).executeBridgeOperation(
        0, // LOCK_WITH_FEE
        {
          fromToken: lockReleaseToken.target.toString(),
          toToken: "",
          amount: amount,
          fromAddress: user1.address,
          toAddress: user1.address,
          fromNetwork: CURRENT_CHAIN_ID,
          toNetwork: DESTINATION_CHAIN_ID,
          transactionId: getUniqueTxId(),
          email: "user1@test.com",
          refund: {
            feeToken: feeToken.target.toString(),
            feeAmount: FEE_AMOUNT
          }
        }
      );

      expect(await lockReleaseToken.balanceOf(user1.address)).to.equal(balanceBefore - amount);
      expect(await bridge.getLockedBalance(lockReleaseToken.target)).to.equal(amount);
      expect(await lockReleaseToken.balanceOf(bridge.target)).to.be.gte(amount);
    });

    it("Should collect fee when locking tokens", async function () {
      const amount = ethers.parseEther("100");
      const adminBalanceBefore = await feeToken.balanceOf(admin.address);
      const userFeeBalanceBefore = await feeToken.balanceOf(user1.address);

      await bridge.connect(user1).executeBridgeOperation(
        0, // LOCK_WITH_FEE
        {
          fromToken: lockReleaseToken.target.toString(),
          toToken: "",
          amount: amount,
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

      // Admin should be able to withdraw fees to their wallet
      await bridge.connect(admin).withdrawTreasury(feeToken.target, admin.address);

      expect(await feeToken.balanceOf(admin.address)).to.equal(adminBalanceBefore + FEE_AMOUNT);
      expect(await feeToken.balanceOf(user1.address)).to.equal(userFeeBalanceBefore - FEE_AMOUNT);
    });

    it("Should release tokens and decrease locked balance", async function () {
      const amount = ethers.parseEther("100");

      // Lock first
      await bridge.connect(user1).executeBridgeOperation(
        0, // LOCK_WITH_FEE
        {
          fromToken: lockReleaseToken.target.toString(),
          toToken: "",
          amount: amount,
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

      const lockedBefore = await bridge.getLockedBalance(lockReleaseToken.target);
      const balanceBefore = await lockReleaseToken.balanceOf(user2.address);
      let accumulated_fee = await bridge.getAccumulatedFee(feeToken.target);
      expect(accumulated_fee).to.equal(FEE_AMOUNT);

      // Release to user2
      await bridge.connect(systemWallet).executeBridgeOperation(
        2, // RELEASE
        {
          fromToken: "",
          toToken: lockReleaseToken.target.toString(),
          amount: amount,
          fromAddress: user1.address,
          toAddress: user2.address,
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

      expect(await lockReleaseToken.balanceOf(user2.address)).to.equal(balanceBefore + amount);
      expect(await bridge.getLockedBalance(lockReleaseToken.target)).to.equal(lockedBefore - amount);
      accumulated_fee = await bridge.getAccumulatedFee(feeToken.target);
      expect(accumulated_fee).to.equal(0);
    });

    it("Should prevent releasing more than locked balance", async function () {
      const lockAmount = ethers.parseEther("100");
      const releaseAmount = ethers.parseEther("200");

      // Lock 100
      await bridge.connect(user1).executeBridgeOperation(
        0, // LOCK_WITH_FEE
        {
          fromToken: lockReleaseToken.target.toString(),
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

      // Try to release 200
      await expect(
        bridge.connect(systemWallet).executeBridgeOperation(
          2, // RELEASE
          {
            fromToken: "",
            toToken: lockReleaseToken.target.toString(),
            amount: releaseAmount,
            fromAddress: user1.address,
            toAddress: user2.address,
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

    it("Should emit Operation event on lock", async function () {
      const amount = ethers.parseEther("100");
      const txId = getUniqueTxId();

      await expect(
        bridge.connect(user1).executeBridgeOperation(
          0, // LOCK_WITH_FEE
          {
            fromToken: lockReleaseToken.target.toString(),
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
      ).to.emit(bridge, "Operation");
    });

    it("Should emit Operation event on release", async function () {
      const amount = ethers.parseEther("100");

      // Lock first
      await bridge.connect(user1).executeBridgeOperation(
        0, // LOCK_WITH_FEE
        {
          fromToken: lockReleaseToken.target.toString(),
          toToken: "",
          amount: amount,
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
      await expect(
        bridge.connect(systemWallet).executeBridgeOperation(
          2, // RELEASE
          {
            fromToken: "",
            toToken: lockReleaseToken.target.toString(),
            amount: amount,
            fromAddress: user1.address,
            toAddress: user2.address,
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
      ).to.emit(bridge, "Operation");
    });
  });

  describe("Burn/Mint Mechanism", function () {
    it("Should burn tokens from user", async function () {
      const amount = ethers.parseEther("100");
      const balanceBefore = await burnMintToken_Source.balanceOf(user1.address);

      await bridge.connect(user1).executeBridgeOperation(
        1, // BURN
        {
          fromToken: burnMintToken_Source.target.toString(),
          toToken: "",
          amount: amount,
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

      expect(await burnMintToken_Source.balanceOf(user1.address)).to.equal(balanceBefore - amount);
      const accumulated_fee = await bridge.getAccumulatedFee(feeToken.target);
      expect(accumulated_fee).to.equal(FEE_AMOUNT);
    });

    it("Should mint tokens to user", async function () {
      const amount = ethers.parseEther("100");
      const balanceBefore = await burnMintToken_Dest.balanceOf(user2.address);

      await bridge.connect(systemWallet).executeBridgeOperation(
        3, // MINT
        {
          fromToken: "",
          toToken: burnMintToken_Dest.target.toString(),
          amount: amount,
          fromAddress: user1.address,
          toAddress: user2.address,
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

      expect(await burnMintToken_Dest.balanceOf(user2.address)).to.equal(balanceBefore + amount);
    });

    it("Should emit Operation event on burn", async function () {
      const amount = ethers.parseEther("100");
      const txId = getUniqueTxId();

      await expect(
        bridge.connect(user1).executeBridgeOperation(
          1, // BURN
          {
            fromToken: burnMintToken_Source.target.toString(),
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
      ).to.emit(bridge, "Operation");
    });

    it("Should emit Operation event on mint", async function () {
      const amount = ethers.parseEther("100");
      const txId = getUniqueTxId();

      await expect(
        bridge.connect(systemWallet).executeBridgeOperation(
          3, // MINT
          {
            fromToken: "",
            toToken: burnMintToken_Dest.target.toString(),
            amount: amount,
            fromAddress: user1.address,
            toAddress: user2.address,
            fromNetwork: SOURCE_CHAIN_ID,
            toNetwork: CURRENT_CHAIN_ID,
            transactionId: txId,
            email: "user1@test.com",

            refund: {
              feeToken: ethers.ZeroAddress,
              feeAmount: 0
            }
          }
        )
      ).to.emit(bridge, "Operation");
    });
  });
});
