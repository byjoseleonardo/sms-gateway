import { createServer } from "node:http";
import { Server as SocketIoServer } from "socket.io";
import { z } from "zod";
import { createApp } from "./app.js";

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default("0.0.0.0")
});

const env = envSchema.parse(process.env);
const app = createApp();
const httpServer = createServer(app);

const io = new SocketIoServer(httpServer, {
  cors: {
    origin: false
  }
});

io.on("connection", (socket) => {
  socket.emit("gateway.serverReady", {
    version: "0.1.0"
  });
});

httpServer.listen(env.PORT, env.HOST, () => {
  console.log(`SMS Gateway backend listening on http://${env.HOST}:${env.PORT}`);
});
