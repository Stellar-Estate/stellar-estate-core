Write-Host "=== Running Soroban Smart Contract Test Suite (Cargo Offline) ===" -ForegroundColor Cyan
cargo test --offline
if ($LASTEXITCODE -ne 0) {
  Write-Host "Contract tests failed!" -ForegroundColor Red
  exit 1
}
Write-Host "All Soroban Smart Contract tests passed successfully!" -ForegroundColor Green
