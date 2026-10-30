import {
  Plugin,
  ItemView,
  WorkspaceLeaf,
  setIcon,
  debounce,
  Notice,
} from 'obsidian';

const VIEW_TYPE = 'design-panel';

type PanelSection = 'type' | 'scale' | 'color' | 'layout';

interface DesignSettings {
  fontBody: string;
  fontHeading: string;
  bodySizePx: number;
  lineHeight: number;
  h1Em: number;
  h2Em: number;
  h3Em: number;
  h4Em: number;
  h5Em: number;
  h6Em: number;
  h1Color: string;
  h2Color: string;
  h3Color: string;
  bodyColor: string;
  paragraphSpacingEm: number;
  maxWidthPx: number;
  activeSection: PanelSection;
  previewText: string;
}

const DEFAULT_SETTINGS: DesignSettings = {
  fontBody: 'system-ui',
  fontHeading: 'system-ui',
  bodySizePx: 16,
  lineHeight: 1.6,
  h1Em: 2.0,
  h2Em: 1.6,
  h3Em: 1.3,
  h4Em: 1.1,
  h5Em: 1.0,
  h6Em: 0.85,
  h1Color: '',
  h2Color: '',
  h3Color: '',
  bodyColor: '',
  paragraphSpacingEm: 1.0,
  maxWidthPx: 750,
  activeSection: 'type',
  previewText:
    'The quick brown fox jumps over the lazy dog. Design is how it works.',
};

interface FontOption {
  value: string;
  label: string;
  stack: string;
  kind: 'sans' | 'serif' | 'mono' | 'display';
}

const FONT_OPTIONS: FontOption[] = [
  { value: 'system-ui', label: 'System UI', stack: 'system-ui, sans-serif', kind: 'sans' },
  { value: 'Inter', label: 'Inter', stack: 'Inter, system-ui, sans-serif', kind: 'sans' },
  { value: 'Arial', label: 'Arial', stack: 'Arial, Helvetica, sans-serif', kind: 'sans' },
  { value: 'Verdana', label: 'Verdana', stack: 'Verdana, Geneva, sans-serif', kind: 'sans' },
  { value: 'Georgia', label: 'Georgia', stack: 'Georgia, "Times New Roman", serif', kind: 'serif' },
  { value: '"Times New Roman"', label: 'Times New Roman', stack: '"Times New Roman", Times, serif', kind: 'serif' },
  { value: 'Palatino, "Palatino Linotype", serif', label: 'Palatino', stack: 'Palatino, "Palatino Linotype", serif', kind: 'serif' },
  { value: '"Courier New"', label: 'Courier New', stack: '"Courier New", Courier, monospace', kind: 'mono' },
  { value: 'ui-monospace, SFMono-Regular, Menlo, monospace', label: 'System Mono', stack: 'ui-monospace, SFMono-Regular, Menlo, monospace', kind: 'mono' },
];

interface DesignPreset {
  id: string;
  name: string;
  blurb: string;
  patch: Partial<DesignSettings>;
}

const PRESETS: DesignPreset[] = [
  {
    id: 'reading',
    name: 'Reading',
    blurb: 'Comfortable long-form',
    patch: {
      fontBody: 'Georgia',
      fontHeading: 'Georgia',
      bodySizePx: 18,
      lineHeight: 1.7,
      h1Em: 1.9,
      h2Em: 1.5,
      h3Em: 1.25,
      h4Em: 1.1,
      h5Em: 1.0,
      h6Em: 0.9,
      paragraphSpacingEm: 1.15,
      maxWidthPx: 680,
    },
  },
  {
    id: 'compact',
    name: 'Compact',
    blurb: 'Dense notes & lists',
    patch: {
      fontBody: 'system-ui',
      fontHeading: 'system-ui',
      bodySizePx: 14,
      lineHeight: 1.45,
      h1Em: 1.55,
      h2Em: 1.35,
      h3Em: 1.15,
      h4Em: 1.05,
      h5Em: 1.0,
      h6Em: 0.9,
      paragraphSpacingEm: 0.7,
      maxWidthPx: 900,
    },
  },
  {
    id: 'editorial',
    name: 'Editorial',
    blurb: 'Sharp hierarchy',
    patch: {
      fontBody: 'system-ui',
      fontHeading: 'Georgia',
      bodySizePx: 16,
      lineHeight: 1.65,
      h1Em: 2.25,
      h2Em: 1.7,
      h3Em: 1.35,
      h4Em: 1.15,
      h5Em: 1.0,
      h6Em: 0.85,
      paragraphSpacingEm: 1.0,
      maxWidthPx: 720,
    },
  },
  {
    id: 'code',
    name: 'Dev notes',
    blurb: 'Mono-leaning',
    patch: {
      fontBody: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontHeading: 'system-ui',
      bodySizePx: 14,
      lineHeight: 1.55,
      h1Em: 1.5,
      h2Em: 1.3,
      h3Em: 1.15,
      h4Em: 1.05,
      h5Em: 1.0,
      h6Em: 0.9,
      paragraphSpacingEm: 0.85,
      maxWidthPx: 820,
    },
  },
];

