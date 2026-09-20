-- AlterTable
ALTER TABLE "sms_messages" ADD COLUMN     "operator_resolution_note" VARCHAR(500),
ADD COLUMN     "operator_resolved_at" TIMESTAMP(3);
