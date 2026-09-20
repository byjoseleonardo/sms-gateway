import { defineConfig } from "prisma/config";

const developmentUrl =
  "postgresql://smsgateway:smsgateway_dev@127.0.0.1:54329/smsgateway?schema=public";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations"
  },
  datasource: {
    url: process.env["DATABASE_URL"] ?? developmentUrl
  }
});
