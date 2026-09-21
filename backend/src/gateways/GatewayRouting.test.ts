import assert from "node:assert/strict";
import { test } from "node:test";
import { pickGatewayForRouting } from "./GatewayRegistry.js";

test("routing prefers the gateway with fewer active jobs", () => {
  const selected = pickGatewayForRouting([
    {
      gatewayId: "GW-B",
      activeJobs: 2,
      assignedLast24h: 4
    },
    {
      gatewayId: "GW-A",
      activeJobs: 0,
      assignedLast24h: 20
    }
  ]);

  assert.equal(selected?.gatewayId, "GW-A");
});

test("routing uses recent assignments as the second balancing criterion", () => {
  const selected = pickGatewayForRouting([
    {
      gatewayId: "GW-A",
      activeJobs: 1,
      assignedLast24h: 9
    },
    {
      gatewayId: "GW-B",
      activeJobs: 1,
      assignedLast24h: 3
    }
  ]);

  assert.equal(selected?.gatewayId, "GW-B");
});

test("routing is deterministic when load is tied", () => {
  const candidates = [
    {
      gatewayId: "GW-B",
      activeJobs: 0,
      assignedLast24h: 0
    },
    {
      gatewayId: "GW-A",
      activeJobs: 0,
      assignedLast24h: 0
    }
  ];

  const selected = pickGatewayForRouting(candidates);

  assert.equal(selected?.gatewayId, "GW-A");
  assert.equal(candidates[0]?.gatewayId, "GW-B");
});

test("routing returns null without candidates", () => {
  assert.equal(pickGatewayForRouting([]), null);
});
