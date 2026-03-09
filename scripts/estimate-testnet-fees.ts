/**
 * Testnet Fee Estimator for Pruv-Solana Bridge
 *
 * Estimates deployment costs for bridging PRUV native token, USDC, and custom
 * ERC20 tokens from pruvtest (EVM) to Solana Testnet using Hyperlane.
 *
 * Two deployment paths are estimated:
 *   Option A: Use official Hyperlane Solana Testnet core programs (warp route only)
 *   Option B: Deploy own Hyperlane core programs on Solana Testnet (full control)
 *
 * Run: npx ts-node scripts/estimate-testnet-fees.ts
 */
import { Connection } from '@solana/web3.js';
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';

// ─── Chain Configuration ────────────────────────────────────────────────────

const PRUV_RPC = 'https://rpc.testnet.pruv.network';
const SOLANA_TESTNET_RPC = 'https://api.testnet.solana.com';

// pruvtest core contracts (already deployed)
const PRUV_ADDRESSES = {
  mailbox: '0x72364A5F747a4e6E17b13Be4b421b879E95D95E7',
  interchainGasPaymaster: '0x4D73607C4462cc0D3B2Ab93a7521CEfDB10f1EC5',
  merkleTreeHook: '0xA08C7fc82aD1565Ea1b7eEB24618c4B24c2733EC',
  validatorAnnounce: '0x3B25B046bf50E3D469bbF2610bf564f11a4dC8c2',
  proxyAdmin: '0x823B2406490752fB50e1CABa809Bf643CD233553',
};

// Official Hyperlane Solana Testnet core programs (Option A)
const OFFICIAL_SOLANA_TESTNET = {
  mailbox: '75HBBLae3ddeneJVrZeyrDfv6vb7SMC3aCpBucSXS5aR',
  validator_announce: '8qNYSi9EP1xSnRjtMpyof88A26GBbdcrsa61uSaHiwx3',
  multisig_ism_message_id: '4GHxwWyKB9exhKG4fdyU2hfLgfFzhHp2WcsSKc2uNR1k',
  igp_program_id: '5p7Hii6CJL4xGBYYTGEQmH9LnUSZteFJUu9AVLDExZX2',
  overhead_igp_account: 'hBHAApi5ZoeCYHqDdCKkCzVKmBdwywdT3hMqe327eZB',
  igp_account: '9SQVtTNsbipdMzumhzi6X8GwojiSMwBfqAhS7FgyTcqy',
};

// ─── Known Program Sizes (bytes) ─────────────────────────────────────────────
// Measured from rust/sealevel/target/deploy/*.so

const PROGRAM_SIZES_BYTES = {
  mailbox: 209728,
  igp: 248496,
  validator_announce: 137296,
  multisig_ism_message_id: 194400,
  token_synthetic: 357744, // hyperlane_sealevel_token.so
  token_collateral: 362304, // hyperlane_sealevel_token_collateral.so
  token_native: 334776, // hyperlane_sealevel_token_native.so
};

// ─── EVM Gas Estimates ───────────────────────────────────────────────────────
// Based on Forge gas snapshots (solidity/.gas-snapshot) and deployment patterns

const EVM_GAS_ESTIMATES = {
  // ERC20 token deployment (MyToken contract)
  erc20Deploy: 1_200_000,
  // HypNative (native token warp) deployment via CLI with proxy
  hypNativeDeploy: 3_500_000,
  // HypERC20Collateral deployment via CLI with proxy
  hypERC20CollateralDeploy: 3_800_000,
  // enrollRemoteRouter call on warp contract (~50k gas, use safe 80k)
  enrollRemoteRouter: 80_000,
  // ISM configuration / ownership transfer
  ismConfig: 120_000,
  // transferRemote (bridge send) — from gas snapshot: ~202k
  transferRemote: 250_000,
  // ERC20 approve call
  erc20Approve: 50_000,
};

// ─── ATA Payer & Misc SOL Costs ──────────────────────────────────────────────

const ATA_PAYER_FUNDING_SOL = 0.1; // Minimum funding for ATA payer PDA per warp route
const ATA_PAYER_RECOMMENDED_SOL = 0.5; // Recommended to handle multiple recipients
const SOLANA_TX_FEE_SOL = 0.000005; // Per-transaction base fee (5000 lamports)
const ESTIMATED_DEPLOY_TXS = 15; // Approximate transactions for core deploy

