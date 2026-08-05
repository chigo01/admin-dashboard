import { API_BASE_URL } from "../config";
import { searchPairs } from "./supportedPairs";

// Live updates use a WebSocket to the admin-server's /ws/candles hub (which
// proxies Massive's real-time stream). Polling REST /candles is an automatic
// safety net whenever the socket is unavailable OR has gone quiet.
const CANDLES_WS_URL = API_BASE_URL.replace(/^http/, "ws") + "/ws/candles";

const SUPPORTED_RESOLUTIONS = ["1", "5", "15", "30", "60", "240", "1D"] as const;

const RESOLUTION_TO_TIMEFRAME: Record<string, string> = {
  "1": "1m",
  "5": "5m",
  "15": "15m",
  "30": "30m",
  "60": "1h",
  "240": "4h",
  "1D": "daily",
};

const RESOLUTION_TO_MS: Record<string, number> = {
  "1": 60_000,
  "5": 300_000,
  "15": 900_000,
  "30": 1_800_000,
  "60": 3_600_000,
  "240": 14_400_000,
  "1D": 86_400_000,
};

// Matches the server's 2s cache grid, so concurrent charts polling the same
// pair share one upstream fetch instead of each triggering their own.
const LIVE_POLL_MS = 2000;
// If the socket hasn't produced a bar this soon after connecting, start polling.
// The socket is kept — it supersedes the poll as soon as it delivers.
const WS_FIRST_BAR_TIMEOUT_MS = 3500;
// The hub heartbeats every 25s. Two missed beats means the connection is gone,
// even if the browser still reports it as OPEN (suspended tabs, dead proxies,
// captive networks — none of which reliably fire close/error).
const SOCKET_SILENT_MS = 55_000;
// How often the watchdog re-checks socket liveness.
const WATCHDOG_MS = 5000;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15_000;
// After this many same-time onTick pushes without a real new bar, escalate to
// onResetCacheNeededCallback() — forces TradingView to refetch via getBars and
// redraw. Works around the library's tendency to dedupe same-time updates
// (notably on daily resolution).
const STALE_TICK_RESET_THRESHOLD = 2;

interface CandleBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

type Subscription = {
  pollTimer: number;
  watchdogTimer: number;
  reconnectTimer: number;
  firstBarTimer: number;
  ws: WebSocket | null;
  reconnectAttempts: number;
  polling: boolean;
  closed: boolean;
  lastBar: CandleBar | null;
  staleTicks: number;
  /** Timestamp of the last frame of any kind from the hub (bar or heartbeat). */
  lastFrameAt: number;
  /** Latest liveness mode the hub reported: "stream" | "poll" | "down". */
  serverMode: string;
  removeResumeListeners: (() => void) | null;
};

// Fully release a subscription's timers and socket. Safe to call more than once.
function teardownSubscription(sub: Subscription) {
  sub.closed = true;
  sub.removeResumeListeners?.();
  sub.removeResumeListeners = null;
  window.clearInterval(sub.pollTimer);
  window.clearInterval(sub.watchdogTimer);
  window.clearTimeout(sub.reconnectTimer);
  window.clearTimeout(sub.firstBarTimer);
  sub.pollTimer = 0;
  sub.watchdogTimer = 0;
  sub.reconnectTimer = 0;
  sub.firstBarTimer = 0;
  sub.polling = false;
  detachSocket(sub);
}

/** Drop the current socket without letting its handlers touch the subscription. */
function detachSocket(sub: Subscription) {
  const ws = sub.ws;
  if (!ws) return;
  sub.ws = null;
  try {
    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
    ws.close();
  } catch {
    // ignore
  }
}

interface CandlesResponse {
  status: string;
  bars?: CandleBar[];
  noData?: boolean;
  message?: string;
}

