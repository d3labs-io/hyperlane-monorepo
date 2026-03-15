/**
 * test-pruv-to-solana.ts
 *
 * Tests the Pruv Testnet → Solana Testnet bridge for each configured token.
 * Sends a small bridge transfer for each token and waits for the relayer to deliver.
 *
 * Usage:
 *   PRIVATE_KEY=0x... \
 *   RECIPIENT_SOLANA_PUBKEY=<BASE58_PUBLIC_KEY> \
 *   npx ts-node scripts/test-pruv-to-solana.ts
 *
 * Or update CONFIG below directly.
 */
import { Connection, PublicKey } from '@solana/web3.js';
import { ethers } from 'ethers';

// ─── Configuration ────────────────────────────────────────────────────────────

const CONFIG = {
  evmRpcUrl: 'https://rpc.testnet.pruv.network',
  solanaRpcUrl:
    'https://api.zan.top/node/v1/solana/testnet/a6fe1b27d8204694827438361ed0ff32',
  privateKey:
    process.env.PRIVATE_KEY ||
    '0x44928c5dabbb6e5791c8d13bd091dc794f2376d53693d40b85176d60404dcd3b',

  // Solana recipient public key (base58) — deployer wallet
  solanaRecipientPubkey:
    process.env.RECIPIENT_SOLANA_PUBKEY ||
    'FT1XRZnjth3E2HbVCqghYzYqcQskDLgQuDstuKGAd1pJ',

  // Solana Testnet domain ID — Hyperlane canonical value matching the deployed mailbox
  solanaDomain: 1399811150,

  // Tokens to test — fill in after deploying warp routes
  tokens: [
    {
      name: 'PRUV native',
      // HypNative warp contract on pruvtest — not yet deployed
      evmWarpAddress:
        process.env.PRUV_WARP_ADDRESS || 'REPLACE_WITH_PRUV_WARP_EVM_ADDRESS',
      // Set to empty string for native token (no ERC20 to approve)
      erc20Address: '',
      // Transfer amount in ETH-like units (18 decimals)
      amountHuman: '0.01',
      isNative: true,
    },
    {
      name: 'USDC (ERC20 collateral)',
      // Not yet deployed
      evmWarpAddress:
        process.env.USDC_WARP_ADDRESS || 'REPLACE_WITH_USDC_WARP_EVM_ADDRESS',
      erc20Address:
        process.env.USDC_ERC20_ADDRESS || 'REPLACE_WITH_USDC_ERC20_ADDRESS',
      amountHuman: '1',
      isNative: false,
    },
    {
      name: 'Custom ERC20 collateral (Wade)',
      // HypERC20Collateral warp contract deployed on pruvtest
      evmWarpAddress:
        process.env.CUSTOM_WARP_ADDRESS ||
        '0x433e1C2aDd37B6a6680E6ca28296D4C86C49a0B0',
      // Wade ERC20 token contract on pruvtest
      erc20Address:
        process.env.CUSTOM_ERC20_ADDRESS ||
        '0xB707f867D48A30fA8E210605BcA4970CA55b8389',
      amountHuman: '1',
      isNative: false,
    },
  ],
};

// ─── ABIs ─────────────────────────────────────────────────────────────────────

const ERC20_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function symbol() external view returns (string)',
];

