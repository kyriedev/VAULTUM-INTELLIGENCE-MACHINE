import type { PanelSnapshot } from '@/types';

type SummaryTone = 'neutral' | 'bullish' | 'bearish' | 'alert';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function toneFromStatus(status: PanelSnapshot['status']): SummaryTone {
  if (status === 'confirmed') return 'bullish';
  if (status === 'stale') return 'bearish';
  if (status === 'inferred') return 'alert';
  return 'neutral';
}

function toneFromText(value: string | null | undefined): SummaryTone {
  const lower = String(value || '').toLowerCase();
  if (/(bull|positive|constructive|confirmed)/.test(lower)) return 'bullish';
  if (/(bear|negative|blocked|unavailable|stale)/.test(lower)) return 'bearish';
  if (/(watch|risk|mixed|estimated|proxy|degraded|caution)/.test(lower)) return 'alert';
  return 'neutral';
}

function panelHeadline(panelId: string, snapshot: PanelSnapshot): string {
  if (panelId === 'orderflow-engine') {
    return `${snapshot.conclusion} Use it as orderflow context and divergence guidance, not literal centralized tape unless the feed quality says so.`;
  }
  if (panelId === 'buyer-seller-pressure') {
    return `${snapshot.conclusion} Treat pressure as capability-aware and source-labeled before trusting it like real aggressor flow.`;
  }
  if (panelId === 'options-gamma') {
    return `${snapshot.conclusion} Walls and gamma flips are structure context, not automatic triggers.`;
  }
  if (panelId === 'dealer-pressure') {
    return `${snapshot.conclusion} Dealer posture matters most when price nears crowded strikes or event windows.`;
  }
  if (panelId === 'macro-regime') {
    return `${snapshot.conclusion} Macro pressure filters the trade, but structure still decides execution.`;
  }
  if (panelId === 'news-intel') {
    return `${snapshot.conclusion} Use catalysts as context and timing risk, not as standalone trade confirmation.`;
  }
  if (panelId === 'cot-positioning') {
    return `${snapshot.conclusion} COT is slow weekly context, so it should frame crowding and squeeze risk rather than intraday timing.`;
  }
  return snapshot.conclusion;
}

function summaryBullets(snapshot: PanelSnapshot): string[] {
  const primaryMetric = snapshot.metrics?.[0];
  return [
    primaryMetric ? `${primaryMetric.label}: ${primaryMetric.value}.` : null,
    snapshot.bullets?.[0] ?? null,
    snapshot.bullets?.[1] ?? null,
    snapshot.alerts?.[0] ? `Watch: ${snapshot.alerts[0]}` : null,
  ].filter((item): item is string => Boolean(item)).slice(0, 3);
}

export function renderPanelSummaryBlock(input: {
  title?: string;
  statusLabel?: string;
  headline: string;
  bullets?: string[];
  tone?: SummaryTone;
}): string {
  const title = input.title ?? 'AI Summary';
  const statusLabel = input.statusLabel ?? 'operator view';
  const bullets = input.bullets ?? [];
  return `
    <div class="vaultum-data-block">
      <div class="vaultum-data-block-head">
        <span>${escapeHtml(title)}</span>
        <strong>${escapeHtml(statusLabel)}</strong>
      </div>
      <div class="vaultum-signal-list">
        <div class="vaultum-signal-row ${input.tone ?? 'neutral'}"><span>${escapeHtml(input.headline)}</span></div>
        ${bullets.map((item) => `<div class="vaultum-signal-row neutral"><span>${escapeHtml(item)}</span></div>`).join('')}
      </div>
    </div>
  `;
}

export function renderSnapshotSummary(snapshot: PanelSnapshot, panelId: string): string {
  const tone = snapshot.metrics?.[0]?.tone ?? toneFromText(snapshot.alerts?.[0]) ?? toneFromStatus(snapshot.status);
  return renderPanelSummaryBlock({
    headline: panelHeadline(panelId, snapshot),
    bullets: summaryBullets(snapshot),
    tone,
    statusLabel: snapshot.status,
  });
}
