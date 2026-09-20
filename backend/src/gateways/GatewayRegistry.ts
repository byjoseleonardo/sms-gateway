import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { AppPrismaClient } from "../db/prisma.js";

export type GatewayRecord = {
  gatewayId: string;
  tokenHash: string;
  deviceId: string;
  deviceModel: string;
  androidVersion: string;
  appVersion: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string | null;
};

export class GatewayRegistrationConflictError extends Error {
  constructor(gatewayId: string) {
    super(`Gateway ${gatewayId} ya pertenece a otro dispositivo`);
    this.name = "GatewayRegistrationConflictError";
  }
}

export class GatewayRegistry {
  constructor(
    private readonly prisma: AppPrismaClient
  ) {}

  async register(input: {
    gatewayId: string;
    deviceId: string;
    deviceModel: string;
    androidVersion: string;
    appVersion: string;
  }) {
    const existing = await this.prisma.gateway.findUnique({
      where: {
        gatewayId: input.gatewayId
      }
    });

    if (existing && existing.deviceId !== input.deviceId) {
      throw new GatewayRegistrationConflictError(input.gatewayId);
    }

    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(token);
    const now = new Date();

    const gateway = await this.prisma.gateway.upsert({
      where: {
        gatewayId: input.gatewayId
      },
      create: {
        gatewayId: input.gatewayId,
        tokenHash,
        deviceId: input.deviceId,
        deviceModel: input.deviceModel,
        androidVersion: input.androidVersion,
        appVersion: input.appVersion,
        enabled: true,
        lastSeenAt: now
      },
      update: {
        tokenHash,
        deviceId: input.deviceId,
        deviceModel: input.deviceModel,
        androidVersion: input.androidVersion,
        appVersion: input.appVersion,
        lastSeenAt: now
      }
    });

    return {
      gatewayId: gateway.gatewayId,
      token,
      registeredAt: now.toISOString()
    };
  }

  async authenticate(
    gatewayId: string,
    token: string
  ): Promise<boolean> {
    const gateway = await this.prisma.gateway.findUnique({
      where: {
        gatewayId
      }
    });

    if (!gateway || !gateway.enabled) return false;

    const actual = Buffer.from(hashToken(token), "hex");
    const expected = Buffer.from(gateway.tokenHash, "hex");

    return actual.length === expected.length &&
      timingSafeEqual(actual, expected);
  }

  async touch(
    gatewayId: string,
    appVersion?: string
  ): Promise<GatewayRecord | null> {
    const now = new Date();

    const result = await this.prisma.gateway.updateMany({
      where: {
        gatewayId,
        enabled: true
      },
      data: {
        lastSeenAt: now,
        ...(appVersion ? { appVersion } : {})
      }
    });

    if (result.count === 0) return null;

    const gateway = await this.prisma.gateway.findUnique({
      where: {
        gatewayId
      }
    });

    return gateway ? toGatewayRecord(gateway) : null;
  }

  async list() {
    const gateways = await this.prisma.gateway.findMany({
      orderBy: {
        gatewayId: "asc"
      }
    });

    const now = Date.now();

    return gateways.map(gateway => {
      const lastSeenMs =
        gateway.lastSeenAt?.getTime() ?? 0;

      return {
        gatewayId: gateway.gatewayId,
        enabled: gateway.enabled,
        online:
          gateway.enabled &&
          lastSeenMs > 0 &&
          now - lastSeenMs < 45_000,
        lastSeenAt:
          gateway.lastSeenAt?.toISOString() ?? null,
        deviceModel: gateway.deviceModel,
        androidVersion: gateway.androidVersion,
        appVersion: gateway.appVersion
      };
    });
  }

  async getStatus(gatewayId: string) {
    const gateway = await this.prisma.gateway.findUnique({
      where: {
        gatewayId
      }
    });

    if (!gateway) return null;

    const lastSeenMs = gateway.lastSeenAt?.getTime() ?? 0;

    return {
      gatewayId: gateway.gatewayId,
      enabled: gateway.enabled,
      online:
        gateway.enabled &&
        lastSeenMs > 0 &&
        Date.now() - lastSeenMs < 45_000,
      lastSeenAt: gateway.lastSeenAt?.toISOString() ?? null,
      deviceModel: gateway.deviceModel,
      androidVersion: gateway.androidVersion,
      appVersion: gateway.appVersion
    };
  }
}

function toGatewayRecord(gateway: {
  gatewayId: string;
  tokenHash: string;
  deviceId: string;
  deviceModel: string;
  androidVersion: string;
  appVersion: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastSeenAt: Date | null;
}): GatewayRecord {
  return {
    gatewayId: gateway.gatewayId,
    tokenHash: gateway.tokenHash,
    deviceId: gateway.deviceId,
    deviceModel: gateway.deviceModel,
    androidVersion: gateway.androidVersion,
    appVersion: gateway.appVersion,
    enabled: gateway.enabled,
    createdAt: gateway.createdAt.toISOString(),
    updatedAt: gateway.updatedAt.toISOString(),
    lastSeenAt: gateway.lastSeenAt?.toISOString() ?? null
  };
}

function hashToken(token: string) {
  return createHash("sha256")
    .update(token, "utf8")
    .digest("hex");
}
