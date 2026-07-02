"use client";

import { useState, useEffect, useMemo } from "react";
import Cookies from "js-cookie";
import { SignalsResponse, Signal } from "./types";
import StatsCard from "./components/StatsCard";
import SignalCard from "./components/SignalCard";
import AuthGuard from "./components/AuthGuard";
import Modal from "./components/Modal";

import { API_BASE_URL } from "./config";

export default function AdminPage() {
  return (
    <AuthGuard>
      <AdminPageContent />
    </AuthGuard>
  );
}

function AdminPageContent() {
  const [data, setData] = useState<SignalsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"approved" | "pending">(
    "approved",
  );
  const [token, setToken] = useState<string | undefined>();
  const [isAdmin, setIsAdmin] = useState(false);
  const [revertingId, setRevertingId] = useState<string | null>(null);

  // Modal state (mirrors the signal detail page pattern)
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    type: "alert" | "confirm" | "prompt";
    title: string;
    message?: string;
    onConfirm?: (value?: string) => void;
    confirmText?: string;
  }>({
    isOpen: false,
    type: "alert",
    title: "",
  });

  const closeModal = () => {
    setModalConfig((prev) => ({ ...prev, isOpen: false }));
  };

  // Read auth cookies on the client to authorize admin-only actions
  useEffect(() => {
    const tokenFromCookie = Cookies.get("token");
    const userFromCookie = Cookies.get("user");
    setToken(tokenFromCookie);
    if (userFromCookie) {
      try {
        const parsed = JSON.parse(userFromCookie);
        setIsAdmin(parsed?.role === "admin");
      } catch {
        setIsAdmin(false);
      }
    }
  }, []);

  const modelCollections = useMemo(
    () => [
      { label: "Model 1", signals: data?.gptTop5 ?? [] },
      { label: "Model 2", signals: data?.claudeBest5 ?? [] },
      { label: "Model 3", signals: data?.claudeWorst5 ?? [] },
    ],
    [data],
  );

  // Filter signals by approval status
  const approvedSignals = useMemo(() => {
    if (!data?.signals) return [];
    return data.signals.filter(
      (signal) => signal.screenshot?.isApproved === true,
    );
  }, [data?.signals]);

  const pendingSignals = useMemo(() => {
    if (!data?.signals) return [];
    return data.signals.filter(
      (signal) => signal.screenshot?.isApproved === false,
    );
  }, [data?.signals]);

  const currentSignals =
    activeTab === "approved" ? approvedSignals : pendingSignals;

  const fetchSignals = async () => {
    setLoading(true);
    setError(null);

    try {
      // Read-only projection: never triggers the LLM/market pipeline or a
      // Discord re-send. Do NOT switch this to /top5-refined — that endpoint
      // recomputes (and can re-post to Discord) on a cache miss.
      // Read the cookie directly rather than the `token` state var: this can
      // run before the auth-cookie effect above has set state on first mount.
      const authToken = Cookies.get("token");
      const response = await fetch(`${API_BASE_URL}/top5-refined-signals`, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
      });

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
        err instanceof Error ? err.message : "An unknown error occurred",
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

  // Revert a mistakenly-approved signal back to Pending Review.
  // Reuses the existing admin-server endpoint (same as the detail page's unapprove).
  const handleRevert = (signalId: string) => {
    if (!token) {
      setModalConfig({
        isOpen: true,
        type: "alert",
        title: "Authentication Required",
        message: "Please login as an admin to revert approvals.",
        confirmText: "OK",
      });
      return;
    }
    setModalConfig({
      isOpen: true,
      type: "confirm",
      title: "Revert Approval",
      message:
        "Revert approval? This signal returns to Pending Review and disappears from approved feeds.",
      confirmText: "Revert",
      onConfirm: async () => {
        setRevertingId(signalId);
        try {
          const res = await fetch(
            `${API_BASE_URL}/signals/${signalId}/screenshot/unapprove`,
            {
              method: "PATCH",
              headers: { Authorization: `Bearer ${token}` },
            },
          );
          if (res.ok) {
            await fetchSignals();
          } else {
            const data = await res.json().catch(() => ({}));
            setModalConfig({
              isOpen: true,
              type: "alert",
              title: "Revert Failed",
              message: data?.error || `Failed to revert (${res.status}).`,
              confirmText: "OK",
            });
          }
        } catch (err) {
          setModalConfig({
            isOpen: true,
            type: "alert",
            title: "Revert Failed",
            message:
              err instanceof Error ? err.message : "Failed to revert approval",
            confirmText: "OK",
          });
        } finally {
          setRevertingId(null);
        }
      },
    });
  };

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

          <div className="flex items-center gap-4">
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
          <a
            href="/youtube"
            className="px-6 py-4 rounded-full bg-gradient-to-r from-red-500 to-orange-500 text-white font-bold text-lg hover:from-red-600 hover:to-orange-600 transition-all duration-300 hover:shadow-[0_0_20px_rgba(239,68,68,0.3)]"
          >
            📺 YouTube
          </a>
          <a
            href="/custom-signal"
            className="px-6 py-4 rounded-full bg-white/5 text-white font-bold text-lg border border-white/10 hover:bg-white/10 transition-all duration-300"
          >
            + Add Custom Signal
          </a>
          </div>
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
            <div className="grid grid-cols-1 gap-8">
              <StatsCard stats={data.stats} date={data.date} />
            </div>

            {data.customSignals && data.customSignals.length > 0 && (
              <div>
                <div className="flex items-center gap-4 mb-8">
                  <div className="h-8 w-1 bg-white rounded-full"></div>
                  <h2 className="text-3xl font-bold text-white tracking-tight">
                    Custom Signals
                  </h2>
                  <span className="px-3 py-1 rounded-full bg-white/5 text-xs font-medium text-gray-300 border border-white/10">
                    {data.customSignals.length} signals
                  </span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {data.customSignals.map((signal, index) => (
                    <SignalCard
                      key={signal._id || `custom-${index}`}
                      signal={signal}
                      index={index}
                    />
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center gap-4 mb-8">
                <div className="h-8 w-1 bg-white rounded-full"></div>
                <h2 className="text-3xl font-bold text-white tracking-tight">
                  Refined Models
                </h2>
              </div>

              <div className="space-y-10">
                {modelCollections.map((collection) => (
                  <ModelSection
                    key={collection.label}
                    title={collection.label}
                    signals={collection.signals}
                  />
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-4 mb-8">
                <div className="h-8 w-1 bg-white rounded-full"></div>
                <h2 className="text-3xl font-bold text-white tracking-tight">
                  Signal Reviews
                </h2>
              </div>

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
                      {activeTab === "approved" &&
                        isAdmin &&
                        signal._id &&
                        signal.screenshot?.isApproved && (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleRevert(signal._id!);
                            }}
                            disabled={revertingId === signal._id}
                            className="absolute bottom-4 right-4 z-10 px-4 py-2 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 font-bold text-xs disabled:opacity-50 transition-colors backdrop-blur-sm"
                          >
                            {revertingId === signal._id
                              ? "Reverting…"
                              : "↩ Revert"}
                          </button>
                        )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <Modal
        isOpen={modalConfig.isOpen}
        onClose={closeModal}
        type={modalConfig.type}
        title={modalConfig.title}
        message={modalConfig.message}
        confirmText={modalConfig.confirmText}
        onConfirm={modalConfig.onConfirm}
      />
    </div>
  );
}

function ModelSection({
  title,
  signals,
}: {
  title: string;
  signals: Signal[];
}) {
  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h3 className="text-2xl font-bold text-white tracking-tight">
            {title}
          </h3>
          <span className="px-3 py-1 rounded-full bg-white/5 text-xs font-medium text-gray-300 border border-white/10">
            {signals.length} signals
          </span>
        </div>
      </div>

      {signals.length === 0 ? (
        <div className="text-center py-14 rounded-3xl bg-zinc-900/30 border border-white/5 border-dashed text-gray-500">
          No signals available.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {signals.map((signal, index) => (
            <SignalCard
              key={`${title}-${signal._id || `${signal.pair}-${index}`}`}
              signal={signal}
              index={index}
            />
          ))}
        </div>
      )}
    </section>
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
