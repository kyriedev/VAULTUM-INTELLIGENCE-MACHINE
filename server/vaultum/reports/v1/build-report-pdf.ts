import { buildVaultumReportDocument } from './_builder';
import { buildVaultumPdfBytes } from './_pdf';
import type { ReportPeriod } from './_schedule';

export async function buildVaultumReportPdf(input: {
  market?: string;
  period: ReportPeriod;
}): Promise<{
  filename: string;
  bytes: Uint8Array;
}> {
  const market = String(input.market || 'XAUUSD').toUpperCase();
  const document = await buildVaultumReportDocument({
    market,
    period: input.period,
  });
  const safeMarket = market.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const safePeriod = input.period.toLowerCase();
  const safeAnchor = document.window.anchorKey.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return {
    filename: `vaultum-${safePeriod}-${safeMarket}-${safeAnchor}.pdf`,
    bytes: buildVaultumPdfBytes(document),
  };
}
