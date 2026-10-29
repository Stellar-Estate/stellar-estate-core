import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { lifecycleService } from './lifecycleService.js';

export interface LedgerSyncState {
  sequence: number;
  syncedAt: string;
  network: string;
  horizonUrl: string;
}

export class LedgerTrackerService {
  private currentSequence: number = 1000000;
  private lastSyncedAt: string = new Date().toISOString();
  private timer: NodeJS.Timeout | null = null;
  private isTracking = false;

  constructor() {
    lifecycleService.registerCleanup('ledger-tracker', () => {
      this.stop();
    });
  }

  async fetchLatestLedger(): Promise<number> {
    try {
      const response = await fetch(`${config.STELLAR_HORIZON_URL}/`, {
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const data = (await response.json()) as any;
        const seq = data.core_latest_ledger || data.history_latest_ledger;
        if (seq && typeof seq === 'number') {
          this.currentSequence = seq;
          this.lastSyncedAt = new Date().toISOString();
          return seq;
        }
      }
    } catch (err: any) {
      logger.warn(`Failed to fetch latest ledger from Horizon: ${err?.message || err}`);
    }
    return this.currentSequence;
  }

  start(intervalMs: number = 15000): void {
    if (this.isTracking) return;
    this.isTracking = true;
    void this.fetchLatestLedger();
    this.timer = setInterval(() => {
      void this.fetchLatestLedger();
    }, intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isTracking = false;
  }

  getState(): LedgerSyncState {
    return {
      sequence: this.currentSequence,
      syncedAt: this.lastSyncedAt,
      network: config.STELLAR_NETWORK,
      horizonUrl: config.STELLAR_HORIZON_URL,
    };
  }

  getLatestSequence(): number {
    return this.currentSequence;
  }

  setMockSequence(seq: number): void {
    this.currentSequence = seq;
    this.lastSyncedAt = new Date().toISOString();
  }
}

export const ledgerTrackerService = new LedgerTrackerService();
