import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../database/db.js';
import { revenueService } from '../services/revenueService.js';
import { reconciliationService } from '../reconciliation/reconciliationService.js';
import { agreementService } from '../services/agreementService.js';
import { settlementService } from '../services/settlementService.js';
import { STELLAR_TESTNET_HORIZON, STELLAR_TESTNET_PASSPHRASE } from '../services/stellarVerificationService.js';
import { isValidStellarAddress, isValidContractAddress, classifyStellarKey } from '../utils/stellarValidator.js';
import { ledgerTrackerService } from '../services/ledgerTrackerService.js';
import { dbBackupService } from '../services/dbBackupService.js';
import { webhookService } from '../services/webhookService.js';

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

const updateUnitSchema = z.object({
  occupancy_status: z.enum(['OCCUPIED', 'VACANT', 'MAINTENANCE']),
  monthly_rent: z.number().positive().optional(),
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

const settlementPreviewRequestSchema = z.object({
  propertyId: z.string().min(1),
  revenueIds: z.array(z.string().min(1)).min(1),
});

const executeSettlementRequestSchema = z.object({
  propertyId: z.string().min(1),
  revenueIds: z.array(z.string().min(1)).min(1),
  executorAddress: z.string().min(1),
  transactionHashes: z.array(z.string()).optional(),
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

apiRouter.get('/properties/:id/units', (req: Request, res: Response) => {
  const property = db.getPropertyById(req.params.id);
  if (!property) {
    return res.status(404).json({ success: false, error: 'Property not found' });
  }

  const units = db.getPropertyUnits(req.params.id);
  const occupiedCount = units.filter((u) => u.occupancy_status === 'OCCUPIED').length;
  const totalRent = units.reduce((sum, u) => sum + (u.occupancy_status === 'OCCUPIED' ? u.monthly_rent : 0), 0);

  res.json({
    success: true,
    data: {
      property_id: property.id,
      property_name: property.name,
      total_units: units.length,
      occupied_units: occupiedCount,
      occupancy_rate: units.length > 0 ? (occupiedCount / units.length) * 100 : 0,
      monthly_gross_potential_rent: units.reduce((sum, u) => sum + u.monthly_rent, 0),
      monthly_effective_rent: totalRent,
      units,
    },
  });
});

apiRouter.patch('/properties/:id/units/:unitId', (req: Request, res: Response) => {
  const property = db.getPropertyById(req.params.id);
  if (!property) {
    return res.status(404).json({ success: false, error: 'Property not found' });
  }

  const unit = db.units.get(req.params.unitId);
  if (!unit || unit.property_id !== property.id) {
    return res.status(404).json({ success: false, error: 'Unit not found for this property' });
  }

  const parseResult = updateUnitSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ success: false, errors: parseResult.error.format() });
  }

  unit.occupancy_status = parseResult.data.occupancy_status;
  if (parseResult.data.monthly_rent !== undefined) {
    unit.monthly_rent = parseResult.data.monthly_rent;
  }
  unit.updated_at = new Date().toISOString();

  // Recalculate property occupancy rate
  const allUnits = db.getPropertyUnits(property.id);
  const occupied = allUnits.filter((u) => u.occupancy_status === 'OCCUPIED').length;
  property.occupancy_percentage = Math.round((occupied / allUnits.length) * 1000) / 10;
  property.updated_at = new Date().toISOString();

  res.json({
    success: true,
    message: 'Unit occupancy status successfully updated and property metrics refreshed',
    data: {
      unit,
      property_occupancy_percentage: property.occupancy_percentage,
      occupied_units: occupied,
      total_units: allUnits.length,
    },
  });
});

apiRouter.get('/properties/:id/revenue', (req: Request, res: Response) => {
  try {
    const data = revenueService.getPropertyRevenueHistory(req.params.id);
    const page = parseInt(req.query.page as string, 10);
    const limit = parseInt(req.query.limit as string, 10);

    if (!isNaN(page) && !isNaN(limit) && page > 0 && limit > 0) {
      const total = data.records.length;
      const totalPages = Math.ceil(total / limit) || 1;
      const offset = (page - 1) * limit;
      const paginatedRecords = data.records.slice(offset, offset + limit);

      return res.json({
        success: true,
        data: {
          ...data,
          records: paginatedRecords,
        },
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      });
    }

    res.json({
      success: true,
      data,
      pagination: {
        page: 1,
        limit: data.records.length,
        total: data.records.length,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      },
    });
  } catch (err: any) {
    res.status(404).json({ success: false, error: err.message });
  }
});

// ==============================================================================
// DISTRIBUTION AGREEMENT ENDPOINTS
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

apiRouter.get('/agreements/:id/versions', (req: Request, res: Response) => {
  const agreement = db.getAgreementById(req.params.id);
  if (!agreement) {
    return res.status(404).json({ success: false, error: 'Agreement not found' });
  }

  const versionsWithMetrics = agreement.versions.map((v) => {
    const totalStakeholders = v.stakeholders.length;
    const approvedStakeholders = v.stakeholders.filter((s) => s.has_approved).length;
    return {
      ...v,
      metrics: {
        total_stakeholders: totalStakeholders,
        approved_stakeholders: approvedStakeholders,
        all_approved: totalStakeholders > 0 && approvedStakeholders === totalStakeholders,
        total_basis_points: v.stakeholders.reduce((sum, s) => sum + s.basis_points, 0),
      },
    };
  });

  res.json({
    success: true,
    data: versionsWithMetrics,
    total_versions: versionsWithMetrics.length,
    active_version: agreement.current_version,
  });
});

apiRouter.get('/agreements/versions/:versionId', (req: Request, res: Response) => {
  const version = db.getAgreementVersionById(req.params.versionId);
  if (!version) {
    return res.status(404).json({ success: false, error: 'Agreement version not found' });
  }
  res.json({ success: true, data: version });
});

apiRouter.get('/agreements/:id/version/:ver/export.json', (req: Request, res: Response) => {
  const { id, ver } = req.params;
  const versionNum = parseInt(ver, 10);
  if (isNaN(versionNum)) {
    return res.status(400).json({ success: false, error: 'Version must be a positive integer' });
  }

  const agreement = db.getAgreementById(id) || db.getAgreementsByProperty(id)[0];
  if (!agreement) {
    return res.status(404).json({ success: false, error: 'Agreement not found' });
  }

  const version = agreement.versions.find((v) => v.version_number === versionNum);
  if (!version) {
    return res.status(404).json({ success: false, error: `Version ${versionNum} not found for agreement` });
  }

  const exportPayload = {
    exportType: 'DistributionAgreementVersion',
    agreementId: agreement.id,
    propertyId: agreement.property_id,
    version: version.version_number,
    status: version.status,
    agreementHash: version.agreement_hash,
    rules: version.waterfall_rules,
    stakeholders: version.stakeholders,
    approvals: version.approvals,
    createdAt: version.created_at,
    exportedAt: new Date().toISOString(),
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="agreement-${agreement.id}-v${version.version_number}.json"`
  );
  res.json(exportPayload);
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

apiRouter.post('/agreements/versions/:versionId/revoke', (req: Request, res: Response) => {
  const { callerAddress, reason } = req.body;
  if (!callerAddress) {
    return res.status(400).json({ success: false, error: 'callerAddress is required' });
  }

  try {
    const revoked = agreementService.revokeProposal(req.params.versionId, callerAddress, reason);
    res.json({
      success: true,
      message: 'Agreement proposal revoked successfully.',
      data: revoked,
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

apiRouter.get('/agreements/:id/diff', (req: Request, res: Response) => {
  const versionA = parseInt((req.query.versionA || req.query.vA) as string, 10);
  const versionB = parseInt((req.query.versionB || req.query.vB) as string, 10);

  if (isNaN(versionA) || isNaN(versionB)) {
    return res.status(400).json({
      success: false,
      error: 'Query parameters versionA and versionB (or vA and vB) must be valid version numbers.',
    });
  }

  try {
    const diff = agreementService.computeVersionDiff(req.params.id, versionA, versionB);
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

apiRouter.post('/revenue/batch', (req: Request, res: Response) => {
  const { property_id, deposits } = req.body;
  if (!property_id || !Array.isArray(deposits) || deposits.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'property_id and a non-empty deposits array are required.',
    });
  }

  try {
    const result = revenueService.recordBatchRevenue(property_id, deposits);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
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

apiRouter.get('/blockchain/latest-ledger', async (req: Request, res: Response) => {
  const refresh = req.query.refresh === 'true';
  if (refresh) {
    await ledgerTrackerService.fetchLatestLedger();
  }
  const state = ledgerTrackerService.getState();
  res.json({
    success: true,
    data: state,
  });
});

apiRouter.get('/blockchain/contract-addresses', (req: Request, res: Response) => {
  const properties = db.getAllProperties();
  const vaultContracts = properties.map((p) => ({
    property_id: p.id,
    property_name: p.name,
    vault_address: p.vault_stellar_address,
    network: 'TESTNET',
  }));

  const agreementContracts = Array.from(db.agreements.values()).map((agr) => ({
    agreement_id: agr.id,
    property_id: agr.property_id,
    identifier: agr.agreement_identifier,
    versions: agr.versions.map((v) => ({
      version: v.version_number,
      status: v.status,
      hash: v.agreement_hash,
      contract_reference: v.contract_reference || 'CAUTO_DEPLOYED',
    })),
  }));

  res.json({
    success: true,
    network: 'Stellar Testnet',
    data: {
      vault_contracts: vaultContracts,
      agreement_contracts: agreementContracts,
      standards: {
        sep0001: '/.well-known/stellar.toml',
        sep0007: 'web+stellar:pay',
        rfc8785: 'Canonical JSON SHA-256 Hashes',
      },
    },
  });
});

apiRouter.post('/contracts/verify-upgrade', (req: Request, res: Response) => {
  const { contract_address, new_wasm_hash } = req.body;

  if (!contract_address || typeof contract_address !== 'string' || !isValidContractAddress(contract_address)) {
    return res.status(400).json({
      success: false,
      error: 'Valid Stellar contract identifier starting with C... is required.',
      code: 'INVALID_CONTRACT_ADDRESS',
    });
  }

  const hexRegex = /^[0-9a-fA-F]{64}$/;
  if (!new_wasm_hash || typeof new_wasm_hash !== 'string' || !hexRegex.test(new_wasm_hash.trim())) {
    return res.status(400).json({
      success: false,
      error: 'new_wasm_hash must be a 64-character hexadecimal SHA-256 hash (32 bytes).',
      code: 'INVALID_WASM_HASH',
    });
  }

  res.json({
    success: true,
    message: 'Contract upgrade parameter validation passed.',
    data: {
      contract_address,
      new_wasm_hash: new_wasm_hash.trim().toLowerCase(),
      wasm_bytes_length: 32,
      ready_for_proposal: true,
      requires_admin_authorization: true,
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

// ==============================================================================
// SETTLEMENT, PASSPORT & STAKEHOLDER EARNINGS ENDPOINTS
// ==============================================================================

apiRouter.get('/properties/:id/revenue-pool', (req: Request, res: Response) => {
  const prop = db.getPropertyById(req.params.id);
  if (!prop) {
    return res.status(404).json({ success: false, error: 'Property not found' });
  }
  const pool = db.getRevenuePool(req.params.id);
  res.json({ success: true, data: pool });
});

apiRouter.get('/properties/:id/passport', (req: Request, res: Response) => {
  const prop = db.getPropertyById(req.params.id);
  if (!prop) {
    return res.status(404).json({ success: false, error: 'Property not found' });
  }
  const passport = db.getPropertyFinancialPassport(req.params.id);
  res.json({ success: true, data: passport });
});

apiRouter.get('/properties/:id/passport.json', (req: Request, res: Response) => {
  const prop = db.getPropertyById(req.params.id);
  if (!prop) {
    return res.status(404).json({ success: false, error: 'Property not found' });
  }
  const passport = db.getPropertyFinancialPassport(req.params.id);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="property_${req.params.id}_financial_passport.json"`);
  res.send(JSON.stringify({ success: true, data: passport, exportedAt: new Date().toISOString() }, null, 2));
});

apiRouter.get('/properties/:id/settlements', (req: Request, res: Response) => {
  const allSettlements = db.getSettlementsByProperty(req.params.id);
  const page = parseInt(req.query.page as string, 10);
  const limit = parseInt(req.query.limit as string, 10);

  if (!isNaN(page) && !isNaN(limit) && page > 0 && limit > 0) {
    const total = allSettlements.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const offset = (page - 1) * limit;
    const paginated = allSettlements.slice(offset, offset + limit);

    return res.json({
      success: true,
      data: paginated,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  }

  res.json({
    success: true,
    data: allSettlements,
    pagination: {
      page: 1,
      limit: allSettlements.length,
      total: allSettlements.length,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    },
  });
});

apiRouter.post('/settlements/preview', (req: Request, res: Response) => {
  const parseResult = settlementPreviewRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ success: false, errors: parseResult.error.format() });
  }

  try {
    const preview = settlementService.previewSettlement(
      parseResult.data.propertyId,
      parseResult.data.revenueIds
    );
    res.json({ success: true, data: preview });
  } catch (err: any) {
    res.status(422).json({ success: false, error: err.message });
  }
});

