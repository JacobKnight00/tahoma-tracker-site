// API Client
// Handles all API requests to the backend

import { config, getAdminToken } from '../../config/config.js';

/**
 * Fetch the latest status and image data
 * @returns {Promise<Object>} Latest data
 */
export async function fetchLatest() {
  const response = await fetch(config.api.latestUrl, {
    cache: 'no-store', // Don't cache, always get fresh data
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch latest data: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Submit a label for an image
 * @param {Object} labelData - Label data
 * @param {string} labelData.ts - ISO timestamp
 * @param {string} labelData.frame_state - Frame state label
 * @param {string|null} labelData.visibility - Visibility label (if frame is good)
 * @param {string} labelData.updated_by - Who submitted this label
 * @returns {Promise<Object>} Response from server
 */
export async function submitLabel(labelData) {
  const response = await fetch(config.api.submitLabelUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(getAdminToken() && { 'Authorization': `Bearer ${getAdminToken()}` }),
    },
    body: JSON.stringify(labelData),
  });

  if (!response.ok) {
    throw new Error(`Failed to submit label: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch list of unlabeled images
 * @param {number} limit - Max number of results
 * @returns {Promise<Array>} List of timestamps
 */
export async function fetchUnlabeled(limit = 100) {
  const url = new URL(config.api.unlabeledUrl, window.location.origin);
  url.searchParams.set('limit', limit);

  const response = await fetch(url.toString(), {
    headers: {
      ...(getAdminToken() && { 'Authorization': `Bearer ${getAdminToken()}` }),
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch unlabeled images: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch labels for a date range
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Array>} List of labels
 */
export async function fetchLabels(startDate, endDate) {
  const url = new URL(config.api.labelsUrl, window.location.origin);
  url.searchParams.set('start_date', startDate);
  url.searchParams.set('end_date', endDate);

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${getAdminToken()}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch labels: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch analysis data for a specific timestamp
 * @param {string} ts - ISO timestamp
 * @returns {Promise<Object>} Analysis data
 */
export async function fetchAnalysis(ts) {
  const date = new Date(ts);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  const path = `analysis/${year}/${month}/${day}/${hours}${minutes}.json`;
  const url = new URL(path, config.imageBaseUrl);

  const response = await fetch(url.toString(), {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch analysis: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get image URL for a given S3 key or timestamp
 * @param {string} keyOrTimestamp - S3 key or ISO timestamp
 * @returns {string} Image URL
 */
export function getImageUrl(keyOrTimestamp) {
  // If it starts with http, it's already a full URL
  if (keyOrTimestamp.startsWith('http')) {
    return keyOrTimestamp;
  }

  // If it contains slashes, assume it's an S3 key
  if (keyOrTimestamp.includes('/')) {
    return new URL(keyOrTimestamp, config.imageBaseUrl).toString();
  }

  // Otherwise, assume it's a timestamp - construct the path
  const date = new Date(keyOrTimestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  const path = `needle-cam/cropped-images/${year}/${month}/${day}/${hours}${minutes}.jpg`;
  return new URL(path, config.imageBaseUrl).toString();
}

/**
 * Fetch an image and return as a blob (for caching/preloading)
 * @param {string} keyOrTimestamp - S3 key or ISO timestamp
 * @returns {Promise<Blob>} Image blob
 */
export async function fetchImage(keyOrTimestamp) {
  const url = getImageUrl(keyOrTimestamp);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.statusText}`);
  }

  return response.blob();
}

// =============================================================================
// FUTURE: Manifest-based batch loading (not needed for MVP)
// =============================================================================

/**
 * Fetch daily manifest listing all available images for a date
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Object>} Manifest with timestamps array
 */
export async function fetchDayManifest(date) {
  const [year, month, day] = date.split('-');
  const path = `manifests/${year}/${month}/${day}.json`;
  const url = new URL(path, config.imageBaseUrl);

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`Failed to fetch manifest for ${date}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Batch load images for a day with progressive loading
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {Object} options - Loading options
 * @param {number} options.chunkSize - How many images to load at once (default 10)
 * @param {Function} options.onProgress - Callback for progress updates
 * @returns {Promise<Array>} Array of loaded image blobs
 */
export async function batchLoadImagesForDay(date, options = {}) {
  const { chunkSize = 10, onProgress } = options;

  // 1. Fetch the manifest
  const manifest = await fetchDayManifest(date);
  const timestamps = manifest.timestamps || [];
  const total = timestamps.length;

  // 2. Load images in chunks
  const results = [];
  for (let i = 0; i < timestamps.length; i += chunkSize) {
    const chunk = timestamps.slice(i, i + chunkSize);

    // Load chunk in parallel
    const chunkResults = await Promise.allSettled(
      chunk.map(ts => fetchImage(ts))
    );

    results.push(...chunkResults);

    // Report progress
    if (onProgress) {
      onProgress({
        loaded: results.length,
        total,
        percent: Math.round((results.length / total) * 100),
      });
    }
  }

  // 3. Filter out failures and return successful blobs
  return results
    .filter(result => result.status === 'fulfilled')
    .map(result => result.value);
}

/**
 * Prefetch images for faster navigation (preload in browser cache)
 * @param {Array<string>} timestamps - Array of timestamps to prefetch
 * @returns {Promise<void>}
 */
export async function prefetchImages(timestamps) {
  // Use Promise.allSettled to not fail if one image fails
  await Promise.allSettled(
    timestamps.map(ts => {
      const url = getImageUrl(ts);
      // Create a link element to trigger prefetch
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = url;
      document.head.appendChild(link);
    })
  );
}
