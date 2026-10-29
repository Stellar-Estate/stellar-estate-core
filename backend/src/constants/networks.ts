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
    contractId: 'CAQCFV2AUUXA2RFYGI4HD4KSGYYEB5Q5OC54ZAWU4HBPWZ7AL64KLCPH',
    decimals: 7,
  },
  {
    code: 'XLM',
    native: true,
    decimals: 7,
  },
];

export const STROOPS_PER_XLM = 10_000_000;
