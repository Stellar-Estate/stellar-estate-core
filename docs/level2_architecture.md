# Stellar Estate — Distribution Agreements & Waterfall Rules Architecture

## Overview
Stellar Estate operates as a **programmable property-revenue agreement system**.

The central financial workflow is:
```text
PROPERTY → REVENUE → DEFINE WATERFALL → STAKEHOLDERS REVIEW → ALL REQUIRED PARTIES APPROVE → AGREEMENT LOCKS
```

---

## 1. Core Architectural Separation

The platform enforces clean boundaries between four distinct concepts:

| Concept | Role | Layer |
| :--- | :--- | :--- |
| **Property** | Physical asset and metadata representation | Off-chain database & On-chain Vault identity |
| **Revenue** | Verified income arriving into property vaults | On-chain Horizon & Independent verifier |
| **Distribution Agreement** | Immutable financial rule set governing revenue treatment | Soroban Contract + Canonical Hash |
| **Settlement** | Final movement of money to recipients | Automated multi-recipient execution engine |

---

## 2. Important Financial Principle: Source of Truth

The backend is **not** the ultimate source of truth for locked financial rules:
* **Backend:** Manages state orchestration, REST APIs, validation, canonical normalization, indexing, and reconciliation.
* **Soroban Smart Contract:** Authoritative source for agreement hash, versioning, stakeholder approval authorization, and immutable locked state.

Once an agreement is locked:
* Neither backend nor database can alter percentages or waterfall priorities.
* Any amendment requires a **new agreement version** (`v1 LOCKED` $\rightarrow$ `v2 CREATED` $\rightarrow$ `v2 APPROVALS` $\rightarrow$ `v2 LOCKED`).
* The contract strictly rejects post-lock modifications with `AgreementLocked (#13)`.

---

## 3. Integer Financial Arithmetic & Precision

Stellar Estate strictly eliminates floating-point arithmetic from financial rules:
* **Basis Points:** Allocations are specified in basis points, where $10,000 \text{ bps} = 100.00\%$.
  - Example: Management fee $5.00\% = 500 \text{ bps}$.
  - Majority equity $40.00\% = 4,000 \text{ bps}$.
* **Accounting Invariant:**
  $$\sum \text{Stakeholder Basis Points} \equiv 10,000 \text{ bps } (100.00\%)$$
* **Deterministic Rounding:** Remainder cents/stroops (dust) are deterministically assigned to the primary equity stakeholder, guaranteeing:
  $$\text{Gross Revenue} = \text{Waterfall Deductions} + \sum \text{Stakeholder Allocations}$$

---

## 4. Deterministic Canonical Hashing

Before approvals can occur, the agreement terms are serialized into a canonical representation with keys sorted alphabetically and integer numbers normalized:
```json
{
  "property_id": "prop-meridian-abuja",
  "agreement_identifier": "MERIDIAN-REV-001",
  "version_number": 1,
  "revenue_source": "Rental Revenue",
  "accepted_asset": "USDC",
  "effective_date": "2026-09-01",
  "waterfall_rules": [...],
  "stakeholders": [...]
}
```
A standard SHA-256 hash is computed. Stakeholders approve this **exact 64-character hex hash**. If a single term is altered, the hash changes and approval fails with `HashMismatch (#16)`.

---

## 5. Agreement Lifecycle State Machine

```text
DRAFT
  │
  ▼
PENDING_APPROVALS (All required stakeholders must review)
  │
  ▼
PARTIALLY_APPROVED (One or more approved, awaiting others)
  │
  ▼
READY_TO_LOCK (100% of required approvals collected)
  │
  ▼
🔒 LOCKED (Authoritative immutable rule set)
```

---

## 6. Settlement Execution Flow

The settlement engine consumes locked agreements deterministically without ambiguity:
```text
Property
   ↓
Eligible Revenue
   ↓
Active Locked Agreement Version
   ↓
Agreement Hash (Verified on Soroban)
   ↓
Waterfall Rules & Deductions
   ↓
Stakeholder Allocation Basis Points
   ↓
Settlement Execution
```
