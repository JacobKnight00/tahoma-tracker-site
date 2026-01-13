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

    // Admin endpoints
    adminLabelsUrl: 'https://gjpbpt7mmhzphwhrhjdla2qsxm0zgtjn.lambda-url.us-west-2.on.aws/',
    adminBatchUrl: 'https://gjpbpt7mmhzphwhrhjdla2qsxm0zgtjn.lambda-url.us-west-2.on.aws/batch',
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
};
