#!/usr/bin/env bash
set -euo pipefail

BLOCKCHAIN_NAME="${BLOCKCHAIN_NAME:-agentmarket}"
CHAIN_ID="${CHAIN_ID:-99999}"
TOKEN_SYMBOL="${TOKEN_SYMBOL:-tAGT}"

export PATH="/root/bin:${PATH}"

echo "=== Avalanche CLI version ==="
avalanche --version

echo "=== Creating blockchain: ${BLOCKCHAIN_NAME} ==="
if avalanche blockchain describe "${BLOCKCHAIN_NAME}" >/dev/null 2>&1; then
  echo "Blockchain ${BLOCKCHAIN_NAME} already exists"
else
  avalanche blockchain create "${BLOCKCHAIN_NAME}" \
    --evm \
    --evm-chain-id "${CHAIN_ID}" \
    --evm-token-symbol "${TOKEN_SYMBOL}" \
    --proof-of-authority \
    --testnet-faucet \
    --defaults \
    --skip-update-check \
    --force
fi

echo "=== Deploying blockchain locally ==="
avalanche blockchain deploy "${BLOCKCHAIN_NAME}" --local --skip-update-check

echo "=== Network status ==="
avalanche network status || true

echo "=== Blockchain describe ==="
avalanche blockchain describe "${BLOCKCHAIN_NAME}" --local
