# VERTEX Logistics & Transport — Security & Governance Checklist

## Authentication & Authorization
- [ ] Deny-by-default RBAC enforced on server-side guards (No client-only checks).
- [ ] JWT / Secure Session validation with revocation support.
- [ ] Multi-Factor Authentication (MFA/TOTP) for Super Admin and Finance roles.
- [ ] Strict Tenant Isolation: An enterprise organization cannot query or mutate data of another organization under any circumstance.
- [ ] Branch Isolation: Branch managers and hub operators are constrained to their assigned `branch_id`.

## Data Protection & Crypto
- [ ] Zero hardcoded credentials or API tokens in codebase.
- [ ] Secrets injected via environment variables only.
- [ ] PII encryption at rest for sensitive customer & rider KYC documents.
- [ ] OTPs salted and hashed or securely stored with tight expiration (3 minutes max).

## Network, API & Input Hygiene
- [ ] Strict validation pipes on all input payloads (DTOs with schema validation).
- [ ] Rate limiting on authentication, quotation, and public tracking endpoints.
- [ ] CORS policies locked down to registered applet domains.
- [ ] CSRF protection for session-based endpoints.
- [ ] File upload malware and MIME-type verification for KYC/label PDFs.
