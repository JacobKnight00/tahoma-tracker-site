// Metadata Display Component
// Renders the sidebar card for model info and daily stats.

import { formatPercent, snakeToTitle } from '../utils/format.js';
import { createElement, clearElement } from '../utils/dom.js';

const DESKTOP_MEDIA_QUERY = '(min-width: 1024px)';
const DESKTOP_LAYOUT = 'desktop';
const MOBILE_LAYOUT = 'mobile';

export class MetadataDisplay {
  constructor(containerElement) {
    this.container = containerElement;
    this.modelData = null;
    this.statsData = null;
    this.activePanel = null;
    this.layoutMode = MOBILE_LAYOUT;
    this.elements = null;

    this.handleLayoutChange = this.handleLayoutChange.bind(this);

    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      this.desktopMediaQuery = window.matchMedia(DESKTOP_MEDIA_QUERY);
      this.layoutMode = this.desktopMediaQuery.matches ? DESKTOP_LAYOUT : MOBILE_LAYOUT;

      if (typeof this.desktopMediaQuery.addEventListener === 'function') {
        this.desktopMediaQuery.addEventListener('change', this.handleLayoutChange);
      } else if (typeof this.desktopMediaQuery.addListener === 'function') {
        this.desktopMediaQuery.addListener(this.handleLayoutChange);
      }
    } else {
      this.desktopMediaQuery = null;
      this.layoutMode = DESKTOP_LAYOUT;
    }
  }

  render(data) {
    this.modelData = data || null;
    this.renderPanel();
  }

  setStats(statsData) {
    this.statsData = statsData || null;
    this.renderPanel();
  }

  getLayoutMode() {
    return this.desktopMediaQuery?.matches ? DESKTOP_LAYOUT : MOBILE_LAYOUT;
  }

  handleLayoutChange() {
    this.layoutMode = this.getLayoutMode();
    this.renderPanel();
  }

  togglePanel(panelName) {
    const hasStats = Boolean(this.statsData);
    const hasModel = Boolean(this.modelData);
    const hasPanel = panelName === 'stats' ? hasStats : hasModel;
    if (!hasPanel) {
      return;
    }

    if (this.layoutMode === DESKTOP_LAYOUT) {
      if (this.activePanel !== panelName) {
        this.activePanel = panelName;
        this.renderPanel();
      }
      return;
    }

    this.activePanel = this.activePanel === panelName ? null : panelName;
    this.renderPanel();
  }

  renderPanel() {
    const modelPanel = this.buildModelPanel();
    const statsPanel = this.statsData;
    const hasModel = Boolean(modelPanel);
    const hasStats = Boolean(statsPanel);
    const previousLayout = this.captureLayoutPositions();

    if (!hasModel && !hasStats) {
      clearElement(this.container);
      this.elements = null;
      this.activePanel = null;
      return;
    }

    this.layoutMode = this.getLayoutMode();
    this.syncActivePanel(hasStats, hasModel);
    this.ensureShell();

    let activePanel = null;
    if (this.activePanel === 'stats') {
      activePanel = statsPanel;
    } else if (this.activePanel === 'model') {
      activePanel = modelPanel;
    }
    const isStatsActive = this.activePanel === 'stats';
    const isModelActive = this.activePanel === 'model';
    const isDesktop = this.layoutMode === DESKTOP_LAYOUT;

    this.elements.root.classList.toggle('info-panel--desktop', isDesktop);
    this.elements.root.classList.toggle('info-panel--mobile', !isDesktop);
    this.elements.root.classList.toggle('info-panel--stats-active', isStatsActive);
    this.elements.root.classList.toggle('info-panel--model-active', isModelActive);
    this.elements.root.classList.toggle('info-panel--collapsed', !activePanel);

    this.updateToggle({
      toggle: this.elements.statsToggle,
      label: this.elements.statsLabel,
      chevron: this.elements.statsChevron,
      title: statsPanel?.title || "Today's Stats",
      isAvailable: hasStats,
      isActive: isStatsActive,
      hasAlternatePanel: hasModel,
      isDesktop,
    });

    this.updateToggle({
      toggle: this.elements.modelToggle,
      label: this.elements.modelLabel,
      chevron: this.elements.modelChevron,
      title: modelPanel?.title || 'Model Info',
      isAvailable: hasModel,
      isActive: isModelActive,
      hasAlternatePanel: hasStats,
      isDesktop,
    });

    this.renderContent(activePanel);
    this.positionContent(activePanel);
    this.animateLayoutChange(previousLayout);
  }

  syncActivePanel(hasStats, hasModel) {
    if (this.layoutMode === DESKTOP_LAYOUT) {
      if (this.activePanel === 'stats' && !hasStats) {
        this.activePanel = hasModel ? 'model' : null;
      } else if (this.activePanel === 'model' && !hasModel) {
        this.activePanel = hasStats ? 'stats' : null;
      } else if (!this.activePanel) {
        this.activePanel = hasStats ? 'stats' : (hasModel ? 'model' : null);
      }
      return;
    }

    if ((this.activePanel === 'stats' && !hasStats) || (this.activePanel === 'model' && !hasModel)) {
      this.activePanel = null;
    }
  }

  ensureShell() {
    if (this.elements) {
      return;
    }

    clearElement(this.container);

    const root = createElement('div', { class: 'info-panel' });

    const statsLabel = createElement('span', { class: 'info-panel__toggle-label' });
    const statsChevron = createElement('span', { class: 'info-panel__chevron' });
    const statsToggle = createElement('button', {
      class: 'info-panel__toggle info-panel__toggle--stats',
      type: 'button',
      onClick: () => this.togglePanel('stats'),
    }, [statsLabel, statsChevron]);

    const modelLabel = createElement('span', { class: 'info-panel__toggle-label' });
    const modelChevron = createElement('span', { class: 'info-panel__chevron' });
    const modelToggle = createElement('button', {
      class: 'info-panel__toggle info-panel__toggle--model',
      type: 'button',
      onClick: () => this.togglePanel('model'),
    }, [modelLabel, modelChevron]);

    const contentPane = createElement('div', { class: 'info-panel__pane' });
    const content = createElement('div', { class: 'info-panel__content' }, contentPane);

    root.appendChild(statsToggle);
    root.appendChild(content);
    root.appendChild(modelToggle);
    this.container.appendChild(root);

    this.elements = {
      root,
      statsToggle,
      statsLabel,
      statsChevron,
      modelToggle,
      modelLabel,
      modelChevron,
      content,
      contentPane,
    };
  }

  updateToggle({ toggle, label, chevron, title, isAvailable, isActive, hasAlternatePanel, isDesktop }) {
    toggle.hidden = !isAvailable;
    label.textContent = title;

    const isDisabled = !isAvailable || (isDesktop && (!hasAlternatePanel || isActive));
    toggle.disabled = isDisabled;
    toggle.classList.toggle('info-panel__toggle--clickable', isAvailable && !isDisabled);
    toggle.setAttribute('aria-expanded', isActive ? 'true' : 'false');

    if (!isAvailable) {
      chevron.hidden = true;
      return;
    }

    if (isDesktop) {
      chevron.hidden = isActive;
      chevron.className = 'info-panel__chevron info-panel__chevron--down';
      return;
    }

    chevron.hidden = false;
    chevron.className = isActive
      ? 'info-panel__chevron info-panel__chevron--up'
      : 'info-panel__chevron info-panel__chevron--down';
  }

  renderContent(panel) {
    clearElement(this.elements.contentPane);

    if (!panel) {
      this.elements.content.hidden = true;
      return;
    }

    this.elements.content.hidden = false;
    const gridClass = panel.kind === 'stats'
      ? 'info-panel__grid info-panel__grid--stats'
      : 'info-panel__grid info-panel__grid--model';
    const grid = createElement('div', { class: gridClass });

    for (const item of panel.items) {
      const valueClass = item.tone
        ? `info-panel__value info-panel__value--${item.tone}`
        : 'info-panel__value';
      const itemEl = createElement('div', { class: 'info-panel__item' }, [
        createElement('span', { class: 'info-panel__label' }, item.label),
        createElement('span', { class: valueClass }, item.value),
      ]);
      grid.appendChild(itemEl);
    }

    this.elements.contentPane.appendChild(grid);
  }

  positionContent(panel) {
    const { root, statsToggle, modelToggle, content } = this.elements;
    if (!panel) {
      if (root.children[0] !== statsToggle) {
        root.appendChild(statsToggle);
      }
      if (root.children[1] !== modelToggle) {
        root.appendChild(modelToggle);
      }
      if (root.children[2] !== content) {
        root.appendChild(content);
      }
      return;
    }

    if (this.activePanel === 'model') {
      root.appendChild(statsToggle);
      root.appendChild(modelToggle);
      root.appendChild(content);
      return;
    }

    root.appendChild(statsToggle);
    root.appendChild(content);
    root.appendChild(modelToggle);
  }

  captureLayoutPositions() {
    if (!this.elements || typeof window === 'undefined') {
      return null;
    }

    const rects = new Map();
    for (const element of [this.elements.statsToggle, this.elements.modelToggle, this.elements.content]) {
      if (!element || element.hidden) {
        continue;
      }
      rects.set(element, element.getBoundingClientRect());
    }

    return rects;
  }

  animateLayoutChange(previousLayout) {
    if (!previousLayout || typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      return;
    }

    const animatedElements = [this.elements.statsToggle, this.elements.modelToggle, this.elements.content];

    for (const element of animatedElements) {
      if (!element || element.hidden) {
        continue;
      }

      const previousRect = previousLayout.get(element);
      const nextRect = element.getBoundingClientRect();

      if (!previousRect) {
        element.style.opacity = '0';
        element.style.transform = 'translateY(12px)';
        element.style.transition = 'none';

        window.requestAnimationFrame(() => {
          element.style.transition = 'transform 300ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease';
          element.style.opacity = '';
          element.style.transform = '';
        });
        continue;
      }

      const deltaX = previousRect.left - nextRect.left;
      const deltaY = previousRect.top - nextRect.top;
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) {
        continue;
      }

      element.style.transition = 'none';
      element.style.transform = `translate(${deltaX}px, ${deltaY}px)`;

      window.requestAnimationFrame(() => {
        element.style.transition = 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease';
        element.style.transform = '';
      });
    }
  }

  buildModelPanel() {
    if (!this.modelData) {
      return null;
    }

    const isFrameGood = this.modelData.frame_state === 'good';
    const alignment = this.modelData.alignment || null;
    const visibilityValue = isFrameGood
      ? (this.modelData.visibility ? snakeToTitle(String(this.modelData.visibility)) : '--')
      : 'N/A - bad frame';
    const visibilityConfidence = isFrameGood
      && this.modelData.visibility_prob !== null
      && this.modelData.visibility_prob !== undefined
      ? formatPercent(this.modelData.visibility_prob, 1)
      : '--';
    const alignmentConfidence = Number.isFinite(alignment?.confidence)
      ? alignment.confidence.toFixed(2)
      : '--';
    const xAdjustment = Number.isFinite(alignment?.dx)
      ? `${alignment.dx > 0 ? '+' : ''}${alignment.dx}px`
      : '--';
    const yAdjustment = Number.isFinite(alignment?.dy)
      ? `${alignment.dy > 0 ? '+' : ''}${alignment.dy}px`
      : '--';

    return {
      title: 'Model Info',
      kind: 'model',
      items: [
        {
          label: 'Visibility',
          value: visibilityValue,
        },
        {
          label: 'Visibility Confidence',
          value: visibilityConfidence,
        },
        {
          label: 'Frame State',
          value: this.modelData.frame_state ? snakeToTitle(this.modelData.frame_state) : '--',
        },
        {
          label: 'Frame Confidence',
          value: this.modelData.frame_state_probability !== null
            && this.modelData.frame_state_probability !== undefined
            ? formatPercent(this.modelData.frame_state_probability, 1)
            : '--',
        },
        {
          label: 'Model Version',
          value: this.modelData.model_version || '--',
        },
        {
          label: 'Alignment Confidence',
          value: alignmentConfidence,
        },
        {
          label: 'X Adjustment',
          value: xAdjustment,
        },
        {
          label: 'Y Adjustment',
          value: yAdjustment,
        },
      ],
    };
  }
}
