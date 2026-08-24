"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Cookies from "js-cookie";
import {
  Model4RunsResponse,
  Model4RunStatus,
  Model4ScheduledRun,
  Signal,
} from "../types";
import { API_BASE_URL } from "../config";
import AuthGuard from "../components/AuthGuard";
import Modal from "../components/Modal";
import EditSignalModal from "../components/EditSignalModal";
import TradingViewChart from "../components/TradingViewChart";

const STATUS_STYLES: Record<Model4RunStatus, string> = {
  SCHEDULED: "bg-white/5 border-white/10 text-gray-400",
  RUNNING: "bg-sky-500/10 border-sky-500/30 text-sky-300",
  COMPLETED: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
  EMPTY: "bg-amber-500/10 border-amber-500/30 text-amber-300",
  FAILED: "bg-rose-500/10 border-rose-500/30 text-rose-300",
};

const STATUS_HINTS: Record<Model4RunStatus, string> = {
  SCHEDULED: "Has not run yet today.",
  RUNNING: "Analysis in progress.",
  COMPLETED: "Delivered to Discord.",
  EMPTY: "Claude returned no trade — nothing was posted.",
  FAILED: "The run errored before delivery.",
};

const NEWS_STYLES: Record<string, string> = {
  bullish: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
  bearish: "bg-rose-500/10 border-rose-500/30 text-rose-300",
  neutral: "bg-white/5 border-white/10 text-gray-300",
};

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
}

export default function Model4Page() {
  return (
    <AuthGuard>
      <Model4Content />
    </AuthGuard>
  );
}

