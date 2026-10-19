# VERTEX Logistics & Transport — Phased Implementation Roadmap

---

### PHASE 0: Discovery and Approvals (CURRENT)
* **Step 0.1**: Initial project discovery and architecture alignment. (Status: COMPLETED)
* **Step 1.0**: Architecture Validation & Development Blueprint. (Status: IN PROGRESS)
  - *Deliverable*: Requirements Inventory, System Boundaries, ERD Plan, Open Decisions Register.

---

### PHASE 1: Production Platform Foundation
* **Step 1.1: Modular Monolith Repository Structure & Strict Tooling**
  - *Objective*: Setup modular workspace folders, TypeScript strict mode, shared domain contracts, and unified error handling.
  - *Dependencies*: Step 1.0
  - *Files / Modules*: `tsconfig.json`, `src/core/*`, `src/modules/*`, `src/shared/*`
  - *Deliverables*: Strict type configs, domain exceptions, response serializers, base controller/service interfaces.
  - *Security*: Input sanitization middlewares, security headers (Helmet), CORS policies.
  - *Acceptance Criteria*: Clean compile with `tsc --noEmit`, automated linting passes.
  - *Tests*: Base utility unit tests, error serializer tests.
  - *Complexity*: Low (2/10)

* **Step 1.2: Database Migration Engine & Tenant Schema Foundation**
  - *Objective*: Initialize PostgreSQL connection pooling, migration pipeline, and core identity schema.
  - *Dependencies*: Step 1.1
  - *Files / Modules*: `src/database/*`, `prisma/schema.prisma` or migration files.
  - *Deliverables*: Connection resilience, healthcheck endpoint, base migration table.
  - *Security*: Encrypted DB credentials, connection pooling limits, SSL enforcement.
  - *Acceptance Criteria*: Migration runs cleanly, rollback capability verified.
  - *Tests*: DB connection test, transaction rollback test.
  - *Complexity*: Medium (4/10)

* **Step 1.3: Unified Authentication & Multi-Persona Deny-by-Default RBAC**
  - *Objective*: Implement authentication for Customers, Enterprise Orgs, and Internal Employees with strict role guards.
  - *Dependencies*: Step 1.2
  - *Files / Modules*: `src/modules/auth/*`, `src/modules/identity/*`
  - *Deliverables*: JWT access/refresh token rotation, password hashing (Argon2/Bcrypt), role & permission decorators.
  - *Security*: Constant-time token verification, brute-force rate limiting, password complexity rules.
  - *Acceptance Criteria*: Unauthorized endpoints return 401/403; permissions verified on server side.
  - *Tests*: Positive login tests, negative unauthorized access tests, expired token rejection.
  - *Complexity*: High (7/10)

---

### PHASE 2: Core Parcel Shipping MVP
* **Step 2.1: Geography, Pincode Master & Serviceability Engine**
  - *Objective*: Build PIN code serviceability directory, zone classification (City, Regional, Metro, National), and branch mapping.
  - *Dependencies*: Step 1.3
  - *Files / Modules*: `src/modules/geography/*`, `src/modules/serviceability/*`
  - *Deliverables*: Pincode lookup API, serviceability check endpoint (pickup & delivery PIN pair).
  - *Security*: Public endpoint rate limiting to prevent scraper abuse.
  - *Acceptance Criteria*: Returns accurate zone and delivery TAT (turnaround time) in <50ms.
  - *Tests*: Pincode match unit tests, unserviceable ODA pin code negative tests.
  - *Complexity*: Medium (4/10)

* **Step 2.2: Dynamic Pricing & Rate Card Calculator**
  - *Objective*: Implement volumetric weight calculation (`(L x W x H) / Divisor`) and dynamic freight calculation engine.
  - *Dependencies*: Step 2.1
  - *Files / Modules*: `src/modules/pricing/*`
  - *Deliverables*: Quotation API returning base freight, incremental slab cost, fuel surcharge, GST, and total.
  - *Security*: Server-side pricing enforcement; client cannot specify or tamper with prices.
  - *Acceptance Criteria*: Math verified against PRD test cases with zero rounding errors.
  - *Tests*: Unit tests for various dimension/weight combinations and zone matrixes.
  - *Complexity*: Medium (5/10)

* **Step 2.3: Central Shipment State Machine & Idempotent Booking Engine**
  - *Objective*: Central state machine governing shipment lifecycle with immutable event logging and unique AWB generation.
  - *Dependencies*: Step 2.2
  - *Files / Modules*: `src/modules/shipment/*`, `src/modules/state-machine/*`
  - *Deliverables*: Booking API, AWB generator (Luhn check or sequential unique code), immutable event log table.
  - *Security*: Idempotency key requirement on booking requests to prevent duplicate charges.
  - *Acceptance Criteria*: Illegal transitions (e.g. `BOOKED` directly to `DELIVERED`) throw strict domain error.
  - *Tests*: State machine transition tests, duplicate idempotency key tests.
  - *Complexity*: High (8/10)

