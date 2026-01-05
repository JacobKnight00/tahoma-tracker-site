// History Page Entry Point
// Allows viewing historical images by day

import { getImageUrl, fetchAnalysis } from './lib/api.js';
import { ImageViewer } from './components/ImageViewer.js';
import { formatTime } from './utils/format.js';
import { config } from '../config/config.js';

// State
let currentDate = new Date();
let frames = [];
let currentFrameIndex = 0;
let imageViewer;
let isLoading = false;
let isPlaying = false;
let playInterval = null;
let imageCache = new Map(); // Cache for preloaded images

/**
 * Generate list of potential timestamps for a given day
 */
function generatePotentialTimestamps(date) {
  const timestamps = [];
  const { startHour, endHour, intervalMinutes } = config.timeWindow;
  
  // Create a new date at the start of the day in local time
  const day = new Date(date);
  day.setHours(startHour, 0, 0, 0);
  
  // Generate timestamps from startHour to endHour (inclusive of the last interval)
  // e.g., 4:00 AM to 10:50 PM (22:50)
  while (day.getHours() < endHour || (day.getHours() === endHour && day.getMinutes() <= 50)) {
    timestamps.push(new Date(day));
    day.setMinutes(day.getMinutes() + intervalMinutes);
  }
  
  return timestamps;
}

/**
 * Fetch available frames for a given day by checking which analysis files exist
 */
async function fetchFramesForDay(date) {
  const potentialTimestamps = generatePotentialTimestamps(date);
  const availableFrames = [];
  
  // Check each timestamp to see if the analysis file exists
  // We'll do this in batches to avoid overwhelming the server
  const batchSize = 10;
  
  for (let i = 0; i < potentialTimestamps.length; i += batchSize) {
    const batch = potentialTimestamps.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (timestamp) => {
        try {
          // Try to fetch the analysis file - if it exists, the image should too
          await fetchAnalysis(timestamp.toISOString());
          return timestamp;
        } catch (error) {
          // File doesn't exist, return null
          return null;
        }
      })
    );
    
    // Add successful timestamps to available frames
    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value !== null) {
        availableFrames.push(result.value);
      }
    });
  }
  
  return availableFrames;
}

/**
 * Preload an image into cache
 */
function preloadImage(url) {
  return new Promise((resolve, reject) => {
    if (imageCache.has(url)) {
      resolve();
      return;
    }
    
    const img = new Image();
    img.onload = () => {
      imageCache.set(url, img);
      resolve();
    };
    img.onerror = () => reject();
    img.src = url;
  });
}

/**
 * Preload all images for the current day
 */
async function preloadAllImages() {
  // Preload in batches of 10 for better performance
  const batchSize = 10;
  
  for (let i = 0; i < frames.length; i += batchSize) {
    const batch = frames.slice(i, i + batchSize);
    await Promise.allSettled(
      batch.map(frame => {
        const url = getImageUrl(frame.toISOString());
        return preloadImage(url);
      })
    );
  }
}

/**
 * Update the UI with current frame
 */
function updateView() {
  if (frames.length === 0) {
    imageViewer.renderError('No frames for this day');
    document.getElementById('frame-info').textContent = '';
    return;
  }
  
  const currentFrame = frames[currentFrameIndex];
  const imageUrl = getImageUrl(currentFrame.toISOString());
  
  // Update image
  imageViewer.renderUrl(imageUrl, `Mt. Rainier at ${formatTime(currentFrame)}`);
  
  // Update scrubber position
  updateScrubberPosition();
  
  // Update frame info
  const frameInfo = document.getElementById('frame-info');
  frameInfo.textContent = formatTime(currentFrame);
  
  // Update button states
  document.getElementById('prev-frame-btn').disabled = currentFrameIndex === 0;
  document.getElementById('next-frame-btn').disabled = currentFrameIndex === frames.length - 1;
}

/**
 * Load frames for the current date
 */
