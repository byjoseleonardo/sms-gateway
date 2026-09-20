import cors from "cors";
import express from "express";
import { z } from "zod";
import {
  GatewayRegistrationConflictError,
  type GatewayRegistry
} from "./gateways/GatewayRegistry.js";
import { gatewayAuth } from "./gateways/gatewayAuth.js";

export const APP_VERSION = "0.2.0";

const registrationSchema = z.object({
  gatewayId: z.string().trim().min(3).max(64),
  deviceId: z.string().trim().min(3).max(128),
  deviceModel: z.string().trim().min(1).max(128),
  androidVersion: z.string().trim().min(1).max(64),
  appVersion: z.string().trim().min(1).max(64)
});

const heartbeatSchema = z.object({
  appVersion: z.string().trim().min(1).max(64).optional()
});

export function createApp(registry: GatewayRegistry) {
  const app = express();

  app.disable("x-powered-by");
  app.use(cors());
  app.use(express.json({ limit: "64kb" }));

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "sms-gateway-backend",
      version: APP_VERSION,
      timestamp: new Date().toISOString()
    });
  });

  app.get("/api/v1/gateway/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "sms-gateway-backend",
      version: APP_VERSION,
      timestamp: new Date().toISOString()
    });
  });

  app.post("/api/v1/gateways/register", async (req, res, next) => {
    const parsed = registrationSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: "invalid_registration_payload",
        details: parsed.error.flatten()
      });
      return;
    }

    try {
      const result = await registry.register(parsed.data);
      res.status(201).json(result);
    } catch (error) {
      if (error instanceof GatewayRegistrationConflictError) {
        res.status(409).json({
          error: "gateway_id_already_registered"
        });
        return;
      }

      next(error);
    }
  });

  app.post(
    "/api/v1/gateways/heartbeat",
    gatewayAuth(registry),
    async (req, res) => {
      const parsed = heartbeatSchema.safeParse(req.body ?? {});

      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_heartbeat_payload"
        });
        return;
      }

      const gatewayId = res.locals.gatewayId as string;
      const gateway = await registry.touch(
        gatewayId,
        parsed.data.appVersion
      );

      res.json({
        status: "ok",
        gatewayId,
        lastSeenAt: gateway?.lastSeenAt ?? null
      });
    }
  );

  app.get(
    "/api/v1/gateways/:gatewayId/status",
    gatewayAuth(registry),
    async (req, res) => {
      const authenticatedGatewayId = res.locals.gatewayId as string;

      if (authenticatedGatewayId !== req.params.gatewayId) {
        res.status(403).json({
          error: "gateway_scope_mismatch"
        });
        return;
      }

      const status = await registry.getStatus(authenticatedGatewayId);

      if (!status) {
        res.status(404).json({
          error: "gateway_not_found"
        });
        return;
      }

      res.json(status);
    }
  );

  return app;
}
