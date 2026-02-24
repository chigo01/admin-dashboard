"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Cookies from "js-cookie";
import AuthGuard from "../components/AuthGuard";
import Modal from "../components/Modal";
import { API_BASE_URL } from "../config";
import {
  ApprovedHistoryItem,
  ApprovedHistoryResponse,
  Signal,
  TradeOutcome,
} from "../types";

const PAGE_SIZE = 20;

const outcomeStyles: Record<TradeOutcome, string> = {
  PENDING: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  TP_HIT: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  SL_HIT: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

const outcomeLabels: Record<TradeOutcome, string> = {
  PENDING: "Pending",
  TP_HIT: "TP Hit",
  SL_HIT: "SL Hit",
};

export default function HistoryPage() {
  return (
    <AuthGuard>
      <HistoryPageContent />
    </AuthGuard>
  );
}

function HistoryPageContent() {
  const [token, setToken] = useState<string | null>(null);
  const [items, setItems] = useState<ApprovedHistoryItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    type: "alert" | "confirm" | "prompt";
    title: string;
    message?: string;
    onConfirm?: (value?: string) => void;
    confirmText?: string;
    placeholder?: string;
  }>({
    isOpen: false,
    type: "alert",
    title: "",
  });

  const closeModal = () => {
    setModalConfig((prev) => ({ ...prev, isOpen: false }));
  };

  useEffect(() => {
    const userCookie = Cookies.get("user");
    const rawToken = Cookies.get("token");

    if (!userCookie) {
      setToken(rawToken || null);
      return;
    }

    try {
      const parsedUser = JSON.parse(userCookie);
      setToken(parsedUser?.token || rawToken || null);
    } catch {
      setToken(rawToken || null);
    }
  }, []);

  const fetchHistory = useCallback(
    async (pageToFetch: number) => {
      if (!token) return;

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `${API_BASE_URL}/approved-signals/history?page=${pageToFetch}&limit=${PAGE_SIZE}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const result = (await response.json()) as ApprovedHistoryResponse & {
          message?: string;
        };

        if (!response.ok || !result.success) {
          throw new Error(
            result.error || result.message || "Failed to fetch history"
          );
        }

        setItems(result.items || []);
        setTotalPages(result.pagination?.totalPages || 0);
        setTotalItems(result.pagination?.total || 0);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch history");
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (!token) return;
    fetchHistory(page);
  }, [token, page, fetchHistory]);

  const updateTradeOutcome = async (
    signalId: string,
    tradeOutcome: TradeOutcome,
    note?: string
  ) => {
    if (!token) {
      setModalConfig({
        isOpen: true,
        type: "alert",
        title: "Authentication Required",
        message: "Please login again to update signal outcomes.",
        confirmText: "OK",
      });
      return;
    }

    setUpdatingId(signalId);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/approved-signals/${signalId}/outcome`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            tradeOutcome,
            ...(note ? { note } : {}),
          }),
        }
      );

      const result = (await response.json()) as {
        success?: boolean;
        signal?: Signal;
        error?: string;
        message?: string;
      };

      if (!response.ok || !result.success) {
        throw new Error(
          result.error || result.message || "Failed to update outcome"
        );
      }

      setItems((previousItems) =>
        previousItems.map((item) =>
          item.signal._id === signalId && result.signal
            ? { ...item, signal: { ...item.signal, ...result.signal } }
            : item
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update outcome");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleResetToPending = (signalId: string) => {
    setModalConfig({
      isOpen: true,
      type: "prompt",
      title: "Reset Outcome to Pending",
      message:
        "A note is required. Describe why this signal outcome is being reset.",
      confirmText: "Reset",
      placeholder: "Reason for reset...",
      onConfirm: (value) => {
        const note = value?.trim();
        if (!note) {
          setError("Please provide a note before resetting to Pending.");
          return;
        }
        updateTradeOutcome(signalId, "PENDING", note);
      },
    });
  };

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/10 pb-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              Approved Signals History
            </h1>
            <p className="text-gray-400 mt-1">
              All approved signals across all dates. Update TP/SL outcomes from
              this page.
            </p>
          </div>
          <div className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm text-gray-300">
            {totalItems} total approved signals
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-200">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-24 text-center text-gray-400">Loading history...</div>
        ) : items.length === 0 ? (
          <div className="py-24 text-center text-gray-500 border border-dashed border-white/10 rounded-2xl">
            No approved signals found.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {items.map((item, index) => {
              const signal = item.signal;
              const signalId = signal._id || "";
              const outcome = signal.tradeOutcome || "PENDING";
              const isUpdating = updatingId === signalId;

              return (
                <div
                  key={signalId || `${item.date}-${index}`}
                  className="rounded-2xl border border-white/10 bg-zinc-900/40 p-5 space-y-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-bold">{signal.pair}</h2>
                      <p className="text-sm text-gray-400">
                        {signal.direction} • {signal.timeframe || "H1"} •{" "}
                        {formatDateTime(signal.timestamp)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Source date: {item.date} ({item.sourceCollection})
                      </p>
                    </div>
                    <div
                      className={`px-3 py-1 rounded-full border text-xs font-semibold ${outcomeStyles[outcome]}`}
                    >
                      {outcomeLabels[outcome]}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <Metric label="Entry" value={signal.entryPrice} />
                    <Metric label="TP1" value={signal.exitTargets.takeProfit1} />
                    <Metric label="SL" value={signal.exitTargets.stopLoss} />
                  </div>

                  {signal.tradeOutcomeNote && (
                    <div className="text-xs text-gray-300 bg-white/5 border border-white/10 rounded-lg p-3">
                      <span className="text-gray-400">Note:</span>{" "}
                      {signal.tradeOutcomeNote}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() =>
                        signalId && updateTradeOutcome(signalId, "TP_HIT")
                      }
                      disabled={!signalId || isUpdating}
                      className="px-3 py-2 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 disabled:opacity-50"
                    >
                      Mark TP
                    </button>
                    <button
                      onClick={() =>
                        signalId && updateTradeOutcome(signalId, "SL_HIT")
                      }
                      disabled={!signalId || isUpdating}
                      className="px-3 py-2 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 disabled:opacity-50"
                    >
                      Mark SL
                    </button>
                    <button
                      onClick={() => signalId && handleResetToPending(signalId)}
                      disabled={!signalId || isUpdating}
                      className="px-3 py-2 rounded-lg bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 disabled:opacity-50"
                    >
                      Reset to Pending
                    </button>
                    {signalId && (
                      <Link
                        href={`/signals/${signalId}`}
                        className="ml-auto px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-gray-200 hover:bg-white/15"
                      >
                        Open details
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-white/10 pt-6">
          <button
            onClick={() => setPage((currentPage) => Math.max(currentPage - 1, 1))}
            disabled={page <= 1 || loading}
            className="px-4 py-2 rounded-lg bg-white/10 border border-white/15 text-gray-200 disabled:opacity-50"
          >
            Previous
          </button>
          <p className="text-sm text-gray-400">
            Page {page} of {Math.max(totalPages, 1)}
          </p>
          <button
            onClick={() =>
              setPage((currentPage) =>
                totalPages === 0 ? 1 : Math.min(currentPage + 1, totalPages)
              )
            }
            disabled={loading || totalPages === 0 || page >= totalPages}
            className="px-4 py-2 rounded-lg bg-white/10 border border-white/15 text-gray-200 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      <Modal
        isOpen={modalConfig.isOpen}
        onClose={closeModal}
        title={modalConfig.title}
        message={modalConfig.message}
        type={modalConfig.type}
        onConfirm={modalConfig.onConfirm}
        confirmText={modalConfig.confirmText}
        placeholder={modalConfig.placeholder}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-3">
      <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-mono text-white mt-1">{value.toFixed(5)}</p>
    </div>
  );
}

function formatDateTime(timestamp?: string) {
  if (!timestamp) return "Unknown time";

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Unknown time";

  return date.toLocaleString();
}
