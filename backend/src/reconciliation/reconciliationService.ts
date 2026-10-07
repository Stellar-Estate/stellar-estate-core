import { db } from '../database/db.js';
import { ReconciliationReport } from '../database/types.js';

export interface DiscrepancyItem {
  type: 'AMOUNT_MISMATCH' | 'ORPHAN_TX' | 'UNVERIFIED_REVENUE' | 'DUPLICATE_TX' | 'SETTLEMENT_MISMATCH';
  description: string;
  transactionHash?: string;
  revenueId?: string;
  settlementId?: string;
  details: Record<string, any>;
}

export class ReconciliationService {
  /**
   * Run full reconciliation across recorded blockchain transactions, revenue entries, and settlements
   */
  async runReconciliation(): Promise<ReconciliationReport> {
    const allRevenue = db.getAllRevenueRecords();
    const allSettlements = db.getAllSettlements();
    const discrepancies: DiscrepancyItem[] = [];

    const txMap = new Map<string, number>();

    // 1. Reconcile Revenue Records with Blockchain Payments
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

    // 2. Reconcile Settlements with On-Chain Payout Transactions
    for (const stl of allSettlements) {
      let settlementMismatch = false;
      let totalActualPayouts = 0;

      for (const payout of stl.payouts) {
        if (payout.transaction_hash) {
          const pTx = db.getBlockchainTxByHash(payout.transaction_hash);
          if (!pTx) {
            discrepancies.push({
              type: 'SETTLEMENT_MISMATCH',
              description: `Settlement ${stl.id} payout to ${payout.recipient_address} has unverified tx hash ${payout.transaction_hash}.`,
              transactionHash: payout.transaction_hash,
              settlementId: stl.id,
              details: { payout },
            });
            settlementMismatch = true;
          } else if (Math.abs(pTx.amount - payout.actual_amount) > 0.000001) {
            discrepancies.push({
              type: 'SETTLEMENT_MISMATCH',
              description: `Settlement ${stl.id} payout amount (${payout.actual_amount}) differs from on-chain tx (${pTx.amount}).`,
              transactionHash: payout.transaction_hash,
              settlementId: stl.id,
              details: { payout, onChainAmount: pTx.amount },
            });
            settlementMismatch = true;
          } else {
            payout.reconciled = true;
            totalActualPayouts += payout.actual_amount;
          }
        }
      }

      // Check sum(payouts) == distributable_amount
      if (Math.abs(totalActualPayouts - stl.distributable_amount) > 0.000001) {
        discrepancies.push({
          type: 'SETTLEMENT_MISMATCH',
          description: `Settlement ${stl.id} total actual payouts (${totalActualPayouts}) does not equal distributable amount (${stl.distributable_amount}).`,
          settlementId: stl.id,
          details: { totalActualPayouts, distributableAmount: stl.distributable_amount },
        });
        settlementMismatch = true;
      }

      if (settlementMismatch) {
        stl.reconciliation_status = 'DISCREPANCY';
        stl.status = 'RECONCILIATION_REQUIRED';
      } else {
        stl.reconciliation_status = 'MATCHED';
        if (stl.status === 'SETTLED') {
          stl.status = 'RECONCILED';
          stl.reconciled_at = new Date().toISOString();
        }
      }
      db.saveSettlement(stl);
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
        settlements_checked: allSettlements.length,
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
        settlementsCount: allSettlements.length,
      },
    });

    return report;
  }
}

export const reconciliationService = new ReconciliationService();
