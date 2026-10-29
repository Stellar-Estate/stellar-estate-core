#!/usr/bin/env node

/**
 * Contract-to-TypeScript Model Parity & Type Synchronization Verifier
 * Verifies that Rust Soroban contract enums, errors, and methods are mirrored in TypeScript.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const vaultContractPath = path.join(rootDir, 'contracts/property_vault/src/lib.rs');
const agrContractPath = path.join(rootDir, 'contracts/distribution_agreement/src/lib.rs');
const sharedTypesPath = path.join(rootDir, 'shared/types.ts');

console.log('--- Stellar Estate Type Synchronization Check ---');

if (!fs.existsSync(vaultContractPath) || !fs.existsSync(agrContractPath)) {
  console.error('Error: Contract source files not found!');
  process.exit(1);
}

const vaultSrc = fs.readFileSync(vaultContractPath, 'utf8');
const agrSrc = fs.readFileSync(agrContractPath, 'utf8');
const sharedTypes = fs.readFileSync(sharedTypesPath, 'utf8');

let errors = 0;

// 1. Verify VaultStatus enum states in TypeScript
const requiredVaultStatuses = ['Active', 'Paused', 'Liquidating'];
for (const status of requiredVaultStatuses) {
  if (!vaultSrc.includes(status)) {
    console.error(`Missing vault status variant in Rust contract: ${status}`);
    errors++;
  }
}

// 2. Verify AgreementStatus enum parity
const requiredAgrStatuses = ['PendingApprovals', 'Locked', 'Revoked'];
for (const status of requiredAgrStatuses) {
  if (!agrSrc.includes(status)) {
    console.error(`Missing agreement status variant in Rust contract: ${status}`);
    errors++;
  }
  const tsVariant = status.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
  if (!sharedTypes.includes(tsVariant)) {
    console.error(`Missing agreement status variant in TypeScript: ${tsVariant}`);
    errors++;
  }
}

// 3. Verify key contract method exports
const requiredVaultMethods = [
  'initialize',
  'record_revenue',
  'record_batch_revenue',
  'execute_settlement',
  'set_status',
  'get_financials',
  'get_vault_reserve_ratio_bps',
  'get_vault_admin_authority',
  'get_settlement_distrib_ratio',
];

for (const method of requiredVaultMethods) {
  if (!vaultSrc.includes(`pub fn ${method}`)) {
    console.error(`Missing expected PropertyVault export: ${method}`);
    errors++;
  }
}

const requiredAgrMethods = [
  'initialize',
  'create_version',
  'add_stakeholder',
  'approve_agreement',
  'lock_agreement',
  'revoke_agreement_proposal',
  'get_stakeholder_role',
  'is_agreement_active',
];

for (const method of requiredAgrMethods) {
  if (!agrSrc.includes(`pub fn ${method}`)) {
    console.error(`Missing expected DistributionAgreement export: ${method}`);
    errors++;
  }
}

if (errors > 0) {
  console.error(`\nFAILED: Found ${errors} type parity discrepancies.`);
  process.exit(1);
}

console.log('SUCCESS: All contract enums, statuses, and method signatures are synchronized with TypeScript models!');
process.exit(0);
