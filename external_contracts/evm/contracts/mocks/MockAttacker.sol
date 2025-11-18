// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IBridge} from "../interfaces/IBridge.sol";

interface ITokenBridge {
    function executeBridgeOperation(
        IBridge.BridgeOperation operation,
        IBridge.BridgeData calldata bridgeData
    ) external;
}

/// @title MaliciousToken
/// @notice Malicious ERC20 token that attempts reentrancy during transfer operations
contract MaliciousToken is ERC20 {
    ITokenBridge public bridge;
    bool public attackEnabled;
    uint256 public attackCount;
    AttackType public attackType;
    
    enum AttackType {
        NONE,
        LOCK_TOKENS,
        LOCK_WITH_FEE,
        RELEASE_TOKENS,
        DRAIN_BALANCE
    }

    // Attack parameters
    address public attackRecipient;
    string public attackDestinationChain;
    string public attackSourceChain;
    string public attackTransactionIdPrefix;

    constructor(
        string memory name,
        string memory symbol
    ) ERC20(name, symbol) {}

    function setBridge(address _bridge) external {
        bridge = ITokenBridge(_bridge);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function enableAttack(AttackType _type) external {
        attackEnabled = true;
        attackType = _type;
        attackCount = 0;
    }

    function disableAttack() external {
        attackEnabled = false;
        attackCount = 0;
    }

    function setAttackParams(
        address _recipient,
        string memory _destChain,
        string memory _sourceChain,
        string memory _txIdPrefix
    ) external {
        attackRecipient = _recipient;
        attackDestinationChain = _destChain;
        attackSourceChain = _sourceChain;
        attackTransactionIdPrefix = _txIdPrefix;
    }

    /// @notice Overridden transfer that attempts reentrancy
    function transfer(address to, uint256 amount) public override returns (bool) {
        if (attackEnabled && attackCount < 2) {
            _executeAttack();
        }
        return super.transfer(to, amount);
    }

    /// @notice Overridden transferFrom that attempts reentrancy
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) public override returns (bool) {
        if (attackEnabled && attackCount < 2) {
            _executeAttack();
        }
        return super.transferFrom(from, to, amount);
    }

    function _executeAttack() internal {
        attackCount++;

        // Generate transaction ID by concatenating prefix with attack count
        string memory txId = string(abi.encodePacked(attackTransactionIdPrefix, "_", _uint2str(attackCount)));

        if (attackType == AttackType.LOCK_TOKENS) {
            // Attempt to reenter via LOCK_WITH_FEE operation (LOCK_TOKENS not used in current implementation)
            try bridge.executeBridgeOperation(
                IBridge.BridgeOperation.LOCK_WITH_FEE,
                IBridge.BridgeData({
                    fromToken: Strings.toHexString(address(this)),
                    toToken: "",
                    amount: 1 ether,
                    fromAddress: Strings.toHexString(address(this)),
                    toAddress: Strings.toHexString(address(this)),
                    fromNetwork: "eip155:31337",
                    toNetwork: attackDestinationChain,
                    transactionId: txId,
                    email: "attacker@test.com",
                    refund: IBridge.BridgeRefund({
                        feeToken: address(0),
                        feeAmount: 0
                    })
                })
            ) {
                // If successful, attack worked (should not happen)
            } catch {
                // Attack failed (expected due to reentrancy guard)
            }
        } else if (attackType == AttackType.LOCK_WITH_FEE) {
            // Attempt to reenter via LOCK_WITH_FEE operation
            try bridge.executeBridgeOperation(
                IBridge.BridgeOperation.LOCK_WITH_FEE,
                IBridge.BridgeData({
                    fromToken: Strings.toHexString(address(this)),
                    toToken: "",
                    amount: 1 ether,
                    fromAddress: Strings.toHexString(address(this)),
                    toAddress: Strings.toHexString(address(this)),
                    fromNetwork: "eip155:31337",
                    toNetwork: attackDestinationChain,
                    transactionId: txId,
                    email: "attacker@test.com",
                    refund: IBridge.BridgeRefund({
                        feeToken: address(0),
                        feeAmount: 0
                    })
                })
            ) {
                // If successful, attack worked (should not happen)
            } catch {
                // Attack failed (expected)
            }
        } else if (attackType == AttackType.RELEASE_TOKENS) {
            // Attempt to reenter via RELEASE operation (will fail due to access control)
            try bridge.executeBridgeOperation(
                IBridge.BridgeOperation.RELEASE,
                IBridge.BridgeData({
                    fromToken: "",
                    toToken: Strings.toHexString(address(this)),
                    amount: 1 ether,
                    fromAddress: Strings.toHexString(attackRecipient),
                    toAddress: Strings.toHexString(attackRecipient),
                    fromNetwork: attackSourceChain,
                    toNetwork: "eip155:31337",
                    transactionId: txId,
                    email: "attacker@test.com",
                    refund: IBridge.BridgeRefund({
                        feeToken: address(0),
                        feeAmount: 0
                    })
                })
            ) {
                // If successful, attack worked (should not happen)
            } catch {
                // Attack failed (expected)
            }
        }
    }

    function _uint2str(uint256 _i) internal pure returns (string memory) {
        if (_i == 0) {
            return "0";
        }
        uint256 j = _i;
        uint256 len;
        while (j != 0) {
            len++;
            j /= 10;
        }
        bytes memory bstr = new bytes(len);
        uint256 k = len;
        while (_i != 0) {
            k = k-1;
            uint8 temp = (48 + uint8(_i - _i / 10 * 10));
            bytes1 b1 = bytes1(temp);
            bstr[k] = b1;
            _i /= 10;
        }
        return string(bstr);
    }
}

