// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title IERC20Burnable
/// @notice Interface for ERC20 tokens that support burning
/// @dev Extends standard IERC20 with burn functionality
interface IERC20Burnable is IERC20 {
    /// @notice Burn tokens from an address
    /// @param from The address to burn tokens from
    /// @param amount The amount of tokens to burn
    function burnFrom(address from, uint256 amount) external;
}

