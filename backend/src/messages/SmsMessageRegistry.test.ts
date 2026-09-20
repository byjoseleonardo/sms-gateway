import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { createPrismaClient } from "../db/prisma.js";
import { SmsMessageRegistry } from "./SmsMessageRegistry.js";

const prisma = createPrismaClient();
const registry = new SmsMessageRegistry(prisma);
const suffix = process.pid.toString();
const gatewayId = `GW-TEST-${suffix}`;
const keyPrefix = `test-${suffix}-`;

before(async () => {
  await prisma.gateway.upsert({
    where: {
      gatewayId
    },
    create: {
      gatewayId,
      tokenHash: "0".repeat(64),
      deviceId: `device-${suffix}`,
      deviceModel: "Test Device",
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

beforeEach(async () => {
  await prisma.smsMessage.deleteMany({
    where: {
      idempotencyKey: {
        startsWith: keyPrefix
      }
    }
  });
});

after(async () => {
  await prisma.smsMessage.deleteMany({
    where: {
      idempotencyKey: {
        startsWith: keyPrefix
      }
    }
  });

  await prisma.gateway.deleteMany({
    where: {
      gatewayId
    }
  });

  await prisma.$disconnect();
});

test("enqueue is idempotent by idempotencyKey", async () => {
  const idempotencyKey = `${keyPrefix}0001`;

  const first = await registry.enqueue({
    idempotencyKey,
    gatewayId,
    destination: "+51987654321",
    message: "hola"
  });

  const second = await registry.enqueue({
    idempotencyKey,
    gatewayId,
    destination: "+51987654321",
    message: "hola"
  });

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(first.message.id, second.message.id);
});

test("claim is idempotent for the same gateway", async () => {
  const queued = await registry.enqueue({
    idempotencyKey: `${keyPrefix}0002`,
    gatewayId,
    destination: "+51987654321",
    message: "hola"
  });

  const first = await registry.claim(
    queued.message.id,
    gatewayId
  );

  const second = await registry.claim(
    queued.message.id,
    gatewayId
  );

  assert.equal(first.kind, "claimed");
  assert.equal(second.kind, "claimed");

  if (
    first.kind === "claimed" &&
    second.kind === "claimed"
  ) {
    assert.equal(first.message.attempts, 1);
    assert.equal(second.message.attempts, 1);
  }
});

test("claim rejects another gateway", async () => {
  const queued = await registry.enqueue({
    idempotencyKey: `${keyPrefix}0003`,
    gatewayId,
    destination: "+51987654321",
    message: "hola"
  });

  const result = await registry.claim(
    queued.message.id,
    "GW-OTHER"
  );

  assert.equal(result.kind, "forbidden");
});

test("late SENT cannot downgrade DELIVERED", async () => {
  const queued = await registry.enqueue({
    idempotencyKey: `${keyPrefix}0004`,
    gatewayId,
    destination: "+51987654321",
    message: "hola"
  });

  await registry.claim(
    queued.message.id,
    gatewayId
  );

  await registry.updateStatus(
    queued.message.id,
    gatewayId,
    "DELIVERED"
  );

  await registry.updateStatus(
    queued.message.id,
    gatewayId,
    "SENT"
  );

  const finalState = await registry.get(
    queued.message.id
  );

  assert.equal(finalState?.status, "DELIVERED");
  assert.ok(finalState?.sentAt);
  assert.ok(finalState?.deliveredAt);
});


test("ambiguous job can be resolved by a later SENT callback", async () => {
  const queued = await registry.enqueue({
    idempotencyKey: `${keyPrefix}0005`,
    gatewayId,
    destination: "+51987654321",
    message: "hola"
  });

  await registry.claim(
    queued.message.id,
    gatewayId
  );

  await registry.updateStatus(
    queued.message.id,
    gatewayId,
    "AMBIGUOUS",
    "process restarted before callback"
  );

  const ambiguous = await registry.get(
    queued.message.id
  );

  assert.equal(ambiguous?.status, "AMBIGUOUS");

  await registry.updateStatus(
    queued.message.id,
    gatewayId,
    "SENT"
  );

  const resolved = await registry.get(
    queued.message.id
  );

  assert.equal(resolved?.status, "SENT");
  assert.ok(resolved?.sentAt);
  assert.equal(resolved?.lastError, null);
});


test("heartbeat repair only reannounces QUEUED jobs", async () => {
  const queued = await registry.enqueue({
    idempotencyKey: `${keyPrefix}0006`,
    gatewayId,
    destination: "+51987654321",
    message: "queued"
  });

  const claimed = await registry.enqueue({
    idempotencyKey: `${keyPrefix}0007`,
    gatewayId,
    destination: "+51987654321",
    message: "claimed"
  });

  await registry.claim(
    claimed.message.id,
    gatewayId
  );

  const repairCandidates =
    await registry.getQueuedForGateway(gatewayId);

  assert.equal(
    repairCandidates.some(
      job => job.id === queued.message.id
    ),
    true
  );

  assert.equal(
    repairCandidates.some(
      job => job.id === claimed.message.id
    ),
    false
  );
});
