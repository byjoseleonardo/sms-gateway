import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export type SmsMessageStatus =
  | "QUEUED"
  | "CLAIMED"
  | "SENT"
  | "DELIVERED"
  | "FAILED";

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

type SmsMessageData = {
  messages: SmsMessageRecord[];
};

export class SmsMessageRegistry {
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath = path.resolve("data/messages.json")
  ) {}

  async enqueue(input: {
    idempotencyKey: string;
    gatewayId: string;
    destination: string;
    message: string;
  }): Promise<{ message: SmsMessageRecord; created: boolean }> {
    return this.mutate(async () => {
      const data = await this.readData();

      const existing = data.messages.find(
        item => item.idempotencyKey === input.idempotencyKey
      );

      if (existing) {
        return {
          message: existing,
          created: false
        };
      }

      const now = new Date().toISOString();

      const record: SmsMessageRecord = {
        id: `sms_${randomUUID()}`,
        idempotencyKey: input.idempotencyKey,
        gatewayId: input.gatewayId,
        destination: input.destination,
        message: input.message,
        status: "QUEUED",
        attempts: 0,
        createdAt: now,
        updatedAt: now,
        claimedAt: null,
        sentAt: null,
        deliveredAt: null,
        lastError: null
      };

      data.messages.push(record);
      await this.writeData(data);

      return {
        message: record,
        created: true
      };
    });
  }

  async claim(jobId: string, gatewayId: string) {
    return this.mutate(async () => {
      const data = await this.readData();
      const message = data.messages.find(item => item.id === jobId);

      if (!message) return { kind: "not_found" as const };

      if (message.gatewayId !== gatewayId) {
        return { kind: "forbidden" as const };
      }

      if (message.status === "QUEUED") {
        const now = new Date().toISOString();
        message.status = "CLAIMED";
        message.claimedAt = now;
        message.updatedAt = now;
        message.attempts += 1;
        await this.writeData(data);
      }

      if (message.status === "CLAIMED") {
        return {
          kind: "claimed" as const,
          message
        };
      }

      return {
        kind: "already_processed" as const,
        message
      };
    });
  }

  async updateStatus(
    jobId: string,
    gatewayId: string,
    status: "SENT" | "DELIVERED" | "FAILED",
    error?: string
  ) {
    return this.mutate(async () => {
      const data = await this.readData();
      const message = data.messages.find(item => item.id === jobId);

      if (!message) return { kind: "not_found" as const };

      if (message.gatewayId !== gatewayId) {
        return { kind: "forbidden" as const };
      }

      if (message.status === "DELIVERED") {
        return { kind: "updated" as const, message };
      }

      const now = new Date().toISOString();

      if (status === "SENT") {
        if (message.status === "CLAIMED") {
          message.status = "SENT";
          message.sentAt = now;
          message.updatedAt = now;
          message.lastError = null;
          await this.writeData(data);
        }

        return { kind: "updated" as const, message };
      }

      if (status === "DELIVERED") {
        if (
          message.status === "CLAIMED" ||
          message.status === "SENT"
        ) {
          message.status = "DELIVERED";
          message.sentAt ??= now;
          message.deliveredAt = now;
          message.updatedAt = now;
          message.lastError = null;
          await this.writeData(data);
        }

        return { kind: "updated" as const, message };
      }

      if (status === "FAILED" && message.status === "CLAIMED") {
        message.status = "FAILED";
        message.updatedAt = now;
        message.lastError = error?.trim() || "unknown_error";
        await this.writeData(data);
      }

      return { kind: "updated" as const, message };
    });
  }

  async get(jobId: string) {
    const data = await this.readData();
    return data.messages.find(item => item.id === jobId) ?? null;
  }

  async getAvailableForGateway(gatewayId: string) {
    const data = await this.readData();

    return data.messages.filter(
      item =>
        item.gatewayId === gatewayId &&
        (item.status === "QUEUED" || item.status === "CLAIMED")
    );
  }

  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation, operation);
    this.mutationQueue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  private async readData(): Promise<SmsMessageData> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      return JSON.parse(raw) as SmsMessageData;
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        return { messages: [] };
      }
      throw error;
    }
  }

  private async writeData(data: SmsMessageData) {
    await fs.mkdir(
      path.dirname(this.filePath),
      { recursive: true }
    );

    const tempPath = `${this.filePath}.tmp`;

    await fs.writeFile(
      tempPath,
      JSON.stringify(data, null, 2),
      "utf8"
    );

    await fs.rename(tempPath, this.filePath);
  }
}
