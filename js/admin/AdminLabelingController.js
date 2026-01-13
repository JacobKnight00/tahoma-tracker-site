// Admin Labeling Controller
// Central state management for rapid labeling workflow

import { fetchAdminLabels, fetchDailyManifest, fetchAnalysis, submitLabelBatch, getImageUrl } from '../lib/api.js';

class DataStore {
  constructor() {
    this.existingLabels = new Map();
    this.analysisCache = new Map();
    this.manifestCache = new Map();
  }

  clear() {
    this.existingLabels.clear();
    this.analysisCache.clear();
    this.manifestCache.clear();
  }

  setLabel(imageId, label) {
    this.existingLabels.set(imageId, label);
  }

  getLabel(imageId) {
    return this.existingLabels.get(imageId);
  }

  setAnalysis(imageId, analysis) {
    this.analysisCache.set(imageId, analysis);
  }

  getAnalysis(imageId) {
    return this.analysisCache.get(imageId);
  }

  setManifest(dateStr, manifest) {
    this.manifestCache.set(dateStr, manifest);
  }

  getManifest(dateStr) {
    return this.manifestCache.get(dateStr);
  }

  getAllManifests() {
    return this.manifestCache;
  }
}

export class AdminLabelingController {
  constructor() {
    this.dataStore = new DataStore();
    this.filteredImages = [];
    this.currentIndex = 0;
    this.labelBatch = [];
    this.imageCache = new Map(); // Cache for preloaded images
    this.loadingPromises = new Map(); // Track in-progress loads
    
    // Filter state
    this.filters = {
      startDate: null,
      endDate: null,
      excludeLabeled: 'none',
      confidenceThreshold: 80,
      goodFramesOnly: false,
      disagreementsOnly: false,
    };
    
    // Callbacks
    this.onImageChange = null;
    this.onProgressUpdate = null;
    this.onBatchSubmit = null;
  }

  /**
   * Load data for date range and apply filters
   */
  async loadDataForDateRange(startDate, endDate) {
    this.filters.startDate = startDate;
    this.filters.endDate = endDate;
    
    // Load existing labels
    const labelsResponse = await fetchAdminLabels(startDate, endDate);
    this.dataStore.clear();
    labelsResponse.labels.forEach(label => {
      this.dataStore.setLabel(label.imageId, label);
    });
    
    // Load daily manifests for date range
    const dates = this.getDateRange(startDate, endDate);
    const manifestPromises = dates.map(date => this.loadManifestForDate(date));
    await Promise.allSettled(manifestPromises);
    
    await this.applyFilters();
  }

  /**
   * Load manifest and analysis data for a specific date (initial load only)
   */
  async loadManifestForDate(dateStr) {
    try {
      const manifest = await fetchDailyManifest(dateStr);
      this.dataStore.setManifest(dateStr, manifest);
      
      // Only load analysis for first 5 images initially
      const imagesToPreload = manifest.images.slice(0, 5);
      const analysisPromises = imagesToPreload.map(async (img) => {
        const imageId = `${dateStr.replace(/-/g, '/')}/${img.time}`;
        return this.ensureAnalysisLoaded(imageId);
      });
      
      await Promise.allSettled(analysisPromises);
    } catch (err) {
      console.warn(`Failed to load manifest for ${dateStr}:`, err);
    }
  }

  /**
   * Preload nearby images and analysis (called on navigation)
   */
  async preloadNearbyContent() {
    const current = this.currentIndex;
    const lookAhead = 5;
    
    // Preload next 5 images and analysis
    for (let i = current; i < Math.min(current + lookAhead, this.filteredImages.length); i++) {
      const img = this.filteredImages[i];
      if (img) {
        // Preload analysis
        this.ensureAnalysisLoaded(img.imageId);
        // Preload image
        this.preloadImage(img.imageId);
      }
    }
  }

