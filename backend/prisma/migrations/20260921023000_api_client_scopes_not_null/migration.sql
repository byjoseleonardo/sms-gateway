-- Align Prisma required array semantics with PostgreSQL
ALTER TABLE "api_clients"
ALTER COLUMN "scopes" SET NOT NULL;
