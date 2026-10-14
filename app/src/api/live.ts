import { wsUrl, type Beacon, type Mark } from './client';

export type LiveEvent =
  | ({ type: 'token'; sessionId: number } & Beacon)
  | { type: 'mark'; sessionId: number; mark: Mark }
  | { type: 'unmark'; sessionId: number; userId: number }
  | { type: 'closed'; sessionId: number }
  | { type: 'beacon'; sessionId: number; courseId: number; token: string };

type Handler = (e: LiveEvent) => void;

/** One reconnecting WebSocket shared by the whole signed-in app. */
export class LiveSocket {
  private ws: WebSocket | null = null;
  private handlers = new Set<Handler>();
  private subscribed = new Set<number>();
  private stopped = false;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;

  connect() {
    this.stopped = false;
    const ws = new WebSocket(wsUrl());
    this.ws = ws;
    ws.onopen = () => {
      this.attempts = 0;
      this.subscribed.forEach((id) => this.rawSend({ type: 'subscribe', sessionId: id }));
    };
    ws.onmessage = (m) => {
      try {
        const e = JSON.parse(String(m.data)) as LiveEvent;
        this.handlers.forEach((h) => h(e));
      } catch { /* ignore malformed frames */ }
    };
    ws.onclose = () => {
      if (this.stopped) return;
      this.retry = setTimeout(() => this.connect(), Math.min(1000 * 2 ** this.attempts++, 8000));
    };
    ws.onerror = () => ws.close();
  }

  private rawSend(msg: object) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  subscribe(sessionId: number) {
    this.subscribed.add(sessionId);
    this.rawSend({ type: 'subscribe', sessionId });
  }
  unsubscribe(sessionId: number) { this.subscribed.delete(sessionId); }
  simBeacon(sessionId: number, token: string) { this.rawSend({ type: 'sim_beacon', sessionId, token }); }

  on(h: Handler) {
    this.handlers.add(h);
    return () => { this.handlers.delete(h); };
  }

  close() {
    this.stopped = true;
    if (this.retry) clearTimeout(this.retry);
    this.ws?.close();
    this.ws = null;
  }
}
