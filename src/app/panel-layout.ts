import type { VaultumAppContext } from '@/app/app-context';
import type { PanelComponent } from '@/components/base/panel';

type PanelSection = {
  id: string;
  step: string;
  title: string;
  description: string;
  panelIds: string[];
};

const PANEL_SECTIONS: PanelSection[] = [
  {
    id: 'orientation',
    step: '01',
    title: 'Orientation',
    description: 'Start with the chart, the desk brief, the sentiment composite, and the radar so you know what tape you are looking at before drilling down.',
    panelIds: ['live-chart', 'market-brief', 'market-radar', 'fear-greed', 'execution-playbook', 'monte-carlo', 'tv-screener', 'ai-insights'],
  },
  {
    id: 'macro-drivers',
    step: '02',
    title: 'Macro Drivers',
    description: 'Read the broad regime first: macro state, FX pressure, commodities, and economic context explain the environment behind the move.',
    panelIds: ['macro-regime', 'fx-board', 'commodities', 'economic', 'gold-engine'],
  },
  {
    id: 'structure',
    step: '03',
    title: 'Structure And Positioning',
    description: 'Use options, positioning, liquidity, pivots, and profile tools to decide whether the move is likely to trend, pin, squeeze, or fail.',
    panelIds: ['options-gamma', 'dealer-pressure', 'cot-positioning', 'liquidity-stress', 'volume-profile', 'buyer-seller-pressure', 'orderflow-engine', 'benner-cycle'],
  },
  {
    id: 'context',
    step: '04',
    title: 'Context And Catalyst',
    description: 'Finish with geopolitical, trade, prediction, and news context so you know which outside catalysts can confirm or break the trade thesis.',
    panelIds: ['geopolitical-risk', 'trade-policy', 'prediction', 'news-intel', 'finance-streams'],
  },
  {
    id: 'system',
    step: '05',
    title: 'System',
    description: 'Check runtime state only when you need to confirm freshness, provider health, or degraded modes.',
    panelIds: ['runtime-config'],
  },
];

export class PanelLayout {
  private container: HTMLElement | null = null;
  private readonly registered: PanelComponent[] = [];

  constructor(private readonly context: VaultumAppContext) {}

  mount(container: HTMLElement): void {
    this.container = container;
  }

  register(panel: PanelComponent): void {
    this.registered.push(panel);
    this.context.panels.push(panel.definition);
  }

  render(): void {
    if (!this.container) return;
    this.container.innerHTML = '';

    const byId = new Map(this.registered.map((panel) => [panel.definition.id, panel]));
    const used = new Set<string>();

    PANEL_SECTIONS.forEach((section) => {
      const panels = section.panelIds
        .map((panelId) => byId.get(panelId))
        .filter((panel): panel is PanelComponent => Boolean(panel));

      if (!panels.length) return;

      const sectionEl = document.createElement('section');
      sectionEl.className = 'vaultum-section';
      sectionEl.innerHTML = `
        <div class="vaultum-section-header">
          <div class="vaultum-section-step">${section.step}</div>
          <div>
            <h2>${section.title}</h2>
            <p>${section.description}</p>
          </div>
        </div>
        <div class="vaultum-section-grid"></div>
      `;

      const grid = sectionEl.querySelector('.vaultum-section-grid') as HTMLElement;
      panels.forEach((panel) => {
        used.add(panel.definition.id);
        grid.appendChild(panel.render());
      });

      this.container?.appendChild(sectionEl);
    });

    const leftovers = this.registered.filter((panel) => !used.has(panel.definition.id));
    if (leftovers.length) {
      const overflow = document.createElement('section');
      overflow.className = 'vaultum-section';
      overflow.innerHTML = `
        <div class="vaultum-section-header">
          <div class="vaultum-section-step">06</div>
          <div>
            <h2>Additional Panels</h2>
            <p>Panels that are available but not yet assigned to a guided section.</p>
          </div>
        </div>
        <div class="vaultum-section-grid"></div>
      `;
      const grid = overflow.querySelector('.vaultum-section-grid') as HTMLElement;
      leftovers.forEach((panel) => grid.appendChild(panel.render()));
      this.container?.appendChild(overflow);
    }
  }
}
