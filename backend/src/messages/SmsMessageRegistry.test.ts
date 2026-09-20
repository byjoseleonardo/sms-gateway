import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { SmsMessageRegistry } from "./SmsMessageRegistry.js";

async function withRegistry(
  run: (registry: SmsMessageRegistry) => Promise<void>
) {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "sms-message-registry-")
  );

  try {
    const registry = new SmsMessageRegistry(
      path.join(dir, "messages.json")
    );

    await run(registry);
  } finally {
    await fs.rm(dir, {
      recursive: true,
      force: true
    });
  }
}

test("enqueue is idempotent by idempotencyKey", async () => {
  await withRegistry(async registry => {
    const first = await registry.enqueue({
      idempotencyKey: "request-0001",
      gatewayId: "GW-A03-001",
      destination: "+51987654321",
      message: "hola"
    });

    const second = await registry.enqueue({
      idempotencyKey: "request-0001",
      gatewayId: "GW-A03-001",
      destination: "+51987654321",
      message: "hola"
    });

    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(first.message.id, second.message.id);
  });
});

test("claim is idempotent for the same gateway", async () => {
  await withRegistry(async registry => {
    const queued = await registry.enqueue({
      idempotencyKey: "request-0002",
      gatewayId: "GW-A03-001",
      destination: "+51987654321",
      message: "hola"
    });

    const first = await registry.claim(
      queued.message.id,
      "GW-A03-001"
    );

    const second = await registry.claim(
      queued.message.id,
      "GW-A03-001"
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
});

test("claim rejects another gateway", async () => {
  await withRegistry(async registry => {
    const queued = await registry.enqueue({
      idempotencyKey: "request-0003",
      gatewayId: "GW-A03-001",
      destination: "+51987654321",
      message: "hola"
    });

    const result = await registry.claim(
      queued.message.id,
      "GW-OTHER"
    );

    assert.equal(result.kind, "forbidden");
  });
});

test("late SENT cannot downgrade DELIVERED", async () => {
  await withRegistry(async registry => {
    const queued = await registry.enqueue({
      idempotencyKey: "request-0004",
      gatewayId: "GW-A03-001",
      destination: "+51987654321",
      message: "hola"
    });

    await registry.claim(
      queued.message.id,
      "GW-A03-001"
    );

    await registry.updateStatus(
      queued.message.id,
      "GW-A03-001",
      "DELIVERED"
    );

    await registry.updateStatus(
      queued.message.id,
      "GW-A03-001",
      "SENT"
    );

    const finalState = await registry.get(
      queued.message.id
    );

    assert.equal(finalState?.status, "DELIVERED");
  });
});