apiRouter.post('/blockchain/simulate-settlement', (req: Request, res: Response) => {
  const { property_id, revenue_ids, simulated_gross } = req.body;
  if (!property_id) {
    return res.status(400).json({ success: false, error: 'property_id is required' });
  }

  try {
    const lockedVersion = settlementService.resolveActiveLockedAgreement(property_id);
    let gross = simulated_gross;
    let revIds: string[] = [];

    if (!gross && Array.isArray(revenue_ids) && revenue_ids.length > 0) {
      const eligibility = settlementService.validateRevenueEligibility(property_id, revenue_ids);
      gross = eligibility.totalGross;
      revIds = revenue_ids;
    } else if (!gross) {
      gross = 10000;
    }

    const calc = settlementService.calculateWaterfall(
      lockedVersion,
      Math.round(gross * 100),
      revIds,
      [gross]
    );

    res.json({
      success: true,
      simulation: {
        property_id,
        agreement_id: lockedVersion.agreement_id,
        agreement_version: lockedVersion.version_number,
        agreement_hash: lockedVersion.agreement_hash,
        simulated_gross: gross,
        expenses: calc.expenses,
        reserve: calc.reserve,
        fees: calc.fees,
        distributable_amount: calc.distributableAmount,
        breakdown: calc.breakdown,
        stakeholder_allocations: calc.allocations,
        accounting_balanced: true,
      },
    });
  } catch (err: any) {
    res.status(422).json({ success: false, error: err.message });
  }
});

