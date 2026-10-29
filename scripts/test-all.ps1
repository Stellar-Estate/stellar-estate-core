Write-Host "=== 1. Verifying Contract & TypeScript Type Parity ===" -ForegroundColor Cyan
node scripts/verify-type-sync.mjs
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "=== 2. Running Soroban Smart Contract Test Suite ===" -ForegroundColor Cyan
cargo test --offline
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "=== 3. Running Core Backend Vitest Suite ===" -ForegroundColor Cyan
cd backend
npm test -- --run
if ($LASTEXITCODE -ne 0) { exit 1 }
cd ..

Write-Host "=== ALL CORE TESTS PASSED SUCCESSFULLY! ===" -ForegroundColor Green
