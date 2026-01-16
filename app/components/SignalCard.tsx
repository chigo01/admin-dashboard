import Link from "next/link";
import { Signal } from "../types";

interface SignalCardProps {
  signal: Signal;
  index: number;
}

export default function SignalCard({ signal, index }: SignalCardProps) {
  const isBuy = signal.direction === "BUY";
  const accentColor = isBuy ? "emerald" : "rose";
  const accentText = isBuy ? "text-emerald-400" : "text-rose-400";
  const accentBg = isBuy ? "bg-emerald-500/10" : "bg-rose-500/10";
  const accentBorder = isBuy ? "border-emerald-500/20" : "border-rose-500/20";

  // Calculate confidence percentage
  const confidencePercent = Math.round(signal.confidence * 100);

  return (
    <Link
      href={`/signals/${signal._id}`}
      className="block group relative rounded-3xl bg-zinc-900/50 border border-white/5 hover:border-white/10 transition-all duration-300 hover:shadow-2xl hover:shadow-black/50 overflow-hidden cursor-pointer"
    >
      {/* Decorative gradient blob */}
      <div
        className={`absolute -top-20 -right-20 w-40 h-40 rounded-full blur-3xl opacity-10 group-hover:opacity-20 transition-opacity duration-500 ${
          isBuy ? "bg-emerald-500" : "bg-rose-500"
        }`}
      />

      <div className="p-6 md:p-8 relative z-10">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-black border border-white/10 text-xl font-bold text-white shrink-0">
              #{index + 1}
            </div>
            <div>
              <h3 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                {signal.pair}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`text-sm font-bold tracking-wider ${accentText}`}
                >
                  {signal.direction}
                </span>
                <span className="text-gray-600 text-xs">•</span>
                <span className="text-gray-400 text-xs font-mono">
                  {signal.timeframe || "H1"}
                </span>
              </div>
            </div>
          </div>

          <div
            className={`self-start md:self-auto px-4 py-2 rounded-full border ${accentBorder} ${accentBg} backdrop-blur-sm`}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 uppercase tracking-wider font-medium">
                Confidence
              </span>
              <span className={`text-lg font-bold ${accentText}`}>
                {confidencePercent}%
              </span>
            </div>
          </div>
        </div>

        {/* Price Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <PriceItem label="Entry Price" value={signal.entryPrice} icon="🎯" />
          <PriceItem
            label="Stop Loss"
            value={signal.exitTargets.stopLoss}
            icon="🛡️"
            isStopLoss
          />
        </div>

        {/* Take Profits */}
        <div className="mb-8 p-6 rounded-2xl bg-black/40 border border-white/5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-gray-400 font-medium uppercase tracking-wider">
              Take Profit Targets
            </span>
            <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/10">
              Potential Upside
            </span>
          </div>

          <div className="space-y-3">
            <TargetRow
              label="TP1"
              value={signal.exitTargets.takeProfit1}
              entry={signal.entryPrice}
              isBuy={isBuy}
            />
            <TargetRow
              label="TP2"
              value={signal.exitTargets.takeProfit2}
              entry={signal.entryPrice}
              isBuy={isBuy}
            />
          </div>
        </div>

        {/* Footer Info */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-6 border-t border-white/5">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Risk/Reward</span>
            <span className="text-white font-mono font-medium bg-white/5 px-2 py-1 rounded text-sm">
              1:{signal.riskAssessment?.riskRewardRatio?.toFixed(2) || "N/A"}
            </span>
          </div>

          {signal.reasoning && signal.reasoning.length > 0 && (
            <div className="text-left sm:text-right">
              <span className="text-xs text-gray-500">
                Based on {signal.reasoning.length} indicators
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

interface PriceItemProps {
  label: string;
  value: number;
  icon: string;
  isStopLoss?: boolean;
}

function PriceItem({ label, value, icon, isStopLoss }: PriceItemProps) {
  return (
    <div
      className={`p-4 rounded-2xl border transition-colors duration-300 ${
        isStopLoss
          ? "bg-rose-500/5 border-rose-500/10 hover:border-rose-500/20"
          : "bg-zinc-800/50 border-white/5 hover:border-white/10"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm opacity-70">{icon}</span>
        <span
          className={`text-xs font-medium uppercase tracking-wider ${
            isStopLoss ? "text-rose-400" : "text-gray-400"
          }`}
        >
          {label}
        </span>
      </div>
      <div
        className={`text-xl font-mono font-medium ${
          isStopLoss ? "text-rose-300" : "text-white"
        }`}
      >
        {value.toFixed(5)}
      </div>
    </div>
  );
}

function TargetRow({
  label,
  value,
  entry,
  isBuy,
}: {
  label: string;
  value: number;
  entry: number;
  isBuy: boolean;
}) {
  const pips = Math.abs(value - entry) * (entry > 100 ? 100 : 10000); // Rough pip calc

  return (
    <div className="flex items-center justify-between group">
      <div className="flex items-center gap-3">
        <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded min-w-[40px] text-center">
          {label}
        </span>
        <span className="text-white font-mono text-lg">{value.toFixed(5)}</span>
      </div>
      <span className="text-xs text-gray-500 group-hover:text-emerald-400 transition-colors">
        +{pips.toFixed(1)} pips
      </span>
    </div>
  );
}
