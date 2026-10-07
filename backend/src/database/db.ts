import {
  Property,
  PropertyUnit,
  Participant,
  PropertyParticipation,
  BlockchainTransaction,
  RevenueRecord,
  AuditEvent,
  ReconciliationReport,
} from './types.js';

class InMemoryDatabase {
  properties: Map<string, Property> = new Map();
  units: Map<string, PropertyUnit> = new Map();
  participants: Map<string, Participant> = new Map();
  participations: Map<string, PropertyParticipation> = new Map();
  blockchainTransactions: Map<string, BlockchainTransaction> = new Map();
  revenueRecords: Map<string, RevenueRecord> = new Map();
  auditEvents: AuditEvent[] = [];
  reconciliationReports: ReconciliationReport[] = [];

  constructor() {
    this.seedDefaultData();
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
      vault_stellar_address: 'GAU6PZRLYQZCRG6E4V7P6E4J67U4F26C6DVEOD6DGEGZ6E6DDEE5ABCD', // Vault address
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
      display_name: 'Meridian Capital Partners',
      role: 'OWNER',
      created_at: meridian.created_at,
    };
    const participantOperator: Participant = {
      id: 'part-operator-01',
      wallet_address: 'GCDZ42VFL7XJ6Q7L35R62L4J7J5J67U4F26C6DVEOD6DGEGZ6E6DDEE5WXYZ',
      display_name: 'Apex Property Management',
      role: 'OPERATOR',
      created_at: meridian.created_at,
    };
    this.participants.set(participantOwner.id, participantOwner);
    this.participants.set(participantOperator.id, participantOperator);

    // Participations
    this.participations.set('part-rel-01', {
      id: 'part-rel-01',
      property_id: meridian.id,
      participant_id: participantOwner.id,
      share_percentage: 75.0,
      role: 'MAJORITY_EQUITY',
      created_at: meridian.created_at,
    });
    this.participations.set('part-rel-02', {
      id: 'part-rel-02',
      property_id: meridian.id,
      participant_id: participantOperator.id,
      share_percentage: 25.0,
      role: 'OPERATING_PARTNER',
      created_at: meridian.created_at,
    });
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
}

export const db = new InMemoryDatabase();
