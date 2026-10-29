#!/usr/bin/env bash
set -e
echo "=== Running Soroban Smart Contract Test Suite (Cargo Offline) ==="
cargo test --offline
echo "All Soroban Smart Contract tests passed successfully!"
