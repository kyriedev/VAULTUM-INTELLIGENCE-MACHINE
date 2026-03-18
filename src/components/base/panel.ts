import type { PanelDefinition } from '@/types';

export interface PanelComponent {
  readonly definition: PanelDefinition;
  render(): HTMLElement;
}

export abstract class BasePanel implements PanelComponent {
  constructor(public readonly definition: PanelDefinition) {}

  render(): HTMLElement {
    const panel = document.createElement('section');
    panel.className = `vaultum-panel ${this.definition.tone ?? 'neutral'}`;
    panel.innerHTML = `
      <div class="vaultum-panel-header">
        <div>
          <div class="vaultum-panel-kicker">${this.definition.kicker}</div>
          <h2>${this.definition.title}</h2>
        </div>
        <div class="vaultum-panel-tag">${this.definition.tag}</div>
      </div>
      <div class="vaultum-panel-body">${this.renderBody()}</div>
    `;

    window.addEventListener('vaultum:snapshot-updated', () => {
      const body = panel.querySelector('.vaultum-panel-body');
      if (body) body.innerHTML = this.renderBody();
    });

    return panel;
  }

  protected abstract renderBody(): string;
}
