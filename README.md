# 🏛️ Stellar Estate Core (`stellar-estate-core`)

> **Programmable Real-Estate Financial Infrastructure — Financial Core & Settlement Engine**

Part of the **Stellar Estate** architecture in organization [`Stellar-Estate`](https://github.com/Stellar-Estate).

```text
Stellar-Estate/
├── stellar-estate-frontend   (Web application & user experience)
└── stellar-estate-core       (Backend API, Soroban contracts, database, reconciliation)
```

---

## 1. Product & Architecture Vision

Stellar Estate makes property revenue transparent, traceable, and ready for programmable settlement on Stellar.
Level 1 establishes the first two phases of the core thesis:

$$\text{Property} \longrightarrow \text{Revenue} \quad [\longrightarrow \text{Financial Rules} \longrightarrow \text{Settlement}]$$

### Architectural Principle
* **Frontend:** Presents and orchestrates the user and investor experience.
* **Backend:** Manages off-chain application state, indexing, accounting, independent verification, and reconciliation.
* **Soroban Contracts:** Enforce the financial rules that must be trusted on-chain.

```text
                    STELLAR ESTATE
                          │
             ┌────────────┴────────────┐
             │                         │
        FRONTEND                  CORE REPOSITORY
             │                         │
             │                 ┌───────┴────────┐
             │                 │                │
             │             BACKEND          SOROBAN
             │                 │                │
             │                 │          Property Vault
             │                 │                │
             │                 └───────┬────────┘
             │                         │
             └─────────────────────────┘
                          │
                     STELLAR TESTNET
```

---

## 2. Directory Structure

```text
stellar-estate-core/
├── backend/
│   ├── src/
│   │   ├── api/             # REST endpoints (Properties, Revenue, Blockchain, Reconciliation)
│   │   ├── services/        # Stellar verification engine, Revenue pipeline
│   │   ├── workers/         # Background indexing & asynchronous reconciliation
│   │   ├── indexer/         # Stellar Horizon Testnet transaction observer
│   │   ├── reconciliation/  # Cross-ledger financial auditing & discrepancy engine
│   │   └── database/        # In-memory & PostgreSQL data layer, schemas, seeds
│   ├── Dockerfile
│   └── package.json
├── contracts/
│   ├── property_vault/      # Soroban Contract: property metadata, vault state, event publishing
│   ├── revenue/             # Soroban Contract: revenue intake, receipt routing, caller authentication
│   └── shared/              # Shared types, error codes, safe integer math
├── migrations/              # PostgreSQL schema migrations (Level 1 + Future Level 2/3)
├── docs/                    # Architectural specs, future waterfall & settlement designs
├── .github/workflows/       # GitHub Actions CI for Backend (Vitest) & Contracts (Cargo)
└── docker-compose.yml       # Production-ready PostgreSQL & Backend composition
```

---

## 3. Independent Stellar Verification & Anti-Replay

The backend **never trusts client-side assertions** of payment. Every transaction must be verified on Stellar Testnet:

1. **Existence & Success:** Validates transaction on Stellar Horizon (`https://horizon-testnet.stellar.org`) and confirms `successful === true`.
2. **Payment Operation Matching:** Inspects internal transaction operations to confirm the destination is the specific property vault.
3. **Asset & Amount Verification:** Validates accepted asset (`XLM` or `USDC`) and verifies the settled amount.
4. **Replay & Idempotency Protection:** The database enforces unique constraints on `transaction_hash`. If a transaction hash has already been associated with a revenue record, subsequent attempts are rejected with `DUPLICATE_TRANSACTION`.

---

## 4. Soroban Smart Contract Foundation

Written in Rust for the Soroban smart contract platform:

* **Safe Integer Arithmetic:** Uses `i128` representations with `.checked_add()` to prevent overflow/underflow. **Zero floating-point arithmetic.**
* **Explicit Authorization:** Employs `.require_auth()` for all administrative and depositor state modifications.
* **Event Logging:** Emits structured events (`init_vlt`, `rev_rec`, `stat_chg`, `dep_rout`) for indexer consumption.
* **Level 2/3 Compatibility:** Prepared with clean contract hooks for distribution agreements without premature or simulated waterfalls.

---

## 5. Environment Configuration

Copy `.env.example` in `backend/`:

```env
PORT=4000
NODE_ENV=development
DATABASE_URL=postgres://stellar_user:stellar_password@localhost:5432/stellar_estate
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
```

---

## 6. Local Development & Testing

### Backend
```bash
cd backend
npm install
npm test           # Runs Vitest automated integration suite
npm run dev        # Starts server on http://localhost:4000
```

### Soroban Contracts
```bash
cargo test --workspace --verbose
```

### Docker
```bash
docker-compose up -d
```

---

## 7. API Reference Summary

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Health & uptime check |
| `GET` | `/api/properties` | List all properties with financial summaries |
| `GET` | `/api/properties/:id` | Detailed property profile, units & participations |
| `GET` | `/api/properties/:id/revenue` | Revenue history and confirmed statistics |
| `POST` | `/api/revenue/initiate` | Create deposit intent and fetch destination vault |
| `POST` | `/api/revenue/verify` | Independently verify Stellar Testnet tx and record revenue |
| `GET` | `/api/blockchain/network` | Stellar Testnet parameters and Horizon endpoint |
| `GET` | `/api/blockchain/tx/:hash` | Query transaction record and verification status |
| `GET` | `/api/reconciliation/report` | Cross-audit blockchain transactions vs revenue records |
| `POST` | `/api/reconciliation/run` | Execute on-demand financial reconciliation |
| `GET` | `/api/audit/events` | Immutably logged financial audit events |

---

## 8. Legal & Technical Disclaimer

> **IMPORTANT DISCLAIMER:**
> This prototype is a demonstration of programmable real-estate financial infrastructure on the Stellar network. It does **not** constitute a transfer of legal title to physical property, an offer of securities, financial advice, or an investment solicitation. Legal title remains governed exclusively by jurisdiction-specific real-estate registries and applicable law.
