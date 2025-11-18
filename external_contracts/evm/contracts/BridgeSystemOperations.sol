// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {BridgeStorage} from "./BridgeStorage.sol";
import {IERC20Mintable} from "./interfaces/IERC20Mintable.sol";
import {IBridge} from "./interfaces/IBridge.sol";

/// @title BridgeSystemOperations
/// @notice Internal contract handling system wallet operations (mint and release)
/// @dev Contains only internal functions to be inherited by the master TokenBridge contract
abstract contract BridgeSystemOperations is BridgeStorage {
    using SafeERC20 for IERC20;

    // ============ Internal System Functions ============

    /// @notice Internal function to release locked tokens to a recipient
    /// @dev Releases previously locked tokens and transfers them to the recipient
    /// @param fromToken The token address to perform on another chain to bridge (hex string format)
    /// @param toToken The token address to perform on this chain (hex string format)
    /// @param amount The amount to release
    /// @param recipient The recipient address (hex string format)
    /// @param transactionId The transaction ID from the lock transaction on source chain
    /// @param sourceChainId The source chain identifier (CAIP-2 format)
    /// @param sourceAddress The source address on source chain (hex string format)
    /// @param email User email for notification purposes
    function _releaseTokens(
        string memory fromToken,
        string memory toToken,
        uint256 amount,
        string memory recipient,
        string memory transactionId,
        string memory sourceChainId,
        string memory sourceAddress,
        string memory email,
        IBridge.BridgeRefund memory refund
    ) internal whenNotPaused nonReentrant {
        address _token = _parseAddress(toToken);
        if (_token == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();

        // Validate source chain identifier format (CAIP-2)
        _validateChainId(sourceChainId);

        if (lockedBalances[_token] < amount) revert InsufficientLockedBalance();

        address _recipient = _parseAddress(recipient);

        // Check and mark transaction ID as used BEFORE external calls
        _useTransactionId(transactionId);

        // Update locked balances
        lockedBalances[_token] -= amount;

        // Transfer tokens from contract to recipient
        IERC20(_token).safeTransfer(_recipient, amount);

        if (refund.feeToken != address(0) && refund.feeAmount != 0){
            // Refund fee to user
            IERC20(refund.feeToken).safeTransfer(_recipient, refund.feeAmount);

            emit FeeRefunded(_recipient, refund.feeToken, refund.feeAmount);
        }

        // Emit event
        emit Operation(
            IBridge.BridgeOperation.RELEASE,
            fromToken,
            toToken,
            amount,
            0,
            sourceAddress,
            recipient,
            sourceChainId,
            currentChainId,
            transactionId,
            email,
            msg.sender,
            address(0)
        );
    }

    /// @notice Internal function to mint tokens to a recipient
    /// @dev Mints new tokens to the recipient (requires bridge to have minting privileges)
    /// @param fromToken The token address to perform on another chain to bridge (hex string format)
    /// @param toToken The token address to perform on this chain (hex string format)
    /// @param amount The amount to mint
    /// @param recipient The recipient address (hex string format)
    /// @param transactionId The transaction ID from the lock transaction on source chain
    /// @param sourceChainId The source chain identifier (CAIP-2 format)
    /// @param sourceAddress The source address on source chain (hex string format)
    /// @param email User email for notification purposes
    function _mintTokens(
        string memory fromToken,
        string memory toToken,
        uint256 amount,
        string memory recipient,
        string memory transactionId,
        string memory sourceChainId,
        string memory sourceAddress,
        string memory email,
        IBridge.BridgeRefund memory refund
    ) internal whenNotPaused nonReentrant {
        address _token = _parseAddress(toToken);
        if (_token == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();

        // Validate source chain identifier format (CAIP-2)
        _validateChainId(sourceChainId);

        address _recipient = _parseAddress(recipient);

        // Check and mark transaction ID as used BEFORE external calls
        _useTransactionId(transactionId);

        // Mint tokens to the recipient using the mintable interface
        // The bridge contract must have minting privileges on the token contract
        IERC20Mintable(_token).mint(_recipient, amount);

        if (refund.feeToken != address(0) && refund.feeAmount != 0){
            // Refund fee to user
            IERC20(refund.feeToken).safeTransfer(_recipient, refund.feeAmount);

            // Emit event for refunding
            emit FeeRefunded(_recipient, refund.feeToken, refund.feeAmount);
        }

        // Emit event
        emit Operation(
            IBridge.BridgeOperation.MINT,
            fromToken,
            toToken,
            amount,
            0,
            sourceAddress,
            recipient,
            sourceChainId,
            currentChainId,
            transactionId,
            email,
            msg.sender,
            address(0)
        );
    }
}
