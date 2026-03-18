import type { VaultumAppContext } from '@/app/app-context';
import { SearchManager } from '@/app/search-manager';

export class CommandPalette {
  private container: HTMLElement | null = null;
  private isOpen = false;

  constructor(
    private readonly context: VaultumAppContext,
    private readonly searchManager: SearchManager,
  ) {}

  mount(container: HTMLElement): void {
    this.container = container;
    this.render();
    window.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        this.toggle();
      }
    });
  }

  toggle(): void {
    this.isOpen = !this.isOpen;
    this.render();
  }

  private render(): void {
    if (!this.container) return;
    this.container.innerHTML = this.isOpen ? `
      <div class="vaultum-command-overlay">
        <div class="vaultum-command-modal">
          <div class="vaultum-command-header">
            <strong>VAULTUM Command Palette</strong>
            <button id="vaultum-command-close" class="vaultum-btn">Close</button>
          </div>
          <div class="vaultum-command-body">
            <button class="vaultum-command-item" data-intent="macro-regime">Focus macro regime</button>
            <button class="vaultum-command-item" data-intent="geopolitical-impact">Focus geopolitical impact</button>
            <button class="vaultum-command-item" data-intent="options-gamma-positioning">Focus options pressure</button>
            <button class="vaultum-command-item" data-intent="cross-asset-correlation">Focus cross-asset</button>
          </div>
        </div>
      </div>
    ` : '';

    this.container.querySelector('#vaultum-command-close')?.addEventListener('click', () => this.toggle());
    this.container.querySelectorAll<HTMLButtonElement>('.vaultum-command-item').forEach((button) => {
      button.addEventListener('click', () => {
        this.context.activeIntent = button.dataset.intent as typeof this.context.activeIntent;
        const intentEl = document.getElementById('vaultum-intent');
        if (intentEl) intentEl.textContent = this.context.activeIntent.replace(/-/g, ' ');
        this.searchManager.render();
        this.toggle();
      });
    });
  }
}
