import type {
  NextFunction,
  Request,
  Response
} from "express";
import type {
  ApiClientRegistry,
  ApiClientScope,
  AuthenticatedApiClient
} from "./ApiClientRegistry.js";

export function apiClientAuth(
  registry: ApiClientRegistry,
  requiredScope: ApiClientScope
) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const authorization =
      req.get("authorization") ?? "";
    const prefix = "Bearer ";

    if (!authorization.startsWith(prefix)) {
      res.status(401).json({
        error: "client_auth_required"
      });
      return;
    }

    const apiKey =
      authorization
        .slice(prefix.length)
        .trim();

    const client =
      await registry.authenticate(apiKey);

    if (!client) {
      res.status(401).json({
        error: "invalid_client_api_key"
      });
      return;
    }

    if (!registry.hasScope(client, requiredScope)) {
      res.status(403).json({
        error: "client_scope_required",
        scope: requiredScope
      });
      return;
    }

    res.locals.apiClient =
      client satisfies AuthenticatedApiClient;

    next();
  };
}
