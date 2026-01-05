// Metadata Display Component
// Shows frame state, model version, threshold, etc.

import { formatTimestamp, formatPercent, snakeToTitle } from '../utils/format.js';
import { createElement, clearElement } from '../utils/dom.js';

export class MetadataDisplay {
  constructor(containerElement) {
    this.container = containerElement;
  }

  /**
   * Render metadata from data
   * @param {Object} data - Latest data from API
   */
  render(data) {
    clearElement(this.container);

    const items = [
      {
        label: 'Confidence',
        value: (data.visibility_prob !== null && data.visibility_prob !== undefined)
          ? formatPercent(data.visibility_prob)
          : (data.out_prob !== null && data.out_prob !== undefined)
            ? formatPercent(data.out_prob)
            : '--',
      },
      {
        label: 'Frame State',
        value: data.frame_state ? snakeToTitle(data.frame_state) : '--',
      },
      {
        label: 'Model Version',
        value: data.model_version || '--',
      },
      {
        label: 'Threshold',
        value: data.threshold !== null && data.threshold !== undefined
          ? data.threshold.toFixed(2)
          : '--',
      },
      {
        label: 'Captured',
        value: (data.ts || data.timestamp) ? formatTimestamp(data.ts || data.timestamp) : '--',
      },
    ];

    const grid = createElement('div', { class: 'metadata__grid' });

    for (const item of items) {
      const itemEl = createElement('div', { class: 'metadata__item' }, [
        createElement('span', { class: 'metadata__label' }, item.label),
        createElement('span', { class: 'metadata__value' }, item.value),
      ]);
      grid.appendChild(itemEl);
    }

    this.container.appendChild(grid);
  }
}
