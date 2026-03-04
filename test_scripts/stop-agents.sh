#!/bin/bash

# Stop all Hyperlane agents

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

if [ ! -f ".hyperlane-agents-temp" ]; then
    echo -e "${RED}❌ No running agents found (.hyperlane-agents-temp missing)${NC}"
    exit 1
fi

TEMP_DIR=$(cat .hyperlane-agents-temp)

if [ ! -d "$TEMP_DIR" ]; then
    echo -e "${RED}❌ Temp directory not found: $TEMP_DIR${NC}"
    rm -f .hyperlane-agents-temp
    exit 1
fi

echo -e "${GREEN}🛑 Stopping all Hyperlane agents...${NC}"

# Kill all agent processes
for pid_file in "$TEMP_DIR"/*.pid; do
    if [ -f "$pid_file" ]; then
        pid=$(cat "$pid_file")
        agent_name=$(basename "$pid_file" .pid)
        if kill "$pid" 2>/dev/null; then
            echo -e "${GREEN}✅ Stopped $agent_name (PID: $pid)${NC}"
        else
            echo -e "${RED}⚠️  Could not stop $agent_name (PID: $pid) - may have already stopped${NC}"
        fi
    fi
done

# Clean up temp directory
echo -e "${GREEN}🧹 Cleaning up temp directory: $TEMP_DIR${NC}"
rm -rf "$TEMP_DIR"
rm -f .hyperlane-agents-temp

# Restore the config directory if it was backed up
AGENT_WORKING_DIR="/Users/sotatek/Desktop/pruv-bridge-sc/rust/main"
if [ -d "$AGENT_WORKING_DIR/config.backup" ]; then
    echo -e "${GREEN}🔄 Restoring mainnet/testnet configs...${NC}"
    rm -rf "$AGENT_WORKING_DIR/config"
    mv "$AGENT_WORKING_DIR/config.backup" "$AGENT_WORKING_DIR/config"
fi

echo ""
echo -e "${GREEN}✅ All agents stopped and cleaned up!${NC}"
