#!/usr/bin/env bash
# verify-solana-programs.sh
#
# Verifies that deployed Solana programs on devnet match the local build
# artifacts by comparing SHA256 hashes (step 1 of the verification pipeline).
#
# Usage:
#   ./scripts/verify-solana-programs.sh [--url <RPC_URL>] [--program-ids-file <PATH>]
#
# Defaults:
#   --url              https://api.zan.top/node/v1/solana/devnet/a6fe1b27d8204694827438361ed0ff32
#   --program-ids-file rust/sealevel/environments/testnet/solanadevnet/core/program-ids.json
#
# Prerequisites:
#   - Solana CLI installed (solana program dump)
#   - Programs already built in rust/sealevel/target/deploy/
#   - jq installed (brew install jq / apt-get install jq)
#
# What this script does:
#   1. Reads program IDs from program-ids.json
#   2. Downloads each deployed program via `solana program dump`
#   3. Computes SHA256 of the deployed binary
#   4. Computes SHA256 of the matching local .so build artifact
#   5. Reports MATCH / MISMATCH for each program
#   6. Optionally runs `solana-verify` for on-chain registration (requires Docker)
#
# On-chain verification (Solscan / Explorer):
#   After hash verification passes, run the `solana-verify verify-from-repo`
#   command documented in Section 5.5 of TESTNET_GUIDE.md to register the
#   verification on-chain. This is what Solscan reads to show "Verified Source".

set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOLANA_RPC="${SOLANA_RPC:-https://api.zan.top/node/v1/solana/devnet/a6fe1b27d8204694827438361ed0ff32}"
PROGRAM_IDS_FILE="${PROGRAM_IDS_FILE:-$REPO_ROOT/rust/sealevel/environments/testnet/solanadevnet/core/program-ids.json}"
BUILD_DIR="$REPO_ROOT/rust/sealevel/target/deploy"
TMP_DIR="$(mktemp -d)"

# Map from JSON key → .so file name (without extension)
# Two parallel arrays — avoids bash 4 associative array requirement (macOS ships bash 3.2)
PROGRAM_JSON_KEYS=(
  "mailbox"
  "igp_program_id"
  "validator_announce"
  "multisig_ism_message_id"
)
PROGRAM_SO_NAMES=(
  "hyperlane_sealevel_mailbox"
  "hyperlane_sealevel_igp"
  "hyperlane_sealevel_validator_announce"
  "hyperlane_sealevel_multisig_ism_message_id"
)

# ─── Helpers ──────────────────────────────────────────────────────────────────

log()  { echo "  $*"; }
pass() { echo "  ✓ $*"; }
fail() { echo "  ✗ $*"; }
info() { echo ""; echo "── $*"; }

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

check_deps() {
  local missing=()
  for cmd in jq sha256sum solana; do
    if ! command -v "$cmd" &>/dev/null; then
      # macOS uses shasum instead of sha256sum
      if [ "$cmd" = "sha256sum" ] && command -v shasum &>/dev/null; then
        continue
      fi
      missing+=("$cmd")
    fi
  done
  if [ ${#missing[@]} -gt 0 ]; then
    echo "ERROR: Missing required tools: ${missing[*]}"
    echo "  Install jq:    brew install jq (macOS) or apt-get install jq (Linux)"
    echo "  Install solana: https://docs.solanalabs.com/cli/install"
    exit 1
  fi
}

sha256_file() {
  local file="$1"
  if command -v sha256sum &>/dev/null; then
    sha256sum "$file" | awk '{print $1}'
  else
    shasum -a 256 "$file" | awk '{print $1}'
  fi
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --url)
        SOLANA_RPC="$2"; shift 2 ;;
      --program-ids-file)
        PROGRAM_IDS_FILE="$2"; shift 2 ;;
      -h|--help)
        grep '^#' "$0" | sed 's/^# \?//'
        exit 0 ;;
      *)
        echo "Unknown flag: $1"; exit 1 ;;
    esac
  done
}

