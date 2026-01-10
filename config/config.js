// Configuration
// This file contains environment-specific settings

export const config = {
  // API endpoints
  api: {
    // Label submission endpoint (Lambda Function URL)
    submitLabelUrl: 'https://2wzfh4dbilq3h5yajwn74ipoxm0opeum.lambda-url.us-west-2.on.aws/',

    // Get unlabeled images
    unlabeledUrl: '/api/unlabeled',

    // Get labels (admin only)
    labelsUrl: '/api/labels',
  },

  // S3/CDN base URL for images
  // For local dev, use placeholder
  // For production, use CloudFront or S3 URL
  imageBaseUrl: 'https://deaf937kouf5m.cloudfront.net',
  // Versioned analysis path segment (used for timeline/history fetches)
  analysisVersion: 'v1',

  // Date range for historical data
  historicalDataStart: '2025-01-01',

  // Time window (local time)
  timeWindow: {
    startHour: 4,   // 4:00 AM
    endHour: 22,    // 10:50 PM (last time is 22:50)
    intervalMinutes: 10,
  },

  // Auto-refresh interval (milliseconds)
  refreshInterval: 60000, // 60 seconds

  // Admin authentication (simple token-based for now)
  // In production, this would be in environment variables
  adminToken: null, // Will check URL params or localStorage
};

// Get admin token from URL params or localStorage
export function getAdminToken() {
  // Check URL params
  const urlParams = new URLSearchParams(window.location.search);
  const urlToken = urlParams.get('token');

  if (urlToken) {
    // Store in localStorage for future visits
    localStorage.setItem('adminToken', urlToken);
    return urlToken;
  }

  // Check localStorage
  return localStorage.getItem('adminToken');
}

// Check if user is authenticated as admin
export function isAdmin() {
  return !!getAdminToken();
}
