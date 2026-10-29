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
