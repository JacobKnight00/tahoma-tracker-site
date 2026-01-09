// Calendar Picker Component
// A clean, mobile-friendly inline calendar for date selection

export class CalendarPicker {
  constructor(options = {}) {
    this.currentDate = options.currentDate || new Date();
    this.selectedDate = options.selectedDate || new Date();
    this.minDate = options.minDate || null;
    this.maxDate = options.maxDate || null;
    this.onDateSelect = options.onDateSelect || (() => {});
    this.getDateStatus = options.getDateStatus || (() => null); // Returns color code for a date
    
    this.viewDate = new Date(this.selectedDate); // The month being viewed
    this.isExpanded = false;
  }
  
  /**
   * Create the calendar HTML structure
   */
  createCalendarHTML() {
    const container = document.createElement('div');
    container.className = 'calendar-picker';
    container.innerHTML = `
      <div class="calendar-picker__compact">
        <button class="calendar-picker__prev-day" aria-label="Previous day">←</button>
        <button class="calendar-picker__date-display" aria-label="Toggle calendar">
          <span class="calendar-picker__date-text"></span>
          <span class="calendar-picker__toggle-icon">▼</span>
        </button>
        <button class="calendar-picker__next-day" aria-label="Next day">→</button>
      </div>
      <div class="calendar-picker__expanded" style="display: none;">
        <div class="calendar-picker__header">
          <button class="calendar-picker__prev-month" aria-label="Previous month">‹</button>
          <div class="calendar-picker__month-year"></div>
          <button class="calendar-picker__next-month" aria-label="Next month">›</button>
        </div>
        <div class="calendar-picker__grid">
          <div class="calendar-picker__weekdays">
            <div class="calendar-picker__weekday">Su</div>
            <div class="calendar-picker__weekday">Mo</div>
            <div class="calendar-picker__weekday">Tu</div>
            <div class="calendar-picker__weekday">We</div>
            <div class="calendar-picker__weekday">Th</div>
            <div class="calendar-picker__weekday">Fr</div>
            <div class="calendar-picker__weekday">Sa</div>
          </div>
          <div class="calendar-picker__days"></div>
        </div>
      </div>
    `;
    
    return container;
  }
  
  /**
   * Mount the calendar to a DOM element
   */
  mount(container) {
    console.log('CalendarPicker: Mounting to container', container);
    this.container = container;
    this.element = this.createCalendarHTML();
    container.appendChild(this.element);
    console.log('CalendarPicker: Element appended', this.element);
    
    this.initializeElements();
    this.setupEventListeners();
    this.updateDisplay();
    console.log('CalendarPicker: Successfully mounted and initialized');
  }
  
  /**
   * Initialize element references
   */
  initializeElements() {
    this.compactSection = this.element.querySelector('.calendar-picker__compact');
    this.expandedSection = this.element.querySelector('.calendar-picker__expanded');
    this.dateText = this.element.querySelector('.calendar-picker__date-text');
    this.toggleIcon = this.element.querySelector('.calendar-picker__toggle-icon');
    this.dateDisplayBtn = this.element.querySelector('.calendar-picker__date-display');
    this.prevDayBtn = this.element.querySelector('.calendar-picker__prev-day');
    this.nextDayBtn = this.element.querySelector('.calendar-picker__next-day');
    this.prevMonthBtn = this.element.querySelector('.calendar-picker__prev-month');
    this.nextMonthBtn = this.element.querySelector('.calendar-picker__next-month');
    this.monthYearDisplay = this.element.querySelector('.calendar-picker__month-year');
    this.daysContainer = this.element.querySelector('.calendar-picker__days');
  }
  
  /**
   * Setup event listeners
   */
  setupEventListeners() {
    this.dateDisplayBtn.addEventListener('click', () => this.toggleExpanded());
    this.prevDayBtn.addEventListener('click', () => this.navigateDay(-1));
    this.nextDayBtn.addEventListener('click', () => this.navigateDay(1));
    this.prevMonthBtn.addEventListener('click', () => this.navigateMonth(-1));
    this.nextMonthBtn.addEventListener('click', () => this.navigateMonth(1));
    
    // Close calendar when clicking outside
    document.addEventListener('click', (e) => {
      if (this.isExpanded && !this.element.contains(e.target)) {
        this.collapse();
      }
    });
  }
  
