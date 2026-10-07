import crypto from 'crypto';
import { WaterfallRule, AgreementStakeholder } from '../database/types.js';

export interface CanonicalAgreementInput {
  property_id: string;
  agreement_identifier: string;
  version_number: number;
  revenue_source: string;
  accepted_asset: string;
  effective_date: string;
  waterfall_rules: Omit<WaterfallRule, 'id' | 'agreement_version_id'>[];
  stakeholders: Omit<AgreementStakeholder, 'id' | 'agreement_version_id' | 'has_approved' | 'approved_at'>[];
}

export class AgreementHashingService {
  /**
   * Validate financial rules and basis point invariants
   */
  validateFinancialTerms(input: CanonicalAgreementInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 1. Validate Stakeholder Allocation Sum = 10,000 basis points (100.00%)
    if (!input.stakeholders || input.stakeholders.length === 0) {
      errors.push('At least one stakeholder is required in the distribution agreement.');
    } else {
      let totalBps = 0;
      const seenAddresses = new Set<string>();

      for (const st of input.stakeholders) {
        if (!Number.isInteger(st.basis_points)) {
          errors.push(`Stakeholder ${st.name} basis points must be an integer, got: ${st.basis_points}`);
        }
        if (st.basis_points <= 0 || st.basis_points > 10_000) {
          errors.push(`Stakeholder ${st.name} allocation must be between 1 and 10,000 basis points.`);
        }
        totalBps += st.basis_points;

        const normalizedAddr = st.wallet_address.trim().toUpperCase();
        if (seenAddresses.has(normalizedAddr)) {
          errors.push(`Duplicate stakeholder wallet address detected: ${st.wallet_address}`);
        }
        seenAddresses.add(normalizedAddr);
      }

      if (totalBps !== 10_000) {
        errors.push(
          `Stakeholder allocations must sum to exactly 10,000 basis points (100.00%). Current sum: ${totalBps} bps (${(totalBps / 100).toFixed(2)}%).`
        );
      }
    }

    // 2. Validate Waterfall Rules
    if (!input.waterfall_rules || input.waterfall_rules.length === 0) {
      errors.push('At least one waterfall rule is required.');
    } else {
      for (const rule of input.waterfall_rules) {
        if (!Number.isInteger(rule.priority) || rule.priority < 1) {
          errors.push(`Waterfall rule ${rule.name} priority must be a positive integer.`);
        }
        if (rule.rule_type === 'PERCENTAGE_BASIS_POINTS') {
          if (!Number.isInteger(rule.amount_or_bps) || rule.amount_or_bps < 1 || rule.amount_or_bps > 10_000) {
            errors.push(`Percentage rule ${rule.name} must be between 1 and 10,000 basis points.`);
          }
        } else if (rule.rule_type === 'FIXED_AMOUNT') {
          if (rule.amount_or_bps < 0) {
            errors.push(`Fixed amount rule ${rule.name} cannot be negative.`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Produce a deterministic, normalized canonical representation string
   */
  generateCanonicalRepresentation(input: CanonicalAgreementInput): string {
    const sortedWaterfall = [...input.waterfall_rules]
      .sort((a, b) => a.priority - b.priority)
      .map((r) => ({
        priority: r.priority,
        rule_type: r.rule_type,
        name: r.name.trim(),
        amount_or_bps: Math.round(r.amount_or_bps),
        description: r.description.trim(),
      }));

    const sortedStakeholders = [...input.stakeholders]
      .sort((a, b) => a.wallet_address.localeCompare(b.wallet_address))
      .map((s) => ({
        wallet_address: s.wallet_address.trim(),
        name: s.name.trim(),
        role: s.role.trim(),
        basis_points: Math.round(s.basis_points),
      }));

    const canonicalObject = {
      property_id: input.property_id.trim(),
      agreement_identifier: input.agreement_identifier.trim(),
      version_number: input.version_number,
      revenue_source: input.revenue_source.trim(),
      accepted_asset: input.accepted_asset.trim().toUpperCase(),
      effective_date: input.effective_date.trim(),
      waterfall_rules: sortedWaterfall,
      stakeholders: sortedStakeholders,
    };

    return JSON.stringify(canonicalObject);
  }

  /**
   * Compute deterministic SHA-256 hash of the canonical representation
   */
  computeAgreementHash(canonicalJson: string): string {
    return crypto.createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
  }
}

export const agreementHashingService = new AgreementHashingService();
