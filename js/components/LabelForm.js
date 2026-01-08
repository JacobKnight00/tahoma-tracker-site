// Label Form Component
// Form for submitting corrections (crowdsource or admin)

import { submitLabel, buildImageId } from '../lib/api.js';
import { createElement, clearElement } from '../utils/dom.js';

export class LabelForm {
  constructor(containerElement) {
    this.container = containerElement;
    this.selectedFrameState = null;
    this.selectedVisibility = null;
    this.currentImageId = null;
    this.currentTimestamp = null;
    this.statusMessage = '';
    this.statusType = null;
    this.isSubmitting = false;
    this.hasSuccessfulSubmission = false;

    this.frameButtons = [];
    this.visibilityButtons = [];
    this.submitButton = null;
    this.statusMessageEl = null;
    this.formElementsContainer = null;

    this.render();
  }

  /**
   * Update the target image for the form (keeps UI in sync with viewed image)
   * @param {Object} data - Image/analysis data
   * @param {string|Date|null} timestampOverride - Optional timestamp to prefer
   */
  setTarget(data, timestampOverride = null) {
    const timestamp =
      timestampOverride instanceof Date
        ? timestampOverride.toISOString()
        : (timestampOverride || data?.ts || data?.timestamp || data?.time || null);

    const imageId = this.deriveImageId(data, timestamp);
    const hasChanged = imageId && imageId !== this.currentImageId;

    this.currentImageId = imageId;
    this.currentTimestamp = timestamp;

    if (hasChanged) {
      this.selectedFrameState = null;
      this.selectedVisibility = null;
      this.hasSuccessfulSubmission = false;
      this.updateStatusMessage(null, '');
      this.render(); // Only re-render when the image actually changed
    }
  }

  /**
   * Render the label correction form
   */
  render() {
    clearElement(this.container);
    this.frameButtons = [];
    this.visibilityButtons = [];
    this.submitButton = null;

    this.statusMessageEl = createElement(
      'div',
      { class: 'correction-form__message', 'aria-live': 'polite' },
      this.statusMessage || ''
    );
    this.applyStatusStyle();

    const visibilityDisabled = this.selectedFrameState !== 'good';

    // Frame State Group
    const frameStateButtons = [
      this.createButton('good', 'Good', 'frame_state'),
      this.createButton('off_target', 'Out of Frame', 'frame_state'),
      this.createButton('dark', 'Dark', 'frame_state'),
      this.createButton('bad', 'Bad or Blurry', 'frame_state'),
    ];
    this.frameButtons = frameStateButtons;
    const frameStateGroup = createElement('div', { class: 'correction-form__group' }, [
      createElement('label', { class: 'correction-form__label' }, 'Frame State:'),
      createElement('div', { class: 'correction-form__buttons' }, frameStateButtons),
    ]);

    // Visibility Group (disabled unless frame_state = good)
    const visibilityButtons = [
      this.createButton('out', 'Out', 'visibility', visibilityDisabled),
      this.createButton('partially_out', 'Partial', 'visibility', visibilityDisabled),
      this.createButton('not_out', 'Not Out', 'visibility', visibilityDisabled),
    ];
    this.visibilityButtons = visibilityButtons;
    const visibilityGroup = createElement('div', { class: 'correction-form__group' }, [
      createElement('label', { class: 'correction-form__label' }, 'Visibility (if frame is good):'),
      createElement('div', { class: 'correction-form__buttons' }, visibilityButtons),
    ]);

    // Submit Button
    const isSubmitDisabled = this.isSubmitting || !this.currentImageId;
    this.submitButton = createElement(
      'button',
      {
        class: 'button button--primary',
        onclick: () => this.handleSubmit(),
        ...(isSubmitDisabled ? { disabled: true } : {}),
      },
      this.isSubmitting ? 'Submitting...' : 'Submit Feedback'
    );
    this.submitButton.disabled = isSubmitDisabled;

    this.container.appendChild(this.statusMessageEl);
    
    // Only show form elements if there hasn't been a successful submission
    if (!this.hasSuccessfulSubmission) {
      this.formElementsContainer = createElement('div', { class: 'correction-form__elements' }, [
        frameStateGroup,
        visibilityGroup,
        this.submitButton
      ]);
      this.container.appendChild(this.formElementsContainer);
    }
  }

