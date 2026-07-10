import { API_BASE_URL } from "../config";
import { searchPairs } from "./supportedPairs";

// Live updates use a WebSocket to the admin-server's /ws/candles hub (which
// proxies Massive's real-time stream). Polling REST /candles is kept only as an
// automatic fallback when the socket is unavailable.
const CANDLES_WS_URL = API_BASE_URL.replace(/^http/, "ws") + "/ws/candles";
// If the socket doesn't reach "subscribed" within this window, fall back to poll.
const WS_CONNECT_TIMEOUT_MS = 5000;

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

const LIVE_POLL_MS = 3000;
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
  intervalId: number;
  ws: WebSocket | null;
  connectTimer: number;
  usingFallbackPoll: boolean;
  closed: boolean;
  lastBar: CandleBar | null;
  staleTicks: number;
};

// Fully release a subscription's timers and socket. Safe to call more than once.
function teardownSubscription(sub: Subscription) {
  sub.closed = true;
  if (sub.intervalId) {
    window.clearInterval(sub.intervalId);
    sub.intervalId = 0;
  }
  if (sub.connectTimer) {
    window.clearTimeout(sub.connectTimer);
    sub.connectTimer = 0;
  }
  if (sub.ws) {
    try {
      sub.ws.onopen = null;
      sub.ws.onmessage = null;
      sub.ws.onerror = null;
      sub.ws.onclose = null;
      sub.ws.close();
    } catch {
      // ignore
    }
    sub.ws = null;
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
        intervalId: 0,
        ws: null,
        connectTimer: 0,
        usingFallbackPoll: false,
        closed: false,
        lastBar: null,
        staleTicks: 0,
      };
      subscriptions.set(listenerGuid, sub);

      // Apply a candidate latest bar (from WS or poll) to the chart, handling
      // new-bar vs same-bar-changed and the daily resetCache escalation.
      // allowCacheReset must be false for WS pushes: streaming legitimately
      // updates the same-time bar every second, and resetCache SYNCHRONOUSLY
      // calls unsubscribeBars — escalating on stream ticks kills the live
      // subscription within seconds of connecting.
      const pushBar = (last: CandleBar, allowCacheReset: boolean) => {
        if (subscriptions.get(listenerGuid) !== sub || sub.closed) return;
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
        if (typeof document !== "undefined" && document.hidden) return;
        const toMs = Date.now();
        const fromMs = toMs - stepMs * 5;
        const url = `${API_BASE_URL}/candles?pair=${encodeURIComponent(symbolInfo.name)}&timeframe=${timeframe}&from=${fromMs}&to=${toMs}&_=${toMs}`;
        try {
          const res = await fetch(url, { cache: "no-store" });
          if (!res.ok) return;
          if (subscriptions.get(listenerGuid) !== sub) return;
          const data: CandlesResponse = await res.json();
          const last = data.bars?.[data.bars.length - 1];
          if (last) pushBar(last, true);
        } catch {
          // Transient network errors are silent — chart keeps its last bar.
        }
      };

      // Fallback path: poll REST /candles (cached server-side) when the WS
      // is unavailable. Idempotent — only one poll loop per subscription.
      const startFallbackPolling = () => {
        if (sub.closed || sub.usingFallbackPoll) return;
        sub.usingFallbackPoll = true;
        sub.intervalId = window.setInterval(poll, LIVE_POLL_MS);
        poll();
      };

      // Primary path: live WebSocket. Falls back to polling on any failure.
      const connectWs = () => {
        if (sub.closed) return;
        let ws: WebSocket;
        try {
          ws = new WebSocket(CANDLES_WS_URL);
        } catch {
          startFallbackPolling();
          return;
        }
        sub.ws = ws;

        // If the socket doesn't subscribe in time, fall back without giving up
        // the socket entirely (it may still arrive and supersede the poll).
        sub.connectTimer = window.setTimeout(() => {
          if (!sub.closed && !sub.usingFallbackPoll) startFallbackPolling();
        }, WS_CONNECT_TIMEOUT_MS);

        ws.onopen = () => {
          if (sub.closed) {
            try { ws.close(); } catch { /* noop */ }
            return;
          }
          ws.send(
            JSON.stringify({ type: "subscribe", pair: symbolInfo.name, timeframe })
          );
        };

        ws.onmessage = (event) => {
          if (sub.closed) return;
          let msg: { type?: string; bar?: CandleBar; pair?: string; timeframe?: string };
          try {
            msg = JSON.parse(typeof event.data === "string" ? event.data : "");
          } catch {
            return;
          }
          if (msg.type === "bar" && msg.bar) {
            // Live bar arrived: a working socket supersedes any fallback poll.
            if (sub.usingFallbackPoll) {
              window.clearInterval(sub.intervalId);
              sub.intervalId = 0;
              sub.usingFallbackPoll = false;
            }
            if (sub.connectTimer) {
              window.clearTimeout(sub.connectTimer);
              sub.connectTimer = 0;
            }
            pushBar(msg.bar, false);
          }
        };

        const fallback = () => {
          if (sub.ws === ws) sub.ws = null;
          if (!sub.closed) startFallbackPolling();
        };
        ws.onerror = fallback;
        ws.onclose = fallback;
      };

      connectWs();
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
