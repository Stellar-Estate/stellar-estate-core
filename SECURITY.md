# Security Policy — Stellar Estate Core

The Stellar Estate team takes the security of our programmable property financial platform, Soroban smart contracts, and backend settlement services seriously. We appreciate the responsible disclosure of any vulnerabilities found by security researchers and the open-source community.

---

## Supported Versions

Only the latest release and the current `main` branch receive security patches and updates.

| Component | Version / Branch | Supported |
| :--- | :--- | :--- |
| `stellar-estate-core` (Backend API) | `main` | :white_check_mark: |
| `contracts/property_vault` | `main` | :white_check_mark: |
| `contracts/distribution_agreement` | `main` | :white_check_mark: |
| Older tags / pre-releases | `< 1.0.0` | :x: |

---

## Reporting a Vulnerability

**Please do NOT report security vulnerabilities through public GitHub issues or public pull requests.**

If you believe you have discovered a vulnerability in `stellar-estate-core`, please report it privately:

1. **Email:** Send your report to **`security@stellar-estate.org`**.
2. **GitHub Security Advisory:** Alternatively, use GitHub's private vulnerability reporting feature on the repository:
   - Navigate to [Security Advisories](https://github.com/Stellar-Estate/stellar-estate-core/security/advisories)
   - Click **"Report a vulnerability"**

### What to Include in Your Report
To help us triage and resolve the issue quickly, please provide:
* **Description:** A detailed explanation of the vulnerability and its potential impact.
* **Component:** Specific smart contract (`property_vault`, `distribution_agreement`), backend service (`settlementPreviewService`, `reconciliationService`), or database migration.
* **Proof of Concept:** Step-by-step instructions, curl commands, or Rust test case to reproduce the issue.
* **Impact Assessment:** Whether this involves funds draining, unauthorized agreement locking, double-spending of revenue records, or denial of service.

---

## Response Timeline

We are committed to rapid response and coordinated disclosure:
* **Initial Acknowledgment:** Within **24 hours** of receiving your report.
* **Triage & Assessment:** Within **48 hours**, confirming validity and assigned severity (Critical, High, Medium, Low).
* **Fix & Mitigation:** A fix will be developed in a private branch, verified against test suites, and deployed within **7 business days** (or sooner for Critical issues).
* **Public Disclosure:** Coordinated disclosure will be published once mitigations are live.

---

## Security Architecture & Invariants

When evaluating the security posture of `stellar-estate-core`, maintainers uphold the following strict technical boundaries:

### 1. Smart Contract Invariants (Soroban)
* **Integer Arithmetic:** Floating-point operations are banned. All distributions and allocations use integer basis points ($10,000 \text{ bps} \equiv 100\%$) and base currency units (stroops/cents) with deterministic dust rounding to prevent precision exploits.
* **Double-Spending Prevention:** Each verified revenue event ID can only be consumed once (`AlreadySettled (#20)`). Duplicate settlement runs are rejected.
* **Agreement Immutability:** Once all stakeholders have cryptographically approved an agreement version and it is locked on-chain, post-lock modification attempts are rejected (`AgreementLocked (#13)`).
* **Canonical Hashing:** Agreement terms are canonically serialized (alphabetically sorted keys, integer normalization). Modifying any term alters the SHA-256 hash and invalidates prior approvals (`HashMismatch (#16)`).

### 2. Backend & API Hardening
* **Non-Custodial Design:** The backend never stores stakeholder or tenant private keys.
* **Independent Verification:** Horizon transactions are verified directly against Stellar Horizon consensus validators before any revenue record is recorded.
* **Continuous Reconciliation:** The reconciliation engine continuously cross-checks database state against ledger records, emitting immediate discrepancy alerts if balances diverge.
* **Input Sanitization:** All public keys must adhere to Ed25519 StrKey checksum validation before being accepted.

---

## Hall of Fame & Acknowledgments

We are happy to publicly acknowledge researchers who report valid vulnerabilities in our release notes and Security Advisories (unless you prefer to remain anonymous).
