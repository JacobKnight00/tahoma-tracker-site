// Keyboard Shortcut Handler

/**
 * Keyboard shortcut manager
 */
export class KeyboardShortcuts {
  constructor() {
    this.shortcuts = new Map();
    this.enabled = true;

    // Bind the handler
    this.handleKeyDown = this.handleKeyDown.bind(this);

    // Start listening
    document.addEventListener('keydown', this.handleKeyDown);
  }

  /**
   * Register a keyboard shortcut
   * @param {string} key - Key to listen for (e.g., 'g', 'ArrowLeft', ' ')
   * @param {Function} handler - Function to call when key is pressed
   * @param {Object} options - Options (ctrl, shift, alt, meta)
   */
  register(key, handler, options = {}) {
    const normalizedKey = key.toLowerCase();
    this.shortcuts.set(normalizedKey, { handler, options });
  }

  /**
   * Unregister a keyboard shortcut
   * @param {string} key - Key to unregister
   */
  unregister(key) {
    const normalizedKey = key.toLowerCase();
    this.shortcuts.delete(normalizedKey);
  }

  /**
   * Clear all shortcuts
   */
  clear() {
    this.shortcuts.clear();
  }

  /**
   * Enable keyboard shortcuts
   */
  enable() {
    this.enabled = true;
  }

  /**
   * Disable keyboard shortcuts
   */
  disable() {
    this.enabled = false;
  }

  /**
   * Handle keydown events
   * @param {KeyboardEvent} event - Keyboard event
   */
  handleKeyDown(event) {
    // Don't handle shortcuts if disabled
    if (!this.enabled) {
      return;
    }

    // Don't handle shortcuts if user is typing in an input
    const target = event.target;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      return;
    }

    const normalizedKey = event.key.toLowerCase();
    const shortcut = this.shortcuts.get(normalizedKey);

    if (!shortcut) {
      return;
    }

    const { handler, options } = shortcut;

    // Check modifier keys
    const ctrlMatch = options.ctrl === undefined || options.ctrl === event.ctrlKey;
    const shiftMatch = options.shift === undefined || options.shift === event.shiftKey;
    const altMatch = options.alt === undefined || options.alt === event.altKey;
    const metaMatch = options.meta === undefined || options.meta === event.metaKey;

    if (ctrlMatch && shiftMatch && altMatch && metaMatch) {
      event.preventDefault();
      handler(event);
    }
  }

  /**
   * Destroy the keyboard shortcut manager
   */
  destroy() {
    document.removeEventListener('keydown', this.handleKeyDown);
    this.clear();
  }
}

/**
 * Create a new keyboard shortcut manager
 * @returns {KeyboardShortcuts} Keyboard shortcuts instance
 */
export function createKeyboardShortcuts() {
  return new KeyboardShortcuts();
}
