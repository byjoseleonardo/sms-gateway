import { randomUUID } from "node:crypto";
import type { AppPrismaClient } from "../db/prisma.js";

export type SmsMessageStatus =
  | "QUEUED"
  | "CLAIMED"
  | "SENT"
  | "DELIVERED"
  | "FAILED"
  | "AMBIGUOUS";

export type SmsMessageRecord = {
  id: string;
  idempotencyKey: string;
  gatewayId: string;
  destination: string;
  message: string;
  status: SmsMessageStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  claimedAt: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  lastError: string | null;
  operatorResolvedAt: string | null;
  operatorResolutionNote: string | null;
};

export class SmsMessageRegistry {
  constructor(
    private readonly prisma: AppPrismaClient
  ) {}

  async enqueue(input: {
    idempotencyKey: string;
    gatewayId: string;
    destination: string;
    message: string;
  }): Promise<{ message: SmsMessageRecord; created: boolean }> {
    const existing = await this.prisma.smsMessage.findUnique({
      where: {
        idempotencyKey: input.idempotencyKey
      }
    });

    if (existing) {
      return {
        message: toRecord(existing),
        created: false
      };
    }

    try {
      const created = await this.prisma.smsMessage.create({
        data: {
          id: `sms_${randomUUID()}`,
          idempotencyKey: input.idempotencyKey,
          gatewayId: input.gatewayId,
          destination: input.destination,
          message: input.message,
          status: "QUEUED"
        }
      });

      return {
        message: toRecord(created),
        created: true
      };
    } catch (error) {
      const raced = await this.prisma.smsMessage.findUnique({
        where: {
          idempotencyKey: input.idempotencyKey
        }
      });

      if (raced) {
        return {
          message: toRecord(raced),
          created: false
        };
      }

      throw error;
    }
  }

  async claim(jobId: string, gatewayId: string) {
    const now = new Date();

    const claimed = await this.prisma.smsMessage.updateMany({
      where: {
        id: jobId,
        gatewayId,
        status: "QUEUED"
      },
      data: {
        status: "CLAIMED",
        claimedAt: now,
        attempts: {
          increment: 1
        },
        lastError: null
      }
    });

    const message = await this.prisma.smsMessage.findUnique({
      where: {
        id: jobId
      }
    });

    if (!message) {
      return { kind: "not_found" as const };
    }

    if (message.gatewayId !== gatewayId) {
      return { kind: "forbidden" as const };
    }

    if (
      claimed.count === 1 ||
      message.status === "CLAIMED"
    ) {
      return {
        kind: "claimed" as const,
        message: toRecord(message)
      };
    }

    return {
      kind: "already_processed" as const,
      message: toRecord(message)
    };
  }

  async updateStatus(
    jobId: string,
    gatewayId: string,
    status: "SENT" | "DELIVERED" | "FAILED" | "AMBIGUOUS",
    error?: string
  ) {
    const initial = await this.prisma.smsMessage.findUnique({
      where: {
        id: jobId
      }
    });

    if (!initial) {
      return { kind: "not_found" as const };
    }

    if (initial.gatewayId !== gatewayId) {
      return { kind: "forbidden" as const };
    }

    const now = new Date();

    if (status === "SENT") {
      await this.prisma.smsMessage.updateMany({
        where: {
          id: jobId,
          gatewayId,
          status: {
            in: ["CLAIMED", "AMBIGUOUS"]
          }
        },
        data: {
          status: "SENT",
          sentAt: now,
          lastError: null
        }
      });

      await this.prisma.smsMessage.updateMany({
        where: {
          id: jobId,
          gatewayId,
          status: "DELIVERED",
          sentAt: null
        },
        data: {
          sentAt: now
        }
      });
    }

    if (status === "DELIVERED") {
      await this.prisma.smsMessage.updateMany({
        where: {
          id: jobId,
          gatewayId,
          status: {
            in: ["CLAIMED", "SENT", "AMBIGUOUS"]
          }
        },
        data: {
          status: "DELIVERED",
          deliveredAt: now,
          lastError: null
        }
      });
    }

    if (status === "FAILED") {
      await this.prisma.smsMessage.updateMany({
        where: {
          id: jobId,
          gatewayId,
          status: {
            in: ["CLAIMED", "AMBIGUOUS"]
          }
        },
        data: {
          status: "FAILED",
          lastError: error?.trim() || "unknown_error"
        }
      });
    }

    if (status === "AMBIGUOUS") {
      await this.prisma.smsMessage.updateMany({
        where: {
          id: jobId,
          gatewayId,
          status: "CLAIMED"
        },
        data: {
          status: "AMBIGUOUS",
          lastError:
            error?.trim() ||
            "delivery_outcome_unknown_after_process_restart"
        }
      });
    }

    const message = await this.prisma.smsMessage.findUnique({
      where: {
        id: jobId
      }
    });

    if (!message) {
      return { kind: "not_found" as const };
    }

    return {
      kind: "updated" as const,
      message: toRecord(message)
    };
  }

