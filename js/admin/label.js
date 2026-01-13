// Admin Labeling Page - Production Implementation
// Rapid keyboard-driven labeling with intelligent filtering

import { AdminLabelingController } from './AdminLabelingController.js';
import { ImageViewer } from '../components/ImageViewer.js';
import { snakeToTitle } from '../utils/format.js';
import { createKeyboardShortcuts } from '../utils/keyboard.js';
import { config } from '../../config/config.js';

// State
let controller;
let imageViewer;
let keyboard;
let currentLabels = { frame_state: null, visibility: null };

/**
 * Initialize the admin labeling page
 */
async function init() {
  // Initialize components
  controller = new AdminLabelingController();
  imageViewer = new ImageViewer(document.getElementById('admin-image-viewer'));
  keyboard = createKeyboardShortcuts();

  // Set up callbacks
  controller.onImageChange = async (imageData) => {
    await handleImageChange(imageData);
  };
  controller.onProgressUpdate = handleProgressUpdate;
  controller.onBatchSubmit = handleBatchSubmit;

  // Set up event handlers
  registerKeyboardShortcuts();
  registerButtonHandlers();
  registerFilterHandlers();

  // Set default dates (today in local time)
  const today = new Date();
  const localDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  document.getElementById('start-date').value = localDateStr;
  document.getElementById('end-date').value = localDateStr;

  // Update confidence display
  updateConfidenceDisplay();
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
  keyboard.register('arrowleft', () => controller.navigatePrevious());
  keyboard.register('arrowright', () => controller.navigateNext());
  keyboard.register('s', () => skipImage());

  // Batch
  keyboard.register('enter', () => submitBatch());

  // Help - commented out for now
  // keyboard.register('?', () => toggleHelp());
}

/**
 * Register button click handlers
 */
function registerButtonHandlers() {
  // Frame state buttons
  document.querySelectorAll('[data-action="label-frame"]').forEach(button => {
    button.addEventListener('click', (e) => {
      setFrameState(e.currentTarget.dataset.value);
    });
  });

  // Visibility buttons
  document.querySelectorAll('[data-action="label-visibility"]').forEach(button => {
    button.addEventListener('click', (e) => {
      setVisibility(e.currentTarget.dataset.value);
    });
  });

  // Navigation buttons
  document.querySelector('[data-action="nav-prev"]')?.addEventListener('click', () => controller.navigatePrevious());
  document.querySelector('[data-action="nav-next"]')?.addEventListener('click', () => controller.navigateNext());
  document.querySelector('[data-action="skip-image"]')?.addEventListener('click', skipImage);

  // Batch actions
  document.querySelector('[data-action="submit-batch"]')?.addEventListener('click', submitBatch);

  // Help overlay - commented out for now
  // const helpCloseBtn = document.querySelector('[data-action="close-help"]');
  // if (helpCloseBtn) {
  //   helpCloseBtn.addEventListener('click', (e) => {
  //     e.preventDefault();
  //     toggleHelp();
  //   });
  // }
}

/**
 * Register filter handlers
 */
function registerFilterHandlers() {
  // Apply filters button
  document.getElementById('apply-filters').addEventListener('click', applyFilters);

  // Confidence threshold slider
  const slider = document.getElementById('confidence-threshold');
  slider.addEventListener('input', updateConfidenceDisplay);

  // Real-time filter updates
  document.getElementById('good-frames-only').addEventListener('change', (e) => {
    controller.updateFilter('goodFramesOnly', e.target.checked);
  });

  document.getElementById('exclude-labeled').addEventListener('change', (e) => {
    controller.updateFilter('excludeLabeled', e.target.value);
  });

  document.getElementById('disagreements-only').addEventListener('change', (e) => {
    controller.updateFilter('disagreementsOnly', e.target.checked);
  });
}

/**
 * Apply filters and load data
 */
