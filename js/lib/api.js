// API Client
// Handles all API requests to the backend

import { config } from '../../config/config.js';

// Track the current analysis path version (default to config)
let cachedAnalysisVersion = config.models.current;

const IMAGE_ID_REGEX = /^(\d{4})\/(\d{2})\/(\d{2})\/(\d{2})(\d{2})$/;

// ---------------------------------------------------------------------------
// Error Handling
// ---------------------------------------------------------------------------

function handleApiError(err, userMessage) {
  console.error('API network error:', err);
  throw new Error(userMessage);
}

async function handleApiResponse(response, successMessage, processedCount = null) {
  let responseBody = null;
  try {
    responseBody = await response.json();
    console.log('Response body:', responseBody); // Debug log
  } catch (err) {
    console.log('Non-JSON response, status:', response.status); // Debug log
  }

  if (response.ok || responseBody?.success) {
    const defaultResponse = processedCount !== null 
      ? { success: true, processed: processedCount, failed: 0 }
      : { success: true, message: successMessage };
    return responseBody || defaultResponse;
  }

  console.error('API request failed:', {
    status: response.status,
    statusText: response.statusText,
    body: responseBody
  });
  
  const errorMessage = responseBody?.error || responseBody?.message || response.statusText || 'Something went wrong. Please try again.';
  throw new Error(errorMessage);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function updateCachedAnalysisVersionFromKey(key) {
  const match = key?.match(/analysis\/([^/]+)\//);
  if (match?.[1]) {
    cachedAnalysisVersion = match[1];
  }
}

function getDateParts(dateInput) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return null;

  return {
    year: date.getFullYear(),
    month: String(date.getMonth() + 1).padStart(2, '0'),
    day: String(date.getDate()).padStart(2, '0'),
    hours: String(date.getHours()).padStart(2, '0'),
    minutes: String(date.getMinutes()).padStart(2, '0'),
  };
}

export function buildImageId(input) {
  if (typeof input === 'string') {
    const cleaned = input.replace('.json', '').replace('.jpg', '');
    if (IMAGE_ID_REGEX.test(cleaned)) {
      return cleaned;
    }
  }

  const parts = getDateParts(input);
  if (!parts) {
    throw new Error('Invalid timestamp provided to buildImageId');
  }

  return `${parts.year}/${parts.month}/${parts.day}/${parts.hours}${parts.minutes}`;
}

function parseImageIdToDate(imageId) {
  const match = IMAGE_ID_REGEX.exec(imageId);
  if (!match) return null;

  const [, year, month, day, hours, minutes] = match.map(Number);
  // Use local time to stay consistent with original timeline behavior
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

function getTopLabel(probabilities = {}) {
  let topLabel = null;
  let topValue = Number.NEGATIVE_INFINITY;

  for (const [label, value] of Object.entries(probabilities)) {
    if (value > topValue) {
      topValue = value;
      topLabel = label;
    }
  }

  return topLabel;
}

function extractImageIdFromKey(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/(\d{4}\/\d{2}\/\d{2}\/\d{4})/);
  return match?.[1] || null;
}

function resolveImageId(source = {}) {
  const directId = source.imageId || source.image_id;
  if (directId) {
    try {
      return buildImageId(directId);
    } catch (err) {
      // Fallback to other options if provided id is malformed
    }
  }

  const fromKey =
    extractImageIdFromKey(source.cropped_s3_key) ||
    extractImageIdFromKey(source.pano_s3_key) ||
    extractImageIdFromKey(source.analysis_s3_key);

  if (fromKey) {
    return fromKey;
  }

  const timestampInput =
    source.ts ||
    source.timestamp ||
    source.targetTimestamp ||
    (source.time instanceof Date ? source.time : null);

  try {
    return timestampInput ? buildImageId(timestampInput) : null;
  } catch (err) {
    return null;
  }
}

function normalizeData(raw = {}, version = null) {
  const data = { ...raw };
  const modelVersion = version || config.models.current;

  if (data.analysis_s3_key) {
    updateCachedAnalysisVersionFromKey(data.analysis_s3_key);
  }

  let imageId = resolveImageId(data);

  let ts = data.ts || data.timestamp;
  if (!ts && imageId) {
    const dateFromImageId = parseImageIdToDate(imageId);
    if (dateFromImageId) {
      ts = dateFromImageId.toISOString();
    }
  }

  const frameProbs = data.frame_state_probabilities || {};
  const visibilityProbs = data.visibility_probabilities || {};

  let frameState = data.frame_state;
  let frameStateProbability = data.frame_state_probability;

  if (!frameState && Object.keys(frameProbs).length > 0) {
    frameState = getTopLabel(frameProbs);
  }
  if (frameState && frameProbs[frameState] != null) {
    frameStateProbability = frameProbs[frameState];
  }

  let visibility = data.visibility;
  if (!visibility && Object.keys(visibilityProbs).length > 0 && (!frameState || frameState === 'good')) {
    visibility = getTopLabel(visibilityProbs);
  }

  let visibilityProb = data.visibility_prob ?? null;
  if (visibility && visibilityProbs[visibility] != null) {
    visibilityProb = visibilityProbs[visibility];
  }

  const modelVersionFromData =
    data.model_version ||
    data.visibility_model_version ||
    data.frame_state_model_version ||
    null;

  return {
    ...data,
    status: typeof data.status === 'string' ? data.status.toUpperCase() : (data.status || 'OK'),
    image_id: imageId || null,
    ts: ts || null,
    timestamp: ts || data.timestamp || null,
    frame_state: frameState || null,
    frame_state_probability: frameStateProbability ?? null,
    frame_state_probabilities: frameProbs,
    visibility: visibility ?? null,
    visibility_prob: visibilityProb ?? null,
    visibility_probabilities: visibilityProbs,
    model_version: modelVersionFromData,
    analysis_version: modelVersion,
    analysis_s3_key: data.analysis_s3_key || (imageId ? `analysis/${modelVersion}/${imageId}.json` : null),
    cropped_s3_key: data.cropped_s3_key || (imageId ? `needle-cam/cropped-images/${imageId}.jpg` : null),
    pano_s3_key: data.pano_s3_key || (imageId ? `needle-cam/panos/${imageId}.jpg` : null),
  };
}

function buildLabelPayload(labelData = {}) {
  const frameState = labelData.frameState || labelData.frame_state;
  let visibility = labelData.visibility ?? labelData.visibility_label ?? null;

  // Map frontend visibility values to backend expected values
  if (visibility === 'partial') {
    visibility = 'partially_out';
  }

  const imageId = resolveImageId(labelData);

  if (!imageId) {
    throw new Error('imageId is required for label submission');
  }

  if (!frameState) {
    throw new Error('frameState is required for label submission');
  }

  if (frameState === 'good') {
    if (!visibility) {
      throw new Error('visibility is required when frameState is good');
    }

    return { imageId, frameState, visibility };
  }

  return { imageId, frameState };
}

/**
 * Fetch the latest status and image data
 * @returns {Promise<Object>} Latest data
 */
export async function fetchLatest() {
  // Get today's manifest to find the latest image and last_checked_at
  const manifest = await fetchDailyManifest(new Date());
  const images = manifest.images || [];
  const lastImage = images[images.length - 1];

  if (!lastImage) {
    throw new Error('No images available today');
  }

  // Build imageId from manifest date and time
  const [year, month, day] = manifest.date.split('-');
  const imageId = `${year}/${month}/${day}/${lastImage.time}`;

  // Fetch full analysis for rich data (probabilities, model version, etc.)
  const data = await fetchAnalysis(imageId);
  
  // Add last_checked_at from manifest
  data.last_checked_at = manifest.last_checked_at;
  
  return data;
}

/**
 * Submit a label for an image
 * @param {Object} labelData - Label data
 * @param {string} labelData.imageId - Image identifier (YYYY/MM/DD/HHmm)
 * @param {string} labelData.frameState - Frame state label
 * @param {string|null} labelData.visibility - Visibility label (required if frameState is "good")
 * @returns {Promise<Object>} Response from server
 */
export async function submitLabel(labelData) {
  const payload = buildLabelPayload(labelData);

  let response;
  try {
    response = await fetch(config.api.submitLabelUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      mode: 'cors',
      cache: 'no-store',
    });
  } catch (err) {
    return handleApiError(err, 'Unable to connect. Please check your internet and try again.');
  }

  return handleApiResponse(response, 'Label recorded');
}

