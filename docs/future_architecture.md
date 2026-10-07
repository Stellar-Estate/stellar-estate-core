# Stellar Estate — Future Architecture: Levels 2 & 3

Level 1 deliberately implements the first two pillars:
```text
Property → Revenue
```

The data models and Soroban contract foundations in `stellar-estate-core` are engineered to natively support Level 2 and Level 3 without structural redesign.

---

## Level 2: Financial Rules & Distribution Agreements

### Conceptual Model
```text
Distribution Agreement
        ↓
Version & Multi-Sig Authorization
        ↓
Waterfall Rules & Seniority Tranches
        ↓
Stakeholder Allocations
```

### Planned Components
1. **Distribution Agreements**:
   - On-chain Soroban agreement contract linking property vault to approved disbursement policies.
   - Versioning system allowing lease or equity adjustments with cryptographic stakeholder signatures.
2. **Waterfall Execution Tiers**:
   - **Tier 1 (Capital Reserves & Maintenance)**: Retains percentage or flat reserve provision.
   - **Tier 2 (Senior Debt Service)**: Prioritized debt repayments.
   - **Tier 3 (Operating Partner Fee)**: Management and property operator fees.
   - **Tier 4 (Equity Distribution)**: Remaining net distributable cashflow prorated to equity holders.

---

## Level 3: Programmable Settlement Engine

### Conceptual Model
```text
Revenue Ingestion
       ↓
Waterfall Computation
       ↓
Batch Settlement Run
       ↓
Stellar Multi-Recipient Payout
```

### Planned Components
1. **Settlement Cycles**:
   - Periodic (e.g. monthly or quarterly) or real-time streaming settlement runs.
   - Snapshotting of verified revenue records.
2. **Multi-Party Stellar Settlement**:
   - Atomic multi-payment transactions or Soroban contract-orchestrated disbursements.
   - Cryptographic proof of receipt for every beneficiary wallet.
3. **Automated Continuous Reconciliation**:
   - Bi-directional verification of bank fiat off-ramps and Stellar ledger states.
