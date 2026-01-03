// DOM Utilities

/**
 * Create an element with attributes and children
 * @param {string} tag - HTML tag name
 * @param {Object} attrs - Attributes (class, id, data-*, etc.)
 * @param {Array|string} children - Child elements or text
 * @returns {HTMLElement} Created element
 */
export function createElement(tag, attrs = {}, children = []) {
  const element = document.createElement(tag);

  // Set attributes
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') {
      element.className = value;
    } else if (key === 'dataset') {
      Object.assign(element.dataset, value);
    } else if (key.startsWith('on')) {
      // Event listeners
      const eventName = key.slice(2).toLowerCase();
      element.addEventListener(eventName, value);
    } else {
      element.setAttribute(key, value);
    }
  }

  // Add children
  const childArray = Array.isArray(children) ? children : [children];
  for (const child of childArray) {
    if (typeof child === 'string') {
      element.appendChild(document.createTextNode(child));
    } else if (child instanceof HTMLElement) {
      element.appendChild(child);
    }
  }

  return element;
}

/**
 * Clear all children from an element
 * @param {HTMLElement} element - Element to clear
 */
export function clearElement(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

/**
 * Show an element (remove 'hidden' attribute)
 * @param {HTMLElement} element - Element to show
 */
export function show(element) {
  element.removeAttribute('hidden');
}

/**
 * Hide an element (add 'hidden' attribute)
 * @param {HTMLElement} element - Element to hide
 */
export function hide(element) {
  element.setAttribute('hidden', '');
}

/**
 * Toggle element visibility
 * @param {HTMLElement} element - Element to toggle
 * @param {boolean} force - Force show (true) or hide (false)
 */
export function toggle(element, force) {
  if (force === undefined) {
    element.hasAttribute('hidden') ? show(element) : hide(element);
  } else {
    force ? show(element) : hide(element);
  }
}

/**
 * Add a class to an element
 * @param {HTMLElement} element - Element
 * @param {string} className - Class name to add
 */
export function addClass(element, className) {
  element.classList.add(className);
}

/**
 * Remove a class from an element
 * @param {HTMLElement} element - Element
 * @param {string} className - Class name to remove
 */
export function removeClass(element, className) {
  element.classList.remove(className);
}

/**
 * Toggle a class on an element
 * @param {HTMLElement} element - Element
 * @param {string} className - Class name to toggle
 * @param {boolean} force - Force add (true) or remove (false)
 */
export function toggleClass(element, className, force) {
  element.classList.toggle(className, force);
}
