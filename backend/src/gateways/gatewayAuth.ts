import type { RequestHandler } from "express";
import type { GatewayRegistry } from "./GatewayRegistry.js";

export function gatewayAuth(registry: GatewayRegistry): RequestHandler {
  return async (req, res, next) => {
    const gatewayId = req.header("x-gateway-id")?.trim();
    const authorization = req.header("authorization")?.trim();
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length).trim()
      : null;

    if (!gatewayId || !token) {
      res.status(401).json({
        error: "missing_gateway_credentials"
      });
      return;
    }

    if (!(await registry.authenticate(gatewayId, token))) {
      res.status(401).json({
        error: "invalid_gateway_credentials"
      });
      return;
    }

    res.locals.gatewayId = gatewayId;
    next();
  };
}
