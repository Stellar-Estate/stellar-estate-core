import { db } from '../database/db.js';
import {
  DistributionAgreement,
  DistributionAgreementVersion,
  WaterfallRule,
  AgreementStakeholder,
  AgreementApproval,
  SettlementPreviewResult,
} from '../database/types.js';
import { agreementHashingService } from './agreementHashingService.js';
import { settlementPreviewService } from './settlementPreviewService.js';

export interface CreateAgreementRequest {
  propertyId: string;
  agreementIdentifier: string;
  revenueSource: string;
  acceptedAsset: string;
  effectiveDate: string;
  createdBy: string;
  waterfallRules: Omit<WaterfallRule, 'id' | 'agreement_version_id'>[];
  stakeholders: Omit<AgreementStakeholder, 'id' | 'agreement_version_id' | 'has_approved' | 'approved_at'>[];
}

export interface ProposeVersionRequest {
  revenueSource: string;
  acceptedAsset: string;
  effectiveDate: string;
  proposerAddress: string;
  waterfallRules: Omit<WaterfallRule, 'id' | 'agreement_version_id'>[];
  stakeholders: Omit<AgreementStakeholder, 'id' | 'agreement_version_id' | 'has_approved' | 'approved_at'>[];
}

export interface ApproveVersionRequest {
  stakeholderAddress: string;
  agreementHash: string;
  signatureOrProof?: string;
}