apiRouter.post('/settlements/execute', async (req: Request, res: Response) => {
  const parseResult = executeSettlementRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ success: false, errors: parseResult.error.format() });
  }

  try {
    const settlement = await settlementService.executeSettlement({
      propertyId: parseResult.data.propertyId,
      revenueIds: parseResult.data.revenueIds,
      executorAddress: parseResult.data.executorAddress,
      transactionHashes: parseResult.data.transactionHashes,
    });
    res.json({ success: true, data: settlement });
  } catch (err: any) {
    res.status(422).json({ success: false, error: err.message });
  }
});

apiRouter.get('/settlements/:id', (req: Request, res: Response) => {
  const settlement = db.getSettlementById(req.params.id);
  if (!settlement) {
    return res.status(404).json({ success: false, error: 'Settlement not found' });
  }
  res.json({ success: true, data: settlement });
});

apiRouter.get('/settlements/:id/trace', (req: Request, res: Response) => {
  try {
    const trace = settlementService.getSettlementTrace(req.params.id);
    res.json({ success: true, data: trace });
  } catch (err: any) {
    res.status(404).json({ success: false, error: err.message });
  }
});

apiRouter.get('/settlements/:id/export.csv', (req: Request, res: Response) => {
  const settlement = db.getSettlementById(req.params.id);
  if (!settlement) {
    return res.status(404).json({ success: false, error: 'Settlement not found' });
  }

  const rows = [
    ['Settlement ID', 'Property ID', 'Gross Revenue', 'Distributable Amount', 'Status', 'Reconciliation', 'Executed At'],
    [
      settlement.id,
      settlement.property_id,
      settlement.gross_revenue,
      settlement.distributable_amount,
      settlement.status,
      settlement.reconciliation_status,
      settlement.executed_at,
    ],
    [],
    ['Recipient Address', 'Basis Points', 'Allocated Amount', 'Transaction Hash'],
    ...settlement.payouts.map((p) => [
      p.recipient_address,
      p.basis_points,
      p.allocated_amount,
      p.transaction_hash || '',
    ]),
  ];

  const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="settlement-${settlement.id}.csv"`);
  res.send(csv);
});

apiRouter.get('/stakeholders/:address/earnings', (req: Request, res: Response) => {
  const earnings = db.getStakeholderEarnings(req.params.address);
  res.json({ success: true, data: earnings });
});

apiRouter.get('/stakeholders/:address/export.csv', (req: Request, res: Response) => {
  const earnings = db.getStakeholderEarnings(req.params.address);
  const rows = [
    ['Stellar Estate - Stakeholder Financial Earnings Statement'],
    ['Generated At', new Date().toISOString()],
    ['Stakeholder Name', earnings.stakeholder_name],
    ['Wallet Address', earnings.wallet_address],
    ['Role', earnings.role],
    ['Current Allocation Basis Points', String(earnings.current_allocation_bps)],
    ['Total Allocated (USDC)', String(earnings.total_allocated)],
    ['Total Settled (USDC)', String(earnings.total_settled)],
    ['Pending Settlement (USDC)', String(earnings.pending_amount)],
    [],
    ['Settlement ID', 'Property ID', 'Date', 'Amount', 'Status', 'Transaction Hash'],
    ...earnings.settlements.map((s) => [
      s.settlement_id,
      s.property_id,
      s.date,
      String(s.amount),
      s.status,
      s.tx_hash || '',
    ]),
  ];

  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="stakeholder_${earnings.wallet_address.substring(0, 8)}_earnings.csv"`
  );
  res.send(csv);
});

