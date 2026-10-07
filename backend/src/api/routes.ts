import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../database/db.js';
import { revenueService } from '../services/revenueService.js';
import { reconciliationService } from '../reconciliation/reconciliationService.js';
import { agreementService } from '../services/agreementService.js';
import { STELLAR_TESTNET_HORIZON, STELLAR_TESTNET_PASSPHRASE } from '../services/stellarVerificationService.js';

export const apiRouter = Router();

// ==============================================================================
// VALIDATION SCHEMAS
// ==============================================================================

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

const waterfallRuleSchema = z.object({
  priority: z.number().int().positive(),
  rule_type: z.enum(['FIXED_AMOUNT', 'PERCENTAGE_BASIS_POINTS', 'RESIDUAL_DISTRIBUTION']),
  name: z.string().min(1),
  amount_or_bps: z.number().nonnegative(),
  description: z.string().default(''),
});

const stakeholderSchema = z.object({
  wallet_address: z.string().min(1),
  name: z.string().min(1),
  role: z.string().default('Stakeholder'),
  basis_points: z.number().int().positive().max(10000),
});

const createAgreementSchema = z.object({
  propertyId: z.string().min(1),
  agreementIdentifier: z.string().min(1),
  revenueSource: z.string().default('Rental Revenue'),
  acceptedAsset: z.string().default('USDC'),
  effectiveDate: z.string().min(1),
  createdBy: z.string().min(1),
  waterfallRules: z.array(waterfallRuleSchema).min(1),
  stakeholders: z.array(stakeholderSchema).min(1),
});

const proposeVersionSchema = z.object({
  revenueSource: z.string().default('Rental Revenue'),
  acceptedAsset: z.string().default('USDC'),
  effectiveDate: z.string().min(1),
  proposerAddress: z.string().min(1),
  waterfallRules: z.array(waterfallRuleSchema).min(1),
  stakeholders: z.array(stakeholderSchema).min(1),
});

const approveVersionSchema = z.object({
  stakeholderAddress: z.string().min(1),
  agreementHash: z.string().length(64, 'Agreement hash must be 64 hex characters'),
  signatureOrProof: z.string().optional(),
});

const lockVersionSchema = z.object({
  callerAddress: z.string().min(1),
});

const previewSettlementSchema = z.object({
  sampleRevenue: z.number().positive(),
});

// ==============================================================================
// PROPERTY ENDPOINTS
// ==============================================================================

apiRouter.get('/properties', (req: Request, res: Response) => {
  const properties = db.getAllProperties();
  const enhanced = properties.map((prop) => {
    const revs = db.getRevenueByProperty(prop.id);
    const totalRev = revs.reduce((sum, r) => sum + r.amount, 0);
    const agreements = db.getAgreementsByProperty(prop.id);
    const activeAgreement = agreements.find((a) => a.status === 'LOCKED');

    return {
      ...prop,
      financial_summary: {
        total_revenue_recorded: totalRev,
        deposit_count: revs.length,
        monthly_run_rate: prop.unit_count * 800,
        has_locked_agreement: !!activeAgreement,
        active_agreement_version: activeAgreement ? activeAgreement.current_version : null,
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
  const agreements = db.getAgreementsByProperty(property.id);

  res.json({
    success: true,
    data: {
      property,
      units,
      participations,
      agreements,
      financials: {
        valuation: property.valuation,
        total_revenue_confirmed: totalRevenue,
        deposit_count: revenueHistory.length,
        occupancy_rate: property.occupancy_percentage,
        reserve_balance: totalRevenue * 0.15,
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
// LEVEL 2: DISTRIBUTION AGREEMENT ENDPOINTS
// ==============================================================================

apiRouter.get('/properties/:id/agreements', (req: Request, res: Response) => {
  const agreements = db.getAgreementsByProperty(req.params.id);
  res.json({ success: true, data: agreements });
});

apiRouter.get('/agreements/:id', (req: Request, res: Response) => {
  const agreement = db.getAgreementById(req.params.id);
  if (!agreement) {
    return res.status(404).json({ success: false, error: 'Agreement not found' });
  }
  res.json({ success: true, data: agreement });
});

apiRouter.get('/agreements/versions/:versionId', (req: Request, res: Response) => {
  const version = db.getAgreementVersionById(req.params.versionId);
  if (!version) {
    return res.status(404).json({ success: false, error: 'Agreement version not found' });
  }
  res.json({ success: true, data: version });
});

apiRouter.post('/agreements', (req: Request, res: Response) => {
  const parseResult = createAgreementSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ success: false, errors: parseResult.error.format() });
  }

  try {
    const result = agreementService.createAgreement(parseResult.data);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(422).json({ success: false, error: err.message });
  }
});

apiRouter.post('/agreements/:id/versions', (req: Request, res: Response) => {
  const parseResult = proposeVersionSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ success: false, errors: parseResult.error.format() });
  }

  try {
    const newVersion = agreementService.proposeNewVersion(req.params.id, parseResult.data);
    res.json({ success: true, data: newVersion });
  } catch (err: any) {
    res.status(422).json({ success: false, error: err.message });
  }
});

apiRouter.post('/agreements/versions/:versionId/approve', (req: Request, res: Response) => {
  const parseResult = approveVersionSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ success: false, errors: parseResult.error.format() });
  }

  try {
    const updatedVersion = agreementService.approveVersion(req.params.versionId, parseResult.data);
    res.json({
      success: true,
      message: 'Stakeholder approval successfully recorded for exact canonical agreement hash.',
      data: updatedVersion,
    });
  } catch (err: any) {
    res.status(422).json({ success: false, error: err.message });
  }
});

apiRouter.post('/agreements/versions/:versionId/lock', (req: Request, res: Response) => {
  const parseResult = lockVersionSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ success: false, errors: parseResult.error.format() });
  }

  try {
    const lockedVersion = agreementService.lockVersion(req.params.versionId, parseResult.data.callerAddress);
    res.json({
      success: true,
      message: 'Distribution agreement locked successfully. Financial rules are now immutable.',
      data: lockedVersion,
    });
  } catch (err: any) {
    res.status(422).json({ success: false, error: err.message });
  }
});

apiRouter.post('/agreements/versions/:versionId/preview', (req: Request, res: Response) => {
  const parseResult = previewSettlementSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ success: false, errors: parseResult.error.format() });
  }

  try {
    const preview = agreementService.previewSettlement(req.params.versionId, parseResult.data.sampleRevenue);
    res.json({ success: true, data: preview });
  } catch (err: any) {
    res.status(422).json({ success: false, error: err.message });
  }
});

apiRouter.get('/agreements/:id/compare', (req: Request, res: Response) => {
  const vA = parseInt(req.query.vA as string, 10);
  const vB = parseInt(req.query.vB as string, 10);

  if (isNaN(vA) || isNaN(vB)) {
    return res.status(400).json({ success: false, error: 'Query parameters vA and vB must be valid version numbers.' });
  }

  try {
    const diff = agreementService.compareVersions(req.params.id, vA, vB);
    res.json({ success: true, data: diff });
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
