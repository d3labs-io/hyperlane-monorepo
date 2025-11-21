// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {TransactionIdTracker} from "./TransactionIdTracker.sol";
import { IBridge } from "./interfaces/IBridge.sol";

/// @title BridgeStorage
/// @notice Shared storage contract for bridge operations
/// @dev Contains all shared state variables, events, and errors used by both user and system operations
abstract contract BridgeStorage is 
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    TransactionIdTracker,
    IBridge
{
    // ============ Errors ============
    error InvalidAddress();
    error InvalidAddressLength();
    error InvalidHexCharacter();
    error InvalidAmount();
    error UnsupportedToken();
    error UnsupportedChain();
    error InvalidChainIdentifier();
    error InvalidReleaseOnSameChain();
    error InsufficientLockedBalance();
    error InvalidSourceChain();
    error InvalidRefund();
    error FeeUnderflow();
    error AmountUnderflow();

    // ============ Events ============
    
    /// @notice Emitted when user locks tokens to bridge to another chain
    event Operation(
        IBridge.BridgeOperation operation,
        string fromToken,
        string toToken,
        uint256 amount,
        uint256 feeAmount,
        string fromAddress,
        string toAddress,
        string fromNetwork,
        string toNetwork,
        string transactionId,
        string email,
        address sender,
        address feeToken
    );

    /// @notice Emitted when fee is collected
    event FeeCollected(
        address indexed from,
        address indexed feeToken,
        uint256 feeAmount
    );

    /// @notice
    event FeeRefunded(
        address indexed to,
        address indexed feeToken,
        uint256 feeAmount
    );

    // ============ State Variables ============

    /// @notice The fee token address for gas fee payment
    address internal feeToken;

    /// @notice The fee amount per transaction
    uint256 internal feeAmount;

    /// @notice Mapping of token address to locked balance
    mapping(address token => uint256 balance) internal lockedBalances;

    /// @notice Current chain identifier (CAIP-2 format: namespace:reference)
    string internal currentChainId;

    /// @notice Mapping of token address to accumulated fee
    mapping(address tokenAddr => uint256 accumulatedFee) internal accumulatedFees;

    // ============ Owner State ============
    /// @notice Pending owner for two-step ownership transfer
    address public pendingOwner;

    // ============ Internal Helper Functions ============

    /// @notice Validate chain identifier format (CAIP-2: namespace:reference)
    /// @dev Checks that the chain ID contains a colon separator
    /// @param chainId The chain identifier to validate
    /// @custom:security Reverts with InvalidChainIdentifier if format is invalid
    function _validateChainId(string memory chainId) internal pure {
        bytes memory b = bytes(chainId);
        if (b.length == 0) revert InvalidChainIdentifier();

        // Check for colon separator (CAIP-2 format: namespace:reference)
        bool hasColon = false;
        for (uint i = 0; i < b.length; i++) {
            if (b[i] == ':') {
                hasColon = true;
                break;
            }
        }
        if (!hasColon) revert InvalidChainIdentifier();
    }

    /// @notice Parse hex string to address
    /// @dev Supports both 0x-prefixed (42 chars) and non-prefixed (40 chars) formats
    /// @param hexString The hex string to parse (with or without 0x prefix)
    /// @return The parsed Ethereum address
    /// @custom:security Reverts on invalid length or non-hex characters
    function _parseAddress(string memory hexString) internal pure returns (address) {
        bytes memory stringBytes = bytes(hexString);
        // require(stringBytes.length == 42 || stringBytes.length == 40, "Invalid address length");
        if(stringBytes.length != 42 && stringBytes.length != 40) {
            revert InvalidAddressLength();
        }

        uint160 result = 0;
        uint160 b;

        // Start index: skip "0x" if present
        uint startIndex = stringBytes.length == 42 ? 2 : 0;

        for (uint i = startIndex; i < stringBytes.length; i++) {
            b = uint160(uint8(stringBytes[i]));

            if (b >= 48 && b <= 57) {
                // 0-9
                b -= 48;
            } else if (b >= 65 && b <= 70) {
                // A-F
                b -= 55;
            } else if (b >= 97 && b <= 102) {
                // a-f
                b -= 87;
            } else {
                revert InvalidHexCharacter();
            }

            result = result * 16 + b;
        }

        return address(result);
    }
}