const SECTION_META: Record<
  PanelSection,
  { label: string; icon: string }
> = {
  type: { label: 'Type', icon: 'type' },
  scale: { label: 'Scale', icon: 'list-ordered' },
  color: { label: 'Color', icon: 'palette' },
  layout: { label: 'Layout', icon: 'columns' },
};

function fontStack(value: string): string {
  const found = FONT_OPTIONS.find((f) => f.value === value);
  return found?.stack ?? value;
}

function formatNum(n: number, step: number): string {
  if (step >= 1) return String(Math.round(n));
  const decimals = String(step).includes('.')
    ? String(step).split('.')[1].length
    : 1;
  return n.toFixed(decimals);
}

class DesignPanelView extends ItemView {
  plugin: DesignPanelPlugin;
  private rootEl: HTMLElement | null = null;
  private previewEl: HTMLElement | null = null;
  private controlsEl: HTMLElement | null = null;
  private hierarchyHintEl: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: DesignPanelPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Design Panel';
  }

  getIcon(): string {
    return 'paintbrush';
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('design-panel');
    this.rootEl = container;
    this.refreshAll();
  }

  async onClose(): Promise<void> {
    this.rootEl = null;
    this.previewEl = null;
    this.controlsEl = null;
    this.hierarchyHintEl = null;
  }

  refreshAll(): void {
    if (!this.rootEl) return;
    this.rootEl.empty();
    this.build(this.rootEl);
  }

  private build(container: HTMLElement): void {
    this.renderHeader(container);
    this.renderPresets(container);
    this.renderPreview(container);
    this.renderSectionTabs(container);

    this.controlsEl = container.createDiv({ cls: 'dp-controls' });
    this.renderActiveSection();

    this.renderFooter(container);
  }

  // ── Header ────────────────────────────────────────────────

  private renderHeader(container: HTMLElement): void {
    const header = container.createDiv({ cls: 'dp-header' });
    const titleRow = header.createDiv({ cls: 'dp-title-row' });

    const titleBlock = titleRow.createDiv({ cls: 'dp-title-block' });
    titleBlock.createEl('h2', { text: 'Design', cls: 'dp-title' });
    titleBlock.createSpan({
      text: 'Live type, color & layout',
      cls: 'dp-subtitle',
    });

    const actions = titleRow.createDiv({ cls: 'dp-header-actions' });

    const copyBtn = actions.createEl('button', {
      cls: 'dp-icon-btn',
      attr: { 'aria-label': 'Copy CSS', title: 'Copy CSS variables' },
    });
    setIcon(copyBtn, 'copy');
    copyBtn.addEventListener('click', () => {
      void navigator.clipboard.writeText(this.plugin.buildCss());
      new Notice('Design CSS copied');
    });

    const resetBtn = actions.createEl('button', {
      cls: 'dp-icon-btn',
      attr: { 'aria-label': 'Reset all', title: 'Reset all settings' },
    });
    setIcon(resetBtn, 'rotate-ccw');
    resetBtn.addEventListener('click', () => {
      this.plugin.settings = structuredClone(DEFAULT_SETTINGS);
      void this.plugin.saveSettings();
      this.plugin.updateStyles();
      this.refreshAll();
      new Notice('Design reset to defaults');
    });
  }

  // ── Presets ───────────────────────────────────────────────

  private renderPresets(container: HTMLElement): void {
    const strip = container.createDiv({ cls: 'dp-presets' });
    const label = strip.createDiv({ cls: 'dp-presets-label' });
    label.createSpan({ text: 'Presets' });

    const scroller = strip.createDiv({ cls: 'dp-preset-scroller' });
    for (const preset of PRESETS) {
      const card = scroller.createEl('button', {
        cls: 'dp-preset-card',
        attr: { type: 'button' },
      });
      card.createSpan({ text: preset.name, cls: 'dp-preset-name' });
      card.createSpan({ text: preset.blurb, cls: 'dp-preset-blurb' });
      card.addEventListener('click', () => {
        Object.assign(this.plugin.settings, preset.patch);
        void this.plugin.saveSettings();
        this.plugin.updateStyles();
        this.refreshAll();
        new Notice(`Applied “${preset.name}”`);
      });
    }
  }

  // ── Live preview ──────────────────────────────────────────

  private renderPreview(container: HTMLElement): void {
    const wrap = container.createDiv({ cls: 'dp-preview' });
    const top = wrap.createDiv({ cls: 'dp-preview-top' });
    top.createSpan({ text: 'Live preview', cls: 'dp-preview-label' });
    top.createSpan({
      text: this.measureLine(),
      cls: 'dp-preview-meta',
      attr: { 'data-dp-meta': '1' },
    });

    this.previewEl = wrap.createDiv({ cls: 'dp-preview-stage' });
    this.updatePreview();
  }

  private measureLine(): string {
    const s = this.plugin.settings;
    return `${s.bodySizePx}px · ${formatNum(s.lineHeight, 0.1)} · ${s.maxWidthPx}px`;
  }

  updatePreview(): void {
    if (!this.previewEl) return;
    const s = this.plugin.settings;
    const bodyFont = fontStack(s.fontBody);
    const headingFont = fontStack(s.fontHeading || s.fontBody);

    this.previewEl.empty();

    const stage = this.previewEl;
    stage.style.setProperty('--dp-pv-body', bodyFont);
    stage.style.setProperty('--dp-pv-heading', headingFont);
    stage.style.setProperty('--dp-pv-size', `${s.bodySizePx}px`);
    stage.style.setProperty('--dp-pv-lh', String(s.lineHeight));
    stage.style.setProperty('--dp-pv-gap', `${s.paragraphSpacingEm * 0.55}em`);

    const sample = stage.createDiv({ cls: 'dp-preview-sample' });

    const levels: Array<{ key: keyof DesignSettings; em: number; text: string }> = [
      { key: 'h1Color', em: s.h1Em, text: 'Heading one' },
      { key: 'h2Color', em: s.h2Em, text: 'Heading two' },
      { key: 'h3Color', em: s.h3Em, text: 'Heading three' },
    ];

    levels.forEach((level, i) => {
      const h = sample.createDiv({ cls: `dp-pv-h dp-pv-h${i + 1}` });
      h.setText(level.text);
      h.style.fontFamily = 'var(--dp-pv-heading)';
      h.style.fontSize = `calc(var(--dp-pv-size) * ${level.em * 0.72})`;
      h.style.lineHeight = '1.2';
      const color = s[level.key] as string;
      if (color) h.style.color = color;
      h.addEventListener('click', () => {
        this.plugin.settings.activeSection = 'scale';
        void this.plugin.saveSettings();
        this.refreshAll();
      });
    });

    const body = sample.createDiv({ cls: 'dp-pv-body' });
    body.setText(s.previewText);
    body.style.fontFamily = 'var(--dp-pv-body)';
    body.style.fontSize = 'var(--dp-pv-size)';
    body.style.lineHeight = 'var(--dp-pv-lh)';
    if (s.bodyColor) body.style.color = s.bodyColor;
    body.contentEditable = 'true';
    body.spellcheck = false;
    body.addEventListener('click', () => {
      if (this.plugin.settings.activeSection !== 'type') {
        this.plugin.settings.activeSection = 'type';
        void this.plugin.saveSettings();
        this.refreshAll();
      }
    });
    body.addEventListener('blur', () => {
      const text = body.textContent?.trim() || '';
      if (text && text !== s.previewText) {
        s.previewText = text;
        void this.plugin.saveSettings();
      }
    });

    // width gutter visualization
    const widthBar = stage.createDiv({ cls: 'dp-preview-width' });
    const track = widthBar.createDiv({ cls: 'dp-width-track' });
    const fill = track.createDiv({ cls: 'dp-width-fill' });
    const pct = Math.min(100, Math.max(18, ((s.maxWidthPx - 500) / 700) * 100));
    fill.style.width = `${pct}%`;
    widthBar.createSpan({
      text: `Measure ${s.maxWidthPx}px`,
      cls: 'dp-width-label',
    });

    const meta = this.rootEl?.querySelector('[data-dp-meta]') as HTMLElement | null;
    if (meta) meta.setText(this.measureLine());
  }

  // ── Section tabs ──────────────────────────────────────────

  private renderSectionTabs(container: HTMLElement): void {
    const tabs = container.createDiv({ cls: 'dp-section-tabs', attr: { role: 'tablist' } });
    (Object.keys(SECTION_META) as PanelSection[]).forEach((id) => {
      const meta = SECTION_META[id];
      const btn = tabs.createEl('button', {
        cls:
          'dp-section-tab' +
          (this.plugin.settings.activeSection === id ? ' is-active' : ''),
        attr: {
          type: 'button',
          role: 'tab',
          'aria-selected': String(this.plugin.settings.activeSection === id),
        },
      });
      const icon = btn.createSpan({ cls: 'dp-section-icon' });
      setIcon(icon, meta.icon);
      btn.createSpan({ text: meta.label });
      btn.addEventListener('click', () => {
        this.plugin.settings.activeSection = id;
        void this.plugin.saveSettings();
        this.syncSectionTabs();
        this.renderActiveSection();
      });
    });
  }

  private syncSectionTabs(): void {
    if (!this.rootEl) return;
    const active = this.plugin.settings.activeSection;
    this.rootEl.querySelectorAll('.dp-section-tab').forEach((el, i) => {
      const ids: PanelSection[] = ['type', 'scale', 'color', 'layout'];
      const id = ids[i];
      el.classList.toggle('is-active', id === active);
      el.setAttribute('aria-selected', String(id === active));
    });
  }

  private renderActiveSection(): void {
    if (!this.controlsEl) return;
    this.controlsEl.empty();
    this.hierarchyHintEl = null;

    const section = this.plugin.settings.activeSection;
    if (section === 'type') this.renderTypeSection(this.controlsEl);
    else if (section === 'scale') this.renderScaleSection(this.controlsEl);
    else if (section === 'color') this.renderColorSection(this.controlsEl);
    else this.renderLayoutSection(this.controlsEl);
  }

  // ── Type section ──────────────────────────────────────────

  private renderTypeSection(container: HTMLElement): void {
    const card = container.createDiv({ cls: 'dp-card' });
    card.createDiv({ cls: 'dp-card-title', text: 'Families' });

    this.addFontSelect(card, 'Body', 'fontBody', false);
    this.addFontSelect(card, 'Headings', 'fontHeading', true);

    const metrics = container.createDiv({ cls: 'dp-card' });
    metrics.createDiv({ cls: 'dp-card-title', text: 'Body metrics' });
    this.addSlider(metrics, 'Size', 'bodySizePx', 12, 24, 'px', 1);
    this.addSlider(metrics, 'Line height', 'lineHeight', 1.2, 2.2, '', 0.05);
  }

  // ── Scale section ─────────────────────────────────────────

  private renderScaleSection(container: HTMLElement): void {
    const card = container.createDiv({ cls: 'dp-card' });
    const titleRow = card.createDiv({ cls: 'dp-card-title-row' });
    titleRow.createDiv({ cls: 'dp-card-title', text: 'Heading scale' });
    titleRow.createSpan({
      text: 'Relative to body',
      cls: 'dp-card-hint',
    });

    // Visual scale bars
    const chart = card.createDiv({ cls: 'dp-scale-chart' });
    for (let level = 1; level <= 6; level++) {
      const key = `h${level}Em` as keyof DesignSettings;
      const em = this.plugin.settings[key] as number;
      const row = chart.createDiv({ cls: 'dp-scale-row' });
      row.createSpan({ text: `H${level}`, cls: 'dp-scale-tag' });
      const bar = row.createDiv({ cls: 'dp-scale-bar' });
      const fill = bar.createDiv({ cls: 'dp-scale-fill' });
      const pct = Math.min(100, Math.max(8, ((em - 0.7) / 2.8) * 100));
      fill.style.width = `${pct}%`;
      fill.style.opacity = String(0.45 + (7 - level) * 0.09);
      row.createSpan({ text: `${formatNum(em, 0.05)}em`, cls: 'dp-scale-val' });
    }

    this.hierarchyHintEl = card.createDiv({ cls: 'dp-hierarchy-hint' });
    this.updateHierarchyHint();

    for (let level = 1; level <= 6; level++) {
      this.addHeadingSlider(card, level);
    }

    const actions = card.createDiv({ cls: 'dp-inline-actions' });
    const smoothBtn = actions.createEl('button', {
      text: 'Smooth scale',
      cls: 'dp-btn dp-btn-secondary',
      attr: { type: 'button', title: 'Generate a clean modular scale from H1 → H6' },
    });
    smoothBtn.addEventListener('click', () => {
      this.applySmoothScale();
    });
  }

  private applySmoothScale(): void {
    // Modular scale from h1 down with ratio ~1.2, anchored at h1
    const h1 = this.plugin.settings.h1Em;
    const ratio = 1.2;
    const keys: Array<keyof DesignSettings> = [
      'h1Em',
      'h2Em',
      'h3Em',
      'h4Em',
      'h5Em',
      'h6Em',
    ];
    keys.forEach((key, i) => {
      const val = Math.round((h1 / Math.pow(ratio, i)) * 100) / 100;
      (this.plugin.settings[key] as number) = Math.max(0.8, Math.min(3.5, val));
    });
    void this.plugin.saveSettings();
    this.plugin.updateStyles();
    this.updatePreview();
    this.renderActiveSection();
    new Notice('Applied smooth modular scale');
  }

  private updateHierarchyHint(): void {
    if (!this.hierarchyHintEl) return;
    const s = this.plugin.settings;
    const sizes = [s.h1Em, s.h2Em, s.h3Em, s.h4Em, s.h5Em, s.h6Em];
    const breaks: string[] = [];
    for (let i = 0; i < sizes.length - 1; i++) {
      if (sizes[i] < sizes[i + 1] - 0.001) {
        breaks.push(`H${i + 1} < H${i + 2}`);
      }
    }
    this.hierarchyHintEl.empty();
    if (breaks.length === 0) {
      this.hierarchyHintEl.addClass('is-ok');
      this.hierarchyHintEl.removeClass('is-warn');
      const icon = this.hierarchyHintEl.createSpan({ cls: 'dp-hint-icon' });
      setIcon(icon, 'check');
      this.hierarchyHintEl.createSpan({ text: 'Hierarchy looks consistent' });
    } else {
      this.hierarchyHintEl.addClass('is-warn');
      this.hierarchyHintEl.removeClass('is-ok');
      const icon = this.hierarchyHintEl.createSpan({ cls: 'dp-hint-icon' });
      setIcon(icon, 'alert-triangle');
      this.hierarchyHintEl.createSpan({
        text: `Inverted: ${breaks.join(', ')}`,
      });
    }
  }

  // ── Color section ─────────────────────────────────────────

  private renderColorSection(container: HTMLElement): void {
    const card = container.createDiv({ cls: 'dp-card' });
    card.createDiv({ cls: 'dp-card-title', text: 'Text colors' });
    card.createDiv({
      cls: 'dp-card-desc',
      text: 'Leave empty to inherit the active theme color.',
    });

    this.addColorControl(card, 'Body text', 'bodyColor');
    this.addColorControl(card, 'H1', 'h1Color');
    this.addColorControl(card, 'H2', 'h2Color');
    this.addColorControl(card, 'H3', 'h3Color');

    const swatches = container.createDiv({ cls: 'dp-card' });
    swatches.createDiv({ cls: 'dp-card-title', text: 'Quick swatches' });
    const grid = swatches.createDiv({ cls: 'dp-swatch-grid' });
    const palette = [
      '#e8e6e3',
      '#c4c0b8',
      '#8b8680',
      '#f5f0e8',
      '#d4a574',
      '#7a9e7e',
      '#6b8cae',
      '#c17b7b',
      '#1a1a1a',
      '#0d0d0d',
    ];
    for (const hex of palette) {
      const sw = grid.createEl('button', {
        cls: 'dp-swatch',
        attr: {
          type: 'button',
          title: hex,
          'aria-label': `Apply ${hex} to body`,
          style: `background:${hex}`,
        },
      });
      sw.addEventListener('click', () => {
        this.plugin.settings.bodyColor = hex;
        void this.plugin.persistAndApply();
        this.updatePreview();
        this.renderActiveSection();
      });
    }
  }

  // ── Layout section ────────────────────────────────────────

  private renderLayoutSection(container: HTMLElement): void {
    const card = container.createDiv({ cls: 'dp-card' });
    card.createDiv({ cls: 'dp-card-title', text: 'Measure & spacing' });
    this.addSlider(card, 'Paragraph gap', 'paragraphSpacingEm', 0.4, 2.4, 'em', 0.05);
    this.addSlider(card, 'Max width', 'maxWidthPx', 520, 1200, 'px', 10);

    const tips = container.createDiv({ cls: 'dp-card dp-tips' });
    tips.createDiv({ cls: 'dp-card-title', text: 'Reading tips' });
    const list = tips.createEl('ul', { cls: 'dp-tip-list' });
    list.createEl('li', {
      text: '45–75 characters per line is ideal — usually ~650–750px at 16px.',
    });
    list.createEl('li', {
      text: 'Line height around 1.5–1.7 keeps long notes comfortable.',
    });
    list.createEl('li', {
      text: 'Pair a distinct heading face with a quiet body face for hierarchy.',
    });
  }

  // ── Footer ────────────────────────────────────────────────

  private renderFooter(container: HTMLElement): void {
    const footer = container.createDiv({ cls: 'dp-footer' });

    const left = footer.createDiv({ cls: 'dp-footer-left' });
    left.createSpan({
      text: 'Changes apply live to the vault',
      cls: 'dp-footer-note',
    });

    const right = footer.createDiv({ cls: 'dp-footer-right' });
    const defaultsBtn = right.createEl('button', {
      text: 'Defaults',
      cls: 'dp-btn dp-btn-ghost',
      attr: { type: 'button' },
    });
    defaultsBtn.addEventListener('click', () => {
      this.plugin.settings = structuredClone(DEFAULT_SETTINGS);
      void this.plugin.saveSettings();
      this.plugin.updateStyles();
      this.refreshAll();
    });

    const copyBtn = right.createEl('button', {
      text: 'Copy CSS',
      cls: 'dp-btn dp-btn-primary',
      attr: { type: 'button' },
    });
    copyBtn.addEventListener('click', () => {
      void navigator.clipboard.writeText(this.plugin.buildCss());
      new Notice('Design CSS copied');
    });
  }

  // ── Controls ──────────────────────────────────────────────

  private addFontSelect(
    container: HTMLElement,
    label: string,
    key: 'fontBody' | 'fontHeading',
    allowSameAsBody: boolean
  ): void {
    const row = container.createDiv({ cls: 'dp-row' });
    row.createEl('label', { text: label, cls: 'dp-row-label' });

    const field = row.createDiv({ cls: 'dp-row-field' });
    const select = field.createEl('select', { cls: 'dp-select' });

    if (allowSameAsBody) {
      const same = select.createEl('option', {
        text: 'Same as body',
        value: '',
      });
      if (this.plugin.settings.fontHeading === '') same.selected = true;
    }

    for (const font of FONT_OPTIONS) {
      const opt = select.createEl('option', {
        text: font.label,
        value: font.value,
      });
      opt.style.fontFamily = font.stack;
      if (this.plugin.settings[key] === font.value) opt.selected = true;
    }

    // Live face on the select itself
    const current =
      key === 'fontHeading' && !this.plugin.settings.fontHeading
        ? this.plugin.settings.fontBody
        : this.plugin.settings[key];
    select.style.fontFamily = fontStack(current);

    select.addEventListener('change', () => {
      this.plugin.settings[key] = select.value;
      select.style.fontFamily = fontStack(
        key === 'fontHeading' && !select.value
          ? this.plugin.settings.fontBody
          : select.value
      );
      void this.plugin.persistAndApply();
      this.updatePreview();
    });
  }

  private addSlider(
    container: HTMLElement,
    label: string,
    key: keyof DesignSettings,
    min: number,
    max: number,
    unit: string,
    step: number = 1
  ): void {
    const row = container.createDiv({ cls: 'dp-row dp-row-slider' });
    const head = row.createDiv({ cls: 'dp-slider-head' });
    head.createEl('label', { text: label, cls: 'dp-row-label' });

    const valueBtn = head.createEl('button', {
      cls: 'dp-value-chip',
      attr: { type: 'button', title: 'Click to type a value' },
    });
    const value = this.plugin.settings[key] as number;
    valueBtn.setText(`${formatNum(value, step)}${unit}`);

    const track = row.createDiv({ cls: 'dp-slider-track' });
    const input = track.createEl('input', {
      type: 'range',
      cls: 'dp-slider',
    }) as HTMLInputElement;
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.setAttribute('aria-label', label);

    const apply = (raw: number) => {
      const clamped = Math.min(max, Math.max(min, raw));
      const rounded =
        step >= 1
          ? Math.round(clamped)
          : Math.round(clamped / step) * step;
      const final = Math.round(rounded * 1000) / 1000;
      (this.plugin.settings[key] as number) = final;
      input.value = String(final);
      const chip = head.querySelector('.dp-value-chip') as HTMLElement | null;
      if (chip) chip.setText(`${formatNum(final, step)}${unit}`);
      void this.plugin.persistAndApply();
      this.updatePreview();
      if (String(key).startsWith('h') && String(key).endsWith('Em')) {
        this.updateHierarchyHint();
        this.syncScaleChart();
      }
    };

    input.addEventListener('input', () => {
      apply(parseFloat(input.value));
    });

    const bindChip = (chip: HTMLElement) => {
      chip.addEventListener('click', () => {
        const shown = parseFloat(chip.textContent || String(value));
        this.openInlineEdit(
          chip,
          Number.isNaN(shown) ? (this.plugin.settings[key] as number) : shown,
          unit,
          min,
          max,
          step,
          apply,
          (nextChip) => bindChip(nextChip)
        );
      });
    };
    bindChip(valueBtn);
  }

  private addHeadingSlider(container: HTMLElement, level: number): void {
    const key = `h${level}Em` as keyof DesignSettings;
    this.addSlider(container, `H${level}`, key, 0.8, 3.5, 'em', 0.05);
  }

  private syncScaleChart(): void {
    if (!this.controlsEl) return;
    const s = this.plugin.settings;
    const rows = this.controlsEl.querySelectorAll('.dp-scale-row');
    rows.forEach((row, i) => {
      const em = s[`h${i + 1}Em` as keyof DesignSettings] as number;
      const fill = row.querySelector('.dp-scale-fill') as HTMLElement | null;
      const val = row.querySelector('.dp-scale-val') as HTMLElement | null;
      if (fill) {
        const pct = Math.min(100, Math.max(8, ((em - 0.7) / 2.8) * 100));
        fill.style.width = `${pct}%`;
      }
      if (val) val.setText(`${formatNum(em, 0.05)}em`);
    });
  }

  private addColorControl(
    container: HTMLElement,
    label: string,
    key: keyof DesignSettings
  ): void {
    const row = container.createDiv({ cls: 'dp-row dp-row-color' });
    row.createEl('label', { text: label, cls: 'dp-row-label' });

    const field = row.createDiv({ cls: 'dp-color-field' });
    const stored = (this.plugin.settings[key] as string) || '';
    const isTheme = !stored;

    const swatchWrap = field.createDiv({
      cls: 'dp-color-swatch-wrap' + (isTheme ? ' is-theme' : ''),
    });
    const picker = swatchWrap.createEl('input', {
      type: 'color',
      cls: 'dp-color-picker',
      attr: { 'aria-label': `${label} color` },
    }) as HTMLInputElement;
    // Theme default: show a neutral mid gray rather than pure black
    picker.value = stored || '#888888';

    const hex = field.createEl('input', {
      type: 'text',
      cls: 'dp-hex-input',
      attr: {
        placeholder: 'Theme',
        spellcheck: 'false',
        'aria-label': `${label} hex`,
      },
    }) as HTMLInputElement;
    hex.value = stored;

    const clearBtn = field.createEl('button', {
      cls: 'dp-icon-btn dp-clear-color',
      attr: {
        type: 'button',
        title: 'Use theme default',
        'aria-label': 'Use theme default',
      },
    });
    setIcon(clearBtn, 'x');
    clearBtn.toggleClass('is-disabled', isTheme);

    const commit = (value: string) => {
      const cleaned = value.trim();
      if (!cleaned) {
        (this.plugin.settings[key] as string) = '';
      } else {
        const normalized = cleaned.startsWith('#') ? cleaned : `#${cleaned}`;
        if (!/^#[0-9a-fA-F]{3,8}$/.test(normalized)) return;
        (this.plugin.settings[key] as string) = normalized;
        picker.value = normalized.length === 4
          ? `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`
          : normalized.slice(0, 7);
      }
      hex.value = this.plugin.settings[key] as string;
      const empty = !(this.plugin.settings[key] as string);
      swatchWrap.toggleClass('is-theme', empty);
      clearBtn.toggleClass('is-disabled', empty);
      void this.plugin.persistAndApply();
      this.updatePreview();
    };

    picker.addEventListener('input', () => commit(picker.value));
    hex.addEventListener('change', () => commit(hex.value));
    hex.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit(hex.value);
        hex.blur();
      }
    });
    clearBtn.addEventListener('click', () => {
      if (clearBtn.hasClass('is-disabled')) return;
      commit('');
    });
  }

  private openInlineEdit(
    anchor: HTMLElement,
    current: number,
    unit: string,
    min: number,
    max: number,
    step: number,
    onCommit: (n: number) => void,
    onRebind?: (chip: HTMLElement) => void
  ): void {
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'dp-value-edit';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = formatNum(current, step);
    anchor.replaceWith(input);
    input.focus();
    input.select();

    let closed = false;
    const finish = (commit: boolean) => {
      if (closed) return;
      closed = true;
      const next = parseFloat(input.value);
      let display = current;
      if (commit && !Number.isNaN(next)) {
        const clamped = Math.min(max, Math.max(min, next));
        onCommit(clamped);
        display = clamped;
      }
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'dp-value-chip';
      chip.title = 'Click to type a value';
      chip.textContent = `${formatNum(display, step)}${unit}`;
      input.replaceWith(chip);
      if (onRebind) onRebind(chip);
      else {
        chip.addEventListener('click', () => {
          this.openInlineEdit(chip, display, unit, min, max, step, onCommit);
        });
      }
    };

    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(true));
  }
}

