import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { createPrismaClient } from "../db/prisma.js";
import { GatewayRegistry } from "../gateways/GatewayRegistry.js";
import { SmsMessageRegistry } from "./SmsMessageRegistry.js";

const prisma = createPrismaClient();
const registry = new SmsMessageRegistry(prisma);
const gatewayRegistry = new GatewayRegistry(prisma);
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
  await prisma.operatorAuditLog.deleteMany({
    where: {
      gatewayId
    }
  });

  await prisma.gateway.update({
    where: {
      gatewayId
    },
    data: {
      enabled: true
    }
  });

  await prisma.smsMessage.deleteMany({
    where: {
      idempotencyKey: {
        startsWith: keyPrefix
      }
    }
  });
});

after(async () => {
  await prisma.operatorAuditLog.deleteMany({
    where: {
      gatewayId
    }
  });

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


test("operator can resolve AMBIGUOUS without creating a retry", async () => {
  const queued = await registry.enqueue({
    idempotencyKey: `${keyPrefix}0008`,
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
    "callback outcome unknown"
  );

  const result = await registry.resolveAmbiguous(
    queued.message.id,
    "DELIVERED",
    "confirmed manually"
  );

  assert.equal(result.kind, "resolved");

  if (result.kind === "resolved") {
    assert.equal(result.message?.status, "DELIVERED");
    assert.equal(result.message?.attempts, 1);
    assert.equal(
      result.message?.operatorResolutionNote,
      "confirmed manually"
    );
    assert.ok(result.message?.operatorResolvedAt);
    assert.ok(result.message?.deliveredAt);
  }
});

test("operator resolution rejects non ambiguous jobs", async () => {
  const queued = await registry.enqueue({
    idempotencyKey: `${keyPrefix}0009`,
    gatewayId,
    destination: "+51987654321",
    message: "hola"
  });

  const result = await registry.resolveAmbiguous(
    queued.message.id,
    "FAILED",
    "should not be allowed"
  );

  assert.equal(result.kind, "invalid_state");

  const persisted = await registry.get(
    queued.message.id
  );

  assert.equal(persisted?.status, "QUEUED");
  assert.equal(persisted?.attempts, 0);
});


test("listPage and metrics summarize persisted messages", async () => {
  for (let index = 0; index < 6; index += 1) {
    await registry.enqueue({
      idempotencyKey: `${keyPrefix}page-${index}`,
      gatewayId,
      destination: "+51987654321",
      message: `page-${index}`
    });
  }

  const page = await registry.listPage({
    gatewayId,
    page: 2,
    perPage: 5
  });

  assert.equal(page.pagination.total, 6);
  assert.equal(page.pagination.page, 2);
  assert.equal(page.pagination.totalPages, 2);
  assert.equal(page.messages.length, 1);

  const metrics = await registry.metrics(gatewayId);

  assert.equal(metrics.total, 6);
  assert.equal(metrics.counts.QUEUED, 6);
  assert.equal(metrics.last24h, 6);
});

test("getDetail reconstructs the message timeline", async () => {
  const queued = await registry.enqueue({
    idempotencyKey: `${keyPrefix}timeline`,
    gatewayId,
    destination: "+51987654321",
    message: "timeline"
  });

  await registry.claim(queued.message.id, gatewayId);
  await registry.updateStatus(
    queued.message.id,
    gatewayId,
    "DELIVERED"
  );

  const detail = await registry.getDetail(
    queued.message.id
  );

  assert.deepEqual(
    detail?.timeline.map(event => event.kind),
    ["QUEUED", "CLAIMED", "DELIVERED"]
  );
});

test("gateway enable state is audited", async () => {
  const disabled = await gatewayRegistry.setEnabled(
    gatewayId,
    false,
    "maintenance test"
  );

  assert.equal(disabled.kind, "updated");

  if (disabled.kind === "updated") {
    assert.equal(disabled.gateway.enabled, false);
    assert.equal(disabled.gateway.online, false);
  }

  const reenabled = await gatewayRegistry.setEnabled(
    gatewayId,
    true,
    "maintenance finished"
  );

  assert.equal(reenabled.kind, "updated");

  if (reenabled.kind === "updated") {
    assert.equal(reenabled.gateway.enabled, true);
    assert.equal(reenabled.gateway.online, false);
  }

  await gatewayRegistry.touch(gatewayId, "test");

  const liveStatus =
    await gatewayRegistry.getStatus(gatewayId);

  assert.equal(liveStatus?.online, true);

  const audit = await gatewayRegistry.listAudit(10);

  assert.equal(audit[0]?.action, "GATEWAY_ENABLED");
  assert.equal(audit[1]?.action, "GATEWAY_DISABLED");
  assert.equal(audit[1]?.gatewayId, gatewayId);
  assert.equal(audit[1]?.note, "maintenance test");
});


test("gateway token rotation promotes the new token and revokes the old token", async () => {
  const rotationGatewayId = `GW-ROTATE-${suffix}`;

  try {
    const registered = await gatewayRegistry.register({
      gatewayId: rotationGatewayId,
      deviceId: `rotate-device-${suffix}`,
      deviceModel: "Rotation Test",
      androidVersion: "test",
      appVersion: "test"
    });

    const rotation =
      await gatewayRegistry.requestTokenRotation(
        rotationGatewayId,
        "rotation test"
      );

    assert.equal(rotation.kind, "pending");

    if (rotation.kind !== "pending") {
      return;
    }

    assert.equal(
      await gatewayRegistry.authenticate(
        rotationGatewayId,
        registered.token
      ),
      true
    );

    assert.equal(
      await gatewayRegistry.authenticate(
        rotationGatewayId,
        rotation.token
      ),
      true
    );

    assert.equal(
      await gatewayRegistry.authenticate(
        rotationGatewayId,
        registered.token
      ),
      false
    );

    const status = await gatewayRegistry.getStatus(
      rotationGatewayId
    );

    assert.equal(
      status?.tokenRotationPendingUntil,
      null
    );
    assert.ok(status?.tokenRotatedAt);

    const audit = await gatewayRegistry.listAudit(20);

    assert.equal(
      audit.some(
        entry =>
          entry.gatewayId === rotationGatewayId &&
          entry.action === "GATEWAY_TOKEN_ROTATED"
      ),
      true
    );
  } finally {
    await prisma.operatorAuditLog.deleteMany({
      where: {
        gatewayId: rotationGatewayId
      }
    });

    await prisma.gateway.deleteMany({
      where: {
        gatewayId: rotationGatewayId
      }
    });
  }
});

test("cancelled token rotation keeps the current token valid", async () => {
  const rotationGatewayId = `GW-CANCEL-ROTATE-${suffix}`;

  try {
    const registered = await gatewayRegistry.register({
      gatewayId: rotationGatewayId,
      deviceId: `cancel-rotate-device-${suffix}`,
      deviceModel: "Rotation Cancel Test",
      androidVersion: "test",
      appVersion: "test"
    });

    const rotation =
      await gatewayRegistry.requestTokenRotation(
        rotationGatewayId,
        "cancel rotation test"
      );

    assert.equal(rotation.kind, "pending");

    if (rotation.kind !== "pending") {
      return;
    }

    assert.equal(
      await gatewayRegistry.cancelTokenRotation(
        rotationGatewayId,
        "test cancellation"
      ),
      true
    );

    assert.equal(
      await gatewayRegistry.authenticate(
        rotationGatewayId,
        rotation.token
      ),
      false
    );

    assert.equal(
      await gatewayRegistry.authenticate(
        rotationGatewayId,
        registered.token
      ),
      true
    );
  } finally {
    await prisma.operatorAuditLog.deleteMany({
      where: {
        gatewayId: rotationGatewayId
      }
    });

    await prisma.gateway.deleteMany({
      where: {
        gatewayId: rotationGatewayId
      }
    });
  }
});