/**
 * Fetch list of unlabeled images
 * @param {number} limit - Max number of results
 * @returns {Promise<Array>} List of timestamps
 */
export async function fetchUnlabeled(limit = 100) {
  const url = new URL(config.api.unlabeledUrl, window.location.origin);
  url.searchParams.set('limit', limit);

  const response = await fetch(url.toString());

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

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`Failed to fetch labels: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch admin labels for a date range with filtering options
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @param {Object} options - Filtering options
 * @param {string} options.excludeLabeled - "admin", "crowd", "any", "none"
 * @param {string} options.labelSource - "admin", "crowd"
 * @returns {Promise<Object>} Response with labels array and count
 */
export async function fetchAdminLabels(startDate, endDate, options = {}) {
  const url = new URL(config.api.adminLabelsUrl);
  url.searchParams.set('startDate', startDate);
  url.searchParams.set('endDate', endDate);
  
  if (options.excludeLabeled) {
    url.searchParams.set('excludeLabeled', options.excludeLabeled);
  }
  if (options.labelSource) {
    url.searchParams.set('labelSource', options.labelSource);
  }

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`Failed to fetch admin labels: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Submit multiple labels in a batch
 * @param {Array} labels - Array of label objects
 * @param {Object} options - Batch options
 * @param {string} options.updatedBy - User identifier
 * @returns {Promise<Object>} Batch submission response
 */
export async function submitLabelBatch(labels, options = {}) {
  const payload = {
    labels: labels.map(label => buildLabelPayload(label)),
    updatedBy: options.updatedBy || 'admin_user',
  };

  console.log('Submitting batch:', payload); // Debug log

  let response;
  try {
    response = await fetch(config.api.adminBatchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      mode: 'cors',
      cache: 'no-store',
    });
    
    console.log('Response status:', response.status); // Debug log
    console.log('Response headers:', Object.fromEntries(response.headers.entries())); // Debug log
    
  } catch (err) {
    console.error('Network error:', err); // Debug log
    return handleApiError(err, 'Unable to connect. Please check your internet and try again.');
  }

  return handleApiResponse(response, 'Batch submission completed', labels.length);
}

