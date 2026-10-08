# Stellar Estate Core — System Architecture

## Overview
Stellar Estate is a programmable real-estate financial infrastructure platform built around property financial records and Stellar settlement infrastructure.

The core principle of the system is:
```text
Frontend presents and orchestrates the experience.
Backend manages off-chain application state, indexing, accounting, and reconciliation.
Soroban contracts enforce the financial rules that must be trusted.
```

---

## Architectural Diagram

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

## Financial Pipeline (Property → Revenue → Settlement)

1. **Property Discovery**: Properties have unique identifiers, physical characteristics, verified valuation, unit configurations, and a dedicated Stellar vault address.
2. **Revenue Intent**: A payer initiates a revenue deposit (e.g. rental income, commercial lease).
3. **Stellar Testnet Transaction**: Payer signs and submits a payment transaction on Stellar Testnet targeted at the property vault.
4. **Independent Backend Verification**:
   - Fetches transaction directly from Stellar Horizon (`https://horizon-testnet.stellar.org`).
   - Confirms `successful == true`.
   - Validates asset (`XLM` / `USDC`).
   - Validates destination matches expected property vault address.
   - Prevents transaction replay (ensures transaction hash has never been consumed).
5. **Ledger Recording & Financial Update**:
   - Saves `blockchain_transactions` record.
   - Creates immutable `revenue_records` entry.
   - Updates property financial state.
6. **Reconciliation Engine**: Audits recorded transactions vs on-chain status, ensuring zero discrepancy.
