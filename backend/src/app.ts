import cors from "cors";
import express from "express";
import { z } from "zod";
import {
  GatewayRegistrationConflictError,
  type GatewayRegistry
} from "./gateways/GatewayRegistry.js";
import { gatewayAuth } from "./gateways/gatewayAuth.js";
import type { SmsMessageRegistry } from "./messages/SmsMessageRegistry.js";

export const APP_VERSION = "0.7.0";

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

const enqueueMessageSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(128),
  gatewayId: z.string().trim().min(3).max(64),
  destination: z.string().trim().regex(/^\+[1-9]\d{7,14}$/),
  message: z.string().min(1).max(160)
});

const updateMessageStatusSchema = z.object({
  status: z.enum(["SENT", "DELIVERED", "FAILED", "AMBIGUOUS"]),
  error: z.string().trim().max(500).optional()
});

export function createApp(
  gatewayRegistry: GatewayRegistry,
  messageRegistry: SmsMessageRegistry,
  onMessageAvailable: (gatewayId: string, jobId: string) => void
) {
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
      const result = await gatewayRegistry.register(parsed.data);
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
    gatewayAuth(gatewayRegistry),
    async (req, res) => {
      const parsed = heartbeatSchema.safeParse(req.body ?? {});

      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_heartbeat_payload"
        });
        return;
      }

      const gatewayId = res.locals.gatewayId as string;
      const gateway = await gatewayRegistry.touch(
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
    gatewayAuth(gatewayRegistry),
    async (req, res) => {
      const authenticatedGatewayId = res.locals.gatewayId as string;

      if (authenticatedGatewayId !== req.params.gatewayId) {
        res.status(403).json({
          error: "gateway_scope_mismatch"
        });
        return;
      }

      const status = await gatewayRegistry.getStatus(authenticatedGatewayId);

      if (!status) {
        res.status(404).json({
          error: "gateway_not_found"
        });
        return;
      }

      res.json(status);
    }
  );

  app.post("/api/v1/messages", async (req, res) => {
    const parsed = enqueueMessageSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: "invalid_message_payload",
        details: parsed.error.flatten()
      });
      return;
    }

    const gateway = await gatewayRegistry.getStatus(parsed.data.gatewayId);

    if (!gateway || !gateway.enabled) {
      res.status(404).json({
        error: "gateway_not_available"
      });
      return;
    }

    const result = await messageRegistry.enqueue(parsed.data);

    if (
      result.message.status === "QUEUED" ||
      result.message.status === "CLAIMED"
    ) {
      onMessageAvailable(
        result.message.gatewayId,
        result.message.id
      );
    }

    res.status(result.created ? 201 : 200).json({
      created: result.created,
      message: result.message
    });
  });

  app.get("/api/v1/messages/:jobId", async (req, res) => {
    const message = await messageRegistry.get(req.params.jobId as string);

    if (!message) {
      res.status(404).json({
        error: "message_not_found"
      });
      return;
    }

    res.json(message);
  });

  app.get(
    "/api/v1/gateway/jobs/available",
    gatewayAuth(gatewayRegistry),
    async (_req, res) => {
      const gatewayId = res.locals.gatewayId as string;
      const jobs = await messageRegistry.getAvailableForGateway(gatewayId);

      res.json({
        jobs: jobs.map(job => ({
          id: job.id,
          status: job.status
        }))
      });
    }
  );

  app.post(
    "/api/v1/gateway/jobs/:jobId/claim",
    gatewayAuth(gatewayRegistry),
    async (req, res) => {
      const gatewayId = res.locals.gatewayId as string;
      const result = await messageRegistry.claim(
        req.params.jobId as string,
        gatewayId
      );

      if (result.kind === "not_found") {
        res.status(404).json({
          error: "message_not_found"
        });
        return;
      }

      if (result.kind === "forbidden") {
        res.status(403).json({
          error: "message_gateway_mismatch"
        });
        return;
      }

      if (result.kind === "already_processed") {
        res.status(409).json({
          error: "message_already_processed",
          message: result.message
        });
        return;
      }

      res.json({
        id: result.message.id,
        destination: result.message.destination,
        message: result.message.message,
        status: result.message.status,
        attempts: result.message.attempts
      });
    }
  );

  app.post(
    "/api/v1/gateway/jobs/:jobId/status",
    gatewayAuth(gatewayRegistry),
    async (req, res) => {
      const parsed = updateMessageStatusSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_message_status"
        });
        return;
      }

      const gatewayId = res.locals.gatewayId as string;
      const result = await messageRegistry.updateStatus(
        req.params.jobId as string,
        gatewayId,
        parsed.data.status,
        parsed.data.error
      );

      if (result.kind === "not_found") {
        res.status(404).json({
          error: "message_not_found"
        });
        return;
      }

      if (result.kind === "forbidden") {
        res.status(403).json({
          error: "message_gateway_mismatch"
        });
        return;
      }

      res.json({
        status: "ok",
        message: result.message
      });
    }
  );

  return app;
}
