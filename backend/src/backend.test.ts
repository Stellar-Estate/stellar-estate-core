import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from './index.js';
import { reconciliationService } from './reconciliation/reconciliationService.js';
import { agreementService } from './services/agreementService.js';
import { agreementHashingService } from './services/agreementHashingService.js';

describe('Stellar Estate Core Backend — Level 1 & Level 2 Test Suite', () => {
  // ============================================================================
  // LEVEL 1 REGRESSION TESTS
  // ============================================================================

  it('GET /api/health should return healthy status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
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

  // ============================================================================
  // LEVEL 2 DISTRIBUTION AGREEMENT & WATERFALL TESTS
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
});