export function createDatafeed(pair: string) {
  // Per-widget subscription registry. TradingView listener guids are
  // deterministic (same symbol+resolution → same guid across widget
  // instances), and the library defers unsubscribeBars by a few seconds —
  // so a module-level map would let an old, disposed widget's late
  // unsubscribe tear down the replacement widget's live subscription.
  const subscriptions: Map<string, Subscription> = new Map();

  // Newest bar handed to the chart by getBars, per symbol+resolution. Seeding
  // the live subscription from it means the first streamed update is compared
  // against the real candle instead of being treated as a brand-new bar.
  const latestHistoryBar: Map<string, CandleBar> = new Map();

  return {
    onReady(callback: (config: unknown) => void) {
      setTimeout(
        () =>
          callback({
            supported_resolutions: SUPPORTED_RESOLUTIONS,
            supports_marks: false,
            supports_timescale_marks: false,
            supports_time: true,
          }),
        0
      );
    },

    searchSymbols(
      userInput: string,
      _exchange: string,
      _symbolType: string,
      onResult: (items: unknown[]) => void
    ) {
      onResult(searchPairs(userInput));
    },

    resolveSymbol(
      symbolName: string,
      onResolve: (info: unknown) => void,
      onError: (reason: string) => void
    ) {
      const name = (symbolName || pair).toUpperCase();
      if (!/^[A-Z]{6}$/.test(name)) {
        onError(`Invalid forex symbol: ${symbolName}`);
        return;
      }

      const symbolInfo = {
        name,
        ticker: name,
        full_name: name,
        description: `${name.slice(0, 3)}/${name.slice(3, 6)}`,
        type: "forex",
        session: "24x7",
        exchange: "Massive",
        listed_exchange: "Massive",
        timezone: "Etc/UTC",
        format: "price",
        minmov: 1,
        pricescale: name.endsWith("JPY") ? 1000 : 100000,
        has_intraday: true,
        has_daily: true,
        has_weekly_and_monthly: false,
        supported_resolutions: SUPPORTED_RESOLUTIONS,
        volume_precision: 0,
        data_status: "streaming",
      };

      setTimeout(() => onResolve(symbolInfo), 0);
    },

    async getBars(
      symbolInfo: { name: string },
      resolution: string,
      periodParams: { from: number; to: number; firstDataRequest: boolean; countBack?: number },
      onResult: (bars: CandleBar[], meta: { noData: boolean }) => void,
      onError: (reason: string) => void
    ) {
      const timeframe = RESOLUTION_TO_TIMEFRAME[resolution];
      if (!timeframe) {
        onError(`Unsupported resolution: ${resolution}`);
        return;
      }

      const fromMs = periodParams.from * 1000;
      const toMs = periodParams.to * 1000;

      try {
        const url = `${API_BASE_URL}/candles?pair=${encodeURIComponent(symbolInfo.name)}&timeframe=${timeframe}&from=${fromMs}&to=${toMs}`;
        const res = await fetch(url);
        if (!res.ok) {
          onError(`Candles fetch failed: ${res.status}`);
          return;
        }

        const data: CandlesResponse = await res.json();
        if (data.status !== "ok" || !data.bars) {
          onError(data.message || "Candles response error");
          return;
        }

        const bars = data.bars
          .filter((b) => b.time >= fromMs && b.time <= toMs)
          .map((b) => ({
            time: b.time,
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
            volume: b.volume,
          }));

        if (periodParams.firstDataRequest && bars.length > 0) {
          latestHistoryBar.set(
            `${symbolInfo.name}|${resolution}`,
            bars[bars.length - 1]
          );
        }

        onResult(bars, { noData: bars.length === 0 });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown candles error";
        onError(message);
      }
    },

    subscribeBars(
      symbolInfo: { name: string },
      resolution: string,
      onTick: (bar: CandleBar) => void,
      listenerGuid: string,
      onResetCacheNeededCallback: () => void
    ) {
      const timeframe = RESOLUTION_TO_TIMEFRAME[resolution];
      const stepMs = RESOLUTION_TO_MS[resolution];
      if (!timeframe || !stepMs) return;

      // Tear down any prior subscription with the same guid (TradingView may
      // reuse guids across resolution changes without calling unsubscribe).
      const existing = subscriptions.get(listenerGuid);
      if (existing) teardownSubscription(existing);

      const sub: Subscription = {
        pollTimer: 0,
        watchdogTimer: 0,
        reconnectTimer: 0,
        firstBarTimer: 0,
        ws: null,
        reconnectAttempts: 0,
        polling: false,
        closed: false,
        lastBar: latestHistoryBar.get(`${symbolInfo.name}|${resolution}`) ?? null,
        staleTicks: 0,
        lastFrameAt: 0,
        serverMode: "",
        removeResumeListeners: null,
      };
      subscriptions.set(listenerGuid, sub);

      const isCurrent = () => subscriptions.get(listenerGuid) === sub && !sub.closed;

      // Apply a candidate latest bar (from WS or poll) to the chart, handling
      // new-bar vs same-bar-changed and the daily resetCache escalation.
      // allowCacheReset must be false for WS pushes: streaming legitimately
      // updates the same-time bar every second, and resetCache SYNCHRONOUSLY
      // calls unsubscribeBars — escalating on stream ticks kills the live
      // subscription within seconds of connecting.
      const pushBar = (last: CandleBar, allowCacheReset: boolean) => {
        if (!isCurrent()) return;
        const prev = sub.lastBar;
        const isNewBar = !prev || last.time > prev.time;
        const isSameBarChanged =
          !!prev &&
          last.time === prev.time &&
          (last.open !== prev.open ||
            last.high !== prev.high ||
            last.low !== prev.low ||
            last.close !== prev.close ||
            last.volume !== prev.volume);

        if (!isNewBar && !isSameBarChanged) return; // nothing to push

        // Fresh object every time — defensive against any reference-equality
        // dedup inside TradingView's reconciler.
        const tick: CandleBar = {
          time: last.time,
          open: last.open,
          high: last.high,
          low: last.low,
          close: last.close,
          volume: last.volume,
        };
        sub.lastBar = tick;
        onTick(tick);

        if (isNewBar || !allowCacheReset) {
          sub.staleTicks = 0;
        } else {
          sub.staleTicks += 1;
          // TradingView silently dedupes some same-time onTick updates (esp.
          // daily). After a few, ask the library to invalidate and refetch via
          // getBars for a guaranteed redraw.
          if (sub.staleTicks >= STALE_TICK_RESET_THRESHOLD) {
            sub.staleTicks = 0;
            try {
              onResetCacheNeededCallback();
            } catch {
              // ignore — recovers on the next update
            }
          }
        }
      };

      const poll = async () => {
        if (!isCurrent()) return;
        if (typeof document !== "undefined" && document.hidden) return;
        const toMs = Date.now();
        const fromMs = toMs - stepMs * 5;
        const url = `${API_BASE_URL}/candles?pair=${encodeURIComponent(symbolInfo.name)}&timeframe=${timeframe}&from=${fromMs}&to=${toMs}`;
        try {
          const res = await fetch(url, { cache: "no-store" });
          if (!res.ok) return;
          if (!isCurrent()) return;
          const data: CandlesResponse = await res.json();
          const last = data.bars?.[data.bars.length - 1];
          if (last) pushBar(last, true);
        } catch {
          // Transient network errors are silent — chart keeps its last bar and
          // the next interval retries.
        }
      };

      // Safety-net path: poll REST /candles (coalesced server-side) whenever the
      // socket is not proving itself. Idempotent — one poll loop per subscription.
      const startPolling = () => {
        if (sub.closed || sub.polling) return;
        sub.polling = true;
        sub.pollTimer = window.setInterval(poll, LIVE_POLL_MS);
        void poll();
      };

      const stopPolling = () => {
        if (!sub.polling) return;
        sub.polling = false;
        if (sub.pollTimer) {
          window.clearInterval(sub.pollTimer);
          sub.pollTimer = 0;
        }
      };

      const scheduleReconnect = () => {
        if (sub.closed || sub.reconnectTimer) return;
        const delay = Math.min(
          RECONNECT_BASE_MS * Math.pow(2, sub.reconnectAttempts),
          RECONNECT_MAX_MS
        );
        sub.reconnectAttempts += 1;
        sub.reconnectTimer = window.setTimeout(() => {
          sub.reconnectTimer = 0;
          connectWs();
        }, delay);
      };

      // Primary path: live WebSocket, with polling as the safety net. Any
      // failure keeps the chart moving via poll AND schedules a reconnect —
      // a single blip must not downgrade the chart to polling permanently.
      const connectWs = () => {
        if (sub.closed) return;
        detachSocket(sub);

        let ws: WebSocket;
        try {
          ws = new WebSocket(CANDLES_WS_URL);
        } catch {
          startPolling();
          scheduleReconnect();
          return;
        }
        sub.ws = ws;
        sub.lastFrameAt = Date.now();

        // If the socket doesn't deliver a bar in time, poll alongside it. The
        // socket is kept — it supersedes the poll as soon as it starts working.
        if (sub.firstBarTimer) window.clearTimeout(sub.firstBarTimer);
        sub.firstBarTimer = window.setTimeout(() => {
          sub.firstBarTimer = 0;
          if (!sub.closed) startPolling();
        }, WS_FIRST_BAR_TIMEOUT_MS);

        ws.onopen = () => {
          if (sub.ws !== ws || sub.closed) {
            try {
              ws.close();
            } catch {
              /* noop */
            }
            return;
          }
          sub.lastFrameAt = Date.now();
          ws.send(JSON.stringify({ type: "subscribe", pair: symbolInfo.name, timeframe }));
        };

        ws.onmessage = (event) => {
          if (sub.ws !== ws || sub.closed) return;
          // Any frame proves the connection is alive, including heartbeats.
          sub.lastFrameAt = Date.now();
          sub.reconnectAttempts = 0;

          let msg: {
            type?: string;
            bar?: CandleBar;
            mode?: string;
            live?: boolean;
          };
          try {
            msg = JSON.parse(typeof event.data === "string" ? event.data : "");
          } catch {
            return;
          }

          if (msg.type === "heartbeat" || msg.type === "status") {
            if (typeof msg.mode === "string") sub.serverMode = msg.mode;
            // The hub tells us when it has no live price source at all. Polling
            // won't help then, but it costs little and recovers the moment the
            // provider returns, so keep the net out.
            if (sub.serverMode === "down") startPolling();
            return;
          }

          if (msg.type === "bar" && msg.bar) {
            // Live bar arrived: a working socket supersedes the safety-net poll.
            stopPolling();
            if (sub.firstBarTimer) {
              window.clearTimeout(sub.firstBarTimer);
              sub.firstBarTimer = 0;
            }
            pushBar(msg.bar, false);
          }
        };

        const onDrop = () => {
          if (sub.ws !== ws || sub.closed) return;
          sub.ws = null;
          // Keep the chart updating immediately, and try to get the stream back.
          startPolling();
          scheduleReconnect();
        };
        ws.onerror = onDrop;
        ws.onclose = onDrop;
      };

      // A browser WebSocket can look OPEN long after the connection behind it
      // has died — background tabs, suspended devices, and proxies that drop
      // the tunnel without a FIN all produce this. Neither onclose nor onerror
      // fires, so nothing else would ever notice the chart had gone stale.
      // The hub's heartbeat gives us a positive liveness signal to check.
      const watchdog = () => {
        if (!isCurrent()) return;
        if (typeof document !== "undefined" && document.hidden) return;
        if (!sub.ws) {
          // No socket at all: make sure something is keeping the chart alive.
          startPolling();
          scheduleReconnect();
          return;
        }
        if (Date.now() - sub.lastFrameAt > SOCKET_SILENT_MS) {
          startPolling();
          detachSocket(sub);
          scheduleReconnect();
        }
      };
      sub.watchdogTimer = window.setInterval(watchdog, WATCHDOG_MS);

      connectWs();

      // Always catch up from REST and rebuild the socket when the document is
      // resumed. `pageshow` also covers back-forward-cache restores, while
      // `online` covers a network change that did not produce a socket event.
      const resumeLiveUpdates = () => {
        if (sub.closed || (typeof document !== "undefined" && document.hidden)) return;
        void poll();
        sub.reconnectAttempts = 0;
        if (sub.reconnectTimer) {
          window.clearTimeout(sub.reconnectTimer);
          sub.reconnectTimer = 0;
        }
        connectWs();
      };

      const onVisibilityChange = () => {
        if (!document.hidden) resumeLiveUpdates();
      };

      document.addEventListener("visibilitychange", onVisibilityChange);
      window.addEventListener("pageshow", resumeLiveUpdates);
      window.addEventListener("online", resumeLiveUpdates);
      sub.removeResumeListeners = () => {
        document.removeEventListener("visibilitychange", onVisibilityChange);
        window.removeEventListener("pageshow", resumeLiveUpdates);
        window.removeEventListener("online", resumeLiveUpdates);
      };
    },

    unsubscribeBars(listenerGuid: string) {
      const sub = subscriptions.get(listenerGuid);
      if (sub) {
        teardownSubscription(sub);
        subscriptions.delete(listenerGuid);
      }
    },
  };
}
