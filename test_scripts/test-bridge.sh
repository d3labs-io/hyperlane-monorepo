#!/bin/bash

# Test script for Hyperlane token bridging
# Tests: evmtest2 (collateral) <-> test4/evmtest1 (synthetic)

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Addresses
DEPLOYER="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

# Token addresses
RWA_TOKEN="0x59b670e9fA9D0A427751Af201D676719a970857b"  # Original RWA token on evmtest2

# Warp contract addresses
WARP_EVMTEST2="0xc3e53F4d16Ae77Db1c982e75a937B9f60FE63690"  # HypERC20Collateral on evmtest2
WARP_EVMTEST1="0x67d269191c92Caf3cD7723F116c85e6E9bf55933"  # HypERC20 (synthetic) on evmtest1/test4

# RPC endpoints
RPC_EVMTEST2="http://127.0.0.1:8546"
RPC_EVMTEST1="http://127.0.0.1:8545"

# Domain IDs (used for remote transfers)
DOMAIN_EVMTEST1=31337
DOMAIN_EVMTEST2=31338

# Amount to bridge (1 token = 1e18 wei)
AMOUNT="1000000000000000000"  # 1 RWA token

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}   Hyperlane Bridge Test: evmtest2 ↔ test4/evmtest1${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Function to get balance
get_balance() {
    local token=$1
    local owner=$2
    local rpc=$3
    
    cast call "$token" "balanceOf(address)(uint256)" "$owner" --rpc-url "$rpc" 2>/dev/null || echo "0"
}

# Function to format balance
format_balance() {
    local balance=$1
    if [ "$balance" = "0" ] || [ -z "$balance" ]; then
        echo "0.0"
    else
        # Convert from wei to ether (divide by 1e18)
        python3 -c "print(f'{$balance / 1e18:.6f}')" 2>/dev/null || echo "$balance"
    fi
}

echo -e "${YELLOW}📊 Step 1: Check initial balances${NC}"
echo ""

RWA_BAL_EVMTEST2=$(get_balance "$RWA_TOKEN" "$DEPLOYER" "$RPC_EVMTEST2")
WARP_BAL_EVMTEST2=$(get_balance "$WARP_EVMTEST2" "$DEPLOYER" "$RPC_EVMTEST2")
WARP_BAL_EVMTEST1=$(get_balance "$WARP_EVMTEST1" "$DEPLOYER" "$RPC_EVMTEST1")

echo "  evmtest2 (port 8546):"
echo "    • RWA Token balance:  $(format_balance $RWA_BAL_EVMTEST2) RWA"
echo "    • Warp Token balance: $(format_balance $WARP_BAL_EVMTEST2) HypRWA"
echo ""
echo "  test4/evmtest1 (port 8545):"
echo "    • Warp Token balance: $(format_balance $WARP_BAL_EVMTEST1) HypRWA"
echo ""

# Mint tokens if balance is 0
if [ "$RWA_BAL_EVMTEST2" = "0" ]; then
    echo -e "${YELLOW}🪙 Step 1.5: Mint 100 RWA tokens on evmtest2${NC}"
    echo ""
    
    MINT_AMOUNT="100000000000000000000"  # 100 tokens
    MINT_TX=$(cast send "$RWA_TOKEN" \
        "mint(address,uint256)" \
        "$DEPLOYER" \
        "$MINT_AMOUNT" \
        --private-key "$PRIVATE_KEY" \
        --rpc-url "$RPC_EVMTEST2" \
        --json 2>/dev/null | jq -r '.transactionHash' || echo "failed")
    
    if [ "$MINT_TX" != "failed" ] && [ -n "$MINT_TX" ]; then
        echo -e "  ${GREEN}✅ Minted 100 RWA tokens!${NC}"
        echo "  Transaction: $MINT_TX"
        
        # Update balance
        RWA_BAL_EVMTEST2=$(get_balance "$RWA_TOKEN" "$DEPLOYER" "$RPC_EVMTEST2")
        echo "  New balance: $(format_balance $RWA_BAL_EVMTEST2) RWA"
    else
        echo -e "  ${RED}❌ Mint failed${NC}"
        exit 1
    fi
    echo ""
fi

echo -e "${YELLOW}📝 Step 2: Approve warp contract to spend RWA tokens on evmtest2${NC}"
echo ""

# Approve the warp contract to spend our RWA tokens
APPROVE_TX=$(cast send "$RWA_TOKEN" \
    "approve(address,uint256)" \
    "$WARP_EVMTEST2" \
    "$AMOUNT" \
    --private-key "$PRIVATE_KEY" \
    --rpc-url "$RPC_EVMTEST2" \
    --json 2>/dev/null | jq -r '.transactionHash' || echo "failed")

if [ "$APPROVE_TX" != "failed" ] && [ -n "$APPROVE_TX" ]; then
    echo -e "  ${GREEN}✅ Approval successful!${NC}"
    echo "  Transaction: $APPROVE_TX"
else
    echo -e "  ${RED}❌ Approval failed${NC}"
    exit 1
fi
echo ""

echo -e "${YELLOW}🌉 Step 3: Bridge 1 RWA from evmtest2 to test4/evmtest1${NC}"
echo ""

# Call transferRemote on the warp contract
# transferRemote(uint32 _destination, bytes32 _recipient, uint256 _amount)
# Recipient needs to be bytes32 (address padded to 32 bytes)
RECIPIENT_BYTES32=$(printf "0x%064s" "${DEPLOYER:2}" | tr ' ' '0')

BRIDGE_TX=$(cast send "$WARP_EVMTEST2" \
    "transferRemote(uint32,bytes32,uint256)" \
    "$DOMAIN_EVMTEST1" \
    "$RECIPIENT_BYTES32" \
    "$AMOUNT" \
    --private-key "$PRIVATE_KEY" \
    --rpc-url "$RPC_EVMTEST2" \
    --json 2>/dev/null | jq -r '.transactionHash' || echo "failed")

if [ "$BRIDGE_TX" != "failed" ] && [ -n "$BRIDGE_TX" ]; then
    echo -e "  ${GREEN}✅ Bridge transaction submitted!${NC}"
    echo "  Transaction: $BRIDGE_TX"
    echo ""
    echo -e "  ${YELLOW}⏳ Waiting for relayer to process the message...${NC}"
    echo "  This may take 10-30 seconds..."
else
    echo -e "  ${RED}❌ Bridge transaction failed${NC}"
    exit 1
fi

# Wait for relayer to process
sleep 20

echo ""
echo -e "${YELLOW}📊 Step 4: Check balances after bridging${NC}"
echo ""

RWA_BAL_EVMTEST2_AFTER=$(get_balance "$RWA_TOKEN" "$DEPLOYER" "$RPC_EVMTEST2")
WARP_BAL_EVMTEST2_AFTER=$(get_balance "$WARP_EVMTEST2" "$DEPLOYER" "$RPC_EVMTEST2")
WARP_BAL_EVMTEST1_AFTER=$(get_balance "$WARP_EVMTEST1" "$DEPLOYER" "$RPC_EVMTEST1")

echo "  evmtest2 (port 8546):"
echo "    • RWA Token balance:  $(format_balance $RWA_BAL_EVMTEST2_AFTER) RWA  (was $(format_balance $RWA_BAL_EVMTEST2))"
echo "    • Warp Token balance: $(format_balance $WARP_BAL_EVMTEST2_AFTER) HypRWA"
echo ""
echo "  test4/evmtest1 (port 8545):"
echo "    • Warp Token balance: $(format_balance $WARP_BAL_EVMTEST1_AFTER) HypRWA  (was $(format_balance $WARP_BAL_EVMTEST1))"
echo ""

# Check if bridge was successful
if [ "$WARP_BAL_EVMTEST1_AFTER" -gt "$WARP_BAL_EVMTEST1" ]; then
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}✅ SUCCESS! Tokens were bridged successfully!${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "  • 1 RWA token was locked on evmtest2"
    echo "  • 1 HypRWA token was minted on test4/evmtest1"
    echo "  • Relayer successfully processed the message!"
else
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}⏳ Message may still be processing...${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "  Check relayer logs:"
    TEMP_DIR=$(cat .hyperlane-agents-temp 2>/dev/null)
    echo "  tail -f $TEMP_DIR/relayer.log"
fi

echo ""
echo -e "${YELLOW}📖 Additional commands:${NC}"
echo ""
echo "  # Check relayer logs:"
TEMP_DIR=$(cat .hyperlane-agents-temp 2>/dev/null)
echo "  tail -f $TEMP_DIR/relayer.log"
echo ""
echo "  # Check RWA balance on evmtest2:"
echo "  cast call $RWA_TOKEN 'balanceOf(address)(uint256)' $DEPLOYER --rpc-url $RPC_EVMTEST2"
echo ""
echo "  # Check HypRWA balance on test4/evmtest1:"
echo "  cast call $WARP_EVMTEST1 'balanceOf(address)(uint256)' $DEPLOYER --rpc-url $RPC_EVMTEST1"
echo ""
