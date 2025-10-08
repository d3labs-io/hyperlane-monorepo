// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity >=0.8.0;

import {HypFiatToken} from "../HypFiatToken.sol";
import {IRouterFeeCollector} from "../../../interfaces/IRouterFeeCollector.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract HypFiatTokenWithFee is HypFiatToken, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Address for address;

    IRouterFeeCollector public feeCollector;

    // Storage gap for upgrade safety
    uint256[49] private __GAP;

    constructor(
        address _fiatToken,
        uint256 _scale,
        address _mailbox
    ) HypFiatToken(_fiatToken, _scale, _mailbox) {
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
            "HypFiatTokenWithFee: fee collector must be a contract"
        );
        feeCollector = IRouterFeeCollector(_feeCollector);
        require(
            address(wrappedToken) == feeCollector.feeTokenAddress(),
            "HypFiatTokenWithFee: fiat token must match fee collector's fee token"
        );
    }

    function transferRemote(
        uint32 _destination,
        bytes32 _recipient,
        uint256 _amountOrId
    ) external payable override nonReentrant returns (bytes32 messageId) {
        uint256 transferFee = feeCollector.quoteFee(_destination);
        // Collect fee first (Checks-Effects-Interactions pattern) - only if fee > 0
        if (transferFee > 0) {
            IERC20(wrappedToken).safeTransferFrom(
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
}