* **Step 2.4: Standard AWB Shipping Label & Barcode Generation**
  - *Objective*: Generate printable PDF labels (4x6 inch standard) with Code128 barcodes for AWB and routing code.
  - *Dependencies*: Step 2.3
  - *Files / Modules*: `src/modules/label/*`
  - *Deliverables*: PDF label generation endpoint, ZPL/thermal printer compatibility.
  - *Security*: Access restricted to shipment creator, assigned enterprise org, or authorized employees.
  - *Acceptance Criteria*: Scannable barcode rendering verified.
  - *Tests*: PDF generation stream tests, barcode checksum tests.
  - *Complexity*: Medium (5/10)

* **Step 2.5: Public & Authenticated Live Tracking**
  - *Objective*: Public tracking page by AWB and authenticated tracking for customer portals.
  - *Dependencies*: Step 2.3
  - *Files / Modules*: `src/modules/tracking/*`, `src/frontend/tracking/*`
  - *Deliverables*: Tracking API returning milestone timeline with sanitized public event data.
  - *Security*: Data sanitization (public tracking hides internal costs, employee names, and sensitive sender phone numbers).
  - *Acceptance Criteria*: Accurate event timeline returned with human-readable timestamps.
  - *Tests*: Public vs internal tracking data visibility tests.
  - *Complexity*: Low (3/10)

---

### PHASE 3: Operations and Delivery Partners
* **Step 3.1: Branch & Hub Operations (Inbound, Bagging & Outbound Manifests)**
  - *Objective*: Scanner-driven hub workflows for receiving packages, sorting into route bags, and creating dispatch manifests.
  - *Dependencies*: Step 2.3
  - *Files / Modules*: `src/modules/hub/*`, `src/modules/manifest/*`
  - *Deliverables*: Inbound scan API, manifest creation & seal verification endpoints.
  - *Security*: Operators restricted strictly to their assigned `branch_id`.
  - *Acceptance Criteria*: Manifest closing transitions all contained AWBs to `IN_TRANSIT` atomically.
  - *Tests*: Bulk scan integration test, foreign branch unauthorized scan rejection.
  - *Complexity*: High (7/10)

* **Step 3.2: Delivery Partner Onboarding, Runsheet & Last-Mile Task Queue**
  - *Objective*: Delivery partner profile verification and Daily Delivery Run-Sheet (DRS) generation.
  - *Dependencies*: Step 3.1
  - *Files / Modules*: `src/modules/rider/*`, `src/modules/runsheet/*`
  - *Deliverables*: Rider task dashboard API, DRS allocation and package handover workflow.
  - *Security*: Rider can only view deliveries assigned to their active runsheet.
  - *Acceptance Criteria*: Run-sheet dispatches update parcel states to `OUT_FOR_DELIVERY`.
  - *Tests*: Assignment tests, rider boundary isolation tests.
  - *Complexity*: Medium (6/10)

* **Step 3.3: Secure Delivery Verification (Customer OTP & Geotagged POD)**
  - *Objective*: Delivery completion with 4-digit customer OTP verification, geotagged photo capture, and recipient signature.
  - *Dependencies*: Step 3.2
  - *Files / Modules*: `src/modules/delivery-proof/*`
  - *Deliverables*: OTP generation & verification service, S3-compatible private file upload for POD.
  - *Security*: OTP attempts rate-limited (max 3 tries), POD image metadata (EXIF/GPS) validated.
  - *Acceptance Criteria*: Successful OTP validation triggers state transition to `DELIVERED`.
  - *Tests*: Invalid OTP rejection, successful POD attachment verification.
  - *Complexity*: High (7/10)

* **Step 3.4: NDR (Non-Delivery Report) & RTO (Return to Origin) Pipeline**
  - *Objective*: Capture failed delivery attempts with structured reasons (Customer Unavailable, Wrong Address, Customer Refused) and schedule re-attempts.
  - *Dependencies*: Step 3.3
  - *Files / Modules*: `src/modules/ndr/*`
  - *Deliverables*: NDR logging API, customer automated SMS resolution link, max-attempts (3x) before RTO trigger.
  - *Security*: Rider must record GPS coordinates when marking an NDR to prevent fake attempts.
  - *Acceptance Criteria*: 3rd failed attempt automatically transitions shipment to `RTO_INITIATED`.
  - *Tests*: NDR sequence tests, RTO auto-trigger tests.
  - *Complexity*: Medium (6/10)

---

