# VERTEX Logistics & Transport — Database Design & Relational Domain Plan

---

## 1. Relational Database Principles
1. **Third Normal Form (3NF)**: Core transactional data is normalized to eliminate anomalies while keeping read-heavy tracking optimized via dedicated indexes.
2. **Immutable Append-Only Audit**: Financial ledger entries (`ledger_entries`) and shipment state transitions (`shipment_events`) are write-only. No `UPDATE` or `DELETE` permissions are granted on these tables in production.
3. **Multi-Tenant Scoping**: All enterprise and organization-scoped tables have a non-nullable `organization_id` foreign key with composite unique indexes on `(organization_id, id)` or business keys.
4. **Referential Integrity**: Cascading deletes are strictly prohibited on business entities; soft deletes (`deleted_at`) with audited triggers are used where appropriate.

---

## 2. The 12 Major Database Domains

### Domain 1: Identity & Sessions
- `users`: Core authentication identity (`id`, `email`, `phone`, `password_hash`, `user_type`, `status`, `is_mfa_enabled`, `created_at`).
- `user_sessions`: Active JWT refresh tokens, device fingerprints, IP addresses, revocation flags (`revoked_at`).
- `user_mfa`: TOTP secret keys, backup recovery codes (salted and hashed).

### Domain 2: Roles & Permissions (Deny-by-Default RBAC)
- `roles`: System and custom tenant roles (`id`, `name`, `scope`, `is_system_role`).
- `permissions`: Granular capability flags (e.g., `shipment:create`, `manifest:dispatch`, `finance:payout`).
- `role_permissions`: Join table mapping permissions to roles.
- `user_roles`: Mapping users to roles with optional tenant (`organization_id`) or operational (`branch_id`) constraints.

### Domain 3: Organizations & Business Memberships (B2B Multi-Tenant)
- `organizations`: B2B clients (`id`, `name`, `trade_name`, `gstin`, `pan`, `billing_cycle`, `credit_limit`, `kyc_status`).
- `organization_members`: Users belonging to an organization with their business designation and member status.
- `organization_warehouses`: Pickup and return locations with contact person, address, and geo-coordinates.

### Domain 4: Branches, Hubs & Operational Network
- `branches`: Operational facilities (`id`, `code`, `name`, `type` [MOTHER_HUB, DELIVERY_BRANCH, PUDO], `address_id`, `is_active`).
- `branch_staff`: Mapping internal employees to physical branches for physical scanning and authorization boundaries.

### Domain 5: Customers & Saved Addresses
- `customer_profiles`: Retail B2C customer profiles linked to `users`.
- `addresses`: Reusable normalized address entity (`id`, `user_id`, `recipient_name`, `phone`, `street_address`, `landmark`, `pincode`, `city`, `state`, `latitude`, `longitude`, `is_default`).

### Domain 6: Delivery Partners, Drivers & Vehicles
- `rider_profiles`: Delivery partners (`id`, `user_id`, `branch_id`, `vehicle_type`, `license_number`, `kyc_status`, `cash_in_hand_limit`, `is_active`).
- `transporters`: Line-haul fleet contractors (`id`, `company_name`, `gstin`, `pan`, `contract_terms`).
- `vehicles`: Line-haul and local vehicles (`id`, `registration_number`, `transporter_id`, `vehicle_capacity_kg`, `fitness_expiry_date`, `insurance_expiry_date`).
- `drivers`: Line-haul drivers linked to transporters.

### Domain 7: Serviceability, Zones & Pricing Rate Cards
- `pincodes`: Master pin code directory (`pincode`, `city`, `state`, `zone_id`, `is_serviceable`, `is_oda`).
- `serviceable_zones`: Zone definitions (LOCAL, WITHIN_STATE, METRO_TO_METRO, REST_OF_INDIA, SPECIAL_DESTINATION).
- `rate_cards`: Pricing contracts (`id`, `organization_id` [nullable for retail], `service_type` [SURFACE, EXPRESS_AIR], `base_weight_grams`, `base_price`, `increment_weight_grams`, `increment_price`, `cod_percentage`, `min_cod_fee`, `volumetric_divisor`).

### Domain 8: Shipments & Immutable Events (State Machine)
- `shipments`: Core shipment entity (`id`, `awb_number`, `order_reference`, `customer_id`, `organization_id`, `origin_address_id`, `destination_address_id`, `service_type`, `payment_mode` [PREPAID, COD], `cod_amount`, `current_status`, `current_branch_id`, `created_at`).
- `shipment_packages`: Package dimensions (`length_cm`, `width_cm`, `height_cm`), dead weight (`dead_weight_kg`), calculated volumetric weight (`volumetric_weight_kg`), declared value, contents description.
- `shipment_events`: **Immutable** transition logs (`id`, `shipment_id`, `awb_number`, `previous_status`, `new_status`, `event_code`, `reason`, `location_branch_id`, `actor_user_id`, `latitude`, `longitude`, `created_at`).

