import { db } from '../database/db.js';
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
  Settlement,
} from '../database/types.js';

export interface DatabaseSnapshot {
  version: string;
  timestamp: string;
  stats: {
    propertyCount: number;
    unitCount: number;
    participantCount: number;
    revenueRecordCount: number;
    settlementCount: number;
    agreementCount: number;
    transactionCount: number;
    auditEventCount: number;
  };
  data: {
    properties: Property[];
    units: PropertyUnit[];
    participants: Participant[];
    participations: PropertyParticipation[];
    revenueRecords: RevenueRecord[];
    settlements: Settlement[];
    agreements: DistributionAgreement[];
    blockchainTransactions: BlockchainTransaction[];
    auditEvents: AuditEvent[];
    reconciliationReports: ReconciliationReport[];
    consumedRevenueIds: string[];
  };
}

export class DbBackupService {
  /**
   * Generates a complete serialized JSON snapshot of the in-memory database
   */
  public createBackup(): DatabaseSnapshot {
    const properties = Array.from(db.properties.values());
    const units = Array.from(db.units.values());
    const participants = Array.from(db.participants.values());
    const participations = Array.from(db.participations.values());
    const revenueRecords = Array.from(db.revenueRecords.values());
    const settlements = Array.from(db.settlements.values());
    const agreements = Array.from(db.agreements.values());
    const blockchainTransactions = Array.from(db.blockchainTransactions.values());
    const auditEvents = [...db.auditEvents];
    const reconciliationReports = [...db.reconciliationReports];
    const consumedRevenueIds = Array.from(db.consumedRevenueIds);

    const snapshot: DatabaseSnapshot = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      stats: {
        propertyCount: properties.length,
        unitCount: units.length,
        participantCount: participants.length,
        revenueRecordCount: revenueRecords.length,
        settlementCount: settlements.length,
        agreementCount: agreements.length,
        transactionCount: blockchainTransactions.length,
        auditEventCount: auditEvents.length,
      },
      data: {
        properties,
        units,
        participants,
        participations,
        revenueRecords,
        settlements,
        agreements,
        blockchainTransactions,
        auditEvents,
        reconciliationReports,
        consumedRevenueIds,
      },
    };

    return snapshot;
  }

  /**
   * Validates whether a provided object conforms to a valid DatabaseSnapshot
   */
  public validateSnapshot(data: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!data || typeof data !== 'object') {
      errors.push('Snapshot payload must be a non-null object');
      return { valid: false, errors };
    }

    if (data.version !== '1.0.0') {
      errors.push(`Unsupported or missing snapshot version: ${data.version}`);
    }

    if (!data.timestamp || isNaN(Date.parse(data.timestamp))) {
      errors.push('Snapshot timestamp is invalid or missing');
    }

    if (!data.data || typeof data.data !== 'object') {
      errors.push('Snapshot data container is missing');
    } else {
      if (!Array.isArray(data.data.properties)) errors.push('properties must be an array');
      if (!Array.isArray(data.data.settlements)) errors.push('settlements must be an array');
      if (!Array.isArray(data.data.agreements)) errors.push('agreements must be an array');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Restores state from a validated DatabaseSnapshot
   */
  public restoreFromSnapshot(snapshot: DatabaseSnapshot): { success: boolean; message: string } {
    const validation = this.validateSnapshot(snapshot);
    if (!validation.valid) {
      return { success: false, message: `Validation failed: ${validation.errors.join(', ')}` };
    }

    db.properties.clear();
    for (const p of snapshot.data.properties) db.properties.set(p.id, p);

    db.units.clear();
    for (const u of snapshot.data.units) db.units.set(u.id, u);

    db.participants.clear();
    for (const part of snapshot.data.participants) db.participants.set(part.id, part);

    db.participations.clear();
    for (const part of snapshot.data.participations) db.participations.set(part.id, part);

    db.revenueRecords.clear();
    for (const rev of snapshot.data.revenueRecords) db.revenueRecords.set(rev.id, rev);

    db.settlements.clear();
    for (const stl of snapshot.data.settlements) db.settlements.set(stl.id, stl);

    db.agreements.clear();
    for (const agr of snapshot.data.agreements) {
      db.agreements.set(agr.property_id, agr);
      for (const ver of agr.versions) {
        db.agreementVersions.set(`${agr.property_id}_v${ver.version_number || ver.version}`, ver);
      }
    }

    db.blockchainTransactions.clear();
    for (const tx of snapshot.data.blockchainTransactions) db.blockchainTransactions.set(tx.id, tx);

    db.auditEvents.length = 0;
    db.auditEvents.push(...snapshot.data.auditEvents);

    db.reconciliationReports.length = 0;
    db.reconciliationReports.push(...snapshot.data.reconciliationReports);

    db.consumedRevenueIds.clear();
    for (const id of snapshot.data.consumedRevenueIds) db.consumedRevenueIds.add(id);

    return {
      success: true,
      message: `Database successfully restored from snapshot at ${snapshot.timestamp}`,
    };
  }
}

export const dbBackupService = new DbBackupService();
