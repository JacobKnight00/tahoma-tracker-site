// Image Viewer Component
// Displays the webcam image

import { getImageUrl } from '../lib/api.js';
import { createElement, clearElement } from '../utils/dom.js';

export class ImageViewer {
  constructor(containerElement) {
    this.container = containerElement;
  }

  /**
   * Render loading state
   */
  renderLoading() {
    this.showPlaceholder();
  }

  /**
   * Render error state
   * @param {string} message - Error message
   */
  renderError(message) {
    this.container.innerHTML = `
      <div class="image-viewer__error">
        <p>${message}</p>
      </div>
    `;
  }

  /**
   * Show placeholder with spinner by clearing current image
   */
  showPlaceholder() {
    let wrapper = this.container.querySelector('.image-viewer__wrapper');
    if (!wrapper) {
      clearElement(this.container);
      wrapper = createElement('div', { class: 'image-viewer__wrapper' });
      this.container.appendChild(wrapper);
    } else {
      wrapper.innerHTML = '';
    }
    // Add spinner
    const spinner = createElement('div', { class: 'image-viewer__spinner' });
    wrapper.appendChild(spinner);
  }

  /**
   * Render image from data
   * @param {Object} data - Data containing image URL or S3 key
   * @param {string} altText - Alt text for accessibility
   */
  render(data, altText = 'Mt. Rainier from Space Needle webcam') {
    // Get image URL (from image_url, cropped_s3_key, or ts)
    let imageUrl;
    if (data.image_url) {
      imageUrl = data.image_url;
    } else if (data.cropped_s3_key) {
      imageUrl = getImageUrl(data.cropped_s3_key);
    } else if (data.ts) {
      imageUrl = getImageUrl(data.ts);
    } else {
      this.renderError('No image available');
      return;
    }

    // Reuse existing wrapper or create new one
    let wrapper = this.container.querySelector('.image-viewer__wrapper');
    if (!wrapper) {
      clearElement(this.container);
      wrapper = createElement('div', { class: 'image-viewer__wrapper' });
      this.container.appendChild(wrapper);
    }
    
    // Clear old images but keep/add spinner
    wrapper.querySelectorAll('img').forEach(img => img.remove());
    if (!wrapper.querySelector('.image-viewer__spinner')) {
      wrapper.appendChild(createElement('div', { class: 'image-viewer__spinner' }));
    }

    // Create new image element (hidden until loaded)
    const img = createElement('img', {
      class: 'image-viewer__img image-viewer__img--loading',
      src: imageUrl,
      alt: altText,
      loading: 'eager',
    });

    img.addEventListener('load', () => {
      // Remove spinner
      const spinner = wrapper.querySelector('.image-viewer__spinner');
      if (spinner) spinner.remove();
      img.classList.remove('image-viewer__img--loading');
    });

    img.addEventListener('error', (e) => {
      console.error('ImageViewer.render: Image failed to load', e);
      this.renderError('Failed to load image');
    });

    wrapper.appendChild(img);
  }

  /**
   * Render image from URL directly
   * @param {string} url - Image URL
   * @param {string} altText - Alt text
   * @param {boolean} skipLoadingState - Skip the loading opacity effect for quick transitions
   */
  renderUrl(url, altText = 'Webcam image', skipLoadingState = false) {
    // Reuse existing wrapper or create new one
    let wrapper = this.container.querySelector('.image-viewer__wrapper');
    if (!wrapper) {
      clearElement(this.container);
      wrapper = createElement('div', { class: 'image-viewer__wrapper' });
      this.container.appendChild(wrapper);
    }

    // For day changes, clear immediately to show placeholder
    if (!skipLoadingState) {
      wrapper.innerHTML = '';
    }

    const existingImg = wrapper.querySelector('img');
    
    const img = createElement('img', {
      class: skipLoadingState ? 'image-viewer__img' : 'image-viewer__img image-viewer__img--loading',
      src: url,
      alt: altText,
      loading: 'eager',
    });

    img.addEventListener('load', () => {
      // Remove spinner and other images
      wrapper.querySelectorAll('.image-viewer__spinner, img').forEach(el => {
        if (el !== img) el.remove();
      });
      img.classList.remove('image-viewer__img--loading');
    });

    img.addEventListener('error', () => {
      this.renderError('Failed to load image');
    });

    wrapper.appendChild(img);
  }
}
