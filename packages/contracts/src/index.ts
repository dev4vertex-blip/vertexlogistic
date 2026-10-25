// @vertex/contracts — Type-Safe Application & Protocol Contracts

// 1. Shipment Status Enums & Types
export type ShipmentStatus =
  | 'DRAFT'
  | 'BOOKED'
  | 'PICKUP_SCHEDULED'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'FAILED_DELIVERY'
  | 'RTO_INITIATED'
  | 'RTO_DELIVERED'
  | 'CANCELLED'
  | 'LOST'
  | 'DAMAGED';

// 2. Courier Provider Identifiers
export type CourierCode =
  | 'DELHIVERY'
  | 'BLUEDART'
  | 'EKART'
  | 'DTDC'
  | 'SMART_SHIP'
  | 'SHYPLITE'
  | 'XPRESSBEES';

// 3. User & Organization Personas
export type UserRole =
  | 'SUPER_ADMIN'
  | 'HUB_OPERATOR'
  | 'BRANCH_MANAGER'
  | 'FINANCE_ADMIN'
  | 'CUSTOMER_ADMIN'
  | 'DISPATCHER'
  | 'VIEWER';

export type TenantType =
  | 'ENTERPRISE_CLIENT'
  | 'SMB_SHIPPER'
  | 'LOGISTICS_PARTNER'
  | 'VENDOR';

// 4. Core Shipment Tracking Contract
export interface ShipmentTrackingEvent {
  status: ShipmentStatus;
  timestamp: string;
  location: string;
  description: string;
  sourceProvider: CourierCode;
  courierActivityCode?: string;
}

export interface ShipmentSummary {
  id: string;
  waybillNumber: string;
  carrier: CourierCode;
  status: ShipmentStatus;
  originHub: string;
  destinationHub: string;
  currentLocation: string;
  estimatedDelivery: string;
  recipientName: string;
  packageWeightKg: number;
  lastUpdated: string;
}

// 5. Courier Rate Recommendation Contract
export interface CourierRateOption {
  courier: CourierCode;
  serviceType: 'EXPRESS' | 'STANDARD' | 'SURFACE' | 'AIR';
  rate: number;
  currency: string;
  estimatedTransitDays: number;
  reliabilityScore: number;
  co2EmissionsGrams: number;
}

// 6. Common API Standard Envelope
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

// 8. System Readiness Response Contract
export interface ReadyResponse {
  status: 'ok' | 'degraded';
  service: string;
  version: string;
  database: {
    status: 'up' | 'down';
    service: string;
    message?: string;
  };
}

// 9. Authentication & Authorization Contracts
export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  userType: string;
  status: string;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: string;
  user: AuthUser;
}

export interface JwtPayload {
  sub: string;
  email: string;
  userType: string;
  status: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

// 10. Organization Onboarding & Management Contracts
export interface CreateOrganizationRequest {
  name: string;
  code: string;
  type?: 'ENTERPRISE_CLIENT' | 'SMB_SHIPPER' | 'LOGISTICS_PARTNER' | 'VENDOR';
  gstin?: string;
  pan?: string;
  billingEmail?: string;
  billingPhone?: string;
}

export interface UpdateOrganizationRequest {
  name?: string;
  status?: 'ONBOARDING' | 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
  gstin?: string;
  pan?: string;
  billingEmail?: string;
  billingPhone?: string;
}

export interface OrganizationResponse {
  id: string;
  name: string;
  code: string;
  type: string;
  status: string;
  gstin?: string | null;
  pan?: string | null;
  billingEmail?: string | null;
  billingPhone?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AddOrgUserRequest {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  roleCode: string;
}

export interface UpdateOrgUserStatusRequest {
  status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
}

export interface OrgUserResponse {
  id: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  userType: string;
  status: string;
  role: {
    id: string;
    code: string;
    name: string;
  };
  isActive: boolean;
  assignedAt: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface VerifyEmailRequest {
  token: string;
  password?: string;
}

export interface VerifyEmailResponse {
  success: boolean;
  message: string;
  user?: {
    id: string;
    email: string;
    status: string;
  };
}

export interface ResendVerificationRequest {
  email: string;
}

export interface ResendVerificationResponse {
  success: boolean;
  message: string;
}
