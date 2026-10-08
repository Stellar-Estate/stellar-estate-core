export interface Property {
  id: string;
  name: string;
  description: string;
  location: string;
  property_type: string;
  valuation: number;
  unit_count: number;
  occupancy_percentage: number;
  vault_stellar_address: string;
  status: 'ACTIVE' | 'PENDING' | 'MAINTENANCE';
  image_url: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface PropertyUnit {
  id: string;
  property_id: string;
  unit_identifier: string;
  unit_type: string;
  monthly_rent: number;
  occupancy_status: 'OCCUPIED' | 'VACANT';
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface Participant {
  id: string;
  wallet_address: string;
  display_name: string;
  role: 'OWNER' | 'OPERATOR' | 'INVESTOR' | 'CUSTODIAN';
  created_at: string;
}

export interface PropertyParticipation {
  id: string;
  property_id: string;
  participant_id: string;
  share_percentage: number;
  role: string;
  created_at: string;
}

export interface BlockchainTransaction {
  id: string;
  transaction_hash: string;
  network: 'TESTNET' | 'PUBLIC';
  asset: string;
  amount: number;
  sender: string;
  recipient: string;
  operation_type: string;
  status: 'SUCCESS' | 'FAILED';
  ledger_sequence: number;
  verification_result: Record<string, any>;
  confirmed_at: string;
  created_at: string;
}

export interface RevenueRecord {
  id: string;
  property_id: string;
  source: string;
  amount: number;
  asset: string;
  transaction_hash: string;
  depositor_address: string;
  destination_address: string;
  status: 'PENDING' | 'CONFIRMED' | 'RECONCILED' | 'FLAGGED';
  verified_at: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface AuditEvent {
  id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  actor_address?: string;
  payload: Record<string, any>;
  ip_address?: string;
  created_at: string;
}

export interface ReconciliationReport {
  id: string;
  run_timestamp: string;
  total_onchain_transactions: number;
  total_recorded_revenue: number;
  discrepancies_found: number;
  status: 'BALANCED' | 'DISCREPANCY_DETECTED';
  details: Record<string, any>;
}

// ==============================================================================
// PROPERTY DISTRIBUTION AGREEMENT MODELS
// ==============================================================================

export type AgreementStatus =
  | 'DRAFT'
  | 'PENDING_APPROVALS'
  | 'PARTIALLY_APPROVED'
  | 'READY_TO_LOCK'
  | 'LOCKED'
  | 'SUPERSEDED'
  | 'REJECTED';

export type WaterfallRuleType = 'FIXED_AMOUNT' | 'PERCENTAGE_BASIS_POINTS' | 'RESIDUAL_DISTRIBUTION';

export interface WaterfallRule {
  id: string;
  agreement_version_id: string;
  priority: number;
  rule_type: WaterfallRuleType;
  name: string;
  amount_or_bps: number; // In asset cents/stroops if FIXED_AMOUNT, or basis points (e.g. 500 = 5.00%)
  description: string;
}

export interface AgreementStakeholder {
  id: string;
  agreement_version_id: string;
  wallet_address: string;
  name: string;
  role: string;
  basis_points: number; // 0 to 10,000 (10,000 = 100.00%)
  has_approved: boolean;
  approved_at?: string;
  approval_signature?: string;
  approval_tx_hash?: string;
}

export interface AgreementApproval {
  id: string;
  agreement_version_id: string;
  wallet_address: string;
  agreement_hash: string;
  approval_type: 'STELLAR_WALLET';
  signature_or_proof: string;
  ledger_sequence?: number;
  timestamp: string;
}

export interface DistributionAgreementVersion {
  id: string;
  agreement_id: string;
  version_number: number;
  revenue_source: string;
  accepted_asset: string;
  effective_date: string;
  expiration_date?: string;
  canonical_representation: string;
  agreement_hash: string; // 64-char hex SHA-256
  status: AgreementStatus;
  contract_reference?: string;
  created_at: string;
  locked_at?: string;
  waterfall_rules: WaterfallRule[];
  stakeholders: AgreementStakeholder[];
  approvals: AgreementApproval[];
}

export interface DistributionAgreement {
  id: string;
  property_id: string;
  agreement_identifier: string; // e.g. "MERIDIAN-REV-001"
  current_version: number;
  status: AgreementStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  versions: DistributionAgreementVersion[];
}

export interface SettlementPreviewItem {
  name: string;
  category: 'EXPENSE' | 'RESERVE' | 'FEE' | 'DISTRIBUTION';
  rule_type: WaterfallRuleType;
  rate_or_amount: string;
  deducted_amount: number;
  recipient_or_destination: string;
}

export interface StakeholderPreviewAllocation {
  wallet_address: string;
  name: string;
  role: string;
  basis_points: number;
  percentage: string;
  allocated_amount: number;
}

export interface SettlementPreviewResult {
  property_id: string;
  agreement_id: string;
  version: number;
  agreement_hash: string;
  gross_revenue_input: number;
  asset: string;
  total_waterfall_deductions: number;
  net_distributable_revenue: number;
  waterfall_breakdown: SettlementPreviewItem[];
  stakeholder_allocations: StakeholderPreviewAllocation[];
  accounting_balanced: boolean;
  precision_model: string;
  disclaimer: string;
}

// ==============================================================================
// PROGRAMMABLE PROPERTY-REVENUE SETTLEMENT MODELS
// ==============================================================================

export type SettlementExecutionStatus =
  | 'CREATED'
  | 'VALIDATING'
  | 'CALCULATING'
  | 'READY'
  | 'SUBMITTING'
  | 'CONFIRMING'
  | 'SETTLED'
  | 'RECONCILED'
  | 'FAILED'
  | 'PARTIALLY_SETTLED'
  | 'RECONCILIATION_REQUIRED';

export interface SettlementPayoutRecord {
  recipient_address: string;
  recipient_name: string;
  role: string;
  basis_points: number;
  expected_amount: number;
  actual_amount: number;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED';
  transaction_hash?: string;
  reconciled: boolean;
}

export interface SettlementSnapshot {
  revenue_ids: string[];
  revenue_amounts: number[];
  agreement_id: string;
  agreement_version: number;
  agreement_hash: string;
  waterfall_rules: WaterfallRule[];
  stakeholder_allocations: StakeholderPreviewAllocation[];
  calculated_expenses: number;
  calculated_reserve: number;
  calculated_fees: number;
  distributable_amount: number;
  expected_payouts: Array<{ recipient: string; name: string; amount: number; bps: number }>;
  dust_remainder: number;
  timestamp: string;
}

export interface Settlement {
  id: string; // e.g. "STL-MERIDIAN-001"
  property_id: string;
  revenue_ids: string[];
  agreement_id: string;
  agreement_version: number;
  agreement_hash: string;
  asset: string;
  gross_revenue: number;
  expenses: number;
  reserve: number;
  fees: number;
  distributable_amount: number;
  status: SettlementExecutionStatus;
  created_at: string;
  executed_at?: string;
  reconciled_at?: string;
  transaction_hashes: string[];
  payouts: SettlementPayoutRecord[];
  calculation_snapshot: SettlementSnapshot;
  reconciliation_status: 'PENDING' | 'MATCHED' | 'DISCREPANCY';
  reconciliation_notes?: string;
}

export interface RevenuePool {
  property_id: string;
  property_name: string;
  total_confirmed_revenue: number;
  total_pending_revenue: number;
  total_settled_revenue: number;
  available_for_settlement: number;
  total_reserves_held: number;
  total_fees_paid: number;
  total_expenses_deducted: number;
  revenue_entries_count: number;
  settlement_count: number;
}

export interface PropertyFinancialPassport {
  property_id: string;
  property_name: string;
  total_lifetime_revenue: number;
  total_expenses: number;
  total_reserves: number;
  total_fees: number;
  total_distributed: number;
  settlement_count: number;
  active_agreement_id: string;
  active_agreement_version: number;
  active_agreement_hash: string;
  last_settlement_date?: string;
  reconciliation_status: 'CURRENT' | 'ATTENTION_REQUIRED';
  recent_settlements: Settlement[];
  recent_revenues: RevenueRecord[];
}

export interface StakeholderEarnings {
  wallet_address: string;
  stakeholder_name: string;
  role: string;
  current_allocation_bps: number;
  total_allocated: number;
  total_settled: number;
  pending_amount: number;
  settlements: Array<{
    settlement_id: string;
    property_id: string;
    date: string;
    amount: number;
    tx_hash: string;
    status: string;
  }>;
}

