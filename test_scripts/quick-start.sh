#!/bin/bash

# Quick Start Script - Starts chains and agents with existing contracts
# Use this when contracts are already deployed and addresses are saved

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}   🚀 Quick Start - Hyperlane Local Bridge${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

PROJECT_ROOT="/Users/sotatek/Desktop/pruv-bridge-sc"
cd "$PROJECT_ROOT"

echo -e "${YELLOW}📋 This script will:${NC}"
echo "  1. Start local EVM chains (Anvil)"
echo "  2. Start Solana test validator"
echo "  3. Check if contracts need redeployment"
echo "  4. Start Hyperlane agents"
echo ""
echo -e "${RED}⚠️  WARNING: Anvil restarts lose all state!${NC}"
echo "   You'll need to redeploy contracts if chains restarted."
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

# Check if chains are already running
echo -e "${YELLOW}🔍 Checking if chains are already running...${NC}"

if curl -s -X POST http://127.0.0.1:8545 -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' > /dev/null 2>&1; then
    echo -e "  ${GREEN}✅ test4 (port 8545) is running${NC}"
    TEST4_RUNNING=true
else
    echo -e "  ${RED}❌ test4 (port 8545) is NOT running${NC}"
    TEST4_RUNNING=false
fi

if curl -s -X POST http://127.0.0.1:8546 -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' > /dev/null 2>&1; then
    echo -e "  ${GREEN}✅ evmtest2 (port 8546) is running${NC}"
    EVMTEST2_RUNNING=true
else
    echo -e "  ${RED}❌ evmtest2 (port 8546) is NOT running${NC}"
    EVMTEST2_RUNNING=false
fi

if solana cluster-version --url http://127.0.0.1:8899 > /dev/null 2>&1; then
    echo -e "  ${GREEN}✅ Solana (port 8899) is running${NC}"
    SOLANA_RUNNING=true
else
    echo -e "  ${RED}❌ Solana (port 8899) is NOT running${NC}"
    SOLANA_RUNNING=false
fi

echo ""

# Start any missing chains
if [ "$TEST4_RUNNING" = false ] || [ "$EVMTEST2_RUNNING" = false ] || [ "$SOLANA_RUNNING" = false ]; then
    echo -e "${YELLOW}⚠️  Some chains are not running.${NC}"
    echo ""
    echo "To start chains manually, open separate terminals and run:"
    echo ""
    if [ "$TEST4_RUNNING" = false ]; then
        echo "  Terminal 1:"
        echo "  cd $PROJECT_ROOT && anvil --port 8545 --chain-id 31337"
        echo ""
    fi
    if [ "$EVMTEST2_RUNNING" = false ]; then
        echo "  Terminal 2:"
        echo "  cd $PROJECT_ROOT && anvil --port 8546 --chain-id 31338"
        echo ""
    fi
    if [ "$SOLANA_RUNNING" = false ]; then
        echo "  Terminal 3:"
        echo "  cd $PROJECT_ROOT && solana-test-validator --reset"
        echo ""
    fi
    echo "Then run this script again."
    exit 1
fi

# Check if agents are running
echo -e "${YELLOW}🔍 Checking if agents are running...${NC}"
if pgrep -f "validator|relayer" > /dev/null; then
    echo -e "  ${YELLOW}⚠️  Agents are already running${NC}"
    echo ""
    read -p "Stop and restart them? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        ./stop-agents.sh
        sleep 2
    else
        echo "Keeping existing agents running."
        exit 0
    fi
fi

# Start agents
echo ""
echo -e "${GREEN}🚀 Starting Hyperlane agents...${NC}"
./start-agents.sh

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Quick start complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}📋 Next Steps:${NC}"
echo ""
echo "1. Test the bridge:"
echo "   npx ts-node test-bridge.ts"
echo ""
echo "2. View logs:"
echo "   TEMP_DIR=\$(cat .hyperlane-agents-temp)"
echo "   tail -f \$TEMP_DIR/relayer.log"
echo ""
echo "3. Stop everything:"
echo "   ./stop-agents.sh"
echo ""
