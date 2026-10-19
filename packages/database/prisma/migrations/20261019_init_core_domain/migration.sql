-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('INTERNAL_EMPLOYEE', 'CUSTOMER_USER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "MfaType" AS ENUM ('NONE', 'TOTP', 'SMS_OTP');

-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('ENTERPRISE_CLIENT', 'SMB_SHIPPER', 'LOGISTICS_PARTNER', 'VENDOR');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('ONBOARDING', 'ACTIVE', 'SUSPENDED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "RoleScope" AS ENUM ('SYSTEM_INTERNAL', 'ORGANIZATION');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "password_hash" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "user_type" "UserType" NOT NULL DEFAULT 'CUSTOMER_USER',
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "email_verified_at" TIMESTAMP(3),
    "phone_verified_at" TIMESTAMP(3),
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "mfa_type" "MfaType" NOT NULL DEFAULT 'NONE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "OrganizationType" NOT NULL DEFAULT 'ENTERPRISE_CLIENT',
    "status" "OrganizationStatus" NOT NULL DEFAULT 'ONBOARDING',
    "gstin" TEXT,
    "pan" TEXT,
    "billing_email" TEXT,
    "billing_phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" "RoleScope" NOT NULL DEFAULT 'ORGANIZATION',
    "is_system_default" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "organization_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex (Case-insensitive unique email)
CREATE UNIQUE INDEX "users_email_lower_key" ON "users"(LOWER("email"));

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_phone_idx" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_user_type_status_idx" ON "users"("user_type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_code_key" ON "organizations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_gstin_key" ON "organizations"("gstin");

-- CreateIndex
CREATE INDEX "organizations_code_idx" ON "organizations"("code");

-- CreateIndex
CREATE INDEX "organizations_gstin_idx" ON "organizations"("gstin");

-- CreateIndex
CREATE INDEX "organizations_type_status_idx" ON "organizations"("type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE INDEX "roles_code_idx" ON "roles"("code");

-- CreateIndex
CREATE INDEX "roles_scope_idx" ON "roles"("scope");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "permissions_code_idx" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "permissions_resource_action_idx" ON "permissions"("resource", "action");

-- CreateIndex
CREATE INDEX "role_permissions_role_id_idx" ON "role_permissions"("role_id");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_id_permission_id_key" ON "role_permissions"("role_id", "permission_id");

-- CreateIndex
CREATE INDEX "user_roles_user_id_idx" ON "user_roles"("user_id");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE INDEX "user_roles_organization_id_idx" ON "user_roles"("organization_id");

-- CreateIndex
CREATE INDEX "user_roles_user_id_organization_id_idx" ON "user_roles"("user_id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_id_organization_id_key" ON "user_roles"("user_id", "role_id", "organization_id");

-- CreateIndex (Strict partial unique index for organization-scoped role assignments)
CREATE UNIQUE INDEX "user_roles_org_scoped_unique_idx" ON "user_roles"("user_id", "role_id", "organization_id") WHERE "organization_id" IS NOT NULL;

-- CreateIndex (Strict partial unique index for internal platform assignments where organization_id IS NULL)
CREATE UNIQUE INDEX "user_roles_internal_scoped_unique_idx" ON "user_roles"("user_id", "role_id") WHERE "organization_id" IS NULL;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

