-- CreateTable
CREATE TABLE "api_clients" (
    "id" VARCHAR(64) NOT NULL,
    "key_id" VARCHAR(24) NOT NULL,
    "key_hash" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "description" VARCHAR(500),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "scopes" TEXT[] DEFAULT ARRAY['sms:send', 'sms:read']::TEXT[],
    "rate_limit_per_minute" INTEGER NOT NULL DEFAULT 60,
    "monthly_quota" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "key_rotated_at" TIMESTAMP(3),

    CONSTRAINT "api_clients_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "sms_messages"
ADD COLUMN "source_id" VARCHAR(64) NOT NULL DEFAULT 'operator',
ADD COLUMN "client_id" VARCHAR(64);

-- DropIndex
DROP INDEX "sms_messages_idempotency_key_key";

-- CreateIndex
CREATE UNIQUE INDEX "api_clients_key_id_key" ON "api_clients"("key_id");

-- CreateIndex
CREATE INDEX "api_clients_enabled_last_used_at_idx" ON "api_clients"("enabled", "last_used_at");

-- CreateIndex
CREATE UNIQUE INDEX "sms_messages_source_id_idempotency_key_key" ON "sms_messages"("source_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "sms_messages_client_id_status_created_at_idx" ON "sms_messages"("client_id", "status", "created_at");

-- AddForeignKey
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "api_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
