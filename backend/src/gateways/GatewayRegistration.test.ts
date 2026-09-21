import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createPrismaClient } from "../db/prisma.js";
import { GatewayRegistry } from "./GatewayRegistry.js";

const prisma = createPrismaClient();
const registry = new GatewayRegistry(prisma);
const suffix = process.pid.toString();
const createdGatewayIds: string[] = [];

after(async () => {
  if (createdGatewayIds.length > 0) {
    await prisma.operatorAuditLog.deleteMany({
      where: {
        gatewayId: {
          in: createdGatewayIds
        }
      }
    });

    await prisma.gateway.deleteMany({
      where: {
        gatewayId: {
          in: createdGatewayIds
        }
      }
    });
  }

  await prisma.$disconnect();
});

test("backend assigns a gateway id when Android does not provide one", async () => {
  const deviceId = `auto-device-${suffix}`;

  const registered = await registry.register({
    deviceId,
    deviceModel: "Auto ID Test",
    androidVersion: "test",
    appVersion: "0.18.0"
  });

  createdGatewayIds.push(registered.gatewayId);

  assert.match(
    registered.gatewayId,
    /^gw_[0-9a-f-]{36}$/
  );

  assert.equal(
    await registry.authenticate(
      registered.gatewayId,
      registered.token
    ),
    true
  );
});

test("re-enrolling the same device preserves its server-assigned gateway id", async () => {
  const deviceId = `reenroll-device-${suffix}`;

  const first = await registry.register({
    deviceId,
    deviceModel: "Re-enroll Test",
    androidVersion: "test",
    appVersion: "0.18.0"
  });

  createdGatewayIds.push(first.gatewayId);

  const second = await registry.register({
    deviceId,
    deviceModel: "Re-enroll Test Updated",
    androidVersion: "test-2",
    appVersion: "0.18.0"
  });

  assert.equal(second.gatewayId, first.gatewayId);
  assert.notEqual(second.token, first.token);

  assert.equal(
    await registry.authenticate(
      first.gatewayId,
      first.token
    ),
    false
  );

  assert.equal(
    await registry.authenticate(
      second.gatewayId,
      second.token
    ),
    true
  );
});

test("legacy Android clients can still provide their existing gateway id", async () => {
  const gatewayId = `GW-LEGACY-${suffix}`;

  const registered = await registry.register({
    gatewayId,
    deviceId: `legacy-device-${suffix}`,
    deviceModel: "Legacy Test",
    androidVersion: "test",
    appVersion: "0.16.0"
  });

  createdGatewayIds.push(registered.gatewayId);

  assert.equal(registered.gatewayId, gatewayId);
});