### Domain 9: Logistics Operations, Bags & Manifests
- `manifests`: Dispatch batches between branches or to riders (`id`, `manifest_number`, `type` [LINE_HAUL, DELIVERY_RUNSHEET], `source_branch_id`, `destination_branch_id`, `assigned_rider_id`, `vehicle_id`, `seal_number`, `status`).
- `manifest_items`: Shipments contained within a manifest (`manifest_id`, `shipment_id`, `scanned_at`, `scan_status`).
- `run_sheets`: Delivery run-sheet specifics for last-mile routes.
- `ndr_records`: Non-Delivery Reports (`id`, `shipment_id`, `rider_id`, `attempt_number`, `reason_code`, `customer_comments`, `rescheduled_date`, `proof_photo_url`).

### Domain 10: Payments, Invoices & Financial Ledger
- `payment_transactions`: Gateway checkouts (`id`, `gateway` [RAZORPAY, STRIPE], `gateway_order_id`, `gateway_payment_id`, `amount`, `currency`, `status`, `idempotency_key`, `signature_verified_at`).
- `invoices`: GST-compliant tax invoices (`id`, `invoice_number`, `organization_id`, `customer_id`, `subtotal`, `cgst_amount`, `sgst_amount`, `igst_amount`, `total_amount`, `pdf_url`, `status`).
- `ledger_accounts`: Chart of accounts (`id`, `account_code`, `account_name`, `type` [ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE]).
- `ledger_transactions`: Double-entry accounting batches (`id`, `reference_type` [BOOKING, COD_COLLECTION, SETTLEMENT], `reference_id`, `posted_at`).
- `ledger_entries`: Debits and credits (`id`, `transaction_id`, `account_id`, `entry_type` [DEBIT, CREDIT], `amount`). *Constraint: SUM(debit) MUST EQUAL SUM(credit).*
- `cod_remittances`: Remittance batches to B2B enterprise clients.

### Domain 11: Notifications & Webhook Events
- `notification_logs`: Outgoing SMS/WhatsApp messages (`id`, `recipient_phone`, `template_name`, `payload`, `provider_response_id`, `delivery_status`).
- `webhook_subscriptions`: Enterprise registered webhook endpoints (`id`, `organization_id`, `target_url`, `secret_key`, `is_active`).
- `webhook_deliveries`: Outgoing webhook dispatch attempts with status and retry counters.

### Domain 12: Files, Documents & Security Audit Trails
- `uploaded_files`: Secure private files (`id`, `s3_key`, `mime_type`, `file_size_bytes`, `uploaded_by`, `entity_type`, `entity_id`).
- `audit_logs`: System security logs (`id`, `actor_user_id`, `action`, `resource`, `resource_id`, `ip_address`, `user_agent`, `payload_diff`, `created_at`).

---

## 3. Transaction Requirements & Atomic Boundaries
1. **Shipment Booking Transaction**:
   - `INSERT shipment` + `INSERT shipment_packages` + `INSERT initial shipment_events ('BOOKED')` + `INSERT ledger_entry (Receivable / Revenue)` in a single ACID transaction.
2. **Delivery Confirmation Transaction**:
   - Verify OTP -> `UPDATE shipment (DELIVERED)` -> `INSERT shipment_events ('DELIVERED')` -> `INSERT ledger_entry (COD Cash in Hand if COD)` -> `UPDATE runsheet_item (DELIVERED)` atomically.
3. **Hub Manifest Seal & Dispatch**:
   - Verify all scanned AWBs -> `UPDATE manifest ('DISPATCHED')` -> Bulk `INSERT shipment_events ('IN_TRANSIT')` -> Bulk `UPDATE shipments ('IN_TRANSIT')` in a single transaction.

---

## 4. Decisions Required Before Generating Prisma/SQL Schema
1. **Pincode Dataset Strategy**: Will we seed all ~19,000 Indian postal codes initially or load top Metro clusters for testing?
2. **Ledger Granularity**: Should retail B2C single parcel bookings generate instant ledger postings or batch at end-of-day? (Recommendation: Real-time atomic posting).
3. **AWB Format**: Standard 10-digit numeric (with check-digit) vs 12-character alphanumeric (e.g. `VTX-9823-1029`).
