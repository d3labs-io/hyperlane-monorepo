# TokenBridge Contract Makefile
# Provides commands for building, testing, and upgrading the TokenBridge contract

.PHONY: help build test fmt clean deploy deploy-complete verify upload-wasm upgrade-contract upgrade-complete execute-bridge-operation approve-token get-latest-ledger

# Default target
default: build

# Show help
help:
	@echo "TokenBridge Contract - Available Commands"
	@echo "=========================================="
	@echo ""
	@echo "Build & Test:"
	@echo "  make build              - Build the contract"
	@echo "  make test               - Run all tests"
	@echo "  make fmt                - Format code"
	@echo "  make clean              - Clean build artifacts"
	@echo ""
	@echo "Initial Deployment:"
	@echo "  make deploy             - Deploy contract to network"
	@echo "  make deploy-complete    - Build and deploy in one command"
	@echo ""
	@echo "Contract Upgrade:"
	@echo "  make upload-wasm        - Upload WASM to network and get hash"
	@echo "  make upgrade-contract   - Upgrade contract with new WASM hash"
	@echo "  make upgrade-complete   - Complete upgrade workflow (build + upload + upgrade)"
	@echo ""
	@echo "Environment Variables:"
	@echo "  Deployment:"
	@echo "    NETWORK               - Network to use (testnet or mainnet)"
	@echo "    SOURCE_ACCOUNT        - Deployer account (pays for deployment)"
	@echo "    OWNER                 - Contract owner address"
	@echo "    SYSTEM_WALLET         - System wallet address"
	@echo ""
	@echo "  Upgrade:"
	@echo "    CONTRACT_ID           - ID of contract to upgrade"
	@echo "    WASM_HASH             - Hash of new WASM (from upload-wasm)"
	@echo ""
	@echo "Examples:"
	@echo "  # Deploy to testnet"
	@echo "  make deploy NETWORK=testnet SOURCE_ACCOUNT=admin OWNER=admin SYSTEM_WALLET=admin"
	@echo ""
	@echo "  # Upgrade existing contract"
	@echo "  make upload-wasm NETWORK=testnet SOURCE_ACCOUNT=admin"
	@echo "  make upgrade-contract CONTRACT_ID=CALC65... NETWORK=testnet SOURCE_ACCOUNT=admin WASM_HASH=<hash>"
	@echo ""
	@echo "  # Or use complete upgrade workflow"
	@echo "  make upgrade-complete CONTRACT_ID=CALC65... NETWORK=testnet SOURCE_ACCOUNT=admin"
	@echo ""
	@echo "For detailed deployment instructions, see DEPLOYMENT.md"
	@echo ""

# Build the contract
all: test

test: build
	cargo test

build:
	stellar contract build

fmt:
	cargo fmt --all

clean:
	cargo clean

# ============================================================================
# INITIAL DEPLOYMENT COMMANDS
# ============================================================================

# Deploy contract to network
# Usage: make deploy NETWORK=testnet SOURCE_ACCOUNT=admin OWNER=admin SYSTEM_WALLET=admin
deploy: build
	@if [ -z "$(NETWORK)" ] || [ -z "$(SOURCE_ACCOUNT)" ] || [ -z "$(OWNER)" ] || [ -z "$(SYSTEM_WALLET)" ]; then \
		echo "Error: Missing required parameters"; \
		echo "Usage: make deploy NETWORK=<network> SOURCE_ACCOUNT=<account> OWNER=<owner> SYSTEM_WALLET=<wallet>"; \
		echo ""; \
		echo "Example:"; \
		echo "  make deploy NETWORK=testnet SOURCE_ACCOUNT=admin OWNER=admin SYSTEM_WALLET=admin"; \
		echo ""; \
		echo "Parameters:"; \
		echo "  NETWORK        - Network to deploy to (testnet or mainnet)"; \
		echo "  SOURCE_ACCOUNT - Deployer account that pays for deployment"; \
		echo "  OWNER          - Contract owner address (can upgrade, manage admins)"; \
		echo "  SYSTEM_WALLET  - System wallet address (can execute bridge operations)"; \
		exit 1; \
	fi
	@echo "Deploying TokenBridge contract..."
	@echo "Network:        $(NETWORK)"
	@echo "Source Account: $(SOURCE_ACCOUNT)"
	@echo "Owner:          $(OWNER)"
	@echo "System Wallet:  $(SYSTEM_WALLET)"
	@echo ""
	@if [ "$(NETWORK)" = "testnet" ]; then \
		CHAIN_ID="stellar:testnet"; \
	elif [ "$(NETWORK)" = "mainnet" ]; then \
		CHAIN_ID="stellar:mainnet"; \
	else \
		echo "Error: NETWORK must be 'testnet' or 'mainnet'"; \
		exit 1; \
	fi; \
	echo "Chain ID:       $$CHAIN_ID"; \
	echo ""; \
	echo "⚠️  Deploying contract... Press Ctrl+C to cancel..."; \
	sleep 2; \
	stellar contract deploy \
		--source-account $(SOURCE_ACCOUNT) \
		--wasm target/wasm32v1-none/release/inter_token.wasm \
		--network $(NETWORK) \
		-- \
		--owner $(OWNER) \
		--system_wallet $(SYSTEM_WALLET) \
		--current_chain_id $$CHAIN_ID | tee /tmp/contract_deployment.txt
	@echo ""
	@echo "✅ Deployment completed!"
	@echo ""
	@echo "Contract ID saved to /tmp/contract_deployment.txt"
	@echo "Save this contract ID for future interactions!"
	@echo ""
	@echo "Next steps:"
	@echo "  1. Save the contract ID"
	@echo "  2. Test contract functions"

