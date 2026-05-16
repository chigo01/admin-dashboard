"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Cookies from "js-cookie";
import { Signal } from "../../types";
import { API_BASE_URL } from "../../config";
import Modal from "../../components/Modal";
import EditSignalModal from "../../components/EditSignalModal";
import AuthGuard from "../../components/AuthGuard";
import TradingViewChart from "../../components/TradingViewChart";

export default function SignalDetailsPage() {
  return (
    <AuthGuard>
      <SignalDetailsContent />
    </AuthGuard>
  );
}

function SignalDetailsContent() {
  const params = useParams();
  const router = useRouter();
  const [signal, setSignal] = useState<Signal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [token, setToken] = useState<string | undefined>();
  const [user, setUser] = useState<any>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const id = params?.id as string;

  // Modal state
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

  // Read cookies on client side
  useEffect(() => {
    const tokenFromCookie = Cookies.get("token");
    const userFromCookie = Cookies.get("user");

    console.log("Reading cookies:", { tokenFromCookie, userFromCookie });

    if (userFromCookie) {
      try {
        const parsedUser = JSON.parse(userFromCookie);
        setUser(parsedUser);
        setIsAdmin(parsedUser?.role === "admin");
        // Token is inside the user object
        setToken(parsedUser?.token || tokenFromCookie);
        console.log("Token extracted:", parsedUser?.token);
      } catch (e) {
        console.error("Failed to parse user cookie:", e);
        setToken(tokenFromCookie);
      }
    } else {
      setToken(tokenFromCookie);
    }
  }, []);

  useEffect(() => {
    if (!id) return;

    const fetchSignal = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/signals/${id}`);
        if (!response.ok) {
          throw new Error("Signal not found");
        }
        const data = await response.json();
        setSignal(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load signal");
      } finally {
        setLoading(false);
      }
    };

    fetchSignal();
  }, [id]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    console.log("File selected:", file);
    if (!file) return;

    console.log("Token:", token);
    if (!token) {
      setModalConfig({
        isOpen: true,
        type: "alert",
        title: "Authentication Required",
        message: "Please login to upload screenshot",
        confirmText: "OK",
      });
      return;
    }

    setUploading(true);
    try {
      // 1. Get Signature
      console.log(
        "Requesting signature from:",
        `${API_BASE_URL}/cloudinary-signature`
      );
      const sigRes = await fetch(`${API_BASE_URL}/cloudinary-signature`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log("Signature response status:", sigRes.status);
      if (!sigRes.ok) {
        const errorText = await sigRes.text();
        console.error("Signature error:", errorText);
        throw new Error("Failed to get upload signature");
      }
      const { timestamp, signature, cloudName, apiKey } = await sigRes.json();
      console.log("Got signature:", { timestamp, cloudName, apiKey });

      // 2. Upload to Cloudinary
      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key", apiKey);
      formData.append("timestamp", timestamp.toString());
      formData.append("signature", signature);
      formData.append("folder", "fx-signals");

      console.log("Uploading to Cloudinary...");
      const uploadRes = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        {
          method: "POST",
          body: formData,
        }
      );
      console.log("Upload response status:", uploadRes.status);
      const uploadData = await uploadRes.json();
      console.log("Upload data:", uploadData);
      if (!uploadRes.ok)
        throw new Error(uploadData.error?.message || "Upload failed");

      // 3. Save to Backend
      console.log("Saving to backend...");
      const saveRes = await fetch(`${API_BASE_URL}/signals/${id}/screenshot`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          url: uploadData.secure_url,
          publicId: uploadData.public_id,
        }),
      });
      console.log("Save response status:", saveRes.status);

      if (!saveRes.ok) {
        const errorText = await saveRes.text();
        console.error("Save error:", errorText);
        throw new Error("Failed to save screenshot reference");
      }

      console.log("Success! Reloading...");
      // Reload signal
      window.location.reload();
    } catch (err) {
      console.error("Upload error:", err);
      setModalConfig({
        isOpen: true,
        type: "alert",
        title: "Upload Failed",
        message: err instanceof Error ? err.message : "Upload failed",
        confirmText: "OK",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleApprove = async () => {
    if (!token) {
      setModalConfig({
        isOpen: true,
        type: "alert",
        title: "Authentication Required",
        message: "Please login to approve screenshots",
        confirmText: "OK",
      });
      return;
    }
    setModalConfig({
      isOpen: true,
      type: "confirm",
      title: "Approve Screenshot",
      message: "Are you sure you want to approve this screenshot?",
      confirmText: "Approve",
      onConfirm: async () => {
        try {
          const res = await fetch(
            `${API_BASE_URL}/signals/${id}/screenshot/approve`,
            {
              method: "PATCH",
              headers: { Authorization: `Bearer ${token}` },
            }
          );
          if (res.ok) window.location.reload();
        } catch (err) {
          console.error(err);
        }
      },
    });
  };

  const handleDeny = async () => {
    if (!token) {
      setModalConfig({
        isOpen: true,
        type: "alert",
        title: "Authentication Required",
        message: "Please login to deny screenshots",
        confirmText: "OK",
      });
      return;
    }
    setModalConfig({
      isOpen: true,
      type: "prompt",
      title: "Deny Screenshot",
      message: "Please provide a reason for denying this screenshot:",
      confirmText: "Deny",
      placeholder: "Enter rejection reason...",
      onConfirm: async (reason) => {
        if (!reason) return;
        try {
          const res = await fetch(
            `${API_BASE_URL}/signals/${id}/screenshot/deny`,
            {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ rejectionReason: reason }),
            }
          );
          if (res.ok) window.location.reload();
        } catch (err) {
          console.error(err);
        }
      },
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error || !signal) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-4">
        <p className="text-red-400 text-xl">{error || "Signal not found"}</p>
        <button
          onClick={() => router.back()}
          className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
        >
          Go Back
        </button>
      </div>
    );
  }

  const isBuy = signal.direction === "BUY";
  const accentText = isBuy ? "text-emerald-400" : "text-rose-400";
  const accentBg = isBuy ? "bg-emerald-500/10" : "bg-rose-500/10";
  const accentBorder = isBuy ? "border-emerald-500/20" : "border-rose-500/20";
  const hasScreenshotUrl = Boolean(signal.screenshot?.url);
  const isScreenshotApproved = signal.screenshot?.isApproved === true;
  const isApprovedWithoutScreenshot = isScreenshotApproved && !hasScreenshotUrl;
  const showScreenshotStatus = hasScreenshotUrl || isApprovedWithoutScreenshot;
  const screenshotStatusLabel = isScreenshotApproved
    ? hasScreenshotUrl
      ? "Approved"
      : "Approved (No Screenshot)"
    : "Pending Review";

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8 font-sans">
      <div className="mx-auto space-y-8">
        {/* Navigation */}
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
            Back to Signals
          </button>

          {isAdmin && token && signal.direction !== "HOLD" && (
            <button
              onClick={() => setIsEditOpen(true)}
              className="px-6 py-2.5 bg-white text-black font-bold rounded-full hover:bg-gray-200 transition-colors text-sm"
            >
              Edit Prices
            </button>
          )}
        </div>

        {/* Header Card */}
        <div className="relative overflow-hidden rounded-3xl bg-zinc-900/50 border border-white/5 p-8">
          <div
            className={`absolute -top-20 -right-20 w-64 h-64 rounded-full blur-3xl opacity-20 ${
              isBuy ? "bg-emerald-500" : "bg-rose-500"
            }`}
          />

          <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
              <div className="flex items-center gap-4 mb-2">
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
                  {signal.pair}
                </h1>
                <span
                  className={`px-4 py-1.5 rounded-full text-sm font-bold tracking-wider ${accentText} ${accentBg} border ${accentBorder}`}
                >
                  {signal.direction}
                </span>
              </div>
              <p className="text-gray-400 font-mono">
                {signal.timeframe} Timeframe •{" "}
                {new Date(signal.timestamp || "").toLocaleString()}
              </p>
            </div>

            <div className="flex flex-col items-end">
              <div className="text-3xl font-bold text-white">
                {(signal.confidence * 100).toFixed(0)}%
              </div>
              <div className="text-sm text-gray-400 uppercase tracking-wider">
                Confidence Score
              </div>
            </div>
          </div>
        </div>

        {/* Price Levels Grid */}
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

        {/* Price Action Chart */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <span>📈</span> Price Action ({signal.pair} · {signal.timeframe})
          </h2>
          <TradingViewChart signal={signal} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Extended Targets */}
          <div className="space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <span>🎯</span> Extended Targets
            </h2>
            <div className="p-6 rounded-2xl bg-zinc-900/30 border border-white/5 space-y-4">
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

          {/* Reasoning */}
          <div className="space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <span>🧠</span> AI Reasoning
            </h2>
            <div className="p-6 rounded-2xl bg-zinc-900/30 border border-white/5 h-full">
              <ul className="space-y-3">
                {signal.reasoning?.map((reason, idx) => (
                  <li
                    key={idx}
                    className="flex gap-3 text-gray-300 text-sm leading-relaxed"
                  >
                    <span className="text-purple-400 mt-1">•</span>
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Screenshot Section */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>📸</span> Screenshot Proof
            </div>
            {showScreenshotStatus ? (
              <div
                className={`px-3 py-1 text-xs rounded-full border ${
                  isScreenshotApproved
                    ? "bg-green-500/10 border-green-500/20 text-green-400"
                    : "bg-yellow-500/10 border-yellow-500/20 text-yellow-400"
                }`}
              >
                {screenshotStatusLabel}
              </div>
            ) : null}
          </h2>

          <div className="p-6 rounded-3xl bg-zinc-900/30 border border-white/5 min-h-[200px] flex items-center justify-center relative group">
            {hasScreenshotUrl ? (
              <div className="w-full relative">
                <img
                  src={signal.screenshot?.url}
                  alt="Trading Screenshot"
                  className="w-full rounded-xl border border-white/10"
                />
                {isAdmin && !isScreenshotApproved && (
                  <div className="absolute top-4 right-4 flex gap-2">
                    <button
                      onClick={handleApprove}
                      className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg shadow-lg font-bold text-sm"
                    >
                      Approve
                    </button>
                    <button
                      onClick={handleDeny}
                      className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg shadow-lg font-bold text-sm"
                    >
                      Deny
                    </button>
                  </div>
                )}
                {!isScreenshotApproved &&
                  signal.screenshot?.rejectionReason && (
                    <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-200 text-sm">
                      <strong>Rejected:</strong>{" "}
                      {signal.screenshot.rejectionReason}
                    </div>
                  )}
              </div>
            ) : (
              <div className="text-center">
                {uploading ? (
                  <div className="animate-pulse text-emerald-400">
                    Uploading...
                  </div>
                ) : (
                  <div>
                    <p className="text-gray-500 mb-4">
                      {isApprovedWithoutScreenshot
                        ? "This signal is approved without a screenshot."
                        : "No screenshot uploaded yet"}
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      {isAdmin && !isScreenshotApproved && (
                        <button
                          onClick={handleApprove}
                          className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-full transition-colors"
                        >
                          Approve Without Screenshot
                        </button>
                      )}
                      <label className="cursor-pointer px-6 py-3 bg-white text-black font-bold rounded-full hover:bg-gray-200 transition-colors inline-block">
                        Upload Screenshot
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleFileSelect}
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Technical Analysis */}
        {/* Placeholder for future expansion of Technical Details */}
      </div>

      {/* Modal */}
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

      {/* Edit Signal Modal */}
      {isEditOpen && token && (
        <EditSignalModal
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          signal={signal}
          token={token}
          apiBaseUrl={API_BASE_URL}
          onSuccess={() => window.location.reload()}
        />
      )}
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
    <div className="p-6 rounded-2xl bg-zinc-900/30 border border-white/5 flex flex-col items-center justify-center text-center hover:bg-zinc-900/50 transition-colors">
      <span className="text-xs uppercase tracking-widest text-gray-500 mb-2">
        {label}
      </span>
      <span className={`text-2xl font-mono font-bold ${color}`}>
        {value}
      </span>
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
