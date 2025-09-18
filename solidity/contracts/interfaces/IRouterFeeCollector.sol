// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity >=0.8.0;

/**
 * @title IRouterFeeCollector
 * @notice Interface for RouterFeeCollector contract
 * @dev Interface for collecting and managing ERC20 token fees
 */
interface IRouterFeeCollector {
    /**
     * @notice Get the constant fee token address
     * @return The fee token address
     */
    function feeTokenAddress() external view returns (address);

    /**
     * @notice Get the fee for a specific destination chain
     * @param destinationId The chain ID of the destination
     * @return The fee amount for the destination chain
     */
    function quoteFee(uint32 destinationId) external view returns (uint256);
}
