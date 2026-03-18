import type { VaultumAppContext } from '@/app/app-context';

export class SearchManager {
  private container: HTMLElement | null = null;

  constructor(private readonly context: VaultumAppContext) {}

  mount(container: HTMLElement): void {
    this.container = container;
  }

  updateQuery(query: string): void {
    this.context.searchQuery = query.trim();
    this.render();
  }

  render(): void {
    if (!this.container) return;
    const query = this.context.searchQuery.toLowerCase();
    if (!query) {
      this.container.innerHTML = '';
      return;
    }

    const items = (this.context.snapshot?.searchIndex ?? []).filter((item) =>
      `${item.label} ${item.tags.join(' ')}`.toLowerCase().includes(query),
    );

    this.container.innerHTML = items.length
      ? items.slice(0, 8).map((item) => `<div class="vaultum-search-item"><strong>${item.label}</strong><span>${item.kind}</span></div>`).join('')
      : '<div class="vaultum-search-empty">No matching terminal objects.</div>';
  }
}
