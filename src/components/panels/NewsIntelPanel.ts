import { BasePanel } from '@/components/base/panel';
import { renderPanelSummaryBlock } from '@/components/panels/_panel-summary';
import { getMarketFocus, subscribeMarketFocus, type MarketFocus } from '@/services/market-focus';
import { fetchNewsIntel, type NewsIntelResponse } from '@/services/intelligence';
import { invokeVaultumRpc } from '@/services/rpc';
import { SmartPollLoop } from '@/services/smart-poll-loop';

type PanelMode = 'compare' | 'XAUUSD' | 'US30';
type FeedFilter = 'all' | 'high-impact' | 'tradeable' | 'macro-bias' | 'needs-confirmation' | 'ignored';
type FeedSort = 'newest' | 'impact' | 'credibility' | 'reaction';

type MacroLite = {
  focus?: {
    bias?: string;
    convictionScore?: number;
    summary?: string;
    reflexivityState?: string;
  } | null;
  regime?: string;
};

type ClusterView = NonNullable<NonNullable<NewsIntelResponse['xIntel']>['clusters']>[number];

function escapeHtml(value: string): string {
  return String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function toneForBias(value: string | null | undefined): 'neutral' | 'bullish' | 'bearish' | 'alert' {
  const lower = String(value || '').toLowerCase();
  if (/bull|pass|positive|green/.test(lower)) return 'bullish';
  if (/bear|fail|negative|red/.test(lower)) return 'bearish';
  if (/watch|mixed|blocked|risk|amber|caution/.test(lower)) return 'alert';
  return 'neutral';
}

function clusterTone(cluster: ClusterView): 'neutral' | 'bullish' | 'bearish' | 'alert' {
  if (cluster.tone === 'green') return 'bullish';
  if (cluster.tone === 'red') return 'bearish';
  if (cluster.tone === 'amber') return 'alert';
  return 'neutral';
}

function compareConclusion(gold: NewsIntelResponse | null, us30: NewsIntelResponse | null, goldMacro: MacroLite | null, us30Macro: MacroLite | null): string {
  const goldBias = gold?.patternModel?.bias ?? gold?.sentiment?.label ?? 'neutral';
  const us30Bias = us30?.patternModel?.bias ?? us30?.sentiment?.label ?? 'neutral';

  if (goldBias === 'bullish' && us30Bias === 'bearish') {
    return 'Gold and US30 are diverging defensively: haven demand is stronger than equity risk appetite.';
  }
  if (goldBias === 'bearish' && us30Bias === 'bullish') {
    return 'Gold and US30 are diverging in risk-on fashion: defensive demand is fading while equities hold the better tone.';
  }
  if (goldBias === us30Bias && goldBias !== 'neutral') {
    return `Gold and US30 are aligned ${goldBias}, so macro pressure is moving in the same broad direction across both desks.`;
  }

  return `${goldMacro?.focus?.summary ?? 'Gold macro pressure is mixed.'} ${us30Macro?.focus?.summary ?? 'US30 macro pressure is mixed.'}`;
}

function renderSignalList(items: string[], tone: 'neutral' | 'bullish' | 'bearish' | 'alert' = 'neutral'): string {
  if (!items.length) return '<div class="vaultum-signal-row neutral"><span>No fresh signal is available.</span></div>';
  return items.map((item) => `
    <div class="vaultum-signal-row ${tone}">
      <span>${escapeHtml(item)}</span>
    </div>
  `).join('');
}

function relativeTime(timestamp?: string | null): string {
  if (!timestamp) return 'time unknown';
  const diffMinutes = Math.max(Math.round((Date.now() - new Date(timestamp).getTime()) / 60_000), 0);
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const hours = Math.floor(diffMinutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function listClusters(data: NewsIntelResponse | null): ClusterView[] {
  const live = data?.xIntel?.clusters ?? [];
  const demo = (data?.xIntel?.sampleClusters as ClusterView[] | undefined) ?? [];
  return live.length ? live : demo;
}

function filteredClusters(clusters: ClusterView[], filter: FeedFilter, assetFilter: string, eventFilter: string): ClusterView[] {
  return clusters.filter((cluster) => {
    if (filter === 'high-impact' && (cluster.overallImpactScore ?? 0) < 70) return false;
    if (filter === 'tradeable' && cluster.actionability?.state !== 'TRADEABLE_CATALYST') return false;
    if (filter === 'macro-bias' && cluster.actionability?.state !== 'MACRO_BIAS_SHIFT') return false;
    if (filter === 'needs-confirmation' && !['MONITOR', 'EXECUTION_CAUTION'].includes(cluster.actionability?.state ?? '')) return false;
    if (filter === 'ignored' && !['IGNORE', 'LOG_ONLY'].includes(cluster.actionability?.state ?? '')) return false;
    if (assetFilter !== 'all' && !(cluster.impactAssessment?.impactedAssets ?? []).some((item) => item.asset === assetFilter)) return false;
    if (eventFilter !== 'all' && cluster.eventType !== eventFilter) return false;
    return true;
  });
}

function sortedClusters(clusters: ClusterView[], sort: FeedSort): ClusterView[] {
  return [...clusters].sort((left, right) => {
    if (sort === 'newest') return String(right.latestUpdateAt ?? '').localeCompare(String(left.latestUpdateAt ?? ''));
    if (sort === 'credibility') return (right.eventCredibilityScore ?? 0) - (left.eventCredibilityScore ?? 0);
    if (sort === 'reaction') return (right.validation?.crossAssetAlignmentScore ?? 0) - (left.validation?.crossAssetAlignmentScore ?? 0);
    return (right.overallImpactScore ?? 0) - (left.overallImpactScore ?? 0);
  });
}

export class NewsIntelPanel extends BasePanel {
  private marketFocus: MarketFocus = getMarketFocus();
  private mode: PanelMode = 'compare';
  private filter: FeedFilter = 'all';
  private sort: FeedSort = 'impact';
  private assetFilter = 'all';
  private eventFilter = 'all';
  private selectedClusterId: Partial<Record<'XAUUSD' | 'US30', string>> = {};
  private loading = false;
  private error = '';
  private loadedKey = '';
  private goldNews: NewsIntelResponse | null = null;
  private us30News: NewsIntelResponse | null = null;
  private goldMacro: MacroLite | null = null;
  private us30Macro: MacroLite | null = null;
  private pollLoop: SmartPollLoop | null = null;
  private pollingMs = 60_000;

  constructor() {
    super({ id: 'news-intel', title: 'Live News / X Alerts', kicker: 'Gold / US30 Event Intelligence', tag: 'news', tone: 'neutral' });
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
      this.bindEvents(body, redraw);
      void this.ensureData(redraw);
    };

    subscribeMarketFocus((focus) => {
      this.marketFocus = focus;
      this.loadedKey = '';
      redraw();
    });

    window.addEventListener('vaultum:snapshot-updated', () => {
      this.loadedKey = '';
      redraw();
    });

    this.ensurePolling(redraw);
    redraw();
    return panel;
  }

  protected renderBody(): string {
    if (this.loading && !this.goldNews && !this.us30News) {
      return `<div class="vaultum-callout"><strong>Loading Live News / X Alerts</strong><span>Building the Gold and US30 event-intelligence board for ${escapeHtml(this.marketFocus.timeframe.toUpperCase())}.</span></div>`;
    }
    if (this.error && !this.goldNews && !this.us30News) {
      return `<div class="vaultum-callout"><strong>Event intelligence unavailable</strong><span>${escapeHtml(this.error)}</span></div>`;
    }
    if (!this.goldNews || !this.us30News) {
      return `<div class="vaultum-callout"><strong>Waiting for event board</strong><span>The panel will populate once both Gold and US30 event-intelligence layers return.</span></div>`;
    }

    const focusMode = this.mode === 'compare' ? null : this.mode;
    const sections = (focusMode ? [focusMode] : ['XAUUSD', 'US30']) as Array<'XAUUSD' | 'US30'>;
    const comparisonTone = toneForBias(compareConclusion(this.goldNews, this.us30News, this.goldMacro, this.us30Macro));
    const xActive = this.goldNews?.xIntel?.state === 'active' || this.us30News?.xIntel?.state === 'active';

    return `
      <div class="vaultum-analyst-query">
        <div class="vaultum-analyst-prompt-row">
          <button class="vaultum-btn ${this.mode === 'compare' ? 'vaultum-btn-primary' : ''}" data-news-mode="compare">Compare</button>
          <button class="vaultum-btn ${this.mode === 'XAUUSD' ? 'vaultum-btn-primary' : ''}" data-news-mode="XAUUSD">Gold</button>
          <button class="vaultum-btn ${this.mode === 'US30' ? 'vaultum-btn-primary' : ''}" data-news-mode="US30">US30</button>
        </div>
        <div class="vaultum-module-note">This panel actively monitors approved X accounts and translates posts into scored market events, not a scrolling headline feed. Headline -> event type -> credibility -> market map -> reaction validation -> actionability -> trading guidance.</div>
      </div>

      <div class="vaultum-primary-card ${comparisonTone}">
        <div class="vaultum-primary-card-head">
          <span>Cross-market read</span>
          <strong>${escapeHtml(this.marketFocus.timeframe.toUpperCase())}</strong>
        </div>
        <div class="vaultum-primary-card-value">${escapeHtml(compareConclusion(this.goldNews, this.us30News, this.goldMacro, this.us30Macro))}</div>
        <div class="vaultum-primary-card-copy">${escapeHtml(xActive ? 'X/Twitter monitoring is active and the board is classifying live event clusters with actionability states.' : 'X/Twitter live monitoring is not active yet, so the board is falling back to structured news plus demo event cards.')}</div>
      </div>

      ${renderPanelSummaryBlock({
        headline: compareConclusion(this.goldNews, this.us30News, this.goldMacro, this.us30Macro),
        bullets: [
          this.goldNews?.xIntel?.clusters?.[0] ? `Gold lead event: ${this.goldNews.xIntel.clusters[0].eventType} / ${this.goldNews.xIntel.clusters[0].actionability?.state} / ${this.goldNews.xIntel.clusters[0].validation?.reactionValidation}` : null,
          this.us30News?.xIntel?.clusters?.[0] ? `US30 lead event: ${this.us30News.xIntel.clusters[0].eventType} / ${this.us30News.xIntel.clusters[0].actionability?.state} / ${this.us30News.xIntel.clusters[0].validation?.reactionValidation}` : null,
          xActive ? 'The panel is now being actively polled for tracked-account event updates.' : 'Live X polling is not active yet; demo event cards remain available for workflow testing.',
        ].filter((item): item is string => Boolean(item)),
        tone: comparisonTone,
        statusLabel: focusMode ? 'focused market' : 'cross-market',
      })}

      <div class="vaultum-responsive-card-grid" style="--vaultum-grid-min: 360px;">
        ${sections.map((market) => this.renderMarketCard(market)).join('')}
        ${!focusMode ? this.renderCompareCard() : ''}
      </div>
    `;
  }

  private renderMarketCard(market: 'XAUUSD' | 'US30'): string {
    const data = market === 'XAUUSD' ? this.goldNews : this.us30News;
    const macro = market === 'XAUUSD' ? this.goldMacro : this.us30Macro;
    const checklistWarnings = (data?.predictionChecklist ?? []).filter((item) => item.status !== 'pass');
    const catalysts = data?.catalysts ?? [];
    const xPosts = data?.xIntel?.posts ?? [];
    const clusters = sortedClusters(filteredClusters(listClusters(data), this.filter, this.assetFilter, this.eventFilter), this.sort);
    const selected = clusters.find((item) => item.id === this.selectedClusterId[market]) ?? clusters[0] ?? null;
    const tone = toneForBias(data?.patternModel?.bias ?? data?.sentiment?.label);
    const assetOptions = [...new Set((listClusters(data).flatMap((cluster) => cluster.impactAssessment?.impactedAssets?.map((item) => item.asset) ?? [])))];
    const eventOptions = [...new Set(listClusters(data).map((cluster) => cluster.eventType))];
    const monitor = data?.xIntel?.monitor;

    return `
      <div class="vaultum-module-card is-wide ${tone === 'bullish' ? 'is-bullish' : tone === 'bearish' ? 'is-bearish' : tone === 'alert' ? 'is-alert' : ''}">
        <div class="vaultum-module-card-header">
          <div class="vaultum-module-card-copy">
            <span>${market === 'XAUUSD' ? 'Gold' : 'US30'}</span>
            <strong>${escapeHtml(data?.summary ?? 'No summary available.')}</strong>
            <em>${escapeHtml(macro?.focus?.summary ?? macro?.regime ?? 'Macro overlay unavailable.')}</em>
          </div>
        </div>
        <div class="vaultum-module-card-body">
          <div class="vaultum-tv-overlay-metrics">
            <div class="vaultum-tv-overlay-metric"><span>Sentiment</span><strong>${escapeHtml(`${data?.sentiment?.label ?? 'neutral'} ${data?.sentiment?.score ?? 'n/a'}`)}</strong></div>
            <div class="vaultum-tv-overlay-metric"><span>Pattern</span><strong>${escapeHtml(`${data?.patternModel?.bias ?? 'neutral'} ${data?.patternModel?.confidence ?? 'n/a'}`)}</strong></div>
            <div class="vaultum-tv-overlay-metric"><span>X Monitor</span><strong>${escapeHtml(data?.xIntel?.state === 'active' ? `${monitor?.watchCount ?? clusters.length} live` : data?.xIntel?.state ?? 'inactive')}</strong></div>
            <div class="vaultum-tv-overlay-metric"><span>Next Poll</span><strong>${escapeHtml(data?.xIntel?.state === 'active' ? relativeTime(monitor?.nextPollDueAt) : 'idle')}</strong></div>
          </div>

          ${renderPanelSummaryBlock({
            headline: data?.smartAnalysis?.summary ?? data?.summary ?? 'No AI summary available.',
            bullets: [
              selected ? `${selected.eventType} / ${selected.actionability?.state ?? 'MONITOR'} / ${selected.validation?.reactionValidation ?? 'unvalidated'}` : null,
              selected?.explanation?.whyItMatters ?? null,
              checklistWarnings[0] ? `Checklist risk: ${checklistWarnings[0].detail}` : null,
            ].filter((item): item is string => Boolean(item)),
            tone,
            statusLabel: data?.xIntel?.state === 'active' ? 'live event board' : 'news stack',
          })}

          <div class="vaultum-data-block">
            <div class="vaultum-data-block-head"><span>Event Filters</span><strong>${clusters.length}</strong></div>
            <div class="vaultum-analyst-prompt-row">
              <button class="vaultum-btn ${this.filter === 'all' ? 'vaultum-btn-primary' : ''}" data-x-filter="all">All</button>
              <button class="vaultum-btn ${this.filter === 'high-impact' ? 'vaultum-btn-primary' : ''}" data-x-filter="high-impact">High Impact</button>
              <button class="vaultum-btn ${this.filter === 'tradeable' ? 'vaultum-btn-primary' : ''}" data-x-filter="tradeable">Tradeable</button>
              <button class="vaultum-btn ${this.filter === 'macro-bias' ? 'vaultum-btn-primary' : ''}" data-x-filter="macro-bias">Macro Bias</button>
              <button class="vaultum-btn ${this.filter === 'needs-confirmation' ? 'vaultum-btn-primary' : ''}" data-x-filter="needs-confirmation">Needs Confirmation</button>
              <button class="vaultum-btn ${this.filter === 'ignored' ? 'vaultum-btn-primary' : ''}" data-x-filter="ignored">Ignored / Noise</button>
            </div>
            <div class="vaultum-tv-overlay-metrics">
              <div class="vaultum-tv-overlay-metric">
                <span>By Asset</span>
                <strong>
                  <select class="vaultum-news-select" data-x-asset-filter>
                    <option value="all"${this.assetFilter === 'all' ? ' selected' : ''}>All Assets</option>
                    ${assetOptions.map((item) => `<option value="${escapeHtml(item)}"${this.assetFilter === item ? ' selected' : ''}>${escapeHtml(item)}</option>`).join('')}
                  </select>
                </strong>
              </div>
              <div class="vaultum-tv-overlay-metric">
                <span>By Event</span>
                <strong>
                  <select class="vaultum-news-select" data-x-event-filter>
                    <option value="all"${this.eventFilter === 'all' ? ' selected' : ''}>All Events</option>
                    ${eventOptions.map((item) => `<option value="${escapeHtml(item)}"${this.eventFilter === item ? ' selected' : ''}>${escapeHtml(item)}</option>`).join('')}
                  </select>
                </strong>
              </div>
              <div class="vaultum-tv-overlay-metric">
                <span>Sort</span>
                <strong>
                  <select class="vaultum-news-select" data-x-sort>
                    <option value="impact"${this.sort === 'impact' ? ' selected' : ''}>Highest Impact</option>
                    <option value="newest"${this.sort === 'newest' ? ' selected' : ''}>Newest</option>
                    <option value="credibility"${this.sort === 'credibility' ? ' selected' : ''}>Highest Credibility</option>
                    <option value="reaction"${this.sort === 'reaction' ? ' selected' : ''}>Strongest Reaction</option>
                  </select>
                </strong>
              </div>
            </div>
          </div>

          <div class="vaultum-data-block">
            <div class="vaultum-data-block-head"><span>Actionable Event Board</span><strong>${clusters.length}</strong></div>
            <div class="vaultum-news-event-grid">
              ${clusters.length ? clusters.slice(0, 6).map((cluster) => this.renderEventCard(cluster, market)).join('') : '<div class="vaultum-signal-row neutral"><span>No event clusters match the current filters.</span></div>'}
            </div>
          </div>

          ${selected ? this.renderEventDetail(selected, market) : ''}

          <div class="vaultum-data-block">
            <div class="vaultum-data-block-head"><span>Catalysts</span><strong>${catalysts.length}</strong></div>
            <div class="vaultum-signal-list">${renderSignalList(catalysts.slice(0, 3).map((item) => `${item.bias} ${item.impact}: ${item.title}`), tone)}</div>
          </div>

          <div class="vaultum-data-block">
            <div class="vaultum-data-block-head"><span>Tracked Posts</span><strong>${xPosts.length}</strong></div>
            <div class="vaultum-signal-list">${renderSignalList(
              xPosts.slice(0, 2).map((item) => `@${item.authorHandle} ${item.eventType ?? 'headline'} / credibility ${item.credibility ?? 'n/a'}: ${item.text}`),
              data?.xIntel?.state === 'active' ? tone : 'neutral',
            )}</div>
          </div>
        </div>
      </div>
    `;
  }

  private renderEventCard(cluster: ClusterView, market: 'XAUUSD' | 'US30'): string {
    const tone = clusterTone(cluster);
    const impacts = (cluster.impactAssessment?.impactedAssets ?? []).slice(0, 3).map((item) => `${item.asset} ${item.directionBias} ${item.impactMagnitude}`).join(' | ');
    return `
      <button class="vaultum-news-event-card ${tone}${this.selectedClusterId[market] === cluster.id ? ' is-selected' : ''}" data-cluster-id="${escapeHtml(cluster.id)}" data-cluster-market="${market}">
        <div class="vaultum-news-event-head">
          <span>${escapeHtml(cluster.eventType.replaceAll('_', ' '))}</span>
          <strong>${escapeHtml(cluster.actionability?.state ?? 'MONITOR')}</strong>
        </div>
        <div class="vaultum-news-event-title">${escapeHtml(cluster.headline)}</div>
        <div class="vaultum-news-event-copy">${escapeHtml(cluster.explanation?.whyItMatters ?? cluster.cleanedSummary ?? 'No explanation available.')}</div>
        <div class="vaultum-news-event-meta">
          <span>${escapeHtml(relativeTime(cluster.latestUpdateAt))}</span>
          <span>${escapeHtml(cluster.validation?.reactionValidation ?? 'unvalidated')}</span>
          <span>${escapeHtml(`cred ${cluster.eventCredibilityScore ?? 'n/a'}`)}</span>
          <span>${escapeHtml(`impact ${cluster.overallImpactScore ?? 'n/a'}`)}</span>
        </div>
        <div class="vaultum-news-event-assets">${escapeHtml(impacts || 'No asset map yet.')}</div>
        <div class="vaultum-news-event-meta">
          <span>${escapeHtml(`${cluster.decay?.persistenceClass ?? 'flash'} / ${cluster.decay?.impactHalfLifeMinutes ?? 'n/a'}m`)}</span>
          <span>${escapeHtml((cluster.sourceHandles ?? []).slice(0, 2).map((item) => `@${item}`).join(' / ') || 'source unknown')}</span>
        </div>
      </button>
    `;
  }

  private renderEventDetail(cluster: ClusterView, market: 'XAUUSD' | 'US30'): string {
    const reactionRows = (cluster.validation?.observedMoves ?? []).slice(0, 4).map((item) => `${item.asset} ${item.expectedDirection} | 1m ${item.oneMinuteMovePct ?? 'n/a'}% | 5m ${item.fiveMinuteMovePct ?? 'n/a'}% | 15m ${item.fifteenMinuteMovePct ?? 'n/a'}% | 60m ${item.sixtyMinuteMovePct ?? 'n/a'}%`).join(' || ');
    const guidance = [
      cluster.tradingGuidance?.regimeEffect,
      ...(cluster.tradingGuidance?.setupAdjustments ?? []),
      ...(cluster.tradingGuidance?.riskFlags ?? []),
    ].filter((item): item is string => Boolean(item));

    return `
      <div class="vaultum-data-block">
        <div class="vaultum-data-block-head"><span>Event Detail</span><strong>${escapeHtml(market)}</strong></div>
        <div class="vaultum-signal-list">
          <div class="vaultum-signal-row ${clusterTone(cluster)}"><span>${escapeHtml(cluster.cleanedSummary ?? cluster.headline)}</span></div>
          <div class="vaultum-signal-row neutral"><span>${escapeHtml(`Type ${cluster.eventType} | intensity ${cluster.intensity ?? 'n/a'} | surprise ${cluster.surpriseLevel ?? 'n/a'} | actionability ${cluster.actionability?.state ?? 'MONITOR'}`)}</span></div>
          <div class="vaultum-signal-row neutral"><span>${escapeHtml(`Why it matters: ${cluster.explanation?.whyItMatters ?? 'n/a'}`)}</span></div>
          <div class="vaultum-signal-row neutral"><span>${escapeHtml(`Transmission: ${cluster.explanation?.transmissionPath ?? 'n/a'}`)}</span></div>
          <div class="vaultum-signal-row neutral"><span>${escapeHtml(`Validation: ${cluster.validation?.reactionValidation ?? 'n/a'} / alignment ${cluster.validation?.crossAssetAlignmentScore ?? 'n/a'} / ${cluster.validation?.explanation ?? 'n/a'}`)}</span></div>
          <div class="vaultum-signal-row neutral"><span>${escapeHtml(`Reaction map: ${reactionRows || 'No reaction map available.'}`)}</span></div>
          <div class="vaultum-signal-row neutral"><span>${escapeHtml(`Guidance: ${guidance.join(' | ') || 'No extra setup guidance yet.'}`)}</span></div>
          <div class="vaultum-signal-row neutral"><span>${escapeHtml(`Missing confirmation: ${cluster.explanation?.missingConfirmation ?? 'n/a'}`)}</span></div>
          <div class="vaultum-signal-row neutral"><span>${escapeHtml(`Lead post: ${(cluster.posts?.[0]?.text ?? cluster.headline)}`)}</span></div>
        </div>
      </div>
    `;
  }

  private renderCompareCard(): string {
    const goldClusters = listClusters(this.goldNews);
    const us30Clusters = listClusters(this.us30News);
    const goldLead = goldClusters[0];
    const us30Lead = us30Clusters[0];

    return `
      <div class="vaultum-module-card is-full">
        <div class="vaultum-module-card-header">
          <div class="vaultum-module-card-copy">
            <span>Compare</span>
            <strong>${escapeHtml('Cross-asset headline map')}</strong>
            <em>${escapeHtml('Use Gold and US30 together to separate haven demand, risk appetite, and false headline overreaction.')}</em>
          </div>
        </div>
        <div class="vaultum-module-card-body">
          <div class="vaultum-signal-list">
            ${renderSignalList([
              goldLead ? `Gold lead event: ${goldLead.eventType} / ${goldLead.actionability?.state ?? 'MONITOR'} / ${goldLead.validation?.reactionValidation ?? 'unvalidated'}` : 'Gold has no active event cluster.',
              us30Lead ? `US30 lead event: ${us30Lead.eventType} / ${us30Lead.actionability?.state ?? 'MONITOR'} / ${us30Lead.validation?.reactionValidation ?? 'unvalidated'}` : 'US30 has no active event cluster.',
              goldLead && us30Lead
                ? `Bias split: Gold ${goldLead.impactAssessment?.impactedAssets?.[0]?.directionBias ?? 'mixed'} vs US30 ${us30Lead.impactAssessment?.impactedAssets?.[0]?.directionBias ?? 'mixed'}.`
                : 'Wait for both markets to register a clean event map before trusting the cross-asset read.',
            ])}
          </div>
        </div>
      </div>
    `;
  }

  private bindEvents(root: HTMLElement, redraw: () => void): void {
    root.querySelectorAll<HTMLButtonElement>('[data-news-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.newsMode as PanelMode | undefined;
        if (!mode || mode === this.mode) return;
        this.mode = mode;
        redraw();
      });
    });

    root.querySelectorAll<HTMLButtonElement>('[data-x-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        const filter = button.dataset.xFilter as FeedFilter | undefined;
        if (!filter || filter === this.filter) return;
        this.filter = filter;
        redraw();
      });
    });

    root.querySelectorAll<HTMLButtonElement>('[data-cluster-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const market = button.dataset.clusterMarket as 'XAUUSD' | 'US30' | undefined;
        const clusterId = button.dataset.clusterId;
        if (!market || !clusterId) return;
        this.selectedClusterId[market] = clusterId;
        redraw();
      });
    });

    const assetFilter = root.querySelector<HTMLSelectElement>('[data-x-asset-filter]');
    assetFilter?.addEventListener('change', () => {
      this.assetFilter = assetFilter.value || 'all';
      redraw();
    });

    const eventFilter = root.querySelector<HTMLSelectElement>('[data-x-event-filter]');
    eventFilter?.addEventListener('change', () => {
      this.eventFilter = eventFilter.value || 'all';
      redraw();
    });

    const sortSelect = root.querySelector<HTMLSelectElement>('[data-x-sort]');
    sortSelect?.addEventListener('change', () => {
      this.sort = (sortSelect.value as FeedSort) || 'impact';
      redraw();
    });
  }

  private ensurePolling(redraw: () => void): void {
    if (!this.pollLoop) {
      this.pollLoop = new SmartPollLoop({
        label: 'news-intel',
        intervalMs: this.pollingMs,
        task: async () => {
          this.loadedKey = '';
          await this.ensureData(redraw);
        },
      });
      this.pollLoop.start();
      return;
    }
    this.pollLoop.updateInterval(this.pollingMs);
  }

  private restartPolling(redraw: () => void, pollingMs: number): void {
    const clamped = Math.max(15_000, Math.min(Math.round(pollingMs || 60_000), 300_000));
    if (clamped === this.pollingMs && this.pollLoop != null) return;
    this.pollingMs = clamped;
    this.ensurePolling(redraw);
  }

  private async ensureData(redraw: () => void): Promise<void> {
    const key = `${this.marketFocus.timeframe}`;
    if (this.loading) return;
    if (this.loadedKey === key && (this.goldNews || this.us30News || this.error)) return;
    this.loading = true;
    this.error = '';
    redraw();

    try {
      const [goldNews, us30News, goldMacro, us30Macro] = await Promise.all([
        fetchNewsIntel('XAUUSD', this.marketFocus.timeframe),
        fetchNewsIntel('US30', this.marketFocus.timeframe),
        invokeVaultumRpc<MacroLite>('macro', 'get-macro-signals', { market: 'XAUUSD' }),
        invokeVaultumRpc<MacroLite>('macro', 'get-macro-signals', { market: 'US30' }),
      ]);
      this.goldNews = goldNews;
      this.us30News = us30News;
      this.goldMacro = goldMacro;
      this.us30Macro = us30Macro;
      const nextPollingMs = Math.min(
        goldNews?.xIntel?.monitor?.pollingMs ?? 60_000,
        us30News?.xIntel?.monitor?.pollingMs ?? 60_000,
      );
      this.restartPolling(redraw, nextPollingMs);
      if (!goldNews || !us30News) {
        this.error = 'One or more event-intelligence layers did not return for Gold and US30.';
      } else {
        this.loadedKey = key;
      }
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Unable to load Gold / US30 event intelligence.';
    } finally {
      this.loading = false;
      redraw();
    }
  }
}
