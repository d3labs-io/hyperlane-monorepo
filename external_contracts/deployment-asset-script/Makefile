.PHONY: help deploy-evm deploy-stellar transfer-ownership set-admin-stellar install test clean

# Default values
TOKEN_NAME ?= MyToken
TOKEN_SYMBOL ?= MTK
ASSET_CODE ?= MYASSET
NETWORK ?= pruvTestnet

# Colors for output
GREEN := \033[0;32m
YELLOW := \033[0;33m
NC := \033[0m # No Color

help: ## Show this help message
	@echo "$(GREEN)Available commands:$(NC)"
	@echo ""
	@echo "$(YELLOW)Setup:$(NC)"
	@echo "  make install          - Install dependencies"
	@echo ""
	@echo "$(YELLOW)Deployment:$(NC)"
	@echo "  make deploy-evm       - Deploy ERC20 token to EVM network"
	@echo "                          Usage: make deploy-evm TOKEN_NAME='MyToken' TOKEN_SYMBOL='MTK' NETWORK=pruvTestnet"
	@echo ""
	@echo "  make deploy-stellar   - Deploy Stellar Asset Contract (SAC)"
	@echo "                          Usage: make deploy-stellar ASSET_CODE='MYASSET'"
	@echo ""
	@echo "$(YELLOW)Mint authority / admin:$(NC)"
	@echo "  make transfer-ownership   - Transfer EVM mint authority (Ownable owner) to proxy"
	@echo "                              Usage: make transfer-ownership TOKEN_ADDRESS='<tokenAddress>' PROXY_ADDRESS='<proxyAddress>' NETWORK=pruvTestnet"
	@echo "  make set-admin-stellar    - Set admin for Stellar Asset Contract"
	@echo "                              Usage: make set-admin-stellar ASSET_ID='<stellarContractId>' NEW_ADMIN_ADDRESS='<newAdminAddress>'"
	@echo ""
	@echo "$(YELLOW)Testing:$(NC)"
	@echo "  make test             - Run tests"
	@echo ""
	@echo "$(YELLOW)Utilities:$(NC)"
	@echo "  make clean            - Clean build artifacts"
	@echo ""
	@echo "$(YELLOW)Examples:$(NC)"
	@echo "  make deploy-evm TOKEN_NAME='Ekotek Token' TOKEN_SYMBOL='EKO'"
	@echo "  make deploy-stellar ASSET_CODE='EKOTEK'"

install: ## Install dependencies
	@echo "$(GREEN)Installing dependencies...$(NC)"
	npm install
	@echo "$(GREEN)Dependencies installed successfully!$(NC)"

deploy-evm: ## Deploy ERC20 token to EVM network
	@echo "$(GREEN)Deploying ERC20 token to $(NETWORK)...$(NC)"
	@echo "Token Name: $(TOKEN_NAME)"
	@echo "Token Symbol: $(TOKEN_SYMBOL)"
	@echo "Network: $(NETWORK)"
ifeq ($(OS),Windows_NT)
	@set TOKEN_NAME=$(TOKEN_NAME) && set TOKEN_SYMBOL=$(TOKEN_SYMBOL) && npx hardhat run scripts/deploy.ts --network $(NETWORK)
else
	@TOKEN_NAME="$(TOKEN_NAME)" TOKEN_SYMBOL="$(TOKEN_SYMBOL)" npx hardhat run scripts/deploy.ts --network $(NETWORK)
endif

deploy-stellar: ## Deploy Stellar Asset Contract
	@echo "$(GREEN)Deploying Stellar Asset Contract...$(NC)"
	@echo "Asset Code: $(ASSET_CODE)"
ifeq ($(OS),Windows_NT)
	@set ASSET_CODE=$(ASSET_CODE) && node scripts/deploySAC.mjs
else
	@ASSET_CODE="$(ASSET_CODE)" node scripts/deploySAC.mjs
endif

transfer-ownership: ## Transfer ERC20 mint authority (Ownable owner) to proxy on EVM
	@echo "$(GREEN)Transferring ERC20 ownership to proxy on $(NETWORK)...$(NC)"
	@echo "Token Address: $(TOKEN_ADDRESS)"
	@echo "Proxy Address: $(PROXY_ADDRESS)"
ifeq ($(OS),Windows_NT)
	@set TOKEN_ADDRESS=$(TOKEN_ADDRESS) && set PROXY_ADDRESS=$(PROXY_ADDRESS) && npx hardhat run scripts/transferOwnership.ts --network $(NETWORK)
else
	@TOKEN_ADDRESS="$(TOKEN_ADDRESS)" PROXY_ADDRESS="$(PROXY_ADDRESS)" npx hardhat run scripts/transferOwnership.ts --network $(NETWORK)
endif

set-admin-stellar: ## Set admin for Stellar Asset Contract
	@echo "$(GREEN)Setting admin for Stellar Asset Contract...$(NC)"
	@echo "Asset / Contract ID: $(ASSET_ID)"
	@echo "New Admin Address: $(NEW_ADMIN_ADDRESS)"
ifeq ($(OS),Windows_NT)
	@set ASSET_ID=$(ASSET_ID) && set NEW_ADMIN_ADDRESS=$(NEW_ADMIN_ADDRESS) && node scripts/setAdmin.mjs
else
	@ASSET_ID="$(ASSET_ID)" NEW_ADMIN_ADDRESS="$(NEW_ADMIN_ADDRESS)" node scripts/setAdmin.mjs
endif

test: ## Run tests
	@echo "$(GREEN)Running tests...$(NC)"
	npx hardhat test

clean: ## Clean build artifacts
	@echo "$(GREEN)Cleaning build artifacts...$(NC)"
	npx hardhat clean
	rm -rf artifacts cache
	@echo "$(GREEN)Clean complete!$(NC)"

compile: ## Compile contracts
	@echo "$(GREEN)Compiling contracts...$(NC)"
	npx hardhat compile
	@echo "$(GREEN)Compilation complete!$(NC)"

