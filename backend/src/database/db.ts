import {
  Property,
  PropertyUnit,
  Participant,
  PropertyParticipation,
  BlockchainTransaction,
  RevenueRecord,
  AuditEvent,
  ReconciliationReport,
  DistributionAgreement,
  DistributionAgreementVersion,
  WaterfallRule,
  AgreementStakeholder,
  AgreementApproval,
} from './types.js';
import { agreementHashingService } from '../services/agreementHashingService.js';

class InMemoryDatabase {
  properties: Map<string, Property> = new Map();
  units: Map<string, PropertyUnit> = new Map();
  participants: Map<string, Participant> = new Map();
  participations: Map<string, PropertyParticipation> = new Map();
  blockchainTransactions: Map<string, BlockchainTransaction> = new Map();
  revenueRecords: Map<string, RevenueRecord> = new Map();
  auditEvents: AuditEvent[] = [];
  reconciliationReports: ReconciliationReport[] = [];

  // Level 2: Distribution Agreements
  agreements: Map<string, DistributionAgreement> = new Map();
  agreementVersions: Map<string, DistributionAgreementVersion> = new Map();

  constructor() {
    this.seedDefaultData();
    this.seedLevel2Agreements();
  }

  private seedDefaultData() {
    // 1. The Meridian (Abuja, Nigeria) - Flagship property
    const meridian: Property = {
      id: 'prop-meridian-abuja',
      name: 'The Meridian',
      description: 'Luxury mixed-use residential complex with 10 high-spec executive units in the diplomatic sector of Abuja.',
      location: 'Maitama, Abuja, Nigeria',
      property_type: 'Residential / Mixed-Use',
      valuation: 500000.0,
      unit_count: 10,
      occupancy_percentage: 90.0,
      vault_stellar_address: 'GAU6PZRLYQZCRG6E4V7P6E4J67U4F26C6DVEOD6DGEGZ6E6DDEE5ABCD',
      status: 'ACTIVE',
      image_url: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1200&q=80',
      metadata: {
        construction_year: 2022,
        gross_floor_area_sqm: 1850,
        energy_rating: 'A',
        accepted_revenue_assets: ['XLM', 'USDC'],
        soroban_vault_contract: 'CAU6PZRLYQZCRG6E4V7P6E4J67U4F26C6DVEOD6DGEGZ6E6DDEE5VAULT',
      },
      created_at: new Date('2026-01-15T09:00:00Z').toISOString(),
      updated_at: new Date('2026-10-07T12:00:00Z').toISOString(),
    };

    // 2. Eko Atlantic Horizon Tower (Lagos, Nigeria)
    const eko: Property = {
      id: 'prop-eko-horizon-lagos',
      name: 'Eko Atlantic Horizon Tower',
      description: 'Premier coastal residential high-rise featuring 24 premium residential apartments with sea-facing views.',
      location: 'Eko Atlantic City, Lagos, Nigeria',
      property_type: 'Commercial Residential',
      valuation: 1800000.0,
      unit_count: 24,
      occupancy_percentage: 95.8,
      vault_stellar_address: 'GBVRQYZCRG6E4V7P6E4J67U4F26C6DVEOD6DGEGZ6E6DDEE5ABCDEKOT',
      status: 'ACTIVE',
      image_url: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80',
      metadata: {
        construction_year: 2023,
        gross_floor_area_sqm: 4200,
        energy_rating: 'A+',
        accepted_revenue_assets: ['XLM', 'USDC'],
        soroban_vault_contract: 'CBVRQYZCRG6E4V7P6E4J67U4F26C6DVEOD6DGEGZ6E6DDEE5EKOVAULT',
      },
      created_at: new Date('2026-02-01T10:00:00Z').toISOString(),
      updated_at: new Date('2026-10-07T14:30:00Z').toISOString(),
    };

    // 3. Kilimani Highline Suites (Nairobi, Kenya)
    const kilimani: Property = {
      id: 'prop-kilimani-suites-nairobi',
      name: 'Kilimani Highline Suites',
      description: 'Tech-district boutique serviced apartments with 16 modern studio and one-bedroom units.',
      location: 'Kilimani, Nairobi, Kenya',
      property_type: 'Serviced Apartments',
      valuation: 750000.0,
      unit_count: 16,
      occupancy_percentage: 87.5,
      vault_stellar_address: 'GCVRQYZCRG6E4V7P6E4J67U4F26C6DVEOD6DGEGZ6E6DDEE5ABCDKLMN',
      status: 'ACTIVE',
      image_url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80',
      metadata: {
        construction_year: 2021,
        gross_floor_area_sqm: 2100,
        energy_rating: 'B+',
        accepted_revenue_assets: ['XLM', 'USDC'],
        soroban_vault_contract: 'CCVRQYZCRG6E4V7P6E4J67U4F26C6DVEOD6DGEGZ6E6DDEE5KLMVAULT',
      },
      created_at: new Date('2026-03-10T11:00:00Z').toISOString(),
      updated_at: new Date('2026-10-07T16:00:00Z').toISOString(),
    };

    this.properties.set(meridian.id, meridian);
    this.properties.set(eko.id, eko);
    this.properties.set(kilimani.id, kilimani);

    // Units for The Meridian
    for (let i = 1; i <= 10; i++) {
      const unitId = `unit-meridian-${i.toString().padStart(2, '0')}`;
      this.units.set(unitId, {
        id: unitId,
        property_id: meridian.id,
        unit_identifier: `Suite ${100 + i}`,
        unit_type: i <= 2 ? 'Penthouse Suite' : '2-Bedroom Luxury',
        monthly_rent: i <= 2 ? 1200.0 : 800.0,
        occupancy_status: i === 10 ? 'VACANT' : 'OCCUPIED',
        metadata: { floor: Math.ceil(i / 2), balcony: true },
        created_at: meridian.created_at,
        updated_at: meridian.updated_at,
      });
    }

    // Participants
    const participantOwner: Participant = {
      id: 'part-owner-01',
      wallet_address: 'GBTY42VFL7XJ6Q7L35R62L4J7J5J67U4F26C6DVEOD6DGEGZ6E6DDEE5ABCD',
      display_name: 'Meridian Capital Partners (Alice)',
      role: 'OWNER',
      created_at: meridian.created_at,
    };
    const participantOperator: Participant = {
      id: 'part-operator-01',
      wallet_address: 'GCDZ42VFL7XJ6Q7L35R62L4J7J5J67U4F26C6DVEOD6DGEGZ6E6DDEE5WXYZ',
      display_name: 'Apex Property Management (Bob)',
      role: 'OPERATOR',
      created_at: meridian.created_at,
    };
    this.participants.set(participantOwner.id, participantOwner);
    this.participants.set(participantOperator.id, participantOperator);
  }

