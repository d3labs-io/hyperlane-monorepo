# TokenBridge Contract Makefile
# Provides commands for building, testing, and upgrading the TokenBridge contract

.PHONY: help build test fmt clean install-wasm deploy-upgrader upgrade-simple upgrade-atomic verify-upgrade

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
	@echo "Deployment & Upgrade:"
	@echo "  make install-wasm       - Install WASM and get hash"
	@echo "  make deploy-upgrader    - Deploy the Upgrader helper contract"
	@echo "  make upgrade-simple     - Perform simple WASM upgrade"
	@echo "  make upgrade-atomic     - Perform atomic upgrade with migration"
	@echo "  make verify-upgrade     - Verify upgrade was successful"
	@echo ""
	@echo "Environment Variables (required for upgrade commands):"
	@echo "  NETWORK                 - Network to use (testnet or mainnet)"
	@echo "  CONTRACT_ID             - ID of contract to upgrade"
	@echo "  ADMIN                   - Admin address (must sign transaction)"
	@echo "  WASM_HASH               - Hash of new WASM (from install-wasm)"
	@echo ""
	@echo "Example:"
	@echo "  export NETWORK=testnet"
	@echo "  export CONTRACT_ID=CAAAA..."
	@echo "  export ADMIN=GBUQW..."
	@echo "  make install-wasm"
	@echo "  make upgrade-simple WASM_HASH=<hash>"
	@echo ""

# Build the contract
all: test

test: build
	cargo test

build:
	stellar contract build
	@ls -l ../../target/wasm32v1-none/release/*.wasm

fmt:
	cargo fmt --all

clean:
	cargo clean

# ============================================================================
# DEPLOYMENT & UPGRADE COMMANDS
# ============================================================================

# Install WASM binary to network and get its hash
# Usage: make install-wasm NETWORK=testnet
install-wasm: build
	@if [ -z "$(NETWORK)" ]; then \
		echo "Error: NETWORK not set. Use: make install-wasm NETWORK=testnet"; \
		exit 1; \
	fi
	@echo "Installing WASM to $(NETWORK)..."
	@echo ""
	@echo "Note: You need to provide --source-account to complete the installation."
	@echo "Example:"
	@echo "  stellar contract upload --source-account <YOUR_ACCOUNT> --wasm ../../target/wasm32v1-none/release/inter_token.wasm --network $(NETWORK)"
	@echo ""
	@echo "The WASM hash for this build is:"
	@stellar contract build 2>&1 | grep "Wasm Hash:" | awk '{print $$3}' | tee /tmp/wasm_hash.txt
	@echo ""
	@echo "✅ WASM hash extracted!"
	@echo "WASM Hash saved to /tmp/wasm_hash.txt"
	@echo "Use: export WASM_HASH=$$(cat /tmp/wasm_hash.txt)"

# Deploy the Upgrader helper contract
# Usage: make deploy-upgrader NETWORK=testnet
deploy-upgrader:
	@if [ -z "$(NETWORK)" ]; then \
		echo "Error: NETWORK not set. Use: make deploy-upgrader NETWORK=testnet"; \
		exit 1; \
	fi
	@echo "Building Upgrader contract..."
	@stellar contract build --contract upgrader
	@echo ""
	@echo "⚠️  To deploy the Upgrader contract, use:"
	@echo "  stellar contract deploy --source-account <YOUR_ACCOUNT> --wasm ../../target/wasm32v1-none/release/upgrader.wasm --network $(NETWORK)"
	@echo ""
	@echo "After deployment, save the contract ID:"
	@echo "  export UPGRADER_ID=<contract_id_from_deployment>"

# Perform simple WASM upgrade (no migration)
# Usage: make upgrade-simple NETWORK=testnet CONTRACT_ID=... ADMIN=... WASM_HASH=...
upgrade-simple:
	@if [ -z "$(NETWORK)" ] || [ -z "$(CONTRACT_ID)" ] || [ -z "$(ADMIN)" ] || [ -z "$(WASM_HASH)" ]; then \
		echo "Error: Missing required parameters"; \
		echo "Usage: make upgrade-simple NETWORK=testnet CONTRACT_ID=... ADMIN=... WASM_HASH=..."; \
		exit 1; \
	fi
	@echo "Performing simple WASM upgrade..."
	@echo "Network:     $(NETWORK)"
	@echo "Contract ID: $(CONTRACT_ID)"
	@echo "Admin:       $(ADMIN)"
	@echo "WASM Hash:   $(WASM_HASH)"
	@echo ""
	@echo "⚠️  This will upgrade the contract. Press Ctrl+C to cancel..."
	@sleep 3
	@stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source-account $(ADMIN) \
		--network $(NETWORK) \
		-- \
		upgrade \
		--new_wasm_hash $(WASM_HASH) \
		--operator $(ADMIN)
	@echo ""
	@echo "✅ Upgrade completed successfully!"

# Perform atomic upgrade with migration
# Usage: make upgrade-atomic NETWORK=testnet UPGRADER_ID=... CONTRACT_ID=... ADMIN=... WASM_HASH=...
upgrade-atomic:
	@if [ -z "$(NETWORK)" ] || [ -z "$(UPGRADER_ID)" ] || [ -z "$(CONTRACT_ID)" ] || [ -z "$(ADMIN)" ] || [ -z "$(WASM_HASH)" ]; then \
		echo "Error: Missing required parameters"; \
		echo "Usage: make upgrade-atomic NETWORK=testnet UPGRADER_ID=... CONTRACT_ID=... ADMIN=... WASM_HASH=..."; \
		exit 1; \
	fi
	@echo "Performing atomic upgrade with migration..."
	@echo "Network:       $(NETWORK)"
	@echo "Upgrader ID:   $(UPGRADER_ID)"
	@echo "Contract ID:   $(CONTRACT_ID)"
	@echo "Admin:         $(ADMIN)"
	@echo "WASM Hash:     $(WASM_HASH)"
	@echo ""
	@echo "⚠️  This will upgrade and migrate the contract. Press Ctrl+C to cancel..."
	@sleep 3
	@stellar contract invoke \
		--id $(UPGRADER_ID) \
		--source-account $(ADMIN) \
		--network $(NETWORK) \
		-- \
		upgrade_and_migrate \
		--contract_address $(CONTRACT_ID) \
		--operator $(ADMIN) \
		--wasm_hash $(WASM_HASH) \
		--migration_data '[{"version": 1}]'
	@echo ""
	@echo "✅ Atomic upgrade completed successfully!"

# Verify upgrade was successful
# Usage: make verify-upgrade NETWORK=testnet CONTRACT_ID=...
verify-upgrade:
	@if [ -z "$(NETWORK)" ] || [ -z "$(CONTRACT_ID)" ]; then \
		echo "Error: Missing required parameters"; \
		echo "Usage: make verify-upgrade NETWORK=testnet CONTRACT_ID=..."; \
		exit 1; \
	fi
	@echo "Verifying upgrade..."
	@echo ""
	@echo "Contract Info:"
	@stellar contract info \
		--id $(CONTRACT_ID) \
		--network $(NETWORK)
	@echo ""
	@echo "✅ Verification complete!"

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
