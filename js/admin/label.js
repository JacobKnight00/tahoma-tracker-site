// Admin Labeling Page Entry Point
// Keyboard-driven rapid labeling interface

import { submitLabel, getImageUrl } from '../lib/api.js';
import { ImageViewer } from '../components/ImageViewer.js';
import { formatTime, snakeToTitle } from '../utils/format.js';
import { createKeyboardShortcuts } from '../utils/keyboard.js';

// State
let currentTimestamp = null;
let currentLabels = {
  frame_state: null,
  visibility: null,
};
let mode = 'queue'; // 'queue' or 'cursor'
let imageQueue = []; // List of timestamps to label
let queueIndex = 0;

// Components
let imageViewer;
let keyboard;

/**
 * Initialize the admin labeling page
 */
async function init() {
  // Check auth (simple token check)
  // In production, this would be more robust
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token') || localStorage.getItem('adminToken');

  if (!token) {
    alert('Admin access required. Please provide a valid token.');
    window.location.href = '/';
    return;
  }

  // Store token
  localStorage.setItem('adminToken', token);

  // Initialize components
  imageViewer = new ImageViewer(document.getElementById('admin-image-viewer'));
  keyboard = createKeyboardShortcuts();

  // Set up keyboard shortcuts
  registerKeyboardShortcuts();

  // Set up button handlers
  registerButtonHandlers();

  // Load initial image (for now, just show placeholder)
  // In production, this would fetch the next unlabeled image
  showPlaceholder();
}

/**
 * Register keyboard shortcuts
 */
function registerKeyboardShortcuts() {
  // Frame state
  keyboard.register('g', () => setFrameState('good'));
  keyboard.register('f', () => setFrameState('off_target'));
  keyboard.register('d', () => setFrameState('dark'));
  keyboard.register('b', () => setFrameState('bad'));

  // Visibility (only works if frame=good)
  keyboard.register('o', () => setVisibility('out'));
  keyboard.register('p', () => setVisibility('partial'));
  keyboard.register('n', () => setVisibility('not_out'));

  // Navigation
  keyboard.register('arrowleft', () => navigatePrevious());
  keyboard.register('arrowright', () => navigateNext());
  keyboard.register(' ', () => navigateNextUnlabeled());

  // Help
  keyboard.register('?', () => toggleHelp());
}

/**
 * Register button click handlers
 */
function registerButtonHandlers() {
  // Frame state buttons
  document.querySelectorAll('[data-action="label-frame"]').forEach(button => {
    button.addEventListener('click', (e) => {
      const value = e.target.dataset.value;
      setFrameState(value);
    });
  });

  // Visibility buttons
  document.querySelectorAll('[data-action="label-visibility"]').forEach(button => {
    button.addEventListener('click', (e) => {
      const value = e.target.dataset.value;
      setVisibility(value);
    });
  });

  // Navigation buttons
  document.querySelector('[data-action="nav-prev"]')?.addEventListener('click', navigatePrevious);
  document.querySelector('[data-action="nav-next"]')?.addEventListener('click', navigateNext);
  document.querySelector('[data-action="nav-next-unlabeled"]')?.addEventListener('click', navigateNextUnlabeled);

  // Mode toggle
  document.getElementById('mode-toggle')?.addEventListener('click', toggleMode);

  // Date/time picker
  document.querySelector('[data-action="jump-to-datetime"]')?.addEventListener('click', jumpToDateTime);

  // Help overlay
  document.querySelector('[data-action="close-help"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    toggleHelp();
  });
}

/**
 * Set frame state label
 */
async function setFrameState(value) {
  currentLabels.frame_state = value;

  // Update pills
  document.getElementById('pill-frame-state').textContent = `Frame: ${snakeToTitle(value)}`;

  // Enable/disable visibility buttons
  const visibilityButtons = document.querySelectorAll('[data-action="label-visibility"]');
  if (value === 'good') {
    visibilityButtons.forEach(btn => btn.disabled = false);
  } else {
    visibilityButtons.forEach(btn => btn.disabled = true);
    currentLabels.visibility = null;
    document.getElementById('pill-visibility').textContent = 'Visibility: --';

    // Auto-save and advance for non-good frames
    await saveLabel();
    navigateNext();
  }
}

/**
 * Set visibility label
 */
async function setVisibility(value) {
  if (currentLabels.frame_state !== 'good') {
    return; // Only allow if frame is good
  }

  currentLabels.visibility = value;

  // Update pills
  document.getElementById('pill-visibility').textContent = `Visibility: ${snakeToTitle(value)}`;

  // Auto-save and advance
  await saveLabel();
  navigateNextUnlabeled();
}

/**
 * Save current label to backend
 */
async function saveLabel() {
  if (!currentTimestamp || !currentLabels.frame_state) {
    return;
  }

  try {
    await submitLabel({
      ts: currentTimestamp,
      frame_state: currentLabels.frame_state,
      visibility: currentLabels.visibility,
      updated_by: 'admin',
    });

    console.log('Label saved:', currentLabels);
  } catch (error) {
    console.error('Failed to save label:', error);
    alert('Failed to save label. Please try again.');
  }
}

/**
 * Navigate to previous image
 */
function navigatePrevious() {
  console.log('Navigate previous (not implemented yet)');
  // TODO: Implement once backend API is ready
}

/**
 * Navigate to next image
 */
function navigateNext() {
  console.log('Navigate next (not implemented yet)');
  // TODO: Implement once backend API is ready
}

/**
 * Navigate to next unlabeled image
 */
function navigateNextUnlabeled() {
  console.log('Navigate to next unlabeled (not implemented yet)');
  // TODO: Implement once backend API is ready
}

/**
 * Toggle between queue and cursor mode
 */
function toggleMode() {
  mode = mode === 'queue' ? 'cursor' : 'queue';
  document.getElementById('current-mode').textContent = mode === 'queue' ? 'Queue' : 'Cursor';
  console.log('Switched to', mode, 'mode');
}

/**
 * Jump to specific date/time
 */
function jumpToDateTime() {
  const dateInput = document.getElementById('date-picker');
  const timeInput = document.getElementById('time-picker');

  const date = dateInput.value;
  const time = timeInput.value;

  if (date && time) {
    console.log('Jump to:', date, time);
    // TODO: Implement once backend API is ready
  }
}

/**
 * Toggle help overlay
 */
function toggleHelp() {
  const helpOverlay = document.getElementById('help-overlay');
  if (helpOverlay.hasAttribute('hidden')) {
    helpOverlay.removeAttribute('hidden');
  } else {
    helpOverlay.setAttribute('hidden', '');
  }
}

/**
 * Show placeholder until backend is ready
 */
function showPlaceholder() {
  imageViewer.renderError('Admin labeling interface ready. Connect to backend API to start labeling.');

  document.getElementById('image-id').textContent = 'N/A';
  document.getElementById('image-time').textContent = 'Not connected';

  // Set today's date as default in picker
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('date-picker').value = today;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
