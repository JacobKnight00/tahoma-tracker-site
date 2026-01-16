// Model Comparison Page
// Compare predictions between two model versions

import { config } from '../config/config.js';
import { CompareController } from './CompareController.js';
import { ImageViewer } from '../components/ImageViewer.js';
import { createKeyboardShortcuts } from '../utils/keyboard.js';

let controller;
let imageViewer;
let keyboard;

async function init() {
  controller = new CompareController();
  imageViewer = new ImageViewer(document.getElementById('compare-image-viewer'));
  keyboard = createKeyboardShortcuts();

  controller.onImageChange = handleImageChange;
  controller.onStatsUpdate = handleStatsUpdate;

  populateModelDropdowns();
  registerEventHandlers();
  registerKeyboardShortcuts();
  setDefaultDates();
}

function populateModelDropdowns() {
  const modelA = document.getElementById('model-a');
  const modelB = document.getElementById('model-b');
  
  config.models.available.forEach(version => {
    modelA.add(new Option(version, version));
    modelB.add(new Option(version, version));
  });
  
  modelA.value = config.models.available[0];
  modelB.value = config.models.current;
}

function registerEventHandlers() {
  document.getElementById('apply-filters').addEventListener('click', applyFilters);
  document.getElementById('reset-filters').addEventListener('click', resetFilters);
  
  // Navigation
  document.querySelector('[data-action="nav-prev"]')?.addEventListener('click', () => controller.navigatePrevious());
  document.querySelector('[data-action="nav-next"]')?.addEventListener('click', () => controller.navigateNext());
  document.querySelector('[data-action="next-disagree"]')?.addEventListener('click', () => controller.navigateNextDisagreement());
  
  // Filter checkboxes
  document.getElementById('filter-disagree-frame')?.addEventListener('change', (e) => {
    controller.updateFilter('showDisagreeFrame', e.target.checked);
  });
  document.getElementById('filter-disagree-visibility')?.addEventListener('change', (e) => {
    controller.updateFilter('showDisagreeVisibility', e.target.checked);
  });
  document.getElementById('filter-agree')?.addEventListener('change', (e) => {
    controller.updateFilter('showAgree', e.target.checked);
  });
  
  // Frame state checkboxes
  ['good', 'off_target', 'dark', 'bad'].forEach(state => {
    const id = `frame-${state.replace('_', '-')}`;
    document.getElementById(id)?.addEventListener('change', updateFrameStateFilter);
  });
  
  // Confidence diff
  document.getElementById('confidence-diff-min')?.addEventListener('change', (e) => {
    controller.updateFilter('confidenceDiffMin', parseInt(e.target.value) || 0);
  });
}

function registerKeyboardShortcuts() {
  keyboard.register('arrowleft', () => controller.navigatePrevious());
  keyboard.register('arrowright', () => controller.navigateNext());
  keyboard.register('d', () => controller.navigateNextDisagreement());
}

function setDefaultDates() {
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  document.getElementById('start-date').value = dateStr;
  document.getElementById('end-date').value = dateStr;
}

function updateFrameStateFilter() {
  const states = new Set();
  ['good', 'off_target', 'dark', 'bad'].forEach(state => {
    const id = `frame-${state.replace('_', '-')}`;
    if (document.getElementById(id)?.checked) states.add(state);
  });
  controller.updateFilter('frameStates', states);
}

async function applyFilters() {
  const startDate = document.getElementById('start-date').value;
  const endDate = document.getElementById('end-date').value;
  const modelA = document.getElementById('model-a').value;
  const modelB = document.getElementById('model-b').value;

  if (!startDate || !endDate) {
    alert('Please select both start and end dates');
    return;
  }

  if (modelA === modelB) {
    alert('Please select different models to compare');
    return;
  }

  imageViewer.showInitialLoading();
  document.getElementById('apply-filters').disabled = true;
  document.getElementById('apply-filters').textContent = 'Loading...';

  try {
    controller.setModels(modelA, modelB);
    await controller.loadDataForDateRange(startDate, endDate);

    document.getElementById('compare-summary').style.display = 'flex';
    document.getElementById('compare-details').style.display = 'block';

    if (controller.filteredImages.length > 0) {
      handleImageChange(controller.getCurrentImage());
      updateNavigationButtons();
    } else {
      imageViewer.renderError('No images found for comparison');
    }
  } catch (err) {
    console.error('Failed to load comparison data:', err);
    imageViewer.renderError('Failed to load data. Please try again.');
  } finally {
    document.getElementById('apply-filters').disabled = false;
    document.getElementById('apply-filters').textContent = 'Compare';
  }
}

function resetFilters() {
  document.getElementById('filter-disagree-frame').checked = true;
  document.getElementById('filter-disagree-visibility').checked = true;
  document.getElementById('filter-agree').checked = true;
  document.getElementById('confidence-diff-min').value = 0;
  
  ['good', 'off-target', 'dark', 'bad'].forEach(state => {
    document.getElementById(`frame-${state}`).checked = true;
  });
  
  document.getElementById('model-a').value = config.models.available[0];
  document.getElementById('model-b').value = config.models.current;
}