  private seedLevel2Agreements() {
    const propId = 'prop-meridian-abuja';
    const agreementId = 'agr-meridian-001';

    // 1. Version 1 (LOCKED)
    const v1Rules: WaterfallRule[] = [
      {
        id: 'rule-v1-01',
        agreement_version_id: 'ver-meridian-001-v1',
        priority: 1,
        rule_type: 'FIXED_AMOUNT',
        name: 'Operating Expenses',
        amount_or_bps: 1000.0,
        description: 'Monthly utility, security, and facility operational costs',
      },
      {
        id: 'rule-v1-02',
        agreement_version_id: 'ver-meridian-001-v1',
        priority: 2,
        rule_type: 'FIXED_AMOUNT',
        name: 'Maintenance Reserve',
        amount_or_bps: 1000.0,
        description: 'CapEx reserve account for capital repairs and equipment provision',
      },
      {
        id: 'rule-v1-03',
        agreement_version_id: 'ver-meridian-001-v1',
        priority: 3,
        rule_type: 'PERCENTAGE_BASIS_POINTS',
        name: 'Management Fee',
        amount_or_bps: 500, // 5.00%
        description: 'Operator property management compensation fee (5%)',
      },
    ];

    const v1Stakeholders: AgreementStakeholder[] = [
      {
        id: 'stk-v1-01',
        agreement_version_id: 'ver-meridian-001-v1',
        wallet_address: 'GBTY42VFL7XJ6Q7L35R62L4J7J5J67U4F26C6DVEOD6DGEGZ6E6DDEE5ABCD',
        name: 'Alice (Meridian Capital)',
        role: 'Majority Equity',
        basis_points: 4000, // 40.00%
        has_approved: true,
        approved_at: '2026-09-15T10:00:00Z',
        approval_signature: 'sig_ed25519_alice_v1_confirmed',
      },
      {
        id: 'stk-v1-02',
        agreement_version_id: 'ver-meridian-001-v1',
        wallet_address: 'GCDZ42VFL7XJ6Q7L35R62L4J7J5J67U4F26C6DVEOD6DGEGZ6E6DDEE5WXYZ',
        name: 'Bob (Apex Property Mgmt)',
        role: 'Operating Partner',
        basis_points: 3500, // 35.00%
        has_approved: true,
        approved_at: '2026-09-15T10:45:00Z',
        approval_signature: 'sig_ed25519_bob_v1_confirmed',
      },
      {
        id: 'stk-v1-03',
        agreement_version_id: 'ver-meridian-001-v1',
        wallet_address: 'GCVRQYZCRG6E4V7P6E4J67U4F26C6DVEOD6DGEGZ6E6DDEE5ABCDKLMN',
        name: 'Charlie (Strategic Investor)',
        role: 'Equity Participant',
        basis_points: 2500, // 25.00%
        has_approved: true,
        approved_at: '2026-09-15T11:30:00Z',
        approval_signature: 'sig_ed25519_charlie_v1_confirmed',
      },
    ];

    const v1Canonical = agreementHashingService.generateCanonicalRepresentation({
      property_id: propId,
      agreement_identifier: 'MERIDIAN-REV-001',
      version_number: 1,
      revenue_source: 'Rental Revenue',
      accepted_asset: 'USDC',
      effective_date: '2026-09-01',
      waterfall_rules: v1Rules,
      stakeholders: v1Stakeholders,
    });
    const v1Hash = agreementHashingService.computeAgreementHash(v1Canonical);

    const v1: DistributionAgreementVersion = {
      id: 'ver-meridian-001-v1',
      agreement_id: agreementId,
      version_number: 1,
      revenue_source: 'Rental Revenue',
      accepted_asset: 'USDC',
      effective_date: '2026-09-01',
      canonical_representation: v1Canonical,
      agreement_hash: v1Hash,
      status: 'LOCKED',
      contract_reference: 'CDISTRIB_AGREEMENT_MERIDIAN_V1_LOCKED',
      created_at: '2026-09-10T09:00:00Z',
      locked_at: '2026-09-15T12:00:00Z',
      waterfall_rules: v1Rules,
      stakeholders: v1Stakeholders,
      approvals: [
        {
          id: 'appr-01',
          agreement_version_id: 'ver-meridian-001-v1',
          wallet_address: v1Stakeholders[0].wallet_address,
          agreement_hash: v1Hash,
          approval_type: 'STELLAR_WALLET',
          signature_or_proof: 'sig_alice_01',
          timestamp: '2026-09-15T10:00:00Z',
        },
        {
          id: 'appr-02',
          agreement_version_id: 'ver-meridian-001-v1',
          wallet_address: v1Stakeholders[1].wallet_address,
          agreement_hash: v1Hash,
          approval_type: 'STELLAR_WALLET',
          signature_or_proof: 'sig_bob_02',
          timestamp: '2026-09-15T10:45:00Z',
        },
        {
          id: 'appr-03',
          agreement_version_id: 'ver-meridian-001-v1',
          wallet_address: v1Stakeholders[2].wallet_address,
          agreement_hash: v1Hash,
          approval_type: 'STELLAR_WALLET',
          signature_or_proof: 'sig_charlie_03',
          timestamp: '2026-09-15T11:30:00Z',
        },
      ],
    };

    // 2. Version 2 (PENDING_APPROVALS / PARTIALLY_APPROVED)
    const v2Rules: WaterfallRule[] = [
      {
        id: 'rule-v2-01',
        agreement_version_id: 'ver-meridian-001-v2',
        priority: 1,
        rule_type: 'FIXED_AMOUNT',
        name: 'Operating Expenses',
        amount_or_bps: 1200.0, // increased to 1200
        description: 'Adjusted monthly utility and on-site staff costs',
      },
      {
        id: 'rule-v2-02',
        agreement_version_id: 'ver-meridian-001-v2',
        priority: 2,
        rule_type: 'FIXED_AMOUNT',
        name: 'Maintenance Reserve',
        amount_or_bps: 800.0,
        description: 'CapEx reserve account for capital repairs',
      },
      {
        id: 'rule-v2-03',
        agreement_version_id: 'ver-meridian-001-v2',
        priority: 3,
        rule_type: 'PERCENTAGE_BASIS_POINTS',
        name: 'Management Fee',
        amount_or_bps: 400, // 4.00%
        description: 'Reduced operator property management compensation fee (4%)',
      },
    ];

    const v2Stakeholders: AgreementStakeholder[] = [
      {
        id: 'stk-v2-01',
        agreement_version_id: 'ver-meridian-001-v2',
        wallet_address: 'GBTY42VFL7XJ6Q7L35R62L4J7J5J67U4F26C6DVEOD6DGEGZ6E6DDEE5ABCD',
        name: 'Alice (Meridian Capital)',
        role: 'Majority Equity',
        basis_points: 4500, // adjusted to 45.00%
        has_approved: true,
        approved_at: '2026-10-06T14:00:00Z',
        approval_signature: 'sig_ed25519_alice_v2',
      },
      {
        id: 'stk-v2-02',
        agreement_version_id: 'ver-meridian-001-v2',
        wallet_address: 'GCDZ42VFL7XJ6Q7L35R62L4J7J5J67U4F26C6DVEOD6DGEGZ6E6DDEE5WXYZ',
        name: 'Bob (Apex Property Mgmt)',
        role: 'Operating Partner',
        basis_points: 3000, // adjusted to 30.00%
        has_approved: false, // pending
      },
      {
        id: 'stk-v2-03',
        agreement_version_id: 'ver-meridian-001-v2',
        wallet_address: 'GCVRQYZCRG6E4V7P6E4J67U4F26C6DVEOD6DGEGZ6E6DDEE5ABCDKLMN',
        name: 'Charlie (Strategic Investor)',
        role: 'Equity Participant',
        basis_points: 2500, // 25.00%
        has_approved: false, // pending
      },
    ];

    const v2Canonical = agreementHashingService.generateCanonicalRepresentation({
      property_id: propId,
      agreement_identifier: 'MERIDIAN-REV-001',
      version_number: 2,
      revenue_source: 'Rental Revenue',
      accepted_asset: 'USDC',
      effective_date: '2026-11-01',
      waterfall_rules: v2Rules,
      stakeholders: v2Stakeholders,
    });
    const v2Hash = agreementHashingService.computeAgreementHash(v2Canonical);

    const v2: DistributionAgreementVersion = {
      id: 'ver-meridian-001-v2',
      agreement_id: agreementId,
      version_number: 2,
      revenue_source: 'Rental Revenue',
      accepted_asset: 'USDC',
      effective_date: '2026-11-01',
      canonical_representation: v2Canonical,
      agreement_hash: v2Hash,
      status: 'PARTIALLY_APPROVED',
      created_at: '2026-10-05T08:00:00Z',
      waterfall_rules: v2Rules,
      stakeholders: v2Stakeholders,
      approvals: [
        {
          id: 'appr-v2-01',
          agreement_version_id: 'ver-meridian-001-v2',
          wallet_address: v2Stakeholders[0].wallet_address,
          agreement_hash: v2Hash,
          approval_type: 'STELLAR_WALLET',
          signature_or_proof: 'sig_alice_v2',
          timestamp: '2026-10-06T14:00:00Z',
        },
      ],
    };

    const agreement: DistributionAgreement = {
      id: agreementId,
      property_id: propId,
      agreement_identifier: 'MERIDIAN-REV-001',
      current_version: 2,
      status: 'LOCKED', // active authoritative version is v1
      created_by: 'GBTY42VFL7XJ6Q7L35R62L4J7J5J67U4F26C6DVEOD6DGEGZ6E6DDEE5ABCD',
      created_at: '2026-09-10T09:00:00Z',
      updated_at: '2026-10-06T14:00:00Z',
      versions: [v1, v2],
    };

    this.agreements.set(agreement.id, agreement);
    this.agreementVersions.set(v1.id, v1);
    this.agreementVersions.set(v2.id, v2);
  }

