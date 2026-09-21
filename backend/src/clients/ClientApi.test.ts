import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  after,
  before,
  test
} from "node:test";
import { createApp } from "../app.js";
import { ApiClientRegistry } from "./ApiClientRegistry.js";
import { createPrismaClient } from "../db/prisma.js";
import { GatewayRegistry } from "../gateways/GatewayRegistry.js";
import { SmsMessageRegistry } from "../messages/SmsMessageRegistry.js";

const prisma = createPrismaClient();
const gatewayRegistry = new GatewayRegistry(prisma);
const apiClientRegistry = new ApiClientRegistry(prisma);
const messageRegistry = new SmsMessageRegistry(prisma);

const suffix = process.pid.toString();
const gatewayId = `GW-HTTP-CLIENT-${suffix}`;
const clientName = `HTTP-CLIENT-${suffix}`;
const otherClientName = `HTTP-OTHER-${suffix}`;
const operatorKey =
  "test-operator-key-000000000000000000000001";
const enrollmentKey =
  "test-enrollment-key-00000000000000000001";

let server: ReturnType<typeof createServer>;
let baseUrl = "";
let clientId = "";
let otherClientId = "";
let adminClientId = "";
let clientKey = "";
let otherClientKey = "";
const signaledJobs: string[] = [];

