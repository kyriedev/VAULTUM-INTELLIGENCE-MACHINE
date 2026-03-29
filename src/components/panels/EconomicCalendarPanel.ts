import { BasePanel } from '@/components/base/panel';
import { fetchEconomicCalendar, type EconomicCalendarEvent, type EconomicCalendarResponse } from '@/services/calendar';
import { getMarketFocus, subscribeMarketFocus, type MarketFocus } from '@/services/market-focus';

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function impactLabel(impact: EconomicCalendarEvent['impact']): string {
  if (impact === 'high') return 'High';
  if (impact === 'medium') return 'Medium';
  if (impact === 'low') return 'Low';
  return 'Holiday';
}

function impactTone(impact: EconomicCalendarEvent['impact']): string {
  if (impact === 'high') return 'alert';
  if (impact === 'medium') return 'neutral';
  if (impact === 'low') return 'bullish';
  return 'neutral';
}

function timeLabel(event: EconomicCalendarEvent): string {
  const date = new Date(event.date);
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function relativeLabel(event: EconomicCalendarEvent): string {
  if (event.minutesUntil == null) return 'time unavailable';
  if (Math.abs(event.minutesUntil) < 5) return 'now';
  if (event.minutesUntil > 0) return `in ${event.minutesUntil}m`;
  return `${Math.abs(event.minutesUntil)}m ago`;
}

export class EconomicCalendarPanel extends BasePanel {
  private marketFocus: MarketFocus = getMarketFocus();
  private data: EconomicCalendarResponse | null = null;
  private loading = false;
  private error = '';
  private loadedKey = '';

  constructor() {
    super({ id: 'economic', title: 'Economic Calendar', kicker: 'Macro Catalyst Map', tag: 'calendar', tone: 'neutral' });
  }

  render(): HTMLElement {
    const panel = document.createElement('section');
    panel.className = `vaultum-panel ${this.definition.tone ?? 'neutral'}`;
    panel.dataset.panelId = this.definition.id;
    panel.innerHTML = `
      <div class="vaultum-panel-header">
        <div>
          <div class="vaultum-panel-kicker">${this.definition.kicker}</div>
          <h2>${this.definition.title}</h2>
        </div>
        <div class="vaultum-panel-tag">${this.definition.tag}</div>
      </div>
      <div class="vaultum-panel-body"></div>
    `;

    const body = panel.querySelector('.vaultum-panel-body') as HTMLElement;
    const redraw = () => {
      body.innerHTML = this.renderBody();
      void this.ensureData(redraw);
    };

    subscribeMarketFocus((focus) => {
      this.marketFocus = focus;
      redraw();
    });

    redraw();
    return panel;
  }

  protected renderBody(): string {
    const marketLabel = `${this.marketFocus.market} macro tape`;
    if (this.loading && !this.data) {
      return `<div class="vaultum-callout"><strong>Loading calendar</strong><span>Pulling live releases for ${escapeHtml(marketLabel)}.</span></div>`;
    }
    if (this.error && !this.data) {
      return `<div class="vaultum-callout"><strong>Calendar unavailable</strong><span>${escapeHtml(this.error)}</span></div>`;
    }
    if (!this.data) {
      return `<div class="vaultum-callout"><strong>Waiting for calendar</strong><span>Relevant releases for the selected market will appear here.</span></div>`;
    }

    const visibleEvents = this.data.events.slice(0, 8);
    return `
      <div class="vaultum-calendar-shell">
        <div class="vaultum-calendar-hero">
          <div class="vaultum-callout">
            <strong>${escapeHtml(this.data.summary)}</strong>
            <span>${escapeHtml(`${this.data.focusCurrencies.join(' / ')} | ${this.data.source}`)}</span>
          </div>
          <div class="vaultum-calendar-stats">
            <div class="vaultum-metric ${this.data.highImpactCount > 0 ? 'alert' : 'neutral'}">
              <span>High Impact</span>
              <strong>${escapeHtml(String(this.data.highImpactCount))}</strong>
            </div>
            <div class="vaultum-metric ${this.data.upcomingCount > 0 ? 'bullish' : 'neutral'}">
              <span>Upcoming</span>
              <strong>${escapeHtml(String(this.data.upcomingCount))}</strong>
            </div>
            <div class="vaultum-metric neutral">
              <span>Focus</span>
              <strong>${escapeHtml(this.data.focusCountries.join(' / '))}</strong>
            </div>
          </div>
        </div>
        <div class="vaultum-calendar-list">
          ${visibleEvents.length ? visibleEvents.map((event) => `
            <div class="vaultum-calendar-row ${event.isUpcoming ? 'is-upcoming' : 'is-past'}">
              <div class="vaultum-calendar-time">
                <strong>${escapeHtml(timeLabel(event))}</strong>
                <span>${escapeHtml(relativeLabel(event))}</span>
              </div>
              <div class="vaultum-calendar-copy">
                <strong>${escapeHtml(`${event.currency} ${event.event}`)}</strong>
                <span>${escapeHtml(`${event.country} • ${event.category}`)}</span>
                <em>${escapeHtml(`A ${event.actual ?? '-'} | F ${event.forecast ?? '-'} | P ${event.previous ?? '-'}`)}</em>
              </div>
              <div class="vaultum-calendar-impact ${impactTone(event.impact)}">${escapeHtml(impactLabel(event.impact))}</div>
            </div>
          `).join('') : `<div class="vaultum-callout"><strong>No scheduled releases</strong><span>No relevant calendar events were returned for today.</span></div>`}
        </div>
      </div>
    `;
  }

  private async ensureData(redraw: () => void): Promise<void> {
    const key = this.marketFocus.market;
    if (this.loading) return;
    if (this.loadedKey === key && (this.data || this.error)) return;
    this.loading = true;
    this.error = '';
    redraw();
    try {
      this.data = await fetchEconomicCalendar(this.marketFocus.market);
      this.loadedKey = key;
      if (!this.data) this.error = `No economic calendar data returned for ${this.marketFocus.market}.`;
    } catch (error) {
      this.data = null;
      this.loadedKey = key;
      this.error = error instanceof Error ? error.message : 'Economic calendar request failed.';
    }
    this.loading = false;
    redraw();
  }
}
