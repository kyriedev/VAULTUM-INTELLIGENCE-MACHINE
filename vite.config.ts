import { defineConfig, type Plugin } from 'vite';
import path from 'node:path';
import { dispatchVaultumRpc } from './server/vaultum/router';
import { buildFeedStatus } from './server/vaultum/_shared/feed-status';

function json(res: any, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readBody(req: any): Promise<any> {
  if (req.method !== 'POST') return {};
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function createVaultumDevApiPlugin(): Plugin {
  return {
    name: 'vaultum-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ? new URL(req.url, 'http://localhost:5173') : null;
        const pathname = url?.pathname ?? '';

        if (pathname === '/api/bootstrap') {
          try {
            const [
              marketQuotes,
              macroSignals,
              riskScores,
              tradeRestrictions,
              fearGreed,
              marketBrief,
              prediction,
              liquidityStress,
              bennerCycle,
              volumeProfile,
              pivotLevels,
              buyerSellerPressure,
              entryMap,
            ] = await Promise.all([
              dispatchVaultumRpc('market', 'list_market_quotes', { symbols: ['^GSPC', '^IXIC', '^VIX', 'DX-Y.NYB', '^TNX', 'GC=F'] }),
              dispatchVaultumRpc('macro', 'get_macro_signals', {}),
              dispatchVaultumRpc('intelligence', 'get_risk_scores', {}),
              dispatchVaultumRpc('trade', 'get_trade_restrictions', {}),
              dispatchVaultumRpc('market', 'get_fear_greed_index', {}),
              dispatchVaultumRpc('intelligence', 'get_market_brief', { market: 'XAUUSD', timeframe: '1h' }),
              dispatchVaultumRpc('prediction', 'list_prediction_markets', { query: 'gold', mode: 'markets' }),
              dispatchVaultumRpc('liquidity', 'get_liquidity_stress', {}),
              dispatchVaultumRpc('benner', 'get_cycle_state', { market: 'XAUUSD' }),
              dispatchVaultumRpc('volume', 'get_profile', { market: 'XAUUSD', timeframe: '1d' }),
              dispatchVaultumRpc('pivots', 'get_levels', { market: 'XAUUSD', timeframe: '1d' }),
              dispatchVaultumRpc('pressure', 'get_buyer_seller_pressure', { market: 'XAUUSD', mode: 'auto' }),
              dispatchVaultumRpc('analytics', 'get_entry_map', { market: 'XAUUSD', chartTimeframe: '1h', majorTimeframe: '4h', minorTimeframe: '15m', triggerTimeframe: '5m' }),
            ]);

            json(res, 200, {
              ok: true,
              data: {
                generatedAt: new Date().toISOString(),
                feedStatus: buildFeedStatus(),
                marketQuotes,
                macroSignals,
                riskScores,
                tradeRestrictions,
                fearGreed,
                marketBrief,
                prediction,
                liquidityStress,
                bennerCycle,
                volumeProfile,
                pivotLevels,
                buyerSellerPressure,
                entryMap,
              },
            });
            return;
          } catch (error) {
            json(res, 500, { ok: false, error: error instanceof Error ? error.message : 'Bootstrap failed' });
            return;
          }
        }

        if (pathname === '/api/health') {
          try {
            const [fearGreed, marketBrief, calendar, orderflow, scenario, entryMap] = await Promise.all([
              dispatchVaultumRpc('market', 'get_fear_greed_index', {}),
              dispatchVaultumRpc('intelligence', 'get_market_brief', { market: 'XAUUSD', timeframe: '1h' }),
              dispatchVaultumRpc('calendar', 'get_economic_calendar', { market: 'XAUUSD' }),
              dispatchVaultumRpc('orderflow', 'get_engine', { market: 'XAUUSD', timeframe: '1h' }),
              dispatchVaultumRpc('scenario', 'get_monte_carlo', { market: 'XAUUSD', timeframe: '1h' }),
              dispatchVaultumRpc('analytics', 'get_entry_map', { market: 'XAUUSD', chartTimeframe: '1h' }),
            ]);

            json(res, 200, {
              ok: true,
              generatedAt: new Date().toISOString(),
              feedStatus: buildFeedStatus(),
              engines: {
                fearGreed: fearGreed?.compositeScore != null ? 'up' : 'down',
                marketBrief: marketBrief?.summary ? 'up' : 'down',
                calendar: calendar?.events?.length != null ? 'up' : 'down',
                orderflow: orderflow?.summary ? 'up' : 'down',
                monteCarlo: scenario?.summary ? 'up' : 'down',
                entryMap: entryMap?.executionRead ? 'up' : 'down',
              },
            });
            return;
          } catch (error) {
            json(res, 500, { ok: false, error: error instanceof Error ? error.message : 'Health failed' });
            return;
          }
        }

        const match = pathname.match(/^\/api\/([^/]+)\/v1\/([^/]+)$/);
        if (match) {
          try {
            const [, domain, rawRpc] = match;
            const rpc = rawRpc.replace(/-/g, '_');
            const input = await readBody(req);
            const data = await dispatchVaultumRpc(domain, rpc, input);
            json(res, 200, { ok: true, data });
            return;
          } catch (error) {
            json(res, 500, { ok: false, error: error instanceof Error ? error.message : 'Unknown error' });
            return;
          }
        }

        next();
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: command === 'serve' ? [createVaultumDevApiPlugin()] : [],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
  },
}));
