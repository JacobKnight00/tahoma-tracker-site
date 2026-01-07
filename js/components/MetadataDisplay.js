// Metadata Display Component
// Shows frame state, visibility, confidences, and model version

import { formatPercent, snakeToTitle } from '../utils/format.js';
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

    const isFrameGood = data.frame_state === 'good';
    const visibilityValue = isFrameGood ? data.visibility : null;
    const visibilityConfidence = isFrameGood ? data.visibility_prob : null;

    const items = [
      {
        label: 'Frame State',
        value: data.frame_state ? snakeToTitle(data.frame_state) : '--',
      },
      {
        label: 'Frame Confidence',
        value: data.frame_state_probability !== null && data.frame_state_probability !== undefined
          ? formatPercent(data.frame_state_probability, 1)
          : '--',
      },
      {
        label: 'Visibility',
        value: visibilityValue !== null && visibilityValue !== undefined
          ? snakeToTitle(String(visibilityValue))
          : '--',
      },
      {
        label: 'Visibility Confidence',
        value: visibilityConfidence !== null && visibilityConfidence !== undefined
          ? formatPercent(visibilityConfidence, 1)
          : '--',
      },
      {
        label: 'Model Version',
        value: data.model_version || '--',
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
