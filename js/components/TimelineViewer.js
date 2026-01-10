// Timeline Viewer Component
// Embedded timeline viewer for the home page

import { getImageUrl, fetchAnalysis, fetchDailyManifest, fetchMonthlyManifest } from '../lib/api.js';
import { formatTime, formatTimestamp } from '../utils/format.js';
import { config } from '../../config/config.js';
import { CalendarPicker } from './CalendarPicker.js';

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
    this.calendar = null;
    this.dateStatusCache = new Map(); // Cache for date availability status
    this.monthlyManifestCache = new Map(); // Cache for monthly manifests
    this.currentDayManifest = null; // Store current day's manifest for visibility data
    this.currentDayStats = null; // Store current day's summary stats
    
    this.initializeElements();
    this.setupEventListeners();
    
    // Try to initialize calendar immediately, will work if container exists
    // Otherwise will be initialized when controls are first expanded
    setTimeout(() => {
      if (!this.calendar) {
        this.initializeCalendar();
      }
    }, 100);
  }
  
  // Initialize and load today's frames
  async initialize() {
    try {
      await this.loadDate(null, { render: false });
    } catch (error) {
      console.error('TimelineViewer initialization failed:', error);
    }
  }
  
  initializeElements() {
    this.calendarContainer = document.getElementById('timeline-calendar-container');
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
    
    // Stats elements
    this.statsContainer = document.getElementById('timeline-stats');
    this.statsDayPct = document.getElementById('timeline-stats-day-pct');
    this.statsMonthDays = document.getElementById('timeline-stats-month-days');
    this.statsBestDayContainer = document.getElementById('timeline-stats-best-day-container');
    this.statsBestDay = document.getElementById('timeline-stats-best-day');
    this.statsStreakContainer = document.getElementById('timeline-stats-streak-container');
    this.statsStreak = document.getElementById('timeline-stats-streak');
    
    console.log('Timeline elements initialized:', {
      calendarContainer: this.calendarContainer,
      controlsExpanded: this.controlsExpanded,
      expandBtn: this.expandBtn,
      statsContainer: this.statsContainer
    });
  }
  
  initializeCalendar() {
    if (!this.calendarContainer) {
      console.log('Calendar container not found - will be initialized when controls expand');
      return;
    }
    
    try {
      const maxDate = new Date();
      maxDate.setHours(0, 0, 0, 0);
      
      // If it's before 4 AM, use yesterday as max date
      if (new Date().getHours() < 4) {
        maxDate.setDate(maxDate.getDate() - 1);
      }
      
      this.calendar = new CalendarPicker({
        currentDate: new Date(),
        selectedDate: this.currentDate,
        minDate: this.minDate,
        maxDate: maxDate,
        onDateSelect: (date) => this.handleDateSelect(date),
        getDateStatus: (date) => this.getDateStatus(date)
      });
      
      this.calendar.mount(this.calendarContainer);
      console.log('Calendar initialized successfully');
    } catch (error) {
      console.error('Failed to initialize calendar:', error);
    }
  }
  
  async handleDateSelect(date) {
    console.log('Date selected:', date);
    this.currentDate = new Date(date);
    this.currentDate.setHours(0, 0, 0, 0);
    console.log('Loading frames for date:', this.currentDate);
    await this.loadDate(null, { render: true });
  }
  
  /**
   * Get monthly manifest for calendar color-coding
   */
  async getMonthlyManifest(year, month) {
    const cacheKey = `${year}-${String(month).padStart(2, '0')}`;
    
    if (this.monthlyManifestCache.has(cacheKey)) {
      return this.monthlyManifestCache.get(cacheKey);
    }
    
    try {
      const manifest = await fetchMonthlyManifest(year, month);
      this.monthlyManifestCache.set(cacheKey, manifest);
      return manifest;
    } catch (error) {
      console.warn(`Failed to fetch monthly manifest for ${year}-${month}:`, error);
      return null;
    }
  }
  
  getDateStatus(date) {
    // Return status for dates: 'visible', 'partial', 'no-images', or null (has images, no visibility)
    const cacheKey = date.toISOString().split('T')[0];
    
    // Check cache first
    if (this.dateStatusCache.has(cacheKey)) {
      return this.dateStatusCache.get(cacheKey);
    }
    
    // Asynchronously load monthly manifest and update cache
    // This will cause the calendar to re-render when data arrives
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    
    this.getMonthlyManifest(year, month).then(manifest => {
      if (!manifest || !manifest.days) return;
      
      const dayStr = String(date.getDate()).padStart(2, '0');
      const dayInfo = manifest.days[dayStr];
      
      let status = null;
      if (!dayInfo || dayInfo.image_count === 0) {
        status = 'no-images'; // No images for this day - grey out
      } else if (dayInfo.had_out) {
        status = 'visible'; // Mountain was out - green dot
      } else if (dayInfo.had_partially_out) {
        status = 'partial'; // Partially visible - yellow dot
      }
      // If has images but no visibility, status stays null (no dot, but clickable)
      
      this.dateStatusCache.set(cacheKey, status);
      
      // Trigger calendar re-render if it exists
      if (this.calendar) {
        this.calendar.renderCalendar();
      }
    });
    
    return this.dateStatusCache.get(cacheKey) || null;
  }
  
  setupEventListeners() {
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
    try {
      // Try to fetch daily manifest first (efficient, single request)
      const manifest = await fetchDailyManifest(date);
      this.currentDayManifest = manifest; // Store for visibility data and stats
      this.currentDayStats = manifest.summary || null;
      
      // Extract timestamps from manifest
      const frames = manifest.images.map(img => {
        const [year, month, day] = manifest.date.split('-');
        const hours = img.time.substring(0, 2);
        const minutes = img.time.substring(2, 4);
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hours), parseInt(minutes));
      });
      
      console.log(`Loaded ${frames.length} frames from manifest for ${manifest.date}`);
      return frames;
      
    } catch (error) {
      console.warn('Failed to load manifest, falling back to probing:', error);
      this.currentDayManifest = null;
      this.currentDayStats = null;
      
      // Fallback: probe for frames individually (old method)
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
    
    // Update handle fill color based on current segment
    this.updateHandleColor();
    
    // Update visibility segments on scrubber
    this.updateScrubberSegments();
  }
  
  /**
   * Update handle fill color to match current segment
   */
  updateHandleColor() {
    if (!this.scrubberHandle || !this.currentDayManifest) return;
    
    const images = this.currentDayManifest.images || [];
    if (images.length === 0 || this.currentFrameIndex >= images.length) return;
    
    const currentImage = images[this.currentFrameIndex];
    let color;
    
    if (currentImage.frame_state === 'good' && currentImage.visibility === 'out') {
      color = 'var(--color-nps-green-light)';
    } else if (currentImage.frame_state === 'good' && currentImage.visibility === 'partially_out') {
      color = 'var(--color-nps-brown)';
    } else if (currentImage.frame_state === 'good' && currentImage.visibility === 'not_out') {
      color = 'var(--color-gray-200)';
    } else {
      color = 'var(--color-gray-400)';
    }
    
    this.scrubberHandle.style.backgroundColor = color;
  }
  
  /**
   * Add color-coded visibility segments to scrubber track
   */
  updateScrubberSegments() {
    if (!this.scrubberTrack || !this.currentDayManifest) return;
    
    // Remove existing segments
    const existingSegments = this.scrubberTrack.querySelectorAll('.timeline-scrubber-segment');
    existingSegments.forEach(seg => seg.remove());
    
    const images = this.currentDayManifest.images || [];
    if (images.length === 0) return;
    
    // Create colored segments for each image based on visibility
    images.forEach((img, index) => {
      const segment = document.createElement('div');
      segment.className = 'timeline-scrubber-segment';
      
      // Determine color based on visibility
      if (img.frame_state === 'good' && img.visibility === 'out') {
        segment.classList.add('timeline-scrubber-segment--out');
      } else if (img.frame_state === 'good' && img.visibility === 'partially_out') {
        segment.classList.add('timeline-scrubber-segment--partial');
      } else if (img.frame_state === 'good' && img.visibility === 'not_out') {
        segment.classList.add('timeline-scrubber-segment--not-out');
      } else {
        segment.classList.add('timeline-scrubber-segment--other');
      }
      
      // Add tooltip with time and visibility info
      const time = `${img.time.substring(0, 2)}:${img.time.substring(2, 4)}`;
      const visLabel = img.visibility ? img.visibility.replace(/_/g, ' ') : img.frame_state;
      const conf = img.visibility_prob ? ` (${Math.round(img.visibility_prob * 100)}%)` : '';
      segment.title = `${time} - ${visLabel}${conf}`;
      
      // Position and size the segment
      const segmentWidth = 100 / images.length;
      const segmentLeft = (index / images.length) * 100;
      
      segment.style.left = `${segmentLeft}%`;
      segment.style.width = `${segmentWidth}%`;
      
      this.scrubberTrack.appendChild(segment);
    });
  }
  
  /**
   * Update the stats display with day percentage and monthly stats
   */
  async updateStatsDisplay() {
    if (!this.statsContainer) return;
    
    if (!this.currentDayStats || !this.currentDayManifest) {
      // Hide stats if no data available
      if (this.statsContainer.style) {
        this.statsContainer.style.display = 'none';
      }
      return;
    }
    
    // Show stats container
    if (this.statsContainer.style) {
      this.statsContainer.style.display = '';
    }
    
    // Update date in title
    const statsTitle = this.statsContainer.querySelector('.timeline-stats__title');
    const manifestDate = new Date(this.currentDayManifest.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    manifestDate.setHours(0, 0, 0, 0);
    
    if (statsTitle) {
      if (manifestDate.getTime() === today.getTime()) {
        statsTitle.textContent = "Today's Stats";
      } else {
        const options = { month: 'short', day: 'numeric' };
        statsTitle.textContent = `Stats for ${manifestDate.toLocaleDateString('en-US', options)}`;
      }
    }
    
    // Calculate day visibility percentage (out + partial)
    const stats = this.currentDayStats;
    const outCount = stats.out_count || 0;
    const partialCount = stats.partially_out_count || 0;
    const total = stats.total || 1;
    const visiblePct = Math.round(((outCount + partialCount) / total) * 100);
    
    if (this.statsDayPct) {
      this.statsDayPct.textContent = `${visiblePct}%`;
    }
    
    // Get monthly stats
    const year = manifestDate.getFullYear();
    const month = manifestDate.getMonth() + 1;
    
    // Hide optional stats by default
    if (this.statsBestDayContainer) this.statsBestDayContainer.style.display = 'none';
    if (this.statsStreakContainer) this.statsStreakContainer.style.display = 'none';
    
    try {
      const monthlyManifest = await this.getMonthlyManifest(year, month);
      
      if (this.statsMonthDays && monthlyManifest?.stats) {
        const daysWithOut = monthlyManifest.stats.days_with_out || 0;
        this.statsMonthDays.textContent = daysWithOut;
      }
      
      // Best day this month (only show if there were days out)
      if (monthlyManifest?.days && monthlyManifest?.stats?.days_with_out > 0) {
        const bestDay = this.findBestDayInMonth(monthlyManifest, year, month);
        if (bestDay && this.statsBestDay && this.statsBestDayContainer) {
          this.statsBestDay.textContent = bestDay;
          this.statsBestDayContainer.style.display = '';
        }
      }
      
      // Longest streak (including partial visibility)
      if (monthlyManifest?.days) {
        const streak = this.findLongestStreak(monthlyManifest);
        if (streak > 1 && this.statsStreak && this.statsStreakContainer) {
          this.statsStreak.textContent = `${streak} days`;
          this.statsStreakContainer.style.display = '';
        }
      }
      
    } catch (error) {
      console.warn('Failed to get monthly stats:', error);
      if (this.statsMonthDays) {
        this.statsMonthDays.textContent = '--';
      }
    }
  }
  
  /**
   * Find the best day in the month (highest visibility)
   */
  findBestDayInMonth(monthlyManifest, year, month) {
    const days = monthlyManifest.days;
    if (!days) return null;
    
    let bestDay = null;
    let bestScore = -1;
    
    for (const [dayStr, dayInfo] of Object.entries(days)) {
      // Score based on out_count primarily, with partial as tiebreaker
      const score = (dayInfo.out_count || 0) * 100 + (dayInfo.partially_out_count || 0);
      if (score > bestScore && dayInfo.out_count > 0) {
        bestScore = score;
        bestDay = dayStr;
      }
    }
    
    if (!bestDay) return null;
    
    // Format as "Jan 5" 
    const date = new Date(year, month - 1, parseInt(bestDay));
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  
  /**
   * Find the longest streak of consecutive days with visibility (out or partial)
   */
  findLongestStreak(monthlyManifest) {
    const days = monthlyManifest.days;
    if (!days) return 0;
    
    // Get sorted day numbers
    const dayNumbers = Object.keys(days)
      .map(d => parseInt(d))
      .sort((a, b) => a - b);
    
    let longestStreak = 0;
    let currentStreak = 0;
    let lastDay = -1;
    
    for (const dayNum of dayNumbers) {
      const dayInfo = days[String(dayNum).padStart(2, '0')];
      const hasVisibility = dayInfo.had_out || dayInfo.had_partially_out;
      
      if (hasVisibility) {
        // Check if consecutive
        if (lastDay === -1 || dayNum === lastDay + 1) {
          currentStreak++;
        } else {
          currentStreak = 1;
        }
        lastDay = dayNum;
        longestStreak = Math.max(longestStreak, currentStreak);
      } else {
        currentStreak = 0;
        lastDay = -1;
      }
    }
    
    return longestStreak;
  }
  
  async updateView(options = {}) {
    if (this.frames.length === 0) return;
    
    const currentFrame = this.frames[this.currentFrameIndex];
    const imageUrl = getImageUrl(currentFrame.toISOString());
    
    console.log('updateView: Loading image for', formatTime(currentFrame), 'URL:', imageUrl);
    
    // Update time display
    if (this.timeDisplay) {
      this.timeDisplay.textContent = formatTime(currentFrame);
    }
    this.updateCapturedDisplay(currentFrame);
    
    // Update scrubber
    this.updateScrubberPosition();
    
    // Update stats display
    this.updateStatsDisplay();
    
    // Use skipLoadingState for smooth scrubbing, but show loading for date changes
    const skipLoading = options.skipLoadingState !== false;
    this.imageViewer.renderUrl(imageUrl, `Mt. Rainier at ${formatTime(currentFrame)}`, skipLoading);
    
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

    // Show placeholder when changing days (not on initial load with render: false)
    if (options.render) {
      this.imageViewer.showPlaceholder();
    }
    
    this.imageCache.clear();
    this.isLoading = true;
    
    // Update calendar to reflect selected date
    if (this.calendar) {
      this.calendar.setDate(this.currentDate);
    }
    
    // Update date display
    this.updateDateDisplay();
    
    if (this.timeDisplay) {
      this.timeDisplay.textContent = 'Loading...';
    }
    
    try {
      this.setNavigationDisabled(true);
      this.frames = await this.fetchFramesForDay(this.currentDate);
      
      // Update stats right after loading frames (when manifest data is fresh)
      this.updateStatsDisplay();
      
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
          console.log('Rendering view after loading frames, frame count:', this.frames.length);
          await this.updateView({ skipLoadingState: false });
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
    // Update calendar date range
    if (this.calendar) {
      const maxDate = this.getMaxDate();
      const minDate = this.getMinDate();
      this.calendar.setDateRange(minDate, maxDate);
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
  
  prevFrame() {
    if (this.currentFrameIndex > 0) {
      this.currentFrameIndex--;
      this.updateView({ skipLoadingState: true });
    }
  }
  
  nextFrame() {
    if (this.currentFrameIndex < this.frames.length - 1) {
      this.currentFrameIndex++;
      this.updateView({ skipLoadingState: true });
    } else if (this.isPlaying) {
      // restart from beginning when at last frame during play
      this.currentFrameIndex = 0;
      this.updateView({ skipLoadingState: true });
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
    console.log('toggleExpanded called');
    const isExpanded = this.controlsExpanded.style.display !== 'none';
    if (isExpanded) {
      this.controlsExpanded.style.display = 'none';
      this.expandBtn.classList.remove('expanded');
      console.log('Controls collapsed');
    } else {
      this.controlsExpanded.style.display = 'block';
      this.expandBtn.classList.add('expanded');
      console.log('Controls expanded');
      
      // Initialize calendar if not already done (when controls are first expanded)
      if (!this.calendar) {
        console.log('Calendar not initialized yet, initializing now...');
        this.initializeCalendar();
      } else {
        console.log('Calendar already initialized');
      }
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
