// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import {TransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

import {HypFiatTokenWithFee} from "../../../../contracts/token/extensions/token_with_fee/HypFiatTokenWithFee.sol";
import {Mailbox} from "../../../../contracts/Mailbox.sol";
import {RouterFeeCollector} from "../../../../contracts/token/extensions/token_with_fee/RouterFeeCollector.sol";
import {FiatTokenTest} from "../../../../contracts/test/ERC20Test.sol";
import {TestPostDispatchHook} from "../../../../contracts/test/TestPostDispatchHook.sol";
import {TestIsm} from "../../../../contracts/test/TestIsm.sol";
import {TypeCasts} from "../../../../contracts/libs/TypeCasts.sol";
import {Quote} from "../../../../contracts/interfaces/ITokenBridge.sol";

contract HypFiatTokenWithFeeTest is Test {
    using TypeCasts for address;
    address internal constant USER_A = address(0x1);
    address internal constant PROXY_ADMIN = address(0x123);
    uint32 internal constant ORIGIN_DOMAIN_ID = 7337;
    uint32 internal constant DESTINATION_DOMAIN_ID = 1;
    uint256 internal constant SCALE = 1;
    Mailbox internal originMailbox;

    uint8 internal constant FIAT_DECIMALS = 6;

    FiatTokenTest internal testUSDC =
        new FiatTokenTest("Test USDC", "USDC", 1_000_000_000, FIAT_DECIMALS);
    FiatTokenTest internal testUSDT =
        new FiatTokenTest("Test USDT", "USDT", 1_000_000_000, FIAT_DECIMALS);

    event SentTransferRemote(
        uint32 indexed destination,
        bytes32 indexed recipient,
        uint256 amount
    );

    function setUp() public {
        originMailbox = new Mailbox(ORIGIN_DOMAIN_ID);
        TestPostDispatchHook defaultHook = new TestPostDispatchHook();
        TestPostDispatchHook requiredHook = new TestPostDispatchHook();
        TestIsm ism = new TestIsm();
        originMailbox.initialize(
            address(this),
            address(ism),
            address(defaultHook),
            address(requiredHook)
        );
    }

    function test_initialize_revertWhen_feeCollector_not_contract()
    public
    {
        // setup origin chain USDC router
        HypFiatTokenWithFee usdcRouterImpl = new HypFiatTokenWithFee(
            address(testUSDC),
            SCALE,
            address(originMailbox)
        );

        TransparentUpgradeableProxy usdcRouterProxy = new TransparentUpgradeableProxy(
            address(usdcRouterImpl),
            address(PROXY_ADMIN),
            ""
        );
        HypFiatTokenWithFee usdcRouter = HypFiatTokenWithFee(
            address(usdcRouterProxy)
        );

        // Prepare dependencies
        TestPostDispatchHook hook = new TestPostDispatchHook();
        TestIsm ism = new TestIsm();
        // Expect revert when fee collector is not a contract (address(0))
        vm.expectRevert(bytes("HypFiatTokenWithFee: fee collector must be a contract"));
        usdcRouter.initialize(
            address(hook),
            address(ism),
            address(this),
            address(0)
        );
    }

    function test_transferRemote_NormalFlow_FeeTokenSameAsTransferredToken()
        public
    {
        // setup router fee collector. the collected fee is USDC
        RouterFeeCollector feeCollector = new RouterFeeCollector(
            address(this),
            address(testUSDC)
        );
        feeCollector.setFee(DESTINATION_DOMAIN_ID, 1 * 10 ** FIAT_DECIMALS); // set fee to 1 USDC

        // setup origin chain USDC router
        HypFiatTokenWithFee usdcRouterImpl = new HypFiatTokenWithFee(
            address(testUSDC),
            SCALE,
            address(originMailbox)
        );

        TransparentUpgradeableProxy usdcRouterProxy = new TransparentUpgradeableProxy(
                address(usdcRouterImpl),
                address(PROXY_ADMIN),
                ""
            );
        HypFiatTokenWithFee usdcRouter = HypFiatTokenWithFee(
            address(usdcRouterProxy)
        );

        usdcRouter.initialize(
            address(new TestPostDispatchHook()),
            address((new TestIsm())),
            address(this),
            address(feeCollector)
        );

        // establish bridge to destination chain USDC router
        address exampleDestinationRouterAddress = address(0x1234);
        usdcRouter.enrollRemoteRouter(
            DESTINATION_DOMAIN_ID,
            exampleDestinationRouterAddress.addressToBytes32()
        );

        // user A has 100 USDC. user A want to transfer 10 USDC to themself on destination chain.
        // the router will collect 1 USDC fee.
        testUSDC.mintTo(USER_A, 100 * 10 ** FIAT_DECIMALS);
        vm.prank(USER_A);
        testUSDC.approve(address(usdcRouter), 11 * 10 ** FIAT_DECIMALS);

        // Expect SentTransferRemote event with matching destination, recipient, and amount
        vm.expectEmit(true, true, false, true, address(usdcRouter));
        emit SentTransferRemote(
            DESTINATION_DOMAIN_ID,
            USER_A.addressToBytes32(),
            10 * 10 ** FIAT_DECIMALS
        );

        // user A calls usdcRouter.transferRemote() sending 10 USDC to themself on destination chain
        vm.prank(USER_A);
        usdcRouter.transferRemote(
            DESTINATION_DOMAIN_ID,
            USER_A.addressToBytes32(),
            10 * 10 ** FIAT_DECIMALS
        );

        // user A has 89 USDC left on origin chain
        assertEq(testUSDC.balanceOf(USER_A), 89 * 10 ** FIAT_DECIMALS);

        // fee collector has 1 USDC collected.
        assertEq(
            testUSDC.balanceOf(address(feeCollector)),
            1 * 10 ** FIAT_DECIMALS
        );
    }

    function test_transferRemote_NormalFlow_FeeTokenDifferentFromTransferredToken()
        public
    {
        // setup router fee collector. the collected fee is USDC
        RouterFeeCollector feeCollector = new RouterFeeCollector(
            address(this),
            address(testUSDC)
        );
        feeCollector.setFee(DESTINATION_DOMAIN_ID, 1 * 10 ** FIAT_DECIMALS); // set fee to 1 USDC

        // setup origin chain USDT router
        HypFiatTokenWithFee usdtRouterImpl = new HypFiatTokenWithFee(
            address(testUSDT),
            SCALE,
            address(originMailbox)
        );

        TransparentUpgradeableProxy usdtRouterProxy = new TransparentUpgradeableProxy(
            address(usdtRouterImpl),
            address(PROXY_ADMIN),
            ""
        );
        HypFiatTokenWithFee usdtRouter = HypFiatTokenWithFee(
            address(usdtRouterProxy)
        );

        usdtRouter.initialize(
            address(new TestPostDispatchHook()),
            address((new TestIsm())),
            address(this),
            address(feeCollector)
        );

        // establish bridge to destination chain USDC router
        address exampleDestinationRouterAddress = address(0x1234);
        usdtRouter.enrollRemoteRouter(
            DESTINATION_DOMAIN_ID,
            exampleDestinationRouterAddress.addressToBytes32()
        );

        // user A has 100 USDT and 10 USDC. user A want to transfer 50 USDT to themself on destination chain.
        // the router will collect 1 USDC fee.
        testUSDT.mintTo(USER_A, 100 * 10 ** FIAT_DECIMALS);
        testUSDC.mintTo(USER_A, 10 * 10 ** FIAT_DECIMALS);

        // user A approve 50 USDT for transfer amount
        vm.prank(USER_A);
        testUSDT.approve(address(usdtRouter), 50 * 10 ** FIAT_DECIMALS);
        // user A approve 1 USDC for bridge fee
        vm.prank(USER_A);
        testUSDC.approve(address(usdtRouter), 1 * 10 ** FIAT_DECIMALS);

        // Expect SentTransferRemote event with matching destination, recipient, and amount
        vm.expectEmit(true, true, false, true, address(usdtRouter));
        emit SentTransferRemote(
            DESTINATION_DOMAIN_ID,
            USER_A.addressToBytes32(),
            50 * 10 ** FIAT_DECIMALS
        );

        // user A calls usdcRouter.transferRemote() sending 10 USDC to themself on destination chain
        vm.prank(USER_A);
        usdtRouter.transferRemote(
            DESTINATION_DOMAIN_ID,
            USER_A.addressToBytes32(),
            50 * 10 ** FIAT_DECIMALS
        );

        // user A has 50 USDT left on origin chain
        assertEq(testUSDT.balanceOf(USER_A), 50 * 10 ** FIAT_DECIMALS);

        // user A has 9 USDC left on origin chain
        assertEq(testUSDC.balanceOf(USER_A), 9 * 10 ** FIAT_DECIMALS);

        // fee collector has 1 USDC collected.
        assertEq(
            testUSDC.balanceOf(address(feeCollector)),
            1 * 10 ** FIAT_DECIMALS
        );
    }

    function test_transferRemote_NormalFlow_ZeroFee()
    public
    {
        // setup router fee collector. the collected fee is USDC
        RouterFeeCollector feeCollector = new RouterFeeCollector(
            address(this),
            address(testUSDC)
        );
        feeCollector.setIsActive(false);

        // setup origin chain USDT router
        HypFiatTokenWithFee usdtRouterImpl = new HypFiatTokenWithFee(
            address(testUSDT),
            SCALE,
            address(originMailbox)
        );

        TransparentUpgradeableProxy usdtRouterProxy = new TransparentUpgradeableProxy(
            address(usdtRouterImpl),
            address(PROXY_ADMIN),
            ""
        );
        HypFiatTokenWithFee usdtRouter = HypFiatTokenWithFee(
            address(usdtRouterProxy)
        );

        usdtRouter.initialize(
            address(new TestPostDispatchHook()),
            address((new TestIsm())),
            address(this),
            address(feeCollector)
        );

        // establish bridge to destination chain USDC router
        address exampleDestinationRouterAddress = address(0x1234);
        usdtRouter.enrollRemoteRouter(
            DESTINATION_DOMAIN_ID,
            exampleDestinationRouterAddress.addressToBytes32()
        );

        // user A has 100 USDT. user A want to transfer 50 USDT to themself on destination chain.
        testUSDT.mintTo(USER_A, 100 * 10 ** FIAT_DECIMALS);

        // user A approve 50 USDT for transfer amount
        vm.prank(USER_A);
        testUSDT.approve(address(usdtRouter), 50 * 10 ** FIAT_DECIMALS);

        // Expect SentTransferRemote event with matching destination, recipient, and amount
        vm.expectEmit(true, true, false, true, address(usdtRouter));
        emit SentTransferRemote(
            DESTINATION_DOMAIN_ID,
            USER_A.addressToBytes32(),
            50 * 10 ** FIAT_DECIMALS
        );

        // user A calls usdcRouter.transferRemote() sending 10 USDC to themself on destination chain
        vm.prank(USER_A);
        usdtRouter.transferRemote(
            DESTINATION_DOMAIN_ID,
            USER_A.addressToBytes32(),
            50 * 10 ** FIAT_DECIMALS
        );

        // user A has 50 USDT left on origin chain
        assertEq(testUSDT.balanceOf(USER_A), 50 * 10 ** FIAT_DECIMALS);
    }

    function test_transferRemote_expectRevert_whenFeeNotSet()
    public
    {
        // setup router fee collector. the collected fee is USDC
        RouterFeeCollector feeCollector = new RouterFeeCollector(
            address(this),
            address(testUSDC)
        );

        // setup origin chain USDT router
        HypFiatTokenWithFee usdtRouterImpl = new HypFiatTokenWithFee(
            address(testUSDT),
            SCALE,
            address(originMailbox)
        );

        TransparentUpgradeableProxy usdtRouterProxy = new TransparentUpgradeableProxy(
            address(usdtRouterImpl),
            address(PROXY_ADMIN),
            ""
        );
        HypFiatTokenWithFee usdtRouter = HypFiatTokenWithFee(
            address(usdtRouterProxy)
        );

        usdtRouter.initialize(
            address(new TestPostDispatchHook()),
            address((new TestIsm())),
            address(this),
            address(feeCollector)
        );

        // establish bridge to destination chain USDC router
        address exampleDestinationRouterAddress = address(0x1234);
        usdtRouter.enrollRemoteRouter(
            DESTINATION_DOMAIN_ID,
            exampleDestinationRouterAddress.addressToBytes32()
        );

        // user A has 100 USDT and 10 USDC. user A want to transfer 50 USDT to themself on destination chain.
        // the router will collect 1 USDC fee.
        testUSDT.mintTo(USER_A, 100 * 10 ** FIAT_DECIMALS);
        testUSDC.mintTo(USER_A, 10 * 10 ** FIAT_DECIMALS);

        // user A approve 50 USDT for transfer amount
        vm.prank(USER_A);
        testUSDT.approve(address(usdtRouter), 50 * 10 ** FIAT_DECIMALS);
        // user A approve 1 USDC for bridge fee
        vm.prank(USER_A);
        testUSDC.approve(address(usdtRouter), 1 * 10 ** FIAT_DECIMALS);

        vm.expectRevert(bytes("RouterFeeCollector: destination not configured"));

        // user A calls usdcRouter.transferRemote() sending 10 USDC to themself on destination chain
        vm.prank(USER_A);
        usdtRouter.transferRemote(
            DESTINATION_DOMAIN_ID,
            USER_A.addressToBytes32(),
            50 * 10 ** FIAT_DECIMALS
        );
    }

    function test_quoteTransferRemote_NormalFlow_FeeTokenSameAsTransferredToken()
        public
    {
        // setup router fee collector. the collected fee is USDC
        RouterFeeCollector feeCollector = new RouterFeeCollector(
            address(this),
            address(testUSDC)
        );
        feeCollector.setFee(DESTINATION_DOMAIN_ID, 1 * 10 ** FIAT_DECIMALS); // set fee to 1 USDC

        // setup origin chain USDC router
        HypFiatTokenWithFee usdcRouterImpl = new HypFiatTokenWithFee(
            address(testUSDC),
            SCALE,
            address(originMailbox)
        );

        TransparentUpgradeableProxy usdcRouterProxy = new TransparentUpgradeableProxy(
            address(usdcRouterImpl),
            address(PROXY_ADMIN),
            ""
        );
        HypFiatTokenWithFee usdcRouter = HypFiatTokenWithFee(
            address(usdcRouterProxy)
        );

        usdcRouter.initialize(
            address(new TestPostDispatchHook()),
            address((new TestIsm())),
            address(this),
            address(feeCollector)
        );

        // establish bridge to destination chain USDC router
        address exampleDestinationRouterAddress = address(0x1234);
        usdcRouter.enrollRemoteRouter(
            DESTINATION_DOMAIN_ID,
            exampleDestinationRouterAddress.addressToBytes32()
        );

        Quote[] memory quotes = usdcRouter.quoteTransferRemote(
            DESTINATION_DOMAIN_ID,
            USER_A.addressToBytes32(),
            10 * 10 ** FIAT_DECIMALS
        );

        assertEq(quotes.length,2);

        assertEq(quotes[0].token, address(0));
        assertEq(quotes[1].token, address(testUSDC));
        assertEq(quotes[1].amount, 11 * 10 ** FIAT_DECIMALS);

    }

    function test_quoteTransferRemote_NormalFlow_FeeTokenDifferentFromTransferredToken()
    public
    {
        // setup router fee collector. the collected fee is USDC
        RouterFeeCollector feeCollector = new RouterFeeCollector(
            address(this),
            address(testUSDC)
        );
        feeCollector.setFee(DESTINATION_DOMAIN_ID, 1 * 10 ** FIAT_DECIMALS); // set fee to 1 USDC

        // setup origin chain USDT router
        HypFiatTokenWithFee usdtRouterImpl = new HypFiatTokenWithFee(
            address(testUSDT),
            SCALE,
            address(originMailbox)
        );

        TransparentUpgradeableProxy usdtRouterProxy = new TransparentUpgradeableProxy(
            address(usdtRouterImpl),
            address(PROXY_ADMIN),
            ""
        );
        HypFiatTokenWithFee usdtRouter = HypFiatTokenWithFee(
            address(usdtRouterProxy)
        );

        usdtRouter.initialize(
            address(new TestPostDispatchHook()),
            address((new TestIsm())),
            address(this),
            address(feeCollector)
        );

        // establish bridge to destination chain USDC router
        address exampleDestinationRouterAddress = address(0x1234);
        usdtRouter.enrollRemoteRouter(
            DESTINATION_DOMAIN_ID,
            exampleDestinationRouterAddress.addressToBytes32()
        );

        Quote[] memory quotes = usdtRouter.quoteTransferRemote(
            DESTINATION_DOMAIN_ID,
            USER_A.addressToBytes32(),
            10 * 10 ** FIAT_DECIMALS
        );

        assertEq(quotes.length,3);

        assertEq(quotes[0].token, address(0));
        // assert transferred token
        assertEq(quotes[1].token, address(testUSDT));
        assertEq(quotes[1].amount, 10 * 10 ** FIAT_DECIMALS);
        // assert fee token
        assertEq(quotes[2].token, address(testUSDC));
        assertEq(quotes[2].amount, 1 * 10 ** FIAT_DECIMALS);
    }

    function test_quoteTransferRemote_NormalFlow_ZeroFee()
    public
    {
        // setup router fee collector. the collected fee is USDC
        RouterFeeCollector feeCollector = new RouterFeeCollector(
            address(this),
            address(testUSDC)
        );
        feeCollector.setFee(DESTINATION_DOMAIN_ID, 0);

        // setup origin chain USDT router
        HypFiatTokenWithFee usdtRouterImpl = new HypFiatTokenWithFee(
            address(testUSDT),
            SCALE,
            address(originMailbox)
        );

        TransparentUpgradeableProxy usdtRouterProxy = new TransparentUpgradeableProxy(
            address(usdtRouterImpl),
            address(PROXY_ADMIN),
            ""
        );
        HypFiatTokenWithFee usdtRouter = HypFiatTokenWithFee(
            address(usdtRouterProxy)
        );

        usdtRouter.initialize(
            address(new TestPostDispatchHook()),
            address((new TestIsm())),
            address(this),
            address(feeCollector)
        );

        // establish bridge to destination chain USDC router
        address exampleDestinationRouterAddress = address(0x1234);
        usdtRouter.enrollRemoteRouter(
            DESTINATION_DOMAIN_ID,
            exampleDestinationRouterAddress.addressToBytes32()
        );

        Quote[] memory quotes = usdtRouter.quoteTransferRemote(
            DESTINATION_DOMAIN_ID,
            USER_A.addressToBytes32(),
            10 * 10 ** FIAT_DECIMALS
        );

        assertEq(quotes.length,2);

        assertEq(quotes[0].token, address(0));
        // assert transferred token
        assertEq(quotes[1].token, address(testUSDT));
        assertEq(quotes[1].amount, 10 * 10 ** FIAT_DECIMALS);
    }
}
