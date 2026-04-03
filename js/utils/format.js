// Formatting Utilities

/**
 * Format a number as a percentage
 * @param {number} value - Value between 0 and 1
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted percentage (e.g., "93%")
 */
export function formatPercent(value, decimals = 0) {
  if (value == null || isNaN(value)) {
    return '--';
  }
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Format an ISO timestamp to a readable date/time string
 * @param {string} isoString - ISO 8601 timestamp
 * @param {Object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date/time
 */
export function formatTimestamp(isoString, options = {}) {
  if (!isoString) {
    return '--';
  }

  const date = new Date(isoString);

  const defaultOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  };

  return new Intl.DateTimeFormat('en-US', {
    ...defaultOptions,
    ...options,
  }).format(date);
}

/**
 * Format a timestamp to just the time portion
 * @param {string|Date} isoStringOrDate - ISO 8601 timestamp or Date object
 * @returns {string} Formatted time (e.g., "2:30 PM")
 */
export function formatTime(isoStringOrDate) {
  if (!isoStringOrDate) {
    return '--';
  }
  
  const date = isoStringOrDate instanceof Date ? isoStringOrDate : new Date(isoStringOrDate);
  
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

/**
 * Format a timestamp to just the date portion
 * @param {string} isoString - ISO 8601 timestamp
 * @returns {string} Formatted date (e.g., "Jan 15, 2025")
 */
export function formatDate(isoString) {
  return formatTimestamp(isoString, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format a relative time (e.g., "5 minutes ago")
 * @param {string} isoString - ISO 8601 timestamp
 * @returns {string} Relative time
 */
export function formatRelativeTime(isoString) {
  if (!isoString) {
    return '--';
  }

  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) {
    return 'just now';
  } else if (diffMin < 60) {
    return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
  } else if (diffHour < 24) {
    return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`;
  } else {
    return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
  }
}

/**
 * Capitalize first letter of a string
 * @param {string} str - String to capitalize
 * @returns {string} Capitalized string
 */
export function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Convert snake_case to Title Case
 * @param {string} str - Snake case string
 * @returns {string} Title case string
 */
export function snakeToTitle(str) {
  if (!str) return '';
  if (str === 'off_target') return 'Off-Target';
  return str
    .split('_')
    .map(word => capitalize(word))
    .join(' ');
}
