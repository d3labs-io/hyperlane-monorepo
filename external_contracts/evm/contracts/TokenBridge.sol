// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlEnumerableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/extensions/AccessControlEnumerableUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {ERC1967Utils} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {BridgeUserOperations} from "./BridgeUserOperations.sol";
import {BridgeSystemOperations} from "./BridgeSystemOperations.sol";
import {IBridge} from "./interfaces/IBridge.sol";

/// @title TokenBridge
/// @notice Cross-chain token bridge with lock/release/mint/burn mechanism using UUPS upgradeable pattern
/// @dev Implements bidirectional token bridging with security features
/// @dev Inherits from BridgeUserOperations and BridgeSystemOperations for modular functionality
contract TokenBridge is
    Initializable,
    UUPSUpgradeable,
    AccessControlEnumerableUpgradeable,
    BridgeUserOperations,
    BridgeSystemOperations
{
    using SafeERC20 for IERC20;

    // ============ Roles ============

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant SYSTEM_WALLET_ROLE = keccak256("SYSTEM_WALLET_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant OWNER_ROLE = keccak256("OWNER_ROLE");

    // ============ Custom Errors ============
    error NotAdmin();
    error InvalidCaller();

    // ============ State Variables ============ This gonna be deleted in the future, mainnet publish

    /// @notice Optional timelock address that must execute upgrades when set => delete in the future
    address public upgradeTimelock;

    // ============ Upgrade Timelock State ============ ==> delete in the future, just keep to avoid storage layout change in develop env

    /// @notice Upgrade delay period => delete in the future
    uint256 public upgrade_delay;

    /// @notice Pending upgrade proposal
    struct UpgradeProposal {
        address newImplementation;
        uint256 proposalTime;
        address proposer;
        bool exists;
    }

    /// @notice Current pending upgrade proposal
    UpgradeProposal public pendingUpgrade;

    /// @notice Previous implementation address for rollback
    address public previousImplementation;


    // ============ Owner State ============
    /// @notice Pending owner for two-step ownership transfer
    address public pendingOwner;

    // ============ Upgrade Events ============

    /// @notice Emitted when an upgrade is proposed
    event UpgradeProposed(
        address indexed proposer,
        address indexed newImplementation,
        uint256 proposalTime,
        uint256 executeAfter
    );

    /// @notice Emitted when an upgrade is executed
    event UpgradeExecuted(
        address indexed executor,
        address indexed oldImplementation,
        address indexed newImplementation,
        uint256 executionTime
    );

    /// @notice Emitted when an upgrade proposal is cancelled
    event UpgradeCancelled(
        address indexed canceller,
        address indexed proposedImplementation,
        uint256 cancelTime
    );

    /// @notice Emitted when a rollback is executed
    event RollbackExecuted(
        address indexed executor,
        address indexed currentImplementation,
        address indexed previousImplementation,
        uint256 rollbackTime
    );

    // ============ Admin/Owner Events ============

    /// @notice Emitted when ownership transfer is initiated
    event OwnershipTransferInitiated(
        address indexed currentOwner,
        address indexed pendingOwner,
        uint256 timestamp
    );

    /// @notice Emitted when owner is updated
    event OwnerUpdated(
        address indexed oldOwner,
        address indexed newOwner,
        uint256 timestamp
    );

    /// @notice Emitted when an admin is granted
    event AdminGranted(
        address indexed admin,
        address indexed grantedBy,
        uint256 timestamp
    );

    /// @notice Emitted when an admin is revoked
    event AdminRevoked(
        address indexed admin,
        address indexed revokedBy,
        uint256 timestamp
    );

    /// @notice Emitted when a system wallet is granted
    event SystemWalletGranted(
        address indexed wallet,
        address indexed grantedBy,
        uint256 timestamp
    );

    /// @notice Emitted when a system wallet is revoked
    event SystemWalletRevoked(
        address indexed wallet,
        address indexed revokedBy,
        uint256 timestamp
    );

    /// @notice Emitted when contract is paused
    event EmergencyPause(
        address indexed admin,
        string reason,
        uint256 timestamp
    );

    /// @notice Emitted when contract is unpaused
    event EmergencyUnpause(
        address indexed admin,
        string reason,
        uint256 timestamp
    );

    /// @notice Emitted when token fee parameters are updated
    event FeeParamsUpdated(
        address indexed feeToken,
        uint256 feeAmount
    );

    /// @notice Emitted when fee amount parameters are updated
    event FeeAmountUpdated(
        uint256 feeAmount
    );


    /// @notice Emitted when the upgrade delay is updated
    event UpgradeDelayUpdated(uint256 delay);

    /// @notice Emitted when the vault wallet is updated
    event VaultWalletUpdated(address indexed vaultWallet);

    // ============ Constructor ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ============ Initializer ============

    /// @notice Initialize the bridge contract
    /// @param _owner The owner address
    /// @param _systemWallet The system wallet address
    /// @param _feeToken The fee token address
    /// @param _feeAmount The fee amount
    /// @param _currentChainId The current chain identifier (CAIP-2 format)
    function initialize(
        address _owner,
        address _systemWallet,
        address _feeToken,
        uint256 _feeAmount,
        string memory _currentChainId
    ) external initializer {
        if (_owner == address(0)) revert InvalidAddress();
        if (_systemWallet == address(0)) revert InvalidAddress();
        if (_feeToken == address(0)) revert InvalidAddress();
        if (bytes(_currentChainId).length == 0) revert InvalidChainIdentifier();

        __UUPSUpgradeable_init();
        __AccessControlEnumerable_init();
        __Pausable_init();
        __ReentrancyGuard_init();

        // Grant owner roles
        _grantRole(OWNER_ROLE, _owner);
        _grantRole(DEFAULT_ADMIN_ROLE, _owner);
        _grantRole(UPGRADER_ROLE, _owner);

        // Grant SYSTEM_WALLET_ROLE to initial system wallet
        _grantRole(SYSTEM_WALLET_ROLE, _systemWallet);

        // Set fee parameters
        feeToken = _feeToken;
        feeAmount = _feeAmount;
        currentChainId = _currentChainId;
    }

    // ============ Unified Bridge Function ============

    /// @inheritdoc IBridge
    function executeBridgeOperation(
        BridgeOperation operation,
        BridgeData calldata bridgeData
    ) external override {
        if (operation == IBridge.BridgeOperation.LOCK_WITH_FEE) {
            // User operation: lock tokens with fee
            address _fromAddress = _parseAddress(bridgeData.fromAddress);
            if (msg.sender != _fromAddress) revert InvalidCaller();

            // We don't pass the BridgeRefund struct here since it's not used by user operations
            _lockTokensWithFee(bridgeData.fromToken, bridgeData.toToken, bridgeData.amount, bridgeData.transactionId, bridgeData.toNetwork, bridgeData.toAddress, bridgeData.email);
        } else if (operation == IBridge.BridgeOperation.BURN) {
            // User operation: burn tokens
            address _fromAddress = _parseAddress(bridgeData.fromAddress);
            if (msg.sender != _fromAddress) revert InvalidCaller();

            // We don't pass the BridgeRefund struct here since it's not used by user operations
            _burnTokens(bridgeData.fromToken, bridgeData.toToken, bridgeData.amount, 
            bridgeData.transactionId, bridgeData.toNetwork, bridgeData.toAddress, bridgeData.email);
        } else if (operation == IBridge.BridgeOperation.RELEASE) {
            // System wallet operation: release tokens
            _checkRole(SYSTEM_WALLET_ROLE, msg.sender);
            _releaseTokens(bridgeData.fromToken, bridgeData.toToken, bridgeData.amount, bridgeData.toAddress, bridgeData.transactionId, bridgeData.fromNetwork, bridgeData.fromAddress, bridgeData.email, bridgeData.refund);
        } else {
            // operation == IBridge.BridgeOperation.MINT
            // System wallet operation: mint tokens
            _checkRole(SYSTEM_WALLET_ROLE, msg.sender);
            _mintTokens(bridgeData.fromToken, bridgeData.toToken, bridgeData.amount, bridgeData.toAddress, bridgeData.transactionId, bridgeData.fromNetwork, bridgeData.fromAddress, bridgeData.email, bridgeData.refund);
        }
    }

    // ============ Owner Functions ============

    /// @notice Modifier to check if caller is owner
    modifier onlyOwner() {
        _checkRole(OWNER_ROLE);
        _;
    }

    /// @notice Modifier to check if caller is admin or owner
    modifier onlyAdmin() {
        if (!hasRole(ADMIN_ROLE, msg.sender) && !hasRole(OWNER_ROLE, msg.sender)) revert NotAdmin();
        _;
    }

    /// @inheritdoc IBridge
    /// @dev Initiates ownership transfer - requires acceptOwnership() call from new owner
    function updateOwner(address newOwner) external override onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();

        pendingOwner = newOwner;
        emit OwnershipTransferInitiated(msg.sender, newOwner, block.timestamp);
    }

    /// @notice Accept ownership transfer
    /// @dev Can only be called by the pending owner
    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert InvalidCaller();

        // Get current owner (first member with OWNER_ROLE)
        address oldOwner = getRoleMemberCount(OWNER_ROLE) > 0 ? getRoleMember(OWNER_ROLE, 0) : address(0);
        address newOwner = msg.sender;

        // Revoke old owner roles
        _revokeRole(OWNER_ROLE, oldOwner);
        _revokeRole(DEFAULT_ADMIN_ROLE, oldOwner);
        _revokeRole(UPGRADER_ROLE, oldOwner);

        // Grant new owner roles
        _grantRole(OWNER_ROLE, newOwner);
        _grantRole(DEFAULT_ADMIN_ROLE, newOwner);
        _grantRole(UPGRADER_ROLE, newOwner);

        // Clear pending owner
        pendingOwner = address(0);

        emit OwnerUpdated(oldOwner, newOwner, block.timestamp);
    }

    /// @inheritdoc IBridge
    function grantAdmin(address admin) external override onlyAdmin {
        if (admin == address(0)) revert InvalidAddress();
        _grantRole(ADMIN_ROLE, admin);
        emit AdminGranted(admin, msg.sender, block.timestamp);
    }

    /// @inheritdoc IBridge
    function revokeAdmin(address admin) external override onlyOwner {
        if (admin == address(0)) revert InvalidAddress();
        _revokeRole(ADMIN_ROLE, admin);
        emit AdminRevoked(admin, msg.sender, block.timestamp);
    }

    /// @notice Grant SYSTEM_WALLET_ROLE to a new system wallet
    /// @param wallet The address to grant the role
    function grantSystemWallet(address wallet) external onlyAdmin {
        if (wallet == address(0)) revert InvalidAddress();
        _grantRole(SYSTEM_WALLET_ROLE, wallet);
        emit SystemWalletGranted(wallet, msg.sender, block.timestamp);
    }

    /// @notice Revoke SYSTEM_WALLET_ROLE from a system wallet
    /// @param wallet The address to revoke the role
    function revokeSystemWallet(address wallet) external onlyAdmin {
        if (wallet == address(0)) revert InvalidAddress();
        _revokeRole(SYSTEM_WALLET_ROLE, wallet);
        emit SystemWalletRevoked(wallet, msg.sender, block.timestamp);
    }

    /// @inheritdoc IBridge
    function pause(string calldata reason) external override onlyAdmin {
        _pause();
        emit EmergencyPause(msg.sender, reason, block.timestamp);
    }

    /// @inheritdoc IBridge
    function unpause(string calldata reason) external override onlyAdmin {
        _unpause();
        emit EmergencyUnpause(msg.sender, reason, block.timestamp);
    }

    // ============ Admin Functions ============

    /// @inheritdoc IBridge
    function setFee(address _feeToken, uint256 _feeAmount) external override onlyAdmin {
        feeToken = _feeToken;
        feeAmount = _feeAmount;
        emit FeeParamsUpdated(_feeToken, _feeAmount);
    }

    /// @inheritdoc IBridge
    function withdrawTreasury(address token, address recipient) external override onlyAdmin {
        if (token == address(0) || recipient == address(0)) revert InvalidAddress();

        uint256 balance = IERC20(token).balanceOf(address(this));
        uint256 locked = lockedBalances[token];

        // Check if balance is greater than locked to prevent underflow/DoS
        if (balance <= locked) revert InvalidAmount();

        uint256 amount = balance - locked;
        if (amount == 0) revert InvalidAmount();

        IERC20(token).safeTransfer(recipient, amount);
    }

    /// @inheritdoc IBridge
    function setVaultWallet(address _vaultWallet) external override onlyAdmin {
        if (_vaultWallet == address(0)) revert InvalidAddress();
        vaultWallet = _vaultWallet;
        emit VaultWalletUpdated(_vaultWallet);
    }

    // ============ View Functions ============

    /// @inheritdoc IBridge
    function getFeeAmount() external view override returns (uint256) {
        return feeAmount;
    }

    /// @inheritdoc IBridge
    function getFeeToken() external view override returns (address) {
        return feeToken;
    }

    /// @notice Get all system wallet addresses
    /// @return An array of all system wallet addresses
    function getAllSystemWallets() external view returns (address[] memory) {
        uint256 count = getRoleMemberCount(SYSTEM_WALLET_ROLE);
        address[] memory wallets = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            wallets[i] = getRoleMember(SYSTEM_WALLET_ROLE, i);
        }
        return wallets;
    }

    /// @notice Check if an address is a system wallet
    /// @param wallet The address to check
    /// @return True if the address has SYSTEM_WALLET_ROLE
    function isSystemWallet(address wallet) external view returns (bool) {
        return hasRole(SYSTEM_WALLET_ROLE, wallet);
    }

    /// @inheritdoc IBridge
    function getLockedBalance(address token) external view override returns (uint256) {
        return lockedBalances[token];
    }

    /// @inheritdoc IBridge
    function isAdmin(address account) external view override returns (bool) {
        return hasRole(ADMIN_ROLE, account) || hasRole(OWNER_ROLE, account);
    }

    /// @notice Get all admin addresses
    /// @return An array of all admin addresses
    function getAllAdmins() external view returns (address[] memory) {
        uint256 count = getRoleMemberCount(ADMIN_ROLE);
        address[] memory adminList = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            adminList[i] = getRoleMember(ADMIN_ROLE, i);
        }
        return adminList;
    }

    /// @inheritdoc IBridge
    function getOwner() external view override returns (address) {
        // Return the first (and should be only) owner with OWNER_ROLE
        uint256 count = getRoleMemberCount(OWNER_ROLE);
        if (count == 0) return address(0);
        return getRoleMember(OWNER_ROLE, 0);
    }

    /// @notice Check if a transaction ID has been used for an address
    /// @param transactionId The transaction ID to check
    /// @return True if the transaction ID has been used, false otherwise
    function getTransactionIdUsed(string memory transactionId) external view returns (bool) {
        return isTransactionIdUsed(transactionId);
    }

    // ============ UUPS Upgrade Authorization ============

    /// @notice Authorize upgrade (only called by executeUpgrade after timelock)
    /// @dev This is called internally by upgradeToAndCall
    function _authorizeUpgrade(address newImplementation) internal view override onlyRole(UPGRADER_ROLE) {
    }
}