  // Property Queries
  getAllProperties(): Property[] {
    return Array.from(this.properties.values());
  }

  getPropertyById(id: string): Property | undefined {
    return this.properties.get(id);
  }

  getPropertyUnits(propertyId: string): PropertyUnit[] {
    return Array.from(this.units.values()).filter((u) => u.property_id === propertyId);
  }

  getPropertyParticipations(propertyId: string) {
    const records = Array.from(this.participations.values()).filter((p) => p.property_id === propertyId);
    return records.map((rec) => {
      const participant = this.participants.get(rec.participant_id);
      return {
        ...rec,
        participant,
      };
    });
  }

  // Blockchain Transactions
  getBlockchainTxByHash(hash: string): BlockchainTransaction | undefined {
    return this.blockchainTransactions.get(hash);
  }

  saveBlockchainTransaction(tx: BlockchainTransaction): BlockchainTransaction {
    this.blockchainTransactions.set(tx.transaction_hash, tx);
    return tx;
  }

  // Revenue Records
  getRevenueByProperty(propertyId: string): RevenueRecord[] {
    return Array.from(this.revenueRecords.values())
      .filter((r) => r.property_id === propertyId)
      .sort((a, b) => new Date(b.verified_at).getTime() - new Date(a.verified_at).getTime());
  }