// ==============================================================================
// TESTNET FAUCET & NETWORK METRICS
// ==============================================================================

apiRouter.post('/faucet', async (req: Request, res: Response) => {
  const { address } = req.body;
  if (!address || typeof address !== 'string' || !isValidStellarAddress(address)) {
    return res.status(400).json({
      success: false,
      error: 'Valid Stellar Ed25519 public key (G...) is required.',
      code: 'INVALID_STELLAR_ADDRESS',
    });
  }

  try {
    const friendbotRes = await fetch(
      `https://friendbot.stellar.org?addr=${encodeURIComponent(address.trim())}`
    );
    if (!friendbotRes.ok) {
      const errText = await friendbotRes.text();
      return res.status(502).json({
        success: false,
        error: `Friendbot request failed: ${errText}`,
        code: 'FRIENDBOT_ERROR',
      });
    }

    res.json({
      success: true,
      message: 'Successfully funded account with 10,000 Testnet XLM.',
      address,
      faucet: 'Stellar Foundation Friendbot',
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to contact Stellar Friendbot.',
      code: 'FAUCET_DISPATCH_FAILED',
    });
  }
});

interface CachedFeeStats {
  data: any;
  cachedAt: number;
}
let cachedFeeStats: CachedFeeStats | null = null;
const FEE_STATS_CACHE_TTL_MS = 10000;

