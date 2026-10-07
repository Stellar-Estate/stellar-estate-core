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
