#!/bin/bash

# Local 3-Chain Hyperlane Validator & Relayer Start Script
# Chains: evmtest1 (31337), evmtest2 (31338), solalocal (13375)

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting Hyperlane Agents for Local 3-Chain Setup${NC}"
echo ""

# Create temp directories for databases and checkpoints
TEMP_DIR=$(mktemp -d)
VALIDATOR_EVMTEST1_DB="$TEMP_DIR/validator-evmtest1"
VALIDATOR_EVMTEST2_DB="$TEMP_DIR/validator-evmtest2"
VALIDATOR_SOLALOCAL_DB="$TEMP_DIR/validator-solalocal"
RELAYER_DB="$TEMP_DIR/relayer"
CHECKPOINT_EVMTEST1="$TEMP_DIR/checkpoints-evmtest1"
CHECKPOINT_EVMTEST2="$TEMP_DIR/checkpoints-evmtest2"
CHECKPOINT_SOLALOCAL="$TEMP_DIR/checkpoints-solalocal"

mkdir -p "$VALIDATOR_EVMTEST1_DB" "$VALIDATOR_EVMTEST2_DB" "$VALIDATOR_SOLALOCAL_DB" "$RELAYER_DB"
mkdir -p "$CHECKPOINT_EVMTEST1" "$CHECKPOINT_EVMTEST2" "$CHECKPOINT_SOLALOCAL"

echo -e "${YELLOW}📂 Temp directories created at: $TEMP_DIR${NC}"
echo ""

# Default Anvil private key (Account #0)
VALIDATOR_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

# Agent config path (absolute path)
AGENT_CONFIG_PATH="/Users/sotatek/Desktop/pruv-bridge-sc/agent-config.json"

# Working directory for agents (they need to run from rust/main due to hardcoded ./config path)
AGENT_WORKING_DIR="/Users/sotatek/Desktop/pruv-bridge-sc/rust/main"

# Agent binary paths (relative to AGENT_WORKING_DIR)
VALIDATOR_BIN="./target/debug/validator"
RELAYER_BIN="./target/debug/relayer"

# Check if hyperlane agents are built
if [ ! -f "$AGENT_WORKING_DIR/target/debug/validator" ] || [ ! -f "$AGENT_WORKING_DIR/target/debug/relayer" ]; then
    echo -e "${YELLOW}⚠️  Hyperlane agents not found. Building...${NC}"
    cd "$AGENT_WORKING_DIR"
    cargo build --bin validator --bin relayer
    cd - > /dev/null
fi

# Temporarily rename the config directory to prevent loading mainnet/testnet configs
# We'll restore it when stopping the agents
if [ -d "$AGENT_WORKING_DIR/config" ] && [ ! -d "$AGENT_WORKING_DIR/config.backup" ]; then
    echo -e "${YELLOW}⚙️  Temporarily moving mainnet/testnet configs...${NC}"
    mv "$AGENT_WORKING_DIR/config" "$AGENT_WORKING_DIR/config.backup"
    # Create empty config dir to satisfy the agents
    mkdir "$AGENT_WORKING_DIR/config"
fi

echo -e "${GREEN}✅ Hyperlane agents found${NC}"
echo ""

# Function to start a validator for a specific chain
start_validator() {
    local chain_name=$1
    local db_path=$2
    local checkpoint_path=$3
    local rpc_url=$4
    local metrics_port=$5

    echo -e "${YELLOW}🔍 Starting validator for $chain_name...${NC}"
    
    cd "$AGENT_WORKING_DIR"
    HYP_BASE_CHAINS_${chain_name^^}_RPCURLS="$rpc_url" \
    HYP_BASE_CHAINS_${chain_name^^}_BLOCKS_REORGPERIOD="0" \
    HYP_BASE_ORIGINCHAINNAME="$chain_name" \
    HYP_BASE_DB="$db_path" \
    HYP_BASE_METRICSPORT="$metrics_port" \
    HYP_BASE_TRACING_LEVEL="info" \
    HYP_VALIDATOR_VALIDATOR_KEY="$VALIDATOR_KEY" \
    HYP_VALIDATOR_CHECKPOINTSYNCER_TYPE="localStorage" \
    HYP_VALIDATOR_CHECKPOINTSYNCER_PATH="$checkpoint_path" \
    HYP_VALIDATOR_INTERVAL="5" \
    CONFIG_FILES="$AGENT_CONFIG_PATH" \
    "$VALIDATOR_BIN" > "$TEMP_DIR/validator-$chain_name.log" 2>&1 &
    cd - > /dev/null
    
    echo $! > "$TEMP_DIR/validator-$chain_name.pid"
    echo -e "${GREEN}✅ Validator for $chain_name started (PID: $(cat $TEMP_DIR/validator-$chain_name.pid))${NC}"
}

