# Stellar Estate — Hackathon Judges & Evaluators Guide

> **Project Name:** Stellar Estate  
> **Ecosystem:** Stellar Protocol 22 / Soroban Smart Contracts  
> **Category:** Real-World Assets (RWA) / Programmable Fintech Settlement  
> **Repository:** [Stellar-Estate/stellar-estate-core](https://github.com/Stellar-Estate/stellar-estate-core) & [Stellar-Estate/stellar-estate-frontend](https://github.com/Stellar-Estate/stellar-estate-frontend)  

---

## 1. Executive Summary & Why Stellar Estate Matters

Traditional commercial real estate syndication suffers from **opaque revenue collection**, **delayed manual quarterly distributions (30–90 days)**, and **error-prone spreadsheet reconciliation**.

**Stellar Estate** revolutionizes commercial property finance by delivering:
1. **Automated Micro-Settlements**: Rent paid in USDC flows into a Soroban Treasury Vault and is distributed according to deterministic waterfall rules within seconds.
2. **Cryptographic Agreement Consensus**: Multi-party distribution agreements are represented canonically as deterministic JSON, hashed with SHA-256, and signed by ED25519 stakeholders on-chain before becoming immutable.
3. **Provable Invariants**: Soroban smart contracts mathematically enforce that `Gross Settlement == OpEx + CapEx Reserve + Sum(Stakeholder Payouts)` with zero-dust rounding tolerance.
4. **Institutional Compliance**: Native support for Stellar Standards (SEP-0001, SEP-0007, SEP-0010) and exportable Financial Passports.

---

## 2. 2-Minute Rapid Evaluation Walkthrough

Follow these 5 streamlined steps to experience the complete platform flow:

### Step 1: Explore Tokenized Assets
- Navigate to the **Properties Directory**.
- Select **The Meridian Luxury Residences** ($2,500,000 valuation, 92% occupancy).
- Observe the **Soroban Treasury Vault Engine Card** displaying live on-chain balances, reserve buffers, and the accepted asset badge (`USDC`).

### Step 2: Inspect Multi-Sig Agreement Governance
- Click **Agreements** in the top navigation bar.
- Inspect **Agreement Version Lineage (v1 vs v2)**.
- Note the **Canonical SHA-256 Hash**:
  ```
  68caa9d397658fa2fa0baf530b50018204cfc0bde56435c494b37100217e1c35
  ```
- Review the **Stakeholder Consensus Quorum** card showing real-time ED25519 signature collection across Alice (45%), Bob (30%), and Charlie (25%).

### Step 3: Record Tenant Rent Inflow
- Return to **The Meridian** property page and click **Record Revenue**.
- Deposit `$10,000 USDC` representing monthly apartment leases.
- Notice the atomic ledger entry logged in the property's audit trail with a unique transaction nonce.

### Step 4: Preview & Execute Waterfall Settlement
- Open the **Settlements** module.
- Click **Run Settlement Execution**.
- The platform previews the deterministic tranche allocation:
  - **Tier 1 (Senior OpEx)**: $1,000 (10%)
  - **Tier 2 (CapEx Reserve)**: $1,000 (10%)
  - **Tier 3 (Net Distributable Equity)**: $8,000 (80%) split pro-rata to stakeholder addresses.
- Click **Confirm & Settle on Soroban**.
- The settlement executes with cryptographic receipt and zero-dust verification.

### Step 5: Verify on StellarExpert & Export Financial Passport
- Click **StellarExpert** to view the live contract execution on Stellar Testnet.
- Click **Financial Passport** to download the institutional audit package in PDF and JSON formats.

---

## 3. Stellar Ecosystem Architecture & Contracts

Stellar Estate is natively built for **Stellar Protocol 22** and the Soroban runtime:

| Smart Contract | Address / Identifier | Storage Model | Purpose |
| :--- | :--- | :--- | :--- |
| **Property Vault** | `CA3JRBKPQ7V5FZBXT3KUR6HQIZBPQGOWZ7J3WSOUM7LCMUHLJKBWMUAL` | Instance & Nonce Keys | Invariant revenue accounting & reserve retention |
| **Distribution Agreement** | `CB45MNM3LIRZJWQGNTHFSMWHCL4BGVSM2ZLZRPBDK742FGGGFK6QDJBB` | Persistent Multi-Sig | Canonical hash anchoring & version lifecycle |
| **Revenue Manager** | `CC4A6IZXQWBCVKWBHGY2VC26GTDOJP3E5ILDPZA2ZLRMYMABLO3TJMRD` | Deterministic Tracker | High-throughput batch ledger reconciliation |
| **Accepted Asset (USDC SAC)** | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` | Stellar Asset Contract | Fast, low-fee institutional payments |
| **Native Asset (XLM SAC)** | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` | Stellar Asset Contract | Protocol native operations and settlement |

### Stellar Standards (SEPs) Implemented:
- **SEP-0001 (`stellar.toml`)**: Standardized organization and token discoverability.
- **SEP-0007 (`web+stellar:pay`)**: URI scheme for QR-code mobile wallet settlements.
- **SEP-0010 (Web Auth)**: Cryptographic challenge/response authentication using ED25519 keys.

---

## 4. Test Credentials & Pre-Funded Testnet Accounts

For evaluators using Freighter Wallet or Albedo, the following testnet accounts are pre-configured:

| Role | Name | Public Key | Status |
| :--- | :--- | :--- | :--- |
| **Admin / Operator** | Meridian Operations (Alice) | `GDO45IXJTKZ337DL4IEPLZDOIGZDPA2RJ5EOTI4SHLI36V54NKW2BYVV` | Active / Funded |
| **Institutional Equity** | Apex Global Real Estate (Bob) | `GB6TTFIWACAGYBNLTZ7SD3KN4CPGA5FKELGFOTGWUXIIHIZOOGB6NDZU` | Verified Stakeholder |
| **Retail Participant** | Charlie | `GCTU5IKE7MAWNKETN62ZPDYQPPOFHVVJ3N4EH7X73NFURSVHENBVBTPU` | Verified Stakeholder |

*Tip:* You can also click **Instant Testnet Dev Account** inside the platform's Wallet Modal to test with zero setup required.

---

## 5. Automated Verification & Quality Assurance

Stellar Estate features an end-to-end automated test harness with **200 passing tests**:
- **Soroban Smart Contracts**: 26 Rust tests verifying invariants, panics, and state upgrades (`cargo test --offline`).
- **Financial Core Backend**: 86 Vitest integration tests covering Horizon polling, multi-sig consensus, and PostgreSQL persistence.
- **Frontend UI/UX**: 88 component tests covering all modals, charts, and responsive views.

To run the complete verification suite locally:
```bash
# In stellar-estate-core:
node scripts/run-all-checks.mjs
```
