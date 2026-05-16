// Type definitions for FX Signals Admin Panel
export type TradeOutcome = "PENDING" | "TP_HIT" | "SL_HIT";

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
  customSignals?: Signal[];
  signals: Signal[];
  stats: Stats;
  error?: string;
}

export interface ApprovedHistoryItem {
  date: string;
  sourceCollection: "Top5Refined" | "SignalResponse";
  signal: Signal;
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
