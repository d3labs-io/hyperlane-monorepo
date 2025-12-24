#!/bin/bash

# Function to display usage
usage() {
    echo "Usage: $0 <environment> --chains <chain1,chain2,...> [--rwa <address>]"
    echo "Example: DEPLOYER_KEY=0x... $0 mainnet --chains ethereum,bsc --rwa 0x123..."
    exit 1
}

# Check if at least one argument is provided
if [ $# -lt 1 ]; then
    usage
fi

# Capture the environment (first argument)
ENVIRONMENT=$1
shift # Shift to process remaining arguments

CHAINS=""
RWA=""

# Parse remaining arguments
while [[ $# -gt 0 ]]; do
    key="$1"

    case $key in
        --chains)
            CHAINS="$2"
            shift # past argument
            shift # past value
            ;;
        --rwa)
            RWA="$2"
            shift # past argument
            shift # past value
            ;;
        *)
            # Unknown option
            shift # past argument
            ;;
    esac
done

# Validate that chains were provided
if [ -z "$CHAINS" ]; then
    echo "Error: --chains argument is required"
    usage
fi

# Validate that RWA Pruv address was provided
if [ -z "$RWA" ]; then
    echo "Error: --rwa argument is required"
    usage
fi

# Check if DEPLOYER_KEY is set
if [ -z "$DEPLOYER_KEY" ]; then
    echo "Error: DEPLOYER_KEY environment variable is required"
    usage
fi

CONFIG_DIR="typescript/cli/configs"
if [ "$ENVIRONMENT" == "testnet" ]; then
    TEMPLATE_DIR="typescript/cli/configs/template/rwa_deployment/testnet"
elif [ "$ENVIRONMENT" == "mainnet" ]; then
    TEMPLATE_DIR="typescript/cli/configs/template/rwa_deployment/mainnet"
else
    echo "Error: Environment '$ENVIRONMENT' not supported. Use 'mainnet' or 'testnet'."
    usage
fi
OUTPUT_FILE="$CONFIG_DIR/warp-route-deployment.yaml"

echo "Generating configuration for $ENVIRONMENT..."

# Check if template directory exists
if [ ! -d "$TEMPLATE_DIR" ]; then
    echo "Error: Template directory $TEMPLATE_DIR does not exist."
    exit 1
fi

# Copy base template (pruv.yaml)
if [ -f "$TEMPLATE_DIR/pruv.yaml" ]; then
    sed "s/RWA_TOKEN_ADDRESS/$RWA/g" "$TEMPLATE_DIR/pruv.yaml" > "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE" # Ensure newline
else
    echo "Error: Base template $TEMPLATE_DIR/pruv.yaml not found."
    exit 1
fi

# Process chains
IFS=',' read -ra CHAIN_ARRAY <<< "$CHAINS"
for chain in "${CHAIN_ARRAY[@]}"; do
    # Trim whitespace
    chain=$(echo "$chain" | xargs)
    
    if [ -n "$chain" ]; then
        # Append other_chain.yaml with replacement
        if [ -f "$TEMPLATE_DIR/other_chain.yaml" ]; then
            # Get proxyAdmin address
            ADDRESS_FILE="typescript/cli/.hyperlane/chains/$chain/addresses.yaml"
            PROXY_ADMIN=""
            
            if [ -f "$ADDRESS_FILE" ]; then
                PROXY_ADMIN=$(grep "proxyAdmin:" "$ADDRESS_FILE" | awk '{print $2}' | tr -d '"')
            fi
            
            if [ -z "$PROXY_ADMIN" ]; then
                echo "Error: proxyAdmin not found for chain $chain in $ADDRESS_FILE"
                echo "Please ensure the chain has been deployed or the address file exists."
                exit 1
            fi

            # Use a temporary file or direct append
            # Note: We are replacing "chainname" with the actual chain name
            # AND replacing "PROXY_ADDRESS" with the fetched address
            sed "s/chainname/$chain/g" "$TEMPLATE_DIR/other_chain.yaml" | sed "s/PROXY_ADDRESS/$PROXY_ADMIN/g" >> "$OUTPUT_FILE"
            echo "" >> "$OUTPUT_FILE" # Ensure newline
        else
            echo "Warning: Chain template $TEMPLATE_DIR/other_chain.yaml not found."
        fi
    fi
done

echo "Configuration generated at $OUTPUT_FILE:"

echo "Cleaning previous warp route deployments..."
rm -rf typescript/cli/.hyperlane/deployments/warp_routes/*

echo "Running Warp Route Deployment..."
cd typescript/cli
HYP_KEY="$DEPLOYER_KEY" yarn hyperlane warp deploy --config configs/warp-route-deployment.yaml --registry .hyperlane

# Find the latest modified deployment directory
LATEST_DEPLOYMENT_DIR=$(ls -td .hyperlane/deployments/warp_routes/*/ | head -n 1)

if [ -n "$LATEST_DEPLOYMENT_DIR" ]; then
    echo "Latest deployment found at: $LATEST_DEPLOYMENT_DIR"
    
    # Create the destination directory if it doesn't exist
    mkdir -p .hyperlane/latest_deployments
    
    # Copy the config file
    if [ -f "${LATEST_DEPLOYMENT_DIR}warp-route-deployment-config.yaml" ]; then
        cp "${LATEST_DEPLOYMENT_DIR}warp-route-deployment-config.yaml" .hyperlane/latest_deployments/warp-route-deployment-config.yaml
        echo "Copied deployment config to .hyperlane/latest_deployments/warp-route-deployment-config.yaml"
    else
         echo "Warning: warp-route-deployment-config.yaml not found in $LATEST_DEPLOYMENT_DIR"
    fi
else
    echo "Error: No deployment directory found in .hyperlane/deployments/warp_routes/"
fi

# Post-process the deployment config to filter connections and extract PRUV address
echo "Processing deployment config..."

if ! command -v yq &> /dev/null; then
    echo "Error: yq is not installed. Update the deployment config manually"
    echo "Please install yq to proceed:"
    echo "  brew install yq"
    echo "  # or visit https://github.com/mikefarah/yq for other installation methods"
    exit 1
fi

CONFIG_FILE=".hyperlane/latest_deployments/warp-route-deployment-config.yaml"

# 1. Extract PRUV/PRUVTEST address
# We look for an item in the 'tokens' list where chainName is 'pruv' or 'pruvtest'
PRUV_ROUTER_ADDRESS=$(yq '.tokens[] | select(.chainName == "pruv" or .chainName == "pruvtest") | .addressOrDenom' "$CONFIG_FILE")

# 2. Filter connections using yq
# Iterate over tokens. If chainName is NOT pruv/pruvtest, filter its connections.
# Keep connection ONLY if the token string contains "|pruv|" or "|pruvtest|"
# Use path selection for update to avoid syntax issues with if-else in map
yq -i '(.tokens[] | select(.chainName != "pruv" and .chainName != "pruvtest")).connections |= map(select(.token | test("(?i)\\|pruv(test)?\\|")))' "$CONFIG_FILE"

echo -e "New Pruv Router Address: \033[0;32m$PRUV_ROUTER_ADDRESS\033[0m"

FINAL_CONFIG_PATH="$(pwd)/.hyperlane/latest_deployments/warp-route-deployment-config.yaml"
echo -e "Finalized deployment config location: \033[0;32m$FINAL_CONFIG_PATH\033[0m"

echo "Read README.md in this directory to see next step"

exit 1
