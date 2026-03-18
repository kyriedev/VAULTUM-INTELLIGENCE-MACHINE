import { dispatchVaultumRpc } from '../../../server/vaultum/router';

function readInput(req: any): any {
  if (req.method === 'POST' && req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  return req.query ?? {};
}

export default async function handler(req: any, res: any): Promise<void> {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  try {
    const domain = String(req.query?.domain ?? '');
    const rawRpc = String(req.query?.rpc ?? '');
    const rpc = rawRpc.replace(/-/g, '_');
    const data = await dispatchVaultumRpc(domain, rpc, readInput(req));
    res.status(200).json({ ok: true, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