async function applyFilters() {
  const startDate = document.getElementById('start-date').value;
  const endDate = document.getElementById('end-date').value;

  if (!startDate || !endDate) {
    alert('Please select both start and end dates');
    return;
  }

  // Show loading
  imageViewer.showInitialLoading();
  document.getElementById('apply-filters').disabled = true;
  document.getElementById('apply-filters').textContent = 'Loading...';

  try {
    // Update confidence threshold
    const confidence = parseInt(document.getElementById('confidence-threshold').value);
    controller.filters.confidenceThreshold = confidence;

    // Load data
    await controller.loadDataForDateRange(startDate, endDate);

    // Show first image if available
    if (controller.filteredImages.length > 0) {
      await handleImageChange(controller.getCurrentImage());
    } else {
      imageViewer.renderError('No images match the current filters');
    }

    // Enable navigation if we have images
    updateNavigationButtons();

  } catch (err) {
    console.error('Failed to load data:', err);
    imageViewer.renderError('Failed to load data. Please try again.');
  } finally {
    document.getElementById('apply-filters').disabled = false;
    document.getElementById('apply-filters').textContent = 'Apply';
  }
}

/**
 * Handle image change from controller
 */
async function handleImageChange(imageData) {
  if (!imageData) {
    imageViewer.renderError('No more images to label');
    clearImageContext();
    return;
  }

  // Check if image is cached for faster loading
  const cachedImage = controller.imageCache.get(imageData.imageId);
  imageViewer.renderUrl(controller.getCurrentImageUrl(), `Image ${imageData.imageId}`, false, cachedImage);
  
  // Set up navigation arrows like main page
  const hasNext = controller.currentIndex < controller.filteredImages.length - 1;
  const hasPrev = controller.currentIndex > 0;
  imageViewer.setNavigation((direction) => {
    if (direction === 'next') controller.navigateNext();
    if (direction === 'prev') controller.navigatePrevious();
  }, { hasNext, hasPrev });

  // Ensure analysis is loaded before updating context
  await controller.ensureAnalysisLoaded(imageData.imageId);
  imageData.analysis = controller.dataStore.getAnalysis(imageData.imageId);

  // Update image context
  updateImageContext(imageData);

  // Clear current labels
  currentLabels = { frame_state: null, visibility: null };
  updateLabelPills();

  // Clear button selection states
  document.querySelectorAll('[data-action="label-frame"], [data-action="label-visibility"]').forEach(btn => {
    btn.classList.remove('selected');
  });

  // Update navigation buttons
  updateNavigationButtons();
}

/**
 * Update image context display
 */
function updateImageContext(imageData) {
  // Update basic info
  document.getElementById('image-id').textContent = imageData.imageId;
  document.getElementById('image-time').textContent = formatTime(imageData.time);

  // Update analysis overlay
  updateAnalysisOverlay(imageData);

  // Clear all prediction areas (for expanded details)
  document.getElementById('analysis-predictions').innerHTML = '';
  document.getElementById('human-labels').innerHTML = '';
  document.getElementById('disagreement-info').innerHTML = '';

  // Analysis predictions (for expanded view)
  if (imageData.analysis) {
    const analysisEl = document.getElementById('analysis-predictions');
    
    // Frame state prediction
    const frameConf = Math.round((imageData.analysis.frame_state_probability || 0) * 100);
    const analysisPill = createPill(`Frame: ${imageData.analysis.frame_state} (${frameConf}%)`, 'analysis');
    analysisEl.appendChild(analysisPill);

    // Visibility prediction (if frame is good)
    if (imageData.analysis.frame_state === 'good' && imageData.analysis.visibility) {
      const visConf = Math.round((imageData.analysis.visibility_prob || 0) * 100);
      const visPill = createPill(`Visibility: ${imageData.analysis.visibility} (${visConf}%)`, 'analysis');
      analysisEl.appendChild(visPill);
    }
  }

  // Human labels (for expanded view)
  if (imageData.existingLabel) {
    const humanEl = document.getElementById('human-labels');
    
    const labelText = `Frame: ${imageData.existingLabel.frameState} (${imageData.existingLabel.labelSource})`;
    const labelPill = createPill(labelText, imageData.existingLabel.labelSource);
    humanEl.appendChild(labelPill);

    if (imageData.existingLabel.visibility) {
      const visLabelPill = createPill(`Visibility: ${imageData.existingLabel.visibility} (${imageData.existingLabel.labelSource})`, imageData.existingLabel.labelSource);
      humanEl.appendChild(visLabelPill);
    }
  } else {
    document.getElementById('human-labels').innerHTML = '<span class="no-labels">No manual labels yet</span>';
  }

  // Disagreement section (for expanded view)
  const disagreementSection = document.getElementById('disagreement-section');
  if (controller.detectDisagreement(imageData)) {
    disagreementSection.style.display = 'block';
    const disagreementPill = createPill('AI and manual labels disagree', 'disagreement');
    document.getElementById('disagreement-info').appendChild(disagreementPill);
  } else {
    disagreementSection.style.display = 'none';
  }
}

