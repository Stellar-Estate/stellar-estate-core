/**
 * Centralized Stellar Network Constants & Asset Specifications
 */

export interface NetworkConfig {
  name: string;
  networkPassphrase: string;
  horizonUrl: string;
  rpcUrl: string;
  friendbotUrl?: string;
  explorerUrl: string;
  protocolVersion: number;
  baseFeeStroops: number;
}

export const STELLAR_NETWORKS: Record<'TESTNET' | 'PUBLIC', NetworkConfig> = {
  TESTNET: {
    name: 'Stellar Testnet',
    networkPassphrase: 'Test SDF Network ; September 2015',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    friendbotUrl: 'https://friendbot.stellar.org',
    explorerUrl: 'https://stellar.expert/explorer/testnet',
    protocolVersion: 22,
    baseFeeStroops: 100,
  },
  PUBLIC: {
    name: 'Stellar Public Network',
    networkPassphrase: 'Public Global Stellar Network ; September 2015',
    horizonUrl: 'https://horizon.stellar.org',
    rpcUrl: 'https://soroban-rpc.stellar.org',
    explorerUrl: 'https://stellar.expert/explorer/public',
    protocolVersion: 22,
    baseFeeStroops: 100,
  },
};

export const DEFAULT_ACCEPTED_ASSETS = [
  {
    code: 'USDC',
    issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    contractId: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
    decimals: 7,
  },
  {
    code: 'XLM',
    contractId: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
    native: true,
    decimals: 7,
  },
];

export const STROOPS_PER_XLM = 10_000_000;
