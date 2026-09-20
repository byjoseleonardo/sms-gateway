import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

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

type GatewayRegistryData = {
  gateways: GatewayRecord[];
};

export class GatewayRegistrationConflictError extends Error {
  constructor(gatewayId: string) {
    super(`Gateway ${gatewayId} ya pertenece a otro dispositivo`);
    this.name = "GatewayRegistrationConflictError";
  }
}

export class GatewayRegistry {
  constructor(
    private readonly filePath = path.resolve("data/gateways.json")
  ) {}

  async register(input: {
    gatewayId: string;
    deviceId: string;
    deviceModel: string;
    androidVersion: string;
    appVersion: string;
  }) {
    const data = await this.readData();
    const now = new Date().toISOString();

    const existingIndex = data.gateways.findIndex(
      gateway => gateway.gatewayId === input.gatewayId
    );

    const existing =
      existingIndex >= 0
        ? data.gateways[existingIndex]
        : undefined;

    if (existing && existing.deviceId !== input.deviceId) {
      throw new GatewayRegistrationConflictError(input.gatewayId);
    }

    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(token);

    const record: GatewayRecord = {
      gatewayId: input.gatewayId,
      tokenHash,
      deviceId: input.deviceId,
      deviceModel: input.deviceModel,
      androidVersion: input.androidVersion,
      appVersion: input.appVersion,
      enabled: existing?.enabled ?? true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastSeenAt: now
    };

    if (existingIndex >= 0) {
      data.gateways[existingIndex] = record;
    } else {
      data.gateways.push(record);
    }

    await this.writeData(data);

    return {
      gatewayId: record.gatewayId,
      token,
      registeredAt: now
    };
  }

  async authenticate(
    gatewayId: string,
    token: string
  ): Promise<boolean> {
    const data = await this.readData();
    const gateway = data.gateways.find(
      item => item.gatewayId === gatewayId
    );

    if (!gateway || !gateway.enabled) return false;

    const actual = Buffer.from(hashToken(token), "hex");
    const expected = Buffer.from(gateway.tokenHash, "hex");

    return actual.length === expected.length &&
      timingSafeEqual(actual, expected);
  }

  async touch(gatewayId: string, appVersion?: string) {
    const data = await this.readData();
    const gateway = data.gateways.find(
      item => item.gatewayId === gatewayId
    );

    if (!gateway || !gateway.enabled) return null;

    const now = new Date().toISOString();
    gateway.lastSeenAt = now;
    gateway.updatedAt = now;

    if (appVersion) {
      gateway.appVersion = appVersion;
    }

    await this.writeData(data);
    return gateway;
  }

  async getStatus(gatewayId: string) {
    const data = await this.readData();
    const gateway = data.gateways.find(
      item => item.gatewayId === gatewayId
    );

    if (!gateway) return null;

    const lastSeenMs = gateway.lastSeenAt
      ? Date.parse(gateway.lastSeenAt)
      : 0;

    return {
      gatewayId: gateway.gatewayId,
      enabled: gateway.enabled,
      online:
        gateway.enabled &&
        lastSeenMs > 0 &&
        Date.now() - lastSeenMs < 45_000,
      lastSeenAt: gateway.lastSeenAt,
      deviceModel: gateway.deviceModel,
      androidVersion: gateway.androidVersion,
      appVersion: gateway.appVersion
    };
  }

  private async readData(): Promise<GatewayRegistryData> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      return JSON.parse(raw) as GatewayRegistryData;
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        return { gateways: [] };
      }
      throw error;
    }
  }

  private async writeData(data: GatewayRegistryData) {
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

function hashToken(token: string) {
  return createHash("sha256")
    .update(token, "utf8")
    .digest("hex");
}
