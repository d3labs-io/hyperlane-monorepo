import { Connection, PublicKey } from '@solana/web3.js';
import { ethers } from 'ethers';

const ERC20_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
];

const WARP_ABI = [
  'function transferRemote(uint32 _destinationDomain, bytes32 _recipient, uint256 _amount) external payable returns (bytes32 messageId)',
  'function balanceOf(address account) external view returns (uint256)',
  'function routers(uint32 _domain) external view returns (bytes32)',
];

async function testEvmToSolanaBridge() {
  console.log('🌉 Testing EVM → Solana Bridge\n');

  // Configuration
  const RWA_TOKEN = '0x68B1D87F95878fE05B998F19b66F4baba5De1aed';
  const WARP_EVMTEST2 = '0x4ed7c70F96B99c776995fB64377f0d4aB3B0e1C1';
  const SOLANA_DOMAIN = 13375;
  const SOLANA_PROGRAM = 'ExVvGNtKBiqdpoxkRNbNhJTzZ6P7JxcsMiPrxL6b4pgx';

  console.log('📝 Configuration:');
  console.log(`  RWA Token: ${RWA_TOKEN}`);
  console.log(`  EVM Warp: ${WARP_EVMTEST2}`);
  console.log(`  Solana Program: ${SOLANA_PROGRAM}`);
  console.log(`  Solana Domain: ${SOLANA_DOMAIN}\n`);

  // Setup EVM
  const evmProvider = new ethers.providers.JsonRpcProvider(
    'http://127.0.0.1:8546',
  );
  const privateKey =
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
  const evmWallet = new ethers.Wallet(privateKey, evmProvider);

  const rwaToken = new ethers.Contract(RWA_TOKEN, ERC20_ABI, evmWallet);
  const warpContract = new ethers.Contract(WARP_EVMTEST2, WARP_ABI, evmWallet);

  // Setup Solana
  const solanaConnection = new Connection('http://127.0.0.1:8899', 'confirmed');

  // For Solana recipient, we'll use the EVM wallet address converted to bytes32
  // In a real scenario, you'd use an actual Solana wallet
  const recipientBytes32 = ethers.utils.hexZeroPad(evmWallet.address, 32);

  console.log('👤 Accounts:');
  console.log(`  EVM Sender: ${evmWallet.address}`);
  console.log(`  Solana Recipient (bytes32): ${recipientBytes32}\n`);

  try {
    // Step 1: Check initial EVM balance
    console.log('📊 Step 1: Check EVM balance');
    const evmBalance = await rwaToken.balanceOf(evmWallet.address);
    console.log(`  RWA on EVM: ${ethers.utils.formatEther(evmBalance)}\n`);

    if (evmBalance.eq(0)) {
      console.log('⚠️  No RWA tokens! Run: npx ts-node mint-tokens.ts');
      process.exit(1);
    }

    // Step 2: Verify Solana router is enrolled
    console.log('🔍 Step 2: Verify Solana router enrollment');
    const solanaRouter = await warpContract.routers(SOLANA_DOMAIN);
    const expectedRouter =
      '0xcf5f92988fbfc3a3ad9fb9aa9646d8ab0129a9b3ff8a0e9132b85c065825d2a1';

    console.log(`  Current router: ${solanaRouter}`);
    console.log(`  Expected: ${expectedRouter}`);

    if (solanaRouter.toLowerCase() !== expectedRouter.toLowerCase()) {
      console.log(
        '❌ Solana router not enrolled! Run: npx ts-node enroll-solana-simple.ts',
      );
      process.exit(1);
    }
    console.log('  ✅ Solana router enrolled\n');

    // Step 3: Approve warp contract
    console.log('📝 Step 3: Approve warp contract');
    const amountToTransfer = ethers.utils.parseEther('1');
    const allowance = await rwaToken.allowance(
      evmWallet.address,
      WARP_EVMTEST2,
    );

    if (allowance.lt(amountToTransfer)) {
      console.log('  Approving...');
      const approveTx = await rwaToken.approve(WARP_EVMTEST2, amountToTransfer);
      await approveTx.wait();
      console.log(`  ✅ Approved\n`);
    } else {
      console.log(`  ✅ Already approved\n`);
    }

    // Step 4: Bridge to Solana
    console.log('🌉 Step 4: Initiating bridge transfer to Solana');
    console.log(`  From: EVM (evmtest2)`);
    console.log(`  To: Solana (domain ${SOLANA_DOMAIN})`);
    console.log(`  Amount: 1 RWA`);
    console.log(`  Recipient: ${recipientBytes32}`);
    console.log('');

    const bridgeTx = await warpContract.transferRemote(
      SOLANA_DOMAIN,
      recipientBytes32,
      amountToTransfer,
      { gasLimit: 500000 },
    );

    console.log(`  TX submitted: ${bridgeTx.hash}`);
    const receipt = await bridgeTx.wait();
    console.log(`  ✅ TX confirmed! Gas used: ${receipt.gasUsed.toString()}\n`);

    // Step 5: Check EVM balance after
    console.log('📊 Step 5: Check EVM balance after transfer');
    const evmBalanceAfter = await rwaToken.balanceOf(evmWallet.address);
    console.log(
      `  RWA on EVM: ${ethers.utils.formatEther(evmBalanceAfter)} (was ${ethers.utils.formatEther(evmBalance)})\n`,
    );

    // Step 6: Wait for relayer
    console.log('⏳ Step 6: Waiting for relayer to deliver to Solana...');
    console.log('  This may take 30-60 seconds for Solana delivery');
    console.log('  Watch the agent logs for delivery status\n');

    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Step 7: Instructions for checking Solana
    console.log('📝 Step 7: Check Solana balance');
    console.log('  To check if tokens arrived on Solana, you would need to:');
    console.log('  1. Find the Solana token account for the recipient');
    console.log(`  2. Query the Solana program: ${SOLANA_PROGRAM}`);
    console.log(
      '  3. Check the agent logs for "Message delivered" to Solana\n',
    );

    console.log('✅ Bridge transaction submitted successfully!');
    console.log('');
    console.log('📋 Next steps:');
    console.log('  1. Check agent logs to verify message delivery');
    console.log('  2. Wait for Solana confirmation (may take 30-60 seconds)');
    console.log('  3. Query Solana token accounts to verify balance');
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.error) {
      console.error('Details:', error.error);
    }
    if (error.reason) {
      console.error('Reason:', error.reason);
    }
    process.exit(1);
  }
}

testEvmToSolanaBridge()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
