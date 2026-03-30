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
      labelSource: 'none',
      frameConfidenceMin: 0,
      frameConfidenceMax: 100,
      visibilityConfidenceMin: 0,
      visibilityConfidenceMax: 100,
      frameStatesAI: new Set(['good', 'off_target', 'dark', 'bad']),
      frameStatesHuman: new Set(),
      visibilityTypesAI: new Set(['out', 'partially_out', 'not_out']),
      visibilityTypesHuman: new Set(),
      disagreementsOnly: false,
    };
    
    // Callbacks
    this.onImageChange = null;
    this.onProgressUpdate = null;
    this.onBatchSubmit = null;
    this.onLabelsRefreshed = null;
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
   * Load manifest for a specific date
   */
  async loadManifestForDate(dateStr) {
    try {
      const manifest = await fetchDailyManifest(dateStr);
      this.dataStore.setManifest(dateStr, manifest);
    } catch (err) {
      console.warn(`Failed to load manifest for ${dateStr}:`, err);
    }
  }

  /**
   * Preload nearby images (called on navigation)
   */
  async preloadNearbyContent() {
    const current = this.currentIndex;
    const lookAhead = 5;
    
    // Preload next 5 images
    for (let i = current; i < Math.min(current + lookAhead, this.filteredImages.length); i++) {
      const img = this.filteredImages[i];
      if (img) {
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
        const existingLabel = this.dataStore.getLabel(imageId);
        
        allImages.push({
          imageId,
          time: img.time,
          date: dateStr,
          analysis: {
            frame_state: img.frame_state,
            frame_state_probability: img.frame_state_prob,
            visibility: img.visibility,
            visibility_prob: img.visibility_prob
          },
          existingLabel,
        });
      });
    }
    
    // Apply filters
    this.filteredImages = allImages.filter(img => {
      // Label source filter
      if (this.filters.labelSource !== 'none') {
        const hasLabel = !!img.existingLabel;
        const isAdmin = hasLabel && img.existingLabel.labelSource === 'admin';
        const isCrowd = hasLabel && img.existingLabel.labelSource === 'crowd';
        
        if (this.filters.labelSource === 'exclude-admin' && isAdmin) return false;
        if (this.filters.labelSource === 'exclude-crowd' && isCrowd) return false;
        if (this.filters.labelSource === 'exclude-any' && hasLabel) return false;
        if (this.filters.labelSource === 'only-admin' && !isAdmin) return false;
        if (this.filters.labelSource === 'only-crowd' && !isCrowd) return false;
        if (this.filters.labelSource === 'only-any' && !hasLabel) return false;
      }
      
      // Check if any AI/Human filters are active
      const hasAIFrameFilters = this.filters.frameStatesAI.size > 0;
      const hasHumanFrameFilters = this.filters.frameStatesHuman.size > 0;
      
      // AI frame state filter
      if (hasAIFrameFilters) {
        if (!this.filters.frameStatesAI.has(img.analysis.frame_state)) return false;
      }
      
      // Human frame state filter
      if (hasHumanFrameFilters) {
        if (!img.existingLabel || !this.filters.frameStatesHuman.has(img.existingLabel.frameState)) return false;
      }
      
      // AI visibility filter (only if AI good is selected and image is AI good)
      const aiGood = img.analysis.frame_state === 'good';
      if (hasAIFrameFilters && this.filters.frameStatesAI.has('good') && aiGood) {
        if (this.filters.visibilityTypesAI.size > 0) {
          if (!img.analysis.visibility || !this.filters.visibilityTypesAI.has(img.analysis.visibility)) {
            return false;
          }
        }
      }
      
      // Human visibility filter (only if Human good is selected and image has human good label)
      const humanGood = img.existingLabel?.frameState === 'good';
      if (hasHumanFrameFilters && this.filters.frameStatesHuman.has('good') && humanGood) {
        if (this.filters.visibilityTypesHuman.size > 0) {
          if (!img.existingLabel.visibility || !this.filters.visibilityTypesHuman.has(img.existingLabel.visibility)) {
            return false;
          }
        }
      }
      
      // Confidence range filters (only apply to AI)
      const frameStateConf = (img.analysis.frame_state_probability || 0) * 100;
      if (frameStateConf < this.filters.frameConfidenceMin || frameStateConf > this.filters.frameConfidenceMax) {
        return false;
      }
      
      if (aiGood) {
        if (img.analysis.visibility_prob != null) {
          const visibilityConf = img.analysis.visibility_prob * 100;
          if (visibilityConf < this.filters.visibilityConfidenceMin || visibilityConf > this.filters.visibilityConfidenceMax) {
            return false;
          }
        }
      }
      
      // Disagreements only filter
      if (this.filters.disagreementsOnly) {
        if (!this.detectDisagreement(img)) return false;
      }
      
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
      
      // Clear batch (labels will be refreshed from database by caller)
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
   * Refresh labels from database for currently filtered images
   * Does NOT re-run filtering - just updates label data
   */
  async refreshLabelsFromDatabase() {
    if (!this.filters.startDate || !this.filters.endDate) {
      throw new Error('No date range loaded');
    }

    try {
      // Fetch fresh labels from database
      const labelsResponse = await fetchAdminLabels(this.filters.startDate, this.filters.endDate);
      
      // Track how many labels were updated
      let updatedCount = 0;
      
      // Update labels in dataStore
      labelsResponse.labels.forEach(label => {
        this.dataStore.setLabel(label.imageId, label);
      });
      
      // Update existingLabel in filteredImages array
      this.filteredImages.forEach(img => {
        const freshLabel = this.dataStore.getLabel(img.imageId);
        const hadLabel = !!img.existingLabel;
        const hasLabel = !!freshLabel;
        
        if (hadLabel !== hasLabel || 
            (hadLabel && hasLabel && (
              img.existingLabel.frameState !== freshLabel.frameState ||
              img.existingLabel.visibility !== freshLabel.visibility
            ))) {
          updatedCount++;
        }
        
        img.existingLabel = freshLabel || null;
      });

      if (this.onLabelsRefreshed) {
        this.onLabelsRefreshed({ success: true, updated: updatedCount });
      }
      
      return { updated: updatedCount };
    } catch (err) {
      console.error('Failed to refresh labels:', err);
      if (this.onLabelsRefreshed) {
        this.onLabelsRefreshed({ success: false, error: err.message });
      }
      throw err;
    }
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
   * Clear the preloaded image cache (e.g., after switching image source)
   */
  clearImageCache() {
    this.imageCache.clear();
    this.loadingPromises.clear();
  }

  /**
   * Check if there are unsaved labels in batch
   */
  hasUnsavedLabels() {
    return this.labelBatch.length > 0;
  }
}