/// @title MockAttacker
/// @notice Mock attacker contract for testing reentrancy and access control
contract MockAttacker {
    ITokenBridge public bridge;
    MaliciousToken public maliciousToken;
    uint256 public successfulAttacks;

    constructor(address _bridge) {
        bridge = ITokenBridge(_bridge);
    }

    function setMaliciousToken(address _token) external {
        maliciousToken = MaliciousToken(_token);
    }

    /// @notice Attempt to attack via malicious token during lock
    function attemptReentrancyAttack(
        uint256 amount,
        string memory transactionId,
        string memory destinationChainId,
        address recipient
    ) external {
        maliciousToken.approve(address(bridge), type(uint256).max);

        try bridge.executeBridgeOperation(
            IBridge.BridgeOperation.LOCK_WITH_FEE,
            IBridge.BridgeData({
                fromToken: Strings.toHexString(address(maliciousToken)),
                toToken: "",
                amount: amount,
                fromAddress: Strings.toHexString(address(this)),
                toAddress: Strings.toHexString(recipient),
                fromNetwork: "eip155:31337",
                toNetwork: destinationChainId,
                transactionId: transactionId,
                email: "attacker@test.com",
                refund: IBridge.BridgeRefund({
                    feeToken: address(0),
                    feeAmount: 0
                })
            })
        ) {
            // Check if we managed to increase attack count (shouldn't happen)
            if (maliciousToken.attackCount() > 1) {
                successfulAttacks++;
            }
        } catch {
            // Attack failed
        }
    }

    /// @notice Attempt unauthorized access to releaseTokens
    function attemptUnauthorizedRelease(
        address token,
        address recipient,
        uint256 amount,
        string memory transactionId,
        string memory sourceChainId,
        string memory sourceAddress
    ) external {
        try bridge.executeBridgeOperation(
            IBridge.BridgeOperation.RELEASE,
            IBridge.BridgeData({
                fromToken: "",
                toToken: Strings.toHexString(token),
                amount: amount,
                fromAddress: sourceAddress,
                toAddress: Strings.toHexString(recipient),
                fromNetwork: sourceChainId,
                toNetwork: "eip155:31337",
                transactionId: transactionId,
                email: "attacker@test.com",
                refund: IBridge.BridgeRefund({
                    feeToken: address(0),
                    feeAmount: 0
                })
            })
        ) {
            successfulAttacks++;
        } catch {
            // Expected to fail
        }
    }

    /// @notice Track if any attacks succeeded
    function getSuccessfulAttacks() external view returns (uint256) {
        return successfulAttacks;
    }
}