function handleImageChange(imageData) {
  if (!imageData) {
    imageViewer.renderError('No images match filters');
    clearDetails();
    return;
  }

  imageViewer.renderUrl(controller.getCurrentImageUrl(), `Image ${imageData.imageId}`);
  
  // Navigation arrows
  const hasNext = controller.currentIndex < controller.filteredImages.length - 1;
  const hasPrev = controller.currentIndex > 0;
  imageViewer.setNavigation((dir) => {
    if (dir === 'next') controller.navigateNext();
    if (dir === 'prev') controller.navigatePrevious();
  }, { hasNext, hasPrev });

  updateDetails(imageData);
  updateNavigationButtons();
}

function handleStatsUpdate(stats) {
  document.getElementById('stat-total').textContent = stats.total;
  document.getElementById('stat-agree').textContent = stats.agree;
  document.getElementById('stat-disagree-frame').textContent = stats.disagreeFrame;
  document.getElementById('stat-disagree-visibility').textContent = stats.disagreeVisibility;
  
  const rate = stats.total > 0 ? Math.round((stats.agree / stats.total) * 100) : 0;
  document.getElementById('stat-agreement-rate').textContent = `${rate}%`;
}

function updateDetails(imageData) {
  document.getElementById('image-id').textContent = imageData.imageId;
  document.getElementById('image-time').textContent = formatTime(imageData.time);
  document.getElementById('progress-text').textContent = 
    `${controller.currentIndex + 1} of ${controller.filteredImages.length}`;

  // Model A results
  const modelALabel = document.getElementById('model-a-label');
  const modelAResults = document.querySelector('#model-a-result .model-result__predictions');
  modelALabel.textContent = controller.modelA;
  modelAResults.innerHTML = formatAnalysis(imageData.analysisA);

  // Model B results
  const modelBLabel = document.getElementById('model-b-label');
  const modelBResults = document.querySelector('#model-b-result .model-result__predictions');
  modelBLabel.textContent = controller.modelB;
  modelBResults.innerHTML = formatAnalysis(imageData.analysisB);

  // Differences
  const diffSection = document.getElementById('diff-section');
  const diffContent = document.getElementById('diff-content');
  
  if (!imageData.comparison.fullyAgree) {
    diffSection.style.display = 'block';
    diffContent.innerHTML = formatDifferences(imageData);
  } else {
    diffSection.style.display = 'none';
  }
}

function formatAnalysis(analysis) {
  const frameConf = analysis.frameProb != null ? `${Math.round(analysis.frameProb * 100)}%` : '--';
  let html = `<div class="prediction-row">
    <span class="prediction-label">Frame:</span>
    <span class="prediction-value">${analysis.frameState || '--'}</span>
    <span class="prediction-conf">(${frameConf})</span>
  </div>`;
  
  if (analysis.frameState === 'good' && analysis.visibility) {
    const visConf = analysis.visProb != null ? `${Math.round(analysis.visProb * 100)}%` : '--';
    html += `<div class="prediction-row">
      <span class="prediction-label">Visibility:</span>
      <span class="prediction-value">${analysis.visibility}</span>
      <span class="prediction-conf">(${visConf})</span>
    </div>`;
  }
  
  return html;
}

function formatDifferences(imageData) {
  const { comparison, analysisA, analysisB } = imageData;
  let html = '';
  
  if (!comparison.frameAgree) {
    html += `<div class="diff-row diff-row--disagree">
      <span>Frame state:</span>
      <span>${analysisA.frameState} → ${analysisB.frameState}</span>
      <span>(Δ ${Math.round(comparison.frameProbDiff)}%)</span>
    </div>`;
  }
  
  if (!comparison.visAgree && analysisA.frameState === 'good') {
    html += `<div class="diff-row diff-row--disagree">
      <span>Visibility:</span>
      <span>${analysisA.visibility || '--'} → ${analysisB.visibility || '--'}</span>
      <span>(Δ ${Math.round(comparison.visProbDiff)}%)</span>
    </div>`;
  }
  
  return html;
}

function clearDetails() {
  document.getElementById('image-id').textContent = '--';
  document.getElementById('image-time').textContent = '--';
  document.getElementById('progress-text').textContent = '0 of 0';
  document.querySelector('#model-a-result .model-result__predictions').innerHTML = '';
  document.querySelector('#model-b-result .model-result__predictions').innerHTML = '';
  document.getElementById('diff-section').style.display = 'none';
}

function updateNavigationButtons() {
  const prevBtn = document.querySelector('[data-action="nav-prev"]');
  const nextBtn = document.querySelector('[data-action="nav-next"]');
  const disagreeBtn = document.querySelector('[data-action="next-disagree"]');

  if (prevBtn) prevBtn.disabled = controller.currentIndex <= 0;
  if (nextBtn) nextBtn.disabled = controller.currentIndex >= controller.filteredImages.length - 1;
  if (disagreeBtn) disagreeBtn.disabled = controller.filteredImages.length === 0;
}

function formatTime(timeStr) {
  if (!timeStr || timeStr.length !== 4) return timeStr;
  return `${timeStr.substring(0, 2)}:${timeStr.substring(2, 4)}`;
}

// Initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
