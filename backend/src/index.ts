import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { apiRouter } from './api/routes.js';

dotenv.config();

export const app = express();
const PORT = process.env.PORT || 4000;

// Security & Utility Middleware
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// Core Root Route & Health
app.get('/', (req, res) => {
  res.json({
    service: 'Stellar Estate Financial Core Backend',
    version: '1.0.0',
    network: 'Stellar Testnet',
    status: 'OPERATIONAL',
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
  });
});

// Mount API routes
app.use('/api', apiRouter);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Stellar Estate Core Error]:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error',
  });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`🚀 Stellar Estate Core Backend running on http://localhost:${PORT}`);
    console.log(`📡 Connected to Stellar Testnet Horizon (Independent Verification Engine)`);
  });
}
