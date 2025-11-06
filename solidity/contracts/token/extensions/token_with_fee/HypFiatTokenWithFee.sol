// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity 0.8.22;

import {HypFiatToken} from "../HypFiatToken.sol";
import {IRouterFeeCollector} from "../../../interfaces/IRouterFeeCollector.sol";
import {Quote} from "../../../interfaces/ITokenBridge.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title HypFiatTokenWithFee
 * @notice A Hyperlane token router for fiat tokens (like USDC) that charges fees for cross-chain transfers
 * @dev Extends HypFiatToken to add fee collection functionality. This contract handles cross-chain transfers
 *      of fiat tokens while collecting fees through a designated fee collector contract. The contract uses
 *      the mint/burn pattern for fiat tokens and includes reentrancy protection for secure transfers.
 * @author Hyperlane Team
 */
contract HypFiatTokenWithFee is HypFiatToken, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Address for address;

    /// @notice The fee collector contract that handles fee collection for cross-chain transfers
    /// @dev This contract must implement IRouterFeeCollector interface and use the same token as the wrapped token
    IRouterFeeCollector public feeCollector;

    /// @dev Storage gap for upgrade safety - reserves storage slots for future contract upgrades
    uint256[49] private __GAP;

    /**
     * @notice Constructor for HypFiatTokenWithFee
     * @dev Initializes the contract with fiat token parameters and disables initializers for proxy pattern
     * @param _fiatToken The address of the underlying fiat token (e.g., USDC)
     * @param _scale The scaling factor for token to address cross-chain decimals difference
     * @param _mailbox The address of the Hyperlane mailbox contract for cross-chain messaging
     */
    constructor(
        address _fiatToken,
        uint256 _scale,
        address _mailbox
    ) HypFiatToken(_fiatToken, _scale, _mailbox) {
        _disableInitializers();
    }

    /**
     * @notice Initializes the HypFiatTokenWithFee contract
     * @dev This function is called once during proxy deployment to set up the contract state.
     *      It validates that the fee collector is a contract and uses the same token as the wrapped token.
     * @param _hook The address of the post-dispatch hook for message processing
     * @param _interchainSecurityModule The address of the interchain security module for message verification
     * @param _owner The address that will own this contract and have administrative privileges
     * @param _feeCollector The address of the fee collector contract that implements IRouterFeeCollector
     * @custom:security The fee collector must be a valid contract and must use the same token as the wrapped token
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
            "HypFiatTokenWithFee: fee collector must be a contract"
        );
        feeCollector = IRouterFeeCollector(_feeCollector);
    }

    /**
     * @notice Transfers tokens to a recipient on a remote chain with fee collection
     * @dev This function collects fees before executing the cross-chain transfer. It follows the
     *      Checks-Effects-Interactions pattern by collecting fees first, then executing the transfer.
     *      The function is protected against reentrancy attacks.
     * @param _destination The domain ID of the destination chain
     * @param _recipient The address of the recipient on the destination chain (encoded as bytes32)
     * @param _amountOrId The amount of tokens to transfer (for ERC20) or token ID (for ERC721)
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
            _transferRemote(
                _destination,
                _recipient,
                _amountOrId,
                msg.value
            );
    }

    /**
     * @notice Provides a quote for the total cost of a cross-chain transfer including fees
     * @dev Returns an array of quotes showing the gas payment required and the total token amount
     *      (transfer amount + fee) needed for the cross-chain transfer.
     * @param _destinationDomain The domain ID of the destination chain
     * @param _recipient The address of the recipient on the destination chain (encoded as bytes32)
     * @param _amount The amount of tokens to transfer
     * @return quotes An array containing two quotes:
     *         - quotes[0]: Gas payment required (in native token, address(0))
     *         - quotes[1]: Total token amount needed (transfer amount + fee in wrapped token)
     */
    function quoteTransferRemote(
        uint32 _destinationDomain,
        bytes32 _recipient,
        uint256 _amount
    ) external view virtual override returns (Quote[] memory quotes) {
        uint256 gasPayment = _quoteGasPayment(
            _destinationDomain,
            _recipient,
            _amount
        );
        uint256 fee = feeCollector.quoteFee(_destinationDomain);
        address feeToken = feeCollector.feeTokenAddress();
        address wrappedTokenAddress = address(wrappedToken);

        if (fee == 0) {
            quotes = new Quote[](2);
            quotes[0] = Quote({token: address(0), amount: gasPayment});
            quotes[1] = Quote({token: wrappedTokenAddress, amount: _amount});
        } else if (feeToken == wrappedTokenAddress) {
            quotes = new Quote[](2);
            quotes[0] = Quote({token: address(0), amount: gasPayment});
            quotes[1] = Quote({
                token: wrappedTokenAddress,
                amount: _amount + fee
            });
        } else {
            quotes = new Quote[](3);
            quotes[0] = Quote({token: address(0), amount: gasPayment});
            quotes[1] = Quote({token: wrappedTokenAddress, amount: _amount});
            quotes[2] = Quote({token: feeToken, amount: fee});
        }
    }
}
