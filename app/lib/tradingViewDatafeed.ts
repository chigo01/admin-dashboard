import { API_BASE_URL } from "../config";

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

type Subscription = { intervalId: number; lastBarTime: number };
const subscriptions: Map<string, Subscription> = new Map();

interface CandleBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface CandlesResponse {
  status: string;
  bars?: CandleBar[];
  noData?: boolean;
  message?: string;
}

export function createDatafeed(pair: string) {
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
      _userInput: string,
      _exchange: string,
      _symbolType: string,
      onResult: (items: unknown[]) => void
    ) {
      onResult([]);
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
      _onResetCache: () => void
    ) {
      const timeframe = RESOLUTION_TO_TIMEFRAME[resolution];
      const stepMs = RESOLUTION_TO_MS[resolution];
      if (!timeframe || !stepMs) return;

      // Tear down any prior subscription with the same guid (TradingView may
      // reuse guids across resolution changes without calling unsubscribe).
      const existing = subscriptions.get(listenerGuid);
      if (existing) window.clearInterval(existing.intervalId);

      const sub: Subscription = { intervalId: 0, lastBarTime: 0 };

      const poll = async () => {
        if (typeof document !== "undefined" && document.hidden) return;
        const toMs = Date.now();
        const fromMs = toMs - stepMs * 5;
        const url = `${API_BASE_URL}/candles?pair=${encodeURIComponent(symbolInfo.name)}&timeframe=${timeframe}&from=${fromMs}&to=${toMs}&_=${toMs}`;
        try {
          const res = await fetch(url, { cache: "no-store" });
          if (!res.ok) return;
          // Guard against late responses after unsubscribe.
          if (subscriptions.get(listenerGuid) !== sub) return;
          const data: CandlesResponse = await res.json();
          const last = data.bars?.[data.bars.length - 1];
          if (!last) return;
          // Push if it's a new bar or the current bar's values moved.
          if (last.time >= sub.lastBarTime) {
            sub.lastBarTime = last.time;
            onTick({
              time: last.time,
              open: last.open,
              high: last.high,
              low: last.low,
              close: last.close,
              volume: last.volume,
            });
          }
        } catch {
          // Transient network errors are silent — chart keeps its last bar.
        }
      };

      sub.intervalId = window.setInterval(poll, LIVE_POLL_MS);
      subscriptions.set(listenerGuid, sub);
      // Kick off an immediate tick so the chart goes live without waiting.
      poll();
    },

    unsubscribeBars(listenerGuid: string) {
      const sub = subscriptions.get(listenerGuid);
      if (sub) {
        window.clearInterval(sub.intervalId);
        subscriptions.delete(listenerGuid);
      }
    },
  };
}
