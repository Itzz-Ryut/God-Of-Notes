import env from "../config/env.js";
import { cleanupExpiredOrphanedDocuments } from "../modules/documents/documents.service.js";

// 17.8 Phase 6 — background 7-day orphan cleanup scheduler.
//
// Lightweight setInterval-based scheduling using the existing env/server
// architecture (no node-cron, no Redis, no queues, no new dependencies).
//
// Concurrency safety: a module-level `running` flag prevents overlapping
// cleanup runs — if a previous run is still executing when the interval
// fires, the new tick is skipped entirely.
//
// Failure tolerance: cleanup errors are caught and logged; they never
// propagate, so the HTTP server keeps running and future ticks still fire.
//
// Lifecycle: startOrphanCleanupScheduler() is idempotent (a second call
// with an active timer is a no-op) and stopOrphanCleanupScheduler() clears
// the timer — server.js calls stop during graceful shutdown.

let timer = null;
let running = false;

const runOrphanCleanup = async (
  cleanupFn = cleanupExpiredOrphanedDocuments,
) => {
  if (running) {
    return { skipped: true, deletedCount: 0, deletedIds: [] };
  }

  running = true;
  try {
    return await cleanupFn();
  } catch (error) {
    console.error("Orphan cleanup failed (server keeps running):", error);
    return { skipped: false, deletedCount: 0, deletedIds: [], error };
  } finally {
    running = false;
  }
};

const startOrphanCleanupScheduler = (
  intervalMs = env.orphanCleanupIntervalMs,
) => {
  if (timer) {
    return timer;
  }

  timer = setInterval(() => {
    runOrphanCleanup();
  }, intervalMs);

  console.log(
    `Orphan cleanup scheduler started (interval=${intervalMs}ms)`,
  );

  return timer;
};

const stopOrphanCleanupScheduler = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log("Orphan cleanup scheduler stopped");
  }
};

export {
  runOrphanCleanup,
  startOrphanCleanupScheduler,
  stopOrphanCleanupScheduler,
};
