// Timeline Viewer Component
// Embedded timeline viewer for the home page

import { getImageUrl, fetchAnalysis, fetchDailyManifest, fetchMonthlyManifest } from '../lib/api.js';
import { formatTime, formatTimestamp } from '../utils/format.js';
import {
  buildSidebarStats,
  createDateFromManifestEntry,
  getCurrentPacificDateString,
  getCurrentPacificMinutes,
  getDisplayWindowMinutes,
} from '../utils/manifestStats.js';
import { config } from '../../config/config.js';
import { CalendarPicker } from './CalendarPicker.js';

const DAY_IMAGE_PRELOAD_CONCURRENCY = 10;

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
    this.isPlaying = false;
    this.playInterval = null;
    this.imageCache = new Map();
    this.pendingLoad = null;
    this.calendar = null;
    this.dateStatusCache = new Map(); // Cache for date availability status
    this.monthlyManifestCache = new Map(); // Cache for monthly manifests
    this.currentDayManifest = null; // Store current day's manifest for visibility data
    this.currentDayTimelineImages = [];
    this.currentDayStats = null; // Store current day's summary stats
    this.dayLoadState = {
      phase: 'idle',
      dateKey: null,
      loadedCount: 0,
      totalCount: 0,
    };
    this._loadId = 0;
    this._viewId = 0;
    this.activeManifestController = null;
    this.activeAnalysisController = null;
    this.activePreloadRequests = new Set();
    
    this.initializeElements();
    this.setupEventListeners();
    this.setupKeyboardNavigation();
    
    // Try to initialize calendar immediately, will work if container exists
    // Otherwise will be initialized when controls are first expanded
    setTimeout(() => {
      if (!this.calendar) {
        this.initializeCalendar();
      }
    }, 100);
  }
  
  // Initialize and load today's frames
  async initialize(initialData = null) {
    try {
      const latestTs = initialData?.ts || initialData?.timestamp || null;
      const initialManifest = initialData?.daily_manifest || null;

      if (initialManifest?.date) {
        const [year, month, day] = initialManifest.date.split('-').map((value) => Number.parseInt(value, 10));
        this.currentDate = new Date(year, month - 1, day);
        this.currentDate.setHours(0, 0, 0, 0);

        const initialTargetTime = latestTs ? new Date(latestTs) : null;
        await this.loadDate(initialTargetTime, {
          render: false,
          initialManifest,
          initialViewReady: true,
        });
        return;
      }

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
  }
  
  initializeCalendar() {
    if (!this.calendarContainer) {
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
      
      // Preload current month's manifest for calendar navigation
      const now = new Date();
      this.getMonthlyManifest(now.getFullYear(), now.getMonth() + 1);
    } catch (error) {
      console.error('Failed to initialize calendar:', error);
    }
  }
  
  async handleDateSelect(date) {
    this.currentDate = new Date(date);
    this.currentDate.setHours(0, 0, 0, 0);
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
    
    // Check if monthly manifest is already cached (synchronous check)
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    
    if (this.monthlyManifestCache.has(monthKey)) {
      const manifest = this.monthlyManifestCache.get(monthKey);
      if (manifest && manifest.days) {
        const dayStr = String(date.getDate()).padStart(2, '0');
        const dayInfo = manifest.days[dayStr];
        
        let status = null;
        if (!dayInfo || dayInfo.image_count === 0) {
          status = 'no-images';
        } else if (dayInfo.had_out) {
          status = 'visible';
        } else if (dayInfo.had_partially_out) {
          status = 'partial';
        }
        
        this.dateStatusCache.set(cacheKey, status);
        return status;
      }
    }
    
    // Asynchronously load monthly manifest and update cache
    this.getMonthlyManifest(year, month).then(manifest => {
      if (!manifest || !manifest.days) return;
      
      const dayStr = String(date.getDate()).padStart(2, '0');
      const dayInfo = manifest.days[dayStr];
      
      let status = null;
      if (!dayInfo || dayInfo.image_count === 0) {
        status = 'no-images';
      } else if (dayInfo.had_out) {
        status = 'visible';
      } else if (dayInfo.had_partially_out) {
        status = 'partial';
      }
      
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

  getDateKey(date = this.currentDate) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  isPreparingDay() {
    return this.dayLoadState.phase === 'loading-day' || this.dayLoadState.phase === 'preparing-day';
  }

  canNavigateWithinDay() {
    return this.dayLoadState.phase === 'ready' && this.frames.length > 0;
  }

  setDayLoadState(partialState = {}) {
    this.dayLoadState = {
      ...this.dayLoadState,
      ...partialState,
    };
    this.syncTimelineUi();
  }

  syncTimelineUi() {
    const intraDayReady = this.canNavigateWithinDay();

    if (this.playBtn) {
      this.playBtn.disabled = !intraDayReady;
    }

    if (this.expandBtn) {
      this.expandBtn.disabled = false;
    }

    if (this.scrubberTrack) {
      this.scrubberTrack.classList.toggle('timeline-scrubber-track--disabled', !intraDayReady);
      this.scrubberTrack.setAttribute('aria-disabled', String(!intraDayReady));
    }

    if (this.scrubberHandle) {
      this.scrubberHandle.classList.toggle('timeline-scrubber-handle--disabled', !intraDayReady);
      this.scrubberHandle.setAttribute('aria-disabled', String(!intraDayReady));
    }

    this.updateNavigationState();
    this.updateLatestButton();
    this.updateLoadingBanner();
  }

  updateLoadingBanner() {
    if (!this.imageViewer?.setStatusBanner) {
      return;
    }

    if (!this.isPreparingDay()) {
      this.imageViewer.clearStatusBanner();
      return;
    }

    const { phase, loadedCount, totalCount } = this.dayLoadState;
    if (phase === 'loading-day' || totalCount <= 0) {
      this.imageViewer.setStatusBanner('Loading day...');
      return;
    }

    this.imageViewer.setStatusBanner(`Loading images ${loadedCount} / ${totalCount}`);
  }

  cancelActiveDayLoad() {
    if (this.activeManifestController) {
      this.activeManifestController.abort();
      this.activeManifestController = null;
    }

    if (this.activeAnalysisController) {
      this.activeAnalysisController.abort();
      this.activeAnalysisController = null;
    }

    for (const entry of this.activePreloadRequests) {
      const { img, resolve } = entry;
      img.onload = null;
      img.onerror = null;
      img.src = '';
      resolve(false);
    }
    this.activePreloadRequests.clear();
  }

  buildFramesFromManifest(manifest) {
    this.currentDayManifest = manifest;
    const statsData = buildSidebarStats(manifest, null);
    this.currentDayTimelineImages = statsData?.filteredImages || [];
    this.currentDayStats = statsData?.summary || null;

    return this.currentDayTimelineImages
      .map((img) => createDateFromManifestEntry(manifest.date, img.time))
      .filter((frame) => frame !== null);
  }

  setupKeyboardNavigation() {
    // Set up keyboard navigation
    document.addEventListener('keydown', (e) => {
      // Only handle arrow keys when not in an input field
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.navigateToPrevious();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.navigateToNext();
      }
    });

    // Set up image viewer navigation callback
    if (this.imageViewer) {
      this.imageViewer.setNavigation((direction) => {
        if (direction === 'prev') {
          this.navigateToPrevious();
        } else if (direction === 'next') {
          this.navigateToNext();
        }
      });
    }
  }

  /**
   * Navigate to previous image in current day
   */
  navigateToPrevious() {
    if (!this.canNavigateWithinDay()) return;
    
    if (this.currentFrameIndex > 0) {
      this.currentFrameIndex--;
      this.updateView({ skipLoadingState: true });
    }
  }

  /**
   * Navigate to next image in current day
   */
  navigateToNext() {
    if (!this.canNavigateWithinDay()) return;
    
    if (this.currentFrameIndex < this.frames.length - 1) {
      this.currentFrameIndex++;
      this.updateView({ skipLoadingState: true });
    }
  }

  /**
   * Update navigation state for image viewer arrows
   */
  updateNavigationState() {
    if (!this.imageViewer) return;

    if (!this.canNavigateWithinDay()) {
      this.imageViewer.clearNavigationArrows();
      return;
    }

    const hasPrev = this.currentFrameIndex > 0;
    const hasNext = this.currentFrameIndex < this.frames.length - 1;
    this.imageViewer.updateNavigationArrows({ hasPrev, hasNext });
  }
  
  setupScrubberEvents() {
    if (!this.scrubberTrack || !this.scrubberHandle) return;
    
    let isDragging = false;
    
    const updatePosition = (clientX) => {
      if (!this.canNavigateWithinDay()) return;
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
      if (!this.canNavigateWithinDay()) return;
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
      if (!this.canNavigateWithinDay()) return;
      const x = extractClientX(e);
      if (x !== undefined) {
        updatePosition(x);
      }
      isDragging = true;
      e.preventDefault();
    }, { passive: false });

    this.scrubberHandle.addEventListener('touchstart', (e) => {
      if (!this.canNavigateWithinDay()) return;
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
    const day = new Date(date);
    day.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 0, 0);

    while (day <= endOfDay) {
      timestamps.push(new Date(day));
      day.setMinutes(day.getMinutes() + 10);
    }

    return timestamps;
  }
  
  async fetchFramesForDay(date, options = {}) {
    const { signal } = options;

    try {
      // Try to fetch daily manifest first (efficient, single request)
      const manifest = await fetchDailyManifest(date, null, { signal });
      return this.buildFramesFromManifest(manifest);
      
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw error;
      }
      console.warn('Failed to load manifest, falling back to probing:', error);
      this.currentDayManifest = null;
      this.currentDayTimelineImages = [];
      this.currentDayStats = null;
      
      // Fallback: probe for frames individually (old method)
      const potentialTimestamps = this.generatePotentialTimestamps(date);
      const availableFrames = [];
      const batchSize = 10;
      
      for (let i = 0; i < potentialTimestamps.length; i += batchSize) {
        if (signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }

        const batch = potentialTimestamps.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map(async (timestamp) => {
            try {
              await fetchAnalysis(timestamp.toISOString(), null, { signal });
              return timestamp;
            } catch (error) {
              if (error?.name === 'AbortError') {
                throw error;
              }
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
      const entry = { img, resolve };
      img.onload = () => {
        this.activePreloadRequests.delete(entry);
        this.imageCache.set(url, img);
        resolve();
      };
      img.onerror = () => {
        this.activePreloadRequests.delete(entry);
        resolve();
      };
      this.activePreloadRequests.add(entry);
      img.src = url;
    });
  }
  
  async preloadAllImages(loadId, startIndex) {
    const frameUrls = this.frames.map(frame => getImageUrl(frame.toISOString()));
    const remainingUrls = frameUrls.filter((_, index) => index !== startIndex);

    if (frameUrls.length === 0) {
      this.setDayLoadState({
        phase: 'ready',
        loadedCount: 0,
        totalCount: 0,
      });
      return;
    }

    if (remainingUrls.length === 0) {
      this.setDayLoadState({
        phase: 'ready',
        loadedCount: 1,
        totalCount: 1,
      });
      return;
    }

    let loadedCount = 1;
    const totalCount = frameUrls.length;
    const queue = [...remainingUrls];
    const concurrency = Math.min(DAY_IMAGE_PRELOAD_CONCURRENCY, queue.length);

    this.setDayLoadState({
      phase: 'preparing-day',
      loadedCount,
      totalCount,
    });

    const runWorker = async () => {
      while (queue.length > 0 && this._loadId === loadId) {
        const nextUrl = queue.shift();
        if (!nextUrl) {
          return;
        }

        await this.preloadImage(nextUrl);
        if (this._loadId !== loadId) {
          return;
        }

        loadedCount += 1;
        this.setDayLoadState({
          phase: 'preparing-day',
          loadedCount,
          totalCount,
        });
      }
    };

    await Promise.allSettled(
      Array.from({ length: concurrency }, () => runWorker())
    );
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
    if (!this.scrubberHandle) return;
    
    const images = this.currentDayTimelineImages || [];
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
    if (!this.scrubberTrack) return;
    
    // Remove existing segments
    const existingSegments = this.scrubberTrack.querySelectorAll('.timeline-scrubber-segment');
    existingSegments.forEach(seg => seg.remove());
    
    const images = this.currentDayTimelineImages || [];
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
    if (!this.metadataDisplay?.setStats) return;

    if (!this.currentDayManifest) {
      this.metadataDisplay.setStats(null);
      return;
    }

    const manifestDate = this.currentDayManifest.date;
    const [year, month] = manifestDate.split('-').map((value) => Number.parseInt(value, 10));
    const dailyOnlyStats = buildSidebarStats(this.currentDayManifest, null);
    this.currentDayStats = dailyOnlyStats?.summary || null;
    this.metadataDisplay.setStats(dailyOnlyStats);

    try {
      const monthlyManifest = await this.getMonthlyManifest(year, month);
      if (this.currentDayManifest?.date !== manifestDate) {
        return;
      }

      const enrichedStats = buildSidebarStats(this.currentDayManifest, monthlyManifest);
      this.currentDayStats = enrichedStats?.summary || null;
      this.metadataDisplay.setStats(enrichedStats);
    } catch (error) {
      console.warn('Failed to get monthly stats:', error);
    }
  }
  
  async updateView(options = {}) {
    if (this.frames.length === 0) return;
    
    const viewId = ++this._viewId;
    const currentFrame = this.frames[this.currentFrameIndex];
    const imageUrl = getImageUrl(currentFrame.toISOString());
    
    // Update time display
    if (this.timeDisplay) {
      this.timeDisplay.textContent = formatTime(currentFrame);
    }
    this.updateCapturedDisplay(currentFrame);
    
    // Update scrubber
    this.updateScrubberPosition();
    
    // Update navigation state for image viewer arrows
    this.updateNavigationState();
    
    // Use skipLoadingState for smooth scrubbing, but show loading for date changes
    const skipLoading = options.skipLoadingState !== false;
    const cachedImage = this.imageCache.get(imageUrl) || null;
    const imageRenderPromise = this.imageViewer.renderUrl(
      imageUrl,
      formatTime(currentFrame),
      skipLoading,
      cachedImage
    );
    
    // Update navigation state after image is rendered
    setTimeout(() => this.updateNavigationState(), 0);
    
    // Use latest data if frame matches latest timestamp
    const latestData = window.latestData;
    const latestTs = latestData?.ts || latestData?.timestamp;
    const isLatestFrame = latestTs && new Date(latestTs).getTime() === currentFrame.getTime();
    
    if (isLatestFrame && latestData) {
      this.metadataDisplay.render(latestData);
      if (this.onImageChange) {
        this.onImageChange(latestData, null);
      }
      return imageRenderPromise;
    }
    
    // Fetch and update metadata (async, don't await to keep it fast)
    if (this.activeAnalysisController) {
      this.activeAnalysisController.abort();
    }

    this.activeAnalysisController = new AbortController();

    fetchAnalysis(currentFrame.toISOString(), null, { signal: this.activeAnalysisController.signal })
      .then(data => {
        if (this._viewId !== viewId) {
          return;
        }
        this.metadataDisplay.render(data);
        
        // Notify parent about image change
        if (this.onImageChange) {
          const isLatestFrame = this.isAtLatestFrame();
          this.onImageChange(data, isLatestFrame ? null : currentFrame);
        }
      })
      .catch(error => {
        if (error?.name === 'AbortError') {
          return;
        }
        console.error('Failed to fetch analysis:', error);
      });

    this.updateLatestButton();
    return imageRenderPromise;
  }
  
  async loadDate(targetTime = null, options = {}) {
    const {
      render = true,
      initialManifest = null,
      initialViewReady = false,
    } = options;

    if (this.isPlaying) {
      this.togglePlay();
    }

    // Preserve current time-of-day for day changes
    if (!targetTime && this.frames.length > 0 && this.currentFrameIndex < this.frames.length) {
      const currentFrame = this.frames[this.currentFrameIndex];
      targetTime = new Date(this.currentDate);
      targetTime.setHours(currentFrame.getHours(), currentFrame.getMinutes(), 0, 0);
    }

    // Cancel any in-progress work before starting the new day load
    this.cancelActiveDayLoad();
    this._loadId += 1;
    const myLoadId = this._loadId;
    const dateKey = this.getDateKey(this.currentDate);

    // Show loading state when changing days (keep current image greyed out)
    if (render) {
      this.imageViewer.showLoadingWithCurrentImage();
    }

    this.imageCache.clear();
    this.setDayLoadState({
      phase: 'loading-day',
      dateKey,
      loadedCount: 0,
      totalCount: 0,
    });
    this.activeManifestController = new AbortController();

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
      if (initialManifest) {
        this.frames = this.buildFramesFromManifest(initialManifest);
      } else {
        this.frames = await this.fetchFramesForDay(this.currentDate, {
          signal: this.activeManifestController.signal,
        });
      }

      if (this._loadId !== myLoadId) return;

      const displayWindow = getDisplayWindowMinutes(this.currentDayManifest?.daylight);
      const isCurrentPacificDay = this.currentDayManifest?.date === getCurrentPacificDateString();
      if (displayWindow && isCurrentPacificDay) {
        const currentPacificMinutes = getCurrentPacificMinutes();
        if (currentPacificMinutes != null && currentPacificMinutes < displayWindow.startMinutes) {
          this.currentDate.setDate(this.currentDate.getDate() - 1);
          await this.loadDate(targetTime, { render });
          return;
        }
      }

      // Update stats right after loading frames (when manifest data is fresh)
      this.updateStatsDisplay();

      if (this.frames.length === 0) {
        if (this.timeDisplay) {
          this.timeDisplay.textContent = 'No data';
        }
        this.updateCapturedDisplay(null);
        this.setDayLoadState({
          phase: 'ready',
          dateKey: this.getDateKey(this.currentDate),
          loadedCount: 0,
          totalCount: 0,
        });
      } else {
        // Choose frame: match targetTime if provided, else latest
        this.currentFrameIndex = this.findFrameIndex(targetTime);

        if (this.timeDisplay) {
          this.timeDisplay.textContent = formatTime(this.frames[this.currentFrameIndex]);
        }
        this.updateCapturedDisplay(this.frames[this.currentFrameIndex]);
        this.updateScrubberPosition();

        // Render the selected frame first, then prepare the rest of the day.
        if (!initialViewReady) {
          await this.updateView({ skipLoadingState: true });

          if (this._loadId !== myLoadId) return;
        }

        await this.preloadAllImages(myLoadId, this.currentFrameIndex);

        if (this._loadId !== myLoadId) return;

        this.setDayLoadState({
          phase: 'ready',
          dateKey: this.getDateKey(this.currentDate),
          loadedCount: this.frames.length,
          totalCount: this.frames.length,
        });
      }
    } catch (error) {
      if (error?.name === 'AbortError') {
        return;
      }
      console.error('Error loading frames:', error);
      if (this.timeDisplay) {
        this.timeDisplay.textContent = 'Error';
      }
      this.setDayLoadState({
        phase: 'error',
        dateKey: this.getDateKey(this.currentDate),
      });
    } finally {
      if (this._loadId === myLoadId) {
        this.activeManifestController = null;
        this.updateNavigationButtons();
      }
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

    this.syncTimelineUi();
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
    this.latestBtn.disabled = atLatest;
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
    if (!this.canNavigateWithinDay()) {
      return;
    }

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
      }, config.playbackInterval);
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
    this.cancelActiveDayLoad();
    this.frames = [];
    this.currentFrameIndex = 0;
    this.imageCache.clear();
    this.currentDayManifest = latestData?.daily_manifest || null;
    this.currentDayTimelineImages = [];
    this.currentDayStats = null;
    this.setDayLoadState({
      phase: 'idle',
      dateKey: null,
      loadedCount: 0,
      totalCount: 0,
    });
    
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
      this.expandBtn.setAttribute('aria-expanded', 'false');
    } else {
      this.controlsExpanded.style.display = 'block';
      this.expandBtn.classList.add('expanded');
      this.expandBtn.setAttribute('aria-expanded', 'true');

      // Initialize calendar if not already done (when controls are first expanded)
      if (!this.calendar) {
        this.initializeCalendar();
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
      this.expandBtn.setAttribute('aria-expanded', 'true');
    }
    
    // Load today's frames and target the latest time
    this.loadDate(latestDate, { initialManifest: latestData.daily_manifest || null });
    if (this.onImageChange) {
      this.onImageChange(latestData, null);
    }
  }

  setNavigationDisabled(disabled) {
    if (this.playBtn) this.playBtn.disabled = disabled;
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
