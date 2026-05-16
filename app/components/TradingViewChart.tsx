"use client";

import { useEffect, useRef } from "react";
import { Signal } from "../types";
import { createDatafeed } from "../lib/tradingViewDatafeed";

declare global {
  interface Window {
    TradingView?: {
      widget: new (config: Record<string, unknown>) => TradingViewWidget;
    };
  }
}

interface TradingViewWidget {
  onChartReady(cb: () => void): void;
  activeChart(): {
    createShape(
      point: { price: number; time?: number },
      options: Record<string, unknown>
    ): unknown;
  };
  remove(): void;
}

const TIMEFRAME_TO_RESOLUTION: Record<string, string> = {
  "1m": "1",
  "5m": "5",
  "15m": "15",
  "30m": "30",
  "1h": "60",
  "4h": "240",
  daily: "1D",
};

function mapTimeframe(tf: string | undefined): string {
  return TIMEFRAME_TO_RESOLUTION[tf || ""] || "60";
}

let scriptPromise: Promise<void> | null = null;

function loadTradingViewScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("ssr"));
  if (window.TradingView) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-tradingview-loader="true"]'
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load TradingView")));
      return;
    }

    const script = document.createElement("script");
    script.src = "/charting_library/charting_library.standalone.js";
    script.async = true;
    script.dataset.tradingviewLoader = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load TradingView"));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export default function TradingViewChart({ signal }: { signal: Signal }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<TradingViewWidget | null>(null);

  useEffect(() => {
    let disposed = false;

    loadTradingViewScript()
      .then(() => {
        if (disposed || !containerRef.current || !window.TradingView) return;

        const widget = new window.TradingView.widget({
          container: containerRef.current,
          library_path: "/charting_library/",
          symbol: signal.pair,
          interval: mapTimeframe(signal.timeframe),
          datafeed: createDatafeed(signal.pair),
          autosize: true,
          theme: "Dark",
          locale: "en",
          timezone: "Etc/UTC",
          fullscreen: false,
          debug: false,
          disabled_features: [
            "use_localstorage_for_settings",
            "header_symbol_search",
            "symbol_search_hot_key",
          ],
          enabled_features: ["hide_left_toolbar_by_default"],
          overrides: {
            "paneProperties.background": "#09090b",
            "paneProperties.backgroundType": "solid",
            "paneProperties.vertGridProperties.color": "#1f1f23",
            "paneProperties.horzGridProperties.color": "#1f1f23",
            "scalesProperties.textColor": "#a1a1aa",
          },
        });
        widgetRef.current = widget;

        widget.onChartReady(() => {
          if (disposed) return;
          try {
            const chart = widget.activeChart();
            const lines: Array<{ price: number; color: string; label: string }> = [
              { price: signal.entryPrice, color: "#ffffff", label: "Entry" },
              { price: signal.exitTargets.stopLoss, color: "#f43f5e", label: "SL" },
              { price: signal.exitTargets.takeProfit1, color: "#10b981", label: "TP1" },
              { price: signal.exitTargets.takeProfit2, color: "#34d399", label: "TP2" },
            ];
            for (const line of lines) {
              chart.createShape(
                { price: line.price },
                {
                  shape: "horizontal_line",
                  lock: true,
                  disableSelection: true,
                  disableSave: true,
                  overrides: {
                    linecolor: line.color,
                    linestyle: 0,
                    linewidth: 1,
                    showLabel: true,
                    text: line.label,
                    textcolor: line.color,
                    horzLabelsAlign: "right",
                    vertLabelsAlign: "middle",
                  },
                }
              );
            }
          } catch (err) {
            console.error("[TradingViewChart] failed to draw price lines", err);
          }
        });
      })
      .catch((err) => {
        console.error("[TradingViewChart] script load failed", err);
      });

    return () => {
      disposed = true;
      try {
        widgetRef.current?.remove();
      } catch {
        // ignore teardown errors
      }
      widgetRef.current = null;
    };
  }, [signal._id, signal.pair, signal.timeframe, signal.entryPrice, signal.exitTargets.stopLoss, signal.exitTargets.takeProfit1, signal.exitTargets.takeProfit2]);

  return (
    <div className="rounded-3xl bg-zinc-900/30 border border-white/5 overflow-hidden">
      <div ref={containerRef} className="w-full h-[600px]" />
    </div>
  );
}
