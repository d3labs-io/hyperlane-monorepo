// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {BridgeStorage} from "./BridgeStorage.sol";
import {IERC20Burnable} from "./interfaces/IERC20Burnable.sol";
import {IBridge} from "./interfaces/IBridge.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title BridgeUserOperations
/// @notice Internal contract handling user-facing bridge operations (lock and burn)
/// @dev Contains only internal functions to be inherited by the master TokenBridge contract
abstract contract BridgeUserOperations is BridgeStorage {
    using SafeERC20 for IERC20;

    // ============ Internal User Functions ============
    /// @notice Internal function to lock tokens with fee payment
    /// @dev Locks tokens in the bridge contract and emits Operation event for off-chain processing
    /// @param fromToken The token address to perform for user (hex string format)
    /// @param toToken The token address to perform by system wallet (hex string format)
    /// @param amount The amount to lock
    /// @param transactionId Unique transaction identifier to prevent replay attacks
    /// @param destinationChainIdentifier The destination chain identifier (CAIP-2 format)
    /// @param destinationAddress The destination address on destination chain (hex string format)
    /// @param email User email for notification purposes
    /// @custom:security Uses nonReentrant modifier and follows CEI pattern
    /// @custom:security Transaction ID is marked as used before external calls
    /// @custom:security Locked balances updated before token transfers
    function _lockTokensWithFee(
        string memory fromToken,
        string memory toToken,
        uint256 amount,
        string memory transactionId,
        string memory destinationChainIdentifier,
        string memory destinationAddress,
        string memory email
    ) internal whenNotPaused nonReentrant {
        address _token = _parseAddress(fromToken);
        if (_token == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();

        // Validate destination chain identifier format (CAIP-2)
        _validateChainId(destinationChainIdentifier);

        // Check and mark transaction ID as used BEFORE external calls
        _useTransactionId(transactionId);

        // Update locked balances BEFORE external calls
        lockedBalances[_token] += amount;

        // Collect fee first if fee is set
        if (feeToken != address(0) && feeAmount > 0 && vaultWallet != address(0)) {
            IERC20(feeToken).safeTransferFrom(
                msg.sender,
                address(this),
                feeAmount
            );
            emit FeeCollected(msg.sender, feeToken, feeAmount);
        }

        // Transfer tokens from user to contract
        IERC20(_token).safeTransferFrom(msg.sender, address(this), amount);

        // Emit event
        emit Operation(
            IBridge.BridgeOperation.LOCK_WITH_FEE,
            fromToken,
            toToken,
            amount,
            feeAmount,
            Strings.toHexString(msg.sender),
            destinationAddress,
            currentChainId,
            destinationChainIdentifier,
            transactionId,
            email,
            msg.sender,
            feeToken
        );
    }

    /// @notice Internal function to burn tokens for bridging back to another chain
    /// @dev Burns tokens from user's balance and emits Operation event for off-chain processing
    /// @param fromToken The token address to perform for user (hex string format)
    /// @param toToken The token address to perform by system wallet (hex string format)
    /// @param amount The amount to burn
    /// @param transactionId Unique transaction identifier to prevent replay attacks
    /// @param destinationChainIdentifier The destination chain identifier (CAIP-2 format)
    /// @param destinationAddress The destination address on destination chain (hex string format)
    /// @param email User email for notification purposes
    /// @custom:security Uses nonReentrant modifier and follows CEI pattern
    /// @custom:security Transaction ID is marked as used before external calls
    /// @custom:security Requires token to implement IERC20Burnable interface
    function _burnTokens(
        string memory fromToken,
        string memory toToken,
        uint256 amount,
        string memory transactionId,
        string memory destinationChainIdentifier,
        string memory destinationAddress,
        string memory email
    ) internal whenNotPaused nonReentrant {
        address _token = _parseAddress(fromToken);
        if (_token == address(0)) revert InvalidAddress();
        // Note: msg.sender can never be address(0) by Ethereum protocol design
        if (amount == 0) revert InvalidAmount();

        // Validate destination chain identifier format (CAIP-2)
        _validateChainId(destinationChainIdentifier);

        // Check and mark transaction ID as used BEFORE external calls
        _useTransactionId(transactionId);

        // Burn the tokens using the burnable interface
        IERC20Burnable(_token).burnFrom(msg.sender, amount);

        // Emit event
        emit Operation(
            IBridge.BridgeOperation.BURN,
            fromToken,
            toToken,
            amount,
            0,
            Strings.toHexString(msg.sender),
            destinationAddress,
            currentChainId,
            destinationChainIdentifier,
            transactionId,
            email,
            msg.sender,
            address(0)
        );
    }
}
