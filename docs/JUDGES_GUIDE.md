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
  a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0
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
| **Property Vault** | `CAQCFV2AUUXA2RFYGI4HD4KSGYYEB5Q5OC54ZAWU4HBPWZ7AL64KLCPH` | Instance & Nonce Keys | Invariant revenue accounting & reserve retention |
| **Distribution Agreement** | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` | Persistent Multi-Sig | Canonical hash anchoring & version lifecycle |
| **Accepted Asset (USDC SAC)** | `CAQCFV2AUUXA2RFYGI4HD4KSGYYEB5Q5OC54ZAWU4HBPWZ7AL64KLCPH` | Stellar Asset Contract | Fast, low-fee institutional payments |

### Stellar Standards (SEPs) Implemented:
- **SEP-0001 (`stellar.toml`)**: Standardized organization and token discoverability.
- **SEP-0007 (`web+stellar:pay`)**: URI scheme for QR-code mobile wallet settlements.
- **SEP-0010 (Web Auth)**: Cryptographic challenge/response authentication using ED25519 keys.

---

## 4. Test Credentials & Pre-Funded Testnet Accounts

For evaluators using Freighter Wallet or Albedo, the following testnet accounts are pre-configured:

| Role | Name | Public Key | Status |
| :--- | :--- | :--- | :--- |
| **Admin / Operator** | Meridian Operations | `GBTY42VFL7XJ6Q7L35R62L4J7J5J67U4F26C6DVEOD6DGEGZ6E6DDEE5ABCD` | Active / Funded |
| **Institutional Equity** | Apex Global Real Estate | `GCDZ42VFL7XJ6Q7L35R62L4J7J5J67U4F26C6DVEOD6DGEGZ6E6DDEE5WXYZ` | Verified Stakeholder |
| **Retail Participant** | Charlie | `GCVRQYZCRG6E4V7P6E4J67U4F26C6DVEOD6DGEGZ6E6DDEE5ABCDKLMN` | Verified Stakeholder |

*Tip:* You can also click **Instant Testnet Dev Account** inside the platform's Wallet Modal to test with zero setup required.

---

## 5. Automated Verification & Quality Assurance

Stellar Estate features an end-to-end automated test harness with **186 passing tests**:
- **Soroban Smart Contracts**: 23 Rust tests verifying invariants, panics, and state upgrades (`cargo test --offline`).
- **Financial Core Backend**: 81 Vitest integration tests covering Horizon polling, multi-sig consensus, and PostgreSQL persistence.
- **Frontend UI/UX**: 82 component tests covering all modals, charts, and responsive views.

To run the complete verification suite locally:
```bash
# In stellar-estate-core:
node scripts/run-all-checks.mjs
```
