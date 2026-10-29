import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from './index.js';
import { reconciliationService } from './reconciliation/reconciliationService.js';
import { agreementService } from './services/agreementService.js';
import { agreementHashingService, canonicalizeJson } from './services/agreementHashingService.js';
import { stellarUriService } from './services/stellarUriService.js';
import { logger, Logger } from './utils/logger.js';
import { lifecycleService } from './services/lifecycleService.js';
import { shouldBypassRateLimit } from './middleware/security.js';
import { sanitizeString, sanitizePayload } from './middleware/sanitizer.js';
import { db } from './database/db.js';
import { webhookService } from './services/webhookService.js';

describe('Stellar Estate Core Backend — Comprehensive Test Suite', () => {
  // ============================================================================
  // CORE PROPERTY & REVENUE TESTS
  // ============================================================================

  it('GET /api/health should return healthy status with memory and horizon info', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body).toHaveProperty('memory');
    expect(res.body.memory).toHaveProperty('heapUsedMb');
    expect(res.body.memory).toHaveProperty('heapUsagePercentage');
    expect(res.body).toHaveProperty('horizon');
    expect(res.body.horizon.status).toBe('CONNECTED');
    expect(res.body.horizon).toHaveProperty('trackedLedgerSequence');
    expect(res.body).toHaveProperty('process');
    expect(res.body.process).toHaveProperty('nodeVersion');
  });

  it('GET /api/docs/openapi.json should return OpenAPI 3.0 specification', async () => {
    const res = await request(app).get('/api/docs/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.0.3');
    expect(res.body.info.title).toContain('Stellar Estate');
    expect(res.body.paths).toHaveProperty('/api/health');
    expect(res.body.paths).toHaveProperty('/api/revenue/initiate');
  });

  it('GET /api/properties should return list of properties with financial summary', async () => {
    const res = await request(app).get('/api/properties');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).toHaveProperty('financial_summary');
    expect(res.body.data[0].financial_summary).toHaveProperty('has_locked_agreement');
  });

  it('POST /api/revenue/initiate should create a valid deposit intent', async () => {
    const res = await request(app)
      .post('/api/revenue/initiate')
      .send({
        propertyId: 'prop-meridian-abuja',
        source: 'RENTAL_REVENUE',
        amount: 8000.0,
        asset: 'XLM',
        depositorAddress: 'GBTY42VFL7XJ6Q7L35R62L4J7J5J67U4F26C6DVEOD6DGEGZ6E6DDEE5ABCD',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('intentId');
    expect(res.body.data).toHaveProperty('sep7Uri');
    expect(res.body.data.sep7Uri).toContain('web+stellar:pay');
    expect(res.body.data.sep7Uri).toContain('destination=');
  });

  it('POST /api/revenue/verify should reject invalid transaction hash lengths', async () => {
    const res = await request(app)
      .post('/api/revenue/verify')
      .send({
        propertyId: 'prop-meridian-abuja',
        transactionHash: 'short-invalid-hash',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/revenue/verify should handle idempotent replays for already recorded hashes', async () => {
    const existingHash = '6a3f81e8435d648083818e7e163b71f92e079010467b7e211516e877c44e8c1e';
    const res = await request(app)
      .post('/api/revenue/verify')
      .send({
        propertyId: 'prop-meridian-abuja',
        transactionHash: existingHash,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('idempotent');
    expect(res.body.data.verification.verified).toBe(true);
  });

  // ============================================================================
  // DISTRIBUTION AGREEMENT & WATERFALL TESTS
  // ============================================================================

  it('GET /api/properties/:id/agreements should return pre-seeded agreement with versions', async () => {
    const res = await request(app).get('/api/properties/prop-meridian-abuja/agreements');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);

    const agr = res.body.data[0];
    expect(agr.agreement_identifier).toBe('MERIDIAN-REV-001');
    expect(agr.versions.length).toBe(2);

    const v1 = agr.versions.find((v: any) => v.version_number === 1);
    expect(v1).toBeDefined();
    expect(v1.status).toBe('LOCKED');
    expect(v1.agreement_hash).toBeDefined();
    expect(v1.stakeholders.length).toBe(3);
  });

  it('POST /api/agreements should enforce that stakeholder basis points sum to 10,000 (100%)', async () => {
    // Attempt invalid sum (4000 + 3500 + 3000 = 10,500 bps)
    const invalidRes = await request(app)
      .post('/api/agreements')
      .send({
        propertyId: 'prop-meridian-abuja',
        agreementIdentifier: 'TEST-AGR-INVALID',
        revenueSource: 'Rental Revenue',
        acceptedAsset: 'USDC',
        effectiveDate: '2026-11-01',
        createdBy: 'GBTY42VFL7XJ6Q7L35R62L4J7J5J67U4F26C6DVEOD6DGEGZ6E6DDEE5ABCD',
        waterfallRules: [
          { priority: 1, rule_type: 'FIXED_AMOUNT', name: 'Operating Expenses', amount_or_bps: 1000 },
        ],
        stakeholders: [
          { wallet_address: 'G_ALICE', name: 'Alice', role: 'Owner', basis_points: 4000 },
          { wallet_address: 'G_BOB', name: 'Bob', role: 'Partner', basis_points: 3500 },
          { wallet_address: 'G_CHARLIE', name: 'Charlie', role: 'Investor', basis_points: 3000 }, // 105%
        ],
      });

    expect(invalidRes.status).toBe(422);
    expect(invalidRes.body.error).toContain('must sum to exactly 10,000 basis points');
  });

  it('POST /api/agreements should succeed when allocations sum to exactly 10,000 bps', async () => {
    const validRes = await request(app)
      .post('/api/agreements')
      .send({
        propertyId: 'prop-meridian-abuja',
        agreementIdentifier: 'TEST-AGR-VALID',
        revenueSource: 'Rental Revenue',
        acceptedAsset: 'USDC',
        effectiveDate: '2026-11-01',
        createdBy: 'GBTY42VFL7XJ6Q7L35R62L4J7J5J67U4F26C6DVEOD6DGEGZ6E6DDEE5ABCD',
        waterfallRules: [
          { priority: 1, rule_type: 'FIXED_AMOUNT', name: 'Operating Expenses', amount_or_bps: 1000 },
          { priority: 2, rule_type: 'PERCENTAGE_BASIS_POINTS', name: 'Management Fee', amount_or_bps: 500 },
        ],
        stakeholders: [
          { wallet_address: 'G_STK_A', name: 'Alice', role: 'Equity', basis_points: 5000 },
          { wallet_address: 'G_STK_B', name: 'Bob', role: 'Operator', basis_points: 5000 },
        ],
      });

    expect(validRes.status).toBe(200);
    expect(validRes.body.success).toBe(true);
    expect(validRes.body.data.version.status).toBe('PENDING_APPROVALS');
    expect(validRes.body.data.version.agreement_hash).toBeDefined();
    expect(validRes.body.data.version.agreement_hash.length).toBe(64);
  });

  it('POST /api/agreements/versions/:versionId/approve should reject mismatched agreement hash', async () => {
    // Try approving ver-meridian-001-v2 with false hash
    const res = await request(app)
      .post('/api/agreements/versions/ver-meridian-001-v2/approve')
      .send({
        stakeholderAddress: 'GCDZ42VFL7XJ6Q7L35R62L4J7J5J67U4F26C6DVEOD6DGEGZ6E6DDEE5WXYZ', // Bob
        agreementHash: '0000000000000000000000000000000000000000000000000000000000000000',
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toContain('Agreement hash mismatch');
  });

  it('POST /api/agreements/versions/:versionId/approve should accept valid hash and update approval status', async () => {
    // Fetch v2 to get exact hash
    const v2Res = await request(app).get('/api/agreements/versions/ver-meridian-001-v2');
    const exactHash = v2Res.body.data.agreement_hash;

    // Bob approves
    const bobRes = await request(app)
      .post('/api/agreements/versions/ver-meridian-001-v2/approve')
      .send({
        stakeholderAddress: 'GCDZ42VFL7XJ6Q7L35R62L4J7J5J67U4F26C6DVEOD6DGEGZ6E6DDEE5WXYZ',
        agreementHash: exactHash,
      });

    expect(bobRes.status).toBe(200);
    expect(bobRes.body.data.status).toBe('PARTIALLY_APPROVED');

    // Charlie approves
    const charlieRes = await request(app)
      .post('/api/agreements/versions/ver-meridian-001-v2/approve')
      .send({
        stakeholderAddress: 'GCVRQYZCRG6E4V7P6E4J67U4F26C6DVEOD6DGEGZ6E6DDEE5ABCDKLMN',
        agreementHash: exactHash,
      });

    expect(charlieRes.status).toBe(200);
    // Now all 3 have approved -> READY_TO_LOCK!
    expect(charlieRes.body.data.status).toBe('READY_TO_LOCK');
  });

  it('POST /api/agreements/versions/:versionId/lock should lock agreement and make it immutable', async () => {
    const lockRes = await request(app)
      .post('/api/agreements/versions/ver-meridian-001-v2/lock')
      .send({
        callerAddress: 'GBTY42VFL7XJ6Q7L35R62L4J7J5J67U4F26C6DVEOD6DGEGZ6E6DDEE5ABCD',
      });

    expect(lockRes.status).toBe(200);
    expect(lockRes.body.data.status).toBe('LOCKED');
    expect(lockRes.body.data.locked_at).toBeDefined();

    // Subsequent approval attempt on locked agreement must fail
    const postLockApprove = await request(app)
      .post('/api/agreements/versions/ver-meridian-001-v2/approve')
      .send({
        stakeholderAddress: 'GCDZ42VFL7XJ6Q7L35R62L4J7J5J67U4F26C6DVEOD6DGEGZ6E6DDEE5WXYZ',
        agreementHash: lockRes.body.data.agreement_hash,
      });

    expect(postLockApprove.status).toBe(422);
    expect(postLockApprove.body.error).toContain('already locked and immutable');
  });

  it('POST /api/agreements/versions/:versionId/preview should calculate deterministic integer-based settlement breakdown', async () => {
    const res = await request(app)
      .post('/api/agreements/versions/ver-meridian-001-v1/preview')
      .send({ sampleRevenue: 8000.0 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const preview = res.body.data;
    expect(preview.gross_revenue_input).toBe(8000.0);
    // In v1: Operating Expenses = 1000, Maintenance Reserve = 1000, Mgmt Fee (5%) = 400 => total deductions = 2400
    expect(preview.total_waterfall_deductions).toBe(2400.0);
    expect(preview.net_distributable_revenue).toBe(5600.0);
    expect(preview.accounting_balanced).toBe(true);

    // Stakeholder allocations of $5,600:
    // Alice 40% = 2,240
    // Bob 35% = 1,960
    // Charlie 25% = 1,400
    const aliceAlloc = preview.stakeholder_allocations.find((s: any) => s.name.includes('Alice'));
    const bobAlloc = preview.stakeholder_allocations.find((s: any) => s.name.includes('Bob'));
    const charlieAlloc = preview.stakeholder_allocations.find((s: any) => s.name.includes('Charlie'));

    expect(aliceAlloc.allocated_amount).toBe(2240.0);
    expect(bobAlloc.allocated_amount).toBe(1960.0);
    expect(charlieAlloc.allocated_amount).toBe(1400.0);

    // Invariant check
    const sumAlloc = aliceAlloc.allocated_amount + bobAlloc.allocated_amount + charlieAlloc.allocated_amount;
    expect(sumAlloc).toBe(5600.0);
    expect(sumAlloc + preview.total_waterfall_deductions).toBe(8000.0);
  });

  it('GET /api/agreements/:id/compare should return granular version diffs', async () => {
    const res = await request(app).get('/api/agreements/agr-meridian-001/compare?vA=1&vB=2');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('versionA');
    expect(res.body.data).toHaveProperty('versionB');
    expect(res.body.data.versionA.version_number).toBe(1);
    expect(res.body.data.versionB.version_number).toBe(2);
  });

  it('POST /api/agreements/:id/fork should duplicate locked version terms into an editable proposal', async () => {
    const res = await request(app)
      .post('/api/agreements/agr-meridian-001/fork')
      .send({
        proposerAddress: 'GBTY42VFL7XJ6Q7L35R62L4J7J5J67U4F26C6DVEOD6DGEGZ6E6DDEE5ABCD',
        sourceVersionNumber: 2,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('PENDING_APPROVALS');
    expect(res.body.data.version_number).toBeGreaterThan(2);
    expect(res.body.data.stakeholders.length).toBe(3);
    expect(res.body.data.stakeholders.every((s: any) => !s.has_approved)).toBe(true);
  });

  // ============================================================================
  // PROGRAMMABLE SETTLEMENT & RECONCILIATION TESTS
  // ============================================================================

  it('GET /api/properties/:id/revenue-pool should return accurate accounting state', async () => {
    const res = await request(app).get('/api/properties/prop-meridian-abuja/revenue-pool');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const pool = res.body.data;
    expect(pool.property_id).toBe('prop-meridian-abuja');
    expect(pool.total_confirmed_revenue).toBe(10000.0);
    expect(pool.available_for_settlement).toBe(10000.0);
    expect(pool.revenue_entries_count).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/settlements/preview should generate deterministic $10,000 waterfall matching agreement rules', async () => {
    const res = await request(app)
      .post('/api/settlements/preview')
      .send({
        propertyId: 'prop-meridian-abuja',
        revenueIds: ['rev-meridian-001'],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const preview = res.body.data;
    expect(preview.gross_revenue).toBe(10000.0);
    // Since v2 was locked in the preceding test, settlement dynamically resolves v2 rules:
    // OpEx = 1200, Reserve = 800, Fee (4%) = 400 => Distributable = 7600
    expect(preview.expenses).toBe(1200.0);
    expect(preview.reserve).toBe(800.0);
    expect(preview.fees).toBe(400.0);
    expect(preview.distributable_amount).toBe(7600.0);
    expect(preview.accounting_balanced).toBe(true);

    // In v2: Alice 45% (3,420), Bob 30% (2,280), Charlie 25% (1,900)
    const alice = preview.stakeholder_allocations.find((s: any) => s.name.includes('Alice'));
    const bob = preview.stakeholder_allocations.find((s: any) => s.name.includes('Bob'));
    const charlie = preview.stakeholder_allocations.find((s: any) => s.name.includes('Charlie'));

    expect(alice.allocated_amount).toBe(3420.0);
    expect(bob.allocated_amount).toBe(2280.0);
    expect(charlie.allocated_amount).toBe(1900.0);
    expect(alice.allocated_amount + bob.allocated_amount + charlie.allocated_amount).toBe(7600.0);
  });

  it('POST /api/settlements/execute should execute settlement, pay recipients, and reconcile', async () => {
    const res = await request(app)
      .post('/api/settlements/execute')
      .send({
        propertyId: 'prop-meridian-abuja',
        revenueIds: ['rev-meridian-001'],
        executorAddress: 'GBTY42VFL7XJ6Q7L35R62L4J7J5J67U4F26C6DVEOD6DGEGZ6E6DDEE5ABCD',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const settlement = res.body.data;
    expect(settlement.id).toContain('STL-MERIDIAN');
    expect(settlement.status).toBe('RECONCILED');
    expect(settlement.reconciliation_status).toBe('MATCHED');
    expect(settlement.payouts.length).toBe(3);
    expect(settlement.transaction_hashes.length).toBe(3);

    // Check pool after settlement: available should now be 0
    const poolRes = await request(app).get('/api/properties/prop-meridian-abuja/revenue-pool');
    expect(poolRes.body.data.available_for_settlement).toBe(0.0);
    expect(poolRes.body.data.total_settled_revenue).toBe(10000.0);
    expect(poolRes.body.data.total_reserves_held).toBe(800.0);
  });

  it('POST /api/settlements/execute should reject double-spending of already consumed revenue', async () => {
    const replayRes = await request(app)
      .post('/api/settlements/execute')
      .send({
        propertyId: 'prop-meridian-abuja',
        revenueIds: ['rev-meridian-001'], // already consumed in previous test!
        executorAddress: 'GBTY42VFL7XJ6Q7L35R62L4J7J5J67U4F26C6DVEOD6DGEGZ6E6DDEE5ABCD',
      });

    expect(replayRes.status).toBe(422);
    expect(replayRes.body.error).toContain('already been consumed');
  });

  it('GET /api/settlements/:id/trace should return complete "Where Did My Rent Go?" audit trail', async () => {
    const settlementsRes = await request(app).get('/api/properties/prop-meridian-abuja/settlements');
    expect(settlementsRes.status).toBe(200);
    expect(settlementsRes.body.data.length).toBeGreaterThan(0);

    const settlementId = settlementsRes.body.data[0].id;
    const traceRes = await request(app).get(`/api/settlements/${settlementId}/trace`);
    expect(traceRes.status).toBe(200);
    expect(traceRes.body.success).toBe(true);

    const trace = traceRes.body.data;
    expect(trace.settlement_id).toBe(settlementId);
    expect(trace.property.name).toBe('The Meridian');
    expect(trace.agreement.id).toBe('agr-meridian-001');
    expect(trace.agreement.version).toBe(2);
    expect(trace.waterfall_flow.gross_revenue).toBe(10000.0);
    expect(trace.recipient_allocations.length).toBe(3);
    expect(trace.recipient_allocations[0]).toHaveProperty('explorer_url');
  });

  it('GET /api/settlements/:id/export.csv should export CSV audit sheet', async () => {
    const settlementsRes = await request(app).get('/api/properties/prop-meridian-abuja/settlements');
    const settlementId = settlementsRes.body.data[0].id;

    const res = await request(app).get(`/api/settlements/${settlementId}/export.csv`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('Settlement ID');
    expect(res.text).toContain(settlementId);
    expect(res.text).toContain('Recipient Address');
  });

  it('GET /api/properties/:id/passport should return complete Property Financial Passport', async () => {
    const res = await request(app).get('/api/properties/prop-meridian-abuja/passport');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const passport = res.body.data;
    expect(passport.property_name).toBe('The Meridian');
    expect(passport.total_lifetime_revenue).toBe(10000.0);
    expect(passport.total_reserves).toBe(800.0);
    expect(passport.total_distributed).toBe(7600.0);
    expect(passport.reconciliation_status).toBe('CURRENT');
    expect(passport.recent_settlements.length).toBeGreaterThan(0);
  });

  it('GET /api/stakeholders/:address/earnings should return real settled amounts for Alice', async () => {
    const aliceAddress = 'GBTY42VFL7XJ6Q7L35R62L4J7J5J67U4F26C6DVEOD6DGEGZ6E6DDEE5ABCD';
    const res = await request(app).get(`/api/stakeholders/${aliceAddress}/earnings`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const earnings = res.body.data;
    expect(earnings.wallet_address).toBe(aliceAddress);
    expect(earnings.stakeholder_name).toContain('Alice');
    expect(earnings.total_settled).toBe(3420.0);
    expect(earnings.settlements.length).toBe(1);
  });

  it('POST /api/faucet should reject invalid Stellar public key', async () => {
    const res = await request(app)
      .post('/api/faucet')
      .send({ address: 'INVALID_NOT_ED25519' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('INVALID_STELLAR_ADDRESS');
  });

  it('GET /api/blockchain/fee-stats should return base fee stats', async () => {
    const res = await request(app).get('/api/blockchain/fee-stats');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('fee_charged');
  }, 15000);

  it('stellarUriService should generate and parse SEP-0007 pay and tx URIs', () => {
    const payUri = stellarUriService.generatePayUri({
      destination: 'GBTY42VFL7XJ6Q7L35R62L4J7J5J67U4F26C6DVEOD6DGEGZ6E6DDEE5ABCD',
      amount: 500,
      assetCode: 'USDC',
      assetIssuer: 'GBTY42VFL7XJ6Q7L35R62L4J7J5J67U4F26C6DVEOD6DGEGZ6E6DDEE5ABCD',
      memo: 'RENT-01',
      msg: 'Pay monthly rent',
    });

    expect(payUri).toContain('web+stellar:pay');
    expect(payUri).toContain('destination=GBTY42VFL');
    expect(payUri).toContain('asset_code=USDC');

    const parsedPay = stellarUriService.parseUri(payUri);
    expect(parsedPay.operation).toBe('pay');
    expect(parsedPay.params.amount).toBe('500.00');
    expect(parsedPay.params.memo).toBe('RENT-01');

    const txUri = stellarUriService.generateTxUri({
      xdr: 'AAAAAGX8...test',
      msg: 'Execute vault settlement',
    });
    expect(txUri).toContain('web+stellar:tx');
    const parsedTx = stellarUriService.parseUri(txUri);
    expect(parsedTx.operation).toBe('tx');
    expect(parsedTx.params.xdr).toBe('AAAAAGX8...test');
  });

  it('canonicalizeJson should adhere to RFC 8785 lexicographical key ordering', () => {
    const objA = { z: 100, a: 'test', m: { b: 2, a: 1 } };
    const objB = { a: 'test', m: { a: 1, b: 2 }, z: 100 };

    const canonA = canonicalizeJson(objA);
    const canonB = canonicalizeJson(objB);

    expect(canonA).toBe('{"a":"test","m":{"a":1,"b":2},"z":100}');
    expect(canonA).toBe(canonB);

    const hashA = agreementHashingService.computeAgreementHash(canonA);
    const hashB = agreementHashingService.computeAgreementHash(canonB);
    expect(hashA).toBe(hashB);
  });

  it('Logger utility should handle info, warn, debug, and error with correlation tracking', () => {
    const testLogger = new Logger('test-service', 'debug');
    expect(() => {
      testLogger.debug('Debug trace message', { correlationId: 'req-123' });
      testLogger.info('Informational audit log', { propertyId: 'prop-1' });
      testLogger.warn('High fee warning');
      testLogger.error('Horizon connection failed', new Error('Network timeout'), { code: 'HORIZON_ERR' });
    }).not.toThrow();
  });

  it('LifecycleService should register and execute cleanup handlers during shutdown', async () => {
    let cleanedUp = false;
    lifecycleService.registerCleanup('test-db', () => {
      cleanedUp = true;
    });

    await lifecycleService.executeShutdown('SIGTERM');
    expect(cleanedUp).toBe(true);
    lifecycleService.unregisterCleanup('test-db');
  });

  it('GET /api/blockchain/latest-ledger should return current tracked ledger state', async () => {
    const res = await request(app).get('/api/blockchain/latest-ledger');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('sequence');
    expect(res.body.data).toHaveProperty('syncedAt');
    expect(res.body.data).toHaveProperty('network');
  });

  it('GET /api/docs should serve Swagger UI HTML documentation page', async () => {
    const res = await request(app).get('/api/docs');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('swagger-ui');
    expect(res.text).toContain('Stellar Estate Core API');
  });

  it('GET /api/properties/:id/passport.json should export attachment with financial passport JSON', async () => {
    const res = await request(app).get('/api/properties/prop-meridian-abuja/passport.json');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('property_prop-meridian-abuja_financial_passport.json');
    expect(res.body.success).toBe(true);
    expect(res.body.data.property_name).toBe('The Meridian');
    expect(res.body).toHaveProperty('exportedAt');
  });

  it('POST /api/admin/backup should generate database snapshot with stats', async () => {
    const res = await request(app).post('/api/admin/backup');
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.snapshot).toHaveProperty('version', '1.0.0');
    expect(res.body.snapshot.stats.propertyCount).toBeGreaterThan(0);
    expect(res.body.snapshot.data.properties.length).toBeGreaterThan(0);
  });

  it('GET /api/blockchain/verify-key/:key should classify valid and invalid Stellar keys', async () => {
    const validKeyRes = await request(app).get('/api/blockchain/verify-key/GDQE5Q3OFUE2VKP4H2ORTBNSCAOEEVRPK2UB4C2SHRL3FF2L5GIRRCSM');
    expect(validKeyRes.status).toBe(200);
    expect(validKeyRes.body.success).toBe(true);
    expect(validKeyRes.body.data.type).toBe('ED25519_PUBLIC_KEY');
    expect(validKeyRes.body.data.isAccount).toBe(true);

    const invalidKeyRes = await request(app).get('/api/blockchain/verify-key/not-a-valid-stellar-key');
    expect(invalidKeyRes.status).toBe(200);
    expect(invalidKeyRes.body.success).toBe(false);
    expect(invalidKeyRes.body.data.type).toBe('UNKNOWN');
  });

  it('GET /api/agreements/:id/version/:ver/export.json should return agreement version export attachment', async () => {
    const res = await request(app).get('/api/agreements/prop-meridian-abuja/version/1/export.json');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('v1.json');
    expect(res.body.exportType).toBe('DistributionAgreementVersion');
    expect(res.body.version).toBe(1);
    expect(res.body.propertyId).toBe('prop-meridian-abuja');
  });

  it('GET /api/properties/:id/settlements should support structured pagination parameters', async () => {
    const res = await request(app).get('/api/properties/prop-meridian-abuja/settlements?page=1&limit=1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('pagination');
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(1);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /api/properties/:id/revenue should support structured pagination parameters', async () => {
    const res = await request(app).get('/api/properties/prop-meridian-abuja/revenue?page=1&limit=1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('pagination');
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(1);
    expect(res.body.data.records.length).toBeLessThanOrEqual(1);
  });

  it('GET /api/agreements/:id/diff should calculate stakeholder and hash deltas between versions', async () => {
    const res = await request(app).get('/api/agreements/prop-meridian-abuja/diff?versionA=1&versionB=2');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.hash_changed).toBe(true);
    expect(res.body.data.stakeholder_deltas.length).toBeGreaterThan(0);
    const aliceDelta = res.body.data.stakeholder_deltas.find((d: any) => d.name.includes('Alice'));
    expect(aliceDelta).toBeDefined();
  });

  it('GET /api/stakeholders/:address/export.csv should export stakeholder statement CSV attachment', async () => {
    const res = await request(app).get('/api/stakeholders/GBTY42VFL7XJ6Q7L35R62L4J7J5J67U4F26C6DVEOD6DGEGZ6E6DDEE5ABCD/export.csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.text).toContain('Stakeholder Financial Earnings Statement');
    expect(res.text).toContain('Alice');
  });

  it('GET /api/properties/:id/units should return unit inventory and occupancy statistics', async () => {
    const res = await request(app).get('/api/properties/prop-meridian-abuja/units');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.total_units).toBe(10);
    expect(res.body.data.occupied_units).toBe(9);
    expect(res.body.data.occupancy_rate).toBe(90);
    expect(res.body.data.units.length).toBe(10);
  });

  it('PATCH /api/properties/:id/units/:unitId should update occupancy status and recalculate property metrics', async () => {
    const res = await request(app)
      .patch('/api/properties/prop-meridian-abuja/units/unit-meridian-10')
      .send({ occupancy_status: 'OCCUPIED' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.unit.occupancy_status).toBe('OCCUPIED');
    expect(res.body.data.occupied_units).toBe(10);
    expect(res.body.data.property_occupancy_percentage).toBe(100);

    // Revert back to VACANT for test idempotency
    await request(app)
      .patch('/api/properties/prop-meridian-abuja/units/unit-meridian-10')
      .send({ occupancy_status: 'VACANT' });
  });

  it('GET /api/blockchain/contract-addresses should return canonical deployed vault and agreement references', async () => {
    const res = await request(app).get('/api/blockchain/contract-addresses');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.vault_contracts.length).toBeGreaterThan(0);
    expect(res.body.data.agreement_contracts.length).toBeGreaterThan(0);
    expect(res.body.data.standards).toHaveProperty('sep0001');
    expect(res.body.data.standards).toHaveProperty('sep0007');
  });

  it('shouldBypassRateLimit should allow internal service and health checks', () => {
    const healthReq = { path: '/api/health', headers: {} } as any;
    expect(shouldBypassRateLimit(healthReq)).toBe(true);

    const internalReq = { path: '/api/agreements', headers: { 'x-internal-service': 'stellar-estate-core' } } as any;
    expect(shouldBypassRateLimit(internalReq)).toBe(true);
  });

  it('GET /api/blockchain/fee-stats/history should return rolling fee stats observations', async () => {
    const res = await request(app).get('/api/blockchain/fee-stats/history?limit=10');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).toHaveProperty('last_ledger_base_fee');
    expect(res.body.data[0]).toHaveProperty('timestamp');
  });

  it('sanitizeString and sanitizePayload should neutralize XSS vectors while preserving legitimate data', () => {
    const dangerous = 'Hello <script>alert("hack")</script> World <iframe src="evil.com"></iframe>';
    const sanitized = sanitizeString(dangerous);
    expect(sanitized).toBe('Hello  World');
    expect(sanitized).not.toContain('<script>');
    expect(sanitized).not.toContain('evil.com');

    const obj = {
      title: 'Nice Property <script>evil()</script>',
      nested: {
        link: 'javascript:alert(1)',
        amount: 500,
      },
    };
    const sanitizedObj = sanitizePayload(obj);
    expect(sanitizedObj.title).toBe('Nice Property');
    expect(sanitizedObj.nested.link).toBe('alert(1)');
    expect(sanitizedObj.nested.amount).toBe(500);
  });

  it('POST /api/revenue/batch should atomically record multiple revenue deposits', async () => {
    const res = await request(app)
      .post('/api/revenue/batch')
      .send({
        property_id: 'prop-meridian-abuja',
        deposits: [
          { amount: 1500, source: 'Unit 1 Rent', description: 'October Rent' },
          { amount: 2000, source: 'Unit 2 Rent', description: 'October Rent' },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(2);
    expect(res.body.totalAmount).toBe(3500);
    expect(res.body.records.length).toBe(2);
  });

  it('POST /api/contracts/verify-upgrade should validate contract address and 32-byte hex hash', async () => {
    const validContract = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';
    const validHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

    const res = await request(app)
      .post('/api/contracts/verify-upgrade')
      .send({ contract_address: validContract, new_wasm_hash: validHash });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.wasm_bytes_length).toBe(32);
    expect(res.body.data.ready_for_proposal).toBe(true);

    const badHashRes = await request(app)
      .post('/api/contracts/verify-upgrade')
      .send({ contract_address: validContract, new_wasm_hash: 'not-hex' });
    expect(badHashRes.status).toBe(400);
    expect(badHashRes.body.code).toBe('INVALID_WASM_HASH');
  });

  it('db.runTransaction should commit successful operations and roll back failed operations', () => {
    const initialCount = db.revenueRecords.size;

    db.runTransaction(() => {
      db.revenueRecords.set('temp-rev-tx-1', {
        id: 'temp-rev-tx-1',
        property_id: 'prop-meridian-abuja',
        source: 'Tx Test',
        amount: 100,
        asset: 'USDC',
        transaction_hash: 'tx_1',
        depositor_address: 'G...',
        destination_address: 'G...',
        status: 'CONFIRMED',
        verified_at: new Date().toISOString(),
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    });
    expect(db.revenueRecords.size).toBe(initialCount + 1);

    expect(() => {
      db.runTransaction(() => {
        db.revenueRecords.set('temp-rev-tx-2', {
          id: 'temp-rev-tx-2',
          property_id: 'prop-meridian-abuja',
          source: 'Tx Test 2',
          amount: 200,
          asset: 'USDC',
          transaction_hash: 'tx_2',
          depositor_address: 'G...',
          destination_address: 'G...',
          status: 'CONFIRMED',
          verified_at: new Date().toISOString(),
          metadata: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        throw new Error('Simulated database write failure');
      });
    }).toThrow('Simulated database write failure');

    expect(db.revenueRecords.size).toBe(initialCount + 1);
    expect(db.revenueRecords.has('temp-rev-tx-2')).toBe(false);

    db.revenueRecords.delete('temp-rev-tx-1');
  });

  it('webhookService should register subscribers, sign payloads, and verify HMAC signatures', async () => {
    const sub = webhookService.subscribe('https://example.com/webhook', ['revenue.recorded']);
    expect(sub.id).toBeDefined();
    expect(sub.secret).toBeDefined();
    expect(sub.events).toContain('revenue.recorded');

    const payload = JSON.stringify({ event: 'revenue.recorded', amount: 5000 });
    const sig = webhookService.generateSignature(payload, sub.secret);
    expect(typeof sig).toBe('string');
    expect(sig.length).toBe(64);

    const isValid = webhookService.verifySignature(sig, sub.secret, payload);
    expect(isValid).toBe(true);

    const isInvalid = webhookService.verifySignature('bad_signature'.padEnd(64, '0'), sub.secret, payload);
    expect(isInvalid).toBe(false);

    const deliveredCount = await webhookService.dispatch('revenue.recorded', { amount: 5000 });
    expect(deliveredCount).toBeGreaterThan(0);
  });

  it('GET /api/webhooks and POST /api/webhooks/subscribe should register and list active webhooks', async () => {
    const postRes = await request(app)
      .post('/api/webhooks/subscribe')
      .send({
        url: 'https://myservice.io/hooks/stellar',
        events: ['settlement.executed'],
      });
    expect(postRes.status).toBe(201);
    expect(postRes.body.success).toBe(true);
    expect(postRes.body.subscription.url).toBe('https://myservice.io/hooks/stellar');

    const getRes = await request(app).get('/api/webhooks');
    expect(getRes.status).toBe(200);
    expect(getRes.body.success).toBe(true);
    expect(Array.isArray(getRes.body.data)).toBe(true);
    expect(getRes.body.data.some((s: any) => s.url === 'https://myservice.io/hooks/stellar')).toBe(true);
  });

  it('POST /api/blockchain/simulate-settlement should return waterfall disbursement preview without state mutation', async () => {
    const res = await request(app)
      .post('/api/blockchain/simulate-settlement')
      .send({
        property_id: 'prop-meridian-abuja',
        simulated_gross: 25000,
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.simulation.property_id).toBe('prop-meridian-abuja');
    expect(res.body.simulation.simulated_gross).toBe(25000);
    expect(res.body.simulation.distributable_amount).toBeGreaterThan(0);
    expect(res.body.simulation.stakeholder_allocations.length).toBeGreaterThan(0);
    expect(res.body.simulation.accounting_balanced).toBe(true);
  });

  it('POST /api/agreements/versions/:versionId/revoke should revoke unlocked proposal and reject locked ones', async () => {
    // 1. Attempting to revoke locked version v2 should fail
    const lockedRes = await request(app)
      .post('/api/agreements/versions/ver-meridian-001-v2/revoke')
      .send({ callerAddress: 'GBTY42VFL7XJ6Q7L35R62L4J7J5J67U4F26C6DVEOD6DGEGZ6E6DDEE5ABCD' });
    expect(lockedRes.status).toBe(422);
    expect(lockedRes.body.error).toContain('already locked');

    // 2. Create a proposal v3
    const createRes = await request(app)
      .post('/api/agreements/agr-meridian-001/versions')
      .send({
        proposerAddress: 'GBTY42VFL7XJ6Q7L35R62L4J7J5J67U4F26C6DVEOD6DGEGZ6E6DDEE5ABCD',
        effectiveDate: '2026-12-01',
        waterfallRules: [
          { priority: 1, rule_type: 'PERCENTAGE_BASIS_POINTS', name: 'Reserve', amount_or_bps: 1000, description: 'Safety Reserve' },
        ],
        stakeholders: [
          {
            wallet_address: 'GBTY42VFL7XJ6Q7L35R62L4J7J5J67U4F26C6DVEOD6DGEGZ6E6DDEE5ABCD',
            name: 'Alice',
            role: 'Majority Equity',
            basis_points: 10000,
          },
        ],
      });
    expect(createRes.status).toBe(200);
    const newVerId = createRes.body.data.id;

    // 3. Revoking the pending proposal v3 should succeed
    const pendingRes = await request(app)
      .post(`/api/agreements/versions/${newVerId}/revoke`)
      .send({
        callerAddress: 'GBTY42VFL7XJ6Q7L35R62L4J7J5J67U4F26C6DVEOD6DGEGZ6E6DDEE5ABCD',
        reason: 'Term renegotiation',
      });
    expect(pendingRes.status).toBe(200);
    expect(pendingRes.body.success).toBe(true);
    expect(pendingRes.body.data.status).toBe('REVOKED');
  });

  it('GET /api/agreements/:id/versions should return version lineage with approval metrics', async () => {
    const res = await request(app).get('/api/agreements/agr-meridian-001/versions');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data[0]).toHaveProperty('metrics');
    expect(res.body.data[0].metrics).toHaveProperty('total_stakeholders');
    expect(res.body.data[0].metrics).toHaveProperty('approved_stakeholders');
  });

  it('GET /api/properties/:id/reconciliation should return property-level accounting and checksum audit', async () => {
    const res = await request(app).get('/api/properties/prop-meridian-abuja/reconciliation');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.property_id).toBe('prop-meridian-abuja');
    expect(res.body.data.metrics.total_revenue_records).toBeGreaterThan(0);
    expect(res.body.data.audit.status).toBe('RECONCILED');
    expect(typeof res.body.data.audit.ledger_checksum).toBe('string');
    expect(res.body.data.audit.ledger_checksum.length).toBe(64);
  });

  it('GET /api/metrics should export Prometheus metrics format', async () => {
    const res = await request(app).get('/api/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('stellar_estate_properties_total');
    expect(res.text).toContain('stellar_estate_revenue_records_total');
    expect(res.text).toContain('stellar_estate_settlements_total');
    expect(res.text).toContain('stellar_estate_process_memory_heap_bytes');
  });

  it('GET /api/diagnostics should return comprehensive system and network health telemetry', async () => {
    const res = await request(app).get('/api/diagnostics');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('environment');
    expect(res.body).toHaveProperty('memory');
    expect(res.body).toHaveProperty('stellar');
    expect(res.body).toHaveProperty('database');
    expect(res.body.stellar.network).toBe('TESTNET');
    expect(res.body.database.properties).toBeGreaterThan(0);
  }, 10000);

  it('db.cachedQuery should cache query results and invalidate on mutating operations', () => {
    let callCount = 0;
    const fetcher = () => {
      callCount++;
      return { val: 'test-data', count: callCount };
    };

    // First call executes fetcher
    const res1 = db.cachedQuery('test:cache:1', 5000, fetcher);
    expect(res1.count).toBe(1);
    expect(callCount).toBe(1);

    // Second call within TTL returns cached result
    const res2 = db.cachedQuery('test:cache:1', 5000, fetcher);
    expect(res2.count).toBe(1);
    expect(callCount).toBe(1);

    // Invalidation clears cache
    db.invalidateCache('test:cache');
    const res3 = db.cachedQuery('test:cache:1', 5000, fetcher);
    expect(res3.count).toBe(2);
    expect(callCount).toBe(2);
  });

  it('GET /api/properties/:id/vault-telemetry should return on-chain contract state and financial telemetry', async () => {
    const res = await request(app).get('/api/properties/prop-meridian-abuja/vault-telemetry');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.telemetry.property_id).toBe('prop-meridian-abuja');
    expect(res.body.telemetry.contract_name).toBe('StellarEstatePropertyVault');
    expect(res.body.telemetry.accepted_asset.code).toBe('USDC');
    expect(res.body.telemetry.financials).toHaveProperty('unconsumed_pool');
    expect(res.body.telemetry.explorer_links.vault).toContain('stellar.expert');
  });

  it('GET /api/properties/:id/audit-trail should return property-level chronological audit records', async () => {
    const res = await request(app).get('/api/properties/prop-meridian-abuja/audit-trail');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.property_id).toBe('prop-meridian-abuja');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.total_events).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/blockchain/network-info should return Stellar Testnet parameters and assets', async () => {
    const res = await request(app).get('/api/blockchain/network-info');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.network.name).toBe('Stellar Testnet');
    expect(res.body.network.passphrase).toBe('Test SDF Network ; September 2015');
    expect(res.body.network.protocol_version).toBe(22);
    expect(res.body.network.accepted_assets.length).toBeGreaterThan(0);
  });

  it('GET /api/stakeholders/:address/portfolio should aggregate property equity holdings and lifetime payouts', async () => {
    const aliceAddress = 'GBTY42VFL7XJ6Q7L35R62L4J7J5J67U4F26C6DVEOD6DGEGZ6E6DDEE5ABCD';
    const res = await request(app).get(`/api/stakeholders/${aliceAddress}/portfolio`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.stakeholder_address).toBe(aliceAddress);
    expect(res.body.data.total_properties_invested).toBeGreaterThanOrEqual(1);
    expect(res.body.data.holdings.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.holdings[0]).toHaveProperty('equity_value_usdc');
    expect(res.body.data.holdings[0]).toHaveProperty('share_percentage');
  });

  it('POST /api/blockchain/simulate-tx should simulate Soroban footprint and fees without mutation', async () => {
    const res = await request(app)
      .post('/api/blockchain/simulate-tx')
      .send({
        contract_id: 'CAQCFV2AUUXA2RFYGI4HD4KSGYYEB5Q5OC54ZAWU4HBPWZ7AL64KLCPH',
        function_name: 'execute_settlement',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.simulation.status).toBe('SUCCESS');
    expect(res.body.simulation.resources.cpu_instructions).toBeGreaterThan(0);
    expect(res.body.simulation.resources.mem_bytes).toBeGreaterThan(0);
    expect(res.body.simulation.estimated_fee.total_fee_stroops).toBeGreaterThan(0);
  });

  it('GET /api/properties/:id/occupancy-history should return historical occupancy trends and unit status', async () => {
    const res = await request(app).get('/api/properties/prop-meridian-abuja/occupancy-history');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.property_id).toBe('prop-meridian-abuja');
    expect(Array.isArray(res.body.data.history)).toBe(true);
    expect(res.body.data.history.length).toBe(6);
    expect(Array.isArray(res.body.data.units)).toBe(true);
  });

  it('GET /api/admin/db-health should return collection counts and passed integrity verification', async () => {
    const res = await request(app).get('/api/admin/db-health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('UP');
    expect(res.body.integrity_check.status).toBe('PASSED');
    expect(res.body.collections.properties).toBeGreaterThan(0);
    expect(res.body.collections.revenue_records).toBeGreaterThan(0);
  });

  it('GET /api/live should return 200 OK for Kubernetes liveness probe', async () => {
    const res = await request(app).get('/api/live');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('UP');
    expect(res.body.probe).toBe('liveness');
    expect(res.body).toHaveProperty('uptime');
  });

  it('GET /api/ready should return 200 OK and check subsystem readiness', async () => {
    const res = await request(app).get('/api/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('READY');
    expect(res.body.probe).toBe('readiness');
    expect(res.body.checks.database).toBe('OK');
    expect(res.body.checks.properties_loaded).toBeGreaterThan(0);
  });

  it('POST /api/webhooks/test-dispatch should trigger simulated webhook dispatch with signed payload', async () => {
    const res = await request(app)
      .post('/api/webhooks/test-dispatch')
      .send({
        url: 'https://webhook.site/stellar-estate-test',
        event: 'settlement.executed',
        payload: { settlementId: 'stl-test-123', amount: 5000 },
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.delivery).toBeDefined();
    expect(res.body.delivery.url).toBe('https://webhook.site/stellar-estate-test');
    expect(res.body.delivery.event).toBe('settlement.executed');
    expect(res.body.delivery.signature).toBeDefined();
    expect(res.body.delivery.success).toBe(true);
  });

  it('DELETE /api/webhooks/:id should remove subscription and reject invalid id', async () => {
    // 1. Create a subscription to delete
    const subRes = await request(app)
      .post('/api/webhooks/subscribe')
      .send({
        url: 'https://test-delete.com/webhook',
        events: ['property.created'],
      });
    expect(subRes.status).toBe(201);
    const subId = subRes.body.subscription.id;

    // 2. Delete it
    const delRes = await request(app).delete(`/api/webhooks/${subId}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);
    expect(delRes.body.subscriptionId).toBe(subId);

    // 3. Attempting to delete again should return 404
    const notFoundRes = await request(app).delete(`/api/webhooks/${subId}`);
    expect(notFoundRes.status).toBe(404);
  });

  it('GET /api/contracts/versions should return semantic version tuples and capabilities for deployed contracts', async () => {
    const res = await request(app).get('/api/contracts/versions');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.property_vault.version).toBe('1.0.0');
    expect(res.body.data.property_vault.version_tuple).toEqual([1, 0, 0]);
    expect(res.body.data.distribution_agreement.version).toBe('1.0.0-stellar-estate');
    expect(res.body.data.distribution_agreement.version_tuple).toEqual([1, 0, 0]);
  });

  it('GET /api/settlements/:id/breakdown should return waterfall distribution ratios', async () => {
    const listRes = await request(app).get('/api/properties/prop-meridian-abuja/settlements');
    expect(listRes.status).toBe(200);
    const settlements = listRes.body.data || [];
    if (settlements.length > 0) {
      const stlId = settlements[0].settlement_id || settlements[0].id;
      const res = await request(app).get(`/api/settlements/${stlId}/breakdown`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.breakdown).toBeDefined();
      expect(res.body.data.ratios_bps).toBeDefined();
    }
  });
});

