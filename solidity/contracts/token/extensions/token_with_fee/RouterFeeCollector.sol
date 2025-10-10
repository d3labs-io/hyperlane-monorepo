// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IRouterFeeCollector} from "../../../interfaces/IRouterFeeCollector.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {PackageVersioned} from "../../../PackageVersioned.sol";

/**
 * @title RouterFeeCollector
 * @notice An ownable contract for collecting and managing ERC20 token fees
 * @dev This contract allows the owner to collect fees from various ERC20 tokens
 */
contract RouterFeeCollector is Ownable, IRouterFeeCollector, PackageVersioned {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.UintSet;

    /// @notice Constant public address that can only be set during construction
    address public immutable FEE_TOKEN_ADDRESS;

    bool public isActive;

    address public beneficiary;

    /// @notice Maximum fee amount - expect fee in USD. USDT and USDC are both 6 decimals token. The max reasonable fee is 10 USD
    uint256 public immutable MAX_FEE;

    /// @notice Mapping of destination chain ID to fee amount
    mapping(uint32 destinationId => uint256 fee) private routerFees;

    /// @notice Set of configured destination IDs
    EnumerableSet.UintSet private configuredDestinations;

    /// @notice Emitted when fees are claimed
    event FeesClaimed(address indexed beneficiary, uint256 amount);

    /// @notice Emitted when a fee is set for a destination chain
    event FeeSet(uint32 indexed destinationId, uint256 fee);

    /// @notice Emitted when a fee is removed for a destination chain
    event FeeRemoved(uint32 indexed destinationId);

    /// @notice Emitted when the beneficiary address is changed
    event BeneficiarySet(
        address indexed oldBeneficiary,
        address indexed newBeneficiary
    );

    /// @notice Emitted when the active status is changed
    event IsActive(bool isActive);

    /**
     * @notice Constructor that sets the initial owner and constant address
     * @param _owner The address that will be set as the initial owner
     * @param _feeTokenAddress The fee token address that can only be set during construction
     */
    constructor(address _owner, address _feeTokenAddress) {
        require(
            _owner != address(0),
            "RouterFeeCollector: owner cannot be zero address"
        );
        require(
            Address.isContract(_feeTokenAddress),
            "RouterFeeCollector: fee token address must be a contract"
        );

        FEE_TOKEN_ADDRESS = _feeTokenAddress;
        MAX_FEE = 10_000_000; 
        beneficiary = _owner;
        isActive = true;
        _transferOwnership(_owner);
    }

    /**
     * @notice Get the constant fee token address
     * @return The fee token address
     */
    function feeTokenAddress() external view returns (address) {
        return FEE_TOKEN_ADDRESS;
    }

    /**
     * @notice Get the maximum fee amount
     * @return The maximum fee amount
     */
    function maxFee() external view returns (uint256) {
        return MAX_FEE;
    }

    /**
     * @notice Get the fee for a specific destination chain
     * @param destinationId The chain ID of the destination
     * @return The fee amount for the destination chain
     */
    function quoteFee(uint32 destinationId) external view returns (uint256) {
        if (!isActive) {
            return 0;
        }
        require(
            configuredDestinations.contains(destinationId),
            "RouterFeeCollector: destination not configured"
        );
        return routerFees[destinationId];
    }

    /**
     * @notice Set the fee for a specific destination chain
     * @param destinationId The chain ID of the destination
     * @param fee The fee amount to set for the destination chain
     */
    function setFee(uint32 destinationId, uint256 fee) external onlyOwner {
        require(fee <= MAX_FEE, "RouterFeeCollector: fee too high");
        routerFees[destinationId] = fee;
        configuredDestinations.add(destinationId);
        emit FeeSet(destinationId, fee);
    }

    /**
     * @notice Set the beneficiary address
     * @param _beneficiary The new beneficiary address
     * @dev Only the owner can call this function and beneficiary cannot be address zero
     */
    function setBeneficiary(address _beneficiary) external onlyOwner {
        require(
            _beneficiary != address(0),
            "RouterFeeCollector: beneficiary cannot be zero address"
        );
        address oldBeneficiary = beneficiary;
        beneficiary = _beneficiary;
        emit BeneficiarySet(oldBeneficiary, _beneficiary);
    }

    /**
     * @notice Get the total unclaimed balance of the erc20 token
     * @return The balance of the specified token
     */
    function getBalance() external view returns (uint256) {
        return IERC20(FEE_TOKEN_ADDRESS).balanceOf(address(this));
    }

    /**
     * @notice Remove a destination from the configured destinations
     * @param destinationId The chain ID of the destination to remove
     */
    function removeFee(uint32 destinationId) external onlyOwner {
        require(
            configuredDestinations.contains(destinationId),
            "RouterFeeCollector: destination not configured"
        );
        configuredDestinations.remove(destinationId);
        delete routerFees[destinationId];
        emit FeeRemoved(destinationId);
    }

    /**
     * @notice Get all configured destination IDs
     * @return Array of configured destination IDs
     */
    function getConfiguredDestinations()
        external
        view
        returns (uint32[] memory)
    {
        uint256[] memory values = configuredDestinations.values();
        uint32[] memory destinations = new uint32[](values.length);
        for (uint256 i = 0; i < values.length; i++) {
            destinations[i] = uint32(values[i]);
        }
        return destinations;
    }

    /**
     * @notice Check if a destination is configured
     * @param destinationId The chain ID to check
     * @return True if the destination is configured, false otherwise
     */
    function isDestinationConfigured(
        uint32 destinationId
    ) external view returns (bool) {
        return configuredDestinations.contains(destinationId);
    }

    /**
     * @notice Set the active status of the fee collector
     * @param _isActive The new active status
     * @dev Only callable by the owner
     */
    function setIsActive(bool _isActive) external onlyOwner {
        isActive = _isActive;
        emit IsActive(_isActive);
    }

    /**
     * @notice Claims all collected fees and transfers them to the beneficiary
     * @dev Only callable by the owner or beneficiary. Transfers the entire balance of this contract to the beneficiary
     */
    function claim() external {
        require(
            msg.sender == owner() || msg.sender == beneficiary,
            "Only owner or beneficiary can claim"
        );
        uint256 balance = IERC20(FEE_TOKEN_ADDRESS).balanceOf(address(this));
        require(balance > 0, "No fees to claim");
        IERC20(FEE_TOKEN_ADDRESS).safeTransfer(beneficiary, balance);
        emit FeesClaimed(beneficiary, balance);
    }
}
