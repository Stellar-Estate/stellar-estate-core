#!/usr/bin/env bash
set -euo pipefail

echo "=========================================================="
echo " Stellar Estate: Reproducible Soroban WASM Build Script"
echo "=========================================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${CORE_ROOT}"

echo ">> Checking Rust toolchain and target wasm32-unknown-unknown..."
if ! rustup target list --installed | grep -q "wasm32-unknown-unknown"; then
  echo "Installing wasm32-unknown-unknown target..."
  rustup target add wasm32-unknown-unknown
fi

echo ">> Compiling Soroban smart contracts in release mode..."
if command -v stellar &> /dev/null; then
  echo "Using Stellar CLI: $(stellar --version)"
  stellar contract build
else
  echo "Stellar CLI not found in PATH, compiling using Cargo..."
  cargo build --target wasm32-unknown-unknown --release
fi

echo ""
echo ">> Build Artifacts & Cryptographic Checksums (SHA-256):"
WASM_DIR="${CORE_ROOT}/target/wasm32-unknown-unknown/release"

if [ -d "${WASM_DIR}" ]; then
  find "${WASM_DIR}" -maxdepth 1 -name "*.wasm" | while read -r wasm_file; do
    fname=$(basename "${wasm_file}")
    if [[ ! "${fname}" =~ \.d$ ]]; then
      fsize=$(stat -c%s "${wasm_file}" 2>/dev/null || stat -f%z "${wasm_file}" 2>/dev/null || echo "unknown")
      fhash=$(sha256sum "${wasm_file}" | cut -d' ' -f1)
      echo "  - ${fname} (${fsize} bytes) -> SHA256: ${fhash}"
    fi
  done
else
  echo "WASM directory ${WASM_DIR} not found. Check build logs above."
fi

echo ""
echo "=========================================================="
echo " Build Completed Successfully!"
echo "=========================================================="
