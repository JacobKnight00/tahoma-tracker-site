// Model Comparison Controller
// Manages state for comparing two model versions

import { fetchDailyManifest, getImageUrl } from '../lib/api.js';

export class CompareController {
  constructor() {
    this.modelA = 'v1';
    this.modelB = 'v2';
    this.allImages = [];
    this.filteredImages = [];
    this.currentIndex = 0;
    
    // Summary stats
    this.stats = {
      total: 0,
      agree: 0,
      disagreeFrame: 0,
      disagreeVisibility: 0,
    };
    
    // Filter state
    this.filters = {
      startDate: null,
      endDate: null,
      showDisagreeFrame: true,
      showDisagreeVisibility: true,
      showAgree: true,
      frameStates: new Set(['good', 'off_target', 'dark', 'bad']),
      confidenceDiffMin: 0,
    };
    
    // Callbacks
    this.onImageChange = null;
    this.onStatsUpdate = null;
  }

  /**
   * Load data for date range using manifests
   */
  async loadDataForDateRange(startDate, endDate) {
    this.filters.startDate = startDate;
    this.filters.endDate = endDate;
    this.allImages = [];
    
    const dates = this.getDateRange(startDate, endDate);
    
    for (const dateStr of dates) {
      try {
        // Fetch manifests for both models in parallel
        const [manifestA, manifestB] = await Promise.all([
          fetchDailyManifest(dateStr, this.modelA).catch(() => null),
          fetchDailyManifest(dateStr, this.modelB).catch(() => null),
        ]);
        
        if (!manifestA || !manifestB) {
          console.warn(`Missing manifest for ${dateStr} (A: ${!!manifestA}, B: ${!!manifestB})`);
          continue;
        }
        
        // Index model B images by time for quick lookup
        const modelBByTime = new Map();
        for (const img of manifestB.images) {
          modelBByTime.set(img.time, img);
        }
        
        // Match images and compare
        for (const imgA of manifestA.images) {
          const imgB = modelBByTime.get(imgA.time);
          if (!imgB) continue;
          
          const imageId = `${dateStr.replace(/-/g, '/')}/${imgA.time}`;
          const analysisA = this.extractAnalysis(imgA);
          const analysisB = this.extractAnalysis(imgB);
          const comparison = this.compareAnalysis(analysisA, analysisB);
          
          this.allImages.push({
            imageId,
            date: dateStr,
            time: imgA.time,
            analysisA,
            analysisB,
            comparison,
          });
        }
      } catch (err) {
        console.warn(`Failed to load data for ${dateStr}:`, err);
      }
    }
    
    this.computeStats();
    this.applyFilters();
  }

  /**
   * Extract analysis from manifest image entry
   */
  extractAnalysis(img) {
    return {
      frameState: img.frame_state || null,
      frameProb: img.frame_state_prob ?? null,
      visibility: img.visibility ?? null,
      visProb: img.visibility_prob ?? null,
    };
  }

  /**
   * Compare two analysis results
   */
  compareAnalysis(a, b) {
    const frameAgree = a.frameState === b.frameState;
    const visAgree = a.visibility === b.visibility;
    const frameProbDiff = Math.abs((a.frameProb || 0) - (b.frameProb || 0)) * 100;
    const visProbDiff = Math.abs((a.visProb || 0) - (b.visProb || 0)) * 100;
    
    return {
      frameAgree,
      visAgree,
      fullyAgree: frameAgree && visAgree,
      frameProbDiff,
      visProbDiff,
    };
  }

  /**
   * Compute summary statistics
   */
  computeStats() {
    this.stats = {
      total: this.allImages.length,
      agree: 0,
      disagreeFrame: 0,
      disagreeVisibility: 0,
    };
    
    for (const img of this.allImages) {
      if (img.comparison.fullyAgree) {
        this.stats.agree++;
      }
      if (!img.comparison.frameAgree) {
        this.stats.disagreeFrame++;
      }
      if (!img.comparison.visAgree && img.analysisA.frameState === 'good') {
        this.stats.disagreeVisibility++;
      }
    }
    
    if (this.onStatsUpdate) {
      this.onStatsUpdate(this.stats);
    }
  }

  /**
   * Apply filters to create filtered list
   */
  applyFilters() {
    this.filteredImages = this.allImages.filter(img => {
      // Agreement filters
      if (img.comparison.fullyAgree && !this.filters.showAgree) return false;
      if (!img.comparison.frameAgree && !this.filters.showDisagreeFrame) return false;
      if (img.comparison.frameAgree && !img.comparison.visAgree && !this.filters.showDisagreeVisibility) return false;
      
      // Frame state filter (either model)
      if (!this.filters.frameStates.has(img.analysisA.frameState) && 
          !this.filters.frameStates.has(img.analysisB.frameState)) {
        return false;
      }
      
      // Confidence difference threshold
      if (this.filters.confidenceDiffMin > 0) {
        const maxDiff = Math.max(img.comparison.frameProbDiff, img.comparison.visProbDiff);
        if (maxDiff < this.filters.confidenceDiffMin) return false;
      }
      
      return true;
    });
    
    this.currentIndex = 0;
    this.notifyImageChange();
  }

  /**
   * Get current image
   */
  getCurrentImage() {
    if (this.currentIndex < 0 || this.currentIndex >= this.filteredImages.length) {
      return null;
    }
    return this.filteredImages[this.currentIndex];
  }

  /**
   * Get image URL
   */
  getCurrentImageUrl() {
    const img = this.getCurrentImage();
    return img ? getImageUrl(img.imageId) : null;
  }

  /**
   * Navigate to next image
   */
  navigateNext() {
    if (this.currentIndex < this.filteredImages.length - 1) {
      this.currentIndex++;
      this.notifyImageChange();
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
      return true;
    }
    return false;
  }

  /**
   * Jump to next disagreement
   */
  navigateNextDisagreement() {
    for (let i = this.currentIndex + 1; i < this.filteredImages.length; i++) {
      if (!this.filteredImages[i].comparison.fullyAgree) {
        this.currentIndex = i;
        this.notifyImageChange();
        return true;
      }
    }
    return false;
  }

  /**
   * Notify image change
   */
  notifyImageChange() {
    if (this.onImageChange) {
      this.onImageChange(this.getCurrentImage());
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
   * Update filter
   */
  updateFilter(key, value) {
    this.filters[key] = value;
    this.applyFilters();
  }

  /**
   * Set models to compare
   */
  setModels(modelA, modelB) {
    this.modelA = modelA;
    this.modelB = modelB;
  }
}