/**
 * Update compact analysis overlay on image
 */
function updateAnalysisOverlay(imageData) {
  const overlay = document.getElementById('analysis-overlay');
  const predictionLine = document.getElementById('prediction-line');
  const manualLine = document.getElementById('manual-line');
  
  console.log('Overlay elements:', { overlay, predictionLine, manualLine }); // Debug log
  
  if (!overlay || !predictionLine || !manualLine) {
    console.warn('Analysis overlay elements not found');
    return;
  }
  
  if (!imageData) {
    overlay.style.display = 'none';
    return;
  }
  
  console.log('Showing overlay for:', imageData.imageId); // Debug log
  overlay.style.display = 'block';
  
  // Prediction line
  let predictionText = 'Prediction - ';
  if (imageData.analysis) {
    const frameConf = Math.round((imageData.analysis.frame_state_probability || 0) * 100);
    predictionText += `F: ${imageData.analysis.frame_state} (${frameConf}%)`;
    
    if (imageData.analysis.frame_state === 'good' && imageData.analysis.visibility) {
      const visConf = Math.round((imageData.analysis.visibility_prob || 0) * 100);
      predictionText += `; V: ${imageData.analysis.visibility} (${visConf}%)`;
    }
  } else {
    predictionText += 'No analysis data';
  }
  predictionLine.textContent = predictionText;
  
  // Manual line
  let manualText = 'Manual - ';
  if (imageData.existingLabel) {
    manualText += `(${imageData.existingLabel.labelSource}) F: ${imageData.existingLabel.frameState}`;
    if (imageData.existingLabel.visibility) {
      manualText += `; V: ${imageData.existingLabel.visibility}`;
    }
  } else {
    manualText += 'No labels yet';
  }
  manualLine.textContent = manualText;
}

/**
 * Create prediction pill element
 */
function createPill(text, type) {
  const pill = document.createElement('span');
  pill.className = `pill pill--${type}`;
  pill.textContent = text;
  return pill;
}

/**
 * Handle progress updates
 */
function handleProgressUpdate(progress) {
  document.getElementById('progress-text').textContent = `${progress.current} of ${progress.total} images`;
  document.getElementById('progress-fill').style.width = `${progress.percent}%`;
  document.getElementById('batch-status').textContent = `Batch: ${progress.batchSize} pending (auto-submits at 10)`;
  document.getElementById('batch-count').textContent = progress.batchSize;

  // Enable/disable batch submit button
  const batchButton = document.querySelector('[data-action="submit-batch"]');
  batchButton.disabled = progress.batchSize === 0;
}

/**
 * Handle batch submission results
 */
function handleBatchSubmit(result) {
  if (result.success) {
    console.log(`Batch submitted: ${result.count} labels`);
    
    // Show success message with auto-submit indicator
    const message = result.auto 
      ? `✓ Auto-submitted ${result.count} labels (batch full)`
      : `✓ Submitted ${result.count} labels`;
    showSuccessMessage(message);
    
    // Update batch counter immediately
    document.getElementById('batch-count').textContent = '0';
    document.getElementById('batch-status').textContent = 'Batch: 0 pending (auto-submits at 10)';
    
    // Disable batch submit button
    const batchButton = document.querySelector('[data-action="submit-batch"]');
    batchButton.disabled = true;
  } else {
    alert(`Failed to submit batch: ${result.error}`);
  }
}

/**
 * Set frame state label
 */
