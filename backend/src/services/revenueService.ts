import { db } from '../database/db.js';
import { stellarVerificationService, VerificationOutcome } from './stellarVerificationService.js';
import { BlockchainTransaction, RevenueRecord } from '../database/types.js';

export interface DepositIntentRequest {
  propertyId: string;
  source: string;
  amount: number;
  asset?: string;
  depositorAddress?: string;
}

export interface DepositIntentResponse {
  intentId: string;
  propertyId: string;
  propertyName: string;
  destinationVaultAddress: string;
  acceptedAsset: string;
  suggestedAmount: number;
  network: 'TESTNET';
  instructions: string;
}

export interface VerifyDepositRequest {
  propertyId: string;
  transactionHash: string;
  source?: string;
  depositorAddress?: string;
}

export class RevenueService {
  /**
   * Initiate a deposit intent for a property
   */
  createDepositIntent(req: DepositIntentRequest): DepositIntentResponse {
    const property = db.getPropertyById(req.propertyId);
    if (!property) {
      throw new Error(`Property not found with id: ${req.propertyId}`);
    }

    const intentId = `intent-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    db.recordAuditEvent({
      event_type: 'DEPOSIT_INTENT_CREATED',
      entity_type: 'PROPERTY',
      entity_id: property.id,
      actor_address: req.depositorAddress,
      payload: {
        intentId,
        amount: req.amount,
        source: req.source,
        destination: property.vault_stellar_address,
      },
    });

    return {
      intentId,
      propertyId: property.id,
      propertyName: property.name,
      destinationVaultAddress: property.vault_stellar_address,
      acceptedAsset: req.asset || 'XLM',
      suggestedAmount: req.amount,
      network: 'TESTNET',
      instructions: `Submit a payment transaction of ${req.amount} ${req.asset || 'XLM'} on Stellar Testnet to vault ${property.vault_stellar_address}`,
    };
  }

  /**
   * Process independent blockchain verification and persist revenue record
   */
  async verifyAndRecordRevenue(req: VerifyDepositRequest): Promise<{
    success: boolean;
    verification: VerificationOutcome;
    revenueRecord?: RevenueRecord;
    message: string;
  }> {
    const property = db.getPropertyById(req.propertyId);
    if (!property) {
      throw new Error(`Property not found with id: ${req.propertyId}`);
    }

    // Call Stellar Horizon Testnet verifier
    const verification = await stellarVerificationService.verifyTransaction({
      transactionHash: req.transactionHash,
      expectedPropertyId: property.id,
      expectedDestination: property.vault_stellar_address,
      expectedAsset: 'XLM',
    });

    if (!verification.verified) {
      db.recordAuditEvent({
        event_type: 'VERIFICATION_FAILED',
        entity_type: 'PROPERTY',
        entity_id: property.id,
        actor_address: req.depositorAddress,
        payload: {
          transactionHash: req.transactionHash,
          errorCode: verification.errorCode,
          errorMessage: verification.errorMessage,
        },
      });

      return {
        success: false,
        verification,
        message: verification.errorMessage || 'Transaction verification failed on Stellar Testnet.',
      };
    }

    // 1. Persist BlockchainTransaction
    const bTx: BlockchainTransaction = {
      id: `btx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      transaction_hash: verification.transactionHash,
      network: 'TESTNET',
      asset: verification.asset,
      amount: verification.amount,
      sender: verification.sender,
      recipient: verification.recipient,
      operation_type: verification.operationType,
      status: 'SUCCESS',
      ledger_sequence: verification.ledgerSequence,
      verification_result: {
        verified: true,
        network: 'TESTNET',
        rawDetails: verification.rawDetails,
      },
      confirmed_at: verification.confirmedAt,
      created_at: new Date().toISOString(),
    };
    db.saveBlockchainTransaction(bTx);

    // 2. Persist RevenueRecord
    const revRecord: RevenueRecord = {
      id: `rev-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      property_id: property.id,
      source: req.source || 'RENTAL_REVENUE',
      amount: verification.amount,
      asset: verification.asset,
      transaction_hash: verification.transactionHash,
      depositor_address: verification.sender,
      destination_address: verification.recipient,
      status: 'CONFIRMED',
      verified_at: verification.confirmedAt,
      metadata: {
        ledger: verification.ledgerSequence,
        explorerUrl: verification.explorerUrl,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.saveRevenueRecord(revRecord);

    // 3. Log Audit Event
    db.recordAuditEvent({
      event_type: 'REVENUE_CONFIRMED',
      entity_type: 'PROPERTY',
      entity_id: property.id,
      actor_address: verification.sender,
      payload: {
        revenueId: revRecord.id,
        amount: revRecord.amount,
        asset: revRecord.asset,
        txHash: revRecord.transaction_hash,
        vault: revRecord.destination_address,
      },
    });

    return {
      success: true,
      verification,
      revenueRecord: revRecord,
      message: 'Revenue payment successfully verified on Stellar Testnet and recorded in property financials.',
    };
  }

  /**
   * Get property revenue history
   */
  getPropertyRevenueHistory(propertyId: string) {
    const property = db.getPropertyById(propertyId);
    if (!property) {
      throw new Error(`Property not found with id: ${propertyId}`);
    }

    const records = db.getRevenueByProperty(propertyId);
    const totalRevenue = records.reduce((sum, r) => sum + r.amount, 0);

    return {
      propertyId: property.id,
      propertyName: property.name,
      vaultAddress: property.vault_stellar_address,
      totalRevenueConfirmed: totalRevenue,
      transactionCount: records.length,
      records,
    };
  }
}

export const revenueService = new RevenueService();