export class AgreementService {
  /**
   * Create an initial distribution agreement (Version 1)
   */
  createAgreement(req: CreateAgreementRequest): { agreement: DistributionAgreement; version: DistributionAgreementVersion } {
    const property = db.getPropertyById(req.propertyId);
    if (!property) {
      throw new Error(`Property ${req.propertyId} not found.`);
    }

    // 1. Strict Financial Validation
    const validation = agreementHashingService.validateFinancialTerms({
      property_id: req.propertyId,
      agreement_identifier: req.agreementIdentifier,
      version_number: 1,
      revenue_source: req.revenueSource,
      accepted_asset: req.acceptedAsset,
      effective_date: req.effectiveDate,
      waterfall_rules: req.waterfallRules,
      stakeholders: req.stakeholders,
    });

    if (!validation.valid) {
      throw new Error(`Financial validation failed: ${validation.errors.join('; ')}`);
    }

    const agreementId = `agr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const versionId = `ver-${agreementId}-v1`;

    // 2. Deterministic Canonical Representation & Hash
    const canonical = agreementHashingService.generateCanonicalRepresentation({
      property_id: req.propertyId,
      agreement_identifier: req.agreementIdentifier,
      version_number: 1,
      revenue_source: req.revenueSource,
      accepted_asset: req.acceptedAsset,
      effective_date: req.effectiveDate,
      waterfall_rules: req.waterfallRules,
      stakeholders: req.stakeholders,
    });
    const hash = agreementHashingService.computeAgreementHash(canonical);

    // 3. Assemble Version
    const versionRules: WaterfallRule[] = req.waterfallRules.map((r, i) => ({
      ...r,
      id: `rule-${versionId}-${i + 1}`,
      agreement_version_id: versionId,
    }));

    const versionStakeholders: AgreementStakeholder[] = req.stakeholders.map((s, i) => ({
      ...s,
      id: `stk-${versionId}-${i + 1}`,
      agreement_version_id: versionId,
      has_approved: false,
    }));

    const version: DistributionAgreementVersion = {
      id: versionId,
      agreement_id: agreementId,
      version_number: 1,
      revenue_source: req.revenueSource,
      accepted_asset: req.acceptedAsset,
      effective_date: req.effectiveDate,
      canonical_representation: canonical,
      agreement_hash: hash,
      status: 'PENDING_APPROVALS',
      created_at: new Date().toISOString(),
      waterfall_rules: versionRules,
      stakeholders: versionStakeholders,
      approvals: [],
    };

    const agreement: DistributionAgreement = {
      id: agreementId,
      property_id: req.propertyId,
      agreement_identifier: req.agreementIdentifier,
      current_version: 1,
      status: 'PENDING_APPROVALS',
      created_by: req.createdBy,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      versions: [version],
    };

    db.saveAgreement(agreement);
    db.saveAgreementVersion(version);

    db.recordAuditEvent({
      event_type: 'AGREEMENT_CREATED',
      entity_type: 'DISTRIBUTION_AGREEMENT',
      entity_id: agreementId,
      actor_address: req.createdBy,
      payload: { version: 1, agreementHash: hash, propertyId: req.propertyId },
    });

    return { agreement, version };
  }

  /**
   * Propose a new version for an existing agreement (e.g. v2)
   */
  proposeNewVersion(agreementId: string, req: ProposeVersionRequest): DistributionAgreementVersion {
    const agreement = db.getAgreementById(agreementId);
    if (!agreement) {
      throw new Error(`Agreement ${agreementId} not found.`);
    }

    const nextVersionNumber = agreement.current_version + 1;
    const versionId = `ver-${agreementId}-v${nextVersionNumber}`;

    // Validate financial terms
    const validation = agreementHashingService.validateFinancialTerms({
      property_id: agreement.property_id,
      agreement_identifier: agreement.agreement_identifier,
      version_number: nextVersionNumber,
      revenue_source: req.revenueSource,
      accepted_asset: req.acceptedAsset,
      effective_date: req.effectiveDate,
      waterfall_rules: req.waterfallRules,
      stakeholders: req.stakeholders,
    });

    if (!validation.valid) {
      throw new Error(`Financial validation failed: ${validation.errors.join('; ')}`);
    }

    const canonical = agreementHashingService.generateCanonicalRepresentation({
      property_id: agreement.property_id,
      agreement_identifier: agreement.agreement_identifier,
      version_number: nextVersionNumber,
      revenue_source: req.revenueSource,
      accepted_asset: req.acceptedAsset,
      effective_date: req.effectiveDate,
      waterfall_rules: req.waterfallRules,
      stakeholders: req.stakeholders,
    });
    const hash = agreementHashingService.computeAgreementHash(canonical);

    const versionRules: WaterfallRule[] = req.waterfallRules.map((r, i) => ({
      ...r,
      id: `rule-${versionId}-${i + 1}`,
      agreement_version_id: versionId,
    }));

    const versionStakeholders: AgreementStakeholder[] = req.stakeholders.map((s, i) => ({
      ...s,
      id: `stk-${versionId}-${i + 1}`,
      agreement_version_id: versionId,
      has_approved: false,
    }));

    const newVersion: DistributionAgreementVersion = {
      id: versionId,
      agreement_id: agreementId,
      version_number: nextVersionNumber,
      revenue_source: req.revenueSource,
      accepted_asset: req.acceptedAsset,
      effective_date: req.effectiveDate,
      canonical_representation: canonical,
      agreement_hash: hash,
      status: 'PENDING_APPROVALS',
      created_at: new Date().toISOString(),
      waterfall_rules: versionRules,
      stakeholders: versionStakeholders,
      approvals: [],
    };

    db.saveAgreementVersion(newVersion);

    db.recordAuditEvent({
      event_type: 'VERSION_PROPOSED',
      entity_type: 'DISTRIBUTION_AGREEMENT',
      entity_id: agreementId,
      actor_address: req.proposerAddress,
      payload: { version: nextVersionNumber, agreementHash: hash },
    });

    return newVersion;
  }

  /**
   * Stakeholder reviews and approves the EXACT agreement version and hash
   */
  approveVersion(versionId: string, req: ApproveVersionRequest): DistributionAgreementVersion {
    const version = db.getAgreementVersionById(versionId);
    if (!version) {
      throw new Error(`Agreement version ${versionId} not found.`);
    }

    if (version.status === 'LOCKED') {
      throw new Error('Agreement version is already locked and immutable. Approvals cannot be altered.');
    }

    // Verify exact hash match
    if (version.agreement_hash !== req.agreementHash) {
      throw new Error(
        `Agreement hash mismatch! Expected: ${version.agreement_hash}, got: ${req.agreementHash}. Approval must be on the exact canonical terms.`
      );
    }

    // Check stakeholder membership
    const stakeholder = version.stakeholders.find(
      (s) => s.wallet_address.toUpperCase() === req.stakeholderAddress.toUpperCase()
    );

    if (!stakeholder) {
      throw new Error(`Address ${req.stakeholderAddress} is not an authorized stakeholder for this agreement version.`);
    }

    if (stakeholder.has_approved) {
      throw new Error(`Stakeholder ${stakeholder.name} has already approved this agreement version.`);
    }

    // Record approval
    stakeholder.has_approved = true;
    stakeholder.approved_at = new Date().toISOString();
    stakeholder.approval_signature = req.signatureOrProof || `sig_wallet_${Date.now()}`;

    const approvalRecord: AgreementApproval = {
      id: `appr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      agreement_version_id: version.id,
      wallet_address: req.stakeholderAddress,
      agreement_hash: req.agreementHash,
      approval_type: 'STELLAR_WALLET',
      signature_or_proof: stakeholder.approval_signature,
      timestamp: new Date().toISOString(),
    };
    version.approvals.push(approvalRecord);

