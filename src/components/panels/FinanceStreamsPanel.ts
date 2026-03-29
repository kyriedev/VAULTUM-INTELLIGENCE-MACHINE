import { BasePanel } from '@/components/base/panel';
import { buildYoutubeEmbedUrl, fetchYoutubeLiveChannel, type YoutubeLiveResponse } from '@/services/media/youtube';

type FinanceChannel = {
  id: string;
  label: string;
  handle: string;
  note: string;
};

const CHANNELS: FinanceChannel[] = [
  { id: 'bloomberg', label: 'Bloomberg TV', handle: '@BloombergTelevision', note: 'macro, rates, equities' },
  { id: 'yahoo', label: 'Yahoo Finance', handle: '@YahooFinance', note: 'broad market desk' },
  { id: 'schwab', label: 'Schwab Network', handle: '@SchwabNetwork', note: 'U.S. trading desk' },
  { id: 'cnbctv18', label: 'CNBC TV18', handle: '@CNBCTV18', note: 'global market handoff' },
  { id: 'kitco', label: 'Kitco News', handle: '@KitcoNEWS', note: 'gold and metals context' },
];

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export class FinanceStreamsPanel extends BasePanel {
  private status = new Map<string, YoutubeLiveResponse | null>();
  private selectedChannelId = CHANNELS[0]!.id;
  private loading = false;
  private loaded = false;

  constructor() {
    super({ id: 'finance-streams', title: 'Finance Streams', kicker: 'Live Desk TV', tag: 'media', tone: 'neutral' });
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
      void this.ensureChannels(redraw);
    };

    redraw();
    window.setInterval(() => void this.ensureChannels(redraw, true), 300_000);
    return panel;
  }

  protected renderBody(): string {
    const available = CHANNELS.filter((channel) => this.status.get(channel.id)?.videoId);
    const selected = CHANNELS.find((channel) => channel.id === this.selectedChannelId) ?? CHANNELS[0]!;
    const selectedStatus = this.status.get(selected.id) ?? null;
    const activeStatus = selectedStatus?.videoId ? selectedStatus : (available.length ? this.status.get(available[0]!.id) ?? null : null);
    const activeChannel = selectedStatus?.videoId ? selected : (available[0] ?? selected);

    return `
      <div class="vaultum-stream-shell">
        <div class="vaultum-stream-player">
          ${this.loading && !this.loaded ? `<div class="vaultum-callout"><strong>Checking live channels</strong><span>Refreshing the current finance stream lineup.</span></div>` : ''}
          ${activeStatus?.videoId ? `
            <iframe
              class="vaultum-stream-iframe"
              src="${escapeHtml(buildYoutubeEmbedUrl(activeStatus.videoId))}"
              title="${escapeHtml(`${activeChannel.label} live stream`)}"
              allow="autoplay; encrypted-media; picture-in-picture"
              referrerpolicy="strict-origin-when-cross-origin"
              allowfullscreen
            ></iframe>
          ` : `
            <div class="vaultum-callout">
              <strong>No confirmed live stream right now</strong>
              <span>Vaultum is polling the curated finance desk channels and will surface whichever one is live first.</span>
            </div>
          `}
        </div>
        <div class="vaultum-stream-list">
          ${CHANNELS.map((channel) => {
            const state = this.status.get(channel.id);
            const live = Boolean(state?.videoId);
            return `
              <button class="vaultum-stream-card ${channel.id === activeChannel.id ? 'is-active' : ''}" data-channel-id="${escapeHtml(channel.id)}">
                <div>
                  <strong>${escapeHtml(channel.label)}</strong>
                  <span>${escapeHtml(channel.note)}</span>
                </div>
                <em class="${live ? 'is-live' : 'is-off'}">${live ? 'live' : 'offline'}</em>
              </button>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  private bindEvents(root: HTMLElement, redraw: () => void): void {
    root.querySelectorAll<HTMLButtonElement>('[data-channel-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const channelId = button.dataset.channelId;
        if (!channelId || channelId === this.selectedChannelId) return;
        this.selectedChannelId = channelId;
        redraw();
      });
    });
  }

  private async ensureChannels(redraw: () => void, force = false): Promise<void> {
    if (this.loading) return;
    if (this.loaded && !force) return;
    this.loading = true;
    redraw();

    const results = await Promise.all(CHANNELS.map(async (channel) => ({
      id: channel.id,
      data: await fetchYoutubeLiveChannel(channel.handle),
    })));

    results.forEach((result) => this.status.set(result.id, result.data));
    const firstLive = CHANNELS.find((channel) => this.status.get(channel.id)?.videoId);
    if (firstLive && !this.status.get(this.selectedChannelId)?.videoId) {
      this.selectedChannelId = firstLive.id;
    }

    this.loaded = true;
    this.loading = false;
    redraw();
  }
}
