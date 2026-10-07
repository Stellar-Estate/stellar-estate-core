import { db } from '../database/db.js';
import { ReconciliationReport } from '../database/types.js';

export interface DiscrepancyItem {
  type: 'AMOUNT_MISMATCH' | 'ORPHAN_TX' | 'UNVERIFIED_REVENUE' | 'DUPLICATE_TX';
  description: string;
  transactionHash?: string;
  revenueId?: string;
  details: Record<string, any>;
}

export class ReconciliationService {
  /**
   * Run full reconciliation between recorded blockchain transactions and property revenue entries
   */
  async runReconciliation(): Promise<ReconciliationReport> {
    const allRevenue = db.getAllRevenueRecords();
    const discrepancies: DiscrepancyItem[] = [];

    const txMap = new Map<string, number>();

    // Check for duplicate transaction usage across revenue records
    for (const rev of allRevenue) {
      const count = (txMap.get(rev.transaction_hash) || 0) + 1;
      txMap.set(rev.transaction_hash, count);
      if (count > 1) {
        discrepancies.push({
          type: 'DUPLICATE_TX',
          description: `Transaction ${rev.transaction_hash} is attached to multiple revenue records.`,
          transactionHash: rev.transaction_hash,
          revenueId: rev.id,
          details: { count },
        });
      }

      // Check for corresponding blockchain transaction record
      const bTx = db.getBlockchainTxByHash(rev.transaction_hash);
      if (!bTx) {
        discrepancies.push({
          type: 'UNVERIFIED_REVENUE',
          description: `Revenue record ${rev.id} has no matching verified blockchain transaction entity.`,
          transactionHash: rev.transaction_hash,
          revenueId: rev.id,
          details: { revenueRecord: rev },
        });
      } else {
        // Compare amounts
        if (Math.abs(bTx.amount - rev.amount) > 0.000001) {
          discrepancies.push({
            type: 'AMOUNT_MISMATCH',
            description: `Amount in revenue record (${rev.amount}) does not match verified blockchain transaction (${bTx.amount}).`,
            transactionHash: rev.transaction_hash,
            revenueId: rev.id,
            details: { recordedAmount: rev.amount, blockchainAmount: bTx.amount },
          });
        }
      }
    }

    const report: ReconciliationReport = {
      id: `recon-${Date.now()}`,
      run_timestamp: new Date().toISOString(),
      total_onchain_transactions: db.blockchainTransactions.size,
      total_recorded_revenue: allRevenue.length,
      discrepancies_found: discrepancies.length,
      status: discrepancies.length === 0 ? 'BALANCED' : 'DISCREPANCY_DETECTED',
      details: {
        discrepancies,
        balanced: discrepancies.length === 0,
        reconciled_at: new Date().toISOString(),
      },
    };

    db.saveReconciliationReport(report);
    db.recordAuditEvent({
      event_type: 'RECONCILIATION_RUN',
      entity_type: 'FINANCIAL_SYSTEM',
      entity_id: report.id,
      payload: {
        status: report.status,
        discrepanciesCount: discrepancies.length,
      },
    });

    return report;
  }
}

export const reconciliationService = new ReconciliationService();
