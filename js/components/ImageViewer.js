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
    this.container.innerHTML = `
      <div class="image-viewer__loading">
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
      <div class="image-viewer__error">
        <p>${message}</p>
      </div>
    `;
  }

  /**
   * Render image from data
   * @param {Object} data - Data containing image URL or S3 key
   * @param {string} altText - Alt text for accessibility
   */
  render(data, altText = 'Mt. Rainier from Space Needle webcam') {
    clearElement(this.container);

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

    // Create image element
    const img = createElement('img', {
      class: 'image-viewer__img',
      src: imageUrl,
      alt: altText,
      loading: 'eager', // Load immediately for main image
    });

    // Handle image load error
    img.addEventListener('error', () => {
      this.renderError('Failed to load image');
    });

    this.container.appendChild(img);
  }

  /**
   * Render image from URL directly
   * @param {string} url - Image URL
   * @param {string} altText - Alt text
   */
  renderUrl(url, altText = 'Webcam image') {
    clearElement(this.container);

    const img = createElement('img', {
      class: 'image-viewer__img',
      src: url,
      alt: altText,
      loading: 'eager',
    });

    img.addEventListener('error', () => {
      this.renderError('Failed to load image');
    });

    this.container.appendChild(img);
  }
}