function Model4Content() {
  const [runs, setRuns] = useState<Model4ScheduledRun[]>([]);
  const [date, setDate] = useState(todayISO());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | undefined>();
  const [isAdmin, setIsAdmin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [runningKey, setRunningKey] = useState<string | null>(null);
  const [decidingKey, setDecidingKey] = useState<string | null>(null);

  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    type: "alert" | "confirm" | "prompt";
    title: string;
    message?: string;
    onConfirm?: (value?: string) => void;
    confirmText?: string;
  }>({ isOpen: false, type: "alert", title: "" });

  const closeModal = () =>
    setModalConfig((prev) => ({ ...prev, isOpen: false }));

  useEffect(() => {
    const tokenFromCookie = Cookies.get("token");
    const userFromCookie = Cookies.get("user");
    if (userFromCookie) {
      try {
        const parsed = JSON.parse(userFromCookie);
        setIsAdmin(parsed?.role === "admin");
        setToken(parsed?.token || tokenFromCookie);
      } catch {
        setToken(tokenFromCookie);
      }
    } else {
      setToken(tokenFromCookie);
    }
    setAuthChecked(true);
  }, []);

  // Read-only: this endpoint never triggers an analysis. Running a pair is an
  // explicit, confirmed action (see runNow) because it spends Finage + engine
  // calls and can post to the live Discord channel.
  const fetchRuns = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/engine/model4/runs?date=${date}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const result: Model4RunsResponse = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || `Failed to load runs (${res.status}).`);
      }
      setRuns(result.runs || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load Model 4 runs",
      );
    } finally {
      setLoading(false);
    }
  }, [token, date]);

  useEffect(() => {
    if (authChecked && isAdmin && token) {
      fetchRuns();
    } else if (authChecked) {
      setLoading(false);
    }
  }, [authChecked, isAdmin, token, fetchRuns]);

  const runNow = (run: Model4ScheduledRun) => {
    setModalConfig({
      isOpen: true,
      type: "confirm",
      title: `Run Model 4 for ${run.pair}?`,
      message:
        `This fetches fresh Finage data for ${run.pair}, runs the full engine analysis, ` +
        "and posts to Discord if a setup passes the news fact-check. It replaces this " +
        "pair's run for the selected date.",
      confirmText: "Run now",
      onConfirm: async () => {
        setRunningKey(run.scheduleKey);
        setError(null);
        try {
          const res = await fetch(
            `${API_BASE_URL}/engine/deliver-model4-pick`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                scheduleKey: run.scheduleKey,
                force: true,
              }),
            },
          );
          const result = await res.json().catch(() => ({}));
          await fetchRuns();

          setModalConfig({
            isOpen: true,
            type: "alert",
            title: result?.delivered
              ? `${run.pair} delivered`
              : `${run.pair} produced no signal`,
            message: result?.delivered
              ? `${result.count} signal posted to Discord.`
              : result?.reason ||
                result?.error ||
                `Run finished without a delivery (${res.status}).`,
            confirmText: "OK",
          });
        } catch (err) {
          setModalConfig({
            isOpen: true,
            type: "alert",
            title: "Run Failed",
            message:
              err instanceof Error ? err.message : "Failed to run Model 4.",
            confirmText: "OK",
          });
        } finally {
          setRunningKey(null);
        }
      },
    });
  };

  // Approving broadcasts the signal to users by email and arms TP/SL
  // monitoring, so it is confirmed first and never fired on a single stray click.
  const decide = (run: Model4ScheduledRun, approved: boolean) => {
    if (!run.batchKey) return;
    setModalConfig({
      isOpen: true,
      type: "confirm",
      title: approved ? `Approve ${run.pair}?` : `Reject ${run.pair}?`,
      message: approved
        ? `This emails the ${run.pair} signal to users and starts TP/SL monitoring.`
        : `This withdraws the ${run.pair} signal from monitoring. No email is sent.`,
      confirmText: approved ? "Approve" : "Reject",
      onConfirm: async () => {
        closeModal();
        setDecidingKey(run.scheduleKey);
        setError(null);
        try {
          const res = await fetch(
            `${API_BASE_URL}/engine/model4/${encodeURIComponent(run.batchKey!)}/approve`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ approved }),
            },
          );
          const result = await res.json().catch(() => ({}));
          if (!res.ok || !result?.success) {
            throw new Error(
              result?.error || `Approval failed (${res.status}).`,
            );
          }
          await fetchRuns();
        } catch (err) {
          setModalConfig({
            isOpen: true,
            type: "alert",
            title: "Approval Failed",
            message:
              err instanceof Error ? err.message : "Failed to update approval.",
            confirmText: "OK",
          });
        } finally {
          setDecidingKey(null);
        }
      },
    });
  };

  if (!authChecked || (loading && runs.length === 0)) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-4">
        <p className="text-rose-400 text-xl">
          You are not authorized to view this page.
        </p>
        <Link
          href="/"
          className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const deliveredCount = runs.filter((run) => run.status === "COMPLETED").length;

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8 font-sans">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              Model 4 — Scheduled Pairs
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={date}
              max={todayISO()}
              onChange={(event) => setDate(event.target.value)}
              className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm [color-scheme:dark]"
            />
            <button
              onClick={fetchRuns}
              disabled={loading}
              className="px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-sm transition-colors disabled:opacity-50"
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        {error && (
          <div className="p-6 rounded-2xl bg-red-500/10 border border-red-500/20">
            <p className="text-red-300">{error}</p>
          </div>
        )}

        {runs.length === 0 ? (
          <div className="text-center py-20 rounded-3xl bg-zinc-900/30 border border-white/5 border-dashed">
            <span className="text-6xl mb-6 block opacity-50">📭</span>
            <p className="text-xl text-gray-500 font-light">
              No Model 4 schedule configured.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {runs.map((run) => (
              <RunCard
                key={run.scheduleKey}
                run={run}
                canRun={isAdmin}
                token={token}
                running={runningKey === run.scheduleKey}
                onRun={() => runNow(run)}
                deciding={decidingKey === run.scheduleKey}
                onDecide={(approved) => decide(run, approved)}
                onEdited={fetchRuns}
              />
            ))}
          </div>
        )}
      </div>

      <Modal
        isOpen={modalConfig.isOpen}
        onClose={closeModal}
        title={modalConfig.title}
        message={modalConfig.message}
        type={modalConfig.type}
        onConfirm={modalConfig.onConfirm}
        confirmText={modalConfig.confirmText}
      />
    </div>
  );
}

