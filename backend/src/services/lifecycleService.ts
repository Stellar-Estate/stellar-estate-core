import type { Server } from 'http';
import { logger } from '../utils/logger.js';

type CleanupHandler = () => Promise<void> | void;

export class LifecycleService {
  private handlers: Map<string, CleanupHandler> = new Map();
  private isShuttingDown = false;
  private server: Server | null = null;

  registerCleanup(name: string, handler: CleanupHandler): void {
    this.handlers.set(name, handler);
  }

  unregisterCleanup(name: string): void {
    this.handlers.delete(name);
  }

  setServer(server: Server): void {
    this.server = server;
  }

  async executeShutdown(signal: string = 'SIGTERM'): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;
    logger.info(`Received ${signal}. Initiating graceful shutdown...`);

    const timeout = setTimeout(() => {
      logger.error('Graceful shutdown timed out after 5000ms. Forcing process exit.');
      if (process.env.NODE_ENV !== 'test') {
        process.exit(1);
      }
    }, 5000);
    timeout.unref();

    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close((err) => {
          if (err) logger.warn(`Error while closing HTTP server: ${err.message}`);
          else logger.info('HTTP server closed successfully.');
          resolve();
        });
      });
    }

    for (const [name, handler] of this.handlers.entries()) {
      try {
        logger.info(`Executing cleanup task: ${name}`);
        await handler();
      } catch (err: any) {
        logger.error(`Error during cleanup task '${name}': ${err?.message || err}`);
      }
    }

    clearTimeout(timeout);
    logger.info('Graceful shutdown complete.');
    if (process.env.NODE_ENV !== 'test') {
      process.exit(0);
    }
  }

  setupSignalListeners(server?: Server): void {
    if (server) this.setServer(server);
    if (process.env.NODE_ENV === 'test') return;

    process.on('SIGTERM', () => void this.executeShutdown('SIGTERM'));
    process.on('SIGINT', () => void this.executeShutdown('SIGINT'));
  }
}

export const lifecycleService = new LifecycleService();
