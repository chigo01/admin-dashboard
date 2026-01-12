"use client";

import { useState, useEffect, useMemo } from "react";
import { SignalsResponse, Signal } from "./types";
import StatsCard from "./components/StatsCard";
import SignalCard from "./components/SignalCard";

import { API_BASE_URL } from "./config";

export default function AdminPage() {
  const [data, setData] = useState<SignalsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"approved" | "pending">(
    "approved"
  );

  // Filter signals by screenshot approval status
  const approvedSignals = useMemo(() => {
    if (!data?.signals) return [];
    // Only signals with valid screenshots AND approved status
    return data.signals.filter(
      (signal) =>
        signal.screenshot?.url && signal.screenshot.isApproved === true
    );
  }, [data?.signals]);

  const pendingSignals = useMemo(() => {
    if (!data?.signals) return [];
    // Only signals with valid screenshots AND pending status
    return data.signals.filter(
      (signal) =>
        signal.screenshot?.url && signal.screenshot.isApproved === false
    );
  }, [data?.signals]);

  const signalsWithoutScreenshots = useMemo(() => {
    if (!data?.signals) return [];
    // Signals that don't have a valid screenshot submitted
    return data.signals.filter((signal) => !signal.screenshot?.url);
  }, [data?.signals]);

  const currentSignals =
    activeTab === "approved" ? approvedSignals : pendingSignals;

  const fetchSignals = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/top5-refined-signals`);

      if (!response.ok) {
        throw new Error(`Failed to fetch signals: ${response.statusText}`);
      }

      const result: SignalsResponse = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to fetch signals");
      }

      setData(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unknown error occurred"
      );
      console.error("Error fetching signals:", err);
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch signals on mount
  useEffect(() => {
    fetchSignals();
  }, []);

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8 font-sans selection:bg-white/20">
      <div className="max-w-7xl mx-auto space-y-12">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-white/10 pb-8">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-2 bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
              FX Signals Admin
            </h1>
            <p className="text-gray-400 text-lg font-light tracking-wide">
              Advanced Market Analysis & Signal Generation
            </p>
          </div>

          <button
            onClick={fetchSignals}
            disabled={loading}
            className="group relative w-full md:w-auto px-8 py-4 rounded-full bg-white text-black font-bold text-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 hover:shadow-[0_0_20px_rgba(255,255,255,0.3)] active:scale-95 overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
            {loading ? (
              <span className="flex items-center justify-center gap-3">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Analyzing Market...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-3">
                <span className="text-xl">⚡</span>
                Generate Signals
              </span>
            )}
          </button>
        </div>

        {/* Error State */}
        {error && (
          <div className="p-6 rounded-2xl bg-red-500/10 border border-red-500/20 backdrop-blur-sm animate-fade-in">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-red-500/20 text-red-400">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-6 h-6"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-red-400">
                  Generation Failed
                </h3>
                <p className="text-red-300/80">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && !data && (
          <div className="flex flex-col items-center justify-center py-32 space-y-6 animate-pulse">
            <div className="relative">
              <div className="w-24 h-24 rounded-full border-t-2 border-b-2 border-white animate-spin"></div>
              <div className="absolute inset-0 w-24 h-24 rounded-full border-r-2 border-l-2 border-white/20 animate-spin-reverse"></div>
            </div>
            <p className="text-xl text-gray-400 font-light tracking-widest uppercase">
              Processing Market Data
            </p>
          </div>
        )}

        {/* Data Display */}
        {data && !loading && (
          <div className="space-y-12 animate-fade-in-up">
            {/* Top Section: Stats & Market Summary */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1">
                <StatsCard stats={data.stats} date={data.date} />
              </div>

              {/* Market Summary */}
              {data.marketSummary && (
                <div className="lg:col-span-2 rounded-3xl bg-zinc-900/50 p-8 border border-white/5 hover:border-white/10 transition-colors duration-300">
                  <div className="flex items-center gap-3 mb-8">
                    <span className="text-2xl">🌍</span>
                    <h2 className="text-2xl font-bold text-white tracking-tight">
                      Market Sentiment
                    </h2>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                    <SummaryItem
                      label="Bullish"
                      value={data.marketSummary.bullishSignals}
                      color="green"
                    />
                    <SummaryItem
                      label="Bearish"
                      value={data.marketSummary.bearishSignals}
                      color="red"
                    />
                    <SummaryItem
                      label="Neutral"
                      value={data.marketSummary.neutralSignals}
                      color="gray"
                    />
                    <SummaryItem
                      label="Avg Confidence"
                      value={`${(
                        (data.marketSummary.averageConfidence || 0) * 100
                      ).toFixed(0)}%`}
                      color="purple"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Signals Grid with Tabs */}
            <div>
              <div className="flex items-center gap-4 mb-8">
                <div className="h-8 w-1 bg-white rounded-full"></div>
                <h2 className="text-3xl font-bold text-white tracking-tight">
                  Trading Signals
                </h2>
              </div>

              {/* Tabs */}
              <div className="flex gap-4 mb-6">
                <TabButton
                  active={activeTab === "approved"}
                  onClick={() => setActiveTab("approved")}
                  label="Approved Signals"
                  count={approvedSignals.length}
                />
                <TabButton
                  active={activeTab === "pending"}
                  onClick={() => setActiveTab("pending")}
                  label="Pending Review"
                  count={pendingSignals.length}
                />
              </div>

              {/* Display current tab signals */}
              {currentSignals.length === 0 ? (
                <div className="text-center py-20 rounded-3xl bg-zinc-900/30 border border-white/5 border-dashed">
                  <span className="text-6xl mb-6 block opacity-50">📭</span>
                  <p className="text-xl text-gray-500 font-light">
                    {activeTab === "approved"
                      ? "No approved signals yet."
                      : "No pending signals."}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {currentSignals.map((signal, index) => (
                    <div key={signal._id || index} className="relative">
                      <SignalCard signal={signal} index={index} />
                      {/* Screenshot status badge */}
                      {signal.screenshot && (
                        <div className="absolute top-4 right-4 z-10">
                          <div
                            className={`px-3 py-1 text-xs rounded-full border backdrop-blur-sm ${
                              signal.screenshot.isApproved
                                ? "bg-green-500/20 border-green-500/40 text-green-300"
                                : "bg-yellow-500/20 border-yellow-500/40 text-yellow-300"
                            }`}
                          >
                            📸{" "}
                            {signal.screenshot.isApproved
                              ? "Verified"
                              : "Pending"}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Signals without screenshots */}
            {signalsWithoutScreenshots.length > 0 && (
              <div className="mt-12">
                <div className="flex items-center gap-4 mb-8">
                  <div className="h-8 w-1 bg-gray-500 rounded-full"></div>
                  <h2 className="text-3xl font-bold text-white tracking-tight">
                    All Signals
                  </h2>
                  <span className="px-3 py-1 rounded-full bg-gray-500/10 text-xs font-medium text-gray-400 border border-gray-500/10">
                    {signalsWithoutScreenshots.length} Signals
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {signalsWithoutScreenshots.map((signal, index) => (
                    <SignalCard
                      key={signal._id || index}
                      signal={signal}
                      index={index}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Filtering Summary */}
            {data.filteringSummary &&
              data.filteringSummary.totalRejected > 0 && (
                <div className="rounded-3xl bg-zinc-900/30 p-8 border border-white/5">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-gray-300 flex items-center gap-3">
                      <span className="text-2xl">🔍</span>
                      Filtering Analysis
                    </h2>
                    <span className="px-4 py-2 rounded-full bg-red-500/10 text-red-400 text-sm font-medium border border-red-500/10">
                      {data.filteringSummary.totalRejected} Rejected
                    </span>
                  </div>

                  {data.filteringSummary.commonRejectionReasons.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {data.filteringSummary.commonRejectionReasons.map(
                        (reason, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-4 rounded-xl bg-black/40 border border-white/5 hover:border-white/10 transition-colors"
                          >
                            <span className="text-gray-400 text-sm">
                              {reason.reason}
                            </span>
                            <span className="px-3 py-1 rounded-lg bg-zinc-800 text-white text-xs font-bold">
                              {reason.count}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              )}
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-6 py-3 rounded-xl font-medium transition-all ${
        active
          ? "bg-white text-black"
          : "bg-white/5 text-gray-400 hover:bg-white/10"
      }`}
    >
      {label}
      <span
        className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
          active ? "bg-black/10" : "bg-white/10"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function SummaryItem({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string | undefined;
  color: string;
}) {
  if (value === undefined) return null;

  const colorStyles = {
    green: "text-emerald-400 bg-emerald-500/5 border-emerald-500/10",
    red: "text-rose-400 bg-rose-500/5 border-rose-500/10",
    gray: "text-gray-300 bg-gray-500/5 border-gray-500/10",
    purple: "text-purple-400 bg-purple-500/5 border-purple-500/10",
  }[color];

  return (
    <div
      className={`flex flex-col items-center justify-center p-6 rounded-2xl border ${colorStyles} transition-transform hover:scale-105 duration-300`}
    >
      <span className="text-3xl font-bold mb-2 tracking-tight">{value}</span>
      <span className="text-xs uppercase tracking-widest opacity-60 font-medium">
        {label}
      </span>
    </div>
  );
}
