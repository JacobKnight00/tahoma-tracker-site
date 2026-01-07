// Main Entry Point for Home Page
// Fetches latest data and renders the UI

import { fetchLatest } from './lib/api.js';
import { StatusDisplay } from './components/StatusDisplay.js';
import { ImageViewer } from './components/ImageViewer.js';
import { MetadataDisplay } from './components/MetadataDisplay.js';
import { LabelForm } from './components/LabelForm.js';
import { TimelineViewer } from './components/TimelineViewer.js';
import { formatRelativeTime } from './utils/format.js';
import { config } from '../config/config.js';

// Component instances
let statusDisplay;
let imageViewer;
let metadataDisplay;
let labelForm;
let timelineViewer;

// Auto-refresh interval ID
let refreshIntervalId;

// Track current state
let latestData = null;
let isViewingLatest = true;

/**
 * Initialize the app
 */
async function init() {
  // Get DOM elements
  const statusContainer = document.getElementById('status-display');
  const imageContainer = document.getElementById('image-viewer');
  const metadataContainer = document.getElementById('metadata-display');
  const labelFormContainer = document.getElementById('label-form-container');
  const lastUpdatedSpan = document.getElementById('last-updated');

  // Create component instances
  statusDisplay = new StatusDisplay(statusContainer);
  imageViewer = new ImageViewer(imageContainer);
  metadataDisplay = new MetadataDisplay(metadataContainer);
  
  // Create timeline viewer
  timelineViewer = new TimelineViewer({
    imageViewer,
    metadataDisplay,
    onImageChange: handleTimelineImageChange
  });

  // Show loading states
  statusDisplay.renderLoading();
  imageViewer.renderLoading();

  // Load initial data first
  await loadLatestData();

  // Set up auto-refresh
  refreshIntervalId = setInterval(async () => {
    await loadLatestData();
  }, config.refreshInterval);

  // Update "last updated" time every 10 seconds
  setInterval(() => {
    const latestData = window.latestData;
    if (latestData && latestData.updated_at) {
      lastUpdatedSpan.textContent = formatRelativeTime(latestData.updated_at);
    }
  }, 10000);
}

/**
 * Update the page title tense and status based on current view
 */
function updatePageTitleTense() {
  const titleTense = document.getElementById('page-title-tense');
  if (titleTense) {
    titleTense.textContent = isViewingLatest ? 'Is' : 'Was';
  }
}

/**
 * Handle timeline image change
 */
function handleTimelineImageChange(data, timestamp) {
  // If timestamp is null, user returned to latest
  if (!timestamp) {
    isViewingLatest = true;
    statusDisplay.render(latestData);
  } else {
    isViewingLatest = false;
    statusDisplay.render(data);
  }
  updatePageTitleTense();
}

/**
 * Load latest data from API
 */
async function loadLatestData() {
  try {
    const data = await fetchLatest();

    // Store globally
    latestData = data;
    window.latestData = data;

    // Only update UI if we're still viewing the latest
    if (isViewingLatest) {
      // Render components
      statusDisplay.render(data);
      imageViewer.render(data);
      metadataDisplay.render(data);
    }

    // Initialize label form if not already done
    const timestamp = data.ts || data.timestamp;
    if (timestamp && !labelForm) {
      labelForm = new LabelForm(
        document.getElementById('label-form-container'),
        timestamp
      );
      labelForm.render();
    }

    // Update last updated time
    const lastUpdatedSpan = document.getElementById('last-updated');
    if (data.updated_at) {
      lastUpdatedSpan.textContent = formatRelativeTime(data.updated_at);
    }

    // Keep timeline captured display in sync when viewing latest
    if (isViewingLatest && timelineViewer && timestamp) {
      timelineViewer.updateCapturedDisplay(timestamp);
    }
    
    updatePageTitleTense();
    
    // Initialize timeline on first load (loads frames but doesn't change the image)
    if (timelineViewer && timelineViewer.frames.length === 0) {
      timelineViewer.initialize();
    }
  } catch (error) {
    console.error('Failed to load latest data:', error);
    statusDisplay.renderError('Failed to load data. Please refresh the page.');
    imageViewer.renderError('Failed to load image.');
  }
}

// Handle timeline close event (from Jump to Latest button)
window.addEventListener('timelineClose', () => {
  if (timelineViewer) {
    // Reset to latest when closing timeline
    isViewingLatest = true;
    if (latestData) {
      statusDisplay.render(latestData);
      imageViewer.render(latestData);
      metadataDisplay.render(latestData);
      timelineViewer.resetToLatest(latestData);
    }
    updatePageTitleTense();
  }
});

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  if (refreshIntervalId) {
    clearInterval(refreshIntervalId);
  }
});
