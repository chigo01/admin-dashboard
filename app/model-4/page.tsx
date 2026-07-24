"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Cookies from "js-cookie";
import {
  Model4RunsResponse,
  Model4RunStatus,
  Model4ScheduledRun,
} from "../types";
import { API_BASE_URL } from "../config";
import AuthGuard from "../components/AuthGuard";
import SignalCard from "../components/SignalCard";
import Modal from "../components/Modal";

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
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              Model 4 — Scheduled Pairs
            </h1>
            <p className="text-gray-400 mt-1">
              Claude analyzes each pair independently from its own Finage setups,
              price history, and news articles — {deliveredCount} of{" "}
              {runs.length} delivered on this date.
            </p>
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
                running={runningKey === run.scheduleKey}
                onRun={() => runNow(run)}
                deciding={decidingKey === run.scheduleKey}
                onDecide={(approved) => decide(run, approved)}
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

function RunCard({
  run,
  canRun,
  running,
  onRun,
  deciding,
  onDecide,
}: {
  run: Model4ScheduledRun;
  canRun: boolean;
  running: boolean;
  onRun: () => void;
  deciding: boolean;
  onDecide: (approved: boolean) => void;
}) {
  const signal = run.deliveredSignals?.[0];
  const awaitingReview =
    Boolean(signal) && run.approvalStatus !== "APPROVED" && Boolean(run.batchKey);

  return (
    <section className="rounded-3xl bg-zinc-900/30 border border-white/5 p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{run.pair}</h2>
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
              className="px-5 py-2 rounded-full bg-white text-black font-bold text-sm hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
            Claude analysis
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
        // SignalCard links to /signals/:id, but a scheduled Model 4 signal is a
        // dry-run engine candidate stored only on this run — it has no
        // Top5Refined/SignalResponse document to open, so the link is disabled.
        <div className="[&_a]:pointer-events-none [&_a]:cursor-default">
          <SignalCard signal={signal} index={0} />
        </div>
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
