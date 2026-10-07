# 🏛️ Stellar Estate Core (`stellar-estate-core`)

> **Programmable Property-Revenue Settlement Platform — Financial Core, Soroban Contracts, Settlement Engine & Reconciliation**

[![Netlify Status](https://api.netlify.com/api/v1/badges/bc5fc4fd-0dfb-4954-8a2d-f4fabc7e3402/deploy-status)](https://stellar-estate-app.netlify.app)
**🌐 Live Production Platform:** [https://stellar-estate-app.netlify.app](https://stellar-estate-app.netlify.app)

Part of the **Stellar Estate** architecture in organization [`Stellar-Estate`](https://github.com/Stellar-Estate).

```text
Stellar-Estate/
├── stellar-estate-frontend   (Web Application, Settlement Execution, Interactive Trace & Financial Passport)
└── stellar-estate-core       (Backend API, Soroban Contracts, Settlement Engine & Reconciliation Service)
```

---

## 1. Product & Architecture Overview

Stellar Estate turns real-estate revenue into programmable, traceable, and settleable financial flows on the Stellar network.

$$\text{Property} \longrightarrow \text{Revenue} \longrightarrow \text{Vault} \longrightarrow \text{Locked Agreement} \longrightarrow \text{Waterfall} \longrightarrow \text{Settlement} \longrightarrow \text{Proof}$$

The platform answers the central question for real-estate investors, managers, and stakeholders:
> **“Property revenue came in. According to the locked agreement, where exactly did the money go?”**

Every settlement is permanently traceable back to:
1. The property identifier and physical asset record.
2. The real verified Stellar Testnet revenue deposit.
3. The active locked distribution agreement version and canonical SHA-256 hash.
4. The deterministic waterfall rules (operating expenses, maintenance reserve, management fees).
5. The calculated stakeholder allocations using safe integer arithmetic ($10,000 \text{ bps} = 100\%$).
6. The actual multi-recipient Stellar blockchain transactions.
7. Independent cross-ledger reconciliation with zero silent database alterations.

```text
                    STELLAR ESTATE
                          │
                          ▼
                     PROPERTY
                          │
                          ▼
                   RENT / REVENUE
                          │
                          ▼
                STELLAR REVENUE VAULT
                          │
                          ▼
                 REVENUE CONFIRMED
                          │
                          ▼
              ACTIVE LOCKED AGREEMENT
                          │
                 ┌────────┴────────┐
                 │                 │
                 ▼                 ▼
             VERSION             HASH
                 │                 │
                 └────────┬────────┘
                          ▼
                    WATERFALL
                          │
             ┌────────────┼────────────┐
             ▼            ▼            ▼
          EXPENSE       RESERVE       FEE
             │            │            │
             └────────────┼────────────┘
                          ▼
                 DISTRIBUTABLE REVENUE
                          │
                          ▼
                  STAKEHOLDER RULES
                          │
             ┌────────────┼────────────┐
             ▼            ▼            ▼
           ALICE         BOB        CHARLIE
             │            │            │
             └────────────┼────────────┘
                          ▼
                  STELLAR SETTLEMENT
                          │
                          ▼
                  BLOCKCHAIN CONFIRM
                          │
                          ▼
                    RECONCILIATION
                          │
                          ▼
                FINANCIAL PASSPORT
                          │
                          ▼
                COMPLETE AUDIT TRAIL
```

---

## 2. Separation of Responsibilities

* **Frontend:** User experience, non-custodial wallet interaction, settlement execution, interactive "Where Did My Rent Go?" visual trace, and Property Financial Passport.
* **Backend:** Application state, revenue indexing, accounting records, settlement orchestration, reconciliation engine, idempotency, and failure recovery.
* **Soroban Smart Contracts:** Authoritative financial rules, locked agreement binding, agreement version verification, settlement authorization, and invariant enforcement.

> **Principle:** The backend does **not** have arbitrary authority to move funds or alter distribution percentages. Settlements are bound to the authoritative on-chain locked agreement.

---

## 3. Financial Model & Safe Integer Precision

Stellar Estate strictly eliminates floating-point arithmetic from financial calculations:
* **Basis Points (bps):** All equity and revenue shares are specified in basis points, where $10,000 \text{ bps} = 100.00\%$.
* **Cents / Stroop Arithmetic:** All revenue amounts are calculated in integer base units.
* **Accounting Invariants:**
  $$\text{Gross Revenue} \equiv \text{Operating Expenses} + \text{Maintenance Reserve} + \text{Management Fees} + \text{Distributable Revenue}$$
  $$\text{Distributable Revenue} \equiv \sum_{i} \text{Stakeholder Allocations}_i + \text{Dust Remainder}$$
* **Deterministic Dust & Remainder Policy:** Any indivisible remainder unit is deterministically allocated to the designated primary equity stakeholder. Zero financial units are ever silently lost.

---

## 4. Soroban Smart Contracts (`contracts/`)

Implemented in Rust for the Soroban smart contract framework:

1. **`property_vault` (`contracts/property_vault`):**
   * Manages property metadata and financial state.
   * Records verified revenue entries (`record_revenue`).
   * Binds the active locked distribution agreement contract and canonical SHA-256 hash (`set_distribution_agreement`).
   * Executes multi-recipient settlements (`execute_settlement`).
   * Enforces double-spending and duplicate settlement protection (`AlreadySettled (#20)`).
   * Validates accounting invariants (`InvalidSettlementAmount (#21)`, `RecipientAllocationMismatch (#24)`).
   * Emits authoritative events: `init_vlt`, `rev_rec`, `settle`.

2. **`distribution_agreement` (`contracts/distribution_agreement`):**
   * Stores agreement versions and deterministic 64-character SHA-256 agreement hashes (`create_version`).
   * Collects cryptographic stakeholder approvals (`approve_version`).
   * Enforces 100% stakeholder approvals prior to locking (`IncompleteApprovals (#14)`).
   * Permanently locks rule sets into immutable state (`lock_agreement`).
   * Rejects post-lock tampering with `AgreementLocked (#13)`.

3. **`shared` (`contracts/shared`):**
   * Contract error enum (`ContractError`), status enums (`AgreementStatus`, `SettlementStatus`, `VaultStatus`).
   * Data structures: `SettlementRecord`, `RecipientPayout`, `PropertyMetadata`, `VaultFinancialState`.

---

## 5. Settlement Lifecycle & Double-Spending Protection

Settlements progress through an explicit, auditable state machine:

```text
CREATED ──> VALIDATING ──> CALCULATING ──> READY ──> SUBMITTING ──> CONFIRMING ──> SETTLED ──> RECONCILED
```

* **Idempotency:** Unique settlement identifiers (e.g. `STL-MERIDIAN-001`) prevent replay.
* **Double-Spending Prevention:** Ingested revenue entries are tracked in `consumedRevenueIds`. Attempting to settle an already consumed revenue record fails with `AlreadySettled (#20)` / `HTTP 422: Already consumed`.
* **Independent Reconciliation:** Following on-chain execution, the reconciliation engine compares expected vs. actual on-chain transaction records from Horizon validators. Settlements transition to `RECONCILED` only upon exact match. Discrepancies generate a `RECONCILIATION_REQUIRED` alert.

---

## 6. API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Health and uptime status |
| `GET` | `/api/properties` | List all properties with financial summaries |
| `GET` | `/api/properties/:id` | Property profile, units, and participations |
| `GET` | `/api/properties/:id/revenue-pool` | Property Revenue Pool accounting state |
| `GET` | `/api/properties/:id/passport` | Property Financial Passport permanent history |
| `GET` | `/api/properties/:id/settlements` | List historical settlements for property |
| `POST` | `/api/settlements/preview` | Deterministic waterfall settlement preview |
| `POST` | `/api/settlements/execute` | Execute multi-recipient settlement on Testnet |
| `GET` | `/api/settlements/:id` | Retrieve settlement record by ID |
| `GET` | `/api/settlements/:id/trace` | Complete "Where Did My Rent Go?" audit trace |
| `GET` | `/api/stakeholders/:address/earnings` | Stakeholder-specific allocated and settled funds |
| `GET` | `/api/properties/:id/agreements` | List distribution agreements and versions |
| `POST` | `/api/agreements` | Create a new distribution agreement |
| `POST` | `/api/agreements/versions/:id/approve` | Cryptographic stakeholder approval |
| `POST` | `/api/agreements/versions/:id/lock` | Lock agreement once all approvals received |
| `POST` | `/api/revenue/initiate` | Create deposit intent and fetch vault |
| `POST` | `/api/revenue/verify` | Independently verify Stellar Testnet transaction |
| `GET` | `/api/reconciliation/report` | Cross-ledger financial reconciliation report |

---

## 7. Automated Testing & Verification

```bash
# Run Backend Integration & Financial Invariant Tests (19/19 Passing)
cd backend
npm test

# Build and Typecheck Backend
npm run lint
npm run build

# Run Soroban Smart Contract Unit & Invariant Tests
cd ../contracts
cargo test --workspace --verbose
```

---

## 8. Legal & Prototype Boundary

> **System Notice:** Stellar Estate is a prototype programmable real-estate financial infrastructure. It records financial agreements, waterfall allocations, and cash flows on Stellar Testnet. It does **not** transfer legal title to physical property, represent a regulated securities offering, or constitute financial/investment advice. Physical property title remains governed by jurisdiction-specific real-estate registries.
