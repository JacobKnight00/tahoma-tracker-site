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
      <div class="status-value__loading">
        <div class="spinner"></div>
      </div>
    `;
  }

  /**
   * Render error state
   * @param {string} message - Error message
   */
  renderError(message) {
    this.container.innerHTML = `
      <span class="status-value__text status-value__text--unknown">?</span>
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
      'span',
      {
        class: `status-value__text status-value__text--${statusClass}`,
        'aria-label': `Mt. Rainier is ${statusText.toLowerCase()}`,
      },
      statusText
    );

    this.container.appendChild(statusValue);
  }
}
