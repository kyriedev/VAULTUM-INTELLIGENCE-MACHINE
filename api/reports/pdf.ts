import { allowRequest } from '../_rate-limit';
import { buildVaultumReportPdf } from '../../server/vaultum/reports/v1/build-report-pdf';

type ReportPeriod = 'daily' | 'weekly' | 'quarterly';

function isPeriod(value: string): value is ReportPeriod {
  return value === 'daily' || value === 'weekly' || value === 'quarterly';
}

export default async function handler(req: any, res: any): Promise<void> {
  const rateLimit = allowRequest(req, { scope: 'vaultum-reports', limit: 40, windowMs: 60_000 });
  Object.entries(rateLimit.headers ?? {}).forEach(([key, value]) => res.setHeader(key, value));
  if (!rateLimit.allowed) {
    res.status(rateLimit.status ?? 429).json(rateLimit.body ?? { ok: false, error: 'Rate limit exceeded' });
    return;
  }

  const period = String(req.query?.period || 'daily').toLowerCase();
  const market = String(req.query?.market || 'XAUUSD').toUpperCase();
  if (!isPeriod(period)) {
    res.status(400).json({ ok: false, error: 'Invalid report period' });
    return;
  }

  try {
    const payload = await buildVaultumReportPdf({ market, period });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${payload.filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(Buffer.from(payload.bytes));
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unable to build report PDF' });
  }
}
