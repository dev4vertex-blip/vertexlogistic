# VERTEX Logistics & Transport — Requirements Traceability Matrix & Inventory

## 1. Requirement Taxonomy
- **CUST**: Retail Customer Platform (B2C)
- **ENT**: Enterprise / Business Platform (B2B Multi-tenant)
- **EMP**: Internal Employee & Branch Operations Platform
- **RDR**: Delivery Partner & Rider Field Application
- **FLT**: Transporter & Middle-Mile Fleet Management
- **OPS**: Core Logistics Engine, Routing & State Machine
- **FIN**: Financial Accounting, Invoicing, Tax & Reconciliation
- **INT**: Integration Control Center (SMS, WhatsApp, Gateways, Geocoding)
- **ADM**: Platform Governance, Super Admin & Security Controls
- **SEC**: Security, Compliance & Data Isolation Standards

---

## 2. Comprehensive Requirements Inventory

| Req ID | PRD/TRD Ref | Module / Feature Name | Priority | Dependencies | Status | Description & Acceptance Baseline |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **CUST-001** | PRD §3.1 / TRD §4.1 | Customer Auth & Profiles | P0 (MVP) | None | NOT STARTED | Phone OTP & Email/Password login, session management, profile & address book. |
| **CUST-002** | PRD §3.2 / TRD §5.2 | Serviceability & Rate Check | P0 (MVP) | OPS-001, FIN-001 | NOT STARTED | Real-time pin code check, distance/zone determination, instant quotation. |
| **CUST-003** | PRD §3.3 / TRD §6.1 | Single Shipment Booking | P0 (MVP) | CUST-002, FIN-002 | NOT STARTED | Pickup & delivery address, package dimensions, contents, payment method. |
| **CUST-004** | PRD §3.4 / TRD §6.3 | AWB & Shipping Label | P0 (MVP) | CUST-003, OPS-002 | NOT STARTED | Unique AWB generation with Code128 barcode, downloadable standard PDF label. |
| **CUST-005** | PRD §3.5 / TRD §7.1 | Public Live Tracking | P0 (MVP) | OPS-002 | NOT STARTED | Public tracking page by AWB, showing timestamped milestones and current status. |
| **ENT-001** | PRD §4.1 / TRD §4.2 | Business Org Onboarding & KYC | P0 (MVP) | None | NOT STARTED | Multi-tenant organization profile, GSTIN, PAN, business KYC document upload. |
| **ENT-002** | PRD §4.2 / TRD §4.3 | Organization User RBAC | P0 (MVP) | ENT-001 | NOT STARTED | Org Admin, Dispatcher, Finance/Billing roles with tenant-scoped permissions. |
| **ENT-003** | PRD §4.3 / TRD §6.2 | Bulk Order Manifest Upload | P1 (MVP) | ENT-001, CUST-003 | NOT STARTED | CSV/Excel batch upload, asynchronous validation, bulk AWB generation. |
| **ENT-004** | PRD §4.4 / TRD §8.2 | Custom Rate Cards & Credit Line | P1 (MVP) | FIN-001, ENT-001 | NOT STARTED | Contractual pricing discounts, post-paid billing cycle, credit limit enforcement. |
| **ENT-005** | PRD §4.5 / TRD §9.1 | API Keys & Webhook Subscriptions | P1 (Phase 5) | ENT-001, SEC-001 | NOT STARTED | Scoped API credentials for e-commerce stores, webhook event dispatch with HMAC. |
| **EMP-001** | PRD §5.1 / TRD §4.4 | Employee IAM & Branch Scoping | P0 (MVP) | None | NOT STARTED | Super Admin, Branch Manager, Hub Operator, Finance, Support with strict branch scoping. |
| **EMP-002** | PRD §5.2 / TRD §7.2 | Hub Inbound & Outbound Scanning | P0 (MVP) | OPS-002, EMP-001 | NOT STARTED | Barcode scanner integration for parcel receiving, bag creation, and dispatch manifests. |
| **EMP-003** | PRD §5.3 / TRD §7.4 | NDR & Exception Workflow | P1 (MVP) | OPS-002, RDR-003 | NOT STARTED | Non-Delivery Report logging, customer re-attempt scheduling, RTO trigger. |
| **RDR-001** | PRD §6.1 / TRD §4.5 | Rider Onboarding & Verification | P0 (MVP) | EMP-001 | NOT STARTED | Rider KYC, driving license, vehicle details, background verification status. |
| **RDR-002** | PRD §6.2 / TRD §7.3 | Delivery Run-Sheet (DRS) | P0 (MVP) | EMP-002, RDR-001 | NOT STARTED | Branch-assigned daily delivery queue, route ordering, task status updates. |
| **RDR-003** | PRD §6.3 / TRD §7.3 | Delivery OTP & Electronic POD | P0 (MVP) | RDR-002, INT-001 | NOT STARTED | Customer OTP verification, geotagged photo POD upload, digital signature. |
| **RDR-004** | PRD §6.4 / TRD §8.3 | COD Collection & Hub Handover | P0 (MVP) | RDR-003, FIN-003 | NOT STARTED | Cash collection tracking, end-of-day hub cashier reconciliation, cash receipt. |
| **FLT-001** | PRD §7.1 / TRD §4.6 | Transporter & Fleet Onboarding | P2 (Phase 6) | None | NOT STARTED | Transporter profile, fleet vehicle registration, fitness certificate, driver vetting. |
| **FLT-002** | PRD §7.2 / TRD §7.5 | Line-Haul Trip Manifests | P2 (Phase 6) | FLT-001, EMP-002 | NOT STARTED | Inter-hub bulk shipment manifests, vehicle seal numbers, route milestones. |
| **OPS-001** | PRD §8.1 / TRD §5.1 | Pincode & Branch Serviceability | P0 (MVP) | None | NOT STARTED | Master database of PIN codes, city, state, branch mapping, ODA (out of delivery area). |
| **OPS-002** | PRD §8.2 / TRD §7.1 | Central Shipment State Machine | P0 (MVP) | None | NOT STARTED | Authoritative state transitions, immutable audit events, out-of-order scan rejection. |
| **FIN-001** | PRD §9.1 / TRD §5.3 | Dynamic Pricing Engine | P0 (MVP) | OPS-001 | NOT STARTED | Volumetric vs dead weight calculation, base price + increment per 500g, fuel surcharge. |
| **FIN-002** | PRD §9.2 / TRD §8.1 | Payment Gateway & Invoicing | P0 (MVP) | CUST-003, FIN-001 | NOT STARTED | Razorpay/Stripe checkout, webhook verification, GST-compliant tax invoice generation. |
| **FIN-003** | PRD §9.3 / TRD §8.4 | Double-Entry Accounting Ledger | P0 (MVP) | FIN-002, RDR-004 | NOT STARTED | Immutable journal entries, debit/credit balancing, customer and rider accounts. |
| **FIN-004** | PRD §9.4 / TRD §8.5 | COD Remittance Pipeline | P1 (Phase 4) | FIN-003, RDR-004 | NOT STARTED | Enterprise client COD payout calculation after deducting freight charges. |
| **INT-001** | PRD §10.1 / TRD §9.2 | Multi-Channel Notifications | P0 (MVP) | None | NOT STARTED | SMS & WhatsApp notifications for OTP, booking confirmation, out for delivery. |
| **INT-002** | PRD §10.2 / TRD §9.3 | Maps & Geocoding Service | P1 (MVP) | None | NOT STARTED | Address validation, lat/long lookup, distance calculation for hyper-local pricing. |
| **ADM-001** | PRD §11.1 / TRD §3.1 | Super Admin Governance & Audit | P0 (MVP) | None | NOT STARTED | Platform configurations, global branch oversight, immutable security audit logs. |
| **SEC-001** | PRD §12.1 / TRD §10.1 | Tenant Isolation & Server RBAC | P0 (MVP) | None | NOT STARTED | Server-side guards, organization ID query filters, token invalidation, rate limiting. |
