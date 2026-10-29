#!/usr/bin/env node

/**
 * Stellar Estate Hackathon Pre-Submission Verification Script
 * Validates documentation completeness, test coverage, and ecosystem integrity.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
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

console.log(`${colors.cyan}${colors.bold}================================================================${colors.reset}`);
console.log(`${colors.cyan}${colors.bold}   STELLAR ESTATE — HACKATHON PRE-SUBMISSION READINESS CHECK   ${colors.reset}`);
console.log(`${colors.cyan}${colors.bold}================================================================${colors.reset}\n`);

let passed = true;

function checkFile(relPath, baseDir = coreDir) {
  const fullPath = path.join(baseDir, relPath);
  process.stdout.write(`Checking documentation: ${relPath}... `);
  if (fs.existsSync(fullPath)) {
    const stats = fs.statSync(fullPath);
    console.log(`${colors.green}✔ Present (${stats.size} bytes)${colors.reset}`);
    return true;
  } else {
    console.log(`${colors.red}✖ Missing!${colors.reset}`);
    return false;
  }
}

// 1. Documentation assets check
console.log(`${colors.bold}1. Verifying Hackathon Submission Documentation...${colors.reset}`);
if (!checkFile('docs/JUDGES_GUIDE.md')) passed = false;
if (!checkFile('docs/smart_contract_spec.md')) passed = false;
if (!checkFile('docs/stellar_ecosystem.md')) passed = false;
if (!checkFile('docs/audit_bundle.json')) passed = false;
if (!checkFile('README.md')) passed = false;

// 2. Audit bundle currency check
console.log(`\n${colors.bold}2. Refreshing Audit Manifest...${colors.reset}`);
try {
  execSync('node scripts/generate-audit-bundle.mjs', { cwd: coreDir, stdio: 'inherit' });
  console.log(`${colors.green}✔ Audit bundle refreshed${colors.reset}`);
} catch {
  console.log(`${colors.red}✖ Failed to generate audit bundle${colors.reset}`);
  passed = false;
}

// 3. Automated check suite orchestration
console.log(`\n${colors.bold}3. Running Master Cross-Workspace Test Suite...${colors.reset}`);
try {
  execSync('node scripts/run-all-checks.mjs', { cwd: coreDir, stdio: 'inherit' });
  console.log(`${colors.green}✔ All automated verification suites passed cleanly${colors.reset}`);
} catch {
  console.log(`${colors.red}✖ One or more automated tests failed${colors.reset}`);
  passed = false;
}

console.log(`\n${colors.cyan}${colors.bold}================================================================${colors.reset}`);
if (passed) {
  console.log(`${colors.green}${colors.bold}   🎉 100% SUBMISSION READY FOR STELLAR HACKATHON EVALUATORS!   ${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}================================================================${colors.reset}\n`);
  process.exit(0);
} else {
  console.log(`${colors.red}${colors.bold}   SUBMISSION CHECKS FAILED! REVIEW ERRORS ABOVE.   ${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}================================================================${colors.reset}\n`);
  process.exit(1);
}
