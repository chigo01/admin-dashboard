"use client";

import { useEffect, useState } from "react";
import { Signal } from "../types";

interface EditSignalModalProps {
  isOpen: boolean;
  onClose: () => void;
  signal: Signal;
  token: string;
  apiBaseUrl: string;
  onSuccess: () => void;
}

type FormState = {
  entryPrice: string;
  takeProfit1: string;
  takeProfit2: string;
  stopLoss: string;
};

function toInitialState(signal: Signal): FormState {
  return {
    entryPrice: String(signal.entryPrice ?? ""),
    takeProfit1: String(signal.exitTargets?.takeProfit1 ?? ""),
    takeProfit2: String(signal.exitTargets?.takeProfit2 ?? ""),
    stopLoss: String(signal.exitTargets?.stopLoss ?? ""),
  };
}

function parseFinite(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

function validate(
  direction: Signal["direction"],
  values: { entryPrice: number; takeProfit1: number; takeProfit2: number; stopLoss: number }
): string | null {
  const { entryPrice, takeProfit1, takeProfit2, stopLoss } = values;
  if (entryPrice <= 0) return "entryPrice must be greater than zero";

  if (direction === "BUY") {
    if (stopLoss >= entryPrice)
      return "For BUY signals, stopLoss must be below entryPrice";
    if (takeProfit1 <= entryPrice)
      return "For BUY signals, takeProfit1 must be above entryPrice";
    if (takeProfit2 <= takeProfit1)
      return "For BUY signals, takeProfit2 must be above takeProfit1";
  }

  if (direction === "SELL") {
    if (stopLoss <= entryPrice)
      return "For SELL signals, stopLoss must be above entryPrice";
    if (takeProfit1 >= entryPrice)
      return "For SELL signals, takeProfit1 must be below entryPrice";
    if (takeProfit2 >= takeProfit1)
      return "For SELL signals, takeProfit2 must be below takeProfit1";
  }

  return null;
}

export default function EditSignalModal({
  isOpen,
  onClose,
  signal,
  token,
  apiBaseUrl,
  onSuccess,
}: EditSignalModalProps) {
  const [form, setForm] = useState<FormState>(() => toInitialState(signal));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setForm(toInitialState(signal));
      setError(null);
      setSubmitting(false);
    }
  }, [isOpen, signal]);

  if (!isOpen) return null;

  const orderingHint =
    signal.direction === "BUY"
      ? "BUY ordering: stopLoss < entryPrice < takeProfit1 < takeProfit2"
      : signal.direction === "SELL"
        ? "SELL ordering: takeProfit2 < takeProfit1 < entryPrice < stopLoss"
        : "HOLD signals cannot be edited";

  const handleChange = (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

  const handleSubmit = async () => {
    setError(null);

    const entryPrice = parseFinite(form.entryPrice);
    const takeProfit1 = parseFinite(form.takeProfit1);
    const takeProfit2 = parseFinite(form.takeProfit2);
    const stopLoss = parseFinite(form.stopLoss);

    if (
      entryPrice === null ||
      takeProfit1 === null ||
      takeProfit2 === null ||
      stopLoss === null
    ) {
      setError("All four fields must be valid numbers");
      return;
    }

    const validationError = validate(signal.direction, {
      entryPrice,
      takeProfit1,
      takeProfit2,
      stopLoss,
    });
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(
        `${apiBaseUrl}/signals/${signal._id}/exit-targets`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            entryPrice,
            takeProfit1,
            takeProfit2,
            stopLoss,
          }),
        }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error || `Update failed (HTTP ${res.status})`);
        setSubmitting(false);
        return;
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={submitting ? undefined : onClose}
    >
      <div
        className="bg-zinc-900 border border-white/10 rounded-2xl max-w-md w-full p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !submitting) onClose();
        }}
      >
        <h2 className="text-xl font-bold text-white mb-1">Edit Price Levels</h2>
        <p className="text-gray-400 text-sm mb-4">
          {signal.pair} · {signal.direction}
        </p>
        <p className="text-xs text-gray-500 mb-5 font-mono">{orderingHint}</p>

        <div className="space-y-3 mb-4">
          <Field
            label="Entry Price"
            value={form.entryPrice}
            onChange={handleChange("entryPrice")}
            disabled={submitting}
          />
          <Field
            label="Take Profit 1"
            value={form.takeProfit1}
            onChange={handleChange("takeProfit1")}
            disabled={submitting}
          />
          <Field
            label="Take Profit 2"
            value={form.takeProfit2}
            onChange={handleChange("takeProfit2")}
            disabled={submitting}
          />
          <Field
            label="Stop Loss"
            value={form.stopLoss}
            onChange={handleChange("stopLoss")}
            disabled={submitting}
          />
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-200 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-6 py-2.5 rounded-lg bg-white/5 text-gray-300 hover:bg-white/10 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-6 py-2.5 rounded-lg font-bold bg-emerald-500 hover:bg-emerald-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-widest text-gray-500 mb-1.5">
        {label}
      </span>
      <input
        type="number"
        step="any"
        inputMode="decimal"
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all disabled:opacity-50"
      />
    </label>
  );
}