# Function to start the relayer
start_relayer() {
    echo -e "${YELLOW}🔄 Starting relayer...${NC}"
    
    cd "$AGENT_WORKING_DIR"
    HYP_BASE_CHAINS_TEST4_RPCURLS="http://127.0.0.1:8545" \
    HYP_BASE_CHAINS_EVMTEST2_RPCURLS="http://127.0.0.1:8546" \
    HYP_BASE_CHAINS_SEALEVELTEST1_RPCURLS="http://127.0.0.1:8899" \
    HYP_BASE_CHAINS_TEST4_BLOCKS_REORGPERIOD="0" \
    HYP_BASE_CHAINS_EVMTEST2_BLOCKS_REORGPERIOD="0" \
    HYP_BASE_CHAINS_SEALEVELTEST1_BLOCKS_REORGPERIOD="0" \
    HYP_BASE_DB="$RELAYER_DB" \
    HYP_BASE_METRICSPORT="9093" \
    HYP_BASE_TRACING_LEVEL="info" \
    HYP_RELAYER_ALLOWLOCALCHECKPOINTSYNCERS="true" \
    HYP_RELAYER_DEFAULTSIGNER_KEY="$VALIDATOR_KEY" \
    HYP_RELAYER_GASPAYMENTENFORCEMENT='[{"type":"none"}]' \
    CONFIG_FILES="$AGENT_CONFIG_PATH" \
    "$RELAYER_BIN" > "$TEMP_DIR/relayer.log" 2>&1 &
    cd - > /dev/null
    
    echo $! > "$TEMP_DIR/relayer.pid"
    echo -e "${GREEN}✅ Relayer started (PID: $(cat $TEMP_DIR/relayer.pid))${NC}"
}

# Start validators for each chain
start_validator "test4" "$VALIDATOR_EVMTEST1_DB" "$CHECKPOINT_EVMTEST1" "http://127.0.0.1:8545" "9094"
sleep 2
start_validator "evmtest2" "$VALIDATOR_EVMTEST2_DB" "$CHECKPOINT_EVMTEST2" "http://127.0.0.1:8546" "9095"
sleep 2
start_validator "sealeveltest1" "$VALIDATOR_SOLALOCAL_DB" "$CHECKPOINT_SOLALOCAL" "http://127.0.0.1:8899" "9096"
sleep 2

# Start relayer
start_relayer
sleep 2

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ All agents started successfully!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}📊 Metrics:${NC}"
echo "  • Validator (test4):       http://localhost:9094/metrics"
echo "  • Validator (evmtest2):     http://localhost:9095/metrics"
echo "  • Validator (sealeveltest1): http://localhost:9096/metrics"
echo "  • Relayer:                  http://localhost:9093/metrics"
echo ""
echo -e "${YELLOW}📝 Logs:${NC}"
echo "  • Validator (test4):       tail -f $TEMP_DIR/validator-test4.log"
echo "  • Validator (evmtest2):     tail -f $TEMP_DIR/validator-evmtest2.log"
echo "  • Validator (sealeveltest1): tail -f $TEMP_DIR/validator-sealeveltest1.log"
echo "  • Relayer:                  tail -f $TEMP_DIR/relayer.log"
echo ""
echo -e "${YELLOW}🛑 To stop all agents:${NC}"
echo "  kill \$(cat $TEMP_DIR/validator-test4.pid) \$(cat $TEMP_DIR/validator-evmtest2.pid) \$(cat $TEMP_DIR/validator-sealeveltest1.pid) \$(cat $TEMP_DIR/relayer.pid)"
echo ""
echo -e "${YELLOW}🧹 Cleanup command:${NC}"
echo "  rm -rf $TEMP_DIR"
echo ""

# Save temp dir path for easy cleanup
echo "$TEMP_DIR" > .hyperlane-agents-temp
echo -e "${GREEN}💾 Temp directory path saved to .hyperlane-agents-temp${NC}"
echo ""

# Keep script running and tail logs
echo -e "${YELLOW}Press Ctrl+C to stop all agents${NC}"
echo ""

trap "echo 'Stopping agents...'; kill \$(cat $TEMP_DIR/validator-*.pid $TEMP_DIR/relayer.pid 2>/dev/null) 2>/dev/null; rm -rf $TEMP_DIR; exit" INT TERM

# Tail all logs
tail -f $TEMP_DIR/*.log
