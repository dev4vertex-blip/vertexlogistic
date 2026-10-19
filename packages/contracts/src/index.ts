/**
 * @vertex/contracts - Core Domain Contracts & Enums
 * Authoritative single source of truth for frontend and backend shared types.
 */

// 1. Multi-Persona User Roles (Deny-by-default RBAC)
export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  BRANCH_MANAGER = 'BRANCH_MANAGER',
  HUB_OPERATOR = 'HUB_OPERATOR',
  FINANCE_OFFICER = 'FINANCE_OFFICER',
  SUPPORT_AGENT = 'SUPPORT_AGENT',
  DELIVERY_RIDER = 'DELIVERY_RIDER',
  TRANSPORTER = 'TRANSPORTER',
  ENTERPRISE_ADMIN = 'ENTERPRISE_ADMIN',
  ENTERPRISE_MEMBER = 'ENTERPRISE_MEMBER',
  RETAIL_CUSTOMER = 'RETAIL_CUSTOMER',
}

// 2. Central Shipment State Machine Lifecycle
export enum ShipmentStatus {
  DRAFT = 'DRAFT',
  BOOKED = 'BOOKED',
  PICKUP_SCHEDULED = 'PICKUP_SCHEDULED',
  PICKED_UP = 'PICKED_UP',
  RECEIVED_AT_ORIGIN_HUB = 'RECEIVED_AT_ORIGIN_HUB',
  IN_TRANSIT = 'IN_TRANSIT',
  RECEIVED_AT_DESTINATION_HUB = 'RECEIVED_AT_DESTINATION_HUB',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
  UNDELIVERED_ATTEMPT_1 = 'UNDELIVERED_ATTEMPT_1',
  UNDELIVERED_ATTEMPT_2 = 'UNDELIVERED_ATTEMPT_2',
  UNDELIVERED_ATTEMPT_3 = 'UNDELIVERED_ATTEMPT_3',
  RTO_INITIATED = 'RTO_INITIATED',
  RTO_DELIVERED = 'RTO_DELIVERED',
  CANCELLED = 'CANCELLED',
  LOST_OR_DAMAGED = 'LOST_OR_DAMAGED',
}

// 3. Shipping Service Types
export enum ServiceType {
  SURFACE_EXPRESS = 'SURFACE_EXPRESS',
  AIR_PRIORITY = 'AIR_PRIORITY',
  SAME_DAY_HYPERLOCAL = 'SAME_DAY_HYPERLOCAL',
}

// 4. Payment Modes
export enum PaymentMode {
  PREPAID = 'PREPAID',
  COD = 'COD',
  POSTPAID_CREDIT = 'POSTPAID_CREDIT',
}

// 5. Shared Shipment Package Dimensions & Weights
export interface PackageDimensions {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  deadWeightKg: number;
  volumetricWeightKg: number;
  chargeableWeightKg: number;
}

// 6. Base API Response Envelope
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
  traceId?: string;
}

// 7. System Health Response Contract
export interface HealthResponse {
  status: 'ok';
  service: string;
  version: string;
}

