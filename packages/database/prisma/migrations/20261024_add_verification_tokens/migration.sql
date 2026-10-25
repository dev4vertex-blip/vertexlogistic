-- CreateEnum
CREATE TYPE "VerificationTokenType" AS ENUM ('EMAIL_VERIFICATION', 'ORGANIZATION_INVITATION');

-- CreateTable
CREATE TABLE "verification_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT,
    "token_hash" TEXT NOT NULL,
    "type" "VerificationTokenType" NOT NULL DEFAULT 'ORGANIZATION_INVITATION',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_hash_key" ON "verification_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "verification_tokens_user_id_idx" ON "verification_tokens"("user_id");

-- CreateIndex
CREATE INDEX "verification_tokens_token_hash_idx" ON "verification_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "verification_tokens_expires_at_idx" ON "verification_tokens"("expires_at");

-- AddForeignKey
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex: PostgreSQL partial unique index for active organization invitations (per user & organization)
CREATE UNIQUE INDEX "unique_active_org_invitation" ON "verification_tokens"("user_id", "organization_id")
WHERE "type" = 'ORGANIZATION_INVITATION' AND "consumed_at" IS NULL AND "revoked_at" IS NULL;

-- CreateIndex: PostgreSQL partial unique index for active email verification (per user)
CREATE UNIQUE INDEX "unique_active_email_verification" ON "verification_tokens"("user_id")
WHERE "type" = 'EMAIL_VERIFICATION' AND "consumed_at" IS NULL AND "revoked_at" IS NULL;
