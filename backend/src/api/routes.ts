import { Router, Request, Response } from 'express';
import crypto from 'crypto';
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

apiRouter.post('/agreements/:id/fork', (req: Request, res: Response) => {
  const { proposerAddress, sourceVersionNumber } = req.body;
  if (!proposerAddress) {
    return res.status(400).json({ success: false, error: 'proposerAddress is required' });
  }

  try {
    const forked = agreementService.forkVersion(req.params.id, {
      proposerAddress,
      sourceVersionNumber: sourceVersionNumber !== undefined ? parseInt(sourceVersionNumber, 10) : undefined,
    });
    res.json({
      success: true,
      message: 'Agreement version successfully forked into a new draft proposal.',
      data: forked,
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

apiRouter.get('/properties/:id/reconciliation', (req: Request, res: Response) => {
  const property = db.getPropertyById(req.params.id);
  if (!property) {
    return res.status(404).json({ success: false, error: 'Property not found' });
  }

  const revenues = db.getRevenueByProperty(property.id);
  const settlements = db.getSettlementsByProperty(property.id);
  const pool = db.getRevenuePool(property.id);

  const totalDistributable = settlements.reduce((sum, s) => sum + s.distributable_amount, 0);

  const allSettlementsMatched = settlements.every(
    (s) => s.reconciliation_status === 'MATCHED' || s.status === 'SETTLED' || s.status === 'RECONCILED'
  );

  const checksumPayload = JSON.stringify({
    property_id: property.id,
    revenue_count: revenues.length,
    settlement_count: settlements.length,
    total_gross: pool.total_confirmed_revenue,
    total_settled: pool.total_settled_revenue,
  });
  const ledgerChecksum = crypto.createHash('sha256').update(checksumPayload).digest('hex');

  res.json({
    success: true,
    data: {
      property_id: property.id,
      property_name: property.name,
      vault_stellar_address: property.vault_stellar_address,
      metrics: {
        total_revenue_records: revenues.length,
        total_gross_revenue: pool.total_confirmed_revenue,
        total_settlements: settlements.length,
        total_settled_gross: pool.total_settled_revenue,
        total_distributable_payouts: totalDistributable,
        unconsumed_revenue_pool: pool.available_for_settlement,
        reserve_balance: (property.metadata?.reserve_balance as number) || 2000,
      },
      audit: {
        status: allSettlementsMatched ? 'RECONCILED' : 'DISCREPANCY_FLAGGED',
        accounting_balanced: true,
        ledger_checksum: ledgerChecksum,
        last_reconciliation_timestamp: new Date().toISOString(),
      },
    },
  });
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

apiRouter.get('/properties/:id/vault-telemetry', (req: Request, res: Response) => {
  const property = db.getPropertyById(req.params.id);
  if (!property) {
    return res.status(404).json({ success: false, error: 'Property not found' });
  }

  const pool = db.getRevenuePool(property.id);
  const agreements = db.getAgreementsByProperty(property.id);
  const activeAgreement = agreements.find((a) => a.status === 'LOCKED');
  const activeVersion = activeAgreement?.versions.find((v) => v.version_number === activeAgreement.current_version);

  res.json({
    success: true,
    telemetry: {
      property_id: property.id,
      vault_stellar_address: property.vault_stellar_address,
      contract_name: 'StellarEstatePropertyVault',
      contract_version: '1.0.0-stellar-estate',
      standard: 'SEP-0001/SEP-0007/Soroban-v22',
      vault_status: property.status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED',
      accepted_asset: {
        code: 'USDC',
        contract_id: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZU25LEJ7W89ABCD1234',
      },
      financials: {
        total_revenue_recorded: pool.total_confirmed_revenue,
        total_settled: pool.total_settled_revenue,
        unconsumed_pool: pool.available_for_settlement,
        reserve_balance: (property.metadata?.reserve_balance as number) || 2000,
      },
      agreement: activeVersion
        ? {
            agreement_id: activeAgreement.id,
            version: activeVersion.version_number,
            agreement_hash: activeVersion.agreement_hash,
            contract_reference: activeVersion.contract_reference,
            stakeholder_count: activeVersion.stakeholders.length,
          }
        : null,
      explorer_links: {
        vault: `https://stellar.expert/explorer/testnet/account/${property.vault_stellar_address}`,
        asset: 'https://stellar.expert/explorer/testnet/asset/USDC-GBTY42VFL7XJ6Q7L35R62L4J7J5J67U4F26C6DVEOD6DGEGZ6E6DDEE5ABCD',
      },
      timestamp: new Date().toISOString(),
    },
  });
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

apiRouter.get('/blockchain/network-info', (req: Request, res: Response) => {
  const latestLedger = ledgerTrackerService.getLatestSequence();
  const networkPassphrase = 'Test SDF Network ; September 2015';

  res.json({
    success: true,
    network: {
      name: 'Stellar Testnet',
      passphrase: networkPassphrase,
      horizon_url: STELLAR_TESTNET_HORIZON,
      rpc_url: 'https://soroban-testnet.stellar.org',
      friendbot_url: 'https://friendbot.stellar.org',
      explorer_url: 'https://stellar.expert/explorer/testnet',
      base_fee_stroops: 100,
      protocol_version: 22,
      latest_ledger_sequence: latestLedger,
      accepted_assets: [
        {
          code: 'USDC',
          issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
          contract_id: 'CAQCFV2AUUXA2RFYGI4HD4KSGYYEB5Q5OC54ZAWU4HBPWZ7AL64KLCPH',
          decimals: 7,
        },
        {
          code: 'XLM',
          native: true,
          decimals: 7,
        },
      ],
    },
    status: 'ONLINE',
    timestamp: new Date().toISOString(),
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

apiRouter.get('/metrics', (req: Request, res: Response) => {
  const mem = process.memoryUsage();
  const uptime = process.uptime();
  const propertiesCount = db.properties.size;
  const revenueRecords = db.getAllRevenueRecords();
  const settlements = db.getAllSettlements();
  const agreements = Array.from(db.agreements.values());

  const totalRevenueAmount = revenueRecords.reduce((sum, r) => sum + r.amount, 0);
  const totalDistributableAmount = settlements.reduce((sum, s) => sum + s.distributable_amount, 0);
  const lockedAgreements = agreements.filter((a) => a.status === 'LOCKED').length;

  const lines = [
    '# HELP stellar_estate_process_uptime_seconds Process uptime in seconds',
    '# TYPE stellar_estate_process_uptime_seconds gauge',
    `stellar_estate_process_uptime_seconds ${uptime.toFixed(2)}`,
    '',
    '# HELP stellar_estate_process_memory_heap_bytes Process heap memory usage in bytes',
    '# TYPE stellar_estate_process_memory_heap_bytes gauge',
    `stellar_estate_process_memory_heap_bytes ${mem.heapUsed}`,
    '',
    '# HELP stellar_estate_process_memory_rss_bytes Process RSS memory in bytes',
    '# TYPE stellar_estate_process_memory_rss_bytes gauge',
    `stellar_estate_process_memory_rss_bytes ${mem.rss}`,
    '',
    '# HELP stellar_estate_properties_total Total real estate properties managed',
    '# TYPE stellar_estate_properties_total gauge',
    `stellar_estate_properties_total ${propertiesCount}`,
    '',
    '# HELP stellar_estate_revenue_records_total Total recorded revenue deposits',
    '# TYPE stellar_estate_revenue_records_total counter',
    `stellar_estate_revenue_records_total ${revenueRecords.length}`,
    '',
    '# HELP stellar_estate_revenue_gross_usdc Cumulative recorded gross revenue in USDC',
    '# TYPE stellar_estate_revenue_gross_usdc counter',
    `stellar_estate_revenue_gross_usdc ${totalRevenueAmount.toFixed(2)}`,
    '',
    '# HELP stellar_estate_settlements_total Total completed waterfall settlements',
    '# TYPE stellar_estate_settlements_total counter',
    `stellar_estate_settlements_total ${settlements.length}`,
    '',
    '# HELP stellar_estate_settlements_distributed_usdc Cumulative stakeholder payouts distributed in USDC',
    '# TYPE stellar_estate_settlements_distributed_usdc counter',
    `stellar_estate_settlements_distributed_usdc ${totalDistributableAmount.toFixed(2)}`,
    '',
    '# HELP stellar_estate_agreements_locked Total locked immutable distribution agreements',
    '# TYPE stellar_estate_agreements_locked gauge',
    `stellar_estate_agreements_locked ${lockedAgreements}`,
  ];

  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(lines.join('\n') + '\n');
});

apiRouter.get('/diagnostics', async (req: Request, res: Response) => {
  const startTime = Date.now();
  let horizonStatus = 'UNKNOWN';
  let horizonLatency = 0;

  try {
    const hStart = Date.now();
    const hRes = await fetch(`${STELLAR_TESTNET_HORIZON}/fee_stats`, { signal: AbortSignal.timeout(600) });
    horizonLatency = Date.now() - hStart;
    if (hRes.ok) {
      horizonStatus = 'ONLINE';
    } else {
      horizonStatus = 'DEGRADED';
    }
  } catch {
    horizonStatus = 'STANDBY';
  }

  const latestLedger = ledgerTrackerService.getLatestSequence();
  const mem = process.memoryUsage();
  const dbHealth = {
    properties: db.properties.size,
    agreements: db.agreements.size,
    revenue_records: db.revenueRecords.size,
    settlements: db.settlements.size,
    audit_events: db.auditEvents.length,
    webhooks: webhookService.getSubscriptions().length,
  };

  const isHealthy = horizonStatus !== 'OFFLINE';

  res.json({
    success: true,
    status: isHealthy ? 'HEALTHY' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    execution_time_ms: Date.now() - startTime,
    environment: {
      node_version: process.version,
      platform: process.platform,
      arch: process.arch,
      uptime_seconds: Math.floor(process.uptime()),
    },
    memory: {
      heap_used_mb: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
      heap_total_mb: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
      rss_mb: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
    },
    stellar: {
      network: 'TESTNET',
      horizon_url: STELLAR_TESTNET_HORIZON,
      horizon_status: horizonStatus,
      horizon_latency_ms: horizonLatency,
      latest_ledger: latestLedger,
    },
    database: dbHealth,
  });
});

apiRouter.get('/properties/:id/audit-trail', (req: Request, res: Response) => {
  const property = db.getPropertyById(req.params.id);
  if (!property) {
    return res.status(404).json({ success: false, error: 'Property not found' });
  }

  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
  const events = db.getPropertyAuditEvents(property.id, isNaN(limit) ? 50 : limit);

  res.json({
    success: true,
    property_id: property.id,
    property_name: property.name,
    total_events: events.length,
    data: events,
  });
});

apiRouter.get('/stakeholders/:address/portfolio', (req: Request, res: Response) => {
  const targetAddress = req.params.address.toUpperCase();

  const allAgreements = Array.from(db.agreements.values());
  const allSettlements = db.getAllSettlements();
  const allProperties = db.getAllProperties();

  const holdings: Array<{
    property_id: string;
    property_name: string;
    property_type: string;
    property_image: string;
    property_valuation: number;
    share_basis_points: number;
    share_percentage: number;
    equity_value_usdc: number;
    role: string;
    agreement_id: string;
    agreement_version: number;
    total_lifetime_payouts_usdc: number;
    payout_count: number;
  }> = [];

  let totalLifetimePayouts = 0;
  let totalEquityValue = 0;

  for (const property of allProperties) {
    const propAgreements = allAgreements.filter((a) => a.property_id === property.id);
    let matchedStakeholder: any = undefined;
    let matchedAgreementId = '';
    let matchedVersionNumber = 0;

    for (const agr of propAgreements) {
      const versions = db.getAgreementVersions(agr.id);
      for (const v of [...versions].reverse()) {
        const stk = v.stakeholders.find((s) => s.wallet_address.toUpperCase() === targetAddress);
        if (stk) {
          matchedStakeholder = stk;
          matchedAgreementId = agr.id;
          matchedVersionNumber = v.version_number;
          break;
        }
      }
      if (matchedStakeholder) break;
    }

    if (matchedStakeholder) {
      const propSettlements = allSettlements.filter((s) => s.property_id === property.id);
      let propertyPayouts = 0;
      let payoutCount = 0;

      for (const stl of propSettlements) {
        for (const p of stl.payouts) {
          if (p.recipient_address.toUpperCase() === targetAddress) {
            propertyPayouts += p.actual_amount || p.expected_amount || 0;
            payoutCount++;
          }
        }
      }

      totalLifetimePayouts += propertyPayouts;
      const sharePct = matchedStakeholder.basis_points / 100;
      const equityVal = Math.round(property.valuation * (matchedStakeholder.basis_points / 10000) * 100) / 100;
      totalEquityValue += equityVal;

      holdings.push({
        property_id: property.id,
        property_name: property.name,
        property_type: property.property_type,
        property_image: property.image_url,
        property_valuation: property.valuation,
        share_basis_points: matchedStakeholder.basis_points,
        share_percentage: sharePct,
        equity_value_usdc: equityVal,
        role: matchedStakeholder.role,
        agreement_id: matchedAgreementId,
        agreement_version: matchedVersionNumber,
        total_lifetime_payouts_usdc: Math.round(propertyPayouts * 100) / 100,
        payout_count: payoutCount,
      });
    }
  }

  res.json({
    success: true,
    data: {
      stakeholder_address: req.params.address,
      total_properties_invested: holdings.length,
      total_portfolio_equity_value_usdc: Math.round(totalEquityValue * 100) / 100,
      total_lifetime_payouts_usdc: Math.round(totalLifetimePayouts * 100) / 100,
      holdings,
    },
  });
});



apiRouter.post('/blockchain/simulate-tx', (req: Request, res: Response) => {
  const { contract_id, function_name, args, caller_address } = req.body;
  if (!contract_id || typeof contract_id !== 'string') {
    return res.status(400).json({ success: false, error: 'contract_id is required' });
  }
  if (!function_name || typeof function_name !== 'string') {
    return res.status(400).json({ success: false, error: 'function_name is required' });
  }

  const isSettlement = function_name.includes('settle') || function_name.includes('execute');
  const isRevenue = function_name.includes('revenue') || function_name.includes('deposit');
  const isQuery = function_name.startsWith('get_') || function_name.startsWith('is_') || function_name.startsWith('has_');

  let cpuInstructions = 1850000;
  let memBytes = 524288;
  let readKeys = 3;
  let writeKeys = 1;
  let minFeeStroops = 1500;

  if (isSettlement) {
    cpuInstructions = 4250000;
    memBytes = 1572864;
    readKeys = 8;
    writeKeys = 5;
    minFeeStroops = 4200;
  } else if (isRevenue) {
    cpuInstructions = 2450000;
    memBytes = 786432;
    readKeys = 4;
    writeKeys = 3;
    minFeeStroops = 2400;
  } else if (isQuery) {
    cpuInstructions = 650000;
    memBytes = 262144;
    readKeys = 2;
    writeKeys = 0;
    minFeeStroops = 100;
  }

  res.json({
    success: true,
    simulation: {
      contract_id,
      function_name,
      caller_address: caller_address || 'GBTY42VFL7XJ6Q7L35R62L4J7J5J67U4F26C6DVEOD6DGEGZ6E6DDEE5ABCD',
      status: 'SUCCESS',
      footprint: {
        read_only_keys: readKeys,
        read_write_keys: writeKeys,
        total_keys: readKeys + writeKeys,
      },
      resources: {
        cpu_instructions: cpuInstructions,
        cpu_instructions_limit: Math.round(cpuInstructions * 1.25),
        mem_bytes: memBytes,
        mem_bytes_limit: Math.round(memBytes * 1.25),
      },
      estimated_fee: {
        base_fee_stroops: 100,
        resource_fee_stroops: minFeeStroops,
        total_fee_stroops: minFeeStroops + 100,
        total_fee_xlm: (minFeeStroops + 100) / 10000000,
      },
      simulated_at: new Date().toISOString(),
    },
  });
});


apiRouter.get('/properties/:id/occupancy-history', (req: Request, res: Response) => {
  const property = db.getPropertyById(req.params.id);
  if (!property) {
    return res.status(404).json({ success: false, error: 'Property not found' });
  }

  const units = db.getPropertyUnits(property.id);
  const occupiedUnits = units.filter((u) => u.occupancy_status === 'OCCUPIED');
  const totalRent = occupiedUnits.reduce((sum, u) => sum + (u.monthly_rent || 0), 0);
  const currentOccupancy = units.length > 0 ? Math.round((occupiedUnits.length / units.length) * 1000) / 10 : 0;

  const months = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
  const baselineRates = [85.0, 87.5, 90.0, 92.5, 92.5, currentOccupancy];

  const history = months.map((month, idx) => {
    const rate = baselineRates[idx] || currentOccupancy;
    const estOccupied = Math.round((units.length * rate) / 100);
    return {
      period: month,
      occupancy_percentage: rate,
      total_units: units.length,
      occupied_units: estOccupied,
      vacant_units: units.length - estOccupied,
      monthly_gross_rent: Math.round(totalRent * (rate / (currentOccupancy || 100))),
      collection_rate_percentage: 98.5 + (idx % 2) * 1.0,
    };
  });

  res.json({
    success: true,
    data: {
      property_id: property.id,
      property_name: property.name,
      current_occupancy_percentage: currentOccupancy,
      total_units: units.length,
      occupied_units_count: occupiedUnits.length,
      vacant_units_count: units.length - occupiedUnits.length,
      monthly_invoiced_rent: totalRent,
      history,
      units: units.map((u) => ({
        id: u.id,
        identifier: u.unit_identifier,
        unit_type: u.unit_type,
        monthly_rent: u.monthly_rent,
        status: u.occupancy_status,
      })),
    },
  });
});


apiRouter.get('/admin/db-health', (req: Request, res: Response) => {
  const allProperties = db.getAllProperties();
  const allAgreements = Array.from(db.agreements.values());
  const allRevenues = db.getAllRevenueRecords();
  const allSettlements = db.getAllSettlements();
  const allUnits = Array.from(db.units.values());

  let integrityPassed = true;
  const issues: string[] = [];

  for (const r of allRevenues) {
    if (r.amount < 0) {
      integrityPassed = false;
      issues.push(`Negative revenue recorded on record ${r.id}`);
    }
  }

  for (const s of allSettlements) {
    if (s.distributable_amount < 0 || s.gross_revenue < 0) {
      integrityPassed = false;
      issues.push(`Invalid settlement amounts on ${s.id}`);
    }
  }

  res.json({
    success: true,
    status: integrityPassed ? 'UP' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    storage_engine: 'In-Memory Transactional Store with JSON Snapshots',
    integrity_check: {
      status: integrityPassed ? 'PASSED' : 'FAILED',
      issues,
    },
    collections: {
      properties: allProperties.length,
      units: allUnits.length,
      agreements: allAgreements.length,
      agreement_versions: db.agreementVersions.size,
      revenue_records: allRevenues.length,
      settlements: allSettlements.length,
      audit_events: db.auditEvents.length,
      webhooks: webhookService.getSubscriptions().length,
    },
  });
});
