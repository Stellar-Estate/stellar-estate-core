import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config.js';
import { apiRouter } from './api/routes.js';
import { correlationIdMiddleware, apiRateLimiter } from './middleware/security.js';
import { errorHandler } from './middleware/errorHandler.js';

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

app.use(
  cors({
    origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN,
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
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    correlationId: req.correlationId,
    network: config.STELLAR_NETWORK,
  });
});

// Apply rate limiting to all /api routes
app.use('/api', apiRateLimiter);

// Mount API routes
app.use('/api', apiRouter);

// Global Standardized Error Handler
app.use(errorHandler);

if (config.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`🚀 Stellar Estate Core Backend running on http://localhost:${PORT}`);
    console.log(`📡 Connected to Stellar ${config.STELLAR_NETWORK} Horizon (${config.STELLAR_HORIZON_URL})`);
  });
}
