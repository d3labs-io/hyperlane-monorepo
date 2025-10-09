// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity 0.8.22;

import {HypERC20Collateral} from "../../HypERC20Collateral.sol";
import {IRouterFeeCollector} from "../../../interfaces/IRouterFeeCollector.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Quote} from "../../../interfaces/ITokenBridge.sol";

/**
 * @title HypERC20CollateralWithFee
 * @notice A Hyperlane token router for ERC20 collateral tokens that charges fees for cross-chain transfers
 * @dev Extends HypERC20Collateral to add fee collection functionality. This contract handles cross-chain transfers
 *      of ERC20 tokens while collecting fees through a designated fee collector contract. The contract uses
 *      a collateral model where tokens are locked on the source chain and includes reentrancy protection.
 *      The fee can be collected in a different token than the collateral token being transferred.
 * @author Hyperlane Team
 */
contract HypERC20CollateralWithFee is HypERC20Collateral, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Address for address;

    /// @notice The fee collector contract that handles fee collection for cross-chain transfers
    /// @dev This contract must implement IRouterFeeCollector interface and can use any ERC20 token for fees
    IRouterFeeCollector public feeCollector;

    /// @dev Storage gap for upgrade safety - reserves storage slots for future contract upgrades
    uint256[49] private __GAP;

    /**
     * @notice Constructor for HypERC20CollateralWithFee
     * @dev Initializes the contract with ERC20 collateral parameters and disables initializers for proxy pattern
     * @param erc20 The address of the underlying ERC20 token to be used as collateral
     * @param _scale The scaling factor for token to address cross-chain decimals difference
     * @param _mailbox The address of the Hyperlane mailbox contract for cross-chain messaging
     */
    constructor(
        address erc20,
        uint256 _scale,
        address _mailbox
    ) HypERC20Collateral(erc20, _scale, _mailbox) {
        _disableInitializers();
    }

    /**
     * @notice Initializes the HypERC20CollateralWithFee contract
     * @dev This function is called once during proxy deployment to set up the contract state.
     *      It validates that the fee collector is a contract but does not require it to use the same
     *      token as the collateral token, allowing for flexible fee collection in different tokens.
     * @param _hook The address of the post-dispatch hook for message processing
     * @param _interchainSecurityModule The address of the interchain security module for message verification
     * @param _owner The address that will own this contract and have administrative privileges
     * @param _feeCollector The address of the fee collector contract that implements IRouterFeeCollector
     * @custom:security The fee collector must be a valid contract address
     */
    function initialize(
        address _hook,
        address _interchainSecurityModule,
        address _owner,
        address _feeCollector
    ) public virtual initializer {
        _MailboxClient_initialize(_hook, _interchainSecurityModule, _owner);
        require(
            Address.isContract(_feeCollector),
            "HypERC20CollateralWithFee: fee collector must be a contract"
        );
        feeCollector = IRouterFeeCollector(_feeCollector);
    }

    /**
     * @notice Transfers collateral tokens to a recipient on a remote chain with fee collection
     * @dev This function collects fees in the fee token before executing the cross-chain transfer.
     *      It follows the Checks-Effects-Interactions pattern by collecting fees first, then executing
     *      the transfer. The function is protected against reentrancy attacks. The fee token can be
     *      different from the collateral token being transferred.
     * @param _destination The domain ID of the destination chain
     * @param _recipient The address of the recipient on the destination chain (encoded as bytes32)
     * @param _amountOrId The amount of collateral tokens to transfer
     * @return messageId The unique identifier of the cross-chain message
     * @custom:security This function is protected against reentrancy and collects fees before transfer
     */
    function transferRemote(
        uint32 _destination,
        bytes32 _recipient,
        uint256 _amountOrId
    ) external payable override nonReentrant returns (bytes32 messageId) {
        uint256 transferFee = feeCollector.quoteFee(_destination);

        // Collect fee first (Checks-Effects-Interactions pattern) - only if fee > 0
        if (transferFee > 0) {
            IERC20(feeCollector.feeTokenAddress()).safeTransferFrom(
                msg.sender,
                address(feeCollector),
                transferFee
            );
        }

        return
            _transferRemote(_destination, _recipient, _amountOrId, msg.value);
    }
    
    /**
     * @notice Provides a quote for the total cost of a cross-chain transfer including fees
     * @dev Returns an array of quotes showing the gas payment required, the collateral token amount,
     *      and the fee amount in the fee token. This allows users to understand all costs before
     *      executing a transfer, including when the fee token differs from the collateral token.
     * @param _destinationDomain The domain ID of the destination chain
     * @param _recipient The address of the recipient on the destination chain (encoded as bytes32)
     * @param _amount The amount of collateral tokens to transfer
     * @return quotes An array containing three quotes:
     *         - quotes[0]: Gas payment required (in native token, address(0))
     *         - quotes[1]: Collateral token amount needed (in wrapped token)
     *         - quotes[2]: Fee amount required (in fee collector's fee token)
     */
    function quoteTransferRemote(
        uint32 _destinationDomain,
        bytes32 _recipient,
        uint256 _amount
    ) external view virtual override returns (Quote[] memory quotes) {
        quotes = new Quote[](3);
        quotes[0] = Quote({
            token: address(0),
            amount: _quoteGasPayment(_destinationDomain, _recipient, _amount)
        });
        quotes[1] = Quote({token: address(wrappedToken), amount: _amount});
        quotes[2] = Quote({token: feeCollector.feeTokenAddress(), amount: feeCollector.quoteFee(_destinationDomain)});
    }
}
