import { expect } from "chai";
import { ethers } from "hardhat";
import { TokenBridge, MockERC20 } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("AccessControl", function () {
  let bridge: TokenBridge;
  let owner: SignerWithAddress;
  let admin1: SignerWithAddress;
  let admin2: SignerWithAddress;
  let systemWallet: SignerWithAddress;
  let user: SignerWithAddress;
  let token: MockERC20;

  let DEFAULT_ADMIN_ROLE: string;
  let SYSTEM_WALLET_ROLE: string;
  let OWNER_ROLE: string;
  let UPGRADER_ROLE: string;

  beforeEach(async function () {
    [owner, admin1, admin2, systemWallet, user] = await ethers.getSigners();

    // Deploy mock token
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    token = await MockERC20Factory.deploy("Test Token", "TEST", 18);

    // Deploy bridge
    const TokenBridgeFactory = await ethers.getContractFactory("TokenBridge");
    const bridgeImpl = await TokenBridgeFactory.deploy();

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

    // Get role constants
    DEFAULT_ADMIN_ROLE = await bridge.DEFAULT_ADMIN_ROLE();
    SYSTEM_WALLET_ROLE = await bridge.SYSTEM_WALLET_ROLE();
    OWNER_ROLE = await bridge.OWNER_ROLE();
    UPGRADER_ROLE = await bridge.UPGRADER_ROLE();
  });

  describe("Role Assignment", function () {
    it("Should assign OWNER_ROLE to owner on initialization", async function () {
      expect(await bridge.hasRole(OWNER_ROLE, owner.address)).to.be.true;
    });

    it("Should assign DEFAULT_ADMIN_ROLE to owner on initialization", async function () {
      expect(await bridge.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
    });

    it("Should assign UPGRADER_ROLE to owner on initialization", async function () {
      expect(await bridge.hasRole(UPGRADER_ROLE, owner.address)).to.be.true;
    });

    it("Should assign SYSTEM_WALLET_ROLE to system wallet on initialization", async function () {
      expect(await bridge.hasRole(SYSTEM_WALLET_ROLE, systemWallet.address)).to.be.true;
    });

    it("Should set owner address correctly", async function () {
      expect(await bridge.getOwner()).to.equal(owner.address);
    });

    it("Should allow owner to grant admin", async function () {
      await bridge.connect(owner).grantAdmin(admin1.address);
      expect(await bridge.isAdmin(admin1.address)).to.be.true;
    });

    it("Should allow owner to revoke admin", async function () {
      await bridge.connect(owner).grantAdmin(admin1.address);
      expect(await bridge.isAdmin(admin1.address)).to.be.true;

      await bridge.connect(owner).revokeAdmin(admin1.address);
      expect(await bridge.isAdmin(admin1.address)).to.be.false;
    });

    it("Should not allow non-owner to grant admin", async function () {
      await expect(
        bridge.connect(user).grantAdmin(admin1.address)
      ).to.be.reverted;
    });

    it("Should not allow non-owner to revoke admin", async function () {
      await bridge.connect(owner).grantAdmin(admin1.address);

      await expect(
        bridge.connect(user).revokeAdmin(admin1.address)
      ).to.be.reverted;
    });

    it("Should consider owner as admin", async function () {
      expect(await bridge.isAdmin(owner.address)).to.be.true;
    });
  });

  describe("Role-Based Function Restrictions", function () {
    beforeEach(async function () {
      await bridge.connect(owner).grantAdmin(admin1.address);
    });

    it("Should only allow admin to pause", async function () {
      await expect(bridge.connect(user).pause("test pause")).to.be.revertedWithCustomError(bridge, "NotAdmin");

      await expect(bridge.connect(admin1).pause("test pause")).to.not.be.reverted;
    });

    it("Should allow owner to pause (owner is also admin)", async function () {
      await expect(bridge.connect(owner).pause("test pause")).to.not.be.reverted;
    });

    it("Should only allow admin to unpause", async function () {
      await bridge.connect(admin1).pause("test pause");

      await expect(bridge.connect(user).unpause("test unpause")).to.be.revertedWithCustomError(bridge, "NotAdmin");
      await expect(bridge.connect(admin1).unpause("test unpause")).to.not.be.reverted;
    });

    it("Should only allow admin to update system wallet", async function () {
      const newSystemWallet = user.address;

      await expect(
        bridge.connect(user).grantSystemWallet(newSystemWallet)
      ).to.be.revertedWithCustomError(bridge, "NotAdmin");

      await expect(
        bridge.connect(admin1).grantSystemWallet(newSystemWallet)
      ).to.not.be.reverted;
    });

    it("Should only allow admin to set fee", async function () {
      const newToken = await (await ethers.getContractFactory("MockERC20")).deploy("Fee", "FEE", 18);

      await expect(
        bridge.connect(user).setFee(newToken.target, ethers.parseUnits("1", 6))
      ).to.be.revertedWithCustomError(bridge, "NotAdmin");

      await expect(
        bridge.connect(admin1).setFee(newToken.target, ethers.parseUnits("1", 6))
      ).to.not.be.reverted;
    });

    it("Should only allow admin to withdraw treasury", async function () {
      await token.mint(bridge.target, ethers.parseEther("100"));

      await expect(
        bridge.connect(user).withdrawTreasury(token.target, user.address)
      ).to.be.revertedWithCustomError(bridge, "NotAdmin");

      await expect(
        bridge.connect(admin1).withdrawTreasury(token.target, admin1.address)
      ).to.not.be.reverted;
    });
  });

  describe("Owner Functions", function () {
    it("Should only allow owner to update owner", async function () {
      await expect(
        bridge.connect(user).updateOwner(user.address)
      ).to.be.reverted;

      await expect(
        bridge.connect(admin1).updateOwner(admin1.address)
      ).to.be.reverted;

      // Owner initiates transfer
      await expect(
        bridge.connect(owner).updateOwner(user.address)
      ).to.not.be.reverted;

      // Owner should still be the same until new owner accepts
      expect(await bridge.getOwner()).to.equal(owner.address);
      expect(await bridge.pendingOwner()).to.equal(user.address);

      // New owner accepts ownership
      await expect(
        bridge.connect(user).acceptOwnership()
      ).to.not.be.reverted;

      // Now owner should be updated
      expect(await bridge.getOwner()).to.equal(user.address);
    });
  });

  describe("Admin Management", function () {
    it("Should support multiple admins", async function () {
      await bridge.connect(owner).grantAdmin(admin1.address);
      await bridge.connect(owner).grantAdmin(admin2.address);

      expect(await bridge.isAdmin(admin1.address)).to.be.true;
      expect(await bridge.isAdmin(admin2.address)).to.be.true;

      // Both admins should be able to perform admin functions
      await expect(
        bridge.connect(admin1).pause("test pause")
      ).to.not.be.reverted;

      await expect(
        bridge.connect(admin2).unpause("test unpause")
      ).to.not.be.reverted;
    });

    it("Should emit AdminGranted event", async function () {
      const tx = await bridge.connect(owner).grantAdmin(admin1.address);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);

      await expect(tx)
        .to.emit(bridge, "AdminGranted")
        .withArgs(admin1.address, owner.address, block!.timestamp);
    });

    it("Should emit AdminRevoked event", async function () {
      await bridge.connect(owner).grantAdmin(admin1.address);

      const tx = await bridge.connect(owner).revokeAdmin(admin1.address);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);

      await expect(tx)
        .to.emit(bridge, "AdminRevoked")
        .withArgs(admin1.address, owner.address, block!.timestamp);
    });
  });

  describe("Admin Function Input Validation", function () {
    it("Should revert grantAdmin() when admin is address(0)", async function () {
      await expect(
        bridge.connect(owner).grantAdmin(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(bridge, "InvalidAddress");
    });

    it("Should revert revokeAdmin() when admin is address(0)", async function () {
      await expect(
        bridge.connect(owner).revokeAdmin(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(bridge, "InvalidAddress");
    });

    it("Should revert grantSystemWallet() when wallet is address(0)", async function () {
      await bridge.connect(owner).grantAdmin(admin1.address);

      await expect(
        bridge.connect(admin1).grantSystemWallet(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(bridge, "InvalidAddress");
    });

    it("Should revert setVaultWallet() when wallet is address(0)", async function () {
      await bridge.connect(owner).grantAdmin(admin1.address);

      await expect(
        bridge.connect(admin1).setVaultWallet(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(bridge, "InvalidAddress");
    });

    it("Should revert updateOwner() when newOwner is address(0)", async function () {
      await expect(
        bridge.connect(owner).updateOwner(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(bridge, "InvalidAddress");
    });
  });
});

