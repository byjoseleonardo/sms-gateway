-- CreateTable
CREATE TABLE "operator_audit_logs" (
    "id" VARCHAR(64) NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "target_id" VARCHAR(128) NOT NULL,
    "note" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gateway_id" VARCHAR(64),

    CONSTRAINT "operator_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "operator_audit_logs_created_at_idx" ON "operator_audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "operator_audit_logs_gateway_id_created_at_idx" ON "operator_audit_logs"("gateway_id", "created_at");

-- AddForeignKey
ALTER TABLE "operator_audit_logs" ADD CONSTRAINT "operator_audit_logs_gateway_id_fkey" FOREIGN KEY ("gateway_id") REFERENCES "gateways"("gateway_id") ON DELETE SET NULL ON UPDATE CASCADE;
