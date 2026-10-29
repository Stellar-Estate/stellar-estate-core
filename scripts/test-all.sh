#!/usr/bin/env bash
set -e

echo "=== 1. Verifying Contract & TypeScript Type Parity ==="
node scripts/verify-type-sync.mjs

echo "=== 2. Running Soroban Smart Contract Test Suite ==="
cargo test --workspace

echo "=== 3. Running Core Backend Vitest Suite ==="
cd backend && npm test -- --run

echo "=== ALL CORE TESTS PASSED SUCCESSFULLY! ==="
