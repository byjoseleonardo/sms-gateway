import express from "express";
import { z } from "zod";
import {
  GatewayRegistrationConflictError,
  type GatewayRegistry
} from "./gateways/GatewayRegistry.js";
import { gatewayAuth } from "./gateways/gatewayAuth.js";
import type { SmsMessageRegistry } from "./messages/SmsMessageRegistry.js";
import { operatorPageHtml } from "./operator/operatorPage.js";
import { operatorApiKeyAuth } from "./security/operatorApiKeyAuth.js";
import { gatewayEnrollmentAuth } from "./security/gatewayEnrollmentAuth.js";

export const APP_VERSION = "0.15.0";

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

const listMessagesQuerySchema = z.object({
  gatewayId: z.string().trim().min(3).max(64).optional(),
  status: z.enum([
    "QUEUED",
    "CLAIMED",
    "SENT",
    "DELIVERED",
    "FAILED",
    "AMBIGUOUS"
  ]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(5).max(100).default(25)
});

const metricsQuerySchema = z.object({
  gatewayId: z.string().trim().min(3).max(64).optional()
});

const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

const gatewayControlSchema = z.object({
  enabled: z.boolean(),
  note: z.string().trim().min(3).max(500)
});

const gatewayTokenRotationSchema = z.object({
  note: z.string().trim().min(3).max(500)
});

const resolveAmbiguousSchema = z.object({
  status: z.enum(["SENT", "DELIVERED", "FAILED"]),
  note: z.string().trim().min(3).max(500)
});

export function createApp(
  gatewayRegistry: GatewayRegistry,
  messageRegistry: SmsMessageRegistry,
  onMessageAvailable: (gatewayId: string, jobId: string) => void,
  onGatewayTokenRotation: (
    gatewayId: string,
    token: string,
    expiresAt: string
  ) => Promise<boolean>,
  operatorApiKey: string,
  gatewayEnrollmentKey: string
) {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));

  const operatorAuth = operatorApiKeyAuth(operatorApiKey);
  const enrollmentAuth = gatewayEnrollmentAuth(gatewayEnrollmentKey);

  app.get("/operator", (_req, res) => {
    res
      .status(200)
      .type("html")
      .send(operatorPageHtml(APP_VERSION));
  });

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

  app.post("/api/v1/gateways/register", enrollmentAuth, async (req, res, next) => {
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

  app.get("/api/v1/gateways", operatorAuth, async (_req, res) => {
    const gateways = await gatewayRegistry.list();

    res.json({
      gateways
    });
  });

  app.patch(
    "/api/v1/gateways/:gatewayId",
    operatorAuth,
    async (req, res) => {
      const parsed = gatewayControlSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_gateway_control_payload",
          details: parsed.error.flatten()
        });
        return;
      }

      const result = await gatewayRegistry.setEnabled(
        req.params.gatewayId as string,
        parsed.data.enabled,
        parsed.data.note
      );

      if (result.kind === "not_found") {
        res.status(404).json({
          error: "gateway_not_found"
        });
        return;
      }

      res.json({
        status: "ok",
        gateway: result.gateway
      });
    }
  );

  app.post(
    "/api/v1/gateways/:gatewayId/rotate-token",
    operatorAuth,
    async (req, res) => {
      const parsed = gatewayTokenRotationSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_gateway_token_rotation_payload",
          details: parsed.error.flatten()
        });
        return;
      }

      const gatewayId = req.params.gatewayId as string;
      const rotation =
        await gatewayRegistry.requestTokenRotation(
          gatewayId,
          parsed.data.note
        );

      if (rotation.kind === "not_found") {
        res.status(404).json({
          error: "gateway_not_found"
        });
        return;
      }

      if (rotation.kind === "disabled") {
        res.status(409).json({
          error: "gateway_disabled"
        });
        return;
      }

      const delivered = await onGatewayTokenRotation(
        gatewayId,
        rotation.token,
        rotation.expiresAt
      );

      if (!delivered) {
        await gatewayRegistry.cancelTokenRotation(
          gatewayId,
          "Rotación cancelada: no había un socket autenticado disponible"
        );

        res.status(409).json({
          error: "gateway_not_connected"
        });
        return;
      }

      res.status(202).json({
        status: "pending_confirmation",
        gatewayId,
        expiresAt: rotation.expiresAt
      });
    }
  );

  app.get("/api/v1/audit", operatorAuth, async (req, res) => {
    const parsed = auditQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      res.status(400).json({
        error: "invalid_audit_query"
      });
      return;
    }

    const logs = await gatewayRegistry.listAudit(
      parsed.data.limit
    );

    res.json({
      logs
    });
  });

  app.get("/api/v1/metrics", operatorAuth, async (req, res) => {
    const parsed = metricsQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      res.status(400).json({
        error: "invalid_metrics_query"
      });
      return;
    }

    res.json(
      await messageRegistry.metrics(
        parsed.data.gatewayId
      )
    );
  });

  app.get("/api/v1/messages", operatorAuth, async (req, res) => {
    const parsed = listMessagesQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      res.status(400).json({
        error: "invalid_message_query",
        details: parsed.error.flatten()
      });
      return;
    }

    res.json(
      await messageRegistry.listPage(parsed.data)
    );
  });

  app.post("/api/v1/messages", operatorAuth, async (req, res) => {
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

  app.get(
    "/api/v1/messages/:jobId/detail",
    operatorAuth,
    async (req, res) => {
      const detail = await messageRegistry.getDetail(
        req.params.jobId as string
      );

      if (!detail) {
        res.status(404).json({
          error: "message_not_found"
        });
        return;
      }

      res.json(detail);
    }
  );

  app.get("/api/v1/messages/:jobId", operatorAuth, async (req, res) => {
    const message = await messageRegistry.get(req.params.jobId as string);

    if (!message) {
      res.status(404).json({
        error: "message_not_found"
      });
      return;
    }

    res.json(message);
  });

  app.post(
    "/api/v1/messages/:jobId/resolve",
    operatorAuth,
    async (req, res) => {
      const parsed = resolveAmbiguousSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_resolution_payload",
          details: parsed.error.flatten()
        });
        return;
      }

      const result = await messageRegistry.resolveAmbiguous(
        req.params.jobId as string,
        parsed.data.status,
        parsed.data.note
      );

      if (result.kind === "not_found") {
        res.status(404).json({
          error: "message_not_found"
        });
        return;
      }

      if (result.kind === "invalid_state") {
        res.status(409).json({
          error: "message_not_ambiguous",
          message: result.message
        });
        return;
      }

      res.json({
        status: "ok",
        message: result.message
      });
    }
  );

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

  app.get(
    "/api/v1/gateway/jobs/:jobId",
    gatewayAuth(gatewayRegistry),
    async (req, res) => {
      const gatewayId = res.locals.gatewayId as string;
      const message = await messageRegistry.get(
        req.params.jobId as string
      );

      if (!message) {
        res.status(404).json({
          error: "message_not_found"
        });
        return;
      }

      if (message.gatewayId !== gatewayId) {
        res.status(403).json({
          error: "message_gateway_mismatch"
        });
        return;
      }

      res.json(message);
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
