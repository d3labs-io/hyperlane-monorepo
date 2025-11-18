// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Interface for Transaction ID Tracker
/// @notice Interface for tracking used transaction IDs to prevent replay attacks
interface ITransactionIdTracker {
    // ============ Errors ============
    
    /// @notice Thrown when attempting to use a transaction ID that has already been used
    error TransactionIdAlreadyUsed();

    // ============ Events ============
    
    /// @notice Emitted when a transaction ID is revoked/invalidated
    /// @param owner The address that revoked the transaction ID
    /// @param transactionId The transaction ID that was revoked
    /// @param timestamp The timestamp when the transaction ID was revoked
    event TransactionIdRevoked(
        address indexed owner,
        string transactionId,
        uint256 timestamp
    );

    // ============ Functions ============
    
    /// @notice Check if a specific transaction ID has been used
    /// @param transactionId The transaction ID to check
    /// @return True if transaction ID has been used, false otherwise
    function isTransactionIdUsed(string memory transactionId) external view returns (bool);

    /// @notice Allows users to revoke/invalidate a transaction ID
    /// @param transactionId The transaction ID to revoke
    /// @dev Useful for canceling pending transactions
    function revokeTransactionId(string memory transactionId) external;
}

