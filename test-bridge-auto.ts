import { ethers } from 'ethers';
import * as fs from 'fs';

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

async function testBridge() {
  console.log('🌉 Testing Hyperlane Token Bridge\n');

  // Read deployed addresses from config
  const configPath =
    './typescript/cli/.hyperlane/deployments/warp_routes/RWA/local-warp-route-config.yaml';

  if (!fs.existsSync(configPath)) {
    console.error(`❌ Config file not found: ${configPath}`);
    console.error('Please deploy warp routes first!');
    process.exit(1);
  }

  // Parse addresses from config
  const configContent = fs.readFileSync(configPath, 'utf8');
  const lines = configContent.split('\n');

  let WARP_EVMTEST2 = '';
  let WARP_TEST4 = '';
  let RWA_TOKEN = '';
  let currentAddress = '';
  let currentChain = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Look for addressOrDenom line
    const addrMatch = line.match(/addressOrDenom:\s*["']([^"']+)["']/);
    if (addrMatch) {
      currentAddress = addrMatch[1];
    }

    // Look for collateralAddressOrDenom (RWA token)
    const collateralMatch = line.match(
      /collateralAddressOrDenom:\s*["']([^"']+)["']/,
    );
    if (collateralMatch) {
      RWA_TOKEN = collateralMatch[1];
    }

    // Look for chainName and assign the address
    const chainMatch = line.match(/chainName:\s*(\w+)/);
    if (chainMatch && currentAddress) {
      currentChain = chainMatch[1];
      if (currentChain === 'evmtest2') {
        WARP_EVMTEST2 = currentAddress;
      } else if (currentChain === 'test4') {
        WARP_TEST4 = currentAddress;
      }
      currentAddress = '';
    }
  }

  if (!WARP_EVMTEST2 || !WARP_TEST4 || !RWA_TOKEN) {
    console.error('❌ Could not parse addresses from config file');
    console.error(
      `Found: WARP_EVMTEST2=${WARP_EVMTEST2}, WARP_TEST4=${WARP_TEST4}, RWA_TOKEN=${RWA_TOKEN}`,
    );
    process.exit(1);
  }

  console.log('📝 Using addresses from deployment:');
  console.log(`  RWA Token: ${RWA_TOKEN}`);
  console.log(`  Warp (evmtest2): ${WARP_EVMTEST2}`);
  console.log(`  Warp (test4): ${WARP_TEST4}\n`);

  // Setup
  const providerEvmtest2 = new ethers.providers.JsonRpcProvider(
    'http://127.0.0.1:8546',
  );
  const providerTest4 = new ethers.providers.JsonRpcProvider(
    'http://127.0.0.1:8545',
  );

  const privateKey =
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
  const wallet1 = new ethers.Wallet(privateKey, providerEvmtest2);
  const wallet2 = new ethers.Wallet(privateKey, providerTest4);

  const rwaToken = new ethers.Contract(RWA_TOKEN, ERC20_ABI, wallet1);
  const warpEvmtest2 = new ethers.Contract(WARP_EVMTEST2, WARP_ABI, wallet1);
  const warpTest4 = new ethers.Contract(WARP_TEST4, WARP_ABI, wallet2);

  try {
    // Step 1: Check initial balances
    console.log('📊 Step 1: Initial balances');
    const rwaBalance = await rwaToken.balanceOf(wallet1.address);
    const hypBalance = await warpTest4.balanceOf(wallet1.address);
    console.log(`  RWA on evmtest2: ${ethers.utils.formatEther(rwaBalance)}`);
    console.log(`  HypRWA on test4: ${ethers.utils.formatEther(hypBalance)}\n`);

    // Verify router is enrolled
    console.log('🔍 Checking router enrollment...');
    const router = await warpEvmtest2.routers(31337);
    const expectedRouter = ethers.utils.hexZeroPad(WARP_TEST4, 32);
    console.log(`  Router for domain 31337: ${router}`);
    console.log(`  Expected: ${expectedRouter}`);
    if (router.toLowerCase() !== expectedRouter.toLowerCase()) {
      throw new Error(
        'Router not enrolled! Please run: npx ts-node enroll-routers-simple.ts',
      );
    }
    console.log('  ✅ Router correctly enrolled\n');

    // Step 2: Approve
    console.log('📝 Step 2: Approve warp contract');
    const allowance = await rwaToken.allowance(wallet1.address, WARP_EVMTEST2);
    const amountToTransfer = ethers.utils.parseEther('1');

    if (allowance.lt(amountToTransfer)) {
      console.log('  Approving...');
      const approveTx = await rwaToken.approve(WARP_EVMTEST2, amountToTransfer);
      await approveTx.wait();
      console.log(`  ✅ Approved: ${approveTx.hash}\n`);
    } else {
      console.log(
        `  ✅ Already approved (allowance: ${ethers.utils.formatEther(allowance)})\n`,
      );
    }

    // Step 3: Bridge
    console.log('🌉 Step 3: Initiating bridge transfer');
    const recipientBytes32 = ethers.utils.hexZeroPad(wallet1.address, 32);

    console.log(`  From: evmtest2 (domain 31338)`);
    console.log(`  To: test4 (domain 31337)`);
    console.log(`  Amount: 1 RWA`);
    console.log(`  Recipient: ${wallet1.address}`);
    console.log('');

    const bridgeTx = await warpEvmtest2.transferRemote(
      31337, // destination domain (test4)
      recipientBytes32,
      amountToTransfer,
      { gasLimit: 500000 },
    );

    console.log(`  TX submitted: ${bridgeTx.hash}`);
    const receipt = await bridgeTx.wait();
    console.log(`  ✅ TX confirmed! Gas used: ${receipt.gasUsed.toString()}\n`);

    // Step 4: Wait for relayer
    console.log('⏳ Waiting for relayer to process message (20 seconds)...');
    await new Promise((resolve) => setTimeout(resolve, 20000));
    console.log('');

    // Step 5: Check final balances
    console.log('📊 Step 5: Final balances');
    const rwaBalanceAfter = await rwaToken.balanceOf(wallet1.address);
    const hypBalanceAfter = await warpTest4.balanceOf(wallet1.address);
    console.log(
      `  RWA on evmtest2: ${ethers.utils.formatEther(rwaBalanceAfter)} (was ${ethers.utils.formatEther(rwaBalance)})`,
    );
    console.log(
      `  HypRWA on test4: ${ethers.utils.formatEther(hypBalanceAfter)} (was ${ethers.utils.formatEther(hypBalance)})`,
    );
    console.log('');

    if (hypBalanceAfter.gt(hypBalance)) {
      console.log('🎉 SUCCESS! Tokens bridged successfully!');
    } else {
      console.log('⚠️  Tokens not yet received. Check relayer logs.');
      console.log(
        '  Try running again or check if agents are running: ./start-agents.sh',
      );
    }
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

testBridge()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
