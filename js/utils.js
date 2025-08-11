import { EXCLUDE_SELECTORS } from './constants.js';

// Global variables
export let extensionEnabled = true;
export let debugMode = true;
export let isProcessing = false;
export let observer = null;
export let originalBanners = new Map();
export let lastProcessed = 0;
export let customizationView = null;
export let prefetchedCustomizationContent = null;

// Function to get settings
export function getSettings(callback) {
  chrome.runtime.sendMessage({ action: "getSettings" }, (settings) => {
    if (chrome.runtime.lastError) {
      log(`[Cookie Simplifier] Error getting settings: ${chrome.runtime.lastError.message}`);
      return;
    }
    extensionEnabled = settings.enabled !== undefined ? settings.enabled : true;
    debugMode = settings.debugMode !== undefined ? settings.debugMode : true;
    const autoOpenCustomization = settings.autoOpenCustomization !== undefined ? settings.autoOpenCustomization : true;
    log(`[Cookie Simplifier] Settings retrieved: enabled=${extensionEnabled}, debugMode=${debugMode}, autoOpenCustomization=${autoOpenCustomization}`);
    callback(settings);
  });
}

// Logging function that respects debug mode
export function log(message) {
  if (debugMode) {
    console.log(message);
  }
}

// Function to check if element is visible
export function isVisible(element) {
  if (!element) {
    log("[Cookie Simplifier] Visibility check failed: element is null");
    return false;
  }
  try {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    const isVisibleResult = (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden'
    );
    log(`[Cookie Simplifier] Visibility check for element ${element.id || element.tagName}: ${isVisibleResult}`);
    return isVisibleResult;
  } catch (error) {
    log(`[Cookie Simplifier] Error checking visibility: ${error.message}`);
    return false;
  }
}

// Function to check if element should be excluded
export function shouldExclude(element) {
  for (const selector of EXCLUDE_SELECTORS) {
    if (element.matches(selector) || element.closest(selector)) {
      log(`[Cookie Simplifier] Excluding element with selector: ${selector}`);
      return true;
    }
  }
  
  // Check if it's a sign-in dialog based on content
  const text = element.textContent.toLowerCase();
  if (text.includes('sign in') || text.includes('log in') || text.includes('login') || text.includes('signin')) {
    if (!text.includes('cookie') && !text.includes('consent') && !text.includes('privacy')) {
      log("[Cookie Simplifier] Excluding sign-in dialog based on content");
      return true;
    }
  }
  
  return false;
}

// Helper function to create a checkbox
export function createCheckbox(checked) {
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = checked;
  return checkbox;
}

// Helper function to create a disabled checkbox
export function createDisabledCheckbox(checked) {
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = checked;
  checkbox.disabled = true;
  return checkbox;
}