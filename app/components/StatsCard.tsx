import { Stats } from "../types";

interface StatsCardProps {
  stats: Stats;
  date: string;
}

export default function StatsCard({ stats, date }: StatsCardProps) {
  const providerCount = stats.newsProviders?.length ?? 0;
  const displayDate = stats.generatedAt || date;

  return (
    <div className="h-full rounded-3xl bg-zinc-900/50 p-6 md:p-8 border border-white/5 hover:border-white/10 transition-colors duration-300 flex flex-col">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white tracking-tight mb-2">
          Signal Statistics
        </h2>
        <p className="text-sm text-gray-500 font-mono">
          {new Date(displayDate).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 grow">
        <StatItem
          label="Actionable"
          value={stats.actionableSignalCount}
          subtext="Tradable Signals"
        />
        <StatItem
          label="News Coverage"
          value={stats.pairNewsCoverage}
          subtext="Pairs Covered"
        />
        <StatItem
          label="Articles"
          value={stats.totalNewsArticles}
          subtext="News Validations"
          highlight
        />
        <StatItem
          label="Providers"
          value={providerCount}
          subtext="News Sources"
        />
      </div>

      <div className="mt-4 pt-4 border-t border-white/5 flex justify-between items-center">
        <span className="text-xs text-gray-500 uppercase tracking-wider">
          Active Providers
        </span>
        <span className="text-sm font-mono text-emerald-400">
          {stats.newsProviders?.join(", ") || "N/A"}
        </span>
      </div>
    </div>
  );
}

interface StatItemProps {
  label: string;
  value: string | number;
  subtext: string;
  highlight?: boolean;
}

function StatItem({ label, value, subtext, highlight }: StatItemProps) {
  return (
    <div
      className={`p-4 rounded-2xl border ${
        highlight
          ? "bg-white text-black border-white"
          : "bg-black/40 border-white/5 text-white"
      } transition-all duration-300`}
    >
      <div
        className={`text-3xl font-bold mb-1 tracking-tight ${
          highlight ? "text-black" : "text-white"
        }`}
      >
        {value}
      </div>
      <div
        className={`text-sm font-medium mb-1 ${
          highlight ? "text-black/70" : "text-gray-300"
        }`}
      >
        {label}
      </div>
      <div
        className={`text-xs ${highlight ? "text-black/40" : "text-gray-600"}`}
      >
        {subtext}
      </div>
    </div>
  );
}