// ─── Helper Functions ────────────────────────────────────────────────────────

async function getEvmGasPrice(rpcUrl: string): Promise<bigint> {
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_gasPrice',
        params: [],
        id: 1,
      }),
    });
    const data = (await response.json()) as {
      result?: string;
      error?: unknown;
    };
    if (!data.result) throw new Error('No result in response');
    return BigInt(data.result);
  } catch (err) {
    console.warn(
      `  Warning: Could not fetch gas price from ${rpcUrl}, using 1 gwei fallback`,
    );
    return BigInt(1_000_000_000); // 1 gwei
  }
}

async function getSolanaRentExemptBalance(
  connection: Connection,
  dataLenBytes: number,
): Promise<number> {
  try {
    return await connection.getMinimumBalanceForRentExemption(dataLenBytes);
  } catch {
    // Fallback: ~6.96 lamports per byte + 128 bytes overhead
    return Math.ceil((dataLenBytes + 128) * 6.96);
  }
}

function lamportsToSol(lamports: number): number {
  return lamports / 1_000_000_000;
}

function weiToPruv(wei: bigint, decimals = 18): number {
  const divisor = 10n ** BigInt(decimals);
  const whole = wei / divisor;
  const fraction = ((wei % divisor) * 10000n) / divisor;
  return Number(whole) + Number(fraction) / 10000;
}

function formatSol(sol: number): string {
  return `${sol.toFixed(4)} SOL`;
}

function formatPruv(pruv: number): string {
  return `${pruv.toFixed(6)} PRUV`;
}

function printSeparator(char = '─', width = 72): void {
  console.log(char.repeat(width));
}

function printHeader(title: string): void {
  printSeparator('═');
  console.log(`  ${title}`);
  printSeparator('═');
}

function printSection(title: string): void {
  console.log('');
  printSeparator();
  console.log(`  ${title}`);
  printSeparator();
}

// ─── Cost Calculation ────────────────────────────────────────────────────────

interface SolanaProgramCost {
  name: string;
  sizeBytes: number;
  rentSol: number;
  txFeesSol: number;
  totalSol: number;
}

interface EvmDeployStep {
  name: string;
  gasUnits: number;
  gasCostPruv: number;
}

interface FeeEstimate {
  solana: {
    programs: SolanaProgramCost[];
  };
  evm: {
    steps: EvmDeployStep[];
    gasPriceGwei: number;
  };
}

async function calculateSolanaCosts(
  connection: Connection,
  programs: Array<{ name: string; sizeBytes: number }>,
): Promise<SolanaProgramCost[]> {
  const results: SolanaProgramCost[] = [];
  for (const prog of programs) {
    // Buffer account (used during upload) is same size as program
    const programRent = await getSolanaRentExemptBalance(
      connection,
      prog.sizeBytes,
    );
    // Buffer account is also required during deployment and then closed, but we
    // account for it as it ties up SOL during the deploy window
    const bufferRent = await getSolanaRentExemptBalance(
      connection,
      prog.sizeBytes,
    );
    const totalRent = programRent + bufferRent;
    const txFees = SOLANA_TX_FEE_SOL * ESTIMATED_DEPLOY_TXS;
    results.push({
      name: prog.name,
      sizeBytes: prog.sizeBytes,
      rentSol: lamportsToSol(totalRent),
      txFeesSol: txFees,
      totalSol: lamportsToSol(totalRent) + txFees,
    });
  }
  return results;
}

