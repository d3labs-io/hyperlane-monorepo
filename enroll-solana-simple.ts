import { ethers } from 'ethers';

const MAILBOX_CLIENT_ABI = [
  'function enrollRemoteRouter(uint32 _domain, bytes32 _router) external',
  'function routers(uint32 _domain) external view returns (bytes32)',
  'function owner() external view returns (address)',
];

async function enrollSolanaRouter() {
  console.log('🔧 Enrolling Solana Router on EVM\n');

  // Solana program ID from deployment
  const SOLANA_PROGRAM = '34xxeWuYpnj5f7m5S57Sg7TD3pyD4gqooVepbJQVTmu7';
  const SOLANA_DOMAIN = 13375; // solalocal domain

  // EVM warp contract address (evmtest2)
  const WARP_EVMTEST2 = '0x4ed7c70F96B99c776995fB64377f0d4aB3B0e1C1';

  console.log('📝 Configuration:');
  console.log(`  EVM Warp (evmtest2): ${WARP_EVMTEST2}`);
  console.log(`  Solana Program: ${SOLANA_PROGRAM}`);
  console.log(`  Solana Domain: ${SOLANA_DOMAIN}\n`);

  // Setup
  const provider = new ethers.providers.JsonRpcProvider(
    'http://127.0.0.1:8546',
  );
  const privateKey =
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
  const wallet = new ethers.Wallet(privateKey, provider);

  const warpContract = new ethers.Contract(
    WARP_EVMTEST2,
    MAILBOX_CLIENT_ABI,
    wallet,
  );

  try {
    // ExVvGNtKBiqdpoxkRNbNhJTzZ6P7JxcsMiPrxL6b4pgx = 0xcf5f92988fbfc3a3ad9fb9aa9646d8ab0129a9b3ff8a0e9132b85c065825d2a1
    const programBytes32 =
      '0x1ebb63ca61680dd5ae0fa342abafa78498d5777c28469b8a0094cc4a1092156e';

    console.log('🔑 Using Solana address:');
    console.log(`  Base58: ${SOLANA_PROGRAM}`);
    console.log(`  Hex: ${programBytes32}\n`);

    // Check owner
    console.log('📋 Checking contract owner...');
    const owner = await warpContract.owner();
    console.log(`  Owner: ${owner}`);
    console.log(`  Wallet: ${wallet.address}`);
    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
      throw new Error('Wallet is not the contract owner!');
    }
    console.log('  ✅ Wallet is owner\n');

    // Check current router
    console.log('🔍 Checking current Solana router...');
    const currentRouter = await warpContract.routers(SOLANA_DOMAIN);
    console.log(
      `  Current router for domain ${SOLANA_DOMAIN}: ${currentRouter}\n`,
    );

    // Enroll Solana router
    console.log('🔄 Enrolling Solana router...');
    console.log(`  Domain: ${SOLANA_DOMAIN}`);
    console.log(`  Router: ${programBytes32}`);

    const tx = await warpContract.enrollRemoteRouter(
      SOLANA_DOMAIN,
      programBytes32,
      {
        gasLimit: 500000,
      },
    );

    console.log(`  TX submitted: ${tx.hash}`);
    await tx.wait();
    console.log(`  ✅ Confirmed!\n`);

    // Verify enrollment
    console.log('✅ Verifying enrollment...');
    const newRouter = await warpContract.routers(SOLANA_DOMAIN);
    console.log(`  Router for domain ${SOLANA_DOMAIN}: ${newRouter}`);

    if (newRouter.toLowerCase() === programBytes32.toLowerCase()) {
      console.log('\n🎉 SUCCESS! Solana router enrolled correctly!');
    } else {
      console.log('\n⚠️  Warning: Router value does not match expected value');
    }
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.error) {
      console.error('Details:', error.error);
    }
    process.exit(1);
  }
}

enrollSolanaRouter()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