export default class DesignPanelPlugin extends Plugin {
  settings: DesignSettings;
  styleEl: HTMLStyleElement | null = null;
  private persistDebounced = debounce(
    () => {
      void this.saveSettings();
    },
    180,
    true
  );

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(
      VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new DesignPanelView(leaf, this)
    );

    this.addRibbonIcon('paintbrush', 'Design Panel', () => {
      void this.activateView();
    });

    this.addCommand({
      id: 'open-panel',
      name: 'Open Design Panel',
      callback: () => {
        void this.activateView();
      },
    });

    this.addCommand({
      id: 'copy-design-css',
      name: 'Copy Design Panel CSS',
      callback: () => {
        void navigator.clipboard.writeText(this.buildCss());
        new Notice('Design CSS copied');
      },
    });

    this.styleEl = document.createElement('style');
    this.styleEl.id = 'design-panel-styles';
    document.head.appendChild(this.styleEl);

    this.updateStyles();
  }

  onunload(): void {
    this.styleEl?.remove();
    this.styleEl = null;
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false)!;
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf);
  }

  async persistAndApply(): Promise<void> {
    this.updateStyles();
    this.persistDebounced();
  }

  buildCss(): string {
    const {
      fontBody,
      fontHeading,
      bodySizePx,
      lineHeight,
      h1Em,
      h2Em,
      h3Em,
      h4Em,
      h5Em,
      h6Em,
      h1Color,
      h2Color,
      h3Color,
      bodyColor,
      paragraphSpacingEm,
      maxWidthPx,
    } = this.settings;

    const headingFont = fontHeading || fontBody;
    const bodyStack = fontStack(fontBody);
    const headingStack = fontStack(headingFont);

    let css = `/* Design Panel — generated ${new Date().toISOString().slice(0, 10)} */
:root {
  --dp-font-body: ${bodyStack};
  --dp-font-heading: ${headingStack};
  --dp-body-size: ${bodySizePx}px;
  --dp-line-height: ${lineHeight};
  --dp-h1-size: ${h1Em}em;
  --dp-h2-size: ${h2Em}em;
  --dp-h3-size: ${h3Em}em;
  --dp-h4-size: ${h4Em}em;
  --dp-h5-size: ${h5Em}em;
  --dp-h6-size: ${h6Em}em;
  --dp-paragraph-spacing: ${paragraphSpacingEm}em;
  --dp-max-width: ${maxWidthPx}px;
}

.markdown-source-view,
.markdown-preview-view {
  --h1-size: var(--dp-h1-size);
  --h2-size: var(--dp-h2-size);
  --h3-size: var(--dp-h3-size);
  --h4-size: var(--dp-h4-size);
  --h5-size: var(--dp-h5-size);
  --h6-size: var(--dp-h6-size);
  font-family: var(--dp-font-body);
  font-size: var(--dp-body-size);
  line-height: var(--dp-line-height);
}

.markdown-source-view h1,
.markdown-source-view h2,
.markdown-source-view h3,
.markdown-source-view h4,
.markdown-source-view h5,
.markdown-source-view h6,
.markdown-preview-view h1,
.markdown-preview-view h2,
.markdown-preview-view h3,
.markdown-preview-view h4,
.markdown-preview-view h5,
.markdown-preview-view h6 {
  font-family: var(--dp-font-heading);
}

.markdown-preview-view p,
.markdown-source-view p {
  margin-bottom: var(--dp-paragraph-spacing);
}

.markdown-preview-view,
.markdown-source-view {
  max-width: var(--dp-max-width);
}
`;

    if (h1Color)
      css += `.markdown-source-view h1, .markdown-preview-view h1 { color: ${h1Color}; }\n`;
    if (h2Color)
      css += `.markdown-source-view h2, .markdown-preview-view h2 { color: ${h2Color}; }\n`;
    if (h3Color)
      css += `.markdown-source-view h3, .markdown-preview-view h3 { color: ${h3Color}; }\n`;
    if (bodyColor)
      css += `.markdown-source-view, .markdown-preview-view { color: ${bodyColor}; }\n`;

    return css;
  }

  updateStyles(): void {
    if (!this.styleEl) return;
    this.styleEl.textContent = this.buildCss();

    // Refresh open panel previews without full rebuild when possible
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof DesignPanelView) {
        view.updatePreview();
      }
    }
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign(
      {},
      structuredClone(DEFAULT_SETTINGS),
      await this.loadData()
    );
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
