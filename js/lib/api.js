// API Client
// Handles all API requests to the backend

import { config, getAdminToken } from '../../config/config.js';

// Track the current analysis path version (default to config)
const DEFAULT_ANALYSIS_VERSION = config.analysisVersion || 'v1';
let cachedAnalysisVersion = DEFAULT_ANALYSIS_VERSION;

const IMAGE_ID_REGEX = /^(\d{4})\/(\d{2})\/(\d{2})\/(\d{2})(\d{2})$/;

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

function normalizeData(raw = {}) {
  const data = { ...raw };

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

  const modelVersion =
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
    model_version: modelVersion,
    analysis_version: cachedAnalysisVersion,
    analysis_s3_key: data.analysis_s3_key || (imageId ? `analysis/${cachedAnalysisVersion}/${imageId}.json` : null),
    cropped_s3_key: data.cropped_s3_key || (imageId ? `needle-cam/cropped-images/${imageId}.jpg` : null),
    pano_s3_key: data.pano_s3_key || (imageId ? `needle-cam/panos/${imageId}.jpg` : null),
  };
}

function buildLabelPayload(labelData = {}) {
  const frameState = labelData.frameState || labelData.frame_state;
  const visibility = labelData.visibility ?? labelData.visibility_label ?? null;

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
  const response = await fetch(config.api.latestUrl, {
    cache: 'no-store', // Don't cache, always get fresh data
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch latest data: ${response.statusText}`);
  }

  const raw = await response.json();
  return normalizeData(raw);
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
  let rawBody = '';
  let fetchError = null;
  try {
    response = await fetch(config.api.submitLabelUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(getAdminToken() && { 'Authorization': `Bearer ${getAdminToken()}` }),
      },
      body: JSON.stringify(payload),
      mode: 'cors',
      cache: 'no-store',
    });
  } catch (err) {
    fetchError = err;
  }

  // If the network request threw (common when CORS blocks the response),
  // treat it as an "unconfirmed" success when the user is online so we
  // don't show a false failure even though the backend accepted the label.
  if (!response) {
    const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
    const isLikelyCorsBlock = fetchError instanceof TypeError && isOnline;

    if (isLikelyCorsBlock) {
      console.warn('Label submission response was blocked (likely CORS), treating as unconfirmed success.', fetchError);
      return { success: true, unconfirmed: true, message: 'Feedback submitted (response not confirmed).' };
    }

    throw new Error('We could not confirm your feedback. Please try again in a moment.');
  }

  try {
    rawBody = await response.text();
  } catch (err) {
    rawBody = '';
  }

  let responseBody = null;
  try {
    responseBody = rawBody ? JSON.parse(rawBody) : null;
  } catch (err) {
    // If the body isn't JSON, fall through and rely on status
  }

  const isOpaqueSuccess = response.type === 'opaque' && response.status === 0;
  const isSuccess = response.ok || responseBody?.success === true || isOpaqueSuccess;
  if (isSuccess) {
    const base = responseBody || { success: true, message: 'Label recorded' };
    return isOpaqueSuccess ? { ...base, unconfirmed: true } : base;
  }

  const errorMessage =
    responseBody?.error ||
    responseBody?.message ||
    response.statusText ||
    'We could not submit your feedback right now. Please try again.';
  throw new Error(errorMessage);
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
  const imageId = buildImageId(ts);
  const version = cachedAnalysisVersion || DEFAULT_ANALYSIS_VERSION;
  const path = `analysis/${version}/${imageId}.json`;
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
  });
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
 * @returns {Promise<Object>} Manifest with images array and summary
 */
export async function fetchDailyManifest(dateInput) {
  let dateStr;
  
  if (dateInput instanceof Date) {
    const year = dateInput.getFullYear();
    const month = String(dateInput.getMonth() + 1).padStart(2, '0');
    const day = String(dateInput.getDate()).padStart(2, '0');
    dateStr = `${year}-${month}-${day}`;
  } else {
    dateStr = dateInput;
  }
  
  // Check if this is today - use current.json
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  let path;
  if (dateStr === todayStr) {
    path = 'manifests/daily/current.json';
  } else {
    const [year, month, day] = dateStr.split('-');
    path = `manifests/daily/${year}/${month}/${day}.json`;
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
 * @returns {Promise<Object>} Monthly manifest with days object
 */
export async function fetchMonthlyManifest(year, month) {
  const monthStr = String(month).padStart(2, '0');
  
  // Check if this is current month - use current.json
  const today = new Date();
  const isCurrentMonth = year === today.getFullYear() && month === (today.getMonth() + 1);
  
  let path;
  if (isCurrentMonth) {
    path = 'manifests/monthly/current.json';
  } else {
    path = `manifests/monthly/${year}/${monthStr}.json`;
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
