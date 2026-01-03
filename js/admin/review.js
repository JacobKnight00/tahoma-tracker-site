// Admin Review Page Entry Point
// Review and correct "out" and "partial" labels

import { submitLabel, fetchLabels } from '../lib/api.js';
import { ImageViewer } from '../components/ImageViewer.js';
import { createKeyboardShortcuts } from '../utils/keyboard.js';

// State
let reviewQueue = []; // Images to review (filtered by out/partial)
let reviewIndex = 0;
let currentImage = null;

// Components
let imageViewer;
let keyboard;

/**
 * Initialize the review page
 */
async function init() {
  // Check auth
  const token = localStorage.getItem('adminToken');
  if (!token) {
    alert('Admin access required.');
    window.location.href = '/admin/label.html';
    return;
  }

  // Initialize components
  imageViewer = new ImageViewer(document.getElementById('review-image-viewer'));
  keyboard = createKeyboardShortcuts();

  // Set up keyboard shortcuts
  registerKeyboardShortcuts();

  // Set up button handlers
  registerButtonHandlers();

  // Load images to review
  await loadReviewQueue();
}

/**
 * Register keyboard shortcuts
 */
function registerKeyboardShortcuts() {
  keyboard.register('c', () => confirmLabel());
  keyboard.register('p', () => changeToPartial());
  keyboard.register('n', () => changeToNotOut());
  keyboard.register('s', () => skip());
}

/**
 * Register button handlers
 */
function registerButtonHandlers() {
  document.querySelector('[data-action="review-confirm"]')?.addEventListener('click', confirmLabel);
  document.querySelector('[data-action="review-change-partial"]')?.addEventListener('click', changeToPartial);
  document.querySelector('[data-action="review-change-not-out"]')?.addEventListener('click', changeToNotOut);
  document.querySelector('[data-action="review-skip"]')?.addEventListener('click', skip);

  // Filter checkboxes
  document.getElementById('filter-out')?.addEventListener('change', () => loadReviewQueue());
  document.getElementById('filter-partial')?.addEventListener('change', () => loadReviewQueue());
}

/**
 * Load queue of images to review
 */
async function loadReviewQueue() {
  imageViewer.renderLoading();

  try {
    // For now, show placeholder
    // TODO: Fetch labels from backend API filtered by out/partial
    reviewQueue = [];
    reviewIndex = 0;

    showPlaceholder();
  } catch (error) {
    console.error('Failed to load review queue:', error);
    imageViewer.renderError('Failed to load images to review.');
  }
}

/**
 * Show current image in review queue
 */
function showCurrentImage() {
  if (reviewQueue.length === 0) {
    imageViewer.renderError('No images to review. Good job!');
    return;
  }

  currentImage = reviewQueue[reviewIndex];

  // Render image
  imageViewer.render(currentImage);

  // Update info
  document.getElementById('review-image-id').textContent = currentImage.ts || 'N/A';
  document.getElementById('review-current-label').textContent = currentImage.visibility || '--';

  // Update progress
  document.getElementById('progress-text').textContent =
    `${reviewIndex + 1} of ${reviewQueue.length} reviewed`;
}

/**
 * Confirm label is correct, move to next
 */
function confirmLabel() {
  console.log('Label confirmed');
  nextImage();
}

/**
 * Change label to "partial"
 */
async function changeToPartial() {
  if (!currentImage) return;

  try {
    await submitLabel({
      ts: currentImage.ts,
      frame_state: 'good',
      visibility: 'partial',
      updated_by: 'admin',
    });

    console.log('Changed to partial');
    nextImage();
  } catch (error) {
    console.error('Failed to update label:', error);
    alert('Failed to update label.');
  }
}

/**
 * Change label to "not_out"
 */
async function changeToNotOut() {
  if (!currentImage) return;

  try {
    await submitLabel({
      ts: currentImage.ts,
      frame_state: 'good',
      visibility: 'not_out',
      updated_by: 'admin',
    });

    console.log('Changed to not_out');
    nextImage();
  } catch (error) {
    console.error('Failed to update label:', error);
    alert('Failed to update label.');
  }
}

/**
 * Skip current image
 */
function skip() {
  console.log('Skipped');
  nextImage();
}

/**
 * Move to next image in queue
 */
function nextImage() {
  reviewIndex++;

  if (reviewIndex >= reviewQueue.length) {
    imageViewer.renderError('All images reviewed! Great work.');
    document.getElementById('progress-text').textContent = 'Complete!';
  } else {
    showCurrentImage();
  }
}

/**
 * Show placeholder until backend is ready
 */
function showPlaceholder() {
  imageViewer.renderError('Review interface ready. Connect to backend API to start reviewing.');
  document.getElementById('progress-text').textContent = '0 of 0 reviewed';
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
