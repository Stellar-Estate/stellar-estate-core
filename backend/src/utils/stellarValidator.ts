import { StrKey } from '@stellar/stellar-sdk';

/**
 * Validates whether a string is a valid Stellar G... public key (Ed25519)
 */
export function isValidStellarAddress(address: string): boolean {
  if (!address || typeof address !== 'string') return false;
  try {
    return StrKey.isValidEd25519PublicKey(address);
  } catch {
    return false;
  }
}

/**
 * Validates whether a string is a valid Soroban C... contract address
 */
export function isValidContractAddress(address: string): boolean {
  if (!address || typeof address !== 'string') return false;
  try {
    return StrKey.isValidContract(address);
  } catch {
    return false;
  }
}

/**
 * Validates whether a string is either a valid Stellar account or contract ID
 */
export function isValidStellarAccountOrContract(id: string): boolean {
  return isValidStellarAddress(id) || isValidContractAddress(id);
}

/**
 * Validates whether a string is a 64-character hexadecimal Stellar transaction hash
 */
export function isValidTransactionHash(hash: string): boolean {
  if (!hash || typeof hash !== 'string') return false;
  return /^[0-9a-fA-F]{64}$/.test(hash);
}

export type StellarKeyType =
  | 'ED25519_PUBLIC_KEY'
  | 'SOROBAN_CONTRACT'
  | 'ED25519_SECRET_SEED'
  | 'MUXED_ACCOUNT'
  | 'SIGNED_PAYLOAD'
  | 'UNKNOWN';

export interface KeyClassification {
  valid: boolean;
  type: StellarKeyType;
  prefix: string;
  isContract: boolean;
  isAccount: boolean;
  isSecret: boolean;
  description: string;
}

/**
 * Classifies and validates any Stellar StrKey (Account, Contract, Secret Seed, Muxed)
 */
export function classifyStellarKey(key: string): KeyClassification {
  if (!key || typeof key !== 'string') {
    return {
      valid: false,
      type: 'UNKNOWN',
      prefix: '',
      isContract: false,
      isAccount: false,
      isSecret: false,
      description: 'Invalid input or empty key',
    };
  }

  const trimmed = key.trim();
  const prefix = trimmed.charAt(0);

  if (StrKey.isValidEd25519PublicKey(trimmed)) {
    return {
      valid: true,
      type: 'ED25519_PUBLIC_KEY',
      prefix,
      isContract: false,
      isAccount: true,
      isSecret: false,
      description: 'Stellar standard Ed25519 public key (G...)',
    };
  }

  if (StrKey.isValidContract(trimmed)) {
    return {
      valid: true,
      type: 'SOROBAN_CONTRACT',
      prefix,
      isContract: true,
      isAccount: false,
      isSecret: false,
      description: 'Soroban smart contract identifier (C...)',
    };
  }

  if (StrKey.isValidEd25519SecretSeed(trimmed)) {
    return {
      valid: true,
      type: 'ED25519_SECRET_SEED',
      prefix,
      isContract: false,
      isAccount: false,
      isSecret: true,
      description: 'Stellar private seed (S...) — Sensitive secret key',
    };
  }

  if (StrKey.isValidMed25519PublicKey(trimmed)) {
    return {
      valid: true,
      type: 'MUXED_ACCOUNT',
      prefix,
      isContract: false,
      isAccount: true,
      isSecret: false,
      description: 'Stellar multiplexed account identifier (M...)',
    };
  }

  return {
    valid: false,
    type: 'UNKNOWN',
    prefix,
    isContract: false,
    isAccount: false,
    isSecret: false,
    description: 'Unrecognized key format or invalid checksum',
  };
}
