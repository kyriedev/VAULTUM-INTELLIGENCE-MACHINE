import { createDefaultContext, type VaultumAppContext } from '@/app/app-context';
import { DataLoader } from '@/app/data-loader';
import { PanelLayout } from '@/app/panel-layout';
import { RefreshScheduler } from '@/app/refresh-scheduler';
import { SearchManager } from '@/app/search-manager';
import { CommandPalette } from '@/app/command-palette';
import { RuntimeConfigPanel } from '@/components/panels/RuntimeConfigPanel';
import { panelRegistry } from '@/components/panels';
import { bindInstallPrompt } from '@/services/install-runtime';

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
    bindInstallPrompt(document.getElementById('vaultum-install-app') as HTMLButtonElement | null);

    await this.dataLoader.bootstrap();
    this.layout.render();
    this.refreshScheduler.start();
  }

  private renderShell(): HTMLElement {
    const shell = document.createElement('div');
    shell.className = 'vaultum-shell';
    shell.innerHTML = `
      <header class="vaultum-header">
        <div class="vaultum-header-brand">
          <img class="vaultum-brand-mark" src="/brand/vaultum-lotus.svg" alt="Vaultum lotus mark" />
          <div>
            <div class="vaultum-eyebrow">VAULTUM TERMINAL</div>
            <h1>Vaultum Intelligence Terminal</h1>
            <div class="vaultum-header-subtitle">Macro, structure, positioning, catalysts, and execution in one desk view.</div>
          </div>
        </div>
        <div class="vaultum-header-actions">
          <button id="vaultum-install-app" class="vaultum-btn" hidden>Install App</button>
          <button id="vaultum-refresh" class="vaultum-btn">Refresh Snapshot</button>
          <button id="vaultum-command-open" class="vaultum-btn vaultum-btn-primary">Command Palette</button>
        </div>
      </header>
      <section class="vaultum-topbar">
        <div class="vaultum-topbar-card"><span class="label">Intent</span><strong id="vaultum-intent">macro regime</strong><em>Active desk mode</em></div>
        <div class="vaultum-topbar-card"><span class="label">Primary Asset</span><strong id="vaultum-primary-asset">XAUUSD</strong><em>Current focus</em></div>
        <div class="vaultum-topbar-card"><span class="label">Runtime</span><strong id="vaultum-update-mode">rpc-backed terminal</strong><em>Execution path</em></div>
        <div class="vaultum-topbar-card"><span class="label">Freshness</span><strong id="vaultum-freshness">booting</strong><em>Snapshot state</em></div>
      </section>
      <section class="vaultum-flow">
        <div class="vaultum-flow-card">
          <span>01 Tape</span>
          <strong>Chart · Brief · Radar</strong>
          <em>Read first</em>
        </div>
        <div class="vaultum-flow-card">
          <span>02 Drivers</span>
          <strong>Macro · FX · Commodities</strong>
          <em>Find the pressure source</em>
        </div>
        <div class="vaultum-flow-card">
          <span>03 Structure</span>
          <strong>Gamma · COT · Liquidity</strong>
          <em>Check pin or expansion</em>
        </div>
        <div class="vaultum-flow-card">
          <span>04 Decision</span>
          <strong>AI · Screener · Journal</strong>
          <em>Act after alignment</em>
        </div>
      </section>
      <section class="vaultum-search">
        <input id="vaultum-search" type="search" placeholder="Search assets, regimes, countries, levels, catalysts, or signals" />
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