  async resolveAmbiguous(
    jobId: string,
    resolution: "SENT" | "DELIVERED" | "FAILED",
    note: string
  ) {
    const existing = await this.prisma.smsMessage.findUnique({
      where: {
        id: jobId
      }
    });

    if (!existing) {
      return { kind: "not_found" as const };
    }

    if (existing.status !== "AMBIGUOUS") {
      return {
        kind: "invalid_state" as const,
        message: toRecord(existing)
      };
    }

    const now = new Date();
    const normalizedNote = note.trim();

    const updated = await this.prisma.smsMessage.updateMany({
      where: {
        id: jobId,
        status: "AMBIGUOUS"
      },
      data: {
        status: resolution,
        operatorResolvedAt: now,
        operatorResolutionNote: normalizedNote,
        ...(resolution === "SENT"
          ? {
              sentAt: existing.sentAt ?? now,
              lastError: null
            }
          : {}),
        ...(resolution === "DELIVERED"
          ? {
              sentAt: existing.sentAt ?? now,
              deliveredAt: existing.deliveredAt ?? now,
              lastError: null
            }
          : {}),
        ...(resolution === "FAILED"
          ? {
              lastError:
                normalizedNote || "Marcado FAILED por operador"
            }
          : {})
      }
    });

    if (updated.count !== 1) {
      const raced = await this.prisma.smsMessage.findUnique({
        where: {
          id: jobId
        }
      });

      return {
        kind: "invalid_state" as const,
        message: raced ? toRecord(raced) : null
      };
    }

    const message = await this.prisma.smsMessage.findUnique({
      where: {
        id: jobId
      }
    });

    return {
      kind: "resolved" as const,
      message: message ? toRecord(message) : null
    };
  }

  async get(jobId: string) {
    const message = await this.prisma.smsMessage.findUnique({
      where: {
        id: jobId
      }
    });

    return message ? toRecord(message) : null;
  }

