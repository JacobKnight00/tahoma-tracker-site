// Status Display Component
// Renders the main "YES/NO/UNKNOWN" status card

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
    let statusText = 'No';
    let statusClass = 'negative';

    const frameState = data.frame_state;
    const isFrameGood = frameState === 'good';

    // Only show visibility when frame is good and a prediction exists
    if (isFrameGood && data.visibility !== null && data.visibility !== undefined) {
      if (data.visibility === 'out') {
        statusText = 'Yes';
        statusClass = 'positive';
      } else if (data.visibility === 'partially_out') {
        statusText = 'Partial';
        statusClass = 'partial';
      } else if (data.visibility === 'not_out') {
        statusText = 'No';
        statusClass = 'negative';
      }
    }

    // Create elements
    const statusValue = createElement(
      'span',
      {
        class: `status-value__text status-value__text--${statusClass}`,
        'aria-label': `The mountain is ${statusText.toLowerCase()}`,
      },
      statusText
    );

    this.container.appendChild(statusValue);
  }
}
