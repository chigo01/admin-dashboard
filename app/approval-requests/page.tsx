"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Cookies from "js-cookie";
import { ApprovalRequest, ApprovalRequestsResponse } from "../types";
import { API_BASE_URL } from "../config";
import AuthGuard from "../components/AuthGuard";
import Modal from "../components/Modal";

export default function ApprovalRequestsPage() {
  return (
    <AuthGuard>
      <ApprovalRequestsContent />
    </AuthGuard>
  );
}

function ApprovalRequestsContent() {
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | undefined>();
  const [isAdmin, setIsAdmin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    type: "alert" | "confirm" | "prompt";
    title: string;
    message?: string;
    onConfirm?: (value?: string) => void;
    confirmText?: string;
    placeholder?: string;
  }>({ isOpen: false, type: "alert", title: "" });

  const closeModal = () => setModalConfig((prev) => ({ ...prev, isOpen: false }));

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

  const fetchRequests = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/approval-requests`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error("Failed to load approval requests");
      }
      const result: ApprovalRequestsResponse = await res.json();
      if (!result.success) throw new Error(result.error || "Failed to load");
      setRequests(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load requests");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (authChecked && isAdmin && token) {
      fetchRequests();
    } else if (authChecked) {
      setLoading(false);
    }
  }, [authChecked, isAdmin, token, fetchRequests]);

  const resolveRequest = async (
    request: ApprovalRequest,
    action: "approve" | "reject",
    reason?: string
  ) => {
    if (!token) return;
    setActingId(request._id);
    try {
      const res = await fetch(
        `${API_BASE_URL}/approval-requests/${request._id}/${action}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body:
            action === "reject"
              ? JSON.stringify({ rejectionReason: reason })
              : undefined,
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Action failed");
      await fetchRequests();
    } catch (err) {
      setModalConfig({
        isOpen: true,
        type: "alert",
        title: "Action Failed",
        message: err instanceof Error ? err.message : "Action failed",
        confirmText: "OK",
      });
    } finally {
      setActingId(null);
    }
  };

  const confirmApprove = (request: ApprovalRequest) => {
    setModalConfig({
      isOpen: true,
      type: "confirm",
      title: "Approve Signal",
      message: `Approve ${request.signalSnapshot?.pair ?? "this signal"}? This publishes it and notifies all subscribers.`,
      confirmText: "Approve",
      onConfirm: () => resolveRequest(request, "approve"),
    });
  };

  const confirmReject = (request: ApprovalRequest) => {
    setModalConfig({
      isOpen: true,
      type: "prompt",
      title: "Reject Request",
      message: "Provide a reason for rejecting this request:",
      confirmText: "Deny",
      placeholder: "Enter rejection reason...",
      onConfirm: (reason) => resolveRequest(request, "reject", reason),
    });
  };

  if (!authChecked || loading) {
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

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8 font-sans">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              Approval Requests
            </h1>
            <p className="text-gray-400 mt-1">
              Pending signal approvals submitted by users.
            </p>
          </div>
          <button
            onClick={fetchRequests}
            className="px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-sm transition-colors"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="p-6 rounded-2xl bg-red-500/10 border border-red-500/20">
            <p className="text-red-300">{error}</p>
          </div>
        )}

        {requests.length === 0 ? (
          <div className="text-center py-20 rounded-3xl bg-zinc-900/30 border border-white/5 border-dashed">
            <span className="text-6xl mb-6 block opacity-50">📭</span>
            <p className="text-xl text-gray-500 font-light">
              No pending approval requests.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((request) => (
              <RequestCard
                key={request._id}
                request={request}
                acting={actingId === request._id}
                onApprove={() => confirmApprove(request)}
                onReject={() => confirmReject(request)}
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
        placeholder={modalConfig.placeholder}
      />
    </div>
  );
}

function RequestCard({
  request,
  acting,
  onApprove,
  onReject,
}: {
  request: ApprovalRequest;
  acting: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const signal = request.signalSnapshot || {};
  const isBuy = signal.direction === "BUY";
  const accent = isBuy
    ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
    : signal.direction === "SELL"
    ? "text-rose-400 bg-rose-500/10 border-rose-500/20"
    : "text-gray-300 bg-white/5 border-white/10";

  return (
    <div className="p-6 rounded-2xl bg-zinc-900/40 border border-white/5">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-2xl font-bold">{signal.pair ?? "Signal"}</span>
            {signal.direction && (
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold tracking-wider border ${accent}`}
              >
                {signal.direction}
              </span>
            )}
            {typeof signal.confidence === "number" && (
              <span className="text-sm text-gray-400">
                {Math.round(signal.confidence * 100)}% confidence
              </span>
            )}
          </div>

          <div className="text-sm text-gray-400">
            Requested by{" "}
            <span className="text-white font-medium">
              {request.requestedBy?.username ?? "Unknown"}
            </span>
            {request.requestedBy?.email ? (
              <span className="text-gray-500"> ({request.requestedBy.email})</span>
            ) : null}{" "}
            • {new Date(request.createdAt).toLocaleString()}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Detail label="Entry" value={signal.entryPrice} />
            <Detail
              label="TP1"
              value={signal.exitTargets?.takeProfit1}
              color="text-emerald-400"
            />
            <Detail
              label="TP2"
              value={signal.exitTargets?.takeProfit2}
              color="text-emerald-400"
            />
            <Detail
              label="Stop Loss"
              value={signal.exitTargets?.stopLoss}
              color="text-rose-400"
            />
          </div>
          {signal.timeframe && (
            <div className="text-xs text-gray-500">
              Timeframe: {signal.timeframe}
            </div>
          )}
          <Link
            href={`/signals/${request.signalId}`}
            className="inline-block text-sm text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
          >
            View signal →
          </Link>
        </div>

        <div className="flex md:flex-col gap-2 shrink-0">
          <button
            onClick={onApprove}
            disabled={acting}
            className="px-5 py-2 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 font-bold text-sm disabled:opacity-50 transition-colors"
          >
            Approve
          </button>
          <button
            onClick={onReject}
            disabled={acting}
            className="px-5 py-2 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 font-bold text-sm disabled:opacity-50 transition-colors"
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
  color = "text-white",
}: {
  label: string;
  value?: number;
  color?: string;
}) {
  return (
    <div className="rounded-xl bg-black/30 border border-white/5 px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest text-gray-500">
        {label}
      </div>
      <div className={`font-mono font-bold ${color}`}>
        {typeof value === "number" ? value : "N/A"}
      </div>
    </div>
  );
}
