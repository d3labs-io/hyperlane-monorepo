// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity >=0.8.0;

/*@@@@@@@       @@@@@@@@@
 @@@@@@@@@       @@@@@@@@@
  @@@@@@@@@       @@@@@@@@@
   @@@@@@@@@       @@@@@@@@@
    @@@@@@@@@@@@@@@@@@@@@@@@@
     @@@@@  HYPERLANE  @@@@@@@
    @@@@@@@@@@@@@@@@@@@@@@@@@
   @@@@@@@@@       @@@@@@@@@
  @@@@@@@@@       @@@@@@@@@
 @@@@@@@@@       @@@@@@@@@
@@@@@@@@@       @@@@@@@@*/

// ============ Internal Imports ============
import {Message} from "../libs/Message.sol";
import {StandardHookMetadata} from "./libs/StandardHookMetadata.sol";
import {AbstractPostDispatchHook} from "./libs/AbstractPostDispatchHook.sol";
import {IPostDispatchHook} from "../interfaces/hooks/IPostDispatchHook.sol";

// ============ External Imports ============
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/**
 * @title SenderWhitelistHook
 * @notice Only whitelisted sender can use the bridge. Useful for zero-gas chain. E.g. sender will be router address
 */
contract SenderWhitelistHook is AbstractPostDispatchHook, Ownable {
    using StandardHookMetadata for bytes;
    using Address for address payable;
    using Message for bytes;
    using EnumerableSet for EnumerableSet.AddressSet;

    // ============ Events ============

    /// @notice Emitted when an address is added to the whitelist
    event AddedToWhitelist(address indexed account);

    /// @notice Emitted when an address is removed from the whitelist
    event RemovedFromWhitelist(address indexed account);

    // ============ Storage ============

    /// @notice Set of whitelisted sender addresses
    EnumerableSet.AddressSet private _whitelist;

    // ============ Constructor ============

    constructor(address _owner) {
        _transferOwnership(_owner);
    }

    // ============ External Functions ============

    /// @inheritdoc IPostDispatchHook
    function hookType() external pure override returns (uint8) {
        return uint8(IPostDispatchHook.Types.PROTOCOL_FEE);
    }

    /**
     * @notice Add an address to the whitelist
     * @param _address The address to add to the whitelist
     */
    function addToWhitelist(address _address) external onlyOwner {
        require(_whitelist.add(_address), "Already whitelisted");
        emit AddedToWhitelist(_address);
    }

    /**
     * @notice Remove an address from the whitelist
     * @param _address The address to remove from the whitelist
     */
    function removeFromWhitelist(address _address) external onlyOwner {
        require(_whitelist.remove(_address), "Not whitelisted");
        emit RemovedFromWhitelist(_address);
    }

    /**
     * @notice Check if an address is whitelisted
     * @param _address The address to check
     * @return bool True if the address is whitelisted, false otherwise
     */
    function isWhitelisted(address _address) external view returns (bool) {
        return _whitelist.contains(_address);
    }

    /**
     * @notice Returns all whitelisted addresses
     */
    function getWhitelist() external view returns (address[] memory) {
        return _whitelist.values();
    }

    // ============ Internal Functions ============

    /// @inheritdoc AbstractPostDispatchHook
    function _postDispatch(
        bytes calldata,
        bytes calldata message
    ) internal view override {
        require(
            _whitelist.contains(message.senderAddress()),
            "SenderWhitelistHook: sender not whitelisted"
        );
    }

    /// @inheritdoc AbstractPostDispatchHook
    function _quoteDispatch(
        bytes calldata,
        bytes calldata message
    ) internal view override returns (uint256) {
        require(
            _whitelist.contains(message.senderAddress()),
            "SenderWhitelistHook: sender not whitelisted"
        );
        return 0;
    }
}
