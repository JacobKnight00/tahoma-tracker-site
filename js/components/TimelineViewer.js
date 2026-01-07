// Timeline Viewer Component
// Embedded timeline viewer for the home page

import { getImageUrl, fetchAnalysis } from '../lib/api.js';
import { formatTime, formatTimestamp } from '../utils/format.js';
import { config } from '../../config/config.js';

export class TimelineViewer {
  constructor(options) {
    this.imageViewer = options.imageViewer;
    this.metadataDisplay = options.metadataDisplay;
    this.onImageChange = options.onImageChange;
    
    this.currentDate = new Date();
    this.minDate = config.historicalDataStart ? new Date(config.historicalDataStart) : null;
    if (this.minDate) {
      this.minDate.setHours(0, 0, 0, 0);
    }
    this.frames = [];
    this.currentFrameIndex = 0;
    this.isLoading = false;
    this.isPlaying = false;
    this.playInterval = null;
    this.imageCache = new Map();
    this.pendingLoad = null;
    
    this.initializeElements();
    this.setupEventListeners();
  }
  
  // Initialize and load today's frames
  async initialize() {
    await this.loadDate(null, { render: false });
  }
  
  initializeElements() {
    this.prevDayBtn = document.getElementById('timeline-prev-day');
    this.nextDayBtn = document.getElementById('timeline-next-day');
    this.dateDisplay = document.getElementById('timeline-date-display');
    this.timeDisplay = document.getElementById('timeline-time-display');
    this.playBtn = document.getElementById('timeline-play-btn');
    this.latestBtn = document.getElementById('timeline-latest-btn');
    this.expandBtn = document.getElementById('timeline-expand-btn');
    this.controlsExpanded = document.getElementById('timeline-controls-expanded');
    this.capturedEl = document.getElementById('timeline-captured');
    this.capturedValueEl = document.getElementById('timeline-captured-value');
    this.scrubberTrack = document.getElementById('timeline-scrubber-track');
    this.scrubberHandle = document.getElementById('timeline-scrubber-handle');
    this.scrubberProgress = document.getElementById('timeline-scrubber-progress');
  }
  
  setupEventListeners() {
    this.prevDayBtn?.addEventListener('click', () => this.prevDay());
    this.nextDayBtn?.addEventListener('click', () => this.nextDay());
    this.playBtn?.addEventListener('click', () => this.togglePlay());
    this.latestBtn?.addEventListener('click', () => this.jumpToLatest());
    this.expandBtn?.addEventListener('click', () => this.toggleExpanded());
    
    // Scrubber events
    this.setupScrubberEvents();
  }
  
