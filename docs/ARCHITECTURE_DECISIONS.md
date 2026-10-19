# VERTEX Logistics & Transport — Architecture Decision Records (ADRs)

## ADR-001: Modular Monolith vs Microservices for Initial Production
- **Status**: ACCEPTED
- **Context**: The VERTEX platform encompasses 9 major systems (Customer, Enterprise, Operations, Fleet, Finance, Admin, etc.). Starting directly with microservices creates significant distributed transaction overhead (saga choreography, network partitions, multi-service deployment latency).
- **Decision**: Build as a strictly structured **Modular Monolith** using TypeScript with domain-driven boundaries (Auth, Shipment, Manifest, Finance, Organization, Notification). Each module possesses its own internal services, data access layer, and domain validation. Long-running or async tasks will be dispatched to background workers via queue mechanisms.
- **Consequences**: Fast development velocity, single database transaction safety where needed, clean boundary enforcement, and future microservice extractability if traffic warrants.

## ADR-002: Relational Database Strategy with PostgreSQL
- **Status**: ACCEPTED
- **Context**: Logistics operations require strict consistency, double-entry financial accounting, ACID transactions for shipment state transitions, and spatial/relational queries (branch pin codes, geo-fencing).
- **Decision**: Use **PostgreSQL** with foreign key constraints, check constraints, strict migrations, and tenant isolation indexing. No document-only stores for core financial or shipment state records.

## ADR-003: Centralized Shipment State Machine
- **Status**: ACCEPTED
- **Context**: Shipments can arrive out of order, encounter duplicate barcode scans, or receive delayed webhooks. Arbitrary status updates lead to corrupted tracking histories and premature financial settlements.
- **Decision**: All shipment state mutations MUST flow through an authoritative Central State Machine. State transitions are strictly validated against allowed edges (e.g., `BOOKED` -> `PICKUP_SCHEDULED` -> `PICKED_UP` -> `IN_TRANSIT` -> `OUT_FOR_DELIVERY` -> `DELIVERED`). Every transition generates an immutable `shipment_events` row.
