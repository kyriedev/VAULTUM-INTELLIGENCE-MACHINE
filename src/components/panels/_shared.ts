import { BasePanel } from '@/components/base/panel';
import type { PanelSnapshot } from '@/types';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
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

export class SnapshotPanel extends BasePanel {
  protected renderBody(): string {
    const snapshot = (window as Window & { __vaultumSnapshot?: any }).__vaultumSnapshot;
    const data = snapshot?.panels[this.definition.id];
    if (!data) return '<div class="vaultum-callout"><strong>Waiting for snapshot</strong><span>Panel will populate when the terminal bootstrap completes.</span></div>';

    return `
      <div class="vaultum-callout">
        <strong>${escapeHtml(data.conclusion)}</strong>
        <span>Status: ${escapeHtml(data.status)}</span>
      </div>
      ${renderMetrics(data.metrics)}
      ${renderCharts(data.charts)}
      ${renderTable(data.table)}
      <ul class="vaultum-bullets">
        ${data.bullets.map((bullet: string) => `<li>${escapeHtml(bullet)}</li>`).join('')}
      </ul>
      ${renderAlerts(data.alerts)}
    `;
  }
}
