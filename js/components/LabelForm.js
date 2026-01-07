// Label Form Component
// Form for submitting corrections (crowdsource or admin)

import { submitLabel } from '../lib/api.js';
import { createElement, clearElement } from '../utils/dom.js';

export class LabelForm {
  constructor(containerElement, timestamp) {
    this.container = containerElement;
    this.timestamp = timestamp;
    this.selectedFrameState = null;
    this.selectedVisibility = null;
  }

  /**
   * Render the label correction form
   */
  render() {
    clearElement(this.container);

    // Frame State Group
    const frameStateGroup = createElement('div', { class: 'correction-form__group' }, [
      createElement('label', { class: 'correction-form__label' }, 'Frame State:'),
      createElement('div', { class: 'correction-form__buttons' }, [
        this.createButton('good', 'Good', 'frame_state'),
        this.createButton('off_target', 'Out of Frame', 'frame_state'),
        this.createButton('dark', 'Dark', 'frame_state'),
        this.createButton('bad', 'Bad or Blurry', 'frame_state'),
      ]),
    ]);

    // Visibility Group (disabled unless frame_state = good)
    const visibilityGroup = createElement('div', { class: 'correction-form__group' }, [
      createElement('label', { class: 'correction-form__label' }, 'Visibility (if frame is good):'),
      createElement('div', { class: 'correction-form__buttons' }, [
        this.createButton('out', 'Out', 'visibility', true),
        this.createButton('partially_out', 'Partial', 'visibility', true),
        this.createButton('not_out', 'Not Out', 'visibility', true),
      ]),
    ]);

    // Submit Button
    const submitButton = createElement('button', {
      class: 'button button--primary',
      onclick: () => this.handleSubmit(),
    }, 'Submit Correction');

    this.container.appendChild(frameStateGroup);
    this.container.appendChild(visibilityGroup);
    this.container.appendChild(submitButton);
  }

  /**
   * Create a label button
   * @param {string} value - Button value
   * @param {string} label - Button label text
   * @param {string} type - 'frame_state' or 'visibility'
   * @param {boolean} disabled - Whether button starts disabled
   */
  createButton(value, label, type, disabled = false) {
    const button = createElement('button', {
      class: 'button button--secondary',
      dataset: { value, type },
      disabled,
      onclick: (e) => this.handleButtonClick(e, value, type),
    }, label);

    return button;
  }

  /**
   * Handle button click
   * @param {Event} event - Click event
   * @param {string} value - Button value
   * @param {string} type - 'frame_state' or 'visibility'
   */
  handleButtonClick(event, value, type) {
    const button = event.target;

    if (type === 'frame_state') {
      this.selectedFrameState = value;

      // Update button styles
      this.container.querySelectorAll('[data-type="frame_state"]').forEach(btn => {
        btn.classList.remove('button--primary');
        btn.classList.add('button--secondary');
      });
      button.classList.remove('button--secondary');
      button.classList.add('button--primary');

      // Enable/disable visibility buttons
      const visibilityButtons = this.container.querySelectorAll('[data-type="visibility"]');
      if (value === 'good') {
        visibilityButtons.forEach(btn => btn.disabled = false);
      } else {
        visibilityButtons.forEach(btn => {
          btn.disabled = true;
          btn.classList.remove('button--primary');
          btn.classList.add('button--secondary');
        });
        this.selectedVisibility = null;
      }
    } else if (type === 'visibility') {
      this.selectedVisibility = value;

      // Update button styles
      this.container.querySelectorAll('[data-type="visibility"]').forEach(btn => {
        btn.classList.remove('button--primary');
        btn.classList.add('button--secondary');
      });
      button.classList.remove('button--secondary');
      button.classList.add('button--primary');
    }
  }

  /**
   * Handle form submission
   */
  async handleSubmit() {
    if (!this.selectedFrameState) {
      alert('Please select a frame state');
      return;
    }

    if (this.selectedFrameState === 'good' && !this.selectedVisibility) {
      alert('Please select visibility (frame is marked as good)');
      return;
    }

    try {
      await submitLabel({
        ts: this.timestamp,
        frame_state: this.selectedFrameState,
        visibility: this.selectedFrameState === 'good' ? this.selectedVisibility : null,
        updated_by: 'crowdsource',
      });

      // Show success message
      clearElement(this.container);
      this.container.innerHTML = `
        <div class="correction-form__message">
          Thank you! Your correction has been submitted.
        </div>
      `;
    } catch (error) {
      console.error('Failed to submit correction:', error);
      alert('Failed to submit correction. Please try again.');
    }
  }
}
