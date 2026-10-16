const buildRoomId = (documentId) => `doc:${documentId}`;

const PERSISTENCE_DEBOUNCE_MS = 250;
const PERSISTENCE_MAX_RETRIES = 2;

class RealtimeSessionRegistry {
  constructor() {
    this.#sessions = new Map();
    this.#connectionOwnership = new Map();
  }

  #sessions;
  #connectionOwnership;

  #createSession(documentId) {
    const session = {
      documentId,
      roomId: buildRoomId(documentId),
      createdAt: Date.now(),
      connections: new Map(),
      transient: {
        persistence: {
          debounceMs: PERSISTENCE_DEBOUNCE_MS,
          retryLimit: PERSISTENCE_MAX_RETRIES,
          debounceTimer: null,
          dirty: false,
          generation: 0,
          persistedGeneration: 0,
          flushInFlight: false,
          flushingGeneration: 0,
          retryCount: 0,
          queuedFinalFlush: false,
          waiters: [],
        },
      },
    };
    this.#sessions.set(documentId, session);
    return session;
  }

  ensureSession(documentId) {
    let session = this.#sessions.get(documentId);
    if (!session) {
      session = this.#createSession(documentId);
    }
    return session;
  }

  addConnection(documentId, connectionId, { socketId, userId, capability }) {
    const session = this.ensureSession(documentId);
    const record = {
      connectionId,
      socketId,
      userId,
      capability,
      documentId,
      joinedAt: Date.now(),
    };
    session.connections.set(connectionId, record);
    this.#connectionOwnership.set(connectionId, documentId);
    return { session, record };
  }

  getSession(documentId) {
    return this.#sessions.get(documentId) ?? null;
  }

  getConnection(connectionId) {
    const documentId = this.#connectionOwnership.get(connectionId);
    if (!documentId) return null;
    return this.#sessions.get(documentId)?.connections.get(connectionId) ?? null;
  }

  getLiveState(documentId) {
    return this.#sessions.get(documentId)?.transient.liveState ?? null;
  }

  initLiveState(documentId, { state }) {
    const session = this.ensureSession(documentId);
    if (session.transient.liveState) {
      return { state: session.transient.liveState, initialized: false };
    }
    session.transient.liveState = state;
    return { state, initialized: true };
  }

  getLiveCrdt(documentId) {
    return this.#sessions.get(documentId)?.transient.crdt ?? null;
  }

  initLiveCrdt(documentId, { crdt, cache }) {
    const session = this.ensureSession(documentId);
    if (session.transient.crdt) {
      return {
        crdt: session.transient.crdt,
        state: session.transient.liveState,
        initialized: false,
      };
    }
    session.transient.crdt = crdt;
    session.transient.liveState = cache;
    return { crdt, state: session.transient.liveState, initialized: true };
  }

  setDocumentTitle(documentId, title) {
    const session = this.ensureSession(documentId);
    session.transient.documentTitle = title;
    return title;
  }

  getDocumentTitle(documentId) {
    return this.#sessions.get(documentId)?.transient.documentTitle ?? null;
  }

  replaceLiveState(documentId, snapshot) {
    const session = this.#sessions.get(documentId);
    if (!session) return;
    session.transient.liveState = snapshot;
  }

  getPersistenceState(documentId) {
    return this.#sessions.get(documentId)?.transient.persistence ?? null;
  }

  markDirty(documentId) {
    const session = this.ensureSession(documentId);
    const persistence = session.transient.persistence;
    persistence.generation += 1;
    persistence.dirty = true;
    return {
      generation: persistence.generation,
      dirty: persistence.dirty,
    };
  }

  setDebounceTimer(documentId, timer) {
    const persistence = this.getPersistenceState(documentId);
    if (!persistence) return false;
    if (persistence.debounceTimer) {
      clearTimeout(persistence.debounceTimer);
    }
    persistence.debounceTimer = timer;
    return true;
  }

  clearDebounceTimer(documentId) {
    const persistence = this.getPersistenceState(documentId);
    if (!persistence?.debounceTimer) return;
    clearTimeout(persistence.debounceTimer);
    persistence.debounceTimer = null;
  }

  beginFlush(documentId, generation) {
    const persistence = this.getPersistenceState(documentId);
    if (!persistence || persistence.flushInFlight) {
      return { ok: false };
    }
    persistence.flushInFlight = true;
    persistence.flushingGeneration = generation;
    return { ok: true };
  }

  completeFlush(documentId, { ok, persistedGeneration, shouldRetry }) {
    const persistence = this.getPersistenceState(documentId);
    if (!persistence) {
      return { destroyable: false, rerun: false };
    }

    persistence.flushInFlight = false;
    persistence.flushingGeneration = 0;

    if (ok) {
      persistence.persistedGeneration = Math.max(
        persistence.persistedGeneration,
        persistedGeneration,
      );
      if (persistence.generation <= persistedGeneration) {
        persistence.dirty = false;
      }
      persistence.retryCount = 0;
    } else {
      persistence.dirty = true;
      if (shouldRetry) {
        persistence.retryCount += 1;
      }
    }

    const rerun = persistence.dirty && persistence.generation > persistence.persistedGeneration;
    const destroyable =
      persistence.queuedFinalFlush &&
      !persistence.dirty &&
      !persistence.flushInFlight;

    return { destroyable, rerun };
  }

  queueFinalFlush(documentId) {
    const persistence = this.getPersistenceState(documentId);
    if (!persistence) return false;
    persistence.queuedFinalFlush = true;
    return true;
  }

  clearFinalFlush(documentId) {
    const persistence = this.getPersistenceState(documentId);
    if (!persistence) return;
    persistence.queuedFinalFlush = false;
  }

  consumeRetryAllowance(documentId) {
    const persistence = this.getPersistenceState(documentId);
    if (!persistence) return false;
    return persistence.retryCount < persistence.retryLimit;
  }

  addWaiter(documentId, waiter) {
    const persistence = this.getPersistenceState(documentId);
    if (!persistence) return false;
    persistence.waiters.push(waiter);
    return true;
  }

  resolveWaiters(documentId, payload) {
    const persistence = this.getPersistenceState(documentId);
    if (!persistence) return;
    const waiters = persistence.waiters.splice(0, persistence.waiters.length);
    for (const waiter of waiters) {
      waiter(payload);
    }
  }

  destroySession(documentId) {
    const session = this.#sessions.get(documentId);
    if (!session) return false;
    this.clearDebounceTimer(documentId);
    for (const connectionId of session.connections.keys()) {
      this.#connectionOwnership.delete(connectionId);
    }
    this.#sessions.delete(documentId);
    return true;
  }

  removeConnection(connectionId) {
    const documentId = this.#connectionOwnership.get(connectionId);
    if (!documentId) {
      return { removed: false, sessionClosed: false, documentId: null };
    }
    const session = this.#sessions.get(documentId);
    session.connections.delete(connectionId);
    this.#connectionOwnership.delete(connectionId);

    const sessionClosed = session.connections.size === 0;
    return { removed: true, sessionClosed, documentId };
  }

  connectionCount() {
    return this.#connectionOwnership.size;
  }

  sessionCount() {
    return this.#sessions.size;
  }

  connectionsIn(documentId) {
    return this.#sessions.get(documentId)?.connections.size ?? 0;
  }

  hasSession(documentId) {
    return this.#sessions.has(documentId);
  }
}

const realtimeSessionRegistry = new RealtimeSessionRegistry();

export { RealtimeSessionRegistry, realtimeSessionRegistry, buildRoomId };
