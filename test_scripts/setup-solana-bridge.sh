#!/bin/bash

# Complete Solana Bridge Setup Script
# This script performs a fresh Solana warp route deployment

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

PROJECT_ROOT="/Users/sotatek/Desktop/pruv-bridge-sc"
SEALEVEL_DIR="${PROJECT_ROOT}/rust/sealevel"
NEW_PROGRAM_KEYPAIR="${SEALEVEL_DIR}/new-warp-program.json"
TEST_WALLET="${PROJECT_ROOT}/test-solana-wallet.json"

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}   🚀 Fresh Solana Warp Route Deployment${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Step 1: Generate new program keypair
echo -e "${YELLOW}Step 1: Generating new Solana program keypair...${NC}"
if [ -f "$NEW_PROGRAM_KEYPAIR" ]; then
    echo "  Keypair already exists at $NEW_PROGRAM_KEYPAIR"
    NEW_PROGRAM_ID=$(solana-keygen pubkey "$NEW_PROGRAM_KEYPAIR")
else
    solana-keygen new --outfile "$NEW_PROGRAM_KEYPAIR" --no-bip39-passphrase --force
    NEW_PROGRAM_ID=$(solana-keygen pubkey "$NEW_PROGRAM_KEYPAIR")
fi
echo -e "  ${GREEN}✅ New program ID: $NEW_PROGRAM_ID${NC}"
echo ""

# Step 2: Fund the program account
echo -e "${YELLOW}Step 2: Funding program account...${NC}"
solana airdrop 5 "$NEW_PROGRAM_ID" --url http://127.0.0.1:8899 2>/dev/null || echo "  (Airdrop may have failed, continuing...)"
sleep 2
BALANCE=$(solana balance "$NEW_PROGRAM_ID" --url http://127.0.0.1:8899 2>/dev/null || echo "0 SOL")
echo "  Program balance: $BALANCE"
echo ""

# Step 3: Deploy the Solana program
echo -e "${YELLOW}Step 3: Deploying Solana warp program...${NC}"
echo "  This will take a few minutes..."
echo ""

cd "$SEALEVEL_DIR"

# Deploy using solana program deploy with the new keypair
solana program deploy \
    --program-id "$NEW_PROGRAM_KEYPAIR" \
    --url http://127.0.0.1:8899 \
    ./target/deploy/hyperlane_sealevel_token.so \
    2>&1 | tee /tmp/solana-program-deploy.log || {
        echo -e "${RED}❌ Program deployment failed${NC}"
        echo "Check /tmp/solana-program-deploy.log for details"
        exit 1
    }

echo -e "${GREEN}✅ Program deployed!${NC}"
echo ""

# Step 4: Initialize the warp route
echo -e "${YELLOW}Step 4: Initializing warp route with correct config...${NC}"

EVM_WARP_ADDRESS="0x36C02dA8a0983159322a80FFE9F24b1acfF8B570"
echo "  EVM collateral contract: $EVM_WARP_ADDRESS"
echo "  Solana program: $NEW_PROGRAM_ID"
echo ""

# Run the warp route deploy command (which should now work with the fresh program)
yes | cargo run --bin hyperlane-sealevel-client -- warp-route deploy \
    --environment local-e2e \
    --environments-dir ./environments \
    --built-so-dir ./target/deploy \
    --warp-route-name rwa-local \
    --token-config-file ./environments/local-e2e/warp-routes/rwa-local/token-config.json \
    --registry .hyperlane 2>&1 | tee /tmp/warp-route-init.log || {
        echo -e "${YELLOW}⚠️  Warp route init may have partial errors, continuing...${NC}"
    }

echo ""

# Step 5: Enroll the new Solana program on EVM
echo -e "${YELLOW}Step 5: Enrolling new Solana program on EVM contract...${NC}"

cd "$PROJECT_ROOT"

# Create temporary enrollment script
cat > /tmp/enroll-new-solana.ts << EOF
import { ethers } from 'ethers';

const MAILBOX_CLIENT_ABI = [
  'function enrollRemoteRouters(uint32[] calldata _domains, bytes32[] calldata _routers) external',
];

async function enroll() {
  const provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:8546');
  const wallet = new ethers.Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', provider);
  const warp = new ethers.Contract('0x36C02dA8a0983159322a80FFE9F24b1acfF8B570', MAILBOX_CLIENT_ABI, wallet);
  
  const bs58 = require('bs58');
  const solanaBytes = bs58.decode('$NEW_PROGRAM_ID');
  const solanaBytes32 = '0x' + Buffer.from(solanaBytes).toString('hex').padStart(64, '0');
  
  console.log('Enrolling Solana program on EVM...');
  const tx = await warp.enrollRemoteRouters([13375], [solanaBytes32], { gasLimit: 500000 });
  await tx.wait();
  console.log('✅ Enrolled! TX:', tx.hash);
}

enroll().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
EOF

npx ts-node /tmp/enroll-new-solana.ts
echo ""

# Step 6: Create test wallet
echo -e "${YELLOW}Step 6: Creating Solana test wallet...${NC}"
if [ ! -f "$TEST_WALLET" ]; then
    solana-keygen new --outfile "$TEST_WALLET" --no-bip39-passphrase --force
fi
TEST_WALLET_ADDR=$(solana-keygen pubkey "$TEST_WALLET")
echo "  Test wallet: $TEST_WALLET_ADDR"

# Fund it
solana airdrop 5 "$TEST_WALLET_ADDR" --url http://127.0.0.1:8899 2>/dev/null || echo "  (Airdrop may have failed)"
sleep 2
TEST_BALANCE=$(solana balance "$TEST_WALLET_ADDR" --url http://127.0.0.1:8899 2>/dev/null || echo "0 SOL")
echo "  Wallet balance: $TEST_BALANCE"
echo ""

# Summary
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}   ✅ Solana Bridge Setup Complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "📋 Deployment Summary:"
echo "  • New Solana program: $NEW_PROGRAM_ID"
echo "  • EVM contract: 0x36C02dA8a0983159322a80FFE9F24b1acfF8B570"
echo "  • Test wallet: $TEST_WALLET_ADDR"
echo ""
echo "🧪 Next Steps:"
echo "  1. Test the bridge with the test script"
echo "  2. Bridge tokens from EVM to Solana"
echo ""
echo "💾 Files created:"
echo "  • $NEW_PROGRAM_KEYPAIR"
echo "  • $TEST_WALLET"
echo ""
