# 🏛️ Stellar Estate Core (`stellar-estate-core`)

> **Programmable Real-Estate Financial Infrastructure — Financial Core, Distribution Agreements & Soroban Contracts**

[![Netlify Status](https://api.netlify.com/api/v1/badges/bc5fc4fd-0dfb-4954-8a2d-f4fabc7e3402/deploy-status)](https://stellar-estate-app.netlify.app)
**🌐 Live Frontend Deployment:** [https://stellar-estate-app.netlify.app](https://stellar-estate-app.netlify.app)

Part of the **Stellar Estate** architecture in organization [`Stellar-Estate`](https://github.com/Stellar-Estate).

```text
Stellar-Estate/
├── stellar-estate-frontend   (Web application, Waterfall builder, Multi-party approvals)
└── stellar-estate-core       (Backend API, Soroban contracts, database, reconciliation)
```

---

## 1. Product & Architecture Vision

Stellar Estate transforms real-estate cash flows into verifiable, programmable financial infrastructure on the Stellar network.

$$\text{Property} \longrightarrow \text{Revenue} \longrightarrow \text{Distribution Agreement} \longrightarrow [\text{Settlement}]$$

* **Level 1 established:** Property discovery, dedicated vaults, Testnet revenue ingestion, and independent Horizon verification.
* **Level 2 establishes:** Property Distribution Agreements, waterfall rules, multi-party stakeholder reviews and cryptographic approvals, locked agreement immutability, and deterministic settlement previews.

```text
                    STELLAR ESTATE
                          │
             ┌────────────┴────────────┐
             │                         │
        FRONTEND                  CORE REPOSITORY
             │                         │
             │                 ┌───────┴────────────────────────┐
             │                 │                                │
             │             BACKEND                           SOROBAN
             │                 │                                │
             │                 │                    ┌───────────┴───────────┐
             │                 │                    │                       │
             │                 │              Property Vault      Distribution Agreement
             │                 │                    │                       │
             │                 └────────────┬───────┴───────────────────────┘
             │                              │
             └──────────────────────────────┘
                          │
                     STELLAR TESTNET
```

---

## 2. Directory Structure

```text
stellar-estate-core/
├── backend/
│   ├── src/
│   │   ├── api/             # REST endpoints (Properties, Revenue, Agreements, Reconciliation)
│   │   ├── services/        # Stellar verifier, Agreement hashing & validation, Settlement preview
│   │   ├── workers/         # Background indexing & asynchronous reconciliation
│   │   ├── reconciliation/  # Cross-ledger financial auditing & discrepancy engine
│   │   └── database/        # In-memory & PostgreSQL data layer, schemas, seeds
│   ├── Dockerfile
│   └── package.json
├── contracts/
│   ├── property_vault/      # Soroban: property metadata, vault state, active agreement binding
│   ├── distribution_agreement/ # Soroban: authoritative agreement versions, stakeholder approvals, locked rules
│   ├── revenue/             # Soroban: revenue intake, receipt routing
│   └── shared/              # Shared types, error codes, safe integer math
├── migrations/              # PostgreSQL schema migrations (Level 1 + Level 2/3 tables)
├── docs/                    # Architecture specs, Level 2 agreement model, Level 3 handoff
├── .github/workflows/       # GitHub Actions CI for Backend (Vitest) & Contracts (Cargo)
└── docker-compose.yml       # Production-ready PostgreSQL & Backend composition
```

---

## 3. Important Financial Principle: Source of Truth

The backend is **not** the ultimate source of truth for locked financial rules:
* **Backend:** Manages off-chain orchestration, indexing, and validation.
* **Soroban Smart Contract:** Authoritative source for agreement hash, versioning, stakeholder approval authorization, and immutable locked state.

Once locked:
* Neither backend nor database can alter percentages or waterfall priorities.
* Any amendment requires a **new agreement version** (`v1 LOCKED` $\rightarrow$ `v2 CREATED` $\rightarrow$ `v2 APPROVALS` $\rightarrow$ `v2 LOCKED`).
* The contract strictly rejects post-lock modifications with `AgreementLocked (#13)`.

---

## 4. Integer Financial Arithmetic & Precision

Stellar Estate strictly eliminates floating-point arithmetic from financial rules:
* **Basis Points:** Allocations are specified in basis points, where $10,000 \text{ bps} = 100.00\%$.
* **Accounting Invariant:**
  $$\sum \text{Stakeholder Basis Points} \equiv 10,000 \text{ bps } (100.00\%)$$
* **Deterministic Rounding:** Remainder cents/stroops (dust) are deterministically assigned to the primary equity stakeholder, guaranteeing:
  $$\text{Gross Revenue} = \text{Waterfall Deductions} + \sum \text{Stakeholder Allocations}$$

---

## 5. Soroban Smart Contract Architecture

Written in Rust for the Soroban smart contract platform:

1. **`property_vault`**: Manages property financial vault, records verified revenue, and binds active distribution agreement.
2. **`distribution_agreement`**:
   * Registers agreement versions with deterministic 64-char SHA-256 canonical hash.
   * Tracks required stakeholder approvals (`.require_auth()`).
   * Validates exact agreement hash matching (`HashMismatch (#16)`).
   * Enforces all approvals collected before locking (`IncompleteApprovals (#14)`).
   * Permanently locks rule set into immutable on-chain state (`agr_lock` event).
3. **`revenue`**: Manages property payment routing and receipt logging.
4. **`shared`**: Defines `AgreementStatus`, `WaterfallRuleType`, and error codes.

---

## 6. API Reference Summary

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Health & uptime check |
| `GET` | `/api/properties` | List all properties with financial summaries |
| `GET` | `/api/properties/:id` | Detailed property profile, units & participations |
| `GET` | `/api/properties/:id/agreements` | List all distribution agreements and versions for a property |
| `GET` | `/api/agreements/:id` | Retrieve agreement by ID with all versions |
| `GET` | `/api/agreements/versions/:versionId` | Retrieve exact agreement version with rules & stakeholders |
| `POST` | `/api/agreements` | Create a new Distribution Agreement (Version 1) |
| `POST` | `/api/agreements/:id/versions` | Propose an amended agreement version (e.g. Version 2) |
| `POST` | `/api/agreements/versions/:versionId/approve` | Stakeholder approves exact canonical agreement hash |
| `POST` | `/api/agreements/versions/:versionId/lock` | Lock agreement once all required approvals are collected |
| `POST` | `/api/agreements/versions/:versionId/preview` | Deterministic integer-based waterfall settlement preview |
| `GET` | `/api/agreements/:id/compare?vA=1&vB=2` | Compare version terms and allocation diffs |
| `POST` | `/api/revenue/initiate` | Create deposit intent and fetch destination vault |
| `POST` | `/api/revenue/verify` | Independently verify Stellar Testnet tx and record revenue |
| `GET` | `/api/reconciliation/report` | Cross-audit blockchain transactions vs revenue records |

---

## 7. Local Development & Testing

```bash
cd backend
npm install
npm test           # Runs Vitest automated integration suite (12/12 passing)
npm run dev        # Starts server on http://localhost:4000
```

---

## 8. Legal & Technical Disclaimer

> **IMPORTANT DISCLAIMER:**
> This prototype is a demonstration of programmable real-estate financial infrastructure on the Stellar network. It does **not** constitute a transfer of legal title to physical property, an offer of securities, financial advice, or an investment solicitation. Legal title remains governed exclusively by jurisdiction-specific real-estate registries and applicable law.
