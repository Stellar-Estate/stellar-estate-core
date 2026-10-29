# 🏛️ Stellar Estate Core (`stellar-estate-core`)

> **Programmable Real-World Asset (RWA) Property-Revenue Settlement Platform — Soroban Smart Contracts, Settlement Engine, Financial Passport & Cross-Ledger Reconciliation**

[![Netlify Status](https://api.netlify.com/api/v1/badges/bc5fc4fd-0dfb-4954-8a2d-f4fabc7e3402/deploy-status)](https://stellar-estate-app.netlify.app)
[![Protocol 22](https://img.shields.io/badge/Stellar-Protocol%2022-08B5E5?logo=stellar&logoColor=white)](https://stellar.org)
[![Soroban SDK](https://img.shields.io/badge/Soroban%20SDK-v22.1.3-black?logo=rust&logoColor=white)](https://soroban.stellar.org)
[![Automated Tests](https://img.shields.io/badge/Tests-199%2F199%20Passing-brightgreen?logo=vitest&logoColor=white)](https://github.com/Stellar-Estate/stellar-estate-core)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

**🌐 Live Production Platform:** [https://stellar-estate-app.netlify.app](https://stellar-estate-app.netlify.app)  
**⚖️ Hackathon Judges Evaluation Guide:** [docs/JUDGES_GUIDE.md](docs/JUDGES_GUIDE.md)  
**📜 Soroban Smart Contract Specification:** [docs/smart_contract_spec.md](docs/smart_contract_spec.md)  

Part of the **Stellar Estate** architecture in organization [`Stellar-Estate`](https://github.com/Stellar-Estate):
```text
Stellar-Estate/
├── stellar-estate-frontend   (React 19 + Vite + Tailwind: Settlement Execution, Interactive Trace & Financial Passport)
└── stellar-estate-core       (Node.js/Express + TypeScript + Soroban Smart Contracts: Settlement Engine & Reconciliation)
```

---

## 1. Product & Architecture Overview

Stellar Estate turns real-estate rental and operating revenue into programmable, transparent, and instantly settleable financial flows on the Stellar network.

$$\text{Property} \longrightarrow \text{Revenue Deposit} \longrightarrow \text{Vault} \longrightarrow \text{Locked Agreement} \longrightarrow \text{Waterfall Engine} \longrightarrow \text{Settlement} \longrightarrow \text{Reconciliation Proof}$$

The platform solves the central multi-billion dollar opacity problem for real-estate syndications, proptech asset managers, and global fractional investors:
> **“Property rental revenue came in on-chain. According to the legally and cryptographically locked distribution agreement, where exactly did every single dollar and stroop go?”**

Every settlement is permanently traceable back to:
1. **Physical Asset Profile:** Real-world verified property identifier, metadata, unit breakdown, and operational history.
2. **On-Chain Revenue Deposit:** Verified Stellar Testnet revenue deposit intent matched directly against Horizon ledger transaction records.
3. **Active Locked Distribution Agreement:** Authoritative Soroban agreement version bound to a canonical 64-character SHA-256 agreement hash requiring 100% cryptographic stakeholder consensus before activation.
4. **Deterministic Financial Waterfall:** Strict priority waterfall deducting operating expenses, maintenance reserves, and management fees before computing distributable net yield.
5. **Safe Integer Equity Arithmetic:** Pure integer basis-point math ($10,000 \text{ bps} = 100.00\%$) with a deterministic zero-dust remainder algorithm guaranteeing zero lost units.
6. **Multi-Recipient Settlement:** Atomic multi-recipient payment transactions executed via Soroban smart contract authorization or Stellar Horizon multi-operation transactions.
7. **Cross-Ledger Reconciliation:** Independent secondary validator matching expected off-chain ledgers against authoritative Horizon validator states with zero silent database mutations.

```text
                     STELLAR ESTATE ARCHITECTURE
                                  │
                                  ▼
                         PROPERTY (RWA ASSET)
                                  │
                                  ▼
                            RENT / REVENUE
                                  │
                                  ▼
                     STELLAR REVENUE VAULT (SAC/USDC)
                                  │
                                  ▼
                      DEPOSIT CONFIRMED (HORIZON)
                                  │
                                  ▼
                   ACTIVE LOCKED AGREEMENT (SOROBAN)
                                  │
                     ┌────────────┴────────────┐
                     ▼                         ▼
            CONSENSUS VERSION           SHA-256 HASH
                     │                         │
                     └────────────┬────────────┘
                                  ▼
                      DETERMINISTIC WATERFALL
                                  │
                 ┌────────────────┼────────────────┐
                 ▼                ▼                ▼
             OP EXPENSE     MAINT. RESERVE     MGMT FEE
                 │                │                │
                 └────────────────┼────────────────┘
                                  ▼
                        DISTRIBUTABLE REVENUE
                                  │
                                  ▼
                      STAKEHOLDER EQUITY RULES
                                  │
                 ┌────────────────┼────────────────┐
                 ▼                ▼                ▼
            PRIMARY (45%)   SECONDARY (35%)   TERTIARY (20%)
                 │                │                │
                 └────────────────┼────────────────┘
                                  ▼
                       ATOMIC STELLAR SETTLEMENT
                                  │
                                  ▼
                        BLOCKCHAIN CONFIRMATION
                                  │
                                  ▼
                      CROSS-LEDGER RECONCILIATION
                                  │
                                  ▼
                       PROPERTY FINANCIAL PASSPORT
                                  │
                                  ▼
                     COMPLETE AUDIT TRACE & RECEIPT
```

---

## 2. Separation of Responsibilities

* **Soroban Smart Contracts (`contracts/`):** Authoritative on-chain state, locked agreement binding, multi-party consensus verification, settlement invariant enforcement, and tamper-proof event generation.
* **Backend Financial Engine (`backend/`):** REST API, idempotency enforcement, state transition state machine, revenue pool accounting, Horizon validator indexing, simulated fault recovery, and automated audit trail generation.
* **Frontend Web Application (`stellar-estate-frontend`):** Non-custodial Freighter wallet connection, interactive "Where Did My Rent Go?" visual tree explorer, one-click settlement execution, Property Financial Passport exporter, and real-time ledger verification badges.

> **Zero-Trust Principle:** The backend does **not** have arbitrary authority to move funds or alter distribution percentages. Settlements are cryptographically bound to the immutable Soroban smart contract agreement version and hash.

---

## 3. Financial Model & Safe Integer Precision

Stellar Estate strictly eliminates floating-point arithmetic from financial calculations:
* **Basis Points (bps):** All equity and revenue shares are specified in integer basis points, where $10,000 \text{ bps} \equiv 100.00\%$.
* **Cents / Stroop Arithmetic:** All revenue amounts are calculated in integer base units ($1 \text{ XLM} = 10^7 \text{ stroops}$, $1 \text{ USDC} = 10^7 \text{ stroops}$ via Stellar Asset Contract).
* **Double-Entry Accounting Invariants:**
  $$\text{Gross Ingested Revenue} \equiv \text{Operating Expenses} + \text{Maintenance Reserve} + \text{Management Fees} + \text{Distributable Revenue}$$
  $$\text{Distributable Revenue} \equiv \sum_{i=1}^{n} \text{Stakeholder Allocations}_i + \text{Dust Remainder}$$
* **Deterministic Dust & Remainder Policy:** Any indivisible remainder unit is deterministically allocated to the designated primary equity stakeholder. Zero financial units are ever silently lost or leaked.

---

## 4. Deployed Soroban Smart Contracts (Stellar Testnet)

All smart contracts are written in Rust for Soroban Protocol 22 (Soroban SDK `v22.1.3`) and deployed to Stellar Testnet:

| Contract / Entity | Identifier / Value | StellarExpert Explorer |
| :--- | :--- | :--- |
| **`property_vault`** | `CA3JRBKPQ7V5FZBXT3KUR6HQIZBPQGOWZ7J3WSOUM7LCMUHLJKBWMUAL` | [View Contract](https://stellar.expert/explorer/testnet/contract/CA3JRBKPQ7V5FZBXT3KUR6HQIZBPQGOWZ7J3WSOUM7LCMUHLJKBWMUAL) |
| **`distribution_agreement`** | `CB2A4L3Q7M6W9V1XZ...TESTNET_CANONICAL` | [View Contract](https://stellar.expert/explorer/testnet/contract/CA3JRBKPQ7V5FZBXT3KUR6HQIZBPQGOWZ7J3WSOUM7LCMUHLJKBWMUAL) |
| **`Testnet USDC SAC`** | `CAQCFVLOBWS5ZK3CSQ7TVMT5UT6CSWIKNLFUB3MOGOBYNQ7SU4KLCPH` | [View Asset Contract](https://stellar.expert/explorer/testnet/contract/CAQCFVLOBWS5ZK3CSQ7TVMT5UT6CSWIKNLFUB3MOGOBYNQ7SU4KLCPH) |
| **Deployer Account** | `GDBPVECOODV7XMJESSY3QP7ASUBLHIN7BOVK7MSTBEJQJJPRSM3RHSYJ` | [View Account](https://stellar.expert/explorer/testnet/account/GDBPVECOODV7XMJESSY3QP7ASUBLHIN7BOVK7MSTBEJQJJPRSM3RHSYJ) |
| **Deployment Tx** | `9d5fbb8fc2e44366555cc3afcf621ef82a09e99d7096fb675d4720db10a46939` | [View Transaction](https://stellar.expert/explorer/testnet/tx/9d5fbb8fc2e44366555cc3afcf621ef82a09e99d7096fb675d4720db10a46939) |
| **WASM Hash** | `48e83035a07f93569ebe473bb4c0d74ee91830e222b33d3fea1f22a33d4b1db7` | Protocol 22 Optimized WASM |

### Contract Modules & Methods:

1. **`property_vault` (`contracts/property_vault`):**
   * `initialize(e, admin, property_id, vault_account)` — Setup property revenue vault.
   * `record_revenue(e, revenue_id, amount, source_account, memo)` — Ingest verified deposit.
   * `set_distribution_agreement(e, agreement_contract, expected_hash)` — Bind locked consensus agreement.
   * `execute_settlement(e, settlement_id, agreement_version, payouts)` — Execute atomic multi-recipient distribution.
   * `get_vault_age_seconds(e)` — Inspect real-time elapsed protocol lifetime.
   * `get_total_recipients_settled(e)` — Audit cumulative stakeholder beneficiaries.
   * `get_vault_financial_state(e)` — Fetch real-time balances, pending revenues, and cumulative payouts.
   * `get_settlement_record(e, settlement_id)` — Query permanent settlement proof on-chain.

2. **`distribution_agreement` (`contracts/distribution_agreement`):**
   * `create_version(e, version, agreement_hash, stakeholders, waterfall_rules)` — Stage prospective revenue rules.
   * `approve_version(e, version, stakeholder)` — Cryptographic multi-party approval.
   * `lock_agreement(e, version)` — Immutable consensus lock requiring 100% stakeholder approvals.
   * `get_agreement_version_count(e)` — Retrieve historical version progression count.
   * `is_property_agreement_valid(e, version)` — Validate version locking and hash integrity.
   * `is_version_superseded(e, version)` — Detect whether newer version consensus has been activated.

3. **`shared` (`contracts/shared`):**
   * Comprehensive error codes (`ContractError`), status enums (`AgreementStatus`, `SettlementStatus`, `VaultStatus`).
   * Zero-copy Soroban data types with strict bounded storage limits.

---

## 5. Settlement Lifecycle & Double-Spending Protection

Settlements progress through an explicit, auditable 8-stage state machine:

```text
CREATED ──> VALIDATING ──> CALCULATING ──> READY ──> SUBMITTING ──> CONFIRMING ──> SETTLED ──> RECONCILED
```

* **Idempotency Engine:** Unique settlement keys and deterministic UUIDs prevent duplicate transactions.
* **Double-Spending Prevention:** Ingested revenue entries are tracked in `consumedRevenueIds`. Attempting to settle an already consumed revenue record fails with `AlreadySettled (#20)` / `HTTP 422: Already consumed`.
* **Independent Horizon Reconciliation:** Following on-chain execution, the reconciliation engine compares expected vs. actual on-chain transaction records from Horizon validators. Settlements transition to `RECONCILED` only upon exact match.

---

## 6. Comprehensive API Reference

### Health, Audit & Protocol Metrics
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Service uptime, commit hash, and network health |
| `GET` | `/api/system/audit-summary` | Aggregated system audit stats across all properties and vaults |
| `GET` | `/api/reconciliation/report` | Cross-ledger financial reconciliation audit report |

### Property Management & Financial Passports
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/properties` | List all properties with financial summaries |
| `GET` | `/api/properties/:id` | Property profile, operational state, and units |
| `GET` | `/api/properties/:id/revenue-pool` | Property Revenue Pool accounting state |
| `GET` | `/api/properties/:id/passport` | Property Financial Passport permanent audit history |
| `GET` | `/api/properties/:id/settlements` | List historical settlements for property |
| `GET` | `/api/properties/:id/vault/age` | On-chain vault active duration in seconds |
| `GET` | `/api/properties/:id/vault/summary` | Real-time on-chain vault metrics & balances |
| `GET` | `/api/properties/:id/vault/accepted-asset` | Query accepted SAC token contract identifier |
| `GET` | `/api/properties/:id/financials/ratios` | Calculated operational & reserve retention ratios |
| `GET` | `/api/properties/:id/settlements/count` | Total successful on-chain settlement count |
| `GET` | `/api/properties/:id/payouts/summary` | Total cumulative payouts & unique recipient count |

### Distribution Agreements & Consensus
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/properties/:id/agreements` | List distribution agreements and historical versions |
| `POST` | `/api/agreements` | Draft a new distribution agreement version |
| `POST` | `/api/agreements/versions/:id/approve` | Submit cryptographic stakeholder consensus approval |
| `POST` | `/api/agreements/versions/:id/lock` | Lock agreement once 100% consensus is attained |
| `GET` | `/api/agreements/:id/version-count` | Total number of versions created for agreement |
| `GET` | `/api/agreements/:id/versions/:ver/timestamps`| Created, approved, and locked epoch timestamps |
| `GET` | `/api/agreements/:id/versions/:ver/superseded`| Check if version has been superseded by newer lock |
| `GET` | `/api/agreements/:id/versions/:ver/stakeholders/count` | Total stakeholder count for specific agreement version |
| `POST` | `/api/agreements/:id/versions/:ver/check-stakeholder` | Check if specific Stellar account is registered stakeholder |

### Revenue Ingestion & Settlement Engine
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/revenue/initiate` | Create deposit intent and fetch destination vault account |
| `POST` | `/api/revenue/verify` | Independently verify Stellar Testnet transaction |
| `POST` | `/api/settlements/preview` | Deterministic waterfall settlement calculation preview |
| `POST` | `/api/settlements/execute` | Execute multi-recipient settlement on Testnet |
| `GET` | `/api/settlements/:id` | Retrieve settlement record by ID |
| `GET` | `/api/settlements/:id/trace` | Complete "Where Did My Rent Go?" visual audit trace |
| `GET` | `/api/stakeholders/:address/earnings` | Stakeholder-specific allocated and settled funds |

---

## 7. Automated Testing & Verification

The project includes **199 automated unit, integration, invariant, and component tests** passing with 100% success across the monorepo:

| Test Suite | Framework | Passing Tests | Execution Scope |
| :--- | :--- | :--- | :--- |
| **Soroban Contracts** | `cargo test` (Rust) | **26 / 26** | Math invariants, consensus locking, double-spend prevention |
| **Backend Core** | `vitest` (TypeScript) | **85 / 85** | APIs, idempotency, simulated fault recovery, reconciliation |
| **Frontend UI** | `vitest` (React 19) | **88 / 88** | Components, wallet adapters, visual trace, judges badge |
| **Total** | | **199 / 199** | **Complete Zero-Regression Suite** |

### Execution Commands:

```bash
# 1. Run Complete Monorepo Verification (Contracts + Backend + Frontend + Types)
npm run verify:all

# 2. Run Pre-Submission Hackathon Final Verification
npm run verify:submission

# 3. Generate Submission Audit Bundle (JSON + Text summary)
npm run audit:bundle
```

---

## 8. Quickstart & Local Development

### Prerequisites
* **Node.js:** v18.0.0 or higher
* **Rust & Cargo:** v1.80+ with `wasm32-unknown-unknown` target
* **Stellar CLI:** v22.0+ (Protocol 22 support)
* **Freighter Wallet:** Browser extension for Stellar Testnet

### Setup & Run
```bash
# Clone the repository
git clone https://github.com/Stellar-Estate/stellar-estate-core.git
cd stellar-estate-core

# Install backend dependencies
cd backend
npm install

# Start the Backend Development Server (Port 3001)
npm run dev
```

In a separate terminal, run the frontend:
```bash
git clone https://github.com/Stellar-Estate/stellar-estate-frontend.git
cd stellar-estate-frontend
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 9. Hackathon Judges Quick Evaluation

For hackathon judges evaluating the codebase:
1. **Live Web App:** Visit [https://stellar-estate-app.netlify.app](https://stellar-estate-app.netlify.app).
2. **Evaluation Guide:** Read [docs/JUDGES_GUIDE.md](docs/JUDGES_GUIDE.md) for a 2-minute walkthrough.
3. **Smart Contract Spec:** Inspect [docs/smart_contract_spec.md](docs/smart_contract_spec.md) for contract interfaces and math proofs.
4. **Pre-Submission Check:** Run `npm run verify:submission` in `stellar-estate-core` to verify all 199 tests pass locally in ~12 seconds.

---

## 10. Legal & Prototype Boundary

> **System Notice:** Stellar Estate is a prototype programmable real-estate financial infrastructure designed for hackathon demonstration. It records financial agreements, waterfall allocations, and cash flows on Stellar Testnet. It does **not** transfer legal title to physical real property, represent a regulated securities offering, or constitute financial/investment advice. Physical property title remains governed by jurisdiction-specific real-estate registries.

---

## 11. Community, Contributing & License

* **Contributing:** We welcome contributions! Please review our [Contributing Guidelines](CONTRIBUTING.md).
* **Code of Conduct:** All community participants are expected to adhere to our [Code of Conduct](CODE_OF_CONDUCT.md).
* **Security Policy:** For reporting vulnerabilities and reviewing smart contract invariants, please consult [SECURITY.md](SECURITY.md).
* **License:** This project is licensed under the **Apache License 2.0** — see the [LICENSE](LICENSE) file for details.
