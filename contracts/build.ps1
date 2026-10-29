# Stellar Estate: Reproducible Soroban WASM Build Script for Windows
$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Stellar Estate: Reproducible Soroban WASM Build Script" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$CoreRoot = Split-Path -Parent $ScriptDir

Set-Location $CoreRoot

Write-Host ">> Checking Rust toolchain and target wasm32-unknown-unknown..." -ForegroundColor Yellow
$installedTargets = rustup target list --installed
if ($installedTargets -notcontains "wasm32-unknown-unknown") {
    Write-Host "Installing wasm32-unknown-unknown target..." -ForegroundColor Yellow
    rustup target add wasm32-unknown-unknown
}

Write-Host ">> Compiling Soroban smart contracts in release mode..." -ForegroundColor Yellow
$stellarCli = Get-Command stellar -ErrorAction SilentlyContinue

if ($stellarCli) {
    Write-Host "Using Stellar CLI: $(stellar --version)" -ForegroundColor Green
    stellar contract build
} else {
    Write-Host "Stellar CLI not found in PATH, compiling using Cargo..." -ForegroundColor Green
    cargo build --target wasm32-unknown-unknown --release
}

Write-Host ""
Write-Host ">> Build Artifacts & Cryptographic Checksums (SHA-256):" -ForegroundColor Cyan
$WasmDir = Join-Path $CoreRoot "target\wasm32-unknown-unknown\release"

if (Test-Path $WasmDir) {
    Get-ChildItem -Path $WasmDir -Filter "*.wasm" | ForEach-Object {
        $hash = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower()
        $sizeKb = [Math]::Round($_.Length / 1024, 2)
        Write-Host "  - $($_.Name) ($($sizeKb) KB) -> SHA256: $hash" -ForegroundColor Green
    }
} else {
    Write-Host "WASM directory $WasmDir not found. Check build logs above." -ForegroundColor Red
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Build Completed Successfully!" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
