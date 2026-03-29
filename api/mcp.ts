import { callVaultumMcpTool, listVaultumMcpTools } from '../server/vaultum/mcp/tools';
import { getVaultumMcpPrompt, listVaultumMcpPrompts } from '../server/vaultum/mcp/prompts';
import { listVaultumMcpResources, readVaultumMcpResource } from '../server/vaultum/mcp/resources';

const JSONRPC = '2.0';
const MCP_PROTOCOL_VERSION = '2025-11-25';

function readInput(req: any): any {
  if (req.method === 'POST' && req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  return req.query ?? {};
}

function jsonRpcResult(id: unknown, result: unknown): { jsonrpc: string; id: unknown; result: unknown } {
  return { jsonrpc: JSONRPC, id: id ?? null, result };
}

function jsonRpcError(id: unknown, code: number, message: string): { jsonrpc: string; id: unknown; error: { code: number; message: string } } {
  return { jsonrpc: JSONRPC, id: id ?? null, error: { code, message } };
}

export default async function handler(req: any, res: any): Promise<void> {
  res.setHeader('content-type', 'application/json; charset=utf-8');

  if (req.method === 'GET') {
    res.status(200).json({
      ok: true,
      endpoint: '/api/mcp',
      protocolVersion: MCP_PROTOCOL_VERSION,
      methods: ['initialize', 'notifications/initialized', 'ping', 'tools/list', 'tools/call', 'resources/list', 'resources/read', 'prompts/list', 'prompts/get'],
    });
    return;
  }

  try {
    const payload = readInput(req);
    const id = payload?.id ?? null;
    const method = String(payload?.method ?? '');

    switch (method) {
      case 'initialize': {
        res.status(200).json(jsonRpcResult(id, {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {
            tools: {
              listChanged: false,
            },
            resources: {
              listChanged: false,
            },
            prompts: {
              listChanged: false,
            },
          },
          serverInfo: {
            name: 'vaultum-mcp',
            title: 'Vaultum MCP',
            version: '0.1.0',
          },
          instructions: 'Use Vaultum tools for feed status, market monitor, chart context, news search, COT context, and execution-aware AI answers.',
        }));
        return;
      }
      case 'notifications/initialized': {
        res.status(202).json({ ok: true });
        return;
      }
      case 'ping': {
        res.status(200).json(jsonRpcResult(id, {}));
        return;
      }
      case 'tools/list': {
        res.status(200).json(jsonRpcResult(id, {
          tools: listVaultumMcpTools(),
        }));
        return;
      }
      case 'resources/list': {
        res.status(200).json(jsonRpcResult(id, {
          resources: listVaultumMcpResources(),
        }));
        return;
      }
      case 'resources/read': {
        const uri = String(payload?.params?.uri ?? '');
        const result = await readVaultumMcpResource(uri);
        res.status(200).json(jsonRpcResult(id, result));
        return;
      }
      case 'prompts/list': {
        res.status(200).json(jsonRpcResult(id, {
          prompts: listVaultumMcpPrompts(),
        }));
        return;
      }
      case 'prompts/get': {
        const name = String(payload?.params?.name ?? '');
        const args = payload?.params?.arguments ?? {};
        const result = getVaultumMcpPrompt(name, args);
        res.status(200).json(jsonRpcResult(id, result));
        return;
      }
      case 'tools/call': {
        const name = String(payload?.params?.name ?? '');
        const args = payload?.params?.arguments ?? {};
        const result = await callVaultumMcpTool(name, args);
        res.status(200).json(jsonRpcResult(id, {
          content: [
            {
              type: 'text',
              text: `Vaultum tool ${name} completed.`,
            },
          ],
          structuredContent: result,
          isError: false,
        }));
        return;
      }
      default: {
        res.status(404).json(jsonRpcError(id, -32601, `Unsupported MCP method: ${method || 'unknown'}`));
      }
    }
  } catch (error) {
    const payload = (() => {
      try {
        return readInput(req);
      } catch {
        return null;
      }
    })();

    res.status(500).json(jsonRpcError(payload?.id ?? null, -32603, error instanceof Error ? error.message : 'MCP server error'));
  }
}
