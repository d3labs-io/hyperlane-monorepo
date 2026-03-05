import { ethers } from 'ethers';
import * as fs from 'fs';

// Contract ABI for enrollRemoteRouters
const MAILBOX_CLIENT_ABI = [
  'function enrollRemoteRouters(uint32[] calldata _domains, bytes32[] calldata _routers) external',
  'function routers(uint32 _domain) external view returns (bytes32)',
  'function owner() external view returns (address)',
];

async function simpleEnrollRouters() {
  console.log('🔧 Auto-Enrolling Remote Routers...\n');

  // Read deployed warp route config
  const configDir = './typescript/cli/.hyperlane/deployments/warp_routes/RWA';
  const configPath = `${configDir}/local-warp-route-config.yaml`;

  if (!fs.existsSync(configPath)) {
    console.error(`❌ Config file not found: ${configPath}`);
    console.error('Please deploy warp routes first (Step 5).');
    process.exit(1);
  }

  // Read and parse the YAML manually (simple parsing for our use case)
  const configContent = fs.readFileSync(configPath, 'utf8');

  // Split by token entries and extract addresses
  const lines = configContent.split('\n');
  let WARP_EVMTEST2 = '';
  let WARP_TEST4 = '';
  let currentAddress = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Look for addressOrDenom line
    const addrMatch = line.match(/addressOrDenom:\s*["']([^"']+)["']/);
    if (addrMatch) {
      currentAddress = addrMatch[1];
    }

    // Look for chainName and assign the address we just found
    const chainMatch = line.match(/chainName:\s*(\w+)/);
    if (chainMatch && currentAddress) {
      if (chainMatch[1] === 'evmtest2') {
        WARP_EVMTEST2 = currentAddress;
      } else if (chainMatch[1] === 'test4') {
        WARP_TEST4 = currentAddress;
      }
      currentAddress = ''; // Reset for next token
    }
  }

  if (!WARP_EVMTEST2 || !WARP_TEST4) {
    console.error('❌ Could not parse addresses from config file');
    console.error(`Found: evmtest2=${WARP_EVMTEST2}, test4=${WARP_TEST4}`);
    process.exit(1);
  }

  console.log('📝 Using addresses from config:');
  console.log(`  evmtest2: ${WARP_EVMTEST2}`);
  console.log(`  test4: ${WARP_TEST4}\n`);

  // Setup providers and wallet
  const providerEvmtest2 = new ethers.providers.JsonRpcProvider(
    'http://127.0.0.1:8546',
  );
  const providerTest4 = new ethers.providers.JsonRpcProvider(
    'http://127.0.0.1:8545',
  );

  const privateKey =
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
  const walletEvmtest2 = new ethers.Wallet(privateKey, providerEvmtest2);
  const walletTest4 = new ethers.Wallet(privateKey, providerTest4);

  // Verify contracts exist
  console.log('🔍 Verifying contracts exist...');
  const code1 = await providerEvmtest2.getCode(WARP_EVMTEST2);
  const code2 = await providerTest4.getCode(WARP_TEST4);

  if (code1 === '0x') {
    console.error(`❌ No contract found at evmtest2 address: ${WARP_EVMTEST2}`);
    console.error('Please deploy warp routes first!');
    process.exit(1);
  }

  if (code2 === '0x') {
    console.error(`❌ No contract found at test4 address: ${WARP_TEST4}`);
    console.error('Please deploy warp routes first!');
    process.exit(1);
  }

  console.log('  ✅ Both contracts exist\n');

  // Connect to contracts
  const warpEvmtest2 = new ethers.Contract(
    WARP_EVMTEST2,
    MAILBOX_CLIENT_ABI,
    walletEvmtest2,
  );
  const warpTest4 = new ethers.Contract(
    WARP_TEST4,
    MAILBOX_CLIENT_ABI,
    walletTest4,
  );

  try {
    // Check owners
    console.log('📋 Checking owners...');
    const owner1 = await warpEvmtest2.owner();
    const owner2 = await warpTest4.owner();
    console.log(`  evmtest2 owner: ${owner1}`);
    console.log(`  test4 owner: ${owner2}`);
    console.log(`  Wallet address: ${walletEvmtest2.address}\n`);

    // Check current routers before enrollment
    console.log('📋 Checking current routers...');
    try {
      const router1Before = await warpEvmtest2.routers(31337);
      const router2Before = await warpTest4.routers(31338);
      console.log(`  evmtest2 router for domain 31337: ${router1Before}`);
      console.log(`  test4 router for domain 31338: ${router2Before}\n`);
    } catch (e: any) {
      console.log(`  Error checking routers: ${e.message}\n`);
    }

    // Enroll test4 router on evmtest2
    console.log('🔄 Step 1: Enrolling test4 router on evmtest2...');
    const domains1 = [31337];
    const routers1 = [ethers.utils.hexZeroPad(WARP_TEST4, 32)];

    console.log(`  Domain: ${domains1[0]}`);
    console.log(`  Router: ${routers1[0]}`);

    const tx1 = await warpEvmtest2.enrollRemoteRouters(domains1, routers1, {
      gasLimit: 500000,
    });
    console.log(`  TX submitted: ${tx1.hash}`);
    await tx1.wait();
    console.log(`  ✅ Confirmed!\n`);

    // Enroll evmtest2 router on test4
    console.log('🔄 Step 2: Enrolling evmtest2 router on test4...');
    const domains2 = [31338];
    const routers2 = [ethers.utils.hexZeroPad(WARP_EVMTEST2, 32)];

    console.log(`  Domain: ${domains2[0]}`);
    console.log(`  Router: ${routers2[0]}`);

    const tx2 = await warpTest4.enrollRemoteRouters(domains2, routers2, {
      gasLimit: 500000,
    });
    console.log(`  TX submitted: ${tx2.hash}`);
    await tx2.wait();
    console.log(`  ✅ Confirmed!\n`);

    // Verify enrollment
    console.log('✅ Verifying enrollment...');
    const router1After = await warpEvmtest2.routers(31337);
    const router2After = await warpTest4.routers(31338);

    console.log(`  evmtest2 router for domain 31337: ${router1After}`);
    console.log(`  test4 router for domain 31338: ${router2After}`);

    const router1Expected = ethers.utils.hexZeroPad(WARP_TEST4, 32);
    const router2Expected = ethers.utils.hexZeroPad(WARP_EVMTEST2, 32);

    if (
      router1After.toLowerCase() === router1Expected.toLowerCase() &&
      router2After.toLowerCase() === router2Expected.toLowerCase()
    ) {
      console.log('\n🎉 SUCCESS! Routers enrolled correctly!');
    } else {
      console.log('\n⚠️  Warning: Router values do not match expected values');
    }
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.data) {
      console.error('Error data:', error.data);
    }
    if (error.error) {
      console.error('Inner error:', error.error);
    }
    process.exit(1);
  }
}

simpleEnrollRouters()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
