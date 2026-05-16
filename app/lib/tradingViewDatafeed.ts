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
      _symbolInfo: unknown,
      _resolution: string,
      _onTick: (bar: CandleBar) => void,
      _listenerGuid: string,
      _onResetCache: () => void
    ) {
      // No realtime streaming for admin historical review.
    },

    unsubscribeBars(_listenerGuid: string) {
      // No-op (no active subscriptions).
    },
  };
}