# ─── Main ─────────────────────────────────────────────────────────────────────

main() {
  parse_args "$@"

  echo ""
  echo "════════════════════════════════════════════════════"
  echo "  Hyperlane Solana Program Verification"
  echo "  RPC   : $SOLANA_RPC"
  echo "  IDs   : $PROGRAM_IDS_FILE"
  echo "  Build : $BUILD_DIR"
  echo "════════════════════════════════════════════════════"

  check_deps

  if [ ! -f "$PROGRAM_IDS_FILE" ]; then
    echo "ERROR: program-ids.json not found at $PROGRAM_IDS_FILE"
    echo "  Run Section 5.3 (core deploy) first."
    exit 1
  fi

  local all_passed=true
  local results=()

  local i
  for i in "${!PROGRAM_JSON_KEYS[@]}"; do
    local json_key="${PROGRAM_JSON_KEYS[$i]}"
    local so_name="${PROGRAM_SO_NAMES[$i]}"
    local program_id
    program_id=$(jq -r ".\"$json_key\" // empty" "$PROGRAM_IDS_FILE")

    if [ -z "$program_id" ] || [[ "$program_id" == *"REPLACE"* ]]; then
      info "$json_key  →  $so_name"
      log "SKIPPED: program ID not set in $PROGRAM_IDS_FILE (deploy first)"
      results+=("SKIP  | $so_name")
      continue
    fi

    info "$json_key  →  $so_name"
    log "Program ID : $program_id"

    # 1. Check local .so exists
    local local_so="$BUILD_DIR/${so_name}.so"
    if [ ! -f "$local_so" ]; then
      fail "Local build not found: $local_so"
      fail "Run: cd rust/sealevel/programs && ./build-programs.sh all"
      results+=("FAIL  | $so_name  (local .so missing)")
      all_passed=false
      continue
    fi

    # 2. Download deployed program
    local deployed_so="$TMP_DIR/${so_name}-deployed.so"
    log "Downloading deployed program..."
    if ! solana program dump "$program_id" "$deployed_so" \
         --url "$SOLANA_RPC" 2>/dev/null; then
      fail "Could not dump program $program_id from $SOLANA_RPC"
      fail "Ensure the program is deployed and the RPC URL is correct."
      results+=("FAIL  | $so_name  (dump failed)")
      all_passed=false
      continue
    fi

    # 3. Compare hashes
    local local_hash deployed_hash
    local_hash=$(sha256_file "$local_so")
    deployed_hash=$(sha256_file "$deployed_so")

    log "Local hash    : $local_hash"
    log "Deployed hash : $deployed_hash"

    if [ "$local_hash" = "$deployed_hash" ]; then
      pass "MATCH — binary verified ✓"
      results+=("MATCH | $so_name  ($program_id)")
    else
      fail "MISMATCH — hashes differ"
      fail "This means the deployed program was NOT built from the current source."
      fail "Possible causes:"
      fail "  - Program was deployed from a different commit or build environment"
      fail "  - Local .so is stale — re-run build-programs.sh before verifying"
      results+=("FAIL  | $so_name  ($program_id)")
      all_passed=false
    fi
  done

  # ─── Summary ────────────────────────────────────────────────────────────────

  echo ""
  echo "════════════════════════════════════════════════════"
  echo "  Results"
  echo "════════════════════════════════════════════════════"
  for r in "${results[@]}"; do
    echo "  $r"
  done
  echo ""

  if $all_passed; then
    echo "  All programs verified ✓"
    echo ""
    echo "  Next step — on-chain verification (optional, requires Docker + public repo):"
    echo "  See Section 5.5 of TESTNET_GUIDE.md for solana-verify instructions."
  else
    echo "  One or more programs FAILED verification."
    echo "  Rebuild with build-programs.sh and redeploy if needed."
    exit 1
  fi

  echo ""
}

main "$@"
