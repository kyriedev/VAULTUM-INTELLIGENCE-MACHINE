import type { VaultumAppContext } from '@/app/app-context';
import type { PanelComponent } from '@/components/base/panel';

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
    this.registered.forEach((panel) => {
      this.container?.appendChild(panel.render());
    });
  }
}
