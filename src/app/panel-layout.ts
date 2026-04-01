import type { VaultumAppContext } from '@/app/app-context';
import type { PanelComponent } from '@/components/base/panel';

type PanelSection = {
  id: string;
  step: string;
  title: string;
  description: string;
  panels: Array<{
    id: string;
    span: 4 | 6 | 12;
  }>;
};

const PANEL_SECTIONS: PanelSection[] = [
  {
    id: 'chart',
    step: '01',
    title: 'Main Chart',
    description: 'Primary tape view with a docked execution and structure workspace below it.',
    panels: [
      { id: 'live-chart', span: 12 },
    ],
  },
  {
    id: 'screener',
    step: '02',
    title: 'Screener',
    description: 'Watchlists and scanner sidecars in isolated cards without overlap.',
    panels: [
      { id: 'tv-screener', span: 12 },
    ],
  },
  {
    id: 'reasoning',
    step: '03',
    title: 'AI And Scenario',
    description: 'Desk bias, scenario work, execution framing, and live institutional readouts.',
    panels: [
      { id: 'market-brief', span: 6 },
      { id: 'institutional-monitor', span: 6 },
      { id: 'ai-insights', span: 12 },
      { id: 'execution-playbook', span: 6 },
      { id: 'monte-carlo', span: 6 },
      { id: 'market-radar', span: 6 },
      { id: 'fear-greed', span: 6 },
      { id: 'prediction', span: 6 },
    ],
  },
  {
    id: 'macro-drivers',
    step: '04',
    title: 'Macro Drivers',
    description: 'Rates, dollar, commodities, and calendar pressure.',
    panels: [
      { id: 'macro-regime', span: 6 },
      { id: 'fx-board', span: 6 },
      { id: 'commodities', span: 6 },
      { id: 'economic', span: 12 },
      { id: 'gold-engine', span: 12 },
    ],
  },
  {
    id: 'structure',
    step: '05',
    title: 'Structure And Positioning',
    description: 'Dealers, liquidity, pivots, and participation.',
    panels: [
      { id: 'options-gamma', span: 6 },
      { id: 'dealer-pressure', span: 6 },
      { id: 'cot-positioning', span: 6 },
      { id: 'volume-profile', span: 6 },
      { id: 'buyer-seller-pressure', span: 6 },
      { id: 'orderflow-engine', span: 6 },
      { id: 'liquidity-stress', span: 6 },
    ],
  },
  {
    id: 'context',
    step: '06',
    title: 'Context And Catalyst',
    description: 'Catalysts, crowding, and outside confirmation.',
    panels: [
      { id: 'geopolitical-risk', span: 6 },
      { id: 'trade-policy', span: 6 },
      { id: 'news-intel', span: 6 },
      { id: 'finance-streams', span: 6 },
    ],
  },
  {
    id: 'cycle-history',
    step: '07',
    title: 'Cycle And Desk History',
    description: 'Cycle context, reports, journal memory, and runtime state.',
    panels: [
      { id: 'benner-cycle', span: 12 },
      { id: 'report-desk', span: 6 },
      { id: 'trade-journal', span: 6 },
      { id: 'runtime-config', span: 12 },
    ],
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
      const panels = section.panels
        .map((placement) => {
          const panel = byId.get(placement.id);
          if (!panel) return null;
          return { panel, span: placement.span };
        })
        .filter((entry): entry is { panel: PanelComponent; span: 4 | 6 | 12 } => Boolean(entry));

      if (!panels.length) return;

      const sectionEl = document.createElement('section');
      sectionEl.className = 'vaultum-section vaultum-section-stack';
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
      panels.forEach(({ panel, span }) => {
        used.add(panel.definition.id);
        const slot = document.createElement('div');
        slot.className = `vaultum-grid-slot span-${span}`;
        slot.appendChild(panel.render());
        grid.appendChild(slot);
      });

      this.container?.appendChild(sectionEl);
    });

    const leftovers = this.registered.filter((panel) => !used.has(panel.definition.id));
    if (leftovers.length) {
      const overflow = document.createElement('section');
      overflow.className = 'vaultum-section vaultum-section-stack';
      overflow.innerHTML = `
        <div class="vaultum-section-header">
          <div class="vaultum-section-step">08</div>
          <div>
            <h2>Additional Panels</h2>
            <p>Panels that are available but not yet assigned to a guided section.</p>
          </div>
        </div>
        <div class="vaultum-section-grid"></div>
      `;
      const grid = overflow.querySelector('.vaultum-section-grid') as HTMLElement;
      leftovers.forEach((panel) => {
        const slot = document.createElement('div');
        slot.className = 'vaultum-grid-slot span-4';
        slot.appendChild(panel.render());
        grid.appendChild(slot);
      });
      this.container?.appendChild(overflow);
    }
  }
}
