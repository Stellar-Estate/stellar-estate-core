import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config.js';
import { apiRouter } from './api/routes.js';
import { correlationIdMiddleware, apiRateLimiter } from './middleware/security.js';
import { errorHandler } from './middleware/errorHandler.js';
import { openApiSpec } from './api/openapi.js';
import { lifecycleService } from './services/lifecycleService.js';

export const app = express();
const PORT = config.PORT;

// Security & Utility Middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", 'https://horizon-testnet.stellar.org', 'https://friendbot.stellar.org'],
        imgSrc: ["'self'", 'data:', 'https:'],
        scriptSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

const corsWhitelist = config.CORS_ORIGIN.split(',').map((o) => o.trim());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser requests (mobile wallets, curls, automated tests)
      if (!origin) return callback(null, true);
      if (config.CORS_ORIGIN === '*' || corsWhitelist.includes(origin) || corsWhitelist.includes('*')) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} not permitted by Stellar Estate CORS policy`));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(correlationIdMiddleware);

if (config.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Core Root Route & Health
app.get('/', (req, res) => {
  res.json({
    service: 'Stellar Estate Financial Core Backend',
    version: '1.0.0',
    network: `Stellar ${config.STELLAR_NETWORK}`,
    status: 'OPERATIONAL',
    correlationId: req.correlationId,
    documentation: '/docs',
    endpoints: {
      properties: '/api/properties',
      initiate_deposit: 'POST /api/revenue/initiate',
      verify_deposit: 'POST /api/revenue/verify',
      reconciliation: '/api/reconciliation/report',
      network: '/api/blockchain/network',
    },
  });
});

app.get('/api/health', (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    correlationId: req.correlationId,
    network: config.STELLAR_NETWORK,
    memory: {
      rssMb: Math.round(mem.rss / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
    },
    horizon: {
      url: config.STELLAR_HORIZON_URL,
      network: config.STELLAR_NETWORK,
      status: 'CONNECTED',
    },
    process: {
      pid: process.pid,
      nodeVersion: process.version,
    },
  });
});

app.get('/api/docs/openapi.json', (req, res) => {
  res.json(openApiSpec);
});

app.get('/docs', (req, res) => {
  res.redirect('/api/docs/openapi.json');
});

// Apply rate limiting to all /api routes
app.use('/api', apiRateLimiter);

// Mount API routes
app.use('/api', apiRouter);

// Global Standardized Error Handler
app.use(errorHandler);

if (config.NODE_ENV !== 'test') {
  const server = app.listen(PORT, () => {
    console.log(`🚀 Stellar Estate Core Backend running on http://localhost:${PORT}`);
    console.log(`📡 Connected to Stellar ${config.STELLAR_NETWORK} Horizon (${config.STELLAR_HORIZON_URL})`);
  });
  lifecycleService.setupSignalListeners(server);
}
