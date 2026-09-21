import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { AppPrismaClient } from "../db/prisma.js";

export type GatewayRecord = {
  gatewayId: string;
  tokenHash: string;
  pendingTokenHash: string | null;
  pendingTokenExpiresAt: string | null;
  tokenRotatedAt: string | null;
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
        pendingTokenHash: null,
        pendingTokenExpiresAt: null,
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

    const suppliedHash = hashToken(token);

    if (safeHashEquals(suppliedHash, gateway.tokenHash)) {
      return true;
    }

    const pendingHash = gateway.pendingTokenHash;
    const pendingExpiresAt = gateway.pendingTokenExpiresAt;

    if (
      !pendingHash ||
      !pendingExpiresAt ||
      pendingExpiresAt.getTime() <= Date.now() ||
      !safeHashEquals(suppliedHash, pendingHash)
    ) {
      return false;
    }

    const promotedAt = new Date();

    const promoted = await this.prisma.gateway.updateMany({
      where: {
        gatewayId,
        enabled: true,
        pendingTokenHash: pendingHash,
        pendingTokenExpiresAt: {
          gt: promotedAt
        }
      },
      data: {
        tokenHash: pendingHash,
        pendingTokenHash: null,
        pendingTokenExpiresAt: null,
        tokenRotatedAt: promotedAt,
        lastSeenAt: promotedAt
      }
    });

    if (promoted.count === 1) {
      await this.prisma.operatorAuditLog.create({
        data: {
          id: `audit_${randomUUID()}`,
          action: "GATEWAY_TOKEN_ROTATED",
          targetId: gatewayId,
          gatewayId,
          note: "El gateway confirmó la credencial nueva"
        }
      });

      return true;
    }

    const latest = await this.prisma.gateway.findUnique({
      where: {
        gatewayId
      }
    });

    return Boolean(
      latest?.enabled &&
      safeHashEquals(suppliedHash, latest.tokenHash)
    );
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
    const gatewayIds = gateways.map(
      gateway => gateway.gatewayId
    );

    const [activeRows, recentRows] =
      gatewayIds.length > 0
        ? await Promise.all([
            this.prisma.smsMessage.groupBy({
              by: ["gatewayId"],
              where: {
                gatewayId: {
                  in: gatewayIds
                },
                status: {
                  in: ["QUEUED", "CLAIMED"]
                }
              },
              _count: {
                _all: true
              }
            }),
            this.prisma.smsMessage.groupBy({
              by: ["gatewayId"],
              where: {
                gatewayId: {
                  in: gatewayIds
                },
                createdAt: {
                  gte: new Date(
                    now - ROUTING_HISTORY_WINDOW_MS
                  )
                }
              },
              _count: {
                _all: true
              }
            })
          ])
        : [[], []];

    const activeByGateway = new Map(
      activeRows.map(row => [
        row.gatewayId,
        row._count._all
      ])
    );

    const recentByGateway = new Map(
      recentRows.map(row => [
        row.gatewayId,
        row._count._all
      ])
    );

    return gateways.map(gateway => {
      const lastSeenMs =
        gateway.lastSeenAt?.getTime() ?? 0;

      return {
        gatewayId: gateway.gatewayId,
        enabled: gateway.enabled,
        online:
          gateway.enabled &&
          lastSeenMs > 0 &&
          now - lastSeenMs < ONLINE_WINDOW_MS,
        lastSeenAt:
          gateway.lastSeenAt?.toISOString() ?? null,
        deviceModel: gateway.deviceModel,
        androidVersion: gateway.androidVersion,
        appVersion: gateway.appVersion,
        activeJobs:
          activeByGateway.get(gateway.gatewayId) ?? 0,
        assignedLast24h:
          recentByGateway.get(gateway.gatewayId) ?? 0,
        tokenRotationPendingUntil:
          gateway.pendingTokenExpiresAt &&
          gateway.pendingTokenExpiresAt.getTime() > now
            ? gateway.pendingTokenExpiresAt.toISOString()
            : null,
        tokenRotatedAt:
          gateway.tokenRotatedAt?.toISOString() ?? null
      };
    });
  }

  async selectAvailableGateway() {
    const now = Date.now();
    const cutoff = new Date(
      now - ONLINE_WINDOW_MS
    );

    const gateways = await this.prisma.gateway.findMany({
      where: {
        enabled: true,
        lastSeenAt: {
          gte: cutoff
        }
      },
      orderBy: {
        gatewayId: "asc"
      }
    });

    if (gateways.length === 0) {
      return null;
    }

    const gatewayIds = gateways.map(
      gateway => gateway.gatewayId
    );

    const [activeRows, recentRows] = await Promise.all([
      this.prisma.smsMessage.groupBy({
        by: ["gatewayId"],
        where: {
          gatewayId: {
            in: gatewayIds
          },
          status: {
            in: ["QUEUED", "CLAIMED"]
          }
        },
        _count: {
          _all: true
        }
      }),
      this.prisma.smsMessage.groupBy({
        by: ["gatewayId"],
        where: {
          gatewayId: {
            in: gatewayIds
          },
          createdAt: {
            gte: new Date(
              now - ROUTING_HISTORY_WINDOW_MS
            )
          }
        },
        _count: {
          _all: true
        }
      })
    ]);

    const activeByGateway = new Map(
      activeRows.map(row => [
        row.gatewayId,
        row._count._all
      ])
    );

    const recentByGateway = new Map(
      recentRows.map(row => [
        row.gatewayId,
        row._count._all
      ])
    );

    const candidate = pickGatewayForRouting(
      gateways.map(gateway => ({
        gateway,
        gatewayId: gateway.gatewayId,
        activeJobs:
          activeByGateway.get(gateway.gatewayId) ?? 0,
        assignedLast24h:
          recentByGateway.get(gateway.gatewayId) ?? 0
      }))
    );

    if (!candidate) {
      return null;
    }

    return {
      ...toGatewayStatus(candidate.gateway),
      activeJobs: candidate.activeJobs,
      assignedLast24h: candidate.assignedLast24h
    };
  }

  async setEnabled(
    gatewayId: string,
    enabled: boolean,
    note: string
  ) {
    const existing = await this.prisma.gateway.findUnique({
      where: {
        gatewayId
      }
    });

    if (!existing) {
      return { kind: "not_found" as const };
    }

    const gateway = await this.prisma.gateway.update({
      where: {
        gatewayId
      },
      data: {
        enabled,
        ...(!enabled
          ? { lastSeenAt: null }
          : {})
      }
    });

    await this.prisma.operatorAuditLog.create({
      data: {
        id: `audit_${randomUUID()}`,
        action: enabled
          ? "GATEWAY_ENABLED"
          : "GATEWAY_DISABLED",
        targetId: gatewayId,
        gatewayId,
        note: note.trim()
      }
    });

    return {
      kind: "updated" as const,
      gateway: toGatewayStatus(gateway)
    };
  }

  async requestTokenRotation(
    gatewayId: string,
    note: string
  ) {
    const gateway = await this.prisma.gateway.findUnique({
      where: {
        gatewayId
      }
    });

    if (!gateway) {
      return { kind: "not_found" as const };
    }

    if (!gateway.enabled) {
      return { kind: "disabled" as const };
    }

    const token = randomBytes(32).toString("base64url");
    const pendingTokenHash = hashToken(token);
    const expiresAt = new Date(
      Date.now() + TOKEN_ROTATION_TTL_MS
    );

    await this.prisma.gateway.update({
      where: {
        gatewayId
      },
      data: {
        pendingTokenHash,
        pendingTokenExpiresAt: expiresAt
      }
    });

    await this.prisma.operatorAuditLog.create({
      data: {
        id: `audit_${randomUUID()}`,
        action: "GATEWAY_TOKEN_ROTATION_REQUESTED",
        targetId: gatewayId,
        gatewayId,
        note: note.trim()
      }
    });

    return {
      kind: "pending" as const,
      token,
      expiresAt: expiresAt.toISOString()
    };
  }

  async cancelTokenRotation(
    gatewayId: string,
    reason: string
  ) {
    const cleared = await this.prisma.gateway.updateMany({
      where: {
        gatewayId,
        pendingTokenHash: {
          not: null
        }
      },
      data: {
        pendingTokenHash: null,
        pendingTokenExpiresAt: null
      }
    });

    if (cleared.count === 1) {
      await this.prisma.operatorAuditLog.create({
        data: {
          id: `audit_${randomUUID()}`,
          action: "GATEWAY_TOKEN_ROTATION_CANCELLED",
          targetId: gatewayId,
          gatewayId,
          note: reason.trim()
        }
      });
    }

    return cleared.count === 1;
  }

  async listAudit(limit = 50) {
    const safeLimit = Math.min(Math.max(limit, 1), 200);

    const logs = await this.prisma.operatorAuditLog.findMany({
      orderBy: {
        createdAt: "desc"
      },
      take: safeLimit
    });

    return logs.map(log => ({
      id: log.id,
      action: log.action,
      targetId: log.targetId,
      gatewayId: log.gatewayId,
      note: log.note,
      createdAt: log.createdAt.toISOString()
    }));
  }

  async getStatus(gatewayId: string) {
    const gateway = await this.prisma.gateway.findUnique({
      where: {
        gatewayId
      }
    });

    if (!gateway) return null;

    const lastSeenMs = gateway.lastSeenAt?.getTime() ?? 0;

    return toGatewayStatus(gateway);
  }
}

