// Type definitions for FX Signals Admin Panel

// Mirrors TRADE_OUTCOMES in admin-server/src/services/tradeMonitorUtils.ts. The
// server has always been able to emit all six; declaring only three here meant
// any other value rendered a blank badge with an undefined class in the history
// table. REVIEW_REQUIRED in particular is now routine — the trade monitor assigns
// it to trades that never resolved inside the monitoring window.
export type TradeOutcome =
  | "PENDING"
  | "TP_HIT"
  | "TP1_HIT"
  | "TP2_HIT"
  | "SL_HIT"
  | "REVIEW_REQUIRED";

export interface Signal {
  _id?: string;
  pair: string;
  direction: "BUY" | "SELL" | "HOLD";
  confidence: number;
  entryPrice: number;
  exitTargets: {
    stopLoss: number;
    takeProfit1: number;
    takeProfit2: number;
  };
  riskAssessment?: {
    riskRewardRatio: number | null;
  };
  screenshot?: {
    url?: string;
    publicId?: string;
    isApproved: boolean;
    submittedAt?: string;
    approvedAt?: string;
    approvedBy?: string;
    rejectionReason?: string;
  };
  reasoning?: string[];
  timestamp?: string;
  timeframe?: string;
  strength?: number;
  tradeOutcome?: TradeOutcome;
  tradeOutcomeUpdatedAt?: string;
  tradeOutcomeUpdatedBy?: string;
  tradeOutcomeNote?: string;
  newsValidation?: {
    pair?: string;
    query?: string;
    providersUsed?: Array<string | unknown>;
    summary?: string;
    classification?: string;
    articles?: Array<{
      provider?: string;
      source?: string;
      title?: string;
      description?: string;
      url?: string;
      publishedAt?: string;
      _id?: string;
    }>;
  };
  technicalIndicators?: {
    macd?: {
      line: number;
      signal: number;
      histogram: number;
    };
    movingAverages?: {
      sma20: number;
      sma50: number;
      ema12: number;
      ema26: number;
    };
    bollinger?: {
      upper: number;
      middle: number;
      lower: number;
    };
    stochastic?: {
      k: number;
      d: number;
    };
    rsi?: number;
  };
  supportResistance?: {
    resistance: number[];
    support: number[];
    currentLevel: string;
  };
  aiAnalysis?: {
    gpt?: {
      model?: string;
      analysis?: string;
    };
    claude?: {
      model?: string;
      analysis?: string;
    };
  };
  isCustom?: boolean;
  candidateId?: string;
  batchKey?: string;
  sourceCollection?: "Top5Refined" | "SignalResponse" | "Model4ScheduledRun";
}

export interface Stats {
  actionableSignalCount: number;
  pairNewsCoverage: number;
  totalNewsArticles: number;
  newsProviders: string[];
  generatedAt: string;
}

export interface SignalsResponse {
  success: boolean;
  date: string;
  gptTop5: Signal[];
  claudeBest5: Signal[];
  claudeWorst5: Signal[];
  engineBest5?: Signal[];
  customSignals?: Signal[];
  signals: Signal[];
  stats: Stats;
  error?: string;
}

// Model 4's scheduled per-pair analysis. "SCHEDULED" is synthesized by the
// server for a configured pair that has no run yet on the requested date.
export type Model4RunStatus =
  | "SCHEDULED"
  | "RUNNING"
  | "COMPLETED"
  | "EMPTY"
  | "FAILED";

export interface Model4ScheduledRun {
  scheduleKey: string;
  pair: string;
  analysisTimeWAT: string;
  status: Model4RunStatus;
  /** How many Finage setups Claude was given to choose between. */
  candidateCount: number;
  newsValidatedCount: number;
  deliveredCount: number;
  deliveredSignals: Signal[];
  /** Claude's own reading of the retrieved articles. */
  newsClassification: "bullish" | "bearish" | "neutral" | null;
  newsArticleCount: number;
  newsProviders: string[];
  analysisSummary: string | null;
  noTradeReason: string | null;
  /** Identifies the run for the approve endpoint; null until the run exists. */
  batchKey: string | null;
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED" | null;
  discordDeliveredAt: string | null;
  completedAt: string | null;
  updatedAt: string | null;
  error: string | null;
}

export interface Model4RunsResponse {
  success: boolean;
  date: string;
  runs: Model4ScheduledRun[];
  error?: string;
}

export interface ApprovedHistoryItem {
  date: string;
  sourceCollection: "Top5Refined" | "SignalResponse";
  signal: Signal;
}

export type ApprovalRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface ApprovalRequest {
  _id: string;
  signalId: string;
  signalSnapshot: Partial<Signal>;
  requestedBy: {
    userId: string;
    username?: string;
    email?: string;
  };
  status: ApprovalRequestStatus;
  rejectionReason?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ApprovalRequestsResponse {
  success: boolean;
  data: ApprovalRequest[];
  error?: string;
}

export interface ApprovedHistoryResponse {
  success: boolean;
  items: ApprovedHistoryItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  error?: string;
}

export interface ManualEmailUser {
  email: string;
  name?: string;
}

export interface ManualEmailUsersResponse {
  ok: boolean;
  users: ManualEmailUser[];
  total: number;
  page: number;
  message?: string;
}

export interface ManualEmailRecipientResult {
  email: string;
  status: "sent" | "failed";
  error?: string;
}

export interface ManualEmailSendResponse {
  ok: boolean;
  sent: number;
  failed: number;
  recipients: ManualEmailRecipientResult[];
  message?: string;
}

export interface ManualEmailPreviewResponse {
  ok: boolean;
  subject: string;
  html: string;
  message?: string;
}

export type ManualEmailJobStatus = "queued" | "in_progress" | "completed" | "failed";

export interface ManualEmailJob {
  jobId: string;
  status: ManualEmailJobStatus;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  subject: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export interface ManualEmailBroadcastResponse extends ManualEmailJob {
  ok: boolean;
  message?: string;
}

export interface ManualEmailJobResponse extends ManualEmailJob {
  ok: boolean;
  message?: string;
}

export interface ManualEmailJobsListResponse {
  ok: boolean;
  jobs: ManualEmailJob[];
  message?: string;
}
