import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { createPrismaClient } from "../src/db/prisma.js";

const gatewaySchema = z.object({
  gatewayId: z.string(),
  tokenHash: z.string(),
  deviceId: z.string(),
  deviceModel: z.string(),
  androidVersion: z.string(),
  appVersion: z.string(),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastSeenAt: z.string().nullable()
});

const messageStatusSchema = z.enum([
  "QUEUED",
  "CLAIMED",
  "SENT",
  "DELIVERED",
  "FAILED"
]);

const messageSchema = z.object({
  id: z.string(),
  idempotencyKey: z.string(),
  gatewayId: z.string(),
  destination: z.string(),
  message: z.string(),
  status: messageStatusSchema,
  attempts: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
  claimedAt: z.string().nullable(),
  sentAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  lastError: z.string().nullable()
});

const prisma = createPrismaClient();

async function readJson<T>(
  filePath: string,
  schema: z.ZodType<T>
): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return schema.parse(JSON.parse(raw));
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return null;
    }

    throw error;
  }
}

async function main() {
  const dataDir = path.resolve("data");

  const gatewayData = await readJson(
    path.join(dataDir, "gateways.json"),
    z.object({
      gateways: z.array(gatewaySchema)
    })
  );

  let gatewayCount = 0;

  for (const gateway of gatewayData?.gateways ?? []) {
    await prisma.gateway.upsert({
      where: {
        gatewayId: gateway.gatewayId
      },
      create: {
        gatewayId: gateway.gatewayId,
        tokenHash: gateway.tokenHash,
        deviceId: gateway.deviceId,
        deviceModel: gateway.deviceModel,
        androidVersion: gateway.androidVersion,
        appVersion: gateway.appVersion,
        enabled: gateway.enabled,
        createdAt: new Date(gateway.createdAt),
        updatedAt: new Date(gateway.updatedAt),
        lastSeenAt: gateway.lastSeenAt
          ? new Date(gateway.lastSeenAt)
          : null
      },
      update: {
        tokenHash: gateway.tokenHash,
        deviceId: gateway.deviceId,
        deviceModel: gateway.deviceModel,
        androidVersion: gateway.androidVersion,
        appVersion: gateway.appVersion,
        enabled: gateway.enabled,
        updatedAt: new Date(gateway.updatedAt),
        lastSeenAt: gateway.lastSeenAt
          ? new Date(gateway.lastSeenAt)
          : null
      }
    });

    gatewayCount += 1;
  }

  const messageData = await readJson(
    path.join(dataDir, "messages.json"),
    z.object({
      messages: z.array(messageSchema)
    })
  );

  let messageCount = 0;

  for (const message of messageData?.messages ?? []) {
    await prisma.smsMessage.upsert({
      where: {
        id: message.id
      },
      create: {
        id: message.id,
        idempotencyKey: message.idempotencyKey,
        gatewayId: message.gatewayId,
        destination: message.destination,
        message: message.message,
        status: message.status,
        attempts: message.attempts,
        createdAt: new Date(message.createdAt),
        updatedAt: new Date(message.updatedAt),
        claimedAt: message.claimedAt
          ? new Date(message.claimedAt)
          : null,
        sentAt: message.sentAt
          ? new Date(message.sentAt)
          : null,
        deliveredAt: message.deliveredAt
          ? new Date(message.deliveredAt)
          : null,
        lastError: message.lastError
      },
      update: {
        idempotencyKey: message.idempotencyKey,
        gatewayId: message.gatewayId,
        destination: message.destination,
        message: message.message,
        status: message.status,
        attempts: message.attempts,
        updatedAt: new Date(message.updatedAt),
        claimedAt: message.claimedAt
          ? new Date(message.claimedAt)
          : null,
        sentAt: message.sentAt
          ? new Date(message.sentAt)
          : null,
        deliveredAt: message.deliveredAt
          ? new Date(message.deliveredAt)
          : null,
        lastError: message.lastError
      }
    });

    messageCount += 1;
  }

  console.log(
    `Imported ${gatewayCount} gateway(s) and ${messageCount} message(s)`
  );
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
