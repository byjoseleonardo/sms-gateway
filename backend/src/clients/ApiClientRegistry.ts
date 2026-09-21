import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual
} from "node:crypto";
import type { AppPrismaClient } from "../db/prisma.js";

export type ApiClientScope =
  | "sms:send"
  | "sms:read";

export type ApiClientRecord = {
  id: string;
  keyId: string;
  name: string;
  description: string | null;
  enabled: boolean;
  scopes: string[];
  rateLimitPerMinute: number;
  monthlyQuota: number | null;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  keyRotatedAt: string | null;
};

export type AuthenticatedApiClient = ApiClientRecord;

export class ApiClientRegistry {
  constructor(
    private readonly prisma: AppPrismaClient
  ) {}

  async create(input: {
    name: string;
    description?: string;
    scopes: ApiClientScope[];
    rateLimitPerMinute: number;
    monthlyQuota?: number | null;
  }) {
    const id = `client_${randomUUID()}`;
    const keyId = randomBytes(6).toString("hex");
    const apiKey = buildApiKey(keyId);
    const keyHash = hashToken(apiKey);

    const client = await this.prisma.apiClient.create({
      data: {
        id,
        keyId,
        keyHash,
        name: input.name.trim(),
        description:
          input.description?.trim() || null,
        scopes: input.scopes,
        rateLimitPerMinute:
          input.rateLimitPerMinute,
        monthlyQuota:
          input.monthlyQuota ?? null
      }
    });

    await this.prisma.operatorAuditLog.create({
      data: {
        id: `audit_${randomUUID()}`,
        action: "API_CLIENT_CREATED",
        targetId: client.id,
        note: client.name
      }
    });

    return {
      client: toRecord(client),
      apiKey
    };
  }

  async list() {
    const clients = await this.prisma.apiClient.findMany({
      orderBy: {
        createdAt: "desc"
      }
    });

    const monthStart = startOfCurrentMonth();

    const grouped = await this.prisma.smsMessage.groupBy({
      by: ["clientId"],
      where: {
        clientId: {
          not: null
        },
        createdAt: {
          gte: monthStart
        }
      },
      _count: {
        _all: true
      }
    });

    const monthlyUsage = new Map(
      grouped
        .filter(row => row.clientId != null)
        .map(row => [
          row.clientId as string,
          row._count._all
        ])
    );

    return clients
      .map(client => ({
        ...toRecord(client),
        monthlyUsage:
          monthlyUsage.get(client.id) ?? 0
      }))
      .sort((a, b) =>
        b.monthlyUsage - a.monthlyUsage ||
        a.name.localeCompare(b.name)
      );
  }

  async get(clientId: string) {
    const client = await this.prisma.apiClient.findUnique({
      where: {
        id: clientId
      }
    });

    return client ? toRecord(client) : null;
  }

  async authenticate(
    apiKey: string
  ): Promise<AuthenticatedApiClient | null> {
    const parsed = parseApiKey(apiKey);

    if (!parsed) return null;

    const client = await this.prisma.apiClient.findUnique({
      where: {
        keyId: parsed.keyId
      }
    });

    if (!client || !client.enabled) {
      return null;
    }

    const suppliedHash = hashToken(apiKey);

    if (!safeHashEquals(suppliedHash, client.keyHash)) {
      return null;
    }

    const now = new Date();

    await this.prisma.apiClient.update({
      where: {
        id: client.id
      },
      data: {
        lastUsedAt: now
      }
    });

    return {
      ...toRecord(client),
      lastUsedAt: now.toISOString()
    };
  }

  hasScope(
    client: AuthenticatedApiClient,
    scope: ApiClientScope
  ) {
    return client.scopes.includes(scope);
  }

  async setEnabled(
    clientId: string,
    enabled: boolean,
    note: string
  ) {
    const existing = await this.prisma.apiClient.findUnique({
      where: {
        id: clientId
      }
    });

    if (!existing) {
      return { kind: "not_found" as const };
    }

    const client = await this.prisma.apiClient.update({
      where: {
        id: clientId
      },
      data: {
        enabled
      }
    });

    await this.prisma.operatorAuditLog.create({
      data: {
        id: `audit_${randomUUID()}`,
        action: enabled
          ? "API_CLIENT_ENABLED"
          : "API_CLIENT_DISABLED",
        targetId: clientId,
        note: note.trim()
      }
    });

    return {
      kind: "updated" as const,
      client: toRecord(client)
    };
  }

  async rotateKey(
    clientId: string,
    note: string
  ) {
    const existing = await this.prisma.apiClient.findUnique({
      where: {
        id: clientId
      }
    });

    if (!existing) {
      return { kind: "not_found" as const };
    }

    const keyId = randomBytes(6).toString("hex");
    const apiKey = buildApiKey(keyId);
    const keyHash = hashToken(apiKey);
    const now = new Date();

    const client = await this.prisma.apiClient.update({
      where: {
        id: clientId
      },
      data: {
        keyId,
        keyHash,
        keyRotatedAt: now
      }
    });

    await this.prisma.operatorAuditLog.create({
      data: {
        id: `audit_${randomUUID()}`,
        action: "API_CLIENT_KEY_ROTATED",
        targetId: clientId,
        note: note.trim()
      }
    });

    return {
      kind: "rotated" as const,
      client: toRecord(client),
      apiKey
    };
  }

