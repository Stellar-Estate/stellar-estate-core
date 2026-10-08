# Contributing to Stellar Estate Core

Thank you for your interest in contributing to **Stellar Estate Core**! We welcome community contributions, bug reports, feature requests, and security disclosures.

---

## Code of Conduct

All contributors and maintainers are expected to adhere to our [Code of Conduct](CODE_OF_CONDUCT.md). Please read it before participating in our issues, discussions, or pull requests.

---

## Architecture Overview

`stellar-estate-core` combines the financial backend and Soroban smart contracts:

```text
stellar-estate-core/
├── backend/            # Express, TypeScript, database models, Horizon verifier, settlement engine
├── contracts/          # Rust Soroban smart contracts (property_vault, distribution_agreement, shared)
├── migrations/         # PostgreSQL DDL migrations
├── docs/               # System & settlement architecture specifications
└── tests/              # End-to-end integration test runners
```

### Key Architectural Invariants
1. **Zero Floating Point Arithmetic:** All financial calculations, fee tranches, and equity payouts must use safe integer arithmetic with basis points ($10,000 \text{ bps} = 100.00\%$) and base currency cents/stroops.
2. **Authoritative Contracts:** The backend orchestrates indexing and reconciliation, but Soroban contracts enforce financial agreements, version locks, and settlement disbursement invariant rules.
3. **Idempotency & Replay Protection:** Settlement runs and revenue consumption must always be idempotent. Double-spending a revenue record is strictly prevented.

---

## Development Setup

### Prerequisites
* **Node.js**: v20+ with npm v10+
* **Rust**: `1.80.0` or later with `wasm32-unknown-unknown` target:
  ```bash
  rustup target add wasm32-unknown-unknown
  ```
* **Git**: with conventional commit discipline

### 1. Backend Setup & Verification
```bash
cd backend
npm install
npm test            # Run 19/19 Vitest integration tests
npm run build       # Validate TypeScript compilation
npm run dev         # Launch local API on port 3001
```

### 2. Soroban Smart Contracts Setup & Tests
```bash
cd contracts
cargo test --workspace --verbose
```

---

## Submitting Pull Requests

1. **Pick or Open an Issue:** Check our [Issue Tracker](https://github.com/Stellar-Estate/stellar-estate-core/issues) for open tasks (especially those tagged `good first issue`). Leave a comment indicating you would like to work on it.
2. **Branch Naming:** Create a focused feature branch from `main`:
   - `feat/add-horizon-healthcheck`
   - `fix/dust-allocation-rounding`
   - `docs/clarify-error-codes`
3. **Commit Messages:** Follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat(contracts): emit rev_rec event on revenue ingestion`
   - `fix(backend): prevent duplicate settlement execution on same revenue id`
   - `test(reconciliation): assert zero discrepancy report`
4. **Automated Verification:** Ensure all test suites pass locally before submitting:
   ```bash
   cd backend && npm test && npm run build
   cd ../contracts && cargo test --workspace
   ```
5. **Open Pull Request:** Describe the problem solved, reference the issue (`Closes #12`), and attach test evidence.

---

## Security Disclosures

If you discover a security vulnerability or exploit in contract invariants, please **do not** open a public issue. Email security disclosures directly to `security@stellar-estate.org`.

---

## License

By contributing to Stellar Estate Core, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
