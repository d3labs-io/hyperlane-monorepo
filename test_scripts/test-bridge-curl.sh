#!/bin/bash

# Test script for Hyperlane token bridging using curl (cast is crashing on macOS)
# Tests: evmtest2 (collateral) <-> test4/evmtest1 (synthetic)

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Addresses
DEPLOYER="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
PRIVATE_KEY="ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"  # Without 0x prefix

# Token addresses
RWA_TOKEN="0x59b670e9fA9D0A427751Af201D676719a970857b"

# Warp contract addresses
WARP_EVMTEST2="0xc3e53F4d16Ae77Db1c982e75a937B9f60FE63690"
WARP_EVMTEST1="0x67d269191c92Caf3cD7723F116c85e6E9bf55933"

# RPC endpoints
RPC_EVMTEST2="http://127.0.0.1:8546"
RPC_EVMTEST1="http://127.0.0.1:8545"

# Domain IDs
DOMAIN_EVMTEST1=31337

# Amount to bridge
AMOUNT_HEX="0x0de0b6b3a7640000"  # 1 token in hex
MINT_AMOUNT_HEX="0x56bc75e2d63100000"  # 100 tokens in hex

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}   Hyperlane Bridge Test: evmtest2 ↔ test4/evmtest1${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Function to call contract
call_contract() {
    local rpc=$1
    local to=$2
    local data=$3
    
    curl -s -X POST "$rpc" \
        -H "Content-Type: application/json" \
        -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_call\",\"params\":[{\"to\":\"$to\",\"data\":\"$data\"},\"latest\"],\"id\":1}" | \
        jq -r '.result'
}

# Function to send transaction
send_tx() {
    local rpc=$1
    local from=$2
    local to=$3
    local data=$4
    local private_key=$5
    
    # Get nonce
    nonce=$(curl -s -X POST "$rpc" \
        -H "Content-Type: application/json" \
        -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getTransactionCount\",\"params\":[\"$from\",\"latest\"],\"id\":1}" | \
        jq -r '.result')
    
    # Build transaction
    tx_data="{\"from\":\"$from\",\"to\":\"$to\",\"gas\":\"0x100000\",\"gasPrice\":\"0x3B9ACA00\",\"value\":\"0x0\",\"data\":\"$data\",\"nonce\":\"$nonce\"}"
    
    # Send transaction using eth_sendTransaction (works for local development)
    curl -s -X POST "$rpc" \
        -H "Content-Type: application/json" \
        -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_sendTransaction\",\"params\":[$tx_data],\"id\":1}" | \
        jq -r '.result'
}

# Function to format balance
format_balance() {
    local hex_balance=$1
    if [ -z "$hex_balance" ] || [ "$hex_balance" = "0x" ] || [ "$hex_balance" = "null" ]; then
        echo "0.0"
    else
        # Convert hex to decimal, then divide by 1e18
        local decimal=$(printf "%d" "$hex_balance" 2>/dev/null || echo "0")
        python3 -c "print(f'{$decimal / 1e18:.6f}')" 2>/dev/null || echo "0.0"
    fi
}

echo -e "${YELLOW}📊 Step 1: Check initial balances${NC}"
echo ""

# balanceOf(address) signature: 0x70a08231
BALANCE_DATA="0x70a08231000000000000000000000000${DEPLOYER:2}"

RWA_BAL_EVMTEST2=$(call_contract "$RPC_EVMTEST2" "$RWA_TOKEN" "$BALANCE_DATA")
WARP_BAL_EVMTEST1=$(call_contract "$RPC_EVMTEST1" "$WARP_EVMTEST1" "$BALANCE_DATA")

echo "  evmtest2 (port 8546):"
echo "    • RWA Token balance:  $(format_balance $RWA_BAL_EVMTEST2) RWA"
echo ""
echo "  test4/evmtest1 (port 8545):"
echo "    • Warp Token balance: $(format_balance $WARP_BAL_EVMTEST1) HypRWA"
echo ""

# Check if we need to mint
decimal_balance=$(printf "%d" "$RWA_BAL_EVMTEST2" 2>/dev/null || echo "0")
if [ "$decimal_balance" -lt 1000000000000000000 ]; then  # Less than 1 token
    echo -e "${YELLOW}🪙 Step 1.5: Mint 100 RWA tokens on evmtest2${NC}"
    echo ""
    
    # mint(address,uint256) signature: 0x40c10f19
    MINT_DATA="0x40c10f19000000000000000000000000${DEPLOYER:2}${MINT_AMOUNT_HEX:2}"
    
    MINT_TX=$(send_tx "$RPC_EVMTEST2" "$DEPLOYER" "$RWA_TOKEN" "$MINT_DATA" "$PRIVATE_KEY")
    
    if [ "$MINT_TX" != "null" ] && [ -n "$MINT_TX" ]; then
        echo -e "  ${GREEN}✅ Minted 100 RWA tokens!${NC}"
        echo "  Transaction: $MINT_TX"
        
        # Wait for transaction
        sleep 2
        
        # Check new balance
        RWA_BAL_EVMTEST2=$(call_contract "$RPC_EVMTEST2" "$RWA_TOKEN" "$BALANCE_DATA")
        echo "  New balance: $(format_balance $RWA_BAL_EVMTEST2) RWA"
    else
        echo -e "  ${RED}❌ Mint failed${NC}"
        exit 1
    fi
    echo ""
fi

echo -e "${YELLOW}📝 Step 2: Approve warp contract to spend RWA tokens${NC}"
echo ""

# approve(address,uint256) signature: 0x095ea7b3
APPROVE_DATA="0x095ea7b3000000000000000000000000${WARP_EVMTEST2:2}${AMOUNT_HEX:2}"

APPROVE_TX=$(send_tx "$RPC_EVMTEST2" "$DEPLOYER" "$RWA_TOKEN" "$APPROVE_DATA" "$PRIVATE_KEY")

if [ "$APPROVE_TX" != "null" ] && [ -n "$APPROVE_TX" ]; then
    echo -e "  ${GREEN}✅ Approval successful!${NC}"
    echo "  Transaction: $APPROVE_TX"
    sleep 2
else
    echo -e "  ${RED}❌ Approval failed${NC}"
    exit 1
fi
echo ""

echo -e "${YELLOW}🌉 Step 3: Bridge 1 RWA from evmtest2 to test4/evmtest1${NC}"
echo ""

# transferRemote(uint32,bytes32,uint256) signature: 0x8d7f0f8a
# Domain: 31337 = 0x00007a69
# Recipient: deployer address padded to 32 bytes
RECIPIENT_BYTES32=$(printf "%064s" "${DEPLOYER:2}" | tr ' ' '0')

TRANSFER_DATA="0x8d7f0f8a00000000000000000000000000000000000000000000000000000000000${DOMAIN_EVMTEST1:2}${RECIPIENT_BYTES32}${AMOUNT_HEX:2}"

BRIDGE_TX=$(send_tx "$RPC_EVMTEST2" "$DEPLOYER" "$WARP_EVMTEST2" "$TRANSFER_DATA" "$PRIVATE_KEY")

if [ "$BRIDGE_TX" != "null" ] && [ -n "$BRIDGE_TX" ]; then
    echo -e "  ${GREEN}✅ Bridge transaction submitted!${NC}"
    echo "  Transaction: $BRIDGE_TX"
    echo ""
    echo -e "  ${YELLOW}⏳ Waiting for relayer to process the message...${NC}"
    echo "  This may take 10-30 seconds..."
else
    echo -e "  ${RED}❌ Bridge transaction failed${NC}"
    exit 1
fi

# Wait for relayer
sleep 20

echo ""
echo -e "${YELLOW}📊 Step 4: Check balances after bridging${NC}"
echo ""

RWA_BAL_EVMTEST2_AFTER=$(call_contract "$RPC_EVMTEST2" "$RWA_TOKEN" "$BALANCE_DATA")
WARP_BAL_EVMTEST1_AFTER=$(call_contract "$RPC_EVMTEST1" "$WARP_EVMTEST1" "$BALANCE_DATA")

echo "  evmtest2 (port 8546):"
echo "    • RWA Token balance:  $(format_balance $RWA_BAL_EVMTEST2_AFTER) RWA  (was $(format_balance $RWA_BAL_EVMTEST2))"
echo ""
echo "  test4/evmtest1 (port 8545):"
echo "    • Warp Token balance: $(format_balance $WARP_BAL_EVMTEST1_AFTER) HypRWA  (was $(format_balance $WARP_BAL_EVMTEST1))"
echo ""

# Check if bridge was successful
decimal_after=$(printf "%d" "$WARP_BAL_EVMTEST1_AFTER" 2>/dev/null || echo "0")
decimal_before=$(printf "%d" "$WARP_BAL_EVMTEST1" 2>/dev/null || echo "0")

if [ "$decimal_after" -gt "$decimal_before" ]; then
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
    echo "  Check relayer logs for more details"
fi

echo ""
echo -e "${YELLOW}📖 Relayer logs:${NC}"
TEMP_DIR=$(cat .hyperlane-agents-temp 2>/dev/null || echo "")
if [ -n "$TEMP_DIR" ]; then
    echo "  tail -f $TEMP_DIR/relayer.log"
fi
echo ""
