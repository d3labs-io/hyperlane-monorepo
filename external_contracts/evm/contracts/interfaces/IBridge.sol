// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Interface for Token Bridge
/// @notice Interface for cross-chain token bridge with lock/release mechanism
interface IBridge {
    // ============ Operation Types ============

    /// @notice Enum for bridge operation types
    enum BridgeOperation {
        LOCK_WITH_FEE,  // Lock tokens with fee (user operation) // 0
        BURN,           // Burn tokens (user operation) // 1
        RELEASE,        // Release tokens (system wallet operation) // 2
        MINT            // Mint tokens (system wallet operation) // 3
    }

    /// @notice Struct for bridge operation data
    struct BridgeData {
        string fromToken;
        string toToken;
        uint256 amount;
        string fromAddress;
        string toAddress;
        string fromNetwork;
        string toNetwork;
        string transactionId;
        string email;
        BridgeRefund refund;
    }
    /// @notice Struct for bridge refund data, for user interaction leave this as zero values
    struct BridgeRefund {
        address feeToken;
        uint256 feeAmount;
    }

    // ============ Events (declared in TokenBridge) ============
    // Events are declared in the implementation contract to avoid duplication

    // ============ Errors (declared in TokenBridge) ============
    // Errors are declared in the implementation contract to avoid duplication

    // ============ Unified Bridge Function ============

    /// @notice Execute a bridge operation
    /// @param operation The type of bridge operation to perform
    /// @param bridgeData The bridge operation data
    function executeBridgeOperation(
        BridgeOperation operation,
        BridgeData calldata bridgeData
    ) external;

    // ============ Admin Functions ============

    /// @notice Grant SYSTEM_WALLET_ROLE to a new system wallet
    /// @param wallet The address to grant the role
    function grantSystemWallet(address wallet) external;

    /// @notice Revoke SYSTEM_WALLET_ROLE from a system wallet
    /// @param wallet The address to revoke the role
    function revokeSystemWallet(address wallet) external;

    /// @notice Set the fee token address
    /// @param feeToken The fee token address
    /// @param feeAmount The fee amount
    function setFee(address feeToken, uint256 feeAmount) external;

    /// @notice Withdraw collected fees to treasury
    /// @param token The token address to withdraw
    function withdrawTreasury(address token, address recipient) external;

    /// @notice Pause the contract
    /// @param reason The reason for pausing the contract
    function pause(string calldata reason) external;

    /// @notice Unpause the contract
    /// @param reason The reason for unpausing the contract
    function unpause(string calldata reason) external;

    // ============ Owner Functions ============

    /// @notice Update the owner address (initiates two-step transfer)
    /// @param newOwner The new owner address
    function updateOwner(address newOwner) external;

    /// @notice Accept ownership transfer
    /// @dev Can only be called by the pending owner
    function acceptOwnership() external;

    /// @notice Grant admin role to an address
    /// @param admin The address to grant admin role
    function grantAdmin(address admin) external;

    /// @notice Revoke admin role from an address
    /// @param admin The address to revoke admin role
    function revokeAdmin(address admin) external;

    // ============ View Functions ============

    /// @notice Get the fee amount
    /// @return The current fee amount
    function getFeeAmount() external view returns (uint256);

    /// @notice Get the fee token address
    /// @return The current fee token address
    function getFeeToken() external view returns (address);

    /// @notice Get all system wallet addresses
    /// @return An array of all system wallet addresses
    function getAllSystemWallets() external view returns (address[] memory);

    /// @notice Check if an address is a system wallet
    /// @param wallet The address to check
    /// @return True if the address has SYSTEM_WALLET_ROLE
    function isSystemWallet(address wallet) external view returns (bool);

    /// @notice Get the locked balance for a token
    /// @param token The token address
    /// @return The locked balance
    function getLockedBalance(address token) external view returns (uint256);

    /// @notice Check if an address is an admin
    /// @param account The address to check
    /// @return True if the address is an admin, false otherwise
    function isAdmin(address account) external view returns (bool);

    /// @notice Get all admin addresses
    /// @return An array of all admin addresses
    function getAllAdmins() external view returns (address[] memory);

    /// @notice Get the owner address
    /// @return The current owner address
    function getOwner() external view returns (address);
}

