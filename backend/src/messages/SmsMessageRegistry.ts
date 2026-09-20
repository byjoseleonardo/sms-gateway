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

  async list(input: {
    gatewayId?: string;
    status?: SmsMessageStatus;
    limit?: number;
  } = {}) {
    const limit = Math.min(
      Math.max(input.limit ?? 50, 1),
      200
    );

    const messages = await this.prisma.smsMessage.findMany({
      where: {
        ...(input.gatewayId
          ? { gatewayId: input.gatewayId }
          : {}),
        ...(input.status
          ? { status: input.status }
          : {})
      },
      orderBy: {
        createdAt: "desc"
      },
      take: limit
    });

    return messages.map(toRecord);
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
    lastError: message.lastError
  };
}
