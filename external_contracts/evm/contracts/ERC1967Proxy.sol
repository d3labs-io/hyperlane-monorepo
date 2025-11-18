// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @title BridgeProxy
/// @notice Simple proxy contract that delegates all calls to an implementation contract
/// @dev Inherits from OpenZeppelin's ERC1967Proxy
contract BridgeProxy is ERC1967Proxy {
    /// @notice Constructor for the proxy
    /// @param implementation The address of the implementation contract
    /// @param _data The initialization data to be passed to the implementation
    constructor(address implementation, bytes memory _data) ERC1967Proxy(implementation, _data) {}
}

