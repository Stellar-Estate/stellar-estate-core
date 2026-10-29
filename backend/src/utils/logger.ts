import { Request, Response, NextFunction } from 'express';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  correlationId?: string;
  service?: string;
  meta?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export class Logger {
  private serviceName: string;
  private minLevel: LogLevel;

  constructor(serviceName = 'stellar-estate-core', minLevel: LogLevel = 'info') {
    this.serviceName = serviceName;
    this.minLevel = (process.env.LOG_LEVEL as LogLevel) || minLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.minLevel];
  }

  private formatEntry(level: LogLevel, message: string, meta?: Record<string, any>, err?: Error): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.serviceName,
    };

    if (meta) {
      if (meta.correlationId) {
        entry.correlationId = meta.correlationId;
        const { correlationId, ...rest } = meta;
        if (Object.keys(rest).length > 0) entry.meta = rest;
      } else {
        entry.meta = meta;
      }
    }

    if (err) {
      entry.error = {
        name: err.name,
        message: err.message,
        stack: err.stack,
      };
    }

    return entry;
  }

  private output(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) return;

    if (process.env.NODE_ENV === 'test') {
      // In test runner, suppress noise unless DEBUG is explicitly set
      if (process.env.DEBUG) {
        console.log(`[${entry.level.toUpperCase()}] ${entry.message}`);
      }
      return;
    }

    // JSON formatted log output for structured observability (CloudWatch / Datadog / GCP)
    const jsonStr = JSON.stringify(entry);
    if (entry.level === 'error') {
      console.error(jsonStr);
    } else if (entry.level === 'warn') {
      console.warn(jsonStr);
    } else {
      console.log(jsonStr);
    }
  }

  info(message: string, meta?: Record<string, any>): void {
    this.output(this.formatEntry('info', message, meta));
  }

  warn(message: string, meta?: Record<string, any>): void {
    this.output(this.formatEntry('warn', message, meta));
  }

  debug(message: string, meta?: Record<string, any>): void {
    this.output(this.formatEntry('debug', message, meta));
  }

  error(message: string, err?: Error | unknown, meta?: Record<string, any>): void {
    const errorObj = err instanceof Error ? err : typeof err === 'string' ? new Error(err) : undefined;
    this.output(this.formatEntry('error', message, meta, errorObj));
  }

  /**
   * Express middleware for logging HTTP request lifecycles
   */
  requestLogger() {
    return (req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      const correlationId = (req as any).correlationId;

      res.on('finish', () => {
        const durationMs = Date.now() - startTime;
        const statusCode = res.statusCode;
        const level: LogLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

        if (this.shouldLog(level)) {
          this.output(
            this.formatEntry(
              level,
              `${req.method} ${req.originalUrl || req.url} ${statusCode} - ${durationMs}ms`,
              {
                correlationId,
                method: req.method,
                url: req.originalUrl || req.url,
                statusCode,
                durationMs,
                ip: req.ip,
              }
            )
          );
        }
      });

      next();
    };
  }
}

export const logger = new Logger();
