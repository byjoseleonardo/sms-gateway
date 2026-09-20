-- CreateEnum
CREATE TYPE "SmsMessageStatus" AS ENUM ('QUEUED', 'CLAIMED', 'SENT', 'DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "gateways" (
    "gateway_id" VARCHAR(64) NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "device_id" VARCHAR(128) NOT NULL,
    "device_model" VARCHAR(128) NOT NULL,
    "android_version" VARCHAR(64) NOT NULL,
    "app_version" VARCHAR(64) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3),

    CONSTRAINT "gateways_pkey" PRIMARY KEY ("gateway_id")
);

-- CreateTable
CREATE TABLE "sms_messages" (
    "id" VARCHAR(64) NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "gateway_id" VARCHAR(64) NOT NULL,
    "destination" VARCHAR(32) NOT NULL,
    "message" VARCHAR(160) NOT NULL,
    "status" "SmsMessageStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "claimed_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "last_error" VARCHAR(500),

    CONSTRAINT "sms_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gateways_last_seen_at_idx" ON "gateways"("last_seen_at");

-- CreateIndex
CREATE UNIQUE INDEX "sms_messages_idempotency_key_key" ON "sms_messages"("idempotency_key");

-- CreateIndex
CREATE INDEX "sms_messages_gateway_id_status_created_at_idx" ON "sms_messages"("gateway_id", "status", "created_at");

-- AddForeignKey
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_gateway_id_fkey" FOREIGN KEY ("gateway_id") REFERENCES "gateways"("gateway_id") ON DELETE RESTRICT ON UPDATE CASCADE;
