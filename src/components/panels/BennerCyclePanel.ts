import { BasePanel } from '@/components/base/panel';
import type { BennerCycleMap, PanelSnapshot } from '@/types';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function toneClass(tone: string): string {
  return ['bullish', 'bearish', 'alert', 'neutral'].includes(tone) ? tone : 'neutral';
}

function yearTone(item: BennerCycleMap['timeline'][number]): string {
  return item.regimes[0]?.tone ?? 'neutral';
}

function renderAlerts(snapshot: PanelSnapshot | undefined): string {
  if (!snapshot?.alerts?.length) return '';
  return `
    <div class="vaultum-alert-stack">
      ${snapshot.alerts.map((alert) => `<div class="vaultum-alert-row">${escapeHtml(alert)}</div>`).join('')}
    </div>
  `;
}

export class BennerCyclePanel extends BasePanel {
  constructor() {
    super({ id: 'benner-cycle', title: 'Benner Cycle Map', kicker: 'Temporal Overlay', tag: 'cycle', tone: 'neutral' });
  }

  protected renderBody(): string {
    const snapshot = (window as Window & { __vaultumSnapshot?: any }).__vaultumSnapshot;
    const benner = snapshot?.bennerCycleMap as BennerCycleMap | undefined;
    const panel = snapshot?.panels?.['benner-cycle'] as PanelSnapshot | undefined;

    if (!benner || !panel) {
      return '<div class="vaultum-callout"><strong>Waiting for Benner map</strong><span>The cycle map will populate after the first terminal snapshot.</span></div>';
    }

    const activeTone = benner.activeRegimes[0]?.tone ?? 'neutral';
    const primaryRegime = benner.activeRegimes[0];
    const events = benner.macroEvents.slice(0, 4);
    const upcoming = benner.upcomingRegimes.slice(0, 4);

    return `
      <div class="vaultum-benner-shell">
        <div class="vaultum-benner-top">
          <div class="vaultum-callout">
            <strong>${escapeHtml(panel.conclusion)}</strong>
            <span>${escapeHtml(benner.educationalNotice)}</span>
          </div>
          <div class="vaultum-benner-hero">
            <div class="vaultum-benner-status ${toneClass(activeTone)}">
              <span>Current Year</span>
              <strong>${benner.year}</strong>
              <em>${escapeHtml(primaryRegime ? `${primaryRegime.code} • ${primaryRegime.title}` : benner.regimeLabel)}</em>
            </div>
            <div class="vaultum-benner-status neutral">
              <span>Turn Window</span>
              <strong>${escapeHtml(benner.turnWindow)}</strong>
              <em>${escapeHtml(benner.overlapLabel)}</em>
            </div>
            <div class="vaultum-benner-status neutral">
              <span>Bias</span>
              <strong>${escapeHtml(benner.bias)}</strong>
              <em>${escapeHtml(benner.compatibility)}</em>
            </div>
          </div>
        </div>

        <div class="vaultum-benner-grid">
          <div class="vaultum-benner-card">
            <div class="vaultum-benner-card-head">
              <strong>Cycle Map</strong>
              <span>${escapeHtml(benner.backgroundPriority)}</span>
            </div>
            <div class="vaultum-benner-year-grid">
              ${benner.timeline.map((item) => `
                <div class="vaultum-benner-year ${toneClass(yearTone(item))} ${item.isCurrent ? 'is-current' : ''}">
                  <span>${item.year}</span>
                  <strong>${escapeHtml(item.label.toUpperCase())}</strong>
                  <em>${escapeHtml(item.regimes.map((regime) => regime.code).join(' / ') || 'quiet')}</em>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="vaultum-benner-card">
            <div class="vaultum-benner-card-head">
              <strong>Legend</strong>
              <span>Educational overlay</span>
            </div>
            <div class="vaultum-benner-legend">
              ${benner.legend.map((item) => `
                <div class="vaultum-benner-legend-item ${toneClass(item.tone)}">
                  <strong>${escapeHtml(item.code)}</strong>
                  <span>${escapeHtml(item.title)}</span>
                  <em>${escapeHtml(item.phase)}</em>
                </div>
              `).join('')}
            </div>
            <ul class="vaultum-bullets">
              ${benner.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}
            </ul>
          </div>
        </div>

        <div class="vaultum-benner-grid">
          <div class="vaultum-benner-card">
            <div class="vaultum-benner-card-head">
              <strong>Upcoming Windows</strong>
              <span>Forward scan</span>
            </div>
            <div class="vaultum-benner-list">
              ${upcoming.map((item) => `
                <div class="vaultum-benner-list-item">
                  <strong>${item.year}</strong>
                  <span>${escapeHtml(`${item.code} • ${item.title}`)}</span>
                  <em>${escapeHtml(`${item.yearsAhead === 0 ? 'active now' : `in ${item.yearsAhead}y`}`)}</em>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="vaultum-benner-card">
            <div class="vaultum-benner-card-head">
              <strong>Macro Event Anchors</strong>
              <span>Context only</span>
            </div>
            <div class="vaultum-benner-list">
              ${events.map((event) => `
                <div class="vaultum-benner-list-item">
                  <strong>${escapeHtml(event.date)}</strong>
                  <span>${escapeHtml(event.title)}</span>
                  <em>${escapeHtml(`${event.tag} • ${event.yearsFromCurrent >= 0 ? '+' : ''}${event.yearsFromCurrent}y`)}</em>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        ${renderAlerts(panel)}
      </div>
    `;
  }
}