const APPROVAL_STYLES: Record<string, string> = {
  PENDING: "bg-amber-500/10 border-amber-500/30 text-amber-300",
  APPROVED: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
  REJECTED: "bg-rose-500/10 border-rose-500/30 text-rose-300",
};

function withSignalId(signal: Signal): Signal {
  return {
    ...signal,
    _id: signal._id || signal.candidateId,
  };
}

function RunCard({
  run,
  canRun,
  token,
  running,
  onRun,
  deciding,
  onDecide,
  onEdited,
}: {
  run: Model4ScheduledRun;
  canRun: boolean;
  token?: string;
  running: boolean;
  onRun: () => void;
  deciding: boolean;
  onDecide: (approved: boolean) => void;
  onEdited: () => void;
}) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const rawSignal = run.deliveredSignals?.[0];
  const signal = rawSignal ? withSignalId(rawSignal) : null;
  const awaitingReview =
    Boolean(signal) && run.approvalStatus !== "APPROVED" && Boolean(run.batchKey);
  const isBuy = signal?.direction === "BUY";
  const accentText = isBuy ? "text-emerald-400" : "text-rose-400";
  const accentBg = isBuy ? "bg-emerald-500/10" : "bg-rose-500/10";
  const accentBorder = isBuy ? "border-emerald-500/20" : "border-rose-500/20";

  return (
    <section className="rounded-3xl bg-zinc-900/30 border border-white/5 p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold tracking-tight">{run.pair}</h2>
              {signal && (
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold tracking-wider ${accentText} ${accentBg} border ${accentBorder}`}
                >
                  {signal.direction}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500">
              {run.analysisTimeWAT} WAT · {run.scheduleKey}
            </p>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-medium border ${
              STATUS_STYLES[run.status]
            }`}
          >
            {run.status}
          </span>
          {run.newsClassification && (
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium border ${
                NEWS_STYLES[run.newsClassification]
              }`}
            >
              news: {run.newsClassification}
            </span>
          )}
          {signal && run.approvalStatus && (
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium border ${
                APPROVAL_STYLES[run.approvalStatus]
              }`}
            >
              {run.approvalStatus === "PENDING"
                ? "awaiting review"
                : run.approvalStatus.toLowerCase()}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {canRun && signal && signal.direction !== "HOLD" && token && (
            <button
              onClick={() => setIsEditOpen(true)}
              className="px-5 py-2 rounded-full bg-white text-black font-bold text-sm hover:bg-gray-200 transition-colors"
            >
              Edit Prices
            </button>
          )}
          {canRun && awaitingReview && (
            <>
              <button
                onClick={() => onDecide(true)}
                disabled={deciding}
                className="px-5 py-2 rounded-full bg-emerald-500 text-black font-bold text-sm hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {deciding ? "Saving…" : "Approve"}
              </button>
              <button
                onClick={() => onDecide(false)}
                disabled={deciding}
                className="px-5 py-2 rounded-full bg-white/10 text-white font-bold text-sm hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Reject
              </button>
            </>
          )}
          {canRun && (
            <button
              onClick={onRun}
              disabled={running}
              className={`px-5 py-2 rounded-full font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                signal
                  ? "bg-white/10 text-white hover:bg-white/20 border border-white/10"
                  : "bg-white text-black hover:bg-gray-200"
              }`}
            >
              {running ? "Running…" : "Run now"}
            </button>
          )}
        </div>
      </div>

      <p className="text-sm text-gray-400">{STATUS_HINTS[run.status]}</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Metric label="Setups analyzed" value={run.candidateCount} />
        <Metric label="News articles" value={run.newsArticleCount} />
        <Metric label="Delivered" value={run.deliveredCount} />
        <Metric
          label="Posted to Discord"
          value={formatTimestamp(run.discordDeliveredAt)}
        />
      </div>

      {run.analysisSummary && (
        <div className="p-4 rounded-2xl bg-sky-500/5 border border-sky-500/20">
          <p className="text-xs uppercase tracking-widest text-sky-400/70 mb-1">
            analysis
          </p>
          <p className="text-sm text-sky-100/90">{run.analysisSummary}</p>
        </div>
      )}

      {run.noTradeReason && run.status === "EMPTY" && (
        <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20">
          <p className="text-xs uppercase tracking-widest text-amber-400/70 mb-1">
            No trade
          </p>
          <p className="text-sm text-amber-100/90">{run.noTradeReason}</p>
        </div>
      )}

      {signal?.newsValidation?.summary && (
        <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20">
          <p className="text-xs uppercase tracking-widest text-emerald-400/70 mb-1">
            News classification
          </p>
          <p className="text-sm text-emerald-200/90">
            {signal.newsValidation.summary}
          </p>
        </div>
      )}

      {run.error && (
        <div className="p-4 rounded-2xl bg-rose-500/5 border border-rose-500/20">
          <p className="text-xs uppercase tracking-widest text-rose-400/70 mb-1">
            Error
          </p>
          <p className="text-sm text-rose-200/90 break-words">{run.error}</p>
        </div>
      )}

      {signal && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <PriceCard
              label="Entry Price"
              value={signal.entryPrice}
              color="text-white"
            />
            <PriceCard
              label="Take Profit 1"
              value={signal.exitTargets.takeProfit1}
              color="text-emerald-400"
            />
            <PriceCard
              label="Take Profit 2"
              value={signal.exitTargets.takeProfit2}
              color="text-emerald-400"
            />
            <PriceCard
              label="Stop Loss"
              value={signal.exitTargets.stopLoss}
              color="text-rose-400"
            />
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <span>📈</span> Price Action ({signal.pair} · {signal.timeframe})
            </h3>
            <TradingViewChart signal={signal} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <span>🎯</span> Extended Targets
              </h3>
              <div className="p-6 rounded-2xl bg-black/20 border border-white/5 space-y-4">
                <TargetRow
                  label="Take Profit 2"
                  value={signal.exitTargets.takeProfit2}
                  entry={signal.entryPrice}
                  color="text-emerald-400"
                />
                <div className="h-px bg-white/5" />
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-400">Risk/Reward Ratio</span>
                  <span className="font-mono text-white">
                    1:
                    {signal.riskAssessment?.riskRewardRatio?.toFixed(2) || "N/A"}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <span>🧠</span> AI Reasoning
              </h3>
              <div className="p-6 rounded-2xl bg-black/20 border border-white/5 h-full">
                {signal.reasoning && signal.reasoning.length > 0 ? (
                  <ul className="space-y-3">
                    {signal.reasoning.map((reason, idx) => (
                      <li
                        key={idx}
                        className="flex gap-3 text-gray-300 text-sm leading-relaxed"
                      >
                        <span className="text-purple-400 mt-1">•</span>
                        {reason}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500">No insight stored.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {isEditOpen && token && signal && (
        <EditSignalModal
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          signal={signal}
          token={token}
          apiBaseUrl={API_BASE_URL}
          onSuccess={() => {
            setIsEditOpen(false);
            onEdited();
          }}
        />
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-white/[0.03] border border-white/5 px-4 py-3">
      <p className="text-xs uppercase tracking-widest text-gray-500">{label}</p>
      <p className="text-sm font-medium text-white mt-1 truncate">{value}</p>
    </div>
  );
}

function PriceCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="p-6 rounded-2xl bg-black/20 border border-white/5 flex flex-col items-center justify-center text-center">
      <span className="text-xs uppercase tracking-widest text-gray-500 mb-2">
        {label}
      </span>
      <span className={`text-2xl font-mono font-bold ${color}`}>{value}</span>
    </div>
  );
}

function TargetRow({
  label,
  value,
  entry,
  color,
}: {
  label: string;
  value: number;
  entry: number;
  color: string;
}) {
  const pips = Math.abs(value - entry) * (entry > 100 ? 100 : 10000);
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-400">{label}</span>
      <div className="text-right">
        <div className={`font-mono font-bold ${color}`}>{value.toFixed(5)}</div>
        <div className="text-xs text-gray-500">+{pips.toFixed(1)} pips</div>
      </div>
    </div>
  );
}
