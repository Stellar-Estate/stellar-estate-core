import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../database/db.js';
import { revenueService } from '../services/revenueService.js';
import { reconciliationService } from '../reconciliation/reconciliationService.js';
import { STELLAR_TESTNET_HORIZON, STELLAR_TESTNET_PASSPHRASE } from '../services/stellarVerificationService.js';

export const apiRouter = Router();

// Validation Schemas
const initiateDepositSchema = z.object({
  propertyId: z.string().min(1),
  source: z.string().default('RENTAL_REVENUE'),
  amount: z.number().positive(),
  asset: z.string().default('XLM'),
  depositorAddress: z.string().optional(),
});

const verifyDepositSchema = z.object({
  propertyId: z.string().min(1),
  transactionHash: z.string().length(64, 'Stellar transaction hash must be 64 hex characters'),
  source: z.string().optional(),
  depositorAddress: z.string().optional(),
});

// ==============================================================================
// PROPERTY ENDPOINTS
// ==============================================================================

apiRouter.get('/properties', (req: Request, res: Response) => {
  const properties = db.getAllProperties();
  const enhanced = properties.map((prop) => {
    const revs = db.getRevenueByProperty(prop.id);
    const totalRev = revs.reduce((sum, r) => sum + r.amount, 0);
    return {
      ...prop,
      financial_summary: {
        total_revenue_recorded: totalRev,
        deposit_count: revs.length,
        monthly_run_rate: prop.unit_count * 800, // estimated base run rate
      },
    };
  });
  res.json({ success: true, data: enhanced });
});

apiRouter.get('/properties/:id', (req: Request, res: Response) => {
  const property = db.getPropertyById(req.params.id);
  if (!property) {
    return res.status(404).json({ success: false, error: 'Property not found' });
  }

  const units = db.getPropertyUnits(property.id);
  const participations = db.getPropertyParticipations(property.id);
  const revenueHistory = db.getRevenueByProperty(property.id);
  const totalRevenue = revenueHistory.reduce((sum, r) => sum + r.amount, 0);

  res.json({
    success: true,
    data: {
      property,
      units,
      participations,
      financials: {
        valuation: property.valuation,
        total_revenue_confirmed: totalRevenue,
        deposit_count: revenueHistory.length,
        occupancy_rate: property.occupancy_percentage,
        reserve_balance: totalRevenue * 0.15, // 15% reserve provision
        distributable_revenue_level1: totalRevenue * 0.85,
      },
    },
  });
});

apiRouter.get('/properties/:id/revenue', (req: Request, res: Response) => {
  try {
    const data = revenueService.getPropertyRevenueHistory(req.params.id);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(404).json({ success: false, error: err.message });
  }
});

// ==============================================================================
// REVENUE & DEPOSIT WORKFLOW
// ==============================================================================

apiRouter.post('/revenue/initiate', (req: Request, res: Response) => {
  const parseResult = initiateDepositSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ success: false, errors: parseResult.error.format() });
  }

  try {
    const intent = revenueService.createDepositIntent(parseResult.data);
    res.json({ success: true, data: intent });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.post('/revenue/verify', async (req: Request, res: Response) => {
  const parseResult = verifyDepositSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ success: false, errors: parseResult.error.format() });
  }

  try {
    const result = await revenueService.verifyAndRecordRevenue(parseResult.data);
    if (!result.success) {
      return res.status(422).json({
        success: false,
        error: result.message,
        verification: result.verification,
      });
    }

    res.json({
      success: true,
      message: result.message,
      data: {
        revenueRecord: result.revenueRecord,
        verification: result.verification,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==============================================================================
// BLOCKCHAIN & TESTNET ENDPOINTS
// ==============================================================================

apiRouter.get('/blockchain/network', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      network: 'TESTNET',
      horizon_url: STELLAR_TESTNET_HORIZON,
      network_passphrase: STELLAR_TESTNET_PASSPHRASE,
      explorer_base_url: 'https://stellar.expert/explorer/testnet',
      friendbot_url: 'https://friendbot.stellar.org',
    },
  });
});

apiRouter.get('/blockchain/tx/:hash', (req: Request, res: Response) => {
  const tx = db.getBlockchainTxByHash(req.params.hash);
  if (!tx) {
    return res.status(404).json({
      success: false,
      error: 'Transaction not found in verified core records',
      explorer_url: `https://stellar.expert/explorer/testnet/tx/${req.params.hash}`,
    });
  }
  res.json({ success: true, data: tx });
});

// ==============================================================================
// RECONCILIATION & AUDIT
// ==============================================================================

apiRouter.get('/reconciliation/report', async (req: Request, res: Response) => {
  let report = db.getLatestReconciliationReport();
  if (!report) {
    report = await reconciliationService.runReconciliation();
  }
  res.json({ success: true, data: report });
});

apiRouter.post('/reconciliation/run', async (req: Request, res: Response) => {
  const report = await reconciliationService.runReconciliation();
  res.json({ success: true, data: report });
});

apiRouter.get('/audit/events', (req: Request, res: Response) => {
  const events = db.getAuditEvents(50);
  res.json({ success: true, data: events });
});