function toGatewayStatus(gateway: {
  gatewayId: string;
  enabled: boolean;
  lastSeenAt: Date | null;
  deviceModel: string;
  androidVersion: string;
  appVersion: string;
  pendingTokenExpiresAt?: Date | null;
  tokenRotatedAt?: Date | null;
}) {
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
    appVersion: gateway.appVersion,
    tokenRotationPendingUntil:
      gateway.pendingTokenExpiresAt &&
      gateway.pendingTokenExpiresAt.getTime() > Date.now()
        ? gateway.pendingTokenExpiresAt.toISOString()
        : null,
    tokenRotatedAt:
      gateway.tokenRotatedAt?.toISOString() ?? null
  };
}

function toGatewayRecord(gateway: {
  gatewayId: string;
  tokenHash: string;
  pendingTokenHash: string | null;
  pendingTokenExpiresAt: Date | null;
  tokenRotatedAt: Date | null;
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
    pendingTokenHash: gateway.pendingTokenHash,
    pendingTokenExpiresAt:
      gateway.pendingTokenExpiresAt?.toISOString() ?? null,
    tokenRotatedAt:
      gateway.tokenRotatedAt?.toISOString() ?? null,
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

export function pickGatewayForRouting<
  T extends {
    gatewayId: string;
    activeJobs: number;
    assignedLast24h: number;
  }
>(candidates: T[]): T | null {
  if (candidates.length === 0) {
    return null;
  }

  return [...candidates].sort((left, right) =>
    left.activeJobs - right.activeJobs ||
    left.assignedLast24h - right.assignedLast24h ||
    left.gatewayId.localeCompare(right.gatewayId)
  )[0] ?? null;
}

const ONLINE_WINDOW_MS = 45_000;
const ROUTING_HISTORY_WINDOW_MS =
  24 * 60 * 60 * 1_000;

const TOKEN_ROTATION_TTL_MS = 5 * 60 * 1_000;

function hashToken(token: string) {
  return createHash("sha256")
    .update(token, "utf8")
    .digest("hex");
}

function safeHashEquals(
  suppliedHash: string,
  expectedHash: string
) {
  const supplied = Buffer.from(suppliedHash, "hex");
  const expected = Buffer.from(expectedHash, "hex");

  return supplied.length === expected.length &&
    timingSafeEqual(supplied, expected);
}