  async updateLimits(
    clientId: string,
    input: {
      rateLimitPerMinute: number;
      monthlyQuota: number | null;
      scopes: ApiClientScope[];
      note: string;
    }
  ) {
    const existing = await this.prisma.apiClient.findUnique({
      where: {
        id: clientId
      }
    });

    if (!existing) {
      return { kind: "not_found" as const };
    }

    const client = await this.prisma.apiClient.update({
      where: {
        id: clientId
      },
      data: {
        rateLimitPerMinute:
          input.rateLimitPerMinute,
        monthlyQuota: input.monthlyQuota,
        scopes: input.scopes
      }
    });

    await this.prisma.operatorAuditLog.create({
      data: {
        id: `audit_${randomUUID()}`,
        action: "API_CLIENT_LIMITS_UPDATED",
        targetId: clientId,
        note: input.note.trim()
      }
    });

    return {
      kind: "updated" as const,
      client: toRecord(client)
    };
  }

  async checkSendAllowance(
    clientId: string
  ) {
    const client = await this.prisma.apiClient.findUnique({
      where: {
        id: clientId
      }
    });

    if (!client || !client.enabled) {
      return {
        kind: "disabled" as const
      };
    }

    const minuteStart = new Date(
      Date.now() - 60_000
    );

    const monthStart = startOfCurrentMonth();

    const [lastMinute, monthUsage] =
      await this.prisma.$transaction([
        this.prisma.smsMessage.count({
          where: {
            clientId,
            createdAt: {
              gte: minuteStart
            }
          }
        }),
        this.prisma.smsMessage.count({
          where: {
            clientId,
            createdAt: {
              gte: monthStart
            }
          }
        })
      ]);

    if (
      lastMinute >= client.rateLimitPerMinute
    ) {
      return {
        kind: "rate_limited" as const,
        limit: client.rateLimitPerMinute
      };
    }

    if (
      client.monthlyQuota != null &&
      monthUsage >= client.monthlyQuota
    ) {
      return {
        kind: "monthly_quota_exceeded" as const,
        quota: client.monthlyQuota,
        usage: monthUsage
      };
    }

    return {
      kind: "allowed" as const,
      monthUsage,
      monthlyQuota: client.monthlyQuota
    };
  }

  async metrics(clientId: string) {
    const client = await this.prisma.apiClient.findUnique({
      where: {
        id: clientId
      }
    });

    if (!client) {
      return null;
    }

    const grouped = await this.prisma.smsMessage.groupBy({
      by: ["status"],
      where: {
        clientId
      },
      _count: {
        _all: true
      }
    });

    const counts = {
      QUEUED: 0,
      CLAIMED: 0,
      SENT: 0,
      DELIVERED: 0,
      FAILED: 0,
      AMBIGUOUS: 0
    };

    for (const row of grouped) {
      counts[row.status] = row._count._all;
    }

    const total = Object.values(counts)
      .reduce((sum, value) => sum + value, 0);

    const monthUsage =
      await this.prisma.smsMessage.count({
        where: {
          clientId,
          createdAt: {
            gte: startOfCurrentMonth()
          }
        }
      });

    const terminal =
      counts.DELIVERED +
      counts.FAILED +
      counts.AMBIGUOUS;

    return {
      client: toRecord(client),
      total,
      monthUsage,
      counts,
      deliveryRate:
        terminal > 0
          ? Number(
              (
                counts.DELIVERED /
                terminal *
                100
              ).toFixed(1)
            )
          : null
    };
  }
}

function buildApiKey(
  keyId: string
) {
  const secret =
    randomBytes(32).toString("base64url");

  return `sk_sms_${keyId}_${secret}`;
}

function parseApiKey(
  apiKey: string
) {
  const match =
    /^sk_sms_([a-f0-9]{12})_([A-Za-z0-9_-]{20,})$/.exec(
      apiKey
    );

  if (!match) return null;

  return {
    keyId: match[1] as string
  };
}

function hashToken(
  token: string
) {
  return createHash("sha256")
    .update(token, "utf8")
    .digest("hex");
}

function safeHashEquals(
  suppliedHash: string,
  expectedHash: string
) {
  const supplied = Buffer.from(
    suppliedHash,
    "hex"
  );

  const expected = Buffer.from(
    expectedHash,
    "hex"
  );

  return supplied.length === expected.length &&
    timingSafeEqual(
      supplied,
      expected
    );
}

function startOfCurrentMonth() {
  const now = new Date();

  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      1
    )
  );
}

function toRecord(client: {
  id: string;
  keyId: string;
  name: string;
  description: string | null;
  enabled: boolean;
  scopes: string[];
  rateLimitPerMinute: number;
  monthlyQuota: number | null;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date | null;
  keyRotatedAt: Date | null;
}): ApiClientRecord {
  return {
    id: client.id,
    keyId: client.keyId,
    name: client.name,
    description: client.description,
    enabled: client.enabled,
    scopes: client.scopes,
    rateLimitPerMinute:
      client.rateLimitPerMinute,
    monthlyQuota:
      client.monthlyQuota,
    createdAt:
      client.createdAt.toISOString(),
    updatedAt:
      client.updatedAt.toISOString(),
    lastUsedAt:
      client.lastUsedAt?.toISOString() ?? null,
    keyRotatedAt:
      client.keyRotatedAt?.toISOString() ?? null
  };
}
