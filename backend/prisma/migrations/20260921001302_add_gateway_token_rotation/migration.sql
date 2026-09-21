-- AlterTable
ALTER TABLE "gateways" ADD COLUMN     "pending_token_expires_at" TIMESTAMP(3),
ADD COLUMN     "pending_token_hash" VARCHAR(64),
ADD COLUMN     "token_rotated_at" TIMESTAMP(3);