before(async () => {
  await prisma.gateway.upsert({
    where: {
      gatewayId
    },
    create: {
      gatewayId,
      tokenHash: "3".repeat(64),
      deviceId: `http-client-device-${suffix}`,
      deviceModel: "HTTP Synthetic",
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

  const client = await apiClientRegistry.create({
    name: clientName,
    scopes: ["sms:send", "sms:read"],
    rateLimitPerMinute: 10,
    monthlyQuota: 100
  });

  clientId = client.client.id;
  clientKey = client.apiKey;

  const other = await apiClientRegistry.create({
    name: otherClientName,
    scopes: ["sms:read"],
    rateLimitPerMinute: 10,
    monthlyQuota: 100
  });

  otherClientId = other.client.id;
  otherClientKey = other.apiKey;

  const app = createApp(
    gatewayRegistry,
    apiClientRegistry,
    messageRegistry,
    (_gatewayId, jobId) => {
      signaledJobs.push(jobId);
    },
    async () => false,
    operatorKey,
    enrollmentKey
  );

  server = createServer(app);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve();
    });
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("test_server_address_unavailable");
  }

  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>(resolve => {
    server.close(() => resolve());
  });

  const cleanupClientIds = [
    clientId,
    otherClientId,
    adminClientId
  ].filter(Boolean);

  await prisma.smsMessage.deleteMany({
    where: {
      clientId: {
        in: cleanupClientIds
      }
    }
  });

  await prisma.operatorAuditLog.deleteMany({
    where: {
      targetId: {
        in: cleanupClientIds
      }
    }
  });

  await prisma.apiClient.deleteMany({
    where: {
      id: {
        in: cleanupClientIds
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

test("external client API enqueues idempotently without a real gateway socket", async () => {
  const payload = {
    idempotencyKey:
      `http-client-idem-${suffix}`,
    gatewayId,
    destination: "+51999999999",
    message: "Synthetic HTTP API validation"
  };

  const firstResponse = await fetch(
    `${baseUrl}/api/v1/client/messages`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${clientKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );

  assert.equal(firstResponse.status, 201);

  const first = await firstResponse.json() as {
    created: boolean;
    message: {
      id: string;
      clientId: string | null;
      status: string;
    };
  };

  assert.equal(first.created, true);
  assert.equal(first.message.clientId, clientId);
  assert.equal(first.message.status, "QUEUED");
  assert.deepEqual(signaledJobs, [first.message.id]);

  const replayResponse = await fetch(
    `${baseUrl}/api/v1/client/messages`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${clientKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );

  assert.equal(replayResponse.status, 200);

  const replay = await replayResponse.json() as {
    created: boolean;
    message: {
      id: string;
    };
  };

  assert.equal(replay.created, false);
  assert.equal(replay.message.id, first.message.id);
  assert.deepEqual(signaledJobs, [first.message.id]);

  const readResponse = await fetch(
    `${baseUrl}/api/v1/client/messages/${first.message.id}`,
    {
      headers: {
        authorization: `Bearer ${clientKey}`
      }
    }
  );

  assert.equal(readResponse.status, 200);

  const usageResponse = await fetch(
    `${baseUrl}/api/v1/client/usage`,
    {
      headers: {
        authorization: `Bearer ${clientKey}`
      }
    }
  );

  assert.equal(usageResponse.status, 200);

  const usage = await usageResponse.json() as {
    total: number;
    monthUsage: number;
  };

  assert.equal(usage.total, 1);
  assert.equal(usage.monthUsage, 1);

  const foreignRead = await fetch(
    `${baseUrl}/api/v1/client/messages/${first.message.id}`,
    {
      headers: {
        authorization: `Bearer ${otherClientKey}`
      }
    }
  );

  assert.equal(foreignRead.status, 404);
});

test("operator HTTP API manages API clients without exposing keys later", async () => {
  const createResponse = await fetch(
    `${baseUrl}/api/v1/clients`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${operatorKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        name: `HTTP-ADMIN-${suffix}`,
        description: "admin route test",
        scopes: ["sms:send", "sms:read"],
        rateLimitPerMinute: 20,
        monthlyQuota: 200
      })
    }
  );

  assert.equal(createResponse.status, 201);
  assert.equal(
    createResponse.headers.get("cache-control"),
    "no-store"
  );

  const created = await createResponse.json() as {
    client: {
      id: string;
      keyId: string;
    };
    apiKey: string;
  };

  adminClientId = created.client.id;

  assert.match(
    created.apiKey,
    /^sk_sms_[a-f0-9]{12}_/
  );

  const listResponse = await fetch(
    `${baseUrl}/api/v1/clients`,
    {
      headers: {
        authorization: `Bearer ${operatorKey}`
      }
    }
  );

  assert.equal(listResponse.status, 200);

  const list = await listResponse.json() as {
    clients: Array<{
      id: string;
      keyHash?: string;
      monthlyUsage: number;
    }>;
  };

  const listed = list.clients.find(
    item => item.id === adminClientId
  );

  assert.ok(listed);
  assert.equal("keyHash" in (listed ?? {}), false);

  const limitsResponse = await fetch(
    `${baseUrl}/api/v1/clients/${adminClientId}/limits`,
    {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${operatorKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        scopes: ["sms:read"],
        rateLimitPerMinute: 5,
        monthlyQuota: 50,
        note: "adjust test limits"
      })
    }
  );

  assert.equal(limitsResponse.status, 200);

  const rotationResponse = await fetch(
    `${baseUrl}/api/v1/clients/${adminClientId}/rotate-key`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${operatorKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        note: "rotate test key"
      })
    }
  );

  assert.equal(rotationResponse.status, 200);
  assert.equal(
    rotationResponse.headers.get("cache-control"),
    "no-store"
  );

  const rotated = await rotationResponse.json() as {
    apiKey: string;
  };

  assert.notEqual(rotated.apiKey, created.apiKey);

  const disableResponse = await fetch(
    `${baseUrl}/api/v1/clients/${adminClientId}`,
    {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${operatorKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        enabled: false,
        note: "disable admin test"
      })
    }
  );

  assert.equal(disableResponse.status, 200);

  const disabledUsageResponse = await fetch(
    `${baseUrl}/api/v1/client/usage`,
    {
      headers: {
        authorization: `Bearer ${rotated.apiKey}`
      }
    }
  );

  assert.equal(disabledUsageResponse.status, 401);
});

test("external client API rejects invalid credentials", async () => {
  const response = await fetch(
    `${baseUrl}/api/v1/client/usage`,
    {
      headers: {
        authorization:
          "Bearer sk_sms_000000000000_invalidcredential"
      }
    }
  );

  assert.equal(response.status, 401);
});
