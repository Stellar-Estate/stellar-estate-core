/**
 * Stellar SEP-0007 URI Scheme Utility Service
 * Specification: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0007.md
 */

export interface Sep0007PayOptions {
  destination: string;
  amount?: number | string;
  assetCode?: string;
  assetIssuer?: string;
  memo?: string;
  memoType?: 'MEMO_TEXT' | 'MEMO_ID' | 'MEMO_HASH';
  msg?: string;
  originDomain?: string;
  callback?: string;
}

export interface Sep0007TxOptions {
  xdr: string;
  pubkey?: string;
  msg?: string;
  originDomain?: string;
  callback?: string;
}

export class StellarUriService {
  /**
   * Generates a valid SEP-0007 `web+stellar:pay` URI
   */
  generatePayUri(opts: Sep0007PayOptions): string {
    const url = new URL('web+stellar:pay');
    url.searchParams.set('destination', opts.destination.trim());

    if (opts.amount !== undefined && opts.amount !== null) {
      url.searchParams.set('amount', typeof opts.amount === 'number' ? opts.amount.toFixed(2) : opts.amount);
    }

    if (opts.assetCode && opts.assetCode !== 'XLM') {
      url.searchParams.set('asset_code', opts.assetCode);
      if (opts.assetIssuer) {
        url.searchParams.set('asset_issuer', opts.assetIssuer);
      }
    }

    if (opts.memo) {
      url.searchParams.set('memo', opts.memo);
      url.searchParams.set('memo_type', opts.memoType || 'MEMO_TEXT');
    }

    if (opts.msg) {
      url.searchParams.set('msg', opts.msg);
    }

    if (opts.originDomain) {
      url.searchParams.set('origin_domain', opts.originDomain);
    }

    if (opts.callback) {
      url.searchParams.set('callback', opts.callback);
    }

    return url.toString();
  }

  /**
   * Generates a valid SEP-0007 `web+stellar:tx` URI for pre-built transaction envelopes
   */
  generateTxUri(opts: Sep0007TxOptions): string {
    const url = new URL('web+stellar:tx');
    url.searchParams.set('xdr', opts.xdr);

    if (opts.pubkey) {
      url.searchParams.set('pubkey', opts.pubkey);
    }

    if (opts.msg) {
      url.searchParams.set('msg', opts.msg);
    }

    if (opts.originDomain) {
      url.searchParams.set('origin_domain', opts.originDomain);
    }

    if (opts.callback) {
      url.searchParams.set('callback', opts.callback);
    }

    return url.toString();
  }

  /**
   * Parses a SEP-0007 URI back into its constituent parameters
   */
  parseUri(uri: string): { operation: 'pay' | 'tx'; params: Record<string, string> } {
    const trimmed = uri.trim();
    if (!trimmed.startsWith('web+stellar:')) {
      throw new Error('Invalid protocol: Must start with web+stellar:');
    }

    const url = new URL(trimmed);
    const operation = url.pathname as 'pay' | 'tx';
    if (operation !== 'pay' && operation !== 'tx') {
      throw new Error(`Unsupported SEP-0007 operation: ${operation}`);
    }

    const params: Record<string, string> = {};
    url.searchParams.forEach((val, key) => {
      params[key] = val;
    });

    return { operation, params };
  }
}

export const stellarUriService = new StellarUriService();
