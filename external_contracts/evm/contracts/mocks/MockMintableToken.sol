// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20Mintable} from "../interfaces/IERC20Mintable.sol";

/// @title MockMintableToken
/// @notice Mock ERC20 token with minting and burning capability for testing
contract MockMintableToken is ERC20, IERC20Mintable {
    uint8 private _decimals;

    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals_
    ) ERC20(name, symbol) {
        _decimals = decimals_;
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    /// @notice Mint tokens to an address
    /// @param to The address to mint to
    /// @param amount The amount to mint
    function mint(address to, uint256 amount) external override {
        _mint(to, amount);
    }

    /// @notice Burn tokens from an address (for testing burn operations)
    /// @param from The address to burn from
    /// @param amount The amount to burn
    function burnFrom(address from, uint256 amount) external {
        _spendAllowance(from, msg.sender, amount);
        _burn(from, amount);
    }
}

