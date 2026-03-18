import { createDefaultContext, type VaultumAppContext } from '@/app/app-context';
import { DataLoader } from '@/app/data-loader';
import { PanelLayout } from '@/app/panel-layout';
import { RefreshScheduler } from '@/app/refresh-scheduler';
import { SearchManager } from '@/app/search-manager';
import { CommandPalette } from '@/app/command-palette';
import { RuntimeConfigPanel } from '@/components/panels/RuntimeConfigPanel';
import { panelRegistry } from '@/components/panels';

export class VaultumApp {
  private readonly root: HTMLElement;
  private readonly context: VaultumAppContext;
  private readonly dataLoader: DataLoader;
  private readonly layout: PanelLayout;
  private readonly refreshScheduler: RefreshScheduler;
  private readonly searchManager: SearchManager;
  private readonly commandPalette: CommandPalette;

  constructor(rootId: string) {
    const root = document.getElementById(rootId);
    if (!root) throw new Error(`Missing root container: ${rootId}`);

    this.root = root;
    this.context = createDefaultContext();
    this.layout = new PanelLayout(this.context);
    this.dataLoader = new DataLoader(this.context);
    this.refreshScheduler = new RefreshScheduler(this.context, this.dataLoader);
    this.searchManager = new SearchManager(this.context);
    this.commandPalette = new CommandPalette(this.context, this.searchManager);
  }

  async init(): Promise<void> {
    this.root.innerHTML = '';
    this.root.appendChild(this.renderShell());

    this.layout.mount(document.getElementById('vaultum-panels') as HTMLElement);
    panelRegistry.forEach((panel) => this.layout.register(panel));
    this.layout.register(new RuntimeConfigPanel(this.context));

    this.searchManager.mount(document.getElementById('vaultum-search-results') as HTMLElement);
    this.commandPalette.mount(document.getElementById('vaultum-command-palette') as HTMLElement);

    await this.dataLoader.bootstrap();
    this.layout.render();
    this.refreshScheduler.start();
  }

  private renderShell(): HTMLElement {
    const shell = document.createElement('div');
    shell.className = 'vaultum-shell';
    shell.innerHTML = `
      <header class="vaultum-header">
        <div>
          <div class="vaultum-eyebrow">VAULTUM TERMINAL</div>
          <h1>Institutional Trading Activity Terminal</h1>
          <p>Macro regime, cross-asset structure, liquidity stress, options pressure, positioning, and geopolitical market impact in one dense operating surface.</p>
        </div>
        <div class="vaultum-header-actions">
          <button id="vaultum-refresh" class="vaultum-btn">Refresh Snapshot</button>
          <button id="vaultum-command-open" class="vaultum-btn vaultum-btn-primary">Command Palette</button>
        </div>
      </header>
      <section class="vaultum-topbar">
        <div class="vaultum-topbar-card"><span class="label">Intent</span><strong id="vaultum-intent">macro regime</strong></div>
        <div class="vaultum-topbar-card"><span class="label">Primary Asset</span><strong id="vaultum-primary-asset">XAUUSD</strong></div>
        <div class="vaultum-topbar-card"><span class="label">Runtime</span><strong id="vaultum-update-mode">rpc-backed terminal</strong></div>
        <div class="vaultum-topbar-card"><span class="label">Freshness</span><strong id="vaultum-freshness">booting</strong></div>
      </section>
      <section class="vaultum-search">
        <input id="vaultum-search" type="search" placeholder="Search assets, FX pairs, regimes, countries, options walls, or signals" />
        <div id="vaultum-search-results" class="vaultum-search-results"></div>
      </section>
      <main id="vaultum-panels" class="vaultum-panels"></main>
      <div id="vaultum-command-palette"></div>
    `;

    shell.querySelector<HTMLButtonElement>('#vaultum-refresh')?.addEventListener('click', () => {
      void this.dataLoader.refreshAll();
    });

    shell.querySelector<HTMLButtonElement>('#vaultum-command-open')?.addEventListener('click', () => {
      this.commandPalette.toggle();
    });

    shell.querySelector<HTMLInputElement>('#vaultum-search')?.addEventListener('input', (event) => {
      const value = (event.target as HTMLInputElement).value;
      this.searchManager.updateQuery(value);
    });

    return shell;
  }
}
