export type LayoutTone = 'neutral' | 'bullish' | 'bearish' | 'alert' | 'mixed';
export type LayoutCardSize = 'normal' | 'wide' | 'full';

type PanelShellOptions = {
  content: string;
  className?: string;
};

type SectionStackOptions = {
  content: string;
  className?: string;
  title?: string;
  description?: string;
  meta?: string;
};

type ResponsiveCardGridOptions = {
  content: string;
  className?: string;
  minWidth?: string;
};

type ModuleCardOptions = {
  id: string;
  label: string;
  title: string;
  description?: string;
  content: string;
  tone?: LayoutTone;
  size?: LayoutCardSize;
  collapsible?: boolean;
  collapsed?: boolean;
  scrollable?: boolean;
  className?: string;
  actions?: string;
};

type ChartDockOptions = {
  title: string;
  description?: string;
  cards: string[];
  className?: string;
};

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function renderPanelShell({ content, className = '' }: PanelShellOptions): string {
  return `<div class="vaultum-panel-shell${className ? ` ${className}` : ''}">${content}</div>`;
}

export function renderSectionStack({
  content,
  className = '',
  title,
  description,
  meta,
}: SectionStackOptions): string {
  const head = title || description || meta
    ? `
      <div class="vaultum-section-stack-head">
        <div class="vaultum-section-stack-copy">
          ${title ? `<strong>${escapeHtml(title)}</strong>` : ''}
          ${description ? `<span>${escapeHtml(description)}</span>` : ''}
        </div>
        ${meta ? `<em>${escapeHtml(meta)}</em>` : ''}
      </div>
    `
    : '';

  return `
    <section class="vaultum-section-stack${className ? ` ${className}` : ''}">
      ${head}
      ${content}
    </section>
  `;
}

export function renderResponsiveCardGrid({
  content,
  className = '',
  minWidth = '220px',
}: ResponsiveCardGridOptions): string {
  return `
    <div class="vaultum-responsive-card-grid${className ? ` ${className}` : ''}" style="--vaultum-grid-min: ${minWidth};">
      ${content}
    </div>
  `;
}

export function renderModuleCard({
  id,
  label,
  title,
  description,
  content,
  tone = 'neutral',
  size = 'normal',
  collapsible = false,
  collapsed = false,
  scrollable = false,
  className = '',
  actions = '',
}: ModuleCardOptions): string {
  const sizeClass = size === 'wide'
    ? ' is-wide'
    : size === 'full'
      ? ' is-full'
      : '';
  const collapseAction = collapsible
    ? `<button type="button" class="vaultum-module-toggle" data-module-toggle="${escapeHtml(id)}" aria-expanded="${collapsed ? 'false' : 'true'}">${collapsed ? 'Expand' : 'Collapse'}</button>`
    : '';

  return `
    <article class="vaultum-module-card is-${tone}${sizeClass}${scrollable ? ' has-scroll' : ''}${collapsed ? ' is-collapsed' : ''}${className ? ` ${className}` : ''}" data-module-card="${escapeHtml(id)}">
      <div class="vaultum-module-card-header">
        <div class="vaultum-module-card-copy">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(title)}</strong>
          ${description ? `<em>${escapeHtml(description)}</em>` : ''}
        </div>
        ${collapseAction || actions ? `<div class="vaultum-module-card-actions">${collapseAction}${actions}</div>` : ''}
      </div>
      <div class="vaultum-module-card-body${scrollable ? ' is-scrollable' : ''}">
        ${content}
      </div>
    </article>
  `;
}

export function renderChartDock({ title, description, cards, className = '' }: ChartDockOptions): string {
  return `
    <section class="vaultum-chart-dock${className ? ` ${className}` : ''}" data-dock-mode="docked">
      <div class="vaultum-chart-dock-head">
        <div class="vaultum-chart-dock-copy">
          <span>Chart intelligence dock</span>
          <strong>${escapeHtml(title)}</strong>
        </div>
        ${description ? `<em>${escapeHtml(description)}</em>` : ''}
      </div>
      ${renderResponsiveCardGrid({
        content: cards.join(''),
        className: 'vaultum-chart-dock-grid',
        minWidth: '220px',
      })}
    </section>
  `;
}
