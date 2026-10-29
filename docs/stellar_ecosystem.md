# Stellar Estate: Ecosystem & Architecture Guide

## 1. Executive Summary

**Stellar Estate** is an institutional-grade decentralized revenue custody, multi-party distribution agreement, and waterfall settlement platform engineered natively for the **Stellar Network** and **Soroban Smart Contracts**.

Stellar Estate bridges physical real estate property cash flows (residential rental yields, commercial leases, and hospitality booking inflows) with on-chain cryptographic settlement invariants, multi-signature stakeholder governance, and low-latency, deterministic payouts denominated in fiat-backed stablecoins such as USDC.

---

## 2. Stellar Standards & Protocol Integration

### 2.1 Stellar Ecosystem Proposals (SEPs)
Stellar Estate adheres directly to official Stellar standards:
* **SEP-0001 (`stellar.toml`)**: Standard discovery metadata file published to establish domain verification, property issuer keys, validator nodes, currency definitions (USDC/XLM), and smart contract addresses.
* **SEP-0007 (Stellar URI Scheme)**: Standardized deep linking protocol for wallet-delegated signatures (`web+stellar:tx?...`) enabling stakeholders to verify and sign distribution agreements and settlement operations directly in wallets like Freighter and Lobstr.
* **Protocol 22 & Soroban v22**: Native integration with Soroban state storage models (instance storage for configurations, persistent storage for ledger records and agreements), gas metering, and authorization frameworks (`caller.require_auth()`).

### 2.2 Network Infrastructure
* **Network Passphrase**: `Test SDF Network ; September 2015`
* **Horizon Testnet Gateway**: `https://horizon-testnet.stellar.org`
* **Soroban RPC Server**: `https://soroban-testnet.stellar.org`
* **Public Explorer**: `https://stellar.expert/explorer/testnet`
* **Friendbot Faucet**: `https://friendbot.stellar.org`

---

## 3. Smart Contract Architecture

The Stellar Estate Soroban smart contract suite consists of modular, hardened Rust contracts:

```
+-------------------------------------------------------------------------+
|                        Stellar Estate Architecture                      |
+-------------------------------------------------------------------------+
                                    |
            +-----------------------+-----------------------+
            |                                               |
            v                                               v
+-------------------------------+               +-------------------------------+
|     PropertyVaultContract     |               | DistributionAgreementContract |
+-------------------------------+               +-------------------------------+
| - Property metadata & units   |               | - Agreement versioning        |
| - Revenue custody & auditing  | <-----------> | - Multi-stakeholder voting    |
| - Deterministic waterfall     |               | - SHA-256 canonical hash      |
| - Operating reserves (BPS)    |               | - Consensus locking           |
| - Invariant verification      |               | - Revocation & fork lineage   |
+-------------------------------+               +-------------------------------+
            ^                                               ^
            |                                               |
            +-----------------------+-----------------------+
                                    |
                                    v
                    +-------------------------------+
                    |       RevenueManager          |
                    +-------------------------------+
                    | - Source nonces & timestamps  |
                    | - Double-spend protection     |
                    | - Batch deposit ingestion     |
                    +-------------------------------+
```

### 3.1 `PropertyVaultContract`
* **Revenue Recording**: Ingests and nonces rental revenues per property with caller authentication and double-spend prevention.
* **Deterministic Settlement**: Calculates expenses, reserve allocations, and stakeholder disbursements using exact integer arithmetic (basis points $1\text{ bps} = 0.01\%$) preventing fractional loss.
* **Accounting Invariants**: Enforces strict invariant verification:
  $$\text{Gross Revenue} = \text{Expenses} + \text{Reserve} + \text{Fees} + \text{Distributable Amount}$$
  $$\text{Distributable Amount} = \sum \text{Recipient Payouts}$$
* **Upgradeability**: Controlled by administrative authority through `upgrade_contract` using Soroban WASM hash updates.

### 3.2 `DistributionAgreementContract`
* **Agreement Proposals**: Creates timestamped versions with immutable waterfall rules and equity stakeholder basis point allocations totaling exactly $10,000\text{ BPS}$ ($100\%$).
* **Canonical Cryptographic Hashing**: Hashes all rules and stakeholder allocations into a reproducible SHA-256 fingerprint verified by all signers.
* **Stakeholder Voting & Locking**: Tracks individual cryptographic sign-offs; once $100\%$ consensus is reached, the version locks and becomes the binding source for vault disbursements.
* **Branching & Forking**: Supports proposal revocation and version forking (`/api/agreements/:id/fork`) with historical lineage tracking.

---

## 4. Off-Chain Core Services & Observability

Stellar Estate pairs on-chain smart contracts with high-throughput backend services:
* **Horizon Ingestion & Reconciliation**: Continuously polls and indexes testnet transactions, matching on-chain payments against off-chain property rent rolls.
* **Liveness & Readiness Probes**: Kubernetes-standard health check endpoints (`/api/live` and `/api/ready`) validating in-memory transactional cache and database connectivity.
* **Real-Time Webhook Engine**: Event notification dispatching system (`POST /api/webhooks/test-dispatch` and `DELETE /api/webhooks/:id`) with HMAC-SHA256 signature headers (`x-stellar-signature`) for downstream property management software.
* **Multi-Chain Asset Interoperability**: Configured for native XLM and Circle USDC on Stellar testnet.

---

## 5. Hackathon Judge Evaluation Guide

To evaluate Stellar Estate:
1. **Interactive UI Walkthrough**: Open the frontend web portal and review real-time property portfolios, occupancy gauges, and financial health scores.
2. **Demo Mode Scenario**: Use the `DemoModeBanner` or `ReconciliationAuditModal` to trigger automated scenario ingestion.
3. **Freighter Wallet Flow**: Connect Freighter to interact with proposal consensus and inspect Stellar Expert transaction hashes.
4. **Soroban Contract Verification**: Run the automated Rust test suites:
   ```bash
   cargo test --offline
   ```
5. **Full API Diagnostic Suite**: Run the comprehensive Node.js integration tests:
   ```bash
   npm test -- --run
   ```
