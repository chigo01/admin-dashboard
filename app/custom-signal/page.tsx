"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import AuthGuard from "../components/AuthGuard";
import TradingViewChart from "../components/TradingViewChart";
import { API_BASE_URL } from "../config";
import { Signal } from "../types";

const COMMON_PAIRS = [
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "AUDUSD",
  "USDCAD",
  "NZDUSD",
  "USDCHF",
  "EURJPY",
  "GBPJPY",
  "XAUUSD",
  "XAGUSD",
  "BTCUSD",
  "ETHUSD",
] as const;

const TIMEFRAMES = ["15m", "30m", "1h", "4h", "daily"] as const;

type Direction = "BUY" | "SELL";

export default function CustomSignalPage() {
  return (
    <AuthGuard>
      <CustomSignalContent />
    </AuthGuard>
  );
}

function CustomSignalContent() {
  const router = useRouter();

  const [pairSelect, setPairSelect] = useState<string>("EURUSD");
  const [customPair, setCustomPair] = useState("");
  const [direction, setDirection] = useState<Direction>("BUY");
  const [timeframe, setTimeframe] = useState<(typeof TIMEFRAMES)[number]>("1h");
  const [entryPrice, setEntryPrice] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit1, setTakeProfit1] = useState("");
  const [takeProfit2, setTakeProfit2] = useState("");
  const [confidence, setConfidence] = useState("75");
  const [reasoning, setReasoning] = useState("");

  const [previewKey, setPreviewKey] = useState(0);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectivePair = useMemo(() => {
    if (pairSelect === "OTHER") return customPair.trim().toUpperCase();
    return pairSelect;
  }, [pairSelect, customPair]);

  const draftSignal = useMemo<Signal | null>(() => {
    if (!effectivePair) return null;
    const entry = Number(entryPrice);
    const sl = Number(stopLoss);
    const tp1 = Number(takeProfit1);
    const tp2 = Number(takeProfit2);
    return {
      pair: effectivePair,
      direction,
      timeframe,
      confidence: Number(confidence) / 100,
      entryPrice: Number.isFinite(entry) ? entry : 0,
      exitTargets: {
        stopLoss: Number.isFinite(sl) ? sl : 0,
        takeProfit1: Number.isFinite(tp1) ? tp1 : 0,
        takeProfit2: Number.isFinite(tp2) ? tp2 : 0,
      },
    };
    // previewKey forces a fresh memo on demand without depending on every input
  }, [previewKey, effectivePair, direction, timeframe]); // eslint-disable-line react-hooks/exhaustive-deps

  const validate = (): string | null => {
    if (!effectivePair) return "Pair is required";
    if (!timeframe) return "Timeframe is required";

    const entry = Number(entryPrice);
    const sl = Number(stopLoss);
    const tp1 = Number(takeProfit1);
    const tp2 = Number(takeProfit2);
    const conf = Number(confidence);

    if (
      !Number.isFinite(entry) ||
      !Number.isFinite(sl) ||
      !Number.isFinite(tp1) ||
      !Number.isFinite(tp2)
    ) {
      return "Entry, Stop Loss, TP1 and TP2 must all be valid numbers";
    }
    if (entry <= 0) return "Entry price must be greater than zero";

    if (direction === "BUY") {
      if (sl >= entry) return "For BUY signals, stopLoss must be below entry";
      if (tp1 <= entry) return "For BUY signals, TP1 must be above entry";
      if (tp2 <= tp1) return "For BUY signals, TP2 must be above TP1";
    } else {
      if (sl <= entry) return "For SELL signals, stopLoss must be above entry";
      if (tp1 >= entry) return "For SELL signals, TP1 must be below entry";
      if (tp2 >= tp1) return "For SELL signals, TP2 must be below TP1";
    }

    if (!Number.isFinite(conf) || conf < 1 || conf > 100) {
      return "Confidence must be between 1 and 100";
    }
    return null;
  };

  const handleContinue = () => {
    setError(null);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setShowApprovalModal(true);
  };

  const submit = async (isApproved: boolean) => {
    setSubmitting(true);
    setError(null);

    const token = Cookies.get("token");
    let userToken = token;
    const userCookie = Cookies.get("user");
    if (userCookie) {
      try {
        const parsed = JSON.parse(userCookie);
        userToken = parsed?.token || token;
      } catch {
        /* ignore */
      }
    }

    if (!userToken) {
      setError("Session expired. Please log in again.");
      setSubmitting(false);
      setShowApprovalModal(false);
      return;
    }

    const reasoningList = reasoning
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    try {
      const res = await fetch(`${API_BASE_URL}/signals/custom`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          pair: effectivePair,
          direction,
          timeframe,
          entryPrice: Number(entryPrice),
          exitTargets: {
            stopLoss: Number(stopLoss),
            takeProfit1: Number(takeProfit1),
            takeProfit2: Number(takeProfit2),
          },
          confidence: Number(confidence) / 100,
          reasoning: reasoningList,
          isApproved,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Request failed (HTTP ${res.status})`);
      }

      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create signal");
      setSubmitting(false);
      setShowApprovalModal(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8 font-sans selection:bg-white/20">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between gap-4">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-5 h-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
              />
            </svg>
            Back
          </button>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
            Add Custom Signal
          </h1>
          <div className="w-16" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Form */}
          <div className="space-y-5 p-6 rounded-3xl bg-zinc-900/50 border border-white/5">
            <Field label="Pair">
              <div className="flex gap-2">
                <select
                  value={pairSelect}
                  onChange={(e) => setPairSelect(e.target.value)}
                  disabled={submitting}
                  className="flex-1 bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white font-mono focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/30 disabled:opacity-50"
                >
                  {COMMON_PAIRS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                  <option value="OTHER">Other…</option>
                </select>
                {pairSelect === "OTHER" && (
                  <input
                    type="text"
                    value={customPair}
                    onChange={(e) => setCustomPair(e.target.value)}
                    placeholder="e.g. GBPCHF"
                    disabled={submitting}
                    className="flex-1 bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white font-mono uppercase placeholder:text-gray-600 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/30 disabled:opacity-50"
                  />
                )}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Direction">
                <div className="flex gap-2">
                  <DirectionButton
                    active={direction === "BUY"}
                    onClick={() => setDirection("BUY")}
                    disabled={submitting}
                    color="emerald"
                  >
                    BUY
                  </DirectionButton>
                  <DirectionButton
                    active={direction === "SELL"}
                    onClick={() => setDirection("SELL")}
                    disabled={submitting}
                    color="rose"
                  >
                    SELL
                  </DirectionButton>
                </div>
              </Field>

              <Field label="Timeframe">
                <select
                  value={timeframe}
                  onChange={(e) =>
                    setTimeframe(e.target.value as (typeof TIMEFRAMES)[number])
                  }
                  disabled={submitting}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white font-mono focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/30 disabled:opacity-50"
                >
                  {TIMEFRAMES.map((tf) => (
                    <option key={tf} value={tf}>
                      {tf}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="Entry Price"
                value={entryPrice}
                onChange={setEntryPrice}
                disabled={submitting}
              />
              <NumberField
                label="Stop Loss"
                value={stopLoss}
                onChange={setStopLoss}
                disabled={submitting}
              />
              <NumberField
                label="Take Profit 1"
                value={takeProfit1}
                onChange={setTakeProfit1}
                disabled={submitting}
              />
              <NumberField
                label="Take Profit 2"
                value={takeProfit2}
                onChange={setTakeProfit2}
                disabled={submitting}
              />
            </div>

            <Field label={`Confidence: ${confidence}%`}>
              <input
                type="range"
                min={1}
                max={100}
                step={1}
                value={confidence}
                onChange={(e) => setConfidence(e.target.value)}
                disabled={submitting}
                className="w-full accent-white disabled:opacity-50"
              />
            </Field>

            <Field label="Reasoning (one bullet per line)">
              <textarea
                value={reasoning}
                onChange={(e) => setReasoning(e.target.value)}
                placeholder={"Higher-high break above resistance\nMACD bullish crossover\nLow USD news risk"}
                rows={5}
                disabled={submitting}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder:text-gray-600 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/30 disabled:opacity-50 resize-y"
              />
            </Field>

            {error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-200 text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => setPreviewKey((k) => k + 1)}
                disabled={submitting || !effectivePair}
                className="px-5 py-2.5 rounded-lg bg-white/5 text-gray-300 hover:bg-white/10 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Update Preview
              </button>
              <button
                onClick={handleContinue}
                disabled={submitting}
                className="px-6 py-2.5 rounded-lg font-bold bg-white text-black hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            </div>
          </div>

          {/* Chart preview */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <span>📈</span>
              <span>
                Preview
                {effectivePair ? ` · ${effectivePair} · ${timeframe}` : ""}
              </span>
            </div>
            {draftSignal ? (
              <TradingViewChart
                key={`${draftSignal.pair}-${draftSignal.timeframe}-${previewKey}`}
                signal={draftSignal}
              />
            ) : (
              <div className="rounded-3xl bg-zinc-900/30 border border-white/5 border-dashed h-[600px] flex items-center justify-center text-gray-500">
                Select a pair to preview the chart
              </div>
            )}
          </div>
        </div>
      </div>

      {showApprovalModal && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={submitting ? undefined : () => setShowApprovalModal(false)}
        >
          <div
            className="bg-zinc-900 border border-white/10 rounded-2xl max-w-md w-full p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-white mb-2">
              Approve this signal now?
            </h2>
            <p className="text-gray-400 text-sm mb-6">
              Yes — publish as approved and show as Verified on the dashboard.
              No — save as Pending so it appears under Signal Reviews for later
              approval.
            </p>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => submit(true)}
                disabled={submitting}
                className="px-6 py-3 rounded-lg font-bold bg-emerald-500 hover:bg-emerald-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Saving…" : "Yes, Approve"}
              </button>
              <button
                onClick={() => submit(false)}
                disabled={submitting}
                className="px-6 py-3 rounded-lg font-bold bg-yellow-500/90 hover:bg-yellow-500 text-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Saving…" : "No, Save as Pending"}
              </button>
              <button
                onClick={() => setShowApprovalModal(false)}
                disabled={submitting}
                className="px-6 py-2.5 rounded-lg bg-white/5 text-gray-300 hover:bg-white/10 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-widest text-gray-500 mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        step="any"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white font-mono focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/30 disabled:opacity-50"
      />
    </Field>
  );
}

function DirectionButton({
  active,
  onClick,
  disabled,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  color: "emerald" | "rose";
  children: React.ReactNode;
}) {
  const activeClasses =
    color === "emerald"
      ? "bg-emerald-500 text-white border-emerald-500"
      : "bg-rose-500 text-white border-rose-500";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 px-4 py-2.5 rounded-lg font-bold border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
        active
          ? activeClasses
          : "bg-black/40 text-gray-400 border-white/10 hover:bg-white/5"
      }`}
    >
      {children}
    </button>
  );
}
