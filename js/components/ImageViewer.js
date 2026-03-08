// Image Viewer Component
// Displays the webcam image

import { getImageUrl } from '../lib/api.js';
import { createElement, clearElement } from '../utils/dom.js';

export class ImageViewer {
  constructor(containerElement) {
    this.container = containerElement;
    this.onNavigate = null; // Callback for navigation events
  }

  getWrapper() {
    return this.container.querySelector('.image-viewer__wrapper');
  }

  getCurrentImage() {
    return this.getWrapper()?.querySelector('img:not(.image-viewer__img--loading)') || null;
  }

  /**
   * Set navigation callback and state
   * @param {Function} callback - Function to call for navigation (direction: 'prev' | 'next')
   * @param {Object} state - Navigation state { hasPrev: boolean, hasNext: boolean }
   */
  setNavigation(callback, state = { hasPrev: false, hasNext: false }) {
    this.onNavigate = callback;
    this.updateNavigationArrows(state);
  }

  /**
   * Update navigation arrow visibility
   * @param {Object} state - Navigation state { hasPrev: boolean, hasNext: boolean }
   */
  updateNavigationArrows(state) {
    const wrapper = this.getWrapper();
    if (!wrapper) return;

    // Remove existing arrows
    wrapper.querySelectorAll('.image-viewer__nav-arrow').forEach(arrow => arrow.remove());

    // Add new arrows if navigation is available
    if (state.hasPrev) {
      const prevArrow = createElement('button', {
        class: 'image-viewer__nav-arrow image-viewer__nav-arrow--prev',
        'aria-label': 'Previous image'
      });
      prevArrow.innerHTML = '‹';
      prevArrow.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onNavigate) this.onNavigate('prev');
      });
      wrapper.appendChild(prevArrow);
    }

    if (state.hasNext) {
      const nextArrow = createElement('button', {
        class: 'image-viewer__nav-arrow image-viewer__nav-arrow--next',
        'aria-label': 'Next image'
      });
      nextArrow.innerHTML = '›';
      nextArrow.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onNavigate) this.onNavigate('next');
      });
      wrapper.appendChild(nextArrow);
    }
  }

  /**
   * Update label pills overlay (admin page only)
   * @param {Object} existingLabel - Existing label data { frameState, visibility, labelSource }
   */
  updateLabelPills(existingLabel) {
    const wrapper = this.getWrapper();
    if (!wrapper) return;

    // Remove existing pills overlay
    const existing = wrapper.querySelector('.image-viewer__label-pills');
    if (existing) existing.remove();

    // Only show pills for admin labels
    if (!existingLabel || existingLabel.labelSource !== 'admin') return;

    // Create pills container
    const pillsContainer = createElement('div', {
      class: 'image-viewer__label-pills'
    });

    // Frame state pill
    const framePill = createElement('span', {
      class: 'pill pill--overlay'
    });
    framePill.textContent = `F: ${existingLabel.frameState}`;
    pillsContainer.appendChild(framePill);

    // Visibility pill (if exists)
    if (existingLabel.visibility) {
      const visPill = createElement('span', {
        class: 'pill pill--overlay'
      });
      visPill.textContent = `V: ${existingLabel.visibility}`;
      pillsContainer.appendChild(visPill);
    }

    wrapper.appendChild(pillsContainer);
  }

  /**
   * Clear navigation arrows
   */
  clearNavigationArrows() {
    this.updateNavigationArrows({ hasPrev: false, hasNext: false });
  }
  renderLoading() {
    this.showInitialLoading();
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
   * Show initial loading state (grey box with spinner)
   */
  showInitialLoading() {
    clearElement(this.container);
    const wrapper = createElement('div', { class: 'image-viewer__wrapper image-viewer__wrapper--initial-loading' });
    const spinner = createElement('div', { class: 'image-viewer__spinner' });
    wrapper.appendChild(spinner);
    this.container.appendChild(wrapper);
  }

  /**
   * Show loading state while keeping current image greyed out
   */
  showLoadingWithCurrentImage() {
    let wrapper = this.container.querySelector('.image-viewer__wrapper');
    if (!wrapper) {
      // No current image, fall back to initial loading
      this.showInitialLoading();
      return;
    }

    // Clear navigation arrows during loading
    this.clearNavigationArrows();

    // Add loading overlay and spinner to existing wrapper
    const existingOverlay = wrapper.querySelector('.image-viewer__loading-overlay');
    if (!existingOverlay) {
      const overlay = createElement('div', { class: 'image-viewer__loading-overlay' });
      const spinner = createElement('div', { class: 'image-viewer__spinner' });
      overlay.appendChild(spinner);
      wrapper.appendChild(overlay);
    }
  }

  /**
   * Remove loading overlay (used when new image loads)
   */
  removeLoadingOverlay() {
    const overlay = this.container.querySelector('.image-viewer__loading-overlay');
    if (overlay) {
      overlay.remove();
    }
  }

  setStatusBanner(message) {
    const wrapper = this.getWrapper();
    if (!wrapper) return;

    const existingBanner = wrapper.querySelector('.image-viewer__status-banner');
    if (!message) {
      existingBanner?.remove();
      return;
    }

    if (existingBanner) {
      existingBanner.textContent = message;
      return;
    }

    const banner = createElement('div', { class: 'image-viewer__status-banner' });
    banner.textContent = message;
    wrapper.appendChild(banner);
  }

  clearStatusBanner() {
    this.setStatusBanner('');
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
    let wrapper = this.getWrapper();
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

    return new Promise((resolve) => {
      img.addEventListener('load', () => {
        const spinner = wrapper.querySelector('.image-viewer__spinner');
        if (spinner) spinner.remove();
        this.removeLoadingOverlay();
        img.classList.remove('image-viewer__img--loading');
        resolve(true);
      });

      img.addEventListener('error', (e) => {
        console.error('ImageViewer.render: Image failed to load', e);
        this.renderError('Failed to load image');
        resolve(false);
      });

      wrapper.appendChild(img);
    });
  }

  /**
   * Render image from URL directly with optional cache check
   * @param {string} url - Image URL
   * @param {string} altText - Alt text
   * @param {boolean} skipLoadingState - Skip the loading opacity effect for quick transitions
   * @param {Image} cachedImage - Optional pre-loaded image element
   */
  renderUrl(url, altText = 'Webcam image', skipLoadingState = false, cachedImage = null) {
    // Reuse existing wrapper or create new one
    let wrapper = this.getWrapper();
    if (!wrapper) {
      clearElement(this.container);
      wrapper = createElement('div', { class: 'image-viewer__wrapper' });
      this.container.appendChild(wrapper);
    }

    // For day changes, clear immediately to show placeholder
    if (!skipLoadingState) {
      wrapper.innerHTML = '';
    } else {
      // Scrubbing: remove any pending (not yet loaded) images from previous positions,
      // but keep the currently visible image so there's no white flash
      wrapper.querySelectorAll('.image-viewer__img--loading').forEach(el => el.remove());
    }

    // Use cached image if available — render instantly
    if (cachedImage && cachedImage.complete) {
      const img = createElement('img', {
        class: 'image-viewer__img',
        src: url,
        alt: altText,
      });

      // Remove spinner and other images
      wrapper.querySelectorAll('.image-viewer__spinner, img').forEach(el => el.remove());
      this.removeLoadingOverlay();
      wrapper.appendChild(img);
      return Promise.resolve(true);
    }

    // New image starts hidden; old image stays visible underneath (both position: absolute)
    const img = createElement('img', {
      class: 'image-viewer__img image-viewer__img--loading',
      src: url,
      alt: altText,
      loading: 'eager',
    });

    return new Promise((resolve) => {
      img.addEventListener('load', () => {
        // Ignore if this image was already removed by a subsequent scrub
        if (!wrapper.contains(img)) {
          resolve(false);
          return;
        }
        // Show new image first (it's on top via position: absolute)
        img.classList.remove('image-viewer__img--loading');
        // Then clean up old images underneath
        wrapper.querySelectorAll('.image-viewer__spinner, img').forEach(el => {
          if (el !== img) el.remove();
        });
        this.removeLoadingOverlay();
        resolve(true);
      });

      img.addEventListener('error', () => {
        if (!wrapper.contains(img)) {
          resolve(false);
          return;
        }
        img.remove();
        // Only show error if there's nothing else visible
        if (!wrapper.querySelector('img:not(.image-viewer__img--loading)')) {
          this.renderError('Failed to load image');
        }
        resolve(false);
      });

      wrapper.appendChild(img);
    });
  }
}