function setFrameState(value) {
  currentLabels.frame_state = value;
  updateLabelPills();

  // Update button selection states
  document.querySelectorAll('[data-action="label-frame"]').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.value === value);
  });

  // Enable/disable visibility buttons
  const visibilityButtons = document.querySelectorAll('[data-action="label-visibility"]');
  if (value === 'good') {
    visibilityButtons.forEach(btn => btn.disabled = false);
  } else {
    visibilityButtons.forEach(btn => btn.disabled = true);
    currentLabels.visibility = null;
    
    // Clear visibility button selection
    visibilityButtons.forEach(btn => btn.classList.remove('selected'));
    
    // Auto-save and advance for non-good frames
    saveCurrentLabel();
    controller.navigateNext();
  }
}

/**
 * Set visibility label
 */
function setVisibility(value) {
  if (currentLabels.frame_state !== 'good') return;

  currentLabels.visibility = value;
  updateLabelPills();

  // Update button selection states
  document.querySelectorAll('[data-action="label-visibility"]').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.value === value);
  });

  // Auto-save and advance
  saveCurrentLabel();
  controller.navigateNext();
}

/**
 * Save current label to batch
 */
function saveCurrentLabel() {
  const imageData = controller.getCurrentImage();
  if (!imageData || !currentLabels.frame_state) return;

  controller.addLabelToBatch(
    imageData.imageId,
    currentLabels.frame_state,
    currentLabels.visibility
  );
}

/**
 * Skip current image
 */
function skipImage() {
  controller.navigateNext();
}

/**
 * Submit current batch
 */
async function submitBatch() {
  console.log('submitBatch called, hasUnsavedLabels:', controller.hasUnsavedLabels()); // Debug log
  
  if (!controller.hasUnsavedLabels()) {
    console.log('No unsaved labels to submit');
    return;
  }

  try {
    console.log('Attempting to submit batch...');
    await controller.submitBatch();
    console.log('Batch submitted successfully');
  } catch (err) {
    console.error('Failed to submit batch:', err);
    alert(`Failed to submit batch: ${err.message}`);
  }
}

/**
 * Update label pills display
 */
function updateLabelPills() {
  const frameElement = document.getElementById('pill-frame-state');
  const visibilityElement = document.getElementById('pill-visibility');
  
  if (frameElement) {
    frameElement.textContent = `Frame: ${currentLabels.frame_state ? snakeToTitle(currentLabels.frame_state) : '--'}`;
  }
  
  if (visibilityElement) {
    visibilityElement.textContent = `Visibility: ${currentLabels.visibility ? snakeToTitle(currentLabels.visibility) : '--'}`;
  }
}

/**
 * Update navigation button states
 */
function updateNavigationButtons() {
  const prevBtn = document.querySelector('[data-action="nav-prev"]');
  const nextBtn = document.querySelector('[data-action="nav-next"]');

  if (prevBtn) {
    prevBtn.disabled = controller.currentIndex <= 0;
  }
  if (nextBtn) {
    nextBtn.disabled = controller.currentIndex >= controller.filteredImages.length - 1;
  }
}

/**
 * Update confidence threshold display
 */
function updateConfidenceDisplay() {
  const slider = document.getElementById('confidence-threshold');
  const display = document.getElementById('confidence-value');
  display.textContent = slider.value;
}

/**
 * Clear image context
 */
function clearImageContext() {
  document.getElementById('image-id').textContent = '--';
  document.getElementById('image-time').textContent = '--';
  document.getElementById('analysis-predictions').innerHTML = '';
  document.getElementById('human-labels').innerHTML = '';
  document.getElementById('disagreement-info').innerHTML = '';
  document.getElementById('disagreement-section').style.display = 'none';
  
  const overlay = document.getElementById('analysis-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

/**
 * Format time for display
 */
function formatTime(timeStr) {
  if (!timeStr || timeStr.length !== 4) return timeStr;
  const hours = timeStr.substring(0, 2);
  const minutes = timeStr.substring(2, 4);
  return `${hours}:${minutes}`;
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
 * Show success message temporarily
 */
function showSuccessMessage(message) {
  // Remove existing success message
  const existing = document.querySelector('.success-message');
  if (existing) existing.remove();
  
  // Create success message
  const successEl = document.createElement('div');
  successEl.className = 'success-message';
  successEl.textContent = message;
  
  // Add to page
  document.body.appendChild(successEl);
  
  console.log('Success message added:', message); // Debug log
  
  // Remove after 3 seconds
  setTimeout(() => {
    if (successEl.parentNode) {
      successEl.remove();
    }
  }, 3000);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
