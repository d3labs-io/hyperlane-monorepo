// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ITransactionIdTracker} from "./interfaces/ITransactionIdTracker.sol";

/// @title Transaction ID Tracker
/// @notice Contract state and methods for tracking used transaction IDs
/// @dev Uses simple mapping to track used transaction IDs, preventing replay attacks
abstract contract TransactionIdTracker is ITransactionIdTracker {
    /// @notice Mapping of owner to transaction ID to usage status
    /// @dev transactionIds[owner][transactionId] = true if used, false otherwise
    mapping(string transactionId => bool used) public transactionIds;

    /// @notice Consume a transaction ID, reverting if it has already been used
    /// @param transactionId string, the unique transaction identifier
    /// @dev Marks the transaction ID as used and reverts if already used
    function _useTransactionId(string memory transactionId) internal {
        if (transactionIds[transactionId]) {
            revert TransactionIdAlreadyUsed();
        }
        transactionIds[transactionId] = true;
    }

    /// @inheritdoc ITransactionIdTracker
    /// @notice Allows users to revoke/invalidate a transaction ID
    /// @param transactionId The transaction ID to revoke
    /// @dev Useful for canceling pending transactions
    function revokeTransactionId(string memory transactionId) external {
        _useTransactionId(transactionId);
        emit TransactionIdRevoked(msg.sender, transactionId, block.timestamp);
    }

    /// @inheritdoc ITransactionIdTracker
    /// @notice Check if a specific transaction ID has been used
    /// @param transactionId The transaction ID to check
    /// @return True if transaction ID has been used, false otherwise
    function isTransactionIdUsed(string memory transactionId) public view returns (bool) {
        return transactionIds[transactionId];
    }
}

