import { BasePanel } from '@/components/base/panel';
import { renderSnapshotSummary } from '@/components/panels/_panel-summary';
import type { PanelSnapshot } from '@/types';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function statusTone(status: PanelSnapshot['status']): 'neutral' | 'bullish' | 'bearish' | 'alert' {
  if (status === 'confirmed') return 'bullish';
  if (status === 'inferred') return 'alert';
  if (status === 'stale') return 'bearish';
  return 'neutral';
}

function renderMetrics(metrics: PanelSnapshot['metrics']): string {
  if (!metrics?.length) return '';
  return `
    <div class="vaultum-metric-grid">
      ${metrics.map((metric) => `
        <div class="vaultum-metric ${metric.tone ?? 'neutral'}">
          <span>${escapeHtml(metric.label)}</span>
          <strong>${escapeHtml(metric.value)}</strong>
        </div>
      `).join('')}
    </div>
  `;
}

function renderTable(table: PanelSnapshot['table']): string {
  if (!table?.columns?.length || !table.rows?.length) return '';
  return `
    <div class="vaultum-table-wrap">
      <table class="vaultum-table">
        <thead>
          <tr>${table.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${table.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function buildPolyline(points: number[]): string {
  if (!points.length) return '';
  const width = 100;
  const height = 28;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  return points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * width;
      const y = height - ((point - min) / span) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

function renderCharts(charts: PanelSnapshot['charts']): string {
  if (!charts?.length) return '';
  return `
    <div class="vaultum-chart-grid">
      ${charts.map((chart) => `
        <div class="vaultum-chart-card ${chart.tone ?? 'neutral'}">
          <div class="vaultum-chart-label">${escapeHtml(chart.label)}</div>
          <svg class="vaultum-sparkline" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
            <polyline points="${buildPolyline(chart.points)}"></polyline>
          </svg>
        </div>
      `).join('')}
    </div>
  `;
}

function renderAlerts(alerts: PanelSnapshot['alerts']): string {
  if (!alerts?.length) return '';
  return `
    <div class="vaultum-alert-stack">
      ${alerts.map((alert) => `<div class="vaultum-alert-row">${escapeHtml(alert)}</div>`).join('')}
    </div>
  `;
}

function renderSignalList(title: string, items: string[], tone: 'neutral' | 'bullish' | 'bearish' | 'alert' = 'neutral'): string {
  if (!items.length) return '';
  return `
    <div class="vaultum-data-block">
      <div class="vaultum-data-block-head">
        <span>${escapeHtml(title)}</span>
        <strong>${items.length}</strong>
      </div>
      <div class="vaultum-signal-list">
        ${items.map((item) => `<div class="vaultum-signal-row ${tone}"><span>${escapeHtml(item)}</span></div>`).join('')}
      </div>
    </div>
  `;
}

export class SnapshotPanel extends BasePanel {
  protected renderBody(): string {
    const snapshot = (window as Window & { __vaultumSnapshot?: any }).__vaultumSnapshot;
    const data = snapshot?.panels[this.definition.id];
    if (!data) return '<div class="vaultum-callout"><strong>Waiting for snapshot</strong><span>Panel will populate when the terminal bootstrap completes.</span></div>';

    const primaryMetric = data.metrics?.[0];
    const secondaryMetrics = data.metrics?.slice(1) ?? [];
    const primaryTone = primaryMetric?.tone ?? statusTone(data.status);
    const primaryLabel = primaryMetric?.label ?? 'Primary Signal';
    const primaryValue = primaryMetric?.value ?? data.conclusion;
    const primarySecondary = primaryMetric ? data.conclusion : `Status ${data.status}`;

    return `
      <div class="vaultum-snapshot-shell">
        <div class="vaultum-primary-card ${primaryTone}">
          <div class="vaultum-primary-card-head">
            <span>${escapeHtml(primaryLabel)}</span>
            <strong>${escapeHtml(data.status)}</strong>
          </div>
          <div class="vaultum-primary-card-value">${escapeHtml(primaryValue)}</div>
          <div class="vaultum-primary-card-copy">${escapeHtml(primarySecondary)}</div>
        </div>
        ${secondaryMetrics.length ? renderMetrics(secondaryMetrics) : ''}
        ${renderSnapshotSummary(data, this.definition.id)}
        ${data.bullets?.length ? renderSignalList('Drivers', data.bullets.slice(0, 6)) : ''}
        ${data.alerts?.length ? renderSignalList('Alerts', data.alerts, 'alert') : ''}
        ${data.charts?.length ? `
          <div class="vaultum-data-block">
            <div class="vaultum-data-block-head">
              <span>Trend View</span>
              <strong>${data.charts.length}</strong>
            </div>
            ${renderCharts(data.charts)}
          </div>
        ` : ''}
        ${data.table?.columns?.length && data.table?.rows?.length ? `
          <div class="vaultum-data-block">
            <div class="vaultum-data-block-head">
              <span>Data Grid</span>
              <strong>${data.table.rows.length}</strong>
            </div>
            ${renderTable(data.table)}
          </div>
        ` : ''}
      </div>
    `;
  }
}
