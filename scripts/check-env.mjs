#!/usr/bin/env node

/**
 * Stellar Estate Environment Prerequisite Verification Script
 * Validates developer toolchain readiness: Node, npm, Git, Rust, and Cargo.
 */

import { execSync } from 'child_process';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function checkCommand(name, cmd, required = true, minVersion = null) {
  process.stdout.write(`Checking ${colors.bold}${name}${colors.reset}... `);
  try {
    const output = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf-8' }).trim();
    const versionMatch = output.match(/(\d+\.\d+(\.\d+)?)/);
    const ver = versionMatch ? versionMatch[0] : output.split('\n')[0];

    if (minVersion && ver) {
      const [maj] = ver.split('.').map(Number);
      if (maj < minVersion) {
        console.log(`${colors.yellow}⚠️  v${ver} (Recommended: >= v${minVersion})${colors.reset}`);
        return true;
      }
    }
    console.log(`${colors.green}✅ ${ver}${colors.reset}`);
    return true;
  } catch (err) {
    if (required) {
      console.log(`${colors.red}❌ Missing or not found in PATH${colors.reset}`);
      return false;
    } else {
      console.log(`${colors.yellow}⚠️  Optional toolchain not found (Soroban smart contract builds require this)${colors.reset}`);
      return true;
    }
  }
}

console.log(`${colors.cyan}${colors.bold}=== Stellar Estate Core Toolchain Diagnostic ===${colors.reset}\n`);

const nodeOk = checkCommand('Node.js', 'node --version', true, 18);
const npmOk = checkCommand('npm', 'npm --version', true);
const gitOk = checkCommand('Git', 'git --version', true);
const rustOk = checkCommand('Rust Compiler (rustc)', 'rustc --version', false);
const cargoOk = checkCommand('Cargo Package Manager', 'cargo --version', false);

console.log('');
if (nodeOk && npmOk && gitOk) {
  console.log(`${colors.green}${colors.bold}Ready! Core development prerequisites satisfied.${colors.reset}\n`);
  process.exit(0);
} else {
  console.error(`${colors.red}${colors.bold}Errors detected in required prerequisites.${colors.reset}\n`);
  process.exit(1);
}