function calculateEvmCosts(
  steps: Array<{ name: string; gasUnits: number }>,
  gasPriceWei: bigint,
): EvmDeployStep[] {
  return steps.map((step) => {
    const costWei = BigInt(step.gasUnits) * gasPriceWei;
    return {
      name: step.name,
      gasUnits: step.gasUnits,
      gasCostPruv: weiToPruv(costWei),
    };
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  printHeader('Pruv-Solana Bridge — Testnet Fee Estimator');
  console.log('');
  console.log(`  pruvtest RPC  : ${PRUV_RPC}`);
  console.log(`  Solana RPC    : ${SOLANA_TESTNET_RPC}`);
  console.log('');
  console.log('  Fetching live gas price and rent costs...');

  const [gasPriceWei, solanaConnection] = await Promise.all([
    getEvmGasPrice(PRUV_RPC),
    Promise.resolve(new Connection(SOLANA_TESTNET_RPC, 'confirmed')),
  ]);

  const gasPriceGwei = Number(gasPriceWei) / 1e9;
  console.log(`  pruvtest gas price : ${gasPriceGwei.toFixed(4)} Gwei`);

  // ─── Solana Program Rent Costs ──────────────────────────────────────────

  printSection('SOLANA PROGRAM DEPLOYMENT COSTS');

  const corePrograms = [
    { name: 'mailbox', sizeBytes: PROGRAM_SIZES_BYTES.mailbox },
    { name: 'igp (gas paymaster)', sizeBytes: PROGRAM_SIZES_BYTES.igp },
    {
      name: 'validator_announce',
      sizeBytes: PROGRAM_SIZES_BYTES.validator_announce,
    },
    {
      name: 'multisig_ism_message_id',
      sizeBytes: PROGRAM_SIZES_BYTES.multisig_ism_message_id,
    },
  ];

  const warpPrograms = [
    {
      name: 'warp/token_native (PRUV)',
      sizeBytes: PROGRAM_SIZES_BYTES.token_native,
    },
    {
      name: 'warp/token (synthetic)',
      sizeBytes: PROGRAM_SIZES_BYTES.token_synthetic,
    },
    {
      name: 'warp/token_collateral',
      sizeBytes: PROGRAM_SIZES_BYTES.token_collateral,
    },
  ];

  const allProgramCosts = await calculateSolanaCosts(solanaConnection, [
    ...corePrograms,
    ...warpPrograms,
  ]);

  const coreCosts = allProgramCosts.slice(0, corePrograms.length);
  const warpCosts = allProgramCosts.slice(corePrograms.length);

  console.log('');
  console.log('  Core programs (required for Option B — own deployment):');
  console.log('');
  console.log(
    `  ${'Program'.padEnd(36)} ${'Size'.padStart(8)}   ${'Rent (SOL)'.padStart(12)}   ${'Tx Fees'.padStart(10)}   ${'Total'.padStart(12)}`,
  );
  printSeparator('─', 88);

  let coreTotalSol = 0;
  for (const cost of coreCosts) {
    const sizeKb = (cost.sizeBytes / 1024).toFixed(0) + 'KB';
    console.log(
      `  ${cost.name.padEnd(36)} ${sizeKb.padStart(8)}   ${formatSol(cost.rentSol).padStart(12)}   ${formatSol(cost.txFeesSol).padStart(10)}   ${formatSol(cost.totalSol).padStart(12)}`,
    );
    coreTotalSol += cost.totalSol;
  }
  printSeparator('─', 88);
  console.log(
    `  ${'CORE TOTAL (Option B)'.padEnd(58)} ${formatSol(coreTotalSol).padStart(12)}`,
  );

  console.log('');
  console.log('  Warp route programs (1 per token, both options):');
  console.log('');
  console.log(
    `  ${'Program'.padEnd(36)} ${'Size'.padStart(8)}   ${'Rent (SOL)'.padStart(12)}   ${'Tx Fees'.padStart(10)}   ${'Total'.padStart(12)}`,
  );
  printSeparator('─', 88);

  for (const cost of warpCosts) {
    const sizeKb = (cost.sizeBytes / 1024).toFixed(0) + 'KB';
    console.log(
      `  ${cost.name.padEnd(36)} ${sizeKb.padStart(8)}   ${formatSol(cost.rentSol).padStart(12)}   ${formatSol(cost.txFeesSol).padStart(10)}   ${formatSol(cost.totalSol).padStart(12)}`,
    );
  }

  const ataPayer = ATA_PAYER_RECOMMENDED_SOL;
  console.log(
    `  ${'ata_payer PDA funding (per token)'.padEnd(60)} ${formatSol(ataPayer).padStart(12)}`,
  );

  // ─── pruvtest EVM Deployment Costs ─────────────────────────────────────

  printSection('PRUVTEST EVM DEPLOYMENT COSTS');
  console.log(`  Gas price: ${gasPriceGwei.toFixed(4)} Gwei`);
  console.log('');

  const evmSteps = [
    {
      name: 'ERC20 token deploy (USDC or custom)',
      gasUnits: EVM_GAS_ESTIMATES.erc20Deploy,
    },
    {
      name: 'HypNative deploy (PRUV native bridge)',
      gasUnits: EVM_GAS_ESTIMATES.hypNativeDeploy,
    },
    {
      name: 'HypERC20Collateral deploy (per ERC20)',
      gasUnits: EVM_GAS_ESTIMATES.hypERC20CollateralDeploy,
    },
    {
      name: 'enrollRemoteRouter (per token)',
      gasUnits: EVM_GAS_ESTIMATES.enrollRemoteRouter,
    },
    {
      name: 'ISM config / ownership (per token)',
      gasUnits: EVM_GAS_ESTIMATES.ismConfig,
    },
    {
      name: 'transferRemote / bridge send',
      gasUnits: EVM_GAS_ESTIMATES.transferRemote,
    },
    { name: 'ERC20 approve', gasUnits: EVM_GAS_ESTIMATES.erc20Approve },
  ];

  const evmCosts = calculateEvmCosts(evmSteps, gasPriceWei);

  console.log(
    `  ${'Step'.padEnd(44)} ${'Gas Units'.padStart(12)}   ${'Cost (PRUV)'.padStart(14)}`,
  );
  printSeparator();
  for (const step of evmCosts) {
    console.log(
      `  ${step.name.padEnd(44)} ${step.gasUnits.toLocaleString().padStart(12)}   ${formatPruv(step.gasCostPruv).padStart(14)}`,
    );
  }

  // ─── Summary Tables ─────────────────────────────────────────────────────

  printSection('TOTAL COST SUMMARY — 3 TOKENS (PRUV + USDC + 1 Custom ERC20)');

  // For each token: 1 warp route on Solana + 1 EVM warp contract
  const numTokens = 3;
  // PRUV uses token_native; USDC and custom ERC20 use token_collateral
  const warpNativeCost = warpCosts[0].totalSol;
  const warpSyntheticCost = warpCosts[1].totalSol; // generic synthetic
  const warpCollateralCost = warpCosts[2].totalSol;

  // Solana side: PRUV=native, USDC=synthetic, custom=collateral
  const solanaTotalOptionA =
    warpNativeCost +
    ataPayer + // PRUV warp
    warpSyntheticCost +
    ataPayer + // USDC warp
    warpCollateralCost +
    ataPayer; // custom ERC20 warp

  const solanaTotalOptionB = coreTotalSol + solanaTotalOptionA;

  // EVM side: shared infra already deployed; only warp contracts + enrollment
  const evmPerToken = weiToPruv(
    BigInt(
      EVM_GAS_ESTIMATES.hypERC20CollateralDeploy +
        EVM_GAS_ESTIMATES.enrollRemoteRouter +
        EVM_GAS_ESTIMATES.ismConfig,
    ) * gasPriceWei,
  );
  const evmNativeToken = weiToPruv(
    BigInt(
      EVM_GAS_ESTIMATES.hypNativeDeploy +
        EVM_GAS_ESTIMATES.enrollRemoteRouter +
        EVM_GAS_ESTIMATES.ismConfig,
    ) * gasPriceWei,
  );
  const evmTwoErc20s =
    2 *
    weiToPruv(
      BigInt(
        EVM_GAS_ESTIMATES.erc20Deploy +
          EVM_GAS_ESTIMATES.hypERC20CollateralDeploy +
          EVM_GAS_ESTIMATES.enrollRemoteRouter +
          EVM_GAS_ESTIMATES.ismConfig,
      ) * gasPriceWei,
    );
  const evmTotalPruv = evmNativeToken + evmTwoErc20s;

  console.log('');
  console.log(
    '  OPTION A — Use official Hyperlane Solana Testnet core (recommended)',
  );
  console.log('  Core programs: already deployed by Hyperlane (no cost)');
  console.log('  You only deploy: warp route programs + fund ATA payers');
  console.log('');
  console.log(
    `    Solana testnet SOL needed  : ${formatSol(solanaTotalOptionA)}`,
  );
  console.log(`    pruvtest PRUV needed        : ${formatPruv(evmTotalPruv)}`);
  console.log(`    Note: Custom ISM setup for pruvtest domain still required.`);

  console.log('');
  console.log('  OPTION B — Deploy own Hyperlane core on Solana Testnet');
  console.log('  Full control; required if you need custom ISM logic.');
  console.log('');
  console.log(
    `    Solana testnet SOL needed  : ${formatSol(solanaTotalOptionB)}`,
  );
  console.log(`    pruvtest PRUV needed        : ${formatPruv(evmTotalPruv)}`);
  console.log(`    (EVM cost is same for both options)`);

  // ─── Per-Step Breakdown ──────────────────────────────────────────────────

  printSection('PER-STEP FEE BREAKDOWN (for TESTNET_GUIDE.md reference)');

  const evmHypNativeCost = weiToPruv(
    BigInt(EVM_GAS_ESTIMATES.hypNativeDeploy) * gasPriceWei,
  );
  const evmErc20CollateralCost = weiToPruv(
    BigInt(EVM_GAS_ESTIMATES.hypERC20CollateralDeploy) * gasPriceWei,
  );
  const evmErc20DeployCost = weiToPruv(
    BigInt(EVM_GAS_ESTIMATES.erc20Deploy) * gasPriceWei,
  );
  const evmEnrollCost = weiToPruv(
    BigInt(EVM_GAS_ESTIMATES.enrollRemoteRouter) * gasPriceWei,
  );

  console.log('');
  console.log('  EVM Steps (pruvtest):');
  console.log(
    `    Deploy HypNative (PRUV warp)    : ~${formatPruv(evmHypNativeCost)}`,
  );
  console.log(
    `    Deploy HypERC20Collateral (each): ~${formatPruv(evmErc20CollateralCost)}`,
  );
  console.log(
    `    Deploy ERC20 token (each)        : ~${formatPruv(evmErc20DeployCost)}`,
  );
  console.log(
    `    enrollRemoteRouter (each)        : ~${formatPruv(evmEnrollCost)}`,
  );
  console.log('');
  console.log('  Solana Steps (Option A — warp routes only):');
  console.log(
    `    Deploy PRUV warp (token_native)  : ~${formatSol(warpNativeCost)}`,
  );
  console.log(
    `    Deploy USDC warp (synthetic)     : ~${formatSol(warpSyntheticCost)}`,
  );
  console.log(
    `    Deploy ERC20 warp (collateral)   : ~${formatSol(warpCollateralCost)}`,
  );
  console.log(
    `    Fund ATA payer (each)            : ~${formatSol(ataPayer)} (recommended)`,
  );
  console.log('');
  console.log('  Solana Steps (Option B — core programs, one-time):');
  for (const cost of coreCosts) {
    console.log(
      `    Deploy ${cost.name.padEnd(30)}: ~${formatSol(cost.totalSol)}`,
    );
  }
  console.log(
    `    Core programs total (one-time)   : ~${formatSol(coreTotalSol)}`,
  );

  // ─── Wallet Funding Recommendations ─────────────────────────────────────

  printSection('WALLET FUNDING RECOMMENDATIONS');
  console.log('');
  console.log(
    '  Solana testnet wallet (use `solana airdrop` on testnet — max 2 SOL/request):',
  );
  console.log(
    `    Option A (warp routes only)      : ${formatSol(solanaTotalOptionA + 1.0)} (includes 1 SOL buffer)`,
  );
  console.log(
    `    Option B (own core + warp routes): ${formatSol(solanaTotalOptionB + 2.0)} (includes 2 SOL buffer)`,
  );
  console.log('');
  console.log('  Relayer payer wallet (Solana) — ongoing relay fees:');
  console.log(`    Recommended initial funding      : ${formatSol(1.0)}`);
  console.log('');
  console.log('  pruvtest wallet:');
  console.log(
    `    Total PRUV for all EVM steps     : ~${formatPruv(evmTotalPruv + 0.5)} (includes 0.5 PRUV buffer)`,
  );
  console.log('');
  console.log('  Note: Solana testnet SOL can be obtained for free via:');
  console.log(
    '    solana airdrop 2 <WALLET_ADDRESS> --url https://api.testnet.solana.com',
  );
  console.log(
    '  Repeat the airdrop as needed (1-2 SOL per request, rate-limited).',
  );

  console.log('');
  printSeparator('═');
  console.log('  Estimation complete.');
  console.log(
    '  Amounts are estimates only; actual costs may vary with network conditions.',
  );
  printSeparator('═');
  console.log('');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
