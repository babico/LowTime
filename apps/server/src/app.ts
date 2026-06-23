import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";

import { registerHealthRoutes } from "./routes/health.js";
import { registerLobbyRoutes } from "./routes/lobby.js";
import { registerMediaRoutes } from "./routes/media.js";
import { registerPrometheusMetricsRoute } from "./routes/metrics-prometheus.js";
import { registerReclaimRoutes } from "./routes/reclaim.js";
import { registerRoomRoutes } from "./routes/rooms.js";
import { registerSettingsRoutes } from "./routes/settings.js";
import { registerSignalRoutes } from "./routes/signal.js";
import { registerMetricsRoutes } from "./routes/metrics.js";
import { createInMemoryRoomStore, type RoomStore } from "./domain/room-store.js";
import { startCleanupLoop } from "./domain/room-cleanup.js";
import {
  createRouteContext,
  type BuildAppOptions,
} from "./server-support.js";

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? true,
    trustProxy: options.trustProxy ?? true,
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
  registerSettingsRoutes(app, context);
  registerReclaimRoutes(app, context);
  registerSignalRoutes(app, context);
  registerPrometheusMetricsRoute(app, context);
  registerMetricsRoutes(app, context);

  const intervalMs = options.cleanupIntervalMs;
  if (typeof intervalMs === "number" && Number.isFinite(intervalMs) && intervalMs > 0) {
    const loop = startCleanupLoop({
      store: context.roomStore,
      intervalMs,
      now: context.now,
      logger: app.log,
      scheduler: options.cleanupScheduler,
    });
    app.addHook("onClose", async () => {
      loop.stop();
    });
  }

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
