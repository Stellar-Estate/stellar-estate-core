import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from './index.js';
import { db } from './database/db.js';
import { reconciliationService } from './reconciliation/reconciliationService.js';

describe('Stellar Estate Core Backend API Tests', () => {
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

    const firstProp = res.body.data[0];
    expect(firstProp).toHaveProperty('id');
    expect(firstProp).toHaveProperty('name');
    expect(firstProp).toHaveProperty('valuation');
    expect(firstProp).toHaveProperty('vault_stellar_address');
    expect(firstProp).toHaveProperty('financial_summary');
  });

  it('GET /api/properties/:id should return details, units, and participations', async () => {
    const res = await request(app).get('/api/properties/prop-meridian-abuja');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.property.name).toBe('The Meridian');
    expect(res.body.data.units.length).toBe(10);
    expect(res.body.data.participations.length).toBe(2);
    expect(res.body.data.financials.valuation).toBe(500000);
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
    expect(res.body.data.propertyName).toBe('The Meridian');
    expect(res.body.data.destinationVaultAddress).toBe('GAU6PZRLYQZCRG6E4V7P6E4J67U4F26C6DVEOD6DGEGZ6E6DDEE5ABCD');
    expect(res.body.data.suggestedAmount).toBe(8000.0);
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

  it('Reconciliation service should accurately audit revenue records', async () => {
    const report = await reconciliationService.runReconciliation();
    expect(report).toHaveProperty('id');
    expect(report).toHaveProperty('run_timestamp');
    expect(report.status).toBe('BALANCED');
    expect(report.discrepancies_found).toBe(0);
  });

  it('GET /api/blockchain/network should return Stellar Testnet parameters', async () => {
    const res = await request(app).get('/api/blockchain/network');
    expect(res.status).toBe(200);
    expect(res.body.data.network).toBe('TESTNET');
    expect(res.body.data.network_passphrase).toBe('Test SDF Network ; September 2015');
  });
});
