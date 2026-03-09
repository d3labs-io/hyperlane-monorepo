/**
 * enroll-solana-testnet.ts
 *
 * Enrolls a Solana Testnet warp route program as the remote router on the
 * corresponding pruvtest EVM warp contract.
 *
 * Must be run AFTER both EVM and Solana warp routes have been deployed.
 *
 * Usage:
 *   PRIVATE_KEY=0x... \
 *   EVM_WARP_ADDRESS=0x... \
 *   SOLANA_PROGRAM_HEX=0x... \
 *   npx ts-node scripts/enroll-solana-testnet.ts
 *
 * Or update the constants below directly.
 */
import { ethers } from 'ethers';

// ─── Configuration ────────────────────────────────────────────────────────────
// Update these values after deploying the warp routes.

const CONFIG = {
  // pruvtest RPC
  evmRpcUrl: 'https://rpc.testnet.pruv.network',

  // Private key of the owner of the EVM warp contract
  privateKey: process.env.PRIVATE_KEY || 'REPLACE_WITH_YOUR_EVM_PRIVATE_KEY',

  // Official Solana Testnet domain ID (Hyperlane registered)
  solanaDomain: 1399811151,

  // Warp routes to enroll: add one entry per token
  routes: [
    {
      name: 'PRUV native',
      // EVM HypNative warp contract address on pruvtest
      evmWarpAddress:
        process.env.PRUV_WARP_ADDRESS || 'REPLACE_WITH_PRUV_WARP_EVM_ADDRESS',
      // Solana warp program ID as 32-byte hex (0x-prefixed)
      // Convert from base58: node -e "const {PublicKey}=require('@solana/web3.js'); console.log('0x'+Buffer.from(new PublicKey('BASE58_ID').toBytes()).toString('hex'))"
      solanaProgramHex:
        process.env.PRUV_SOLANA_HEX || 'REPLACE_WITH_PRUV_SOLANA_PROGRAM_HEX',
    },
    {
      name: 'USDC collateral',
      evmWarpAddress:
        process.env.USDC_WARP_ADDRESS || 'REPLACE_WITH_USDC_WARP_EVM_ADDRESS',
      solanaProgramHex:
        process.env.USDC_SOLANA_HEX || 'REPLACE_WITH_USDC_SOLANA_PROGRAM_HEX',
    },
    {
      name: 'Custom ERC20 collateral',
      evmWarpAddress:
        process.env.CUSTOM_WARP_ADDRESS ||
        'REPLACE_WITH_CUSTOM_WARP_EVM_ADDRESS',
      solanaProgramHex:
        process.env.CUSTOM_SOLANA_HEX ||
        'REPLACE_WITH_CUSTOM_SOLANA_PROGRAM_HEX',
    },
  ],
};

// ─── ABI ─────────────────────────────────────────────────────────────────────