  /**
   * Toggle calendar expanded state
   */
  toggleExpanded() {
    if (this.isExpanded) {
      this.collapse();
    } else {
      this.expand();
    }
  }
  
  /**
   * Expand the calendar
   */
  expand() {
    this.isExpanded = true;
    this.expandedSection.style.display = 'block';
    this.toggleIcon.textContent = '▲';
    this.element.classList.add('calendar-picker--expanded');
    
    // Ensure we're viewing the month of the selected date
    this.viewDate = new Date(this.selectedDate);
    this.renderCalendar();
  }
  
  /**
   * Collapse the calendar
   */
  collapse() {
    this.isExpanded = false;
    this.expandedSection.style.display = 'none';
    this.toggleIcon.textContent = '▼';
    this.element.classList.remove('calendar-picker--expanded');
  }
  
  /**
   * Navigate days using arrow buttons
   */
  navigateDay(delta) {
    const newDate = new Date(this.selectedDate);
    newDate.setDate(newDate.getDate() + delta);
    
    if (this.isDateInRange(newDate)) {
      this.selectDate(newDate);
    }
  }
  
  /**
   * Navigate months
   */
  navigateMonth(delta) {
    this.viewDate.setMonth(this.viewDate.getMonth() + delta);
    this.renderCalendar();
  }
  
  /**
   * Select today's date
   */
  selectToday() {
    this.selectDate(new Date());
  }
  
  /**
   * Select a specific date
   */
  selectDate(date) {
    if (!this.isDateInRange(date)) return;
    
    this.selectedDate = new Date(date);
    this.selectedDate.setHours(0, 0, 0, 0);
    
    this.updateDisplay();
    this.onDateSelect(this.selectedDate);
    
    if (this.isExpanded) {
      this.renderCalendar();
    }
  }
  
  /**
   * Check if a date is within the allowed range
   */
  isDateInRange(date) {
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    
    if (this.minDate) {
      const min = new Date(this.minDate);
      min.setHours(0, 0, 0, 0);
      if (checkDate < min) return false;
    }
    
    if (this.maxDate) {
      const max = new Date(this.maxDate);
      max.setHours(0, 0, 0, 0);
      if (checkDate > max) return false;
    }
    
    return true;
  }
  
  /**
   * Update the compact date display
   */
  updateDisplay() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selected = new Date(this.selectedDate);
    selected.setHours(0, 0, 0, 0);
    
    let displayText;
    if (selected.getTime() === today.getTime()) {
      displayText = 'Today';
    } else {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      if (selected.getTime() === yesterday.getTime()) {
        displayText = 'Yesterday';
      } else {
        const options = { month: 'short', day: 'numeric', year: 'numeric' };
        displayText = this.selectedDate.toLocaleDateString('en-US', options);
      }
    }
    
    this.dateText.textContent = displayText;
    
    // Update button states
    const prevDate = new Date(this.selectedDate);
    prevDate.setDate(prevDate.getDate() - 1);
    const nextDate = new Date(this.selectedDate);
    nextDate.setDate(nextDate.getDate() + 1);
    
