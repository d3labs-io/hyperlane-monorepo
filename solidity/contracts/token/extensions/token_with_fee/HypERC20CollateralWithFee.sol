// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity >=0.8.0;

import {HypERC20Collateral} from "../../HypERC20Collateral.sol";
import {IRouterFeeCollector} from "../../../interfaces/IRouterFeeCollector.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Quote} from "../../../interfaces/ITokenBridge.sol";

contract HypERC20CollateralWithFee is HypERC20Collateral, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Address for address;

    IRouterFeeCollector public feeCollector;

    // Storage gap for upgrade safety
    uint256[49] private __GAP;

    constructor(
        address erc20,
        uint256 _scale,
        address _mailbox
    ) HypERC20Collateral(erc20, _scale, _mailbox) {
        _disableInitializers();
    }

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