# Build and deploy in one command
# Usage: make deploy-complete NETWORK=testnet SOURCE_ACCOUNT=admin OWNER=admin SYSTEM_WALLET=admin
deploy-complete: deploy
	@echo ""
	@echo "✅ Build and deployment complete!"

# ============================================================================
# UPGRADE COMMANDS
# ============================================================================

# Upload WASM to network and get hash
# Usage: make upload-wasm NETWORK=testnet SOURCE_ACCOUNT=admin
upload-wasm: build
	@if [ -z "$(NETWORK)" ] || [ -z "$(SOURCE_ACCOUNT)" ]; then \
		echo "Error: Missing required parameters"; \
		echo "Usage: make upload-wasm NETWORK=<network> SOURCE_ACCOUNT=<account>"; \
		echo ""; \
		echo "Example:"; \
		echo "  make upload-wasm NETWORK=testnet SOURCE_ACCOUNT=admin"; \
		exit 1; \
	fi
	@echo "Uploading WASM to $(NETWORK)..."
	@echo ""
	@stellar contract upload \
		--source-account $(SOURCE_ACCOUNT) \
		--wasm target/wasm32v1-none/release/inter_token.wasm \
		--network $(NETWORK) | tee /tmp/wasm_hash.txt
	@echo ""
	@echo "✅ WASM uploaded successfully!"
	@echo "WASM Hash saved to /tmp/wasm_hash.txt"
	@echo ""
	@echo "To upgrade the contract, use:"
	@echo "  make upgrade-contract CONTRACT_ID=<id> NETWORK=$(NETWORK) SOURCE_ACCOUNT=$(SOURCE_ACCOUNT) WASM_HASH=\$$(cat /tmp/wasm_hash.txt)"

# Upgrade contract with new WASM hash
# Usage: make upgrade-contract CONTRACT_ID=... NETWORK=testnet SOURCE_ACCOUNT=admin WASM_HASH=...
upgrade-contract:
	@if [ -z "$(CONTRACT_ID)" ] || [ -z "$(NETWORK)" ] || [ -z "$(SOURCE_ACCOUNT)" ] || [ -z "$(WASM_HASH)" ]; then \
		echo "Error: Missing required parameters"; \
		echo "Usage: make upgrade-contract CONTRACT_ID=<id> NETWORK=<network> SOURCE_ACCOUNT=<account> WASM_HASH=<hash>"; \
		echo ""; \
		echo "Example:"; \
		echo "  make upgrade-contract CONTRACT_ID=CALC65... NETWORK=testnet SOURCE_ACCOUNT=admin WASM_HASH=92065e82..."; \
		exit 1; \
	fi
	@echo "Upgrading contract..."
	@echo "Contract ID:    $(CONTRACT_ID)"
	@echo "Network:        $(NETWORK)"
	@echo "Source Account: $(SOURCE_ACCOUNT)"
	@echo "WASM Hash:      $(WASM_HASH)"
	@echo ""
	@echo "⚠️  This will upgrade the contract. Press Ctrl+C to cancel..."
	@sleep 3
	@stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source-account $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		upgrade \
		--new_wasm_hash $(WASM_HASH) \
		--caller $(SOURCE_ACCOUNT)
	@echo ""
	@echo "✅ Contract upgraded successfully!"
	@echo ""
	@echo "Verify the upgrade:"

# Complete upgrade workflow (build, upload, upgrade)
# Usage: make upgrade-complete CONTRACT_ID=... NETWORK=testnet SOURCE_ACCOUNT=admin
upgrade-complete: build
	@if [ -z "$(CONTRACT_ID)" ] || [ -z "$(NETWORK)" ] || [ -z "$(SOURCE_ACCOUNT)" ]; then \
		echo "Error: Missing required parameters"; \
		echo "Usage: make upgrade-complete CONTRACT_ID=<id> NETWORK=<network> SOURCE_ACCOUNT=<account>"; \
		exit 1; \
	fi
	@echo "Starting complete upgrade workflow..."
	@echo ""
	@echo "Step 1: Uploading WASM..."
	@WASM_HASH=$$(stellar contract upload \
		--source-account $(SOURCE_ACCOUNT) \
		--wasm target/wasm32v1-none/release/inter_token.wasm \
		--network $(NETWORK)); \
	echo "WASM Hash: $$WASM_HASH"; \
	echo ""; \
	echo "Step 2: Upgrading contract..."; \
	sleep 2; \
	stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source-account $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		upgrade \
		--new_wasm_hash $$WASM_HASH \
		--caller $(SOURCE_ACCOUNT)
	@echo ""
	@echo "✅ Complete upgrade workflow finished!"

# ============================================================================
# BRIDGE OPERATION COMMANDS
# ============================================================================

execute-bridge-operation:
	@echo "Executing bridge operation..."
	@stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source-account $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		execute_bridge_operation \
		--operation $(OPERATION) \
		--bridge_data '{"from_token":"$(FROM_TOKEN)","to_token":"$(TO_TOKEN)","amount":"$(AMOUNT)","from_address":"$(FROM_ADDRESS)","to_address":"$(TO_ADDRESS)","from_network":"$(FROM_NETWORK)","to_network":"$(TO_NETWORK)","transaction_id":"$(TRANSACTION_ID)","email":"$(EMAIL)"}' \
		--caller $(SOURCE_ACCOUNT)

approve-token:
	@echo "Approving token..."
	@stellar contract invoke \
		--id $(TOKEN) \
		--source-account $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		-- \
		approve \
		--from $(SOURCE_ACCOUNT) \
		--spender $(CONTRACT_ID) \
		--amount $(AMOUNT) \
		--expiration_ledger $(EXPIRATION_LEDGER)

get-latest-ledger:
	@echo "Getting latest ledger..."
	@stellar ledger latest \
		--network $(NETWORK)