    this.prevDayBtn.disabled = !this.isDateInRange(prevDate);
    this.nextDayBtn.disabled = !this.isDateInRange(nextDate);
  }
  
  /**
   * Render the calendar grid
   */
  renderCalendar() {
    // Update month/year display
    const options = { month: 'long', year: 'numeric' };
    this.monthYearDisplay.textContent = this.viewDate.toLocaleDateString('en-US', options);
    
    // Clear existing days
    this.daysContainer.innerHTML = '';
    
    // Get first day of the month
    const year = this.viewDate.getFullYear();
    const month = this.viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // Get starting day (Sunday = 0)
    const startingDayOfWeek = firstDay.getDay();
    
    // Add empty cells for days before the 1st
    for (let i = 0; i < startingDayOfWeek; i++) {
      const emptyDay = document.createElement('div');
      emptyDay.className = 'calendar-picker__day calendar-picker__day--empty';
      this.daysContainer.appendChild(emptyDay);
    }
    
    // Add days of the month
    for (let day = 1; day <= lastDay.getDate(); day++) {
      const date = new Date(year, month, day);
      const dayElement = this.createDayElement(date);
      this.daysContainer.appendChild(dayElement);
    }
    
    // Update month navigation buttons
    this.updateMonthNavigationButtons();
  }
  
  /**
   * Create a day element
   */
  createDayElement(date) {
    const dayEl = document.createElement('button');
    dayEl.className = 'calendar-picker__day';
    dayEl.textContent = date.getDate();
    dayEl.setAttribute('aria-label', date.toLocaleDateString());
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    
    // Add today class
    if (checkDate.getTime() === today.getTime()) {
      dayEl.classList.add('calendar-picker__day--today');
    }
    
    // Add selected class
    const selected = new Date(this.selectedDate);
    selected.setHours(0, 0, 0, 0);
    if (checkDate.getTime() === selected.getTime()) {
      dayEl.classList.add('calendar-picker__day--selected');
    }
    
    // Check if date is in range
    const inRange = this.isDateInRange(date);
    if (!inRange) {
      dayEl.classList.add('calendar-picker__day--disabled');
      dayEl.disabled = true;
    } else {
      // Get status/color for this date
      const status = this.getDateStatus(date);
      if (status) {
        dayEl.classList.add(`calendar-picker__day--${status}`);
        
        // Days with no images should not be clickable
        if (status === 'no-images') {
          dayEl.disabled = true;
        } else {
          dayEl.addEventListener('click', () => this.handleDateClick(date));
        }
      } else {
        // No status yet (loading) or has images without visibility
        dayEl.addEventListener('click', () => this.handleDateClick(date));
      }
    }
    
    return dayEl;
  }
  
  /**
   * Handle day click
   */
  handleDateClick(date) {
    this.selectDate(date);
    this.collapse();
  }
  
  /**
   * Update month navigation button states
   */
  updateMonthNavigationButtons() {
    // Check if we can navigate to previous month
    if (this.minDate) {
      const firstOfCurrentMonth = new Date(this.viewDate.getFullYear(), this.viewDate.getMonth(), 1);
      const firstOfMinMonth = new Date(this.minDate.getFullYear(), this.minDate.getMonth(), 1);
      this.prevMonthBtn.disabled = firstOfCurrentMonth <= firstOfMinMonth;
    }
    
    // Check if we can navigate to next month
    if (this.maxDate) {
      const lastOfCurrentMonth = new Date(this.viewDate.getFullYear(), this.viewDate.getMonth() + 1, 0);
      const lastOfMaxMonth = new Date(this.maxDate.getFullYear(), this.maxDate.getMonth() + 1, 0);
      this.nextMonthBtn.disabled = lastOfCurrentMonth >= lastOfMaxMonth;
    }
  }
  
  /**
   * Update the selected date programmatically
   */
  setDate(date) {
    this.selectedDate = new Date(date);
    this.selectedDate.setHours(0, 0, 0, 0);
    this.updateDisplay();
    
    if (this.isExpanded) {
      this.renderCalendar();
    }
  }
  
  /**
   * Update date range constraints
   */
  setDateRange(minDate, maxDate) {
    this.minDate = minDate;
    this.maxDate = maxDate;
    this.updateDisplay();
    
    if (this.isExpanded) {
      this.renderCalendar();
    }
  }
  
  /**
   * Refresh the calendar (e.g., when date statuses change)
   */
  refresh() {
    this.updateDisplay();
    
    if (this.isExpanded) {
      this.renderCalendar();
    }
  }
  
  /**
   * Destroy the calendar
   */
  destroy() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}
