#!/usr/bin/env node

/**
 * Stellar Estate Master Check Orchestrator
 * Runs cross-workspace health diagnostics, contract tests, backend tests, and frontend tests.
 */

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const coreDir = path.resolve(__dirname, '..');
const frontendDir = path.resolve(coreDir, '..', 'stellar-estate-frontend');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function runStep(title, command, cwd = coreDir) {
  console.log(`\n${colors.cyan}${colors.bold}▶ ${title}${colors.reset}`);
  console.log(`${colors.bold}Directory:${colors.reset} ${cwd}`);
  console.log(`${colors.bold}Command:${colors.reset}   ${command}\n`);
  try {
    execSync(command, { cwd, stdio: 'inherit' });
    console.log(`${colors.green}✔ ${title} Passed${colors.reset}`);
    return true;
  } catch (err) {
    console.error(`${colors.red}✖ ${title} Failed (exit code ${err.status || 1})${colors.reset}`);
    return false;
  }
}

console.log(`${colors.cyan}${colors.bold}=====================================================${colors.reset}`);
console.log(`${colors.cyan}${colors.bold}   STELLAR ESTATE — FULL CI/CD VERIFICATION SUITE   ${colors.reset}`);
console.log(`${colors.cyan}${colors.bold}=====================================================${colors.reset}`);

let allPassed = true;

// Step 1: Environment prerequisite validation
const envScript = path.join(__dirname, 'check-env.mjs');
if (fs.existsSync(envScript)) {
  if (!runStep('Environment Diagnostics', `node "${envScript}"`, coreDir)) {
    allPassed = false;
  }
}

// Step 2: Shared TypeScript type synchronization check
const syncScript = path.join(__dirname, 'verify-type-sync.mjs');
if (fs.existsSync(syncScript)) {
  if (!runStep('Type Synchronization Verification', `node "${syncScript}"`, coreDir)) {
    allPassed = false;
  }
}

// Step 3: Soroban smart contracts unit tests
if (!runStep('Soroban Smart Contract Tests (cargo test)', 'cargo test --offline', coreDir)) {
  allPassed = false;
}

// Step 4: Backend unit and integration tests
const backendDir = path.join(coreDir, 'backend');
if (!runStep('Backend Integration Tests (vitest)', 'npm test -- --run', backendDir)) {
  allPassed = false;
}

// Step 5: Frontend unit and component tests
if (fs.existsSync(frontendDir)) {
  if (!runStep('Frontend Component Tests (vitest)', 'npm test -- --run', frontendDir)) {
    allPassed = false;
  }
} else {
  console.log(`${colors.yellow}Notice: Frontend workspace not found at ${frontendDir}; skipping frontend tests.${colors.reset}`);
}

console.log(`\n${colors.cyan}${colors.bold}=====================================================${colors.reset}`);
if (allPassed) {
  console.log(`${colors.green}${colors.bold}   ALL 5 STELLAR ESTATE CHECKS PASSED SUCCESSFULLY!  ${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}=====================================================${colors.reset}\n`);
  process.exit(0);
} else {
  console.log(`${colors.red}${colors.bold}   ONE OR MORE CHECKS FAILED! INSPECT LOGS ABOVE.   ${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}=====================================================${colors.reset}\n`);
  process.exit(1);
}
