import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

export function operatorApiKeyAuth(
  expectedApiKey: string
): RequestHandler {
  const expected = Buffer.from(expectedApiKey, "utf8");

  return (req, res, next) => {
    const authorization = req.get("authorization") ?? "";
    const prefix = "Bearer ";

    if (!authorization.startsWith(prefix)) {
      res.status(401).json({
        error: "operator_auth_required"
      });
      return;
    }

    const suppliedToken =
      authorization.slice(prefix.length).trim();
    const supplied = Buffer.from(suppliedToken, "utf8");

    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      res.status(401).json({
        error: "invalid_operator_api_key"
      });
      return;
    }

    next();
  };
}
