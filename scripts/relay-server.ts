import http from 'node:http';
import { URL } from 'node:url';

import { RELAY_CONFIG } from '../server/vaultum/relay/v1/_config.ts';
import { startRelayRuntime } from '../server/vaultum/relay/v1/_runtime.ts';
import { getRelayLiquiditySnapshot } from '../server/vaultum/relay/v1/get-liquidity.ts';
import { getMacroRelay } from '../server/vaultum/relay/v1/get-macro.ts';
import { getRelayOrderflowSnapshot } from '../server/vaultum/relay/v1/get-orderflow.ts';
import { getRelayVolumeSnapshot } from '../server/vaultum/relay/v1/get-volume.ts';

type Handler = (input: Record<string, string>) => Promise<unknown>;

const routes: Record<string, Handler> = {
  '/api/volume': (input) => getRelayVolumeSnapshot({ asset: input.asset ?? input.market, forceRefresh: input.forceRefresh === 'true' }),
  '/api/orderflow': (input) => getRelayOrderflowSnapshot({ asset: input.asset ?? input.market, forceRefresh: input.forceRefresh === 'true' }),
  '/api/macro': (input) => getMacroRelay({ forceRefresh: input.forceRefresh === 'true' }),
  '/api/liquidity': (input) => getRelayLiquiditySnapshot({ asset: input.asset ?? input.market, forceRefresh: input.forceRefresh === 'true' }),
};

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('access-control-allow-origin', '*');
  res.end(JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage): Promise<Record<string, string>> {
  if (req.method !== 'POST') return {};
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

startRelayRuntime();

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    json(res, 400, { ok: false, error: 'Missing request URL' });
    return;
  }

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type, authorization, x-relay-key');
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  if (url.pathname === '/healthz') {
    json(res, 200, {
      ok: true,
      runtimeEnabled: RELAY_CONFIG.runtimeEnabled,
      host: RELAY_CONFIG.relayHost,
      port: RELAY_CONFIG.relayPort,
    });
    return;
  }

  const handler = routes[url.pathname];
  if (!handler) {
    json(res, 404, { ok: false, error: `Unknown relay route ${url.pathname}` });
    return;
  }

  try {
    const body = await readBody(req);
    const input = {
      ...Object.fromEntries(url.searchParams.entries()),
      ...body,
    };
    const data = await handler(input);
    json(res, 200, { ok: true, data });
  } catch (error) {
    json(res, 500, { ok: false, error: error instanceof Error ? error.message : 'Unknown relay server error' });
  }
});

server.listen(RELAY_CONFIG.relayPort, RELAY_CONFIG.relayHost, () => {
  console.log(`Relay server listening on http://${RELAY_CONFIG.relayHost}:${RELAY_CONFIG.relayPort}`);
});
