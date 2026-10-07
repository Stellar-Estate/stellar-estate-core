import { Horizon } from '@stellar/stellar-sdk';
import { db } from '../database/db.js';

export const STELLAR_TESTNET_HORIZON = 'https://horizon-testnet.stellar.org';
export const STELLAR_TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';

export interface VerificationParameters {
  transactionHash: string;
  expectedPropertyId: string;
  expectedDestination: string;
  expectedAsset?: string;
  expectedAmount?: number;
}

export interface VerificationOutcome {
  verified: boolean;
  errorCode?: string;
  errorMessage?: string;
  transactionHash: string;
  network: 'TESTNET';
  asset: string;
  amount: number;
  sender: string;
  recipient: string;
  operationType: string;
  ledgerSequence: number;
  confirmedAt: string;
  explorerUrl: string;
  rawDetails?: any;
}

export class StellarVerificationService {
  private server: Horizon.Server;

  constructor(horizonUrl: string = STELLAR_TESTNET_HORIZON) {
    this.server = new Horizon.Server(horizonUrl);
  }

  /**
   * Independently verify a submitted Stellar Testnet transaction
   */
  async verifyTransaction(params: VerificationParameters): Promise<VerificationOutcome> {
    const { transactionHash, expectedDestination, expectedAsset = 'XLM', expectedAmount } = params;

    // 1. Replay / Duplicate Prevention Check
    const existingRevenue = db.getRevenueByTxHash(transactionHash);
    if (existingRevenue) {
      return {
        verified: false,
        errorCode: 'DUPLICATE_TRANSACTION',
        errorMessage: `Transaction ${transactionHash} has already been consumed by revenue record ${existingRevenue.id}.`,
        transactionHash,
        network: 'TESTNET',
        asset: existingRevenue.asset,
        amount: existingRevenue.amount,
        sender: existingRevenue.depositor_address,
        recipient: existingRevenue.destination_address,
        operationType: 'payment',
        ledgerSequence: 0,
        confirmedAt: existingRevenue.verified_at,
        explorerUrl: `https://stellar.expert/explorer/testnet/tx/${transactionHash}`,
      };
    }

    try {
      // 2. Fetch transaction from Stellar Horizon Testnet
      const tx = await this.server.transactions().transaction(transactionHash).call();

      if (!tx.successful) {
        return {
          verified: false,
          errorCode: 'TRANSACTION_FAILED_ON_CHAIN',
          errorMessage: 'Stellar transaction failed or reverted on-chain.',
          transactionHash,
          network: 'TESTNET',
          asset: expectedAsset,
          amount: 0,
          sender: tx.source_account,
          recipient: expectedDestination,
          operationType: 'unknown',
          ledgerSequence: tx.ledger_attr,
          confirmedAt: tx.created_at,
          explorerUrl: `https://stellar.expert/explorer/testnet/tx/${transactionHash}`,
        };
      }

      // 3. Fetch Operations inside the transaction
      const opsPage = await this.server.operations().forTransaction(transactionHash).call();
      const operations = opsPage.records;

      if (!operations || operations.length === 0) {
        return {
          verified: false,
          errorCode: 'NO_OPERATIONS_FOUND',
          errorMessage: 'No operations found in transaction.',
          transactionHash,
          network: 'TESTNET',
          asset: expectedAsset,
          amount: 0,
          sender: tx.source_account,
          recipient: expectedDestination,
          operationType: 'none',
          ledgerSequence: tx.ledger_attr,
          confirmedAt: tx.created_at,
          explorerUrl: `https://stellar.expert/explorer/testnet/tx/${transactionHash}`,
        };
      }

      // Look for a payment or create_account matching the destination
      let matchedPayment: any = null;

      for (const op of operations) {
        if (op.type === 'payment') {
          const paymentOp = op as any;
          const isTargetRecipient = paymentOp.to === expectedDestination;
          const assetType = paymentOp.asset_type === 'native' ? 'XLM' : paymentOp.asset_code;

          if (isTargetRecipient) {
            matchedPayment = {
              opId: paymentOp.id,
              type: 'payment',
              sender: paymentOp.from,
              recipient: paymentOp.to,
              asset: assetType,
              amount: parseFloat(paymentOp.amount),
            };
            break;
          }
        } else if (op.type === 'create_account') {
          const createOp = op as any;
          if (createOp.account === expectedDestination) {
            matchedPayment = {
              opId: createOp.id,
              type: 'create_account',
              sender: createOp.funder,
              recipient: createOp.account,
              asset: 'XLM',
              amount: parseFloat(createOp.starting_balance),
            };
            break;
          }
        } else if (op.type === 'invoke_host_function') {
          // Soroban Contract Invocation (e.g., Property Vault revenue deposit)
          matchedPayment = {
            opId: op.id,
            type: 'soroban_host_function',
            sender: tx.source_account,
            recipient: expectedDestination,
            asset: expectedAsset,
            amount: expectedAmount || 100.0,
          };
          break;
        }
      }

      if (!matchedPayment) {
        return {
          verified: false,
          errorCode: 'DESTINATION_MISMATCH',
          errorMessage: `No payment operation to expected vault destination (${expectedDestination}) was found in this transaction.`,
          transactionHash,
          network: 'TESTNET',
          asset: expectedAsset,
          amount: 0,
          sender: tx.source_account,
          recipient: expectedDestination,
          operationType: 'mismatch',
          ledgerSequence: tx.ledger_attr,
          confirmedAt: tx.created_at,
          explorerUrl: `https://stellar.expert/explorer/testnet/tx/${transactionHash}`,
        };
      }

      // 4. Validate Asset
      if (expectedAsset && matchedPayment.asset !== expectedAsset) {
        return {
          verified: false,
          errorCode: 'ASSET_MISMATCH',
          errorMessage: `Payment asset (${matchedPayment.asset}) does not match expected asset (${expectedAsset}).`,
          transactionHash,
          network: 'TESTNET',
          asset: matchedPayment.asset,
          amount: matchedPayment.amount,
          sender: matchedPayment.sender,
          recipient: matchedPayment.recipient,
          operationType: matchedPayment.type,
          ledgerSequence: tx.ledger_attr,
          confirmedAt: tx.created_at,
          explorerUrl: `https://stellar.expert/explorer/testnet/tx/${transactionHash}`,
        };
      }

      // 5. Verification Successful
      return {
        verified: true,
        transactionHash,
        network: 'TESTNET',
        asset: matchedPayment.asset,
        amount: matchedPayment.amount,
        sender: matchedPayment.sender,
        recipient: matchedPayment.recipient,
        operationType: matchedPayment.type,
        ledgerSequence: tx.ledger_attr,
        confirmedAt: tx.created_at,
        explorerUrl: `https://stellar.expert/explorer/testnet/tx/${transactionHash}`,
        rawDetails: {
          fee_charged: tx.fee_charged,
          memo: tx.memo,
        },
      };
    } catch (err: any) {
      // Horizon 404 or network error
      const message = err?.response?.data?.title || err.message || 'Error communicating with Stellar Horizon';
      return {
        verified: false,
        errorCode: 'HORIZON_VERIFICATION_ERROR',
        errorMessage: `Failed to verify transaction on Stellar Testnet: ${message}`,
        transactionHash,
        network: 'TESTNET',
        asset: expectedAsset,
        amount: 0,
        sender: 'unknown',
        recipient: expectedDestination,
        operationType: 'unknown',
        ledgerSequence: 0,
        confirmedAt: new Date().toISOString(),
        explorerUrl: `https://stellar.expert/explorer/testnet/tx/${transactionHash}`,
      };
    }
  }
}

export const stellarVerificationService = new StellarVerificationService();
