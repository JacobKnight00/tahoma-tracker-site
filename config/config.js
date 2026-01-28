// Configuration
// This file contains environment-specific settings

export const config = {
  // API endpoints (proxied through Cloudflare Pages Functions)
  api: {
    // Label submission (crowdsource)
    submitLabelUrl: '/api/labels',

    // Admin endpoints
    adminLabelsUrl: '/api/admin/labels',
    adminBatchUrl: '/api/admin/labels/batch',
  },

  // S3/CDN base URL for images
  // For local dev, use placeholder
  // For production, use CloudFront or S3 URL
  imageBaseUrl: 'https://deaf937kouf5m.cloudfront.net',

  // Model configuration
  models: {
    current: 'v2',
    available: ['v1', 'v2'],
  },

  // Date range for historical data
  historicalDataStart: '2023-01-01',

  // Time window (local time)
  timeWindow: {
    startHour: 4,   // 4:00 AM
    endHour: 22,    // 10:50 PM (last time is 22:50)
    intervalMinutes: 10,
  },

  // Auto-refresh interval (milliseconds)
  refreshInterval: 60000, // 60 seconds

  // Timeline playback speed (milliseconds between frames)
  playbackInterval: 500,
};
