import assert from "node:assert/strict";
import {
  after,
  beforeEach,
  test
} from "node:test";
import { createPrismaClient } from "../db/prisma.js";
import { SmsMessageRegistry } from "../messages/SmsMessageRegistry.js";
import { ApiClientRegistry } from "./ApiClientRegistry.js";

const prisma = createPrismaClient();
const clients = new ApiClientRegistry(prisma);
const messages = new SmsMessageRegistry(prisma);
const suffix = process.pid.toString();
const namePrefix = `TEST-CLIENT-${suffix}-`;
const gatewayId = `GW-CLIENT-TEST-${suffix}`;

async function cleanup() {
  const testClients =
    await prisma.apiClient.findMany({
      where: {
        name: {
          startsWith: namePrefix
        }
      },
      select: {
        id: true
      }
    });

  const ids = testClients.map(
    client => client.id
  );

  if (ids.length > 0) {
    await prisma.smsMessage.deleteMany({
      where: {
        clientId: {
          in: ids
        }
      }
    });

    await prisma.operatorAuditLog.deleteMany({
      where: {
        targetId: {
          in: ids
        }
      }
    });

    await prisma.apiClient.deleteMany({
      where: {
        id: {
          in: ids
        }
      }
    });
  }
}

beforeEach(async () => {
  await cleanup();

  await prisma.gateway.upsert({
    where: {
      gatewayId
    },
    create: {
      gatewayId,
      tokenHash: "0".repeat(64),
      deviceId: `client-device-${suffix}`,
      deviceModel: "API Client Test",
      androidVersion: "test",
      appVersion: "test",
      enabled: true,
      lastSeenAt: new Date()
    },
    update: {
      enabled: true,
      lastSeenAt: new Date()
    }
  });
});

after(async () => {
  await cleanup();

  await prisma.smsMessage.deleteMany({
    where: {
      gatewayId
    }
  });

  await prisma.operatorAuditLog.deleteMany({
    where: {
      gatewayId
    }
  });

  await prisma.gateway.deleteMany({
    where: {
      gatewayId
    }
  });

  await prisma.$disconnect();
});

test("client key authenticates and disabled client is rejected", async () => {
  const created = await clients.create({
    name: `${namePrefix}auth`,
    scopes: ["sms:send", "sms:read"],
    rateLimitPerMinute: 60,
    monthlyQuota: 100
  });

  assert.match(
    created.apiKey,
    /^sk_sms_[a-f0-9]{12}_/
  );

  const authenticated =
    await clients.authenticate(
      created.apiKey
    );

  assert.equal(
    authenticated?.id,
    created.client.id
  );

  assert.equal(
    await clients.authenticate(
      created.apiKey + "bad"
    ),
    null
  );

  await clients.setEnabled(
    created.client.id,
    false,
    "disable auth test"
  );

  assert.equal(
    await clients.authenticate(
      created.apiKey
    ),
    null
  );
});

test("rotating a client key invalidates the previous key", async () => {
  const created = await clients.create({
    name: `${namePrefix}rotate`,
    scopes: ["sms:send", "sms:read"],
    rateLimitPerMinute: 60,
    monthlyQuota: null
  });

  const rotated = await clients.rotateKey(
    created.client.id,
    "rotation test"
  );

  assert.equal(rotated.kind, "rotated");

  if (rotated.kind !== "rotated") {
    return;
  }

  assert.equal(
    await clients.authenticate(
      created.apiKey
    ),
    null
  );

  assert.equal(
    (
      await clients.authenticate(
        rotated.apiKey
      )
    )?.id,
    created.client.id
  );
});

test("same idempotency key is isolated between API clients", async () => {
  const first = await clients.create({
    name: `${namePrefix}idem-a`,
    scopes: ["sms:send"],
    rateLimitPerMinute: 60,
    monthlyQuota: null
  });

  const second = await clients.create({
    name: `${namePrefix}idem-b`,
    scopes: ["sms:send"],
    rateLimitPerMinute: 60,
    monthlyQuota: null
  });

  const idempotencyKey =
    `shared-key-${suffix}`;

  const firstMessage =
    await messages.enqueue({
      sourceId: first.client.id,
      clientId: first.client.id,
      idempotencyKey,
      gatewayId,
      destination: "+51987654321",
      message: "first"
    });

  const secondMessage =
    await messages.enqueue({
      sourceId: second.client.id,
      clientId: second.client.id,
      idempotencyKey,
      gatewayId,
      destination: "+51987654321",
      message: "second"
    });

  assert.equal(firstMessage.created, true);
  assert.equal(secondMessage.created, true);
  assert.notEqual(
    firstMessage.message.id,
    secondMessage.message.id
  );

  const retry = await messages.enqueue({
    sourceId: first.client.id,
    clientId: first.client.id,
    idempotencyKey,
    gatewayId,
    destination: "+51987654321",
    message: "first"
  });

  assert.equal(retry.created, false);
  assert.equal(
    retry.message.id,
    firstMessage.message.id
  );
});

test("monthly quota and per-client metrics use attributed messages", async () => {
  const created = await clients.create({
    name: `${namePrefix}quota`,
    scopes: ["sms:send", "sms:read"],
    rateLimitPerMinute: 10,
    monthlyQuota: 1
  });

  const before =
    await clients.checkSendAllowance(
      created.client.id
    );

  assert.equal(before.kind, "allowed");

  const queued = await messages.enqueue({
    sourceId: created.client.id,
    clientId: created.client.id,
    idempotencyKey:
      `quota-message-${suffix}`,
    gatewayId,
    destination: "+51987654321",
    message: "quota"
  });

  await messages.claim(
    queued.message.id,
    gatewayId
  );

  await messages.updateStatus(
    queued.message.id,
    gatewayId,
    "DELIVERED"
  );

  const blocked =
    await clients.checkSendAllowance(
      created.client.id
    );

  assert.equal(
    blocked.kind,
    "monthly_quota_exceeded"
  );

  const metrics = await clients.metrics(
    created.client.id
  );

  assert.equal(metrics?.total, 1);
  assert.equal(metrics?.monthUsage, 1);
  assert.equal(
    metrics?.counts.DELIVERED,
    1
  );
  assert.equal(
    metrics?.deliveryRate,
    100
  );
});
