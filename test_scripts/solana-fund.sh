#!/bin/bash
# Prints Solana deployer and relayer payer public keys, then funds them on the local validator.
# Usage: ./test_scripts/solana-fund.sh

set -e

DEPLOYER_KEYPAIR="$HOME/.config/solana/local-deployer.json"
SOLANA_URL="http://127.0.0.1:8899"
ANVIL_HEX_KEY="ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

if [ ! -f "$DEPLOYER_KEYPAIR" ]; then
  echo "Deployer keypair not found. Creating one..."
  solana-keygen new -o "$DEPLOYER_KEYPAIR" --no-bip39-passphrase
  solana config set --keypair "$DEPLOYER_KEYPAIR"
  solana config set --url "$SOLANA_URL"
fi

DEPLOYER_PUBKEY=$(solana-keygen pubkey "$DEPLOYER_KEYPAIR")

RELAYER_PAYER_PUBKEY=$(node -e "
const { Keypair } = require('@solana/web3.js');
const seed = Buffer.from('$ANVIL_HEX_KEY', 'hex');
console.log(Keypair.fromSeed(seed).publicKey.toBase58());
")

echo ""
echo "=== Solana Key Info ==="
echo "  Deployer pubkey:      $DEPLOYER_PUBKEY"
echo "  Relayer payer pubkey: $RELAYER_PAYER_PUBKEY"
echo ""

echo "Funding deployer ($DEPLOYER_PUBKEY) with 100 SOL..."
solana airdrop 100 "$DEPLOYER_PUBKEY" --url "$SOLANA_URL"

echo "Funding relayer payer ($RELAYER_PAYER_PUBKEY) with 10 SOL..."
solana airdrop 10 "$RELAYER_PAYER_PUBKEY" --url "$SOLANA_URL"

echo ""
echo "=== Balances ==="
echo "  Deployer:      $(solana balance "$DEPLOYER_PUBKEY" --url "$SOLANA_URL")"
echo "  Relayer payer: $(solana balance "$RELAYER_PAYER_PUBKEY" --url "$SOLANA_URL")"
echo ""
echo "Done."