  async getQueuedForGateway(gatewayId: string) {
    const messages = await this.prisma.smsMessage.findMany({
      where: {
        gatewayId,
        status: "QUEUED"
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return messages.map(toRecord);
  }

  async listPage(input: {
    gatewayId?: string;
    status?: SmsMessageStatus;
    page?: number;
    perPage?: number;
  } = {}) {
    const page = Math.max(input.page ?? 1, 1);
    const perPage = Math.min(
      Math.max(input.perPage ?? 25, 5),
      100
    );

    const where = {
      ...(input.gatewayId
        ? { gatewayId: input.gatewayId }
        : {}),
      ...(input.status
        ? { status: input.status }
        : {})
    };

    const [total, messages] = await this.prisma.$transaction([
      this.prisma.smsMessage.count({
        where
      }),
      this.prisma.smsMessage.findMany({
        where,
        orderBy: [
          { createdAt: "desc" },
          { id: "desc" }
        ],
        skip: (page - 1) * perPage,
        take: perPage
      })
    ]);

    return {
      messages: messages.map(toRecord),
      pagination: {
        page,
        perPage,
        total,
        totalPages: Math.max(
          Math.ceil(total / perPage),
          1
        )
      }
    };
  }

  async metrics(gatewayId?: string) {
    const where = gatewayId
      ? { gatewayId }
      : {};

    const grouped = await this.prisma.smsMessage.groupBy({
      by: ["status"],
      where,
      _count: {
        _all: true
      }
    });

    const counts: Record<SmsMessageStatus, number> = {
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

    const terminal =
      counts.DELIVERED +
      counts.FAILED +
      counts.AMBIGUOUS;

    const since = new Date(
      Date.now() - 24 * 60 * 60 * 1_000
    );

    const last24h = await this.prisma.smsMessage.count({
      where: {
        ...where,
        createdAt: {
          gte: since
        }
      }
    });

    return {
      total,
      last24h,
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

  async getDetail(jobId: string) {
    const message = await this.prisma.smsMessage.findUnique({
      where: {
        id: jobId
      }
    });

    if (!message) return null;

    const record = toRecord(message);
    const timeline: Array<{
      kind: string;
      at: string;
      note?: string;
    }> = [
      {
        kind: "QUEUED",
        at: record.createdAt
      }
    ];

    if (record.claimedAt) {
      timeline.push({
        kind: "CLAIMED",
        at: record.claimedAt
      });
    }

    if (record.sentAt) {
      timeline.push({
        kind: "SENT",
        at: record.sentAt
      });
    }

    if (record.deliveredAt) {
      timeline.push({
        kind: "DELIVERED",
        at: record.deliveredAt
      });
    }

    if (
      record.status === "FAILED" &&
      !record.operatorResolvedAt
    ) {
      timeline.push({
        kind: "FAILED",
        at: record.updatedAt,
        note: record.lastError ?? undefined
      });
    }

    if (record.status === "AMBIGUOUS") {
      timeline.push({
        kind: "AMBIGUOUS",
        at: record.updatedAt,
        note: record.lastError ?? undefined
      });
    }

    if (record.operatorResolvedAt) {
      timeline.push({
        kind: `OPERATOR_RESOLVED_${record.status}`,
        at: record.operatorResolvedAt,
        note:
          record.operatorResolutionNote ??
          record.lastError ??
          undefined
      });
    }

    timeline.sort((a, b) =>
      a.at.localeCompare(b.at)
    );

    return {
      message: record,
      timeline
    };
  }

  async getAvailableForGateway(gatewayId: string) {
    const messages = await this.prisma.smsMessage.findMany({
      where: {
        gatewayId,
        status: {
          in: ["QUEUED", "CLAIMED"]
        }
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return messages.map(toRecord);
  }
}

function toRecord(message: {
  id: string;
  idempotencyKey: string;
  gatewayId: string;
  destination: string;
  message: string;
  status: SmsMessageStatus;
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
  claimedAt: Date | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  lastError: string | null;
  operatorResolvedAt: Date | null;
  operatorResolutionNote: string | null;
}): SmsMessageRecord {
  return {
    id: message.id,
    idempotencyKey: message.idempotencyKey,
    gatewayId: message.gatewayId,
    destination: message.destination,
    message: message.message,
    status: message.status,
    attempts: message.attempts,
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
    claimedAt: message.claimedAt?.toISOString() ?? null,
    sentAt: message.sentAt?.toISOString() ?? null,
    deliveredAt: message.deliveredAt?.toISOString() ?? null,
    lastError: message.lastError,
    operatorResolvedAt:
      message.operatorResolvedAt?.toISOString() ?? null,
    operatorResolutionNote:
      message.operatorResolutionNote
  };
}
