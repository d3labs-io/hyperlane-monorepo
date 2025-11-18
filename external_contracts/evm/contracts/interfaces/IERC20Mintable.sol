// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title IERC20Mintable
/// @notice Interface for ERC20 tokens that support minting
/// @dev Extends standard IERC20 with mint functionality
interface IERC20Mintable is IERC20 {
    /// @notice Mint new tokens to an address
    /// @param to The address to mint tokens to
    /// @param amount The amount of tokens to mint
    function mint(address to, uint256 amount) external;
}