  /**
   * Preload image into cache
   */
  preloadImage(imageId) {
    if (this.imageCache.has(imageId) || this.loadingPromises.has(`img-${imageId}`)) {
      return;
    }

    const promise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.imageCache.set(imageId, img);
        this.loadingPromises.delete(`img-${imageId}`);
        resolve(img);
      };
      img.onerror = () => {
        this.loadingPromises.delete(`img-${imageId}`);
        reject(new Error(`Failed to preload image: ${imageId}`));
      };
      img.src = getImageUrl(imageId);
    });

    this.loadingPromises.set(`img-${imageId}`, promise);
    return promise;
  }

  /**
   * Load analysis data on-demand with caching
   */
  async ensureAnalysisLoaded(imageId) {
    // Return cached analysis if available
    if (this.dataStore.getAnalysis(imageId)) {
      return this.dataStore.getAnalysis(imageId);
    }

    // Return existing promise if already loading
    if (this.loadingPromises.has(`analysis-${imageId}`)) {
      return this.loadingPromises.get(`analysis-${imageId}`);
    }

    // Start loading analysis
    const promise = fetchAnalysis(imageId)
      .then(analysis => {
        this.dataStore.setAnalysis(imageId, analysis);
        this.loadingPromises.delete(`analysis-${imageId}`);
        return analysis;
      })
      .catch(err => {
        console.warn(`Failed to load analysis for ${imageId}:`, err);
        this.loadingPromises.delete(`analysis-${imageId}`);
        return null;
      });

    this.loadingPromises.set(`analysis-${imageId}`, promise);
    return promise;
  }

  /**
   * Apply current filters to create filtered image list
   */
  async applyFilters() {
    const allImages = [];
    
    // Collect all images from manifests
    for (const [dateStr, manifest] of this.dataStore.getAllManifests()) {
      manifest.images.forEach(img => {
        const imageId = `${dateStr.replace(/-/g, '/')}/${img.time}`;
        const analysis = this.dataStore.getAnalysis(imageId);
        const existingLabel = this.dataStore.getLabel(imageId);
        
        allImages.push({
          imageId,
          time: img.time,
          date: dateStr,
          analysis,
          existingLabel,
        });
      });
    }
    
    // Apply filters
    this.filteredImages = allImages.filter(img => {
      // Exclude labeled filter
      if (this.filters.excludeLabeled !== 'none' && img.existingLabel) {
        if (this.filters.excludeLabeled === 'any') return false;
        if (this.filters.excludeLabeled === 'admin' && img.existingLabel.labelSource === 'admin') return false;
        if (this.filters.excludeLabeled === 'crowd' && img.existingLabel.labelSource === 'crowd') return false;
      }
      
      // For filters requiring analysis, we'll check on-demand
      return true;
    });
    
    this.currentIndex = 0;
    this.updateProgress();
    
    // Start preloading nearby content
    this.preloadNearbyContent();
  }

  /**
   * Detect disagreement between analysis and existing labels
   */
  detectDisagreement(img) {
    if (!img.existingLabel || !img.analysis) return false;
    
    // Frame state disagreement
    if (img.existingLabel.frameState !== img.analysis.frame_state) return true;
    
    // Visibility disagreement (only for good frames)
    if (img.existingLabel.frameState === 'good' && img.analysis.frame_state === 'good') {
      if (img.existingLabel.visibility !== img.analysis.visibility) return true;
    }
    
    return false;
  }

  /**
   * Get current image data
   */
  getCurrentImage() {
    if (this.currentIndex < 0 || this.currentIndex >= this.filteredImages.length) {
      return null;
    }
    return this.filteredImages[this.currentIndex];
  }

  /**
   * Navigate to next image
   */
  navigateNext() {
    if (this.currentIndex < this.filteredImages.length - 1) {
      this.currentIndex++;
      this.notifyImageChange();
      // Preload nearby content after navigation
      this.preloadNearbyContent();
      return true;
    }
    return false;
  }

  /**
   * Navigate to previous image
   */
  navigatePrevious() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.notifyImageChange();
      // Preload nearby content after navigation
      this.preloadNearbyContent();
      return true;
    }
    return false;
  }

  /**
   * Add label to batch queue
   */
  addLabelToBatch(imageId, frameState, visibility = null) {
    // Remove existing label for this image from batch
    this.labelBatch = this.labelBatch.filter(label => label.imageId !== imageId);
    
    // Add new label
    this.labelBatch.push({
      imageId,
      frameState,
      visibility,
      timestamp: Date.now(),
    });
    
    // Auto-submit if batch is full
    if (this.labelBatch.length >= 10) {
      this.submitBatch();
    }
  }

  /**
   * Submit current batch of labels
   */
  async submitBatch() {
    if (this.labelBatch.length === 0) return;
    
    try {
      const response = await submitLabelBatch(this.labelBatch);
      
      // Update existing labels cache
      this.labelBatch.forEach(label => {
        this.dataStore.setLabel(label.imageId, {
          imageId: label.imageId,
          frameState: label.frameState,
          visibility: label.visibility,
          labelSource: 'admin',
          updatedAt: new Date().toISOString(),
        });
      });
      
      // Clear batch
      const submittedCount = this.labelBatch.length;
      this.labelBatch = [];
      
      // Notify callback
      if (this.onBatchSubmit) {
        this.onBatchSubmit({ success: true, count: submittedCount, auto: submittedCount === 10 });
      }
      
      return response;
    } catch (err) {
      console.error('Failed to submit batch:', err);
      if (this.onBatchSubmit) {
        this.onBatchSubmit({ success: false, error: err.message });
      }
      throw err;
    }
  }

  /**
   * Update filter and reapply
   */
  async updateFilter(key, value) {
    this.filters[key] = value;
    await this.applyFilters();
  }

  /**
   * Get date range array
   */
  getDateRange(startDate, endDate) {
    const dates = [];
    const current = new Date(startDate);
    const end = new Date(endDate);
    
    while (current <= end) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }
    
    return dates;
  }

  /**
   * Update progress and notify callback
   */
  updateProgress() {
    if (this.onProgressUpdate) {
      this.onProgressUpdate({
        current: this.currentIndex + 1,
        total: this.filteredImages.length,
        percent: this.filteredImages.length > 0 ? Math.round(((this.currentIndex + 1) / this.filteredImages.length) * 100) : 0,
        batchSize: this.labelBatch.length,
      });
    }
  }

  /**
   * Notify image change callback
   */
  notifyImageChange() {
    this.updateProgress();
    if (this.onImageChange) {
      this.onImageChange(this.getCurrentImage());
    }
  }

  /**
   * Get image URL for current image
   */
  getCurrentImageUrl() {
    const img = this.getCurrentImage();
    return img ? getImageUrl(img.imageId) : null;
  }

  /**
   * Check if there are unsaved labels in batch
   */
  hasUnsavedLabels() {
    return this.labelBatch.length > 0;
  }
}
