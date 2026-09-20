import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

export function gatewayEnrollmentAuth(
  expectedEnrollmentKey: string
): RequestHandler {
  const expected = Buffer.from(expectedEnrollmentKey, "utf8");

  return (req, res, next) => {
    const suppliedValue =
      req.get("x-gateway-enrollment-key")?.trim() ?? "";
    const supplied = Buffer.from(suppliedValue, "utf8");

    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      res.status(401).json({
        error: "invalid_gateway_enrollment_key"
      });
      return;
    }

    next();
  };
}