  setupScrubberEvents() {
    if (!this.scrubberTrack || !this.scrubberHandle) return;
    
    let isDragging = false;
    
    const updatePosition = (clientX) => {
      const rect = this.scrubberTrack.getBoundingClientRect();
      const clickX = clientX - rect.left;
      const percent = Math.max(0, Math.min(1, clickX / rect.width));
      const index = Math.round(percent * (this.frames.length - 1));
      this.currentFrameIndex = Math.max(0, Math.min(this.frames.length - 1, index));
      this.updateView();
    };

    const extractClientX = (event) => {
      if (event.touches && event.touches.length > 0) {
        return event.touches[0].clientX;
      }
      return event.clientX;
    };
    
    this.scrubberTrack.addEventListener('click', (e) => {
      if (e.target === this.scrubberHandle) return;
      updatePosition(e.clientX);
    });
    
    this.scrubberHandle.addEventListener('mousedown', (e) => {
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

    // Touch support
    this.scrubberTrack.addEventListener('touchstart', (e) => {
      const x = extractClientX(e);
      if (x !== undefined) {
        updatePosition(x);
      }
      isDragging = true;
      e.preventDefault();
    }, { passive: false });

    this.scrubberHandle.addEventListener('touchstart', (e) => {
      isDragging = true;
      e.preventDefault();
    }, { passive: false });

    document.addEventListener('touchmove', (e) => {
      if (!isDragging) return;
      const x = extractClientX(e);
      if (x !== undefined) {
        updatePosition(x);
      }
      e.preventDefault();
    }, { passive: false });

    document.addEventListener('touchend', () => {
      isDragging = false;
    });
  }
  
  generatePotentialTimestamps(date) {
    const timestamps = [];
    const { startHour, endHour, intervalMinutes } = config.timeWindow;
    
    const day = new Date(date);
    day.setHours(startHour, 0, 0, 0);
    
    while (day.getHours() < endHour || (day.getHours() === endHour && day.getMinutes() <= 50)) {
      timestamps.push(new Date(day));
      day.setMinutes(day.getMinutes() + intervalMinutes);
    }
    
    return timestamps;
  }
  
  async fetchFramesForDay(date) {
    const potentialTimestamps = this.generatePotentialTimestamps(date);
    const availableFrames = [];
    const batchSize = 10;
    
    for (let i = 0; i < potentialTimestamps.length; i += batchSize) {
      const batch = potentialTimestamps.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (timestamp) => {
          try {
            await fetchAnalysis(timestamp.toISOString());
            return timestamp;
          } catch (error) {
            return null;
          }
        })
      );
      
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value !== null) {
          availableFrames.push(result.value);
        }
      });
    }
    
    return availableFrames;
  }
  
  preloadImage(url) {
    return new Promise((resolve) => {
      if (this.imageCache.has(url)) {
        resolve();
        return;
      }
      
      const img = new Image();
      img.onload = () => {
        this.imageCache.set(url, img);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = url;
    });
  }
  
  async preloadAllImages() {
    const batchSize = 10;
    
    for (let i = 0; i < this.frames.length; i += batchSize) {
      const batch = this.frames.slice(i, i + batchSize);
      await Promise.allSettled(
        batch.map(frame => {
          const url = getImageUrl(frame.toISOString());
          return this.preloadImage(url);
        })
      );
    }
  }
  
  updateScrubberPosition() {
    if (!this.scrubberHandle || this.frames.length === 0) return;
    
    const denominator = Math.max(1, this.frames.length - 1);
    const percent = (this.currentFrameIndex / denominator) * 100;
    this.scrubberHandle.style.left = `${percent}%`;
    
    if (this.scrubberProgress) {
      this.scrubberProgress.style.width = `${percent}%`;
    }
  }
  
  async updateView(options = {}) {
    if (this.frames.length === 0) return;
    
    const currentFrame = this.frames[this.currentFrameIndex];
    const imageUrl = getImageUrl(currentFrame.toISOString());
    
    // Update time display
    if (this.timeDisplay) {
      this.timeDisplay.textContent = formatTime(currentFrame);
    }
    this.updateCapturedDisplay(currentFrame);
    
    // Update scrubber
    this.updateScrubberPosition();
    
    // Update image viewer and metadata
    this.imageViewer.renderUrl(imageUrl, `Mt. Rainier at ${formatTime(currentFrame)}`);
    
    // Use latest data if frame matches latest timestamp
    const latestData = window.latestData;
    const latestTs = latestData?.ts || latestData?.timestamp;
    const isLatestFrame = latestTs && new Date(latestTs).getTime() === currentFrame.getTime();
    
    if (isLatestFrame && latestData) {
      this.metadataDisplay.render(latestData);
      if (this.onImageChange) {
        this.onImageChange(latestData, null);
      }
      return;
    }
    
    // Fetch and update metadata (async, don't await to keep it fast)
    fetchAnalysis(currentFrame.toISOString())
      .then(data => {
        this.metadataDisplay.render(data);
        
        // Notify parent about image change
        if (this.onImageChange) {
          const isLatestFrame = this.isAtLatestFrame();
          this.onImageChange(data, isLatestFrame ? null : currentFrame);
        }
      })
      .catch(error => {
        console.error('Failed to fetch analysis:', error);
      });

    this.updateLatestButton();
  }
  
  async loadDate(targetTime = null, options = { render: true }) {
    if (this.isLoading) return;
    
    if (this.isPlaying) {
      this.togglePlay();
    }
    
    this.imageCache.clear();
    this.isLoading = true;
    
    // Update date display
    this.updateDateDisplay();
    
    if (this.timeDisplay) {
      this.timeDisplay.textContent = 'Loading...';
    }
    
    try {
      this.setNavigationDisabled(true);
      this.frames = await this.fetchFramesForDay(this.currentDate);
      
      if (this.frames.length === 0) {
        if (this.timeDisplay) {
          this.timeDisplay.textContent = 'No data';
        }
        this.updateCapturedDisplay(null);
      } else {
        // Choose frame: match targetTime if provided, else latest
        this.currentFrameIndex = this.findFrameIndex(targetTime);
        
        // Preload all images
        await this.preloadAllImages();
        
        // Update scrubber position
        this.updateScrubberPosition();
        
        if (this.timeDisplay) {
          this.timeDisplay.textContent = formatTime(this.frames[this.currentFrameIndex]);
        }
        this.updateCapturedDisplay(this.frames[this.currentFrameIndex]);
        
        if (options.render) {
          await this.updateView();
        }
      }
    } catch (error) {
      console.error('Error loading frames:', error);
      if (this.timeDisplay) {
        this.timeDisplay.textContent = 'Error';
      }
    } finally {
      this.isLoading = false;
      this.setNavigationDisabled(false);
      this.updateNavigationButtons();
    }
  }

  findFrameIndex(targetTime) {
    if (!targetTime || this.frames.length === 0) {
      return this.frames.length - 1;
    }
    const targetMs = targetTime.getTime();
    for (let i = this.frames.length - 1; i >= 0; i--) {
      if (this.frames[i].getTime() <= targetMs) {
        return i;
      }
    }
    return this.frames.length - 1;
  }
  
  updateDateDisplay() {
    if (!this.dateDisplay) return;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentDateMidnight = new Date(this.currentDate);
    currentDateMidnight.setHours(0, 0, 0, 0);
    
    const month = String(this.currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(this.currentDate.getDate()).padStart(2, '0');
    const year = this.currentDate.getFullYear();
    
    if (currentDateMidnight.getTime() === today.getTime()) {
      this.dateDisplay.textContent = 'Today';
    } else {
      this.dateDisplay.textContent = `${month}/${day}/${year}`;
    }
  }
  
  updateNavigationButtons() {
    const maxDate = this.getMaxDate();
    const minDate = this.getMinDate();
    const currentDateMidnight = new Date(this.currentDate);
    currentDateMidnight.setHours(0, 0, 0, 0);
    
    if (this.nextDayBtn) {
      this.nextDayBtn.disabled = this.isLoading || currentDateMidnight >= maxDate;
    }
    if (this.prevDayBtn) {
      this.prevDayBtn.disabled = this.isLoading || (minDate && currentDateMidnight <= minDate);
    }
    if (this.playBtn) {
      this.playBtn.disabled = this.isLoading;
    }
    this.updateLatestButton();
    if (this.expandBtn) {
      this.expandBtn.disabled = this.isLoading;
    }
  }

  isAtLatestFrame() {
    const latestData = window.latestData;
    const ts = latestData?.ts || latestData?.timestamp;
    if (!ts || this.frames.length === 0) return false;
    const latestTime = new Date(ts).getTime();
    const currentTime = this.frames[this.currentFrameIndex]?.getTime();
    return latestTime === currentTime;
  }

  updateLatestButton() {
    if (!this.latestBtn) return;
    const atLatest = this.isAtLatestFrame();
    this.latestBtn.disabled = this.isLoading || atLatest;
  }

  prevDay() {
    if (this.isLoading) return;
    const minDate = this.getMinDate();
    const currentMidnight = new Date(this.currentDate);
    currentMidnight.setHours(0, 0, 0, 0);
    if (minDate && currentMidnight <= minDate) return;

    const targetTime = this.frames[this.currentFrameIndex] || null;
    this.currentDate.setDate(this.currentDate.getDate() - 1);
    this.loadDate(targetTime ? this.shiftDateToCurrent(targetTime) : null, { render: true });
  }
  
  nextDay() {
    if (this.isLoading) return;
    const maxDate = this.getMaxDate();
    
    const nextDate = new Date(this.currentDate);
    nextDate.setDate(nextDate.getDate() + 1);
    nextDate.setHours(0, 0, 0, 0);
    
    if (nextDate <= maxDate) {
      const targetTime = this.frames[this.currentFrameIndex] || null;
      this.currentDate = nextDate;
      this.loadDate(targetTime ? this.shiftDateToCurrent(targetTime) : null, { render: true });
    }
  }

  shiftDateToCurrent(time) {
    const target = new Date(this.currentDate);
    target.setHours(time.getHours(), time.getMinutes(), 0, 0);
    return target;
  }
  
  prevFrame() {
    if (this.currentFrameIndex > 0) {
      this.currentFrameIndex--;
      this.updateView();
    }
  }
  
  nextFrame() {
    if (this.currentFrameIndex < this.frames.length - 1) {
      this.currentFrameIndex++;
      this.updateView();
    } else if (this.isPlaying) {
      // restart from beginning when at last frame during play
      this.currentFrameIndex = 0;
      this.updateView();
    }
  }
  
  togglePlay() {
    this.isPlaying = !this.isPlaying;
    
    if (this.isPlaying) {
      this.playBtn.innerHTML = '⏸ Pause';
      this.playBtn.classList.add('playing');
      // restart if currently at last frame
      if (this.currentFrameIndex >= this.frames.length - 1) {
        this.currentFrameIndex = 0;
      }
      this.updateView();
      
      this.playInterval = setInterval(() => {
        this.nextFrame();
      }, 500);
    } else {
      this.playBtn.innerHTML = '▶ Play';
      this.playBtn.classList.remove('playing');
      
      if (this.playInterval) {
        clearInterval(this.playInterval);
        this.playInterval = null;
      }
    }
  }
  
  // Reset to latest image
  resetToLatest(latestData) {
    this.frames = [];
    this.currentFrameIndex = 0;
    this.imageCache.clear();
    
    if (this.isPlaying) {
      this.togglePlay();
    }
    
    // Reset date to today
    this.currentDate = new Date();
    this.updateDateDisplay();
    
    // Notify parent
    if (this.onImageChange) {
      this.onImageChange(latestData, null);
    }
  }
  
  // Toggle expanded controls
  toggleExpanded() {
    const isExpanded = this.controlsExpanded.style.display !== 'none';
    if (isExpanded) {
      this.controlsExpanded.style.display = 'none';
      this.expandBtn.classList.remove('expanded');
    } else {
      this.controlsExpanded.style.display = 'block';
      this.expandBtn.classList.add('expanded');
    }
  }
  
  // Jump to latest - keep controls open and update scrubber
  jumpToLatest() {
    const latestData = window.latestData;
    const ts = latestData?.ts || latestData?.timestamp;
    if (!latestData || !ts) return;
    
    if (this.isPlaying) {
      this.togglePlay();
    }
    
    const latestDate = new Date(ts);
    this.currentDate = new Date(latestDate);
    this.updateDateDisplay();
    
    // Ensure controls stay open
    if (this.controlsExpanded) {
      this.controlsExpanded.style.display = 'block';
    }
    if (this.expandBtn) {
      this.expandBtn.classList.add('expanded');
    }
    
    // Load today's frames and target the latest time
    this.loadDate(latestDate);
    if (this.onImageChange) {
      this.onImageChange(latestData, null);
    }
  }

  setNavigationDisabled(disabled) {
    if (this.prevDayBtn) this.prevDayBtn.disabled = disabled;
    if (this.nextDayBtn) this.nextDayBtn.disabled = disabled;
    if (this.playBtn) this.playBtn.disabled = disabled;
    if (this.latestBtn) this.latestBtn.disabled = disabled;
    if (this.expandBtn) this.expandBtn.disabled = disabled;
  }

  updateCapturedDisplay(dateObj) {
    if (!this.capturedValueEl) return;
    if (!dateObj) {
      this.capturedValueEl.textContent = '--';
      return;
    }
    this.capturedValueEl.textContent = formatTimestamp(dateObj);
  }

  getMaxDate() {
    const now = new Date();
    let maxDate = new Date(now);
    maxDate.setHours(0, 0, 0, 0);

    if (now.getHours() < 4) {
      maxDate.setDate(maxDate.getDate() - 1);
    }

    return maxDate;
  }

  getMinDate() {
    return this.minDate;
  }
}