export interface FeeObservation {
  timestamp: string;
  last_ledger_base_fee: number;
  min: number;
  mode: number;
  p90: number;
  max: number;
}

const feeStatsHistory: FeeObservation[] = [
  {
    timestamp: new Date(Date.now() - 60000).toISOString(),
    last_ledger_base_fee: 100,
    min: 100,
    mode: 100,
    p90: 100,
    max: 1000,
  },
];

function recordFeeObservation(feeData: any) {
  const charged = feeData.fee_charged || {};
  feeStatsHistory.push({
    timestamp: new Date().toISOString(),
    last_ledger_base_fee: feeData.last_ledger_base_fee || 100,
    min: charged.min ?? 100,
    mode: charged.mode ?? 100,
    p90: charged.p90 ?? 100,
    max: charged.max ?? 1000,
  });
  if (feeStatsHistory.length > 50) {
    feeStatsHistory.shift();
  }
}

apiRouter.get('/blockchain/fee-stats/history', (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 50);
  const sliced = feeStatsHistory.slice(-limit);
  res.json({
    success: true,
    total: feeStatsHistory.length,
    limit,
    data: sliced,
    network: 'Stellar Testnet',
  });
});

apiRouter.get('/blockchain/fee-stats', async (req: Request, res: Response) => {
  const now = Date.now();
  if (cachedFeeStats && now - cachedFeeStats.cachedAt < FEE_STATS_CACHE_TTL_MS) {
    return res.json({
      success: true,
      data: cachedFeeStats.data,
      network: 'Stellar Testnet',
      cached: true,
      cachedAt: new Date(cachedFeeStats.cachedAt).toISOString(),
    });
  }

  try {
    const horizonRes = await fetch(`${STELLAR_TESTNET_HORIZON}/fee_stats`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!horizonRes.ok) {
      throw new Error(`Horizon returned ${horizonRes.status}`);
    }
    const feeStats = await horizonRes.json();
    cachedFeeStats = { data: feeStats, cachedAt: now };
    recordFeeObservation(feeStats);
    res.json({
      success: true,
      data: feeStats,
      network: 'Stellar Testnet',
      cached: false,
    });
  } catch (err: any) {
    if (cachedFeeStats) {
      return res.json({
        success: true,
        data: cachedFeeStats.data,
        network: 'Stellar Testnet',
        cached: true,
        stale: true,
      });
    }
    // Fallback standard fee stats if Horizon is slow
    const fallbackStats = {
      last_ledger_base_fee: 100,
      fee_charged: { min: 100, mode: 100, p90: 100, max: 1000 },
      recommended_base_fee: 100,
    };
    recordFeeObservation(fallbackStats);
    res.json({
      success: true,
      data: fallbackStats,
      fallback: true,
    });
  }
});

