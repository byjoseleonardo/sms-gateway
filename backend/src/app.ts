import cors from "cors";
import express from "express";

export const APP_VERSION = "0.1.0";

export function createApp() {
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

  return app;
}