  /**
   * Create a label button
   * @param {string} value - Button value
   * @param {string} label - Button label text
   * @param {string} type - 'frame_state' or 'visibility'
   * @param {boolean} disabled - Whether button starts disabled
   */
  createButton(value, label, type, disabled = false) {
    const isSelected =
      (type === 'frame_state' && this.selectedFrameState === value) ||
      (type === 'visibility' && this.selectedVisibility === value);

    const attrs = {
      class: isSelected ? 'button button--primary' : 'button button--secondary',
      dataset: { value, type },
      onclick: (e) => this.handleButtonClick(e, value, type),
    };

    if (disabled) {
      attrs.disabled = true;
    }

    const button = createElement('button', attrs, label);

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
      this.frameButtons.forEach(btn => this.setButtonActive(btn, btn === button));

      const isGoodFrame = value === 'good';
      this.visibilityButtons.forEach(btn => {
        btn.disabled = !isGoodFrame;
        const shouldActivate = isGoodFrame && btn.dataset.value === this.selectedVisibility;
        this.setButtonActive(btn, shouldActivate);
      });

      if (!isGoodFrame) {
        this.selectedVisibility = null;
      }

      this.updateStatusMessage(null, '');
    } else if (type === 'visibility') {
      if (this.selectedFrameState !== 'good') {
        return; // Visibility not allowed unless frame is good
      }

      this.selectedVisibility = value;

      // Update button styles
      this.visibilityButtons.forEach(btn => this.setButtonActive(btn, btn === button));
      this.updateStatusMessage(null, '');
    }
  }

  /**
   * Handle form submission
   */
  async handleSubmit() {
    if (this.isSubmitting) return;

    if (!this.currentImageId) {
      this.updateStatusMessage('error', 'No image selected to label right now.');
      return;
    }

    if (!this.selectedFrameState) {
      this.updateStatusMessage('error', 'Please select a frame state.');
      return;
    }

    if (this.selectedFrameState === 'good' && !this.selectedVisibility) {
      this.updateStatusMessage('error', 'Please select visibility for a good frame.');
      return;
    }

    this.isSubmitting = true;
    if (this.submitButton) {
      this.submitButton.disabled = true;
      this.submitButton.textContent = 'Submitting...';
    }

    try {
      const result = await submitLabel({
        imageId: this.currentImageId,
        frameState: this.selectedFrameState,
        visibility: this.selectedFrameState === 'good' ? this.selectedVisibility : null,
      });

      if (result?.unconfirmed) {
        console.warn('Label submission response was not confirmed (likely CORS), treating as success.');
      }

      this.resetSelections();
      this.hasSuccessfulSubmission = true;
      this.updateStatusMessage('success', 'Thank you for the feedback!');
      this.render(); // Re-render to hide form elements
    } catch (error) {
      console.error('Failed to submit correction:', error);
      const message = error?.message || 'We could not submit your correction right now. Please try again in a moment.';
      this.updateStatusMessage('error', message);
    } finally {
      this.isSubmitting = false;
      if (this.submitButton) {
        this.submitButton.disabled = !this.currentImageId;
        this.submitButton.textContent = 'Submit Feedback';
      }
    }
  }

  /**
   * Reset selections and button states
   */
  resetSelections() {
    this.selectedFrameState = null;
    this.selectedVisibility = null;
    this.frameButtons.forEach(btn => this.setButtonActive(btn, false));
    this.visibilityButtons.forEach(btn => {
      btn.disabled = true;
      this.setButtonActive(btn, false);
    });
  }

  /**
   * Apply status styles/message visibility
   */
  applyStatusStyle() {
    if (!this.statusMessageEl) return;

    const hasMessage = !!this.statusMessage;
    this.statusMessageEl.style.display = hasMessage ? 'block' : 'none';
    this.statusMessageEl.classList.toggle('correction-form__message--success', this.statusType === 'success');
    this.statusMessageEl.classList.toggle('correction-form__message--error', this.statusType === 'error');
  }

  /**
   * Update status message shown to the user
   */
  updateStatusMessage(type, message) {
    this.statusType = type;
    this.statusMessage = message || '';
    if (this.statusMessageEl) {
      this.statusMessageEl.textContent = this.statusMessage;
      this.applyStatusStyle();
    }
  }

  /**
   * Toggle selected styling on buttons
   */
  setButtonActive(button, isActive) {
    if (!button) return;
    button.classList.toggle('button--primary', isActive);
    button.classList.toggle('button--secondary', !isActive);
  }

  extractImageIdFromKey(key) {
    if (typeof key !== 'string') return null;
    const match = key.match(/(\d{4}\/\d{2}\/\d{2}\/\d{4})/);
    return match?.[1] || null;
  }

  deriveImageId(data, timestamp) {
    try {
      if (!data) {
        return timestamp ? buildImageId(timestamp) : null;
      }

      return (
        data.image_id ||
        data.imageId ||
        this.extractImageIdFromKey(data.cropped_s3_key) ||
        this.extractImageIdFromKey(data.pano_s3_key) ||
        this.extractImageIdFromKey(data.analysis_s3_key) ||
        (timestamp ? buildImageId(timestamp) : null)
      );
    } catch (err) {
      return null;
    }
  }
}
