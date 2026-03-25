import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";

import { registerHealthRoutes } from "./routes/health.js";
import { registerLobbyRoutes } from "./routes/lobby.js";
import { registerMediaRoutes } from "./routes/media.js";
import { registerRoomRoutes } from "./routes/rooms.js";
import { createInMemoryRoomStore, type RoomStore } from "./domain/room-store.js";
import {
  createRouteContext,
  type BuildAppOptions,
} from "./server-support.js";

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: true,
  });

  const context = createRouteContext(options);

  void app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
  });

  registerHealthRoutes(app);
  registerRoomRoutes(app, context);
  registerLobbyRoutes(app, context);
  registerMediaRoutes(app, context);

  return app;
}

export { createInMemoryRoomStore, type RoomStore };

export function parsePort(value: string | undefined): number {
  if (value == null || value.trim() === "") {
    return 3000;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  return port;
}