const MAILBOX_CLIENT_ABI = [
  'function enrollRemoteRouter(uint32 _domain, bytes32 _router) external',
  'function routers(uint32 _domain) external view returns (bytes32)',
  'function owner() external view returns (address)',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function validateHex32(value: string, fieldName: string): void {
  if (!value.startsWith('0x') || value.length !== 66) {
    throw new Error(
      `Invalid ${fieldName}: "${value}". Must be 0x-prefixed 32-byte hex (66 chars total).`,
    );
  }
}

function validateAddress(value: string, fieldName: string): void {
  if (!ethers.utils.isAddress(value)) {
    throw new Error(
      `Invalid ${fieldName}: "${value}". Must be a valid EVM address.`,
    );
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function enrollRouter(
  wallet: ethers.Wallet,
  routeName: string,
  evmWarpAddress: string,
  solanaProgramHex: string,
  solanaDomain: number,
): Promise<void> {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  Token: ${routeName}`);
  console.log(`  EVM Warp   : ${evmWarpAddress}`);
  console.log(`  Solana Hex : ${solanaProgramHex}`);
  console.log(`  Domain     : ${solanaDomain}`);

  const warpContract = new ethers.Contract(
    evmWarpAddress,
    MAILBOX_CLIENT_ABI,
    wallet,
  );

  // Verify ownership
  const owner = await warpContract.owner();
  if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error(
      `Wallet ${wallet.address} is not the owner of ${evmWarpAddress}. Owner is ${owner}.`,
    );
  }
  console.log(`  Owner check: OK (${wallet.address})`);

  // Check current enrollment
  const currentRouter = await warpContract.routers(solanaDomain);
  const isAlreadyEnrolled =
    currentRouter.toLowerCase() === solanaProgramHex.toLowerCase();

  if (isAlreadyEnrolled) {
    console.log(`  Already enrolled: ${currentRouter} — skipping.`);
    return;
  }

  console.log(`  Current router for domain ${solanaDomain}: ${currentRouter}`);
  console.log(`  Enrolling...`);

  const tx = await warpContract.enrollRemoteRouter(
    solanaDomain,
    solanaProgramHex,
    {
      gasLimit: 200_000,
    },
  );
  console.log(`  TX submitted: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(
    `  Confirmed in block ${receipt.blockNumber}. Gas used: ${receipt.gasUsed.toString()}`,
  );

  // Verify
  const newRouter = await warpContract.routers(solanaDomain);
  if (newRouter.toLowerCase() !== solanaProgramHex.toLowerCase()) {
    throw new Error(
      `Enrollment verification failed. Got ${newRouter}, expected ${solanaProgramHex}`,
    );
  }
  console.log(`  Enrollment verified: ${newRouter}`);
}

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('  Enroll Solana Testnet Routers on pruvtest Warp Contracts');
  console.log('='.repeat(60));
  console.log(`\n  pruvtest RPC  : ${CONFIG.evmRpcUrl}`);
  console.log(`  Solana Domain : ${CONFIG.solanaDomain}`);

  // Validate config
  for (const route of CONFIG.routes) {
    if (
      route.evmWarpAddress.startsWith('REPLACE') ||
      route.solanaProgramHex.startsWith('REPLACE')
    ) {
      console.warn(
        `\nWARNING: Route "${route.name}" has placeholder values — it will be skipped.`,
      );
      continue;
    }
    validateAddress(route.evmWarpAddress, `${route.name} EVM warp address`);
    validateHex32(route.solanaProgramHex, `${route.name} Solana program hex`);
  }

  const provider = new ethers.providers.JsonRpcProvider(CONFIG.evmRpcUrl);
  const wallet = new ethers.Wallet(CONFIG.privateKey, provider);
  console.log(`\n  Signer: ${wallet.address}`);

  const balance = await provider.getBalance(wallet.address);
  console.log(`  Balance: ${ethers.utils.formatEther(balance)} PRUV`);

  let enrolled = 0;
  let skipped = 0;

  for (const route of CONFIG.routes) {
    if (
      route.evmWarpAddress.startsWith('REPLACE') ||
      route.solanaProgramHex.startsWith('REPLACE')
    ) {
      skipped++;
      continue;
    }
    await enrollRouter(
      wallet,
      route.name,
      route.evmWarpAddress,
      route.solanaProgramHex,
      CONFIG.solanaDomain,
    );
    enrolled++;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(
    `  Done. Enrolled: ${enrolled} route(s), Skipped: ${skipped} route(s).`,
  );
  console.log('='.repeat(60));
  console.log('');
  console.log('  Next steps:');
  console.log(
    '  1. Set the pruvtest validator in the Solana multisig ISM (Step 6 of TESTNET_GUIDE.md)',
  );
  console.log('  2. Fund the ATA payer PDA for each Solana warp program');
  console.log('  3. Start agents with agent-config-testnet.json');
}

main().catch((err) => {
  console.error('\nFatal error:', err.message || err);
  process.exit(1);
});
