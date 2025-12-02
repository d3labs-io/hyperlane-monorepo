# TokenBridge Makefile
# Simplifies common development and deployment tasks

.PHONY: help install compile clean test coverage deploy verify console node upgrade grant-admin lock-tokens unlock-tokens burn-tokens mint-tokens check-balance deploy-and-verify force-import test-deployment

# Default network (can be overridden with NETWORK=<name>)
NETWORK ?= pruvTestnet

# Load environment variables
ifneq (,$(wildcard .env))
    include .env
    export
endif

# Colors for output
GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
NC := \033[0m # No Color

##@ Help

help: ## Display this help message
	@echo "$(GREEN)TokenBridge Makefile Commands$(NC)"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make $(YELLOW)<target>$(NC)\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  $(YELLOW)%-25s$(NC) %s\n", $$1, $$2 } /^##@/ { printf "\n$(GREEN)%s$(NC)\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Installation & Setup

install: ## Install dependencies
	@echo "$(GREEN)Installing dependencies...$(NC)"
	npm install
	@echo "$(GREEN)✓ Dependencies installed$(NC)"

##@ Compilation & Testing

compile: ## Compile contracts
	@echo "$(GREEN)Compiling contracts...$(NC)"
	npx hardhat compile
	@echo "$(GREEN)✓ Contracts compiled$(NC)"

clean: ## Clean artifacts and cache
	@echo "$(YELLOW)Cleaning artifacts and cache...$(NC)"
	npx hardhat clean
	rm -rf artifacts cache typechain-types coverage coverage.json
	@echo "$(GREEN)✓ Cleaned$(NC)"

test: ## Run all tests
	@echo "$(GREEN)Running tests...$(NC)"
	npx hardhat test
	@echo "$(GREEN)✓ Tests completed$(NC)"

coverage: ## Generate test coverage report
	@echo "$(GREEN)Generating coverage report...$(NC)"
	npx hardhat coverage
	@echo "$(GREEN)✓ Coverage report generated$(NC)"
	@echo "Open coverage/index.html to view the report"

##@ Deployment

deploy: ## Deploy TokenBridge to specified network (NETWORK=pruvTestnet)
	@echo "$(GREEN)Deploying TokenBridge to $(NETWORK)...$(NC)"
	@if [ -z "$(PRIVATE_KEY)" ]; then \
		echo "$(RED)Error: PRIVATE_KEY not set in .env file$(NC)"; \
		exit 1; \
	fi
	@if [ -z "$(OWNER_ADDRESS)" ]; then \
		echo "$(RED)Error: OWNER_ADDRESS not set in .env file$(NC)"; \
		exit 1; \
	fi
	npx hardhat run scripts/deploy.ts --network $(NETWORK)
	@echo "$(GREEN)✓ Deployment completed$(NC)"
	@echo "$(YELLOW)Remember to update PROXY_ADDRESS in your .env file!$(NC)"

verify: ## Verify contract on block explorer (NETWORK=pruvTestnet)
	@echo "$(GREEN)Verifying contract on $(NETWORK)...$(NC)"
	@if [ -z "$(PROXY_ADDRESS)" ]; then \
		echo "$(RED)Error: PROXY_ADDRESS not set in .env file$(NC)"; \
		exit 1; \
	fi
	npx hardhat verify --network $(NETWORK) $(PROXY_ADDRESS)
	@echo "$(GREEN)✓ Contract verified$(NC)"

deploy-and-verify: deploy verify ## Deploy and verify in one command

check-balance: ## Check deployer account balance (NETWORK=pruvTestnet)
	@echo "$(GREEN)Checking balance on $(NETWORK)...$(NC)"
	@npx hardhat run --network $(NETWORK) -c "const [signer] = await ethers.getSigners(); console.log('Address:', signer.address); console.log('Balance:', ethers.formatEther(await ethers.provider.getBalance(signer.address)), 'ETH');"

##@ Contract Interactions

grant-admin: ## Grant admin role (NETWORK=pruvTestnet ADMIN_ADDRESS=0x...)
	@echo "$(GREEN)Granting admin role to $(ADMIN_ADDRESS)...$(NC)"
	@if [ -z "$(ADMIN_ADDRESS)" ]; then \
		echo "$(RED)Error: ADMIN_ADDRESS not provided$(NC)"; \
		echo "Usage: make grant-admin NETWORK=pruvTestnet ADMIN_ADDRESS=0x..."; \
		exit 1; \
	fi
	@if [ -z "$(PROXY_ADDRESS)" ]; then \
		echo "$(RED)Error: PROXY_ADDRESS not set in .env file$(NC)"; \
		exit 1; \
	fi
	npx hardhat run scripts/grantAdmin.ts --network $(NETWORK)
	@echo "$(GREEN)✓ Admin role granted$(NC)"

lock-tokens: ## Lock tokens (test script) (NETWORK=pruvTestnet)
	@echo "$(GREEN)Locking tokens on $(NETWORK)...$(NC)"
	@if [ -z "$(PROXY_ADDRESS)" ]; then \
		echo "$(RED)Error: PROXY_ADDRESS not set in .env file$(NC)"; \
		exit 1; \
	fi
	npx hardhat run scripts/lockToken.ts --network $(NETWORK)
	@echo "$(GREEN)✓ Tokens locked$(NC)"

unlock-tokens: ## Unlock tokens (system wallet) (NETWORK=pruvTestnet)
	@echo "$(GREEN)Unlocking tokens on $(NETWORK)...$(NC)"
	@if [ -z "$(PROXY_ADDRESS)" ]; then \
		echo "$(RED)Error: PROXY_ADDRESS not set in .env file$(NC)"; \
		exit 1; \
	fi
	npx hardhat run scripts/unlockToken.ts --network $(NETWORK)
	@echo "$(GREEN)✓ Tokens unlocked$(NC)"

burn-tokens: ## Burn tokens (test script) (NETWORK=pruvTestnet)
	@echo "$(GREEN)Burning tokens on $(NETWORK)...$(NC)"
	@if [ -z "$(PROXY_ADDRESS)" ]; then \
		echo "$(RED)Error: PROXY_ADDRESS not set in .env file$(NC)"; \
		exit 1; \
	fi
	npx hardhat run scripts/burnToken.ts --network $(NETWORK)
	@echo "$(GREEN)✓ Tokens burned$(NC)"

mint-tokens: ## Mint tokens (system wallet) (NETWORK=pruvTestnet)
	@echo "$(GREEN)Minting tokens on $(NETWORK)...$(NC)"
	@if [ -z "$(PROXY_ADDRESS)" ]; then \
		echo "$(RED)Error: PROXY_ADDRESS not set in .env file$(NC)"; \
		exit 1; \
	fi
	npx hardhat run scripts/mintToken.ts --network $(NETWORK)
	@echo "$(GREEN)✓ Tokens minted$(NC)"

##@ Upgrades

upgrade: ## Upgrade contract to new implementation (NETWORK=pruvTestnet)
	@echo "$(GREEN)Upgrading TokenBridge on $(NETWORK)...$(NC)"
	@if [ -z "$(PROXY_ADDRESS)" ]; then \
		echo "$(RED)Error: PROXY_ADDRESS not set in .env file$(NC)"; \
		exit 1; \
	fi
	npx hardhat run scripts/upgrade.ts --network $(NETWORK)
	@echo "$(GREEN)✓ Contract upgraded$(NC)"

force-import: ## Force import existing proxy for upgrade tracking (NETWORK=pruvTestnet)
	@echo "$(GREEN)Force importing proxy on $(NETWORK)...$(NC)"
	@if [ -z "$(PROXY_ADDRESS)" ]; then \
		echo "$(RED)Error: PROXY_ADDRESS not set in .env file$(NC)"; \
		exit 1; \
	fi
	npx hardhat run scripts/force-import-proxy.ts --network $(NETWORK)
	@echo "$(GREEN)✓ Proxy imported$(NC)"

##@ Development Tools

console: ## Open Hardhat console (NETWORK=pruvTestnet)
	@echo "$(GREEN)Opening Hardhat console on $(NETWORK)...$(NC)"
	npx hardhat console --network $(NETWORK)

node: ## Start local Hardhat node
	@echo "$(GREEN)Starting local Hardhat node...$(NC)"
	npx hardhat node

test-deployment: ## Test deployment by checking contract state (NETWORK=pruvTestnet)
	@echo "$(GREEN)Testing deployment on $(NETWORK)...$(NC)"
	@if [ -z "$(PROXY_ADDRESS)" ]; then \
		echo "$(RED)Error: PROXY_ADDRESS not set in .env file$(NC)"; \
		exit 1; \
	fi
	@echo "const bridge = await ethers.getContractAt('TokenBridge', '$(PROXY_ADDRESS)'); \
	console.log('Owner:', await bridge.getOwner()); \
	console.log('Fee Token:', await bridge.getFeeToken()); \
	console.log('Fee Amount:', (await bridge.getFeeAmount()).toString()); \
	console.log('Paused:', await bridge.paused());" | npx hardhat console --network $(NETWORK)
	@echo "$(GREEN)✓ Deployment test completed$(NC)"

##@ Utilities

env-check: ## Check if all required environment variables are set
	@echo "$(GREEN)Checking environment variables...$(NC)"
	@if [ -z "$(PRIVATE_KEY)" ]; then \
		echo "$(RED)✗ PRIVATE_KEY not set$(NC)"; \
	else \
		echo "$(GREEN)✓ PRIVATE_KEY set$(NC)"; \
	fi
	@if [ -z "$(OWNER_ADDRESS)" ]; then \
		echo "$(RED)✗ OWNER_ADDRESS not set$(NC)"; \
	else \
		echo "$(GREEN)✓ OWNER_ADDRESS: $(OWNER_ADDRESS)$(NC)"; \
	fi
	@if [ -z "$(SYSTEM_WALLET_ADDRESS)" ]; then \
		echo "$(RED)✗ SYSTEM_WALLET_ADDRESS not set$(NC)"; \
	else \
		echo "$(GREEN)✓ SYSTEM_WALLET_ADDRESS: $(SYSTEM_WALLET_ADDRESS)$(NC)"; \
	fi
	@if [ -z "$(FEE_TOKEN_ADDRESS)" ]; then \
		echo "$(RED)✗ FEE_TOKEN_ADDRESS not set$(NC)"; \
	else \
		echo "$(GREEN)✓ FEE_TOKEN_ADDRESS: $(FEE_TOKEN_ADDRESS)$(NC)"; \
	fi
	@if [ -z "$(FEE_AMOUNT)" ]; then \
		echo "$(RED)✗ FEE_AMOUNT not set$(NC)"; \
	else \
		echo "$(GREEN)✓ FEE_AMOUNT: $(FEE_AMOUNT)$(NC)"; \
	fi
	@if [ -z "$(CURRENT_CHAIN_ID)" ]; then \
		echo "$(RED)✗ CURRENT_CHAIN_ID not set$(NC)"; \
	else \
		echo "$(GREEN)✓ CURRENT_CHAIN_ID: $(CURRENT_CHAIN_ID)$(NC)"; \
	fi
	@if [ -z "$(PROXY_ADDRESS)" ]; then \
		echo "$(YELLOW)⚠ PROXY_ADDRESS not set (set after deployment)$(NC)"; \
	else \
		echo "$(GREEN)✓ PROXY_ADDRESS: $(PROXY_ADDRESS)$(NC)"; \
	fi

setup-env: ## Create .env file from env.example
	@if [ -f .env ]; then \
		echo "$(YELLOW).env file already exists. Skipping...$(NC)"; \
	else \
		echo "$(GREEN)Creating .env file from env.example...$(NC)"; \
		cp env.example .env; \
		echo "$(GREEN)✓ .env file created$(NC)"; \
		echo "$(YELLOW)Please edit .env file with your configuration$(NC)"; \
	fi

lint: ## Run Solidity linter (if solhint is installed)
	@if command -v solhint >/dev/null 2>&1; then \
		echo "$(GREEN)Running Solidity linter...$(NC)"; \
		solhint 'contracts/**/*.sol'; \
		echo "$(GREEN)✓ Linting completed$(NC)"; \
	else \
		echo "$(YELLOW)solhint not installed. Install with: npm install -g solhint$(NC)"; \
	fi

format: ## Format Solidity files (if prettier is installed)
	@if command -v prettier >/dev/null 2>&1; then \
		echo "$(GREEN)Formatting Solidity files...$(NC)"; \
		prettier --write 'contracts/**/*.sol'; \
		echo "$(GREEN)✓ Formatting completed$(NC)"; \
	else \
		echo "$(YELLOW)prettier not installed. Install with: npm install -g prettier$(NC)"; \
	fi

size: ## Check contract sizes
	@echo "$(GREEN)Checking contract sizes...$(NC)"
	npx hardhat size-contracts
	@echo "$(GREEN)✓ Size check completed$(NC)"

##@ Quick Start

quick-start: install compile env-check ## Quick start: install, compile, and check environment
	@echo "$(GREEN)========================================$(NC)"
	@echo "$(GREEN)Quick start completed!$(NC)"
	@echo "$(GREEN)========================================$(NC)"
	@echo ""
	@echo "Next steps:"
	@echo "  1. Edit .env file with your configuration"
	@echo "  2. Run: make deploy NETWORK=<your-network>"
	@echo "  3. Update PROXY_ADDRESS in .env"
	@echo "  4. Run: make verify NETWORK=<your-network>"
	@echo ""

full-deploy: env-check compile deploy verify ## Full deployment: check env, compile, deploy, and verify
	@echo "$(GREEN)========================================$(NC)"
	@echo "$(GREEN)Full deployment completed!$(NC)"
	@echo "$(GREEN)========================================$(NC)"

##@ Documentation

docs: ## Open deployment documentation
	@if command -v open >/dev/null 2>&1; then \
		open docs/DEPLOYMENT.md; \
	elif command -v xdg-open >/dev/null 2>&1; then \
		xdg-open docs/DEPLOYMENT.md; \
	else \
		echo "$(YELLOW)Please open docs/DEPLOYMENT.md manually$(NC)"; \
	fi

show-networks: ## Show configured networks
	@echo "$(GREEN)Configured networks:$(NC)"
	@grep -A 5 "networks:" hardhat.config.ts | grep -E "^\s+\w+:" | sed 's/://g' | sed 's/^/  - /'

##@ Aliases (shortcuts)

d: deploy ## Alias for deploy
v: verify ## Alias for verify
t: test ## Alias for test
c: compile ## Alias for compile
h: help ## Alias for help