/**
 * Fetch analysis data for a specific timestamp
 * @param {string} ts - ISO timestamp
 * @param {string} version - Model version (optional, defaults to current)
 * @returns {Promise<Object>} Analysis data
 */
export async function fetchAnalysis(ts, version = null) {
  const imageId = buildImageId(ts);
  const modelVersion = version || config.models.current;
  const path = `analysis/${modelVersion}/${imageId}.json`;
  const url = new URL(path, config.imageBaseUrl);

  const response = await fetch(url.toString(), {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch analysis: ${response.statusText}`);
  }

  const raw = await response.json();
  return normalizeData({
    ...raw,
    image_id: raw.image_id || imageId,
    analysis_s3_key: raw.analysis_s3_key || path,
  }, modelVersion);
}

/**
 * Get image URL for a given S3 key or timestamp
 * @param {string} keyOrTimestamp - S3 key or ISO timestamp
 * @returns {string} Image URL
 */
export function getImageUrl(keyOrTimestamp) {
  if (!keyOrTimestamp) {
    throw new Error('No key or timestamp provided for image URL');
  }

  const value = keyOrTimestamp instanceof Date ? keyOrTimestamp.toISOString() : String(keyOrTimestamp);

  // If it starts with http, it's already a full URL
  if (value.startsWith('http')) {
    return value;
  }

  // If it looks like a direct S3 key or already has an extension
  const isS3Key = value.includes('needle-cam') || value.endsWith('.jpg') || value.startsWith('analysis/');
  if (isS3Key) {
    return new URL(value, config.imageBaseUrl).toString();
  }

  // If it matches an image_id (YYYY/MM/DD/HHMM), build cropped path
  const potentialId = value.replace('.json', '').replace('.jpg', '');
  if (IMAGE_ID_REGEX.test(potentialId)) {
    const path = `needle-cam/cropped-images/${potentialId}.jpg`;
    return new URL(path, config.imageBaseUrl).toString();
  }

  // If it contains slashes, assume it's an S3 key
  if (value.includes('/')) {
    return new URL(value, config.imageBaseUrl).toString();
  }

  // Otherwise, assume it's a timestamp - construct the path
  const imageId = buildImageId(value);
  const path = `needle-cam/cropped-images/${imageId}.jpg`;
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
 * @param {Date|string} dateInput - Date object or date in YYYY-MM-DD format
 * @param {string} version - Model version (optional, defaults to current)
 * @returns {Promise<Object>} Manifest with images array and summary
 */
export async function fetchDailyManifest(dateInput, version = null) {
  const modelVersion = version || config.models.current;
  
  let dateStr;
  if (dateInput instanceof Date) {
    const year = dateInput.getFullYear();
    const month = String(dateInput.getMonth() + 1).padStart(2, '0');
    const day = String(dateInput.getDate()).padStart(2, '0');
    dateStr = `${year}-${month}-${day}`;
  } else {
    dateStr = dateInput;
  }
  
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  let path;
  if (dateStr === todayStr && modelVersion === config.models.current) {
    path = 'manifests/daily/current.json';
  } else {
    const [year, month, day] = dateStr.split('-');
    path = `manifests/daily/${modelVersion}/${year}/${month}/${day}.json`;
  }
  
  const url = new URL(path, config.imageBaseUrl);
  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`Failed to fetch daily manifest for ${dateStr}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch monthly manifest for calendar color-coding
 * @param {number} year - Year (e.g., 2025)
 * @param {number} month - Month (1-12)
 * @param {string} version - Model version (optional, defaults to current)
 * @returns {Promise<Object>} Monthly manifest with days object
 */
export async function fetchMonthlyManifest(year, month, version = null) {
  const modelVersion = version || config.models.current;
  const monthStr = String(month).padStart(2, '0');
  
  const today = new Date();
  const isCurrentMonth = year === today.getFullYear() && month === (today.getMonth() + 1);
  
  let path;
  if (isCurrentMonth && modelVersion === config.models.current) {
    path = 'manifests/monthly/current.json';
  } else {
    path = `manifests/monthly/${modelVersion}/${year}/${monthStr}.json`;
  }
  
  const url = new URL(path, config.imageBaseUrl);
  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`Failed to fetch monthly manifest for ${year}-${monthStr}: ${response.statusText}`);
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
