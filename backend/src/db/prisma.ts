import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const developmentUrl =
  "postgresql://smsgateway:smsgateway_dev@127.0.0.1:54329/smsgateway?schema=public";

export function databaseUrl() {
  return process.env["DATABASE_URL"] ?? developmentUrl;
}

export function createPrismaClient(
  connectionString = databaseUrl()
) {
  const adapter = new PrismaPg(
    { connectionString },
    { schema: "public" }
  );

  return new PrismaClient({
    adapter
  });
}

export type AppPrismaClient = ReturnType<
  typeof createPrismaClient
>;
