import { createServer } from "node:http";
import { Server as SocketIoServer } from "socket.io";
import { z } from "zod";
import { APP_VERSION, createApp } from "./app.js";
import { GatewayRegistry } from "./gateways/GatewayRegistry.js";
import { SmsMessageRegistry } from "./messages/SmsMessageRegistry.js";

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default("127.0.0.1")
});

const env = envSchema.parse(process.env);
const gatewayRegistry = new GatewayRegistry();
const messageRegistry = new SmsMessageRegistry();

let io: SocketIoServer;

const app = createApp(
  gatewayRegistry,
  messageRegistry,
  (gatewayId, jobId) => {
    io.to(`gateway:${gatewayId}`).emit(
      "sms.available",
      { jobId }
    );
  }
);

const httpServer = createServer(app);

io = new SocketIoServer(httpServer, {
  cors: {
    origin: false
  }
});

io.use(async (socket, next) => {
  try {
    const gatewayId =
      typeof socket.handshake.auth?.gatewayId === "string"
        ? socket.handshake.auth.gatewayId.trim()
        : "";

    const token =
      typeof socket.handshake.auth?.token === "string"
        ? socket.handshake.auth.token.trim()
        : "";

    if (!gatewayId || !token) {
      next(new Error("missing_gateway_credentials"));
      return;
    }

    if (!(await gatewayRegistry.authenticate(gatewayId, token))) {
      next(new Error("invalid_gateway_credentials"));
      return;
    }

    socket.data.gatewayId = gatewayId;
    next();
  } catch (error) {
    next(
      error instanceof Error
        ? error
        : new Error("gateway_authentication_failed")
    );
  }
});

io.on("connection", async socket => {
  const gatewayId = socket.data.gatewayId as string;

  await socket.join(`gateway:${gatewayId}`);
  await gatewayRegistry.touch(gatewayId);

  socket.emit("gateway.serverReady", {
    version: APP_VERSION,
    gatewayId,
    timestamp: new Date().toISOString()
  });

  const pendingJobs =
    await messageRegistry.getAvailableForGateway(gatewayId);

  for (const job of pendingJobs) {
    socket.emit("sms.available", {
      jobId: job.id
    });
  }

  socket.on("gateway.heartbeat", async (payload, acknowledge) => {
    const appVersion =
      payload &&
      typeof payload.appVersion === "string"
        ? payload.appVersion
        : undefined;

    const gateway = await gatewayRegistry.touch(
      gatewayId,
      appVersion
    );

    if (typeof acknowledge === "function") {
      acknowledge({
        status: "ok",
        lastSeenAt: gateway?.lastSeenAt ?? null
      });
    }
  });

  socket.on("disconnect", reason => {
    console.log(
      `Gateway ${gatewayId} disconnected: ${reason}`
    );
  });
});

httpServer.listen(env.PORT, env.HOST, () => {
  console.log(
    `SMS Gateway backend v${APP_VERSION} listening on http://${env.HOST}:${env.PORT}`
  );
});
