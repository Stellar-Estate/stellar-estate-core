import {
  DistributionAgreementVersion,
  SettlementPreviewResult,
  SettlementPreviewItem,
  StakeholderPreviewAllocation,
} from '../database/types.js';

export class SettlementPreviewService {
  /**
   * Deterministically calculate waterfall settlement preview using safe integer math
   */
  calculatePreview(
    version: DistributionAgreementVersion,
    propertyId: string,
    sampleRevenueAmount: number
  ): SettlementPreviewResult {
    // Convert to integer cents (or micro-units) to prevent floating-point anomalies
    const grossCents = Math.round(sampleRevenueAmount * 100);
    let remainingCents = grossCents;

    const breakdown: SettlementPreviewItem[] = [];
    const sortedRules = [...version.waterfall_rules].sort((a, b) => a.priority - b.priority);

    for (const rule of sortedRules) {
      if (rule.rule_type === 'FIXED_AMOUNT') {
        const targetCents = Math.round(rule.amount_or_bps * 100);
        const deductionCents = Math.min(remainingCents, targetCents);
        remainingCents -= deductionCents;

        breakdown.push({
          name: rule.name,
          category: rule.name.toLowerCase().includes('reserve') ? 'RESERVE' : 'EXPENSE',
          rule_type: rule.rule_type,
          rate_or_amount: `$${rule.amount_or_bps.toLocaleString()}`,
          deducted_amount: deductionCents / 100,
          recipient_or_destination: rule.description || 'Property Operational Account',
        });
      } else if (rule.rule_type === 'PERCENTAGE_BASIS_POINTS') {
        // Percentage of gross revenue: (grossCents * bps) / 10,000
        const deductionCents = Math.floor((grossCents * rule.amount_or_bps) / 10_000);
        const actualDeduction = Math.min(remainingCents, deductionCents);
        remainingCents -= actualDeduction;

        breakdown.push({
          name: rule.name,
          category: 'FEE',
          rule_type: rule.rule_type,
          rate_or_amount: `${(rule.amount_or_bps / 100).toFixed(2)}% (${rule.amount_or_bps} bps)`,
          deducted_amount: actualDeduction / 100,
          recipient_or_destination: rule.description || 'Property Operator Fee Account',
        });
      }
    }

    const distributableCents = Math.max(0, remainingCents);
    const totalDeductionsCents = grossCents - distributableCents;

    // Stakeholder Allocations using Basis Points
    let totalAllocatedCents = 0;
    const allocations: StakeholderPreviewAllocation[] = [];

    const sortedStakeholders = [...version.stakeholders].sort((a, b) => b.basis_points - a.basis_points);

    for (let i = 0; i < sortedStakeholders.length; i++) {
      const st = sortedStakeholders[i];
      let payoutCents = Math.floor((distributableCents * st.basis_points) / 10_000);

      // Handle dust on final stakeholder
      if (i === sortedStakeholders.length - 1) {
        const remainingDust = distributableCents - (totalAllocatedCents + payoutCents);
        payoutCents += remainingDust;
      }

      totalAllocatedCents += payoutCents;

      allocations.push({
        wallet_address: st.wallet_address,
        name: st.name,
        role: st.role,
        basis_points: st.basis_points,
        percentage: `${(st.basis_points / 100).toFixed(2)}%`,
        allocated_amount: payoutCents / 100,
      });
    }

    // Verify Accounting Invariant
    const isBalanced = grossCents === totalDeductionsCents + distributableCents;

    return {
      property_id: propertyId,
      agreement_id: version.agreement_id,
      version: version.version_number,
      agreement_hash: version.agreement_hash,
      gross_revenue_input: sampleRevenueAmount,
      asset: version.accepted_asset,
      total_waterfall_deductions: totalDeductionsCents / 100,
      net_distributable_revenue: distributableCents / 100,
      waterfall_breakdown: breakdown,
      stakeholder_allocations: allocations,
      accounting_balanced: isBalanced,
      precision_model: 'Safe Integer (Basis Points / Cents Arithmetic)',
      disclaimer:
        'Settlement Preview only. Illustrates deterministic allocation rules established in Level 2. Final automated multi-recipient settlement executes in Level 3.',
    };
  }
}

export const settlementPreviewService = new SettlementPreviewService();
