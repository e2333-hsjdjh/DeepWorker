// WebSocket event stream monitor.
//
// - Connects to /api/events.mux and reconnects with exponential backoff.
// - Records the most recent events (bounded), tracks pending approvals.
// - Tracks approval/requested -> pending, approval/resolved -> removed.
//
// Injectable "Ws" lets tests pass a fake client; defaults to the `ws` package.

import { default as WebSocketFactory } from "ws";

import { wsUrl, baseUrl } from "./config.js";

export const MAX_EVENTS = 2000;
const INITIAL_DELAY_MS = 250;
const MAX_DELAY_MS = 5000;

export class EventMonitor {
  constructor({ Ws = WebSocketFactory } = {}) {
    this.Ws = Ws;
    this.events = [];
    this.pending = new Map();
    this.connected = false;
    this.lastError = null;
    this.ws = null;
    this.closed = false;
    this.timer = null;
    this.delay = INITIAL_DELAY_MS;
  }

  // Idempotent: starts only once; safe to call from every tool.
  ensure() {
    if (this.ws || this.closed) return;
    this._connect();
  }

  _connect() {
    if (this.closed) return;
    let client;
    try {
      client = new this.Ws(wsUrl(), { origin: baseUrl() });
    } catch (err) {
      this._onFailure(err);
      return;
    }
    this.ws = client;

    client.on("open", () => {
      this.connected = true;
      this.lastError = null;
      this.delay = INITIAL_DELAY_MS;
    });

    client.on("message", (raw) => {
      let envelope;
      try {
        envelope = JSON.parse(raw.toString());
      } catch (err) {
        this.lastError = `unparseable event: ${err.message}`;
        return;
      }
      this._record(envelope);
    });

    client.on("close", () => {
      this.connected = false;
      if (this.ws === client) this.ws = null;
      this._scheduleReconnect();
    });

    client.on("error", (err) => {
      this.lastError = err.message || String(err);
    });
  }

  _onFailure(err) {
    this.connected = false;
    this.lastError = err && err.message ? err.message : String(err);
    this.ws = null;
    this._scheduleReconnect();
  }

  _scheduleReconnect() {
    if (this.closed || this.timer) return;
    const wait = this.delay;
    this.delay = Math.min(this.delay * 2, MAX_DELAY_MS);
    this.timer = setTimeout(() => {
      this.timer = null;
      this._connect();
    }, wait);
  }

  _record(envelope) {
    const payload = envelope.payload || {};
    const record = {
      rpcId: envelope.rpcId,
      payload,
      receivedAt: Date.now() / 1000,
    };
    this.events.push(record);
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);

    const kind = payload.type;
    if (kind === "approval/requested") {
      this.pending.set(payload.approvalId, record);
    } else if (kind === "approval/resolved") {
      this.pending.delete(payload.approvalId);
    }
  }

  snapshot(sessionId = null) {
    let rows = [...this.pending.values()];
    if (sessionId != null) {
      rows = rows.filter((row) => row.payload.sessionId === sessionId);
    }
    return rows;
  }

  recent(sessionId = null, limit = 50) {
    let rows = [...this.events];
    if (sessionId != null) {
      rows = rows.filter((row) => row.payload.sessionId === sessionId);
    }
    const n = Math.max(1, Math.min(limit, 500));
    return rows.slice(-n);
  }

  status() {
    return { connected: this.connected, lastError: this.lastError };
  }

  // Stop reconnecting and drop the socket. Used on shutdown and in tests.
  close() {
    this.closed = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
    this.connected = false;
  }
}
