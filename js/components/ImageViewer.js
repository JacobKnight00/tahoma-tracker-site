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
    
    // Add a wrapper to maintain aspect ratio while loading
    const wrapper = createElement('div', {
      class: 'image-viewer__wrapper'
    });

    // Create image element
    const img = createElement('img', {
      class: 'image-viewer__img image-viewer__img--loading',
      src: imageUrl,
      alt: altText,
      loading: 'eager', // Load immediately for main image
    });

    img.addEventListener('load', () => {
      img.classList.remove('image-viewer__img--loading');
    });

    // Handle image load error
    img.addEventListener('error', () => {
      this.renderError('Failed to load image');
    });

    wrapper.appendChild(img);
    this.container.appendChild(wrapper);
  }

  /**
   * Render image from URL directly
   * @param {string} url - Image URL
   * @param {string} altText - Alt text
   * @param {boolean} skipLoadingState - Skip the loading opacity effect for quick transitions
   */
  renderUrl(url, altText = 'Webcam image', skipLoadingState = false) {
    clearElement(this.container);
    
    // Add a wrapper to maintain space while loading
    const wrapper = createElement('div', {
      class: 'image-viewer__wrapper'
    });

    const imgClass = skipLoadingState ? 'image-viewer__img' : 'image-viewer__img image-viewer__img--loading';
    
    const img = createElement('img', {
      class: imgClass,
      src: url,
      alt: altText,
      loading: 'eager',
    });

    if (!skipLoadingState) {
      img.addEventListener('load', () => {
        img.classList.remove('image-viewer__img--loading');
      });
    }

    img.addEventListener('error', () => {
      this.renderError('Failed to load image');
    });

    wrapper.appendChild(img);
    this.container.appendChild(wrapper);
  }
}