async function loadDate() {
  if (isLoading) return;
  
  // Stop playback if active
  if (isPlaying) {
    togglePlay();
  }
  
  // Clear image cache
  imageCache.clear();
  
  isLoading = true;
  imageViewer.renderLoading();
  document.getElementById('frame-info').textContent = 'Loading...';
  
  // Update date picker
  const datePicker = document.getElementById('date-picker');
  const year = currentDate.getFullYear();
  const month = String(currentDate.getMonth() + 1).padStart(2, '0');
  const day = String(currentDate.getDate()).padStart(2, '0');
  datePicker.value = `${year}-${month}-${day}`;
  
  // Fetch available frames
  try {
    frames = await fetchFramesForDay(currentDate);
    currentFrameIndex = 0;
    
    if (frames.length === 0) {
      imageViewer.renderError('No images available for this day');
      document.getElementById('frame-info').textContent = '';
    } else {
      // Preload all images for smooth playback
      document.getElementById('frame-info').textContent = 'Loading images...';
      await preloadAllImages();
      
      // Update scrubber
      updateScrubber();
      
      // Update view with first frame
      updateView();
    }
  } catch (error) {
    console.error('Error loading frames:', error);
    imageViewer.renderError('Failed to load images');
    document.getElementById('frame-info').textContent = '';
  } finally {
    isLoading = false;
  }
  
  // Update day navigation button states
  const now = new Date();
  let maxDate = new Date(now);
  maxDate.setHours(0, 0, 0, 0);
  
  // If it's before 4 AM, use yesterday as max date
  if (now.getHours() < 4) {
    maxDate.setDate(maxDate.getDate() - 1);
  }
  
  const currentDateMidnight = new Date(currentDate);
  currentDateMidnight.setHours(0, 0, 0, 0);
  document.getElementById('next-day-btn').disabled = currentDateMidnight >= maxDate;
}

/**
 * Navigate to previous frame
 */
function prevFrame() {
  if (currentFrameIndex > 0) {
    currentFrameIndex--;
    updateView();
  }
}

/**
 * Navigate to next frame
 */
function nextFrame() {
  if (currentFrameIndex < frames.length - 1) {
    currentFrameIndex++;
    updateView();
  } else if (isPlaying) {
    // If playing and reached the end, stop
    togglePlay();
  }
}

/**
 * Update the scrubber track
 */
function updateScrubber() {
  const scrubberTrack = document.getElementById('scrubber-track');
  const scrubberHandle = document.getElementById('scrubber-handle');
  if (!scrubberTrack || !scrubberHandle) return;
  
  let isDragging = false;
  
  // Function to update position based on mouse X
  const updatePosition = (clientX) => {
    const rect = scrubberTrack.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const percent = Math.max(0, Math.min(1, clickX / rect.width));
    const index = Math.round(percent * (frames.length - 1));
    currentFrameIndex = Math.max(0, Math.min(frames.length - 1, index));
    updateView();
  };
  
  // Click on track
  scrubberTrack.addEventListener('click', (e) => {
    if (e.target === scrubberHandle) return;
    updatePosition(e.clientX);
  });
  
  // Drag handle
  scrubberHandle.addEventListener('mousedown', (e) => {
    isDragging = true;
    e.preventDefault();
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    updatePosition(e.clientX);
  });
  
  document.addEventListener('mouseup', () => {
    isDragging = false;
  });
  
  // Touch support for mobile
  scrubberHandle.addEventListener('touchstart', (e) => {
    isDragging = true;
    e.preventDefault();
  });
  
  document.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    updatePosition(touch.clientX);
  });
  
  document.addEventListener('touchend', () => {
    isDragging = false;
  });
}

/**
 * Update the scrubber active position indicator
 */
function updateScrubberPosition() {
  const scrubberHandle = document.getElementById('scrubber-handle');
  const scrubberProgress = document.getElementById('scrubber-progress');
  if (!scrubberHandle || frames.length === 0) return;
  
  const percent = (currentFrameIndex / (frames.length - 1)) * 100;
  scrubberHandle.style.left = `${percent}%`;
  
  if (scrubberProgress) {
    scrubberProgress.style.width = `${percent}%`;
  }
}

/**
 * Toggle play/pause
 */
