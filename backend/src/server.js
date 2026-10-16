import http from "http";

import app from "./app.js";
import env from "./config/env.js";
import checkDatabaseHealth from "./database/databaseHealth.js";
import pool from "./database/pool.js";
import { attachRealtimeTransport } from "./modules/collaboration/realtime/realtime.handler.js";
import {
  startOrphanCleanupScheduler,
  stopOrphanCleanupScheduler,
} from "./scheduler/orphanCleanup.js";

const startServer = async () => {
  try {
    await checkDatabaseHealth();

    console.log("PostgreSQL connected");

    // 19.4: build a bare Node http.Server from the Express app so the realtime
    // transport (Socket.IO) can attach to the SAME server. REST behavior is
    // unchanged — the realtime layer only adds an upgraded transport on top.
    const httpServer = http.createServer(app);

    const realtime = attachRealtimeTransport(httpServer);

    httpServer.listen(env.port, () => {
      console.log(
        `God of Notes backend running on http://localhost:${env.port}`,
      );

      // 17.8 Phase 6: background 7-day orphan cleanup. Started only after
      // the HTTP listener is up; cleanup failures never prevent or stop
      // the HTTP server.
      startOrphanCleanupScheduler();
    });

    const shutdown = async (signal) => {
      console.log(`${signal} received. Shutting down...`);

      // Clear the pending cleanup timer before closing servers.
      stopOrphanCleanupScheduler();

      // io.close() closes the Socket.IO engine and the underlying HTTP server.
      if (realtime?.cleanup) {
        await realtime.cleanup();
      }

      console.log("HTTP server closed");

      await pool.end();

      console.log("PostgreSQL pool closed");

      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
