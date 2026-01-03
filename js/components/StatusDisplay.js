// Status Display Component
// Renders the main "YES/NO/UNKNOWN" status card

import { formatPercent } from '../utils/format.js';
import { createElement, clearElement } from '../utils/dom.js';

export class StatusDisplay {
  constructor(containerElement) {
    this.container = containerElement;
  }

  /**
   * Render loading state
   */
  renderLoading() {
    this.container.innerHTML = `
      <div class="status-card__loading">
        <div class="spinner"></div>
        <p>Loading...</p>
      </div>
    `;
  }

  /**
   * Render error state
   * @param {string} message - Error message
   */
  renderError(message) {
    this.container.innerHTML = `
      <div class="status-card__error">
        <p>${message}</p>
      </div>
    `;
  }

  /**
   * Render status from data
   * @param {Object} data - Latest data from API
   */
  render(data) {
    clearElement(this.container);

    // Determine status
    let statusText = 'UNKNOWN';
    let statusClass = 'unknown';

    if (data.status === 'ok' && data.out !== null && data.out !== undefined) {
      statusText = data.out ? 'YES' : 'NO';
      statusClass = data.out ? 'positive' : 'negative';
    }

    // Create elements
    const statusValue = createElement(
      'h2',
      {
        class: `status-card__value status-card__value--${statusClass}`,
        'aria-label': `Mt. Rainier is ${statusText.toLowerCase()}`,
      },
      statusText
    );

    const confidence = createElement(
      'p',
      { class: 'status-card__confidence' },
      data.out_prob !== null && data.out_prob !== undefined
        ? `${formatPercent(data.out_prob)} confident`
        : ''
    );

    this.container.appendChild(statusValue);
    if (confidence.textContent) {
      this.container.appendChild(confidence);
    }
  }
}
