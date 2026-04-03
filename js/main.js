// Main Entry Point for Home Page
// Fetches latest data and renders the UI

import { fetchLatest } from './lib/api.js';
import { StatusDisplay } from './components/StatusDisplay.js';
import { ImageViewer } from './components/ImageViewer.js';
import { MetadataDisplay } from './components/MetadataDisplay.js';
import { LabelForm } from './components/LabelForm.js';
import { TimelineViewer } from './components/TimelineViewer.js';
import { formatRelativeTime } from './utils/format.js';
import { buildSidebarStats } from './utils/manifestStats.js';
import { config } from '../config/config.js';

// Component instances
let statusDisplay;
let imageViewer;
let metadataDisplay;
let labelForm;
let timelineViewer;

// Prevent browser from restoring a stale scroll position on reload
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}
window.scrollTo(0, 0);

// Auto-refresh interval ID
let refreshIntervalId;

// Track current state
let latestData = null;
let isViewingLatest = true;

function ensureLabelForm() {
  if (!labelForm) {
    const container = document.getElementById('label-form-container');
    if (container) {
      labelForm = new LabelForm(container);
    }
  }
}

/**
 * Initialize the app
 */
async function init() {
  // Get DOM elements
  const statusContainer = document.getElementById('status-display');
  const imageContainer = document.getElementById('image-viewer');
  const metadataContainer = document.getElementById('metadata-display');
  const labelFormContainer = document.getElementById('label-form-container');
  const lastCheckedSpan = document.getElementById('last-checked');

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

  // Update "last checked" time every 10 seconds
  setInterval(() => {
    const latestData = window.latestData;
    if (latestData && latestData.last_checked_at) {
      lastCheckedSpan.textContent = formatRelativeTime(latestData.last_checked_at);
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

function setDailySidebarStatsIfNeeded(dailyManifest) {
  if (!metadataDisplay) {
    return;
  }

  if (!dailyManifest?.date) {
    metadataDisplay.setStats(null);
    return;
  }

  if (metadataDisplay.statsData?.date !== dailyManifest.date) {
    metadataDisplay.setStats(buildSidebarStats(dailyManifest, null));
  }
}

async function refreshLatestSidebarStats(dailyManifest) {
  if (!metadataDisplay) {
    return;
  }

  if (!dailyManifest?.date) {
    metadataDisplay.setStats(null);
    return;
  }

  const manifestDate = dailyManifest.date;
  const [year, month] = manifestDate.split('-').map((value) => Number.parseInt(value, 10));
  let monthlyManifest = null;

  if (timelineViewer?.getMonthlyManifest && Number.isInteger(year) && Number.isInteger(month)) {
    monthlyManifest = await timelineViewer.getMonthlyManifest(year, month);
  }

  if (!isViewingLatest || latestData?.daily_manifest?.date !== manifestDate) {
    return;
  }

  if (!monthlyManifest && metadataDisplay.statsData?.date === manifestDate) {
    return;
  }

  metadataDisplay.setStats(buildSidebarStats(dailyManifest, monthlyManifest));
}

/**
 * Handle timeline image change
 */
function handleTimelineImageChange(data, timestamp) {
  // If timestamp is null, user returned to latest
  if (!timestamp) {
    isViewingLatest = true;
    statusDisplay.render(latestData);
    setDailySidebarStatsIfNeeded(latestData?.daily_manifest);
    void refreshLatestSidebarStats(latestData?.daily_manifest);
    // Clear navigation arrows when viewing latest
    imageViewer.clearNavigationArrows();
  } else {
    isViewingLatest = false;
    statusDisplay.render(data);
  }

  // Keep label form pointed at the image currently being viewed
  ensureLabelForm();
  if (labelForm && data) {
    const ts = timestamp || data?.ts || data?.timestamp || null;
    labelForm.setTarget(data, ts);
  }

  updatePageTitleTense();
}

/**
 * Load latest data from manifest + analysis
 */
async function loadLatestData() {
  try {
    const data = await fetchLatest();
    const timestamp = data.ts || data.timestamp;

    // Check if image actually changed (avoid unnecessary re-renders and flashing)
    const previousTimestamp = latestData?.ts || latestData?.timestamp;
    const imageChanged = timestamp !== previousTimestamp;

    // Store globally
    latestData = data;
    window.latestData = data;
    if (isViewingLatest || !timelineViewer || timelineViewer.frames.length === 0) {
      setDailySidebarStatsIfNeeded(data.daily_manifest);
      void refreshLatestSidebarStats(data.daily_manifest);
    }

    // Only update UI if we're still viewing the latest
    if (isViewingLatest) {
      // Always update status display (small, doesn't cause flashing)
      statusDisplay.render(data);
      
      // Only re-render image and metadata if the image actually changed
      if (imageChanged || !previousTimestamp) {
        imageViewer.render(data);
        metadataDisplay.render(data);
        // Clear navigation arrows when viewing latest
        imageViewer.clearNavigationArrows();
      }
    }

    ensureLabelForm();

    if (labelForm && isViewingLatest) {
      labelForm.setTarget(data, timestamp);
    }

    // Update last checked time
    const lastCheckedSpan = document.getElementById('last-checked');
    if (data.last_checked_at) {
      lastCheckedSpan.textContent = formatRelativeTime(data.last_checked_at);
    }

    // Keep timeline captured display in sync when viewing latest
    if (isViewingLatest && timelineViewer && timestamp) {
      const timestampDate = new Date(timestamp);
      timelineViewer.updateCapturedDisplay(timestampDate);
    }

    if (timelineViewer && timelineViewer.frames.length > 0) {
      void timelineViewer.syncWithLatestData(data, { viewingLatest: isViewingLatest });
    }
    
    updatePageTitleTense();
    
    // Initialize timeline on first load (loads frames but doesn't change the image)
    if (timelineViewer && timelineViewer.frames.length === 0) {
      timelineViewer.initialize(data);
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
      setDailySidebarStatsIfNeeded(latestData.daily_manifest);
      void refreshLatestSidebarStats(latestData.daily_manifest);
      // Clear navigation arrows when returning to latest
      imageViewer.clearNavigationArrows();
      ensureLabelForm();
      if (labelForm) {
        labelForm.setTarget(latestData, latestData.ts || latestData.timestamp);
      }
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