    // Check if all stakeholders approved
    const allApproved = version.stakeholders.every((s) => s.has_approved);
    if (allApproved) {
      version.status = 'READY_TO_LOCK';
    } else {
      version.status = 'PARTIALLY_APPROVED';
    }

    db.saveAgreementVersion(version);

    db.recordAuditEvent({
      event_type: 'STAKEHOLDER_APPROVED',
      entity_type: 'DISTRIBUTION_AGREEMENT_VERSION',
      entity_id: versionId,
      actor_address: req.stakeholderAddress,
      payload: {
        stakeholderName: stakeholder.name,
        version: version.version_number,
        agreementHash: req.agreementHash,
        status: version.status,
      },
    });

    return version;
  }

  /**
   * Lock the agreement once all required approvals have been verified
   */
  lockVersion(versionId: string, callerAddress: string): DistributionAgreementVersion {
    const version = db.getAgreementVersionById(versionId);
    if (!version) {
      throw new Error(`Agreement version ${versionId} not found.`);
    }

    if (version.status === 'LOCKED') {
      throw new Error('Agreement version is already locked.');
    }

    const allApproved = version.stakeholders.every((s) => s.has_approved);
    if (!allApproved) {
      const pendingNames = version.stakeholders.filter((s) => !s.has_approved).map((s) => s.name);
      throw new Error(
        `Cannot lock agreement. Missing required stakeholder approvals from: ${pendingNames.join(', ')}`
      );
    }

    version.status = 'LOCKED';
    version.locked_at = new Date().toISOString();
    version.contract_reference = `SOROBAN_DISTRIB_AGREEMENT_${version.agreement_hash.substring(0, 16)}`;

    // If there is an existing agreement, mark previous versions as SUPERSEDED
    const agreement = db.getAgreementById(version.agreement_id);
    if (agreement) {
      for (const v of agreement.versions) {
        if (v.id !== version.id && v.status === 'LOCKED') {
          v.status = 'SUPERSEDED';
          db.saveAgreementVersion(v);
        }
      }
      agreement.status = 'LOCKED';
      agreement.current_version = version.version_number;
      db.saveAgreement(agreement);
    }

    db.saveAgreementVersion(version);

    db.recordAuditEvent({
      event_type: 'AGREEMENT_LOCKED',
      entity_type: 'DISTRIBUTION_AGREEMENT_VERSION',
      entity_id: versionId,
      actor_address: callerAddress,
      payload: {
        agreementId: version.agreement_id,
        version: version.version_number,
        agreementHash: version.agreement_hash,
        contractReference: version.contract_reference,
        lockedAt: version.locked_at,
      },
    });

    return version;
  }

  /**
   * Deterministic settlement preview calculation
   */
  previewSettlement(versionId: string, sampleRevenue: number): SettlementPreviewResult {
    const version = db.getAgreementVersionById(versionId);
    if (!version) {
      throw new Error(`Agreement version ${versionId} not found.`);
    }

    const agreement = db.getAgreementById(version.agreement_id);
    return settlementPreviewService.calculatePreview(
      version,
      agreement?.property_id || 'unknown',
      sampleRevenue
    );
  }

  /**
   * Compare two versions of an agreement (Version diff)
   */
  compareVersions(agreementId: string, versionNumberA: number, versionNumberB: number) {
    const agreement = db.getAgreementById(agreementId);
    if (!agreement) {
      throw new Error(`Agreement ${agreementId} not found.`);
    }

    const vA = agreement.versions.find((v) => v.version_number === versionNumberA);
    const vB = agreement.versions.find((v) => v.version_number === versionNumberB);

    if (!vA || !vB) {
      throw new Error(`One or both specified versions (${versionNumberA}, ${versionNumberB}) do not exist.`);
    }

    return {
      agreement_id: agreementId,
      versionA: {
        version_number: vA.version_number,
        status: vA.status,
        hash: vA.agreement_hash,
        effective_date: vA.effective_date,
        waterfall_rules: vA.waterfall_rules,
        stakeholders: vA.stakeholders.map((s) => ({
          name: s.name,
          role: s.role,
          wallet: s.wallet_address,
          basis_points: s.basis_points,
          percentage: `${(s.basis_points / 100).toFixed(2)}%`,
        })),
      },
      versionB: {
        version_number: vB.version_number,
        status: vB.status,
        hash: vB.agreement_hash,
        effective_date: vB.effective_date,
        waterfall_rules: vB.waterfall_rules,
        stakeholders: vB.stakeholders.map((s) => ({
          name: s.name,
          role: s.role,
          wallet: s.wallet_address,
          basis_points: s.basis_points,
          percentage: `${(s.basis_points / 100).toFixed(2)}%`,
        })),
      },
    };
  }
}

export const agreementService = new AgreementService();
