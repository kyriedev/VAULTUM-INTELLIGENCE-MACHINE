import { CHROME_UA } from '../../../_shared/constants';

type CotMarketConfig = {
  reportUrl: string;
  matchers: string[];
};

const CFTC_REPORTS: Record<string, CotMarketConfig> = {
  GOLD: {
    reportUrl: 'https://www.cftc.gov/dea/newcot/f_disagg.txt',
    matchers: ['gold', 'commodity exchange inc'],
  },
  SILVER: {
    reportUrl: 'https://www.cftc.gov/dea/newcot/f_disagg.txt',
    matchers: ['silver', 'commodity exchange inc'],
  },
  WTI: {
    reportUrl: 'https://www.cftc.gov/dea/newcot/f_disagg.txt',
    matchers: ['crude oil', 'new york mercantile exchange'],
  },
  OIL: {
    reportUrl: 'https://www.cftc.gov/dea/newcot/f_disagg.txt',
    matchers: ['crude oil', 'new york mercantile exchange'],
  },
};

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function parseCsvRows(csv: string): Array<Record<string, string>> {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0] ?? '');
  return lines.slice(1).map((line) => {
    const rowValues = parseCsvLine(line);
    return headers.reduce<Record<string, string>>((row, header, index) => {
      row[header] = rowValues[index] ?? '';
      return row;
    }, {});
  });
}

function normalizeField(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function pickField(row: Record<string, string>, aliases: string[]): string {
  const normalizedAliases = aliases.map(normalizeField);
  for (const [key, value] of Object.entries(row)) {
    if (normalizedAliases.includes(normalizeField(key))) return value;
  }
  return '';
}

function toNumber(value: string): number {
  const cleaned = value.replace(/,/g, '').trim();
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function fetchOfficialCotMarket(market: string): Promise<{
  market: string;
  reportDate: string;
  marketName: string;
  openInterest: number;
  commercialLong: number;
  commercialShort: number;
  nonCommercialLong: number;
  nonCommercialShort: number;
  nonReportableLong: number;
  nonReportableShort: number;
  spreading: number;
  commercialChange: number;
  nonCommercialChange: number;
  longShortRatio: number;
  nonCommercialNet: number;
  commercialNet: number;
} | null> {
  const config = CFTC_REPORTS[market.toUpperCase()];
  if (!config) return null;

  const response = await fetch(config.reportUrl, {
    headers: { 'User-Agent': CHROME_UA, Accept: 'text/plain,text/csv' },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) return null;

  const text = await response.text();
  const rows = parseCsvRows(text);
  const row = rows.find((entry) => {
    const marketName = pickField(entry, ['Market_and_Exchange_Names', 'Market and Exchange Names']).toLowerCase();
    return config.matchers.every((matcher) => marketName.includes(matcher));
  });
  if (!row) return null;

  const prodMercLong = toNumber(pickField(row, ['Prod_Merc_Positions_Long_All', 'Producer Merchant Processor User Positions Long All']));
  const prodMercShort = toNumber(pickField(row, ['Prod_Merc_Positions_Short_All', 'Producer Merchant Processor User Positions Short All']));
  const swapLong = toNumber(pickField(row, ['Swap_Positions_Long_All', 'Swap Positions Long All']));
  const swapShort = toNumber(pickField(row, ['Swap_Positions_Short_All', 'Swap Positions Short All']));
  const managedMoneyLong = toNumber(pickField(row, ['M_Money_Positions_Long_All', 'Managed Money Positions Long All']));
  const managedMoneyShort = toNumber(pickField(row, ['M_Money_Positions_Short_All', 'Managed Money Positions Short All']));
  const otherReptLong = toNumber(pickField(row, ['Other_Rept_Positions_Long_All', 'Other Reportables Positions Long All']));
  const otherReptShort = toNumber(pickField(row, ['Other_Rept_Positions_Short_All', 'Other Reportables Positions Short All']));
  const nonReptLong = toNumber(pickField(row, ['NonRept_Positions_Long_All', 'Nonreportable Positions Long All']));
  const nonReptShort = toNumber(pickField(row, ['NonRept_Positions_Short_All', 'Nonreportable Positions Short All']));
  const spreading = toNumber(pickField(row, [
    'M_Money_Positions_Spread_All',
    'Managed Money Positions Spread All',
  ])) + toNumber(pickField(row, [
    'Other_Rept_Positions_Spread_All',
    'Other Reportables Positions Spread All',
  ]));

  const commercialLong = prodMercLong + swapLong;
  const commercialShort = prodMercShort + swapShort;
  const nonCommercialLong = managedMoneyLong + otherReptLong;
  const nonCommercialShort = managedMoneyShort + otherReptShort;

  const commercialChange =
    toNumber(pickField(row, ['Change_in_Prod_Merc_Long_All'])) +
    toNumber(pickField(row, ['Change_in_Swap_Long_All'])) -
    toNumber(pickField(row, ['Change_in_Prod_Merc_Short_All'])) -
    toNumber(pickField(row, ['Change_in_Swap_Short_All']));

  const nonCommercialChange =
    toNumber(pickField(row, ['Change_in_M_Money_Long_All'])) +
    toNumber(pickField(row, ['Change_in_Other_Rept_Long_All'])) -
    toNumber(pickField(row, ['Change_in_M_Money_Short_All'])) -
    toNumber(pickField(row, ['Change_in_Other_Rept_Short_All']));

  const nonCommercialNet = nonCommercialLong - nonCommercialShort;
  const commercialNet = commercialLong - commercialShort;

  return {
    market,
    reportDate: pickField(row, ['As_of_Date_In_Form_YYYY-MM-DD', 'As of Date in Form YYYY-MM-DD']),
    marketName: pickField(row, ['Market_and_Exchange_Names', 'Market and Exchange Names']),
    openInterest: toNumber(pickField(row, ['Open_Interest_All', 'Open Interest All'])),
    commercialLong,
    commercialShort,
    nonCommercialLong,
    nonCommercialShort,
    nonReportableLong: nonReptLong,
    nonReportableShort: nonReptShort,
    spreading,
    commercialChange,
    nonCommercialChange,
    longShortRatio: nonCommercialShort > 0 ? Number((nonCommercialLong / nonCommercialShort).toFixed(2)) : 0,
    nonCommercialNet,
    commercialNet,
  };
}
