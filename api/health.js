import { dispatchVaultumRpc } from '../server/vaultum/router';
import { buildFeedStatus } from '../server/vaultum/_shared/feed-status';

function toState(value, fallbackMessage) {
  if (!value) return { state: 'down', detail: fallbackMessage };
  return { state: 'up', detail: 'ok' };
}

export default async function handler(_req, res) {
  try {
    const [fearGreed, marketBrief, calendar, orderflow, scenario] = await Promise.all([
      dispatchVaultumRpc('market', 'get_fear_greed_index', {}),
      dispatchVaultumRpc('intelligence', 'get_market_brief', { market: 'XAUUSD', timeframe: '1h' }),
      dispatchVaultumRpc('calendar', 'get_economic_calendar', { market: 'XAUUSD' }),
      dispatchVaultumRpc('orderflow', 'get_engine', { market: 'XAUUSD', timeframe: '1h' }),
      dispatchVaultumRpc('scenario', 'get_monte_carlo', { market: 'XAUUSD', timeframe: '1h' }),
    ]);

    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.status(200).json({
      ok: true,
      generatedAt: new Date().toISOString(),
      feedStatus: buildFeedStatus(),
      engines: {
        fearGreed: fearGreed?.compositeScore != null
          ? { state: 'up', detail: `${fearGreed.compositeScore.toFixed(1)} ${fearGreed.compositeLabel}` }
          : { state: 'down', detail: 'no composite score returned' },
        marketBrief: marketBrief?.summary
          ? { state: 'up', detail: marketBrief.summary }
          : { state: 'down', detail: 'market brief unavailable' },
        calendar: calendar?.events?.length != null
          ? { state: 'up', detail: `${calendar.events.length} events returned` }
          : { state: 'down', detail: 'calendar unavailable' },
        orderflow: orderflow?.summary
          ? { state: 'up', detail: orderflow.summary }
          : { state: 'down', detail: 'orderflow unavailable' },
        monteCarlo: scenario?.summary
          ? { state: 'up', detail: scenario.summary }
          : { state: 'down', detail: 'monte carlo unavailable' },
      },
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Health check failed',
      feedStatus: buildFeedStatus(),
    });
  }
}
