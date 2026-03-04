import { ethers } from 'ethers';
import * as fs from 'fs';

const ERC20_ABI = [
  'function mint(address to, uint256 amount) external',
  'function balanceOf(address account) external view returns (uint256)',
  'function owner() external view returns (address)',
];

async function mintTokens() {
  console.log('💰 Minting RWA Tokens\n');

  // Read RWA token address from config
  const configPath =
    './typescript/cli/.hyperlane/deployments/warp_routes/RWA/local-evm-evm-warp-config.yaml';

  if (!fs.existsSync(configPath)) {
    console.error(`❌ Config file not found: ${configPath}`);
    console.error('Please deploy warp routes first!');
    process.exit(1);
  }

  // Parse RWA token address from config
  const configContent = fs.readFileSync(configPath, 'utf8');
  const collateralMatch = configContent.match(
    /collateralAddressOrDenom:\s*["']([^"']+)["']/,
  );

  if (!collateralMatch) {
    console.error('❌ Could not find RWA token address in config');
    process.exit(1);
  }

  const RWA_TOKEN = collateralMatch[1];
  console.log(`📝 RWA Token: ${RWA_TOKEN}\n`);

  // Setup
  const provider = new ethers.providers.JsonRpcProvider(
    'http://127.0.0.1:8546',
  );
  const privateKey =
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
  const wallet = new ethers.Wallet(privateKey, provider);

  const rwaToken = new ethers.Contract(RWA_TOKEN, ERC20_ABI, wallet);

  try {
    // Check current balance
    console.log('📊 Current balance:');
    const balanceBefore = await rwaToken.balanceOf(wallet.address);
    console.log(`  ${ethers.utils.formatEther(balanceBefore)} RWA\n`);

    // Check owner
    console.log('🔍 Checking token owner...');
    const owner = await rwaToken.owner();
    console.log(`  Owner: ${owner}`);
    console.log(`  Wallet: ${wallet.address}`);

    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
      console.error('❌ Wallet is not the token owner!');
      process.exit(1);
    }
    console.log('  ✅ Wallet is the owner\n');

    // Mint tokens
    const mintAmount = ethers.utils.parseEther('1000'); // Mint 1000 RWA tokens
    console.log('🏭 Minting tokens...');
    console.log(`  Amount: 1000 RWA`);
    console.log(`  To: ${wallet.address}`);

    const tx = await rwaToken.mint(wallet.address, mintAmount, {
      gasLimit: 200000,
    });

    console.log(`  TX submitted: ${tx.hash}`);
    await tx.wait();
    console.log(`  ✅ Minted!\n`);

    // Check new balance
    console.log('📊 New balance:');
    const balanceAfter = await rwaToken.balanceOf(wallet.address);
    console.log(
      `  ${ethers.utils.formatEther(balanceAfter)} RWA (was ${ethers.utils.formatEther(balanceBefore)})\n`,
    );

    console.log(
      '🎉 SUCCESS! You can now test the bridge with: npx ts-node test-bridge-auto.ts',
    );
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

mintTokens()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
