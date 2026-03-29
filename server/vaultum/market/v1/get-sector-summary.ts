declare const process: { env: Record<string, string | undefined> };

import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { fetchFinnhubQuote, fetchYahooQuotesBatch } from './_shared';

const SECTOR_SYMBOLS = ['XLK', 'XLF', 'XLE', 'XLV', 'XLY', 'XLI', 'XLP', 'XLU', 'XLB', 'XLRE', 'XLC', 'SMH'];

type SectorSummaryResponse = {
  sectors: Array<{ symbol: string; change: number }>;
  sourceSummary: string[];
  usedStaleFallback?: boolean;
};

const staleSectorCache = new Map<string, { data: SectorSummaryResponse; timestamp: number }>();

export async function getSectorSummary(): Promise<SectorSummaryResponse> {
  const apiKey = process.env.FINNHUB_API_KEY;

  return getCachedOrCompute(cacheKey('market', 'sectors'), async () => {
    const sectors: Array<{ symbol: string; change: number }> = [];

    if (apiKey) {
      const results = await Promise.all(SECTOR_SYMBOLS.map((symbol) => fetchFinnhubQuote(symbol, apiKey)));
      results.forEach((quote) => {
        if (quote) sectors.push({ symbol: quote.symbol, change: quote.changePercent });
      });
    }

    if (sectors.length === 0) {
      const batch = await fetchYahooQuotesBatch(SECTOR_SYMBOLS);
      SECTOR_SYMBOLS.forEach((symbol) => {
        const quote = batch.results.get(symbol);
        if (quote) sectors.push({ symbol, change: quote.change });
      });

      if (sectors.length === 0) {
        const stale = staleSectorCache.get('sectors');
        if (stale) {
          return {
            ...stale.data,
            sourceSummary: [
              ...stale.data.sourceSummary,
              'Served the last successful sector snapshot using the worldmonitor-style stale fallback cache.',
            ],
            usedStaleFallback: true,
          };
        }

        return {
          sectors: [],
          sourceSummary: [
            apiKey
              ? 'Sector summary tried Finnhub first and then Yahoo Finance as a fallback.'
              : 'Sector summary relied on Yahoo Finance because Finnhub is not configured.',
            batch.rateLimited
              ? 'Yahoo Finance returned a rate-limit condition and no cached sector snapshot was available.'
              : 'No usable sector-summary data was returned by the configured feeds.',
          ],
          usedStaleFallback: false,
        };
      }
    }

    const fresh: SectorSummaryResponse = {
      sectors,
      sourceSummary: [
        apiKey
          ? 'Sector summary uses Finnhub first and falls back to Yahoo Finance when needed.'
          : 'Sector summary uses Yahoo Finance because Finnhub is not configured.',
      ],
      usedStaleFallback: false,
    };
    staleSectorCache.set('sectors', { data: fresh, timestamp: Date.now() });
    return fresh;
  }, 600);
}