function togglePlay() {
  isPlaying = !isPlaying;
  
  const playBtn = document.getElementById('play-btn');
  
  if (isPlaying) {
    playBtn.textContent = 'Pause';
    playBtn.classList.add('playing');
    
    // Start auto-advancing (2 frames per second)
    playInterval = setInterval(() => {
      nextFrame();
    }, 500);
  } else {
    playBtn.textContent = 'Play';
    playBtn.classList.remove('playing');
    
    // Stop auto-advancing
    if (playInterval) {
      clearInterval(playInterval);
      playInterval = null;
    }
  }
}

/**
 * Navigate to previous day
 */
function prevDay() {
  currentDate.setDate(currentDate.getDate() - 1);
  loadDate();
}

/**
 * Navigate to next day
 */
function nextDay() {
  const now = new Date();
  let maxDate = new Date(now);
  maxDate.setHours(0, 0, 0, 0);
  
  // If it's before 4 AM, use yesterday as max date
  if (now.getHours() < 4) {
    maxDate.setDate(maxDate.getDate() - 1);
  }
  
  const nextDate = new Date(currentDate);
  nextDate.setDate(nextDate.getDate() + 1);
  nextDate.setHours(0, 0, 0, 0);
  
  if (nextDate <= maxDate) {
    currentDate = nextDate;
    loadDate();
  }
}

/**
 * Initialize the history viewer
 */
async function init() {
  // Get DOM elements
  const historyContainer = document.getElementById('history-viewer');
  const datePicker = document.getElementById('date-picker');
  const prevDayBtn = document.getElementById('prev-day-btn');
  const nextDayBtn = document.getElementById('next-day-btn');
  const prevFrameBtn = document.getElementById('prev-frame-btn');
  const nextFrameBtn = document.getElementById('next-frame-btn');
  const playBtn = document.getElementById('play-btn');
  
  if (!historyContainer || !datePicker) {
    console.error('Required DOM elements not found!');
    return;
  }
  
  // Create image viewer
  imageViewer = new ImageViewer(historyContainer);
  
  // Determine the max date for the picker
  const now = new Date();
  let maxDate = new Date(now);
  maxDate.setHours(0, 0, 0, 0);
  
  // If it's before 4 AM, use yesterday as max date
  if (now.getHours() < 4) {
    maxDate.setDate(maxDate.getDate() - 1);
  }
  
  // Initialize currentDate to the max available date
  currentDate = new Date(maxDate);
  
  // Set date picker min (2025-01-01) and max
  const minDateString = config.historicalDataStart;
  const maxYear = maxDate.getFullYear();
  const maxMonth = String(maxDate.getMonth() + 1).padStart(2, '0');
  const maxDay = String(maxDate.getDate()).padStart(2, '0');
  const maxDateString = `${maxYear}-${maxMonth}-${maxDay}`;
  
  datePicker.min = minDateString;
  datePicker.max = maxDateString;
  datePicker.value = maxDateString;
  
  // Set up event listeners
  prevDayBtn.addEventListener('click', () => {
    prevDay();
  });
  
  nextDayBtn.addEventListener('click', () => {
    nextDay();
  });
  
  prevFrameBtn.addEventListener('click', () => {
    prevFrame();
  });
  
  nextFrameBtn.addEventListener('click', () => {
    nextFrame();
  });
  
  playBtn.addEventListener('click', () => {
    togglePlay();
  });
  
  datePicker.addEventListener('change', (e) => {
    // Parse the date properly - the input gives us YYYY-MM-DD in local time
    const [year, month, day] = e.target.value.split('-').map(Number);
    const selected = new Date(year, month - 1, day); // month is 0-indexed
    if (!isNaN(selected.getTime())) {
      currentDate = selected;
      loadDate();
    }
  });
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Don't handle if typing in input
    if (e.target.tagName === 'INPUT') return;
    
    switch(e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        prevFrame();
        break;
      case 'ArrowRight':
        e.preventDefault();
        nextFrame();
        break;
      case 'ArrowUp':
        e.preventDefault();
        prevDay();
        break;
      case 'ArrowDown':
        e.preventDefault();
        nextDay();
        break;
    }
  });
  
  // Load initial data
  await loadDate();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