  getRevenueByTxHash(hash: string): RevenueRecord | undefined {
    for (const r of this.revenueRecords.values()) {
      if (r.transaction_hash === hash) {
        return r;
      }
    }
    return undefined;
  }

  saveRevenueRecord(record: RevenueRecord): RevenueRecord {
    this.revenueRecords.set(record.id, record);
    return record;
  }

  getAllRevenueRecords(): RevenueRecord[] {
    return Array.from(this.revenueRecords.values());
  }

  // Audit Events
  recordAuditEvent(event: Omit<AuditEvent, 'id' | 'created_at'>): AuditEvent {
    const fullEvent: AuditEvent = {
      ...event,
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      created_at: new Date().toISOString(),
    };
    this.auditEvents.push(fullEvent);
    return fullEvent;
  }

  getAuditEvents(limit: number = 50): AuditEvent[] {
    return [...this.auditEvents].reverse().slice(0, limit);
  }

  // Reconciliation
  saveReconciliationReport(report: ReconciliationReport): ReconciliationReport {
    this.reconciliationReports.push(report);
    return report;
  }

  getLatestReconciliationReport(): ReconciliationReport | undefined {
    return this.reconciliationReports[this.reconciliationReports.length - 1];
  }

  // ==============================================================================
  // LEVEL 2: DISTRIBUTION AGREEMENT QUERIES & MUTATIONS
  // ==============================================================================

  getAgreementsByProperty(propertyId: string): DistributionAgreement[] {
    return Array.from(this.agreements.values()).filter((a) => a.property_id === propertyId);
  }

  getAgreementById(id: string): DistributionAgreement | undefined {
    return this.agreements.get(id);
  }

  getAgreementVersionById(versionId: string): DistributionAgreementVersion | undefined {
    return this.agreementVersions.get(versionId);
  }

  saveAgreement(agreement: DistributionAgreement): DistributionAgreement {
    this.agreements.set(agreement.id, agreement);
    return agreement;
  }

  saveAgreementVersion(version: DistributionAgreementVersion): DistributionAgreementVersion {
    this.agreementVersions.set(version.id, version);
    const agr = this.agreements.get(version.agreement_id);
    if (agr) {
      const idx = agr.versions.findIndex((v) => v.id === version.id);
      if (idx >= 0) {
        agr.versions[idx] = version;
      } else {
        agr.versions.push(version);
      }
      agr.current_version = Math.max(agr.current_version, version.version_number);
      agr.updated_at = new Date().toISOString();
      this.agreements.set(agr.id, agr);
    }
    return version;
  }
}

export const db = new InMemoryDatabase();