const WARP_ABI = [
  'function transferRemote(uint32 _destinationDomain, bytes32 _recipient, uint256 _amount) external payable returns (bytes32 messageId)',
  'function quoteGasPayment(uint32 _destinationDomain) external view returns (uint256)',
  'function routers(uint32 _domain) external view returns (bytes32)',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pubkeyToBytes32(pubkey: string): string {
  const pk = new PublicKey(pubkey);
  return '0x' + Buffer.from(pk.toBytes()).toString('hex');
}

function printSeparator(): void {
  console.log('─'.repeat(60));
}

// ─── Per-token Test ───────────────────────────────────────────────────────────

async function testToken(
  wallet: ethers.Wallet,
  provider: ethers.providers.JsonRpcProvider,
  recipientBytes32: string,
  token: (typeof CONFIG.tokens)[0],
): Promise<void> {
  console.log('');
  printSeparator();
  console.log(`  Token: ${token.name}`);
  console.log(`  EVM Warp : ${token.evmWarpAddress}`);
  printSeparator();

  const warpContract = new ethers.Contract(
    token.evmWarpAddress,
    WARP_ABI,
    wallet,
  );

  // Verify router is enrolled
  const enrolledRouter = await warpContract.routers(CONFIG.solanaDomain);
  if (enrolledRouter === ethers.constants.HashZero) {
    console.log(
      `  ERROR: Solana router not enrolled for domain ${CONFIG.solanaDomain}.`,
    );
    console.log(`  Run: npx ts-node scripts/enroll-solana-testnet.ts`);
    return;
  }
  console.log(`  Solana router enrolled: ${enrolledRouter}`);

  // Quote gas payment
  const quote = await warpContract.quoteGasPayment(CONFIG.solanaDomain);
  console.log(
    `  Protocol fee (quoteGasPayment): ${ethers.utils.formatEther(quote)} PRUV`,
  );

  const amount = ethers.utils.parseEther(token.amountHuman);

  if (token.isNative) {
    // Native PRUV — no ERC20 approval needed; value includes amount + fee
    console.log(`  Sending ${token.amountHuman} PRUV (native) to Solana...`);
    const totalValue = amount.add(quote);

    const balance = await provider.getBalance(wallet.address);
    if (balance.lt(totalValue.mul(110).div(100))) {
      console.log(
        `  WARNING: Low balance. Have ${ethers.utils.formatEther(balance)} PRUV, need ~${ethers.utils.formatEther(totalValue)}.`,
      );
    }

    const tx = await warpContract.transferRemote(
      CONFIG.solanaDomain,
      recipientBytes32,
      amount,
      { value: totalValue, gasLimit: 500_000 },
    );
    console.log(`  TX submitted: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(
      `  Confirmed in block ${receipt.blockNumber}. Gas used: ${receipt.gasUsed.toString()}`,
    );
  } else {
    // ERC20 collateral — need approval first
    const erc20 = new ethers.Contract(token.erc20Address, ERC20_ABI, wallet);
    const symbol = await erc20.symbol();
    const balance = await erc20.balanceOf(wallet.address);
    console.log(`  ${symbol} balance: ${ethers.utils.formatEther(balance)}`);

    if (balance.lt(amount)) {
      console.log(
        `  ERROR: Insufficient ${symbol} balance. Have ${ethers.utils.formatEther(balance)}, need ${token.amountHuman}.`,
      );
      return;
    }

    let allowance = await erc20.allowance(wallet.address, token.evmWarpAddress);
    if (allowance.lt(amount)) {
      console.log(`  Approving ${symbol} for warp contract...`);
      const approveTx = await erc20.approve(token.evmWarpAddress, amount, {
        gasLimit: 100_000,
      });
      try {
        await approveTx.wait();
        console.log(`  Approved.`);
      } catch (approveErr: unknown) {
        // On pruvtest the relayer shares the same key and may replace our tx (nonce conflict).
        // Re-check the allowance: if it is already sufficient the approval effectively went through.
        const errCode =
          approveErr instanceof Error &&
          (approveErr as { code?: string }).code === 'TRANSACTION_REPLACED';
        if (errCode) {
          console.log(
            `  Approval tx replaced (nonce conflict with relayer) — re-checking allowance...`,
          );
          allowance = await erc20.allowance(
            wallet.address,
            token.evmWarpAddress,
          );
          if (allowance.lt(amount)) {
            console.log(
              `  Allowance still insufficient — retrying approval...`,
            );
            const retryTx = await erc20.approve(token.evmWarpAddress, amount, {
              gasLimit: 100_000,
            });
            await retryTx.wait();
            console.log(`  Approved (retry).`);
          } else {
            console.log(`  Allowance confirmed sufficient after replacement.`);
          }
        } else {
          throw approveErr;
        }
      }
    } else {
      console.log(`  Already approved.`);
    }

    console.log(`  Sending ${token.amountHuman} ${symbol} to Solana...`);
    const tx = await warpContract.transferRemote(
      CONFIG.solanaDomain,
      recipientBytes32,
      amount,
      { value: quote, gasLimit: 500_000 },
    );
    console.log(`  TX submitted: ${tx.hash}`);
    let receipt = await tx.wait().catch((err: unknown) => {
      // If our tx was speed-replaced (same data, new hash), ethers provides the replacement receipt
      if (
        err instanceof Error &&
        (
          err as {
            code?: string;
            replacement?: { hash: string };
            receipt?: unknown;
          }
        ).code === 'TRANSACTION_REPLACED' &&
        (err as { cancelled?: boolean }).cancelled === false
      ) {
        return (
          err as unknown as { receipt: ethers.providers.TransactionReceipt }
        ).receipt;
      }
      throw err;
    });
    console.log(
      `  Confirmed in block ${receipt.blockNumber}. Gas used: ${receipt.gasUsed.toString()}`,
    );
    console.log(
      `  View on explorer: https://explorer.testnet.pruv.network/tx/${receipt.transactionHash}`,
    );
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('  Pruv Testnet → Solana Testnet Bridge Test');
  console.log('='.repeat(60));

  if (CONFIG.solanaRecipientPubkey.startsWith('REPLACE')) {
    console.error(
      'ERROR: Set RECIPIENT_SOLANA_PUBKEY or update CONFIG.solanaRecipientPubkey',
    );
    process.exit(1);
  }

  // Convert Solana pubkey to bytes32
  let recipientBytes32: string;
  try {
    recipientBytes32 = pubkeyToBytes32(CONFIG.solanaRecipientPubkey);
  } catch {
    console.error(
      `ERROR: Invalid Solana public key: ${CONFIG.solanaRecipientPubkey}`,
    );
    process.exit(1);
  }

  console.log(`\n  pruvtest RPC     : ${CONFIG.evmRpcUrl}`);
  console.log(`  Solana RPC       : ${CONFIG.solanaRpcUrl}`);
  console.log(`  Solana domain    : ${CONFIG.solanaDomain}`);
  console.log(`  Solana recipient : ${CONFIG.solanaRecipientPubkey}`);
  console.log(`  Recipient bytes32: ${recipientBytes32}`);

  const provider = new ethers.providers.JsonRpcProvider(CONFIG.evmRpcUrl);
  const wallet = new ethers.Wallet(CONFIG.privateKey, provider);

  const balance = await provider.getBalance(wallet.address);
  console.log(`\n  EVM wallet : ${wallet.address}`);
  console.log(`  PRUV balance: ${ethers.utils.formatEther(balance)} PRUV`);

  let tested = 0;
  let skipped = 0;

  for (const token of CONFIG.tokens) {
    if (token.evmWarpAddress.startsWith('REPLACE')) {
      console.log(
        `\n  Skipping "${token.name}" — placeholder address not configured.`,
      );
      skipped++;
      continue;
    }
    try {
      await testToken(wallet, provider, recipientBytes32, token);
      tested++;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\n  ERROR testing "${token.name}": ${message}`);
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log(`  Tested: ${tested} token(s)  |  Skipped: ${skipped} token(s)`);
  console.log('='.repeat(60));
  console.log('');
  console.log('  The relayer will deliver messages to Solana asynchronously.');
  console.log(
    '  Monitor the relayer logs for "Message delivered on solanatestnet".',
  );
  console.log('');
  console.log('  To check Solana token balances after delivery:');
  console.log(
    `    spl-token accounts --owner ${CONFIG.solanaRecipientPubkey} --url https://api.testnet.solana.com`,
  );
  console.log('');
  console.log('  To check on Hyperlane Explorer:');
  console.log(
    '    https://explorer.hyperlane.xyz/?origin=pruvtest&destination=solanatestnet',
  );
}

main().catch((err) => {
  console.error('\nFatal:', err.message || err);
  process.exit(1);
});