// ==============================================================================
// DATABASE BACKUP & RESTORATION
// ==============================================================================

apiRouter.post('/admin/backup', (req: Request, res: Response) => {
  const snapshot = dbBackupService.createBackup();
  res.status(201).json({
    success: true,
    message: 'Database backup snapshot successfully generated',
    snapshot,
  });
});

apiRouter.get('/admin/backup/latest', (req: Request, res: Response) => {
  const snapshot = dbBackupService.createBackup();
  res.json({
    success: true,
    data: snapshot,
  });
});

// ==============================================================================
// STELLAR KEY CLASSIFICATION & VERIFICATION
// ==============================================================================

apiRouter.get('/blockchain/verify-key/:key', (req: Request, res: Response) => {
  const { key } = req.params;
  const classification = classifyStellarKey(key);
  res.json({
    success: classification.valid,
    data: classification,
  });
});

// ==============================================================================
// REAL-TIME EVENT WEBHOOKS
// ==============================================================================

apiRouter.get('/webhooks', (req: Request, res: Response) => {
  const subs = webhookService.getSubscriptions().map((s) => ({
    ...s,
    secret: s.secret.substring(0, 8) + '...' + s.secret.slice(-4),
  }));
  res.json({
    success: true,
    total: subs.length,
    data: subs,
  });
});

apiRouter.post('/webhooks/subscribe', (req: Request, res: Response) => {
  const { url, events, secret } = req.body;
  try {
    const sub = webhookService.subscribe(url, events, secret);
    res.status(201).json({
      success: true,
      message: 'Webhook subscription created successfully.',
      subscription: sub,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.get('/webhooks/logs', (req: Request, res: Response) => {
  const logs = webhookService.getDeliveryLogs();
  res.json({
    success: true,
    total: logs.length,
    data: logs,
  });
});

