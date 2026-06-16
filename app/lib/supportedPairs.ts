// Curated list of trading pairs the chart can search/compare. Kept to 6-letter
// symbols so they satisfy the datafeed's resolveSymbol regex (/^[A-Z]{6}$/) and
// the /candles backend, which serves these via the "Massive" feed.

export interface SupportedPair {
  symbol: string;
  description: string;
}

export const SUPPORTED_PAIRS: SupportedPair[] = [
  // USD majors
  { symbol: "EURUSD", description: "Euro / US Dollar" },
  { symbol: "GBPUSD", description: "British Pound / US Dollar" },
  { symbol: "USDJPY", description: "US Dollar / Japanese Yen" },
  { symbol: "USDCHF", description: "US Dollar / Swiss Franc" },
  { symbol: "USDCAD", description: "US Dollar / Canadian Dollar" },
  { symbol: "AUDUSD", description: "Australian Dollar / US Dollar" },
  { symbol: "NZDUSD", description: "New Zealand Dollar / US Dollar" },
  // EUR crosses
  { symbol: "EURGBP", description: "Euro / British Pound" },
  { symbol: "EURJPY", description: "Euro / Japanese Yen" },
  { symbol: "EURCHF", description: "Euro / Swiss Franc" },
  { symbol: "EURAUD", description: "Euro / Australian Dollar" },
  { symbol: "EURCAD", description: "Euro / Canadian Dollar" },
  { symbol: "EURNZD", description: "Euro / New Zealand Dollar" },
  // GBP crosses
  { symbol: "GBPJPY", description: "British Pound / Japanese Yen" },
  { symbol: "GBPCHF", description: "British Pound / Swiss Franc" },
  { symbol: "GBPAUD", description: "British Pound / Australian Dollar" },
  { symbol: "GBPCAD", description: "British Pound / Canadian Dollar" },
  { symbol: "GBPNZD", description: "British Pound / New Zealand Dollar" },
  // JPY crosses
  { symbol: "AUDJPY", description: "Australian Dollar / Japanese Yen" },
  { symbol: "CADJPY", description: "Canadian Dollar / Japanese Yen" },
  { symbol: "CHFJPY", description: "Swiss Franc / Japanese Yen" },
  { symbol: "NZDJPY", description: "New Zealand Dollar / Japanese Yen" },
  // Other crosses
  { symbol: "AUDCAD", description: "Australian Dollar / Canadian Dollar" },
  { symbol: "AUDCHF", description: "Australian Dollar / Swiss Franc" },
  { symbol: "AUDNZD", description: "Australian Dollar / New Zealand Dollar" },
  { symbol: "CADCHF", description: "Canadian Dollar / Swiss Franc" },
  // Metals
  { symbol: "XAUUSD", description: "Gold / US Dollar" },
  { symbol: "XAGUSD", description: "Silver / US Dollar" },
  // Crypto (6-letter)
  { symbol: "BTCUSD", description: "Bitcoin / US Dollar" },
  { symbol: "ETHUSD", description: "Ethereum / US Dollar" },
];

const MAX_RESULTS = 30;

export interface SymbolSearchResult {
  symbol: string;
  full_name: string;
  description: string;
  exchange: string;
  ticker: string;
  type: string;
}

function toResult(pair: SupportedPair): SymbolSearchResult {
  return {
    symbol: pair.symbol,
    full_name: pair.symbol,
    description: pair.description,
    exchange: "Massive",
    ticker: pair.symbol,
    type: "forex",
  };
}

// Case-insensitive substring match on symbol or description. Empty query
// returns the (capped) full list so the search dialog shows suggestions.
export function searchPairs(query: string): SymbolSearchResult[] {
  const q = query.trim().toLowerCase();
  const matches = q
    ? SUPPORTED_PAIRS.filter(
        (p) =>
          p.symbol.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q)
      )
    : SUPPORTED_PAIRS;
  return matches.slice(0, MAX_RESULTS).map(toResult);
}