### PHASE 4: Finance and Business Accounts
* **Step 4.1: Payment Gateway Webhooks & Idempotent Verification**
  - *Objective*: Real-time payment confirmation via cryptographically signed webhooks (Razorpay / Stripe).
  - *Dependencies*: Step 2.2
  - *Files / Modules*: `src/modules/payment/*`
  - *Deliverables*: Webhook listener, HMAC-SHA256 signature verifier, idempotency registry.
  - *Security*: Replay attack prevention, secret validation, zero reliance on frontend client callbacks.
  - *Acceptance Criteria*: State machine only updates to `PAYMENT_CONFIRMED` upon valid signature.
  - *Tests*: Webhook signature validation tests, tampered payload rejection tests.
  - *Complexity*: Medium (6/10)

* **Step 4.2: Automated Invoicing, GST / Tax Calculation Engine**
  - *Objective*: Generate tax-compliant invoices with automatic CGST/SGST (intra-state) or IGST (inter-state) calculation.
  - *Dependencies*: Step 4.1
  - *Files / Modules*: `src/modules/invoicing/*`
  - *Deliverables*: Invoice generator, SAC code mapping, downloadable PDF tax invoices.
  - *Security*: Immutable invoice records; once generated, invoices cannot be modified without credit notes.
  - *Acceptance Criteria*: Math matches statutory tax formulas to the exact decimal.
  - *Tests*: Tax split calculation tests across state lines.
  - *Complexity*: Medium (5/10)

* **Step 4.3: Double-Entry Financial Ledger & COD Reconciliation**
  - *Objective*: Immutable double-entry accounting ledger tracking all debit/credit transactions, COD collections, and rider remittances.
  - *Dependencies*: Step 4.2, Step 3.3
  - *Files / Modules*: `src/modules/ledger/*`, `src/modules/cod/*`
  - *Deliverables*: Ledger posting service, rider end-of-day cash settlement interface, reconciliation reporting.
  - *Security*: Append-only ledger; updates only allowed via compensating reversal entries.
  - *Acceptance Criteria*: Total debits must equal total credits for every transaction event.
  - *Tests*: Ledger balance assertion tests, COD cash shortage/overage detection tests.
  - *Complexity*: High (8/10)

---

### PHASE 5: Enterprise APIs and Integrations
* **Step 5.1: Enterprise Multi-Tenant Portal & Sub-Account Management**
  - *Objective*: Enterprise dashboard for bulk booking, warehouse address management, and team permissions.
  - *Dependencies*: Step 1.3, Step 4.2
  - *Files / Modules*: `src/modules/organization/*`, `src/frontend/enterprise/*`
  - *Deliverables*: Warehouse manager, team invite system, wallet/credit balance visibility.
  - *Security*: Strict tenant boundary tests preventing cross-organization data leakage.
  - *Acceptance Criteria*: Enterprise users can only see their organization's data.
  - *Tests*: Cross-tenant penetration tests.
  - *Complexity*: High (7/10)

* **Step 5.2: B2B Public API & HMAC Webhook Dispatcher**
  - *Objective*: REST API for external e-commerce clients with API key management and real-time webhook event dispatch.
  - *Dependencies*: Step 5.1
  - *Files / Modules*: `src/modules/developer-api/*`, `src/modules/webhooks/*`
  - *Deliverables*: API key generation with SHA-256 hash storage, outgoing webhook sender with exponential backoff.
  - *Security*: API rate limiting per tier, IP whitelisting option, signed webhook payloads.
  - *Acceptance Criteria*: Webhook retries 5 times on endpoint failure before dead-lettering.
  - *Tests*: API key auth tests, webhook retry & signature verification tests.
  - *Complexity*: High (7/10)

---

### PHASE 6: Additional Transport Services and Mobile Expansion
* **Step 6.1: Transporter Portal & Fleet Management (FTL / PTL)**
  - *Objective*: Transporter registration, vehicle documentation (RC, Insurance, Fitness), driver onboarding, and line-haul load allocation.
  - *Dependencies*: Step 3.1
  - *Files / Modules*: `src/modules/fleet/*`
  - *Deliverables*: Fleet dashboard, trip manifest tracking, transporter settlement calculation.
  - *Security*: Document expiry validation and driver background check tracking.
  - *Acceptance Criteria*: Vehicles with expired fitness or insurance blocked from load allocation.
  - *Tests*: Document expiration rule tests, load capacity limit tests.
  - *Complexity*: High (8/10)

* **Step 6.2: Delivery Partner Mobile Application (React Native / PWA)**
  - *Objective*: Field application for delivery partners with offline-first barcode scanning, GPS breadcrumbs, and instant OTP delivery.
  - *Dependencies*: Step 3.3
  - *Files / Modules*: `src/mobile/rider/*`
  - *Deliverables*: Mobile app client, offline sync queue, background location tracking.
  - *Security*: Biometric login, device binding, certificate pinning.
  - *Acceptance Criteria*: Allows offline scanning in remote hubs with auto-sync when online.
  - *Tests*: Offline queue sync tests, GPS accuracy tests.
  - *Complexity*: Very High (9/10)
