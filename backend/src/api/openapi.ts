/**
 * Stellar Estate Core Backend — OpenAPI 3.0 Specification
 */

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Stellar Estate Financial Core Backend API',
    version: '1.0.0',
    description:
      'Programmable real-estate revenue distribution and settlement platform built on Stellar Testnet and Soroban smart contracts.',
    contact: {
      name: 'Stellar Estate Engineering',
      url: 'https://github.com/Stellar-Estate',
    },
    license: {
      name: 'Apache-2.0',
      url: 'https://www.apache.org/licenses/LICENSE-2.0.html',
    },
  },
  servers: [
    {
      url: 'http://localhost:3001',
      description: 'Local Development Server',
    },
    {
      url: 'https://api.stellar-estate.org',
      description: 'Stellar Testnet Deployment',
    },
  ],
  paths: {
    '/api/health': {
      get: {
        summary: 'Health and Telemetry Check',
        description: 'Returns real-time node memory usage, process uptime, and Stellar Horizon connectivity.',
        responses: {
          '200': {
            description: 'Service operational',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'healthy' },
                    uptime: { type: 'number' },
                    network: { type: 'string', example: 'TESTNET' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/properties': {
      get: {
        summary: 'List Registered Properties',
        description: 'Returns all property portfolios with underlying Soroban vault contract addresses and financial summaries.',
        responses: {
          '200': {
            description: 'List of properties',
          },
        },
      },
    },
    '/api/revenue/initiate': {
      post: {
        summary: 'Initiate Revenue Deposit',
        description: 'Creates a verified deposit intent and generates a SEP-0007 web+stellar:pay URI.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['propertyId', 'source', 'amount'],
                properties: {
                  propertyId: { type: 'string' },
                  source: { type: 'string' },
                  amount: { type: 'number' },
                  asset: { type: 'string', default: 'XLM' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Deposit intent created' },
        },
      },
    },
    '/api/revenue/verify': {
      post: {
        summary: 'Verify Deposit On-Chain',
        description: 'Independently checks Stellar Horizon for confirmed payment transaction hash.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['propertyId', 'transactionHash'],
                properties: {
                  propertyId: { type: 'string' },
                  transactionHash: { type: 'string', minLength: 64, maxLength: 64 },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Transaction verification outcome' },
        },
      },
    },
    '/api/faucet': {
      post: {
        summary: 'Friendbot Testnet Faucet Trigger',
        description: 'Requests 10,000 Testnet XLM for a valid Ed25519 public key.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['address'],
                properties: {
                  address: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Account funded successfully' },
        },
      },
    },
  },
};
