# ADR-0021: Profile-only household dependants

Status: Accepted for BUG-008b (Type 2a architect resolution, 2026-10-10)

`DATA_MODEL.md` defines a household member with a nullable user reference and a display name. `PRODUCT_SPEC.md` F2.5 and ST-046 AC3 require an admin to add a dependant without an account. The earlier Prisma model required `identity_id` and lacked `display_name`; the service created a synthetic `MOCK` Identity and put the name in audit metadata. That made the data model disagree with the product and stored personal data in the audit trail.

`HouseholdMember.identityId` is nullable and `displayName` maps to `display_name`. A SQL CHECK permits `DEPENDANT` only with a null identity and a non-null display name; `ADMIN` and `MEMBER` require an identity. Ordinary runtime insertion of a dependant requires the caller to be an active admin in that household. The service creates only the profile and audits its member ID. Multiple dependants can coexist without a fake login account.

The canonical baseline is regenerated from the amended Prisma schema. The independent reconciliation fixture and disposable PostgreSQL proof assert the nullable column, foreign key, role pair, admin success, non-admin denial, and absence of login access. No existing database is migrated under this decision; BUG-008b is a clean-install chain.
