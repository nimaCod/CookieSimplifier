console.log("[Cookie Simplifier] Content script loaded");

// Global variables to track extension state
let extensionEnabled = true;
let debugMode = true;
let autoOpenCustomization = true;
let isProcessing = false; // Flag to prevent re-entrancy
let observer = null; // Reference to our observer
let originalBanners = new Map(); // Track original banners we've hidden
let lastProcessed = 0; // For MutationObserver throttling
let prefetchedCustomizationContent = null; // Store prefetched customization content
let originalCustomizationPage = null; // Reference to original customization page
let originalBanner = null; // Reference to the original banner we're replacing

// OneTrust-specific selectors
const ONETRUST_SELECTORS = [
  '#onetrust-banner-sdk', // Main OneTrust banner
  '#onetrust-consent-sdk', // OneTrust container
  '#onetrust-group-container', // OneTrust group container
  '#onetrust-policy', // OneTrust policy section
  '.onetrust-banner-sdk', // Alternative class name
  '#ot-sdk-container',
  '.ot-sdk-container', // Add this - the missing container
  '.ot-sdk-row', // Add this - parent container
  '[id*="onetrust"]', // Any element with onetrust in ID
  '[class*="onetrust"]', // Any element with onetrust in class
  '[id*="ot-sdk"]', // Any element with ot-sdk in ID
  '[class*="ot-sdk"]', // Any element with ot-sdk in class
];

// General cookie banner selectors
const GENERAL_BANNER_SELECTORS = [
  '[id*="cookie"]',
  '[class*="cookie"]',
  '[id*="consent"]',
  '[class*="consent"]',
  '[id*="gdpr"]',
  '#truste-consent-track',
  '.cc-window',
  '.cookie-banner',
  '.cookie-notice',
  '.consent-popup',
  '.gdpr-banner',
  '.privacy-banner',
  '.eucookie',
  '.cookie-consent',
  '.cookie-policy',
  '.banner-consent',
  '[data-consent]',
  '.js-cookie-consent',
  '.cmp-container',
  '[data-cmp-host]',
  '[class*="notice"]'
];

// Elements to exclude (common false positives)
const EXCLUDE_SELECTORS = [
  // More specific authentication dialog selectors
  '[aria-modal="true"][role="dialog"]:not([aria-label*="cookie"]):not([aria-label*="consent"]):not([aria-label*="privacy"]):not([id*="onetrust"]):not([class*="onetrust"])',
  '[role="dialog"]:not([aria-label*="cookie"]):not([aria-label*="consent"]):not([aria-label*="privacy"]):not([id*="onetrust"]):not([class*="onetrust"])',
  
  // Original selectors but more specific
  '.modal-backdrop:not(.cookie):not([id*="onetrust"]):not([class*="onetrust"])',
  '.g-signin2',
  '[data-testid*="signin"]',
  '[data-testid*="login"]',
  '[id*="signin"]:not([id*="onetrust"])',
  '[id*="login"]:not([id*="onetrust"])',
  '[class*="signin"]:not([class*="onetrust"])',
  '[class*="login"]:not([class*="onetrust"])',
  
  // Stack Overflow specific selectors
  '.js-signup-modal',
  '.js-login-modal',
  '.signup-modal',
  '.login-modal',
  '.auth-popup',
  '[id*="auth"]:not([id*="onetrust"])',
  '[class*="auth"]:not([class*="onetrust"])',
  '#signup-modal',
  '#login-modal'
];

// Enhanced overlay selectors for dark filters and backdrops
const OVERLAY_SELECTORS = [
  '.onetrust-pc-dark-filter',  // OneTrust dark overlay
  '.ot-sdk-overlay',          // OneTrust overlay
  '.cookie-modal-backdrop',   // Generic cookie modal backdrop
  '[class*="modal-backdrop"]', // Any modal backdrop
  '.ot-dark-filter',          // Alternative OneTrust dark filter
  '.onetrust-dark-filter',    // Another variation
  '#onetrust-pc-sdk + .dark-filter', // Sibling dark filter
  '[id*="dark-filter"]',      // Any element with dark-filter in ID
  '[class*="dark-filter"]',   // Any element with dark-filter in class
  '.backdrop',               // Generic backdrop
  '.overlay',                // Generic overlay
  '[role="dialog"] ~ .backdrop', // Backdrop associated with dialog
  '.modal-backdrop',         // Bootstrap modal backdrop
  '.fade',                   // Bootstrap fade class
  '.onetrust-consent-sdk ~ .onetrust-pc-dark-filter', // Specific OneTrust pattern
  // Additional selectors for problematic overlays
  '.ot-floating-bar__overlay',
  '[class*="consent-overlay"]',
  '[id*="consent-overlay"]',
  '[class*="cookie-overlay"]',
  '[id*="cookie-overlay"]',
  '.ot-sdk-sticky',
  '.ot-sdk-container',
  '.ot-floating-bar',
  '.ot-pc-dialog',
  '.ot-pc-overlay',
  '.ot-overlay',
  '.ot-modal-backdrop',
  '.ot-sdk-shield',
  '.ot-sdk-cookie-policy',
  '.ot-sdk-btn',
  '.ot-sdk-show-settings'
];

// Combined selectors
const BANNER_SELECTORS = [...ONETRUST_SELECTORS, ...GENERAL_BANNER_SELECTORS];

// Content selectors for extraction
const CONTENT_SELECTORS = [
  '#onetrust-policy-text', // OneTrust
  '#onetrust-policy-title', // OneTrust title
  '.ot-b-addl-desc', // OneTrust additional description
  '.banner-text',
  '.cookie-message',
  '.consent-message',
  '.privacy-notice',
  '.cookie-notice-text',
  '[data-testid*="message"]',
  '[data-consent*="message"]',
  '.cmp-intro_intro', // Quantcast
  '.cookie-consent__message',
  '.banner-content',
  '.consent-content',
  '.message-component' // BBC
];

// Customization page selectors
const CUSTOMIZATION_SELECTORS = [
  '#onetrust-pc-sdk',           // OneTrust preference center
  '#onetrust-consent-sdk',      // OneTrust consent SDK
  '.cookie-preferences',        // Generic cookie preferences
  '.consent-preferences',       // Generic consent preferences
  '.privacy-preferences',       // Generic privacy preferences
  '[id*="preference-center"]',  // Preference center by ID
  '[class*="preference-center"]' // Preference center by class
];

const buttonKeywords = {
  accept: ['accept', 'agree', 'allow', 'ok', 'confirm', 'got it', 'understand', 'continue', 'yes', 'submit', 'allow all', 'accept all', 'i agree', 'i accept'],
  reject: ['reject', 'decline', 'deny', 'disagree', 'no thanks', 'opt out', 'refuse', 'no', 'reject all', 'decline all', 'deny all'],
  customize: ['customize', 'settings', 'preferences', 'manage', 'options', 'configure', 'more info', 'learn more', 'details', 'cookie settings', 'privacy settings', 'manage preferences', 'privacy options']
}; 

// Look for common save button selectors
const saveButtonSelectors = [
  '.save-preference-btn',
  '.btn-primary',
  '.accept-btn',
  '#save-preferences',
  '[aria-label*="save"]',
  '[data-testid*="save"]',
  '[data-automation-id*="save"]',
  '.ot-pc-footer .save-preference-btn', // OneTrust specific
  '.ot-pc-footer .btn-primary',       // OneTrust specific
  '.consent-preferences .save',        // Generic
  '.cookie-preferences .save',         // Generic
  '.preferences-save',                 // Generic
  '.save-settings',                    // Generic
  '.save-consent',                     // Generic
  '.submit-preferences',               // Generic
  '.apply-preferences'                 // Generic
];

// Add these constants at the top after the existing constants
const PERSIAN_TEXT_STYLING = {
  fontFamily: 'Vazirmatn, Tahoma, Arial, sans-serif',
  fontSize: '14px',
  color: '#333333',
  lineHeight: '1.5'
};

// Translation mapping for cookie categories
const CATEGORY_TRANSLATIONS = {
  "Strictly Necessary Cookies": "کوکی‌های ضروری",
  "Necessary Cookies": "کوکی‌های ضروری",
  "Analytics Cookies": "کوکی‌های تحلیلی",
  "Performance Cookies": "کوکی‌های کارآیی",
  "Functional Cookies": "کوکی‌های عملکردی",
  "Targeting Cookies": "کوکی‌های تبلیغاتی هدفمند",
  "Advertising Cookies": "کوکی‌های تبلیغاتی",
  "Social Media Cookies": "کوکی‌های شبکه‌های اجتماعی",
  "Unclassified Cookies": "کوکی‌های طبقه‌بندی نشده",
  "Save and communicate privacy choices": "ذخیره تنظیمات حریم خصوصی"
};

// Persian text mappings for the banner
const PERSIAN_TEXTS = {
  bannerTitle: "تنظیمات کوکی‌ها",
  bannerDescription: "ما از کوکی‌ها برای بهبود تجربه شما در وب‌سایت استفاده می‌کنیم. لطفاً تنظیمات کوکی خود را انتخاب کنید.",
  acceptAllButton: "پذیرش همه",
  rejectAllButton: "رد همه",
  acceptSelectionButton: "پذیرش انتخاب"
};

// Regex patterns for matching category names (ordered by specificity)
const CATEGORY_PATTERNS = [
  { pattern: /Strictly Necessary Cookies/i, key: "Strictly Necessary Cookies" },
  { pattern: /Required Cookies/i, key: "Strictly Necessary Cookies" },
  { pattern: /Necessary Cookies/i, key: "Necessary Cookies" },
  { pattern: /Analytics Cookies/i, key: "Analytics Cookies" },
  { pattern: /Performance Cookies/i, key: "Performance Cookies" },
  { pattern: /Functional Cookies/i, key: "Functional Cookies" },
  { pattern: /Targeting Cookies/i, key: "Targeting Cookies" },
  { pattern: /Advertising Cookies/i, key: "Advertising Cookies" },
  { pattern: /Social Media Cookies/i, key: "Social Media Cookies" },
  { pattern: /Unclassified Cookies/i, key: "Unclassified Cookies" },
  { pattern: /Save and communicate privacy choices/i, key: "Save and communicate privacy choices" }
];


// Function to get settings
function getSettings(callback) {
  chrome.runtime.sendMessage({ action: "getSettings" }, (settings) => {
    if (chrome.runtime.lastError) {
      log(`[Cookie Simplifier] Error getting settings: ${chrome.runtime.lastError.message}`);
      return;
    }
    extensionEnabled = settings.enabled !== undefined ? settings.enabled : true;
    debugMode = settings.debugMode !== undefined ? settings.debugMode : true;
    autoOpenCustomization = settings.autoOpenCustomization !== undefined ? settings.autoOpenCustomization : true;
    log(`[Cookie Simplifier] Settings retrieved: enabled=${extensionEnabled}, debugMode=${debugMode}, autoOpenCustomization=${autoOpenCustomization}`);
    callback(settings);
  });
}

// Logging function that respects debug mode
function log(message) {
  if (debugMode) {
    console.log(message);
  }
}

// Function to check if element is visible
function isVisible(element) {
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
function shouldExclude(element) {
  // First check explicit selectors
  for (const selector of EXCLUDE_SELECTORS) {
    if (element.matches(selector) || element.closest(selector)) {
      // Additional check for OneTrust elements
      if (element.closest('[id*="onetrust"]') || element.closest('[class*="onetrust"]') || 
          element.closest('.ot-sdk-container')) {
        // Don't exclude OneTrust elements even if they match other selectors
        continue;
      }
      log(`[Cookie Simplifier] Excluding element with selector: ${selector}`);
      return true;
    }
  }
  
  // Enhanced content-based exclusion for authentication dialogs
  const text = element.textContent.toLowerCase();
  const html = element.innerHTML.toLowerCase();
  
  // Check if it's a OneTrust element - never exclude these
  if (element.id.includes('onetrust') || 
      element.className.includes('onetrust') ||
      element.closest('[id*="onetrust"]') ||
      element.closest('[class*="onetrust"]') ||
      element.closest('.ot-sdk-container')) {
    log("[Cookie Simplifier] Found OneTrust element, not excluding");
    return false;
  }
  
  // Check if it's a sign-in dialog based on content
  const authKeywords = [
    'sign in', 'log in', 'login', 'signin', 'sign up', 'signup', 
    'register', 'create account', 'forgot password', 'reset password'
  ];
  
  // Only exclude if it has authentication keywords AND no cookie/consent keywords
  const hasAuthKeywords = authKeywords.some(keyword => text.includes(keyword));
  const hasCookieKeywords = text.includes('cookie') || text.includes('consent') || text.includes('privacy');
  
  if (hasAuthKeywords && !hasCookieKeywords) {
    // Additional check for authentication-specific elements
    const hasAuthElements = element.querySelector('input[type="email"], input[type="password"], input[name*="email"], input[name*="password"], input[name*="login"], input[name*="user"]') !== null;
    
    if (hasAuthElements) {
      log("[Cookie Simplifier] Excluding authentication dialog based on content and form elements");
      return true;
    }
  }
  
  // Check for authentication-related form elements
  const authFormElements = element.querySelectorAll('input[type="email"], input[type="password"], input[name*="email"], input[name*="password"], input[name*="login"], input[name*="user"]');
  if (authFormElements.length > 0 && !hasCookieKeywords) {
    log("[Cookie Simplifier] Excluding element with authentication form fields");
    return true;
  }
  
  // Check for OAuth buttons (Google, GitHub, Facebook, etc.)
  const oauthButtons = element.querySelectorAll('button[class*="google"], button[class*="github"], button[class*="facebook"], button[class*="twitter"], button[class*="microsoft"], a[class*="google"], a[class*="github"], a[class*="facebook"]');
  if (oauthButtons.length > 0 && !hasCookieKeywords) {
    log("[Cookie Simplifier] Excluding element with OAuth buttons");
    return true;
  }
  
  // Stack Overflow specific check
  if (window.location.hostname.includes('stackoverflow.com') || 
      window.location.hostname.includes('stackexchange.com')) {
    // Check for Stack Overflow specific authentication elements
    const stackAuthElements = element.querySelectorAll('.js-signup-modal, .js-login-modal, .signup-modal, .login-modal, [id*="signup-modal"], [id*="login-modal"]');
    if (stackAuthElements.length > 0) {
      log("[Cookie Simplifier] Excluding Stack Overflow authentication modal");
      return true;
    }
    
    // Check for Stack Overflow specific authentication buttons
    const stackAuthButtons = element.querySelectorAll('button[data-provider], a[data-provider]');
    if (stackAuthButtons.length > 0 && !hasCookieKeywords) {
      log("[Cookie Simplifier] Excluding Stack Overflow authentication buttons");
      return true;
    }
  }
  
  return false;
}

function isElementVisibleToUser(element) {
  if (!element) return false;
  
  // Check if element is in the viewport
  const rect = element.getBoundingClientRect();
  const isInViewport = (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
  
  // Check if element has actual size
  const hasSize = rect.width > 0 && rect.height > 0;
  
  // Check if element or its parents are hidden
  const style = window.getComputedStyle(element);
  const isHidden = style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';
  
  // Check if element is hidden by clipping
  const isClipped = (
    rect.right <= 0 || 
    rect.bottom <= 0 || 
    rect.left >= window.innerWidth || 
    rect.top >= window.innerHeight
  );
  
  return isInViewport && hasSize && !isHidden && !isClipped;
}

// Find cookie banner
function findBanner() {
  log("[Cookie Simplifier] Searching for cookie banner...");
  // Then try general selectors
  for (const selector of BANNER_SELECTORS) {
    const elements = document.querySelectorAll(selector);
    log(`[Cookie Simplifier] Found ${elements.length} elements for general selector: ${selector}`);
    
    for (const element of elements) {
      if (originalBanners.has(element)) {
        log("[Cookie Simplifier] Skipping already processed banner: " + (element.id || element.tagName));
        continue;
      }
      
      if (isElementVisibleToUser(element) && !shouldExclude(element)) {
        log(`[Cookie Simplifier] Found visible banner with selector: ${selector}, ID: ${element.id || 'none'}`);
        return element;
      }
    }
  }
  
  log("[Cookie Simplifier] No cookie banner found");
  return null;
}

// Extract HTML content from banner
function extractBannerContent(banner) {
  log("[Cookie Simplifier] Extracting banner HTML content...");
  
  try {
    // Create a container for the extracted content
    const contentContainer = document.createElement('div');
    contentContainer.className = 'extracted-content black-text';
    
    // Try to find content sections
    let foundContent = false;
    const addedSections = new Set(); // Track which sections we've already added
    
    for (const selector of CONTENT_SELECTORS) {
      const contentElement = banner.querySelector(selector);
      if (contentElement && !addedSections.has(contentElement)) {
        const contentClone = contentElement.cloneNode(true);
        contentContainer.appendChild(contentClone);
        addedSections.add(contentElement);
        foundContent = true;
        log(`[Cookie Simplifier] Added content using selector: ${selector}`);
      }
    }
    
    // If no specific content found, clone the entire banner (excluding buttons)
    if (!foundContent) {
      const bannerClone = banner.cloneNode(true);
      contentContainer.appendChild(bannerClone);
      log("[Cookie Simplifier] Added cloned banner");
    }
    
    // Make all text elements black
    const textElements = contentContainer.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, div, li, td, th');
    textElements.forEach(element => {
      element.style.color = '#000000';
      element.style.bottom = null;
    });
    
    log(`[Cookie Simplifier] Extracted banner content with ${contentContainer.children.length} sections`);
    return contentContainer;
  } catch (error) {
    log(`[Cookie Simplifier] Error extracting banner content: ${error.message}`);
    return createFallbackContent();
  }
}

// Create fallback content if extraction fails
function createFallbackCustomizationContent() {
  const fallback = document.createElement('div');
  fallback.className = 'customization-content black-text rtl-text';
  fallback.style.color = '#000000';
  fallback.style.backgroundColor = '#ffffff';
  fallback.style.padding = '15px';
  fallback.setAttribute('dir', 'rtl');
  
  // Necessary category (Always Active)
  const necessaryCategory = createAccordionCategory(
    'Strictly Necessary Cookies', 
    'این کوکی‌ها برای عملکرد وب‌سایت ضروری هستند و نمی‌توان آنها را غیرفعال کرد.',
    createDisabledCheckbox(true),
    true
  );
  
  // Analytics category
  const analyticsCategory = createAccordionCategory(
    'Analytics Cookies', 
    'این کوکی‌ها به ما اجازه می‌دهند بازدیدها و منابع ترافیک را بشماریم تا بتوانیم عملکرد سایت خود را اندازه‌گیری و بهبود بخشیم.',
    createCheckbox(false),
    false
  );
  
  // Marketing category
  const marketingCategory = createAccordionCategory(
    'Targeting Cookies', 
    'این کوکی‌ها ممکن است از طریق سایت ما توسط شرکای تبلیغاتی ما تنظیم شوند.',
    createCheckbox(false),
    false
  );
  
  fallback.appendChild(necessaryCategory);
  fallback.appendChild(analyticsCategory);
  fallback.appendChild(marketingCategory);
  
  return fallback;
}

// Extract buttons from OneTrust banner
function extractOneTrustButtons(banner) {
  log("[Cookie Simplifier] Extracting OneTrust buttons...");
  const buttons = [];
  
  try {
    // Find the accept button
    const acceptBtn = banner.querySelector('#onetrust-accept-btn-handler');
    if (acceptBtn && isVisible(acceptBtn)) {
      buttons.push({ 
        type: 'accept', 
        element: acceptBtn, 
        text: acceptBtn.textContent.trim() || 'Accept All' 
      });
      log("[Cookie Simplifier] Found OneTrust ACCEPT button");
    }
    
    // Find the reject button
    const rejectBtn = banner.querySelector('#onetrust-reject-all-handler');
    if (rejectBtn && isVisible(rejectBtn)) {
      buttons.push({ 
        type: 'reject', 
        element: rejectBtn, 
        text: rejectBtn.textContent.trim() || 'Reject All' 
      });
      log("[Cookie Simplifier] Found OneTrust REJECT button");
    }
    
    // Find the customize button
    const customizeBtn = banner.querySelector('#onetrust-pc-btn-handler');
    if (customizeBtn && isVisible(customizeBtn)) {
      buttons.push({ 
        type: 'customize', 
        element: customizeBtn, 
        text: customizeBtn.textContent.trim() || 'Customize Settings' 
      });
      log("[Cookie Simplifier] Found OneTrust CUSTOMIZE button");
    }
    
    log(`[Cookie Simplifier] Extracted ${buttons.length} OneTrust buttons`);
    return buttons;
  } catch (error) {
    log(`[Cookie Simplifier] Error extracting OneTrust buttons: ${error.message}`);
    return [];
  }
}

// Extract buttons from banner
function extractButtons(banner) {
  log("[Cookie Simplifier] Extracting buttons from banner...");
  
  // Check if it's a OneTrust banner
  if (banner.id === 'onetrust-banner-sdk' || banner.id === 'onetrust-consent-sdk' || 
      banner.classList.contains('onetrust-banner-sdk') || banner.querySelector('#onetrust-banner-sdk')) {
    return extractOneTrustButtons(banner);
  }
  
  const buttons = [];
  
  try {
    // Expanded selector for clickable elements
    const clickableElements = banner.querySelectorAll(
      'button, ' +
      'a[role="button"], ' +
      '[role="button"], ' +
      'div[onclick], ' +
      '[data-consent], ' +
      '[data-cmp], ' +
      'input[type="button"], ' +
      'input[type="submit"], ' +
      '.btn, ' +
      '.button, ' +
      '[class*="btn"], ' +
      '[class*="button"], ' +
      '[id*="btn"], ' +
      '[id*="button"], ' +
      '.cookie-btn, ' +
      '.consent-btn, ' +
      '.accept-btn, ' +
      '.reject-btn, ' +
      '.settings-btn, ' +
      '.preferences-btn'
    );
    log(`[Cookie Simplifier] Found ${clickableElements.length} clickable elements`);
    
    clickableElements.forEach(element => {
      // Normalize the text by removing extra spaces and converting to lowercase
      const text = element.textContent.trim().toLowerCase().replace(/\s+/g, ' ');
      
      // Skip close buttons explicitly
      if (text === '✕' || text.includes('close') || text.includes('dismiss') || element.closest('#onetrust-close-btn-container')) {
        log(`[Cookie Simplifier] Skipping close button with text: "${text}"`);
        return;
      }
      
      // Skip authentication buttons
      if (text.includes('sign in') || text.includes('log in') || text.includes('login') || 
          text.includes('sign up') || text.includes('signup') || text.includes('register') ||
          text.includes('google') || text.includes('github') || text.includes('facebook') ||
          text.includes('twitter') || text.includes('microsoft')) {
        log(`[Cookie Simplifier] Skipping authentication button with text: "${text}"`);
        return;
      }
      
      log(`[Cookie Simplifier] Processing button with text: "${text}"`);
      
      // Check against button keywords
      let buttonType = null;
      for (const [type, keywords] of Object.entries(buttonKeywords)) {
        if (keywords.some(keyword => text.includes(keyword))) {
          buttonType = type;
          break;
        }
      }
      
      // If no match by text, try to match by attributes
      if (!buttonType) {
        const attributes = element.getAttributeNames();
        const attributeValues = attributes.map(attr => element.getAttribute(attr).toLowerCase());
        
        // Check for accept-related attributes
        if (attributes.some(attr => attr.includes('accept')) || 
            attributeValues.some(val => val.includes('accept'))) {
          buttonType = 'accept';
        }
        // Check for reject-related attributes
        else if (attributes.some(attr => attr.includes('reject')) || 
                 attributeValues.some(val => val.includes('reject'))) {
          buttonType = 'reject';
        }
        // Check for customize-related attributes
        else if (attributes.some(attr => attr.includes('customize')) || 
                 attributeValues.some(val => val.includes('customize')) ||
                 attributes.some(attr => attr.includes('setting')) || 
                 attributeValues.some(val => val.includes('setting'))) {
          buttonType = 'customize';
        }
      }
      
      // If still no match, try to infer from button position (last button is often accept)
      if (!buttonType && clickableElements.length > 1) {
        const index = Array.from(clickableElements).indexOf(element);
        if (index === clickableElements.length - 1) {
          buttonType = 'accept';
        } else if (index === clickableElements.length - 2) {
          buttonType = 'reject';
        }
      }
      
      // If we found a button type, add it
      if (buttonType) {
        buttons.push({ 
          type: buttonType, 
          element, 
          text: element.textContent.trim() || buttonType.charAt(0).toUpperCase() + buttonType.slice(1) 
        });
        log(`[Cookie Simplifier] Identified as ${buttonType.toUpperCase()} button`);
      }
    });
    
    // Add default button if none found
    if (buttons.length === 0) {
      log("[Cookie Simplifier] No buttons found, adding default action");
      buttons.push({
        type: 'accept',
        element: { click: () => log("[Cookie Simplifier] Default accept action") },
        text: 'Accept Necessary Cookies'
      });
    }
    
    log(`[Cookie Simplifier] Extracted ${buttons.length} buttons:`, buttons.map(b => ({ type: b.type, text: b.text })));
    return buttons;
  } catch (error) {
    log(`[Cookie Simplifier] Error extracting buttons: ${error.message}`);
    return [{
      type: 'accept',
      element: { click: () => log("[Cookie Simplifier] Default accept action due to error") },
      text: 'Accept Necessary Cookies'
    }];
  }
}

// Helper function to check if a category is always active
function isAlwaysActiveCategory(categoryElement, toggle, categoryName) {
  if (toggle && toggle.disabled && toggle.checked) {
    return true;
  }
  
  // Check for specific attributes that indicate always active
  if (toggle && (
    toggle.hasAttribute('data-always-active') || 
    toggle.hasAttribute('data-necessary') || 
    toggle.hasAttribute('data-essential') ||
    toggle.hasAttribute('data-required')
  )) {
    return true;
  }
  
  // Check for specific classes on the category element
  const classIndicators = [
    'necessary', 'essential', 'required', 'always-active', 
    'strictly-necessary', 'mandatory', 'required-cookies'
  ];
  
  if (classIndicators.some(indicator => 
    categoryElement.classList.contains(indicator) ||
    categoryElement.className.toLowerCase().includes(indicator)
  )) {
    return true;
  }
  
  // Check for text content that indicates necessary cookies
  const text = categoryElement.textContent.toLowerCase();
  const textIndicators = [
    'necessary cookies', 'essential cookies', 'required cookies',
    'strictly necessary', 'always active', 'these cookies are essential',
    'these cookies are necessary', 'these cookies are required'
  ];
  
  if (textIndicators.some(indicator => text.includes(indicator))) {
    return true;
  }
  
  // Check for specific badge or label elements
  const badgeElement = categoryElement.querySelector('.badge, .label, .tag, .ot-always-active');
  if (badgeElement) {
    const badgeText = badgeElement.textContent.toLowerCase();
    if (badgeText.includes('necessary') || badgeText.includes('essential') || 
        badgeText.includes('always active') || badgeText.includes('required')) {
      return true;
    }
  }
  
  // Check for specific data attributes on the category element
  if (categoryElement.hasAttribute('data-necessary') || 
      categoryElement.hasAttribute('data-essential') || 
      categoryElement.hasAttribute('data-always-active')) {
    return true;
  }
  
  // Check for specific category names that are typically always active
  if (categoryName) {
    const alwaysActiveNames = [
      'necessary', 'essential', 'required', 'strictly necessary',
      'functional', 'performance', 'save preferences'
    ];
    
    const nameLower = categoryName.toLowerCase();
    if (alwaysActiveNames.some(name => nameLower.includes(name))) {
      return true;
    }
  }
  
  return false;
}


// Helper function to translate category names using regex matching
function translateCategoryName(name) {
  // Try to match each pattern in order
  for (const { pattern, key } of CATEGORY_PATTERNS) {
    if (pattern.test(name)) {
      return CATEGORY_TRANSLATIONS[key] || name;
    }
  }
  // If no pattern matches, return the original name
  return name;
}

// Modified createAccordionCategory function
function createAccordionCategory(categoryName, description, toggleElement, isAlwaysActive = false, subChoices = []) {
  // Translate the category name
  const translatedName = translateCategoryName(categoryName);
  
  const categoryItem = document.createElement('div');
  categoryItem.className = 'cookie-category-item';
  categoryItem.style.backgroundColor = '#f9f9f9';
  categoryItem.style.border = '1px solid #ddd';
  categoryItem.style.borderRadius = '4px';
  categoryItem.style.marginBottom = '10px';
  categoryItem.style.overflow = 'hidden';
  
  // Category header (always visible)
  const header = document.createElement('div');
  header.className = 'cookie-category-header';
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.padding = '12px';
  header.style.cursor = 'pointer';
  header.style.backgroundColor = '#f9f9f9';
  
  const nameContainer = document.createElement('div');
  nameContainer.style.display = 'flex';
  nameContainer.style.alignItems = 'center';
  
  const categoryNameElement = document.createElement('span');
  categoryNameElement.className = 'cookie-category-name';
  categoryNameElement.textContent = translatedName; // Use translated name
  categoryNameElement.style.fontWeight = 'bold';
  categoryNameElement.style.color = PERSIAN_TEXT_STYLING.color;
  categoryNameElement.style.fontFamily = PERSIAN_TEXT_STYLING.fontFamily;
  categoryNameElement.style.fontSize = PERSIAN_TEXT_STYLING.fontSize;
  categoryNameElement.style.marginRight = '10px';
  
  // Add "Always Active" badge if needed
  if (isAlwaysActive) {
    const alwaysActiveBadge = document.createElement('span');
    alwaysActiveBadge.textContent = 'همیشه فعال';
    alwaysActiveBadge.style.fontSize = '10px';
    alwaysActiveBadge.style.padding = '2px 6px';
    alwaysActiveBadge.style.backgroundColor = '#4CAF50';
    alwaysActiveBadge.style.color = 'white';
    alwaysActiveBadge.style.borderRadius = '10px';
    alwaysActiveBadge.style.marginLeft = '8px';
    alwaysActiveBadge.style.fontFamily = PERSIAN_TEXT_STYLING.fontFamily;
    nameContainer.appendChild(alwaysActiveBadge);
  }
  
  // Toggle icon
  const toggleIcon = document.createElement('span');
  toggleIcon.className = 'cookie-category-toggle-icon';
  toggleIcon.textContent = '▼'; // Down arrow
  toggleIcon.style.color = '#666';
  toggleIcon.style.fontSize = '12px';
  toggleIcon.style.transition = 'transform 0.3s ease';
  
  nameContainer.appendChild(categoryNameElement);
  nameContainer.appendChild(toggleIcon);
  header.appendChild(nameContainer);
  
  // Toggle switch (always visible)
  const toggleContainer = document.createElement('div');
  toggleContainer.style.display = 'flex';
  toggleContainer.style.alignItems = 'center';
  
  const toggleClone = toggleElement.cloneNode(true);
  toggleClone.style.cursor = 'pointer';
  
  // Disable toggle if always active
  if (isAlwaysActive) {
    toggleClone.disabled = true;
    toggleClone.checked = true;
  }
  
  toggleContainer.appendChild(toggleClone);
  header.appendChild(toggleContainer);
  
  // Category description (hidden by default)
  const descriptionContainer = document.createElement('div');
  descriptionContainer.className = 'cookie-category-description';
  descriptionContainer.style.padding = '0 12px 12px 12px';
  descriptionContainer.style.backgroundColor = '#ffffff';
  descriptionContainer.style.fontFamily = PERSIAN_TEXT_STYLING.fontFamily;
  descriptionContainer.style.fontSize = PERSIAN_TEXT_STYLING.fontSize;
  descriptionContainer.style.color = PERSIAN_TEXT_STYLING.color;
  descriptionContainer.style.lineHeight = PERSIAN_TEXT_STYLING.lineHeight;
  descriptionContainer.style.display = 'none'; // Hidden by default
  descriptionContainer.innerHTML = description; // Use the original description
  
  // Sub-choices container (hidden by default)
  const subChoicesContainer = document.createElement('div');
  subChoicesContainer.className = 'cookie-sub-choices';
  subChoicesContainer.style.padding = '0 12px 12px 24px'; // Indent sub-choices
  subChoicesContainer.style.backgroundColor = '#ffffff';
  subChoicesContainer.style.display = 'none'; // Hidden by default
  
  // Add sub-choices if any
  if (subChoices.length > 0) {
    subChoices.forEach(subChoice => {
      const subChoiceItem = document.createElement('div');
      subChoiceItem.style.marginBottom = '10px';
      subChoiceItem.style.padding = '8px';
      subChoiceItem.style.backgroundColor = '#f0f0f0';
      subChoiceItem.style.borderRadius = '4px';
      
      const subChoiceHeader = document.createElement('div');
      subChoiceHeader.style.display = 'flex';
      subChoiceHeader.style.justifyContent = 'space-between';
      subChoiceHeader.style.alignItems = 'center';
      subChoiceHeader.style.marginBottom = '5px';
      
      const subChoiceName = document.createElement('div');
      subChoiceName.style.fontWeight = 'bold';
      subChoiceName.style.color = PERSIAN_TEXT_STYLING.color;
      subChoiceName.style.fontFamily = PERSIAN_TEXT_STYLING.fontFamily;
      subChoiceName.style.fontSize = PERSIAN_TEXT_STYLING.fontSize;
      // Keep original subcategory name without translation
      subChoiceName.textContent = subChoice.name;
      
      // Add "Always Active" badge for sub-choice if needed
      if (subChoice.isAlwaysActive) {
        const subAlwaysActiveBadge = document.createElement('span');
        subAlwaysActiveBadge.textContent = 'همیشه فعال';
        subAlwaysActiveBadge.style.fontSize = '9px';
        subAlwaysActiveBadge.style.padding = '1px 4px';
        subAlwaysActiveBadge.style.backgroundColor = '#4CAF50';
        subAlwaysActiveBadge.style.color = 'white';
        subAlwaysActiveBadge.style.borderRadius = '8px';
        subAlwaysActiveBadge.style.marginLeft = '6px';
        subAlwaysActiveBadge.style.fontFamily = PERSIAN_TEXT_STYLING.fontFamily;
        subChoiceName.appendChild(subAlwaysActiveBadge);
      }
      
      const subChoiceToggle = subChoice.toggle.cloneNode(true);
      subChoiceToggle.style.cursor = 'pointer';
      
      // Disable if always active
      if (subChoice.isAlwaysActive) {
        subChoiceToggle.disabled = true;
        subChoiceToggle.checked = true;
      }
      
      subChoiceHeader.appendChild(subChoiceName);
      subChoiceHeader.appendChild(subChoiceToggle);
      
      // Add subcategory description
      const subChoiceDescription = document.createElement('div');
      subChoiceDescription.className = 'subcategory-description';
      subChoiceDescription.style.marginTop = '5px';
      subChoiceDescription.style.fontSize = '12px';
      subChoiceDescription.style.color = '#555';
      subChoiceDescription.style.fontFamily = PERSIAN_TEXT_STYLING.fontFamily;
      subChoiceDescription.innerHTML = subChoice.description;
      
      subChoiceItem.appendChild(subChoiceHeader);
      subChoiceItem.appendChild(subChoiceDescription);
      subChoicesContainer.appendChild(subChoiceItem);
    });
  }
  
  // Add click event to toggle description and sub-choices visibility
  header.addEventListener('click', (e) => {
    // Prevent toggle switch from triggering header click
    if (e.target !== toggleClone) {
      if (descriptionContainer.style.display === 'none') {
        descriptionContainer.style.display = 'block';
        subChoicesContainer.style.display = 'block';
        toggleIcon.textContent = '▲'; // Up arrow
        toggleIcon.style.transform = 'rotate(180deg)';
      } else {
        descriptionContainer.style.display = 'none';
        subChoicesContainer.style.display = 'none';
        toggleIcon.textContent = '▼'; // Down arrow
        toggleIcon.style.transform = 'rotate(0deg)';
      }
    }
  });
  
  // Prevent toggle switch from bubbling up to header
  toggleClone.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  
  categoryItem.appendChild(header);
  categoryItem.appendChild(descriptionContainer);
  categoryItem.appendChild(subChoicesContainer);
  
  return categoryItem;
}

// Extract customization page content
async function extractCustomizationContent(banner) {
  log("[Cookie Simplifier] Extracting customization page content...");
  
  try {
    // First, check if customization page is already visible
    let customizationPage = null;
    
    // Try to find OneTrust preference center
    const oneTrustPC = document.querySelector('#onetrust-pc-sdk');
    if (oneTrustPC && isElementVisibleToUser(oneTrustPC)) {
      customizationPage = oneTrustPC;
      log("[Cookie Simplifier] Found OneTrust preference center already visible");
    }
    
    // If not found, try other selectors
    if (!customizationPage) {
      for (const selector of CUSTOMIZATION_SELECTORS) {
        const element = document.querySelector(selector);
        if (element && isElementVisibleToUser(element)) {
          customizationPage = element;
          log(`[Cookie Simplifier] Found customization page with selector: ${selector}`);
          break;
        }
      }
    }
    
    // If still not found, trigger the customize button and wait for the page to appear
    if (!customizationPage) {
      log("[Cookie Simplifier] Customization page not found, attempting to trigger it");
      
      // Find the customize button
      const customizeBtn = banner.querySelector('#onetrust-pc-btn-handler') || 
                          banner.querySelector('button') || 
                          Array.from(banner.querySelectorAll('button')).find(btn => 
                            btn.textContent.toLowerCase().includes('customize') || 
                            btn.textContent.toLowerCase().includes('settings')
                          );
      
      if (customizeBtn) {
        log("[Cookie Simplifier] Clicking customize button to open preferences");
        
        // Store original banner position to restore it later
        const originalBannerPosition = banner.style.position;
        const originalBannerZIndex = banner.style.zIndex;
        
        // Temporarily hide the banner to avoid interference
        banner.style.position = 'absolute';
        banner.style.left = '-9999px';
        
        // Click the customize button with error handling
        try {
          customizeBtn.click();
        } catch (error) {
          log(`[Cookie Simplifier] Error clicking customize button: ${error.message}`);
          // Restore original banner position
          banner.style.position = originalBannerPosition;
          banner.style.left = '';
          return createFallbackCustomizationContent();
        }
        
        // Wait for the customization page to appear
        return new Promise((resolve) => {
          let pageFound = false;
          const checkInterval = setInterval(() => {
            let foundPage = null;
            
            // Check for OneTrust preference center
            const oneTrustPC = document.querySelector('#onetrust-pc-sdk');
            if (oneTrustPC && isElementVisibleToUser(oneTrustPC)) {
              foundPage = oneTrustPC;
            }
            
            // Check other selectors if OneTrust not found
            if (!foundPage) {
              for (const selector of CUSTOMIZATION_SELECTORS) {
                const element = document.querySelector(selector);
                if (element && isElementVisibleToUser(element)) {
                  foundPage = element;
                  break;
                }
              }
            }
            
            // Also check for any element that might contain cookie preferences
            if (!foundPage) {
              const allElements = document.querySelectorAll('*');
              for (const element of allElements) {
                const text = element.textContent.toLowerCase();
                if (
                  (text.includes('cookie') || text.includes('consent') || text.includes('preference')) &&
                  element.querySelectorAll('input[type="checkbox"], input[type="radio"]').length > 0 &&
                  isElementVisibleToUser(element)
                ) {
                  foundPage = element;
                  break;
                }
              }
            }
            
            if (foundPage) {
              clearInterval(checkInterval);
              pageFound = true;
              log("[Cookie Simplifier] Customization page appeared after clicking button");
              
              // Store reference to original customization page
              originalCustomizationPage = foundPage;
              
              // Restore original banner position
              banner.style.position = originalBannerPosition;
              banner.style.left = '';
              
              // Hide any overlays that might be causing the black screen
              hideOverlays();
              
              // Create a clean container for our extracted content
              const cleanContainer = document.createElement('div');
              cleanContainer.style.backgroundColor = '#ffffff';
              cleanContainer.style.color = '#000000';
              cleanContainer.style.padding = '15px';
              
              // Create a clean categories container
              const categoriesContainer = document.createElement('div');
              categoriesContainer.style.marginTop = '20px';
              
              // Find cookie categories - look for common patterns
              const categorySelectors = [
                '.ot-cat-item',          // OneTrust category item
                '.category-item',         // Generic category item
                '[class*="category"]',    // Any element with "category" in class
                '.cookie-category',       // Cookie category
                '.consent-category',      // Consent category
                '.option-group',          // Option group
                '.preference-group',      // Preference group
                '.ot-accordion-layout',   // OneTrust accordion layout
                '.ot-accordion-category', // OneTrust accordion category
                '.ot-category',           // OneTrust category
                '.category-header',       // Category header
                '.category-content',      // Category content
                '.preference-category',   // Preference category
                '.cookie-preference',     // Cookie preference
                '.consent-preference'     // Consent preference
              ];
              
              let foundCategories = false;
              
              // Try each selector to find categories
              for (const selector of categorySelectors) {
                const categoryElements = foundPage.querySelectorAll(selector);
                if (categoryElements.length > 0) {
                  foundCategories = true;
                  
                  categoryElements.forEach(category => {
                    // Extract category name
                    let categoryName = '';
                    const titleElement = category.querySelector('h3, h4, h5, .title, .category-title, [class*="title"]');
                    if (titleElement) {
                      categoryName = titleElement.textContent.trim();
                    } else {
                      // Try to get category name from the first text node
                      const textNodes = Array.from(category.childNodes).filter(node => 
                        node.nodeType === Node.TEXT_NODE && node.textContent.trim()
                      );
                      if (textNodes.length > 0) {
                        categoryName = textNodes[0].textContent.trim();
                      }
                    }
                    
                    // If no name found, use a default
                    if (!categoryName) {
                      categoryName = 'Cookie Category';
                    }
                    
                    // Extract description - try multiple selectors
                    let description = '';
                    const descSelectors = [
                      '.ot-cat-desc', 
                      '.category-description', 
                      '[class*="desc"]', 
                      'p',
                      '.description',
                      '.category-detail',
                      '.cookie-description',
                      '.consent-description'
                    ];
                    
                    for (const descSelector of descSelectors) {
                      const descElement = category.querySelector(descSelector);
                      if (descElement) {
                        description = descElement.innerHTML.trim();
                        break;
                      }
                    }
                    
                    // If no description found with selectors, try to get it from the text content
                    if (!description) {
                      const textElements = category.querySelectorAll('p, div:not([class])');
                      for (const element of textElements) {
                        const text = element.textContent.trim();
                        // Check if it's a substantial text (more than 10 characters) and not just a title
                        if (text.length > 10 && !element.querySelector('h1, h2, h3, h4, h5, h6')) {
                          description = text;
                          break;
                        }
                      }
                    }
                    
                    // If still no description, use a default one based on the category name
                    if (!description) {
                      const defaultDescriptions = {
                        'Strictly Necessary Cookies': 'These cookies are necessary for the website to function and cannot be switched off.',
                        'Necessary Cookies': 'These cookies are necessary for the website to function and cannot be switched off.',
                        'Analytics Cookies': 'These cookies allow us to count visits and traffic sources so we can measure and improve the performance of our site.',
                        'Performance Cookies': 'These cookies allow us to count visits and traffic sources so we can measure and improve the performance of our site.',
                        'Functional Cookies': 'These cookies enable the website to provide enhanced functionality and personalization.',
                        'Targeting Cookies': 'These cookies may be set through our site by our advertising partners.',
                        'Advertising Cookies': 'These cookies may be set through our site by our advertising partners.',
                        'Social Media Cookies': 'These cookies enable you to share content and interact on social media platforms.'
                      };
                      
                      // Try to match the category name to a default description
                      for (const [key, value] of Object.entries(defaultDescriptions)) {
                        if (categoryName.toLowerCase().includes(key.toLowerCase())) {
                          description = value;
                          break;
                        }
                      }
                      
                      // If still no description, use a generic one
                      if (!description) {
                        description = 'This category of cookies may collect information about your use of the website.';
                      }
                    }
                    
                    // Find the toggle/checkbox for this category
                    let toggle = category.querySelector('input[type="checkbox"]');
                    if (!toggle) {
                      // Look for toggle switches or other input types
                      toggle = category.querySelector('input[type="radio"], .toggle, .switch, [role="switch"], [role="checkbox"]');
                    }
                    
                    // Create a toggle switch if none found
                    if (!toggle) {
                      toggle = document.createElement('input');
                      toggle.type = 'checkbox';
                      toggle.checked = true; // Default to checked
                    }
                    
                    // Check if this category is always active using our improved function
                    const isAlwaysActive = isAlwaysActiveCategory(category, toggle, categoryName);
                    
                    // Check for subcategories
                    const subChoices = [];
                    const subCategoryElements = category.querySelectorAll('.ot-subgrp, .subcategory, [class*="sub-cat"], .ot-sub-item');
                    
                    if (subCategoryElements.length > 0) {
                      subCategoryElements.forEach(subCategory => {
                        const subName = subCategory.querySelector('h4, h5, h6, .subtitle, [class*="title"]')?.textContent.trim() || 'Subcategory';
                        
                        // Extract subcategory description
                        let subDesc = '';
                        const subDescSelectors = [
                          'p', '.description', '[class*="desc"]', '.subcategory-description'
                        ];
                        
                        for (const subDescSelector of subDescSelectors) {
                          const subDescElement = subCategory.querySelector(subDescSelector);
                          if (subDescElement) {
                            subDesc = subDescElement.innerHTML.trim();
                            break;
                          }
                        }
                        
                        // If no description found, try to get it from text content
                        if (!subDesc) {
                          const textElements = subCategory.querySelectorAll('p, div:not([class])');
                          for (const element of textElements) {
                            const text = element.textContent.trim();
                            if (text.length > 10) {
                              subDesc = text;
                              break;
                            }
                          }
                        }
                        
                        let subToggle = subCategory.querySelector('input[type="checkbox"], input[type="radio"]');
                        if (!subToggle) {
                          subToggle = document.createElement('input');
                          subToggle.type = 'checkbox';
                          subToggle.checked = toggle.checked; // Inherit from parent
                        }
                        
                        // Check if this subcategory is always active
                        const isSubAlwaysActive = isAlwaysActiveCategory(subCategory, subToggle, subName);
                        
                        subChoices.push({
                          name: subName,
                          description: subDesc,
                          toggle: subToggle,
                          isAlwaysActive: isSubAlwaysActive
                        });
                      });
                    }
                    
                    // Create accordion category item
                    const accordionCategory = createAccordionCategory(
                      categoryName, 
                      description, 
                      toggle, 
                      isAlwaysActive,
                      subChoices
                    );
                    categoriesContainer.appendChild(accordionCategory);
                  });
                  
                  break; // Stop after finding categories with the first successful selector
                }
              }
              
              // If no categories found with selectors, try to find checkboxes/radios directly
              if (!foundCategories) {
                const allToggles = foundPage.querySelectorAll('input[type="checkbox"], input[type="radio"]');
                if (allToggles.length > 0) {
                  foundCategories = true;
                  
                  // Group toggles by their parent containers
                  const toggleGroups = new Map();
                  
                  allToggles.forEach(toggle => {
                    // Find the closest parent that might be a category container
                    let parent = toggle.parentElement;
                    while (parent && parent !== foundPage) {
                      // Check if this parent contains a title or heading
                      if (parent.querySelector('h1, h2, h3, h4, h5, h6, .title, [class*="title"]')) {
                        break;
                      }
                      parent = parent.parentElement;
                    }
                    
                    if (parent && parent !== foundPage) {
                      if (!toggleGroups.has(parent)) {
                        toggleGroups.set(parent, []);
                      }
                      toggleGroups.get(parent).push(toggle);
                    } else {
                      // If no proper parent found, add to a default group
                      if (!toggleGroups.has('default')) {
                        toggleGroups.set('default', []);
                      }
                      toggleGroups.get('default').push(toggle);
                    }
                  });
                  
                  // Create category items for each group
                  toggleGroups.forEach((toggles, parent) => {
                    if (parent === 'default') {
                      // Create a single category for all ungrouped toggles
                      let categoryName = 'Cookie Preferences';
                      let description = 'Manage your cookie preferences.';
                      
                      // Create a representative toggle (first one)
                      const representativeToggle = toggles[0];
                      
                      // Check if this category is always active
                      const isAlwaysActive = isAlwaysActiveCategory(parent, representativeToggle, categoryName);
                      
                      // Create accordion category item
                      const accordionCategory = createAccordionCategory(categoryName, description, representativeToggle, isAlwaysActive);
                      categoriesContainer.appendChild(accordionCategory);
                    } else {
                      // Extract category name from the parent
                      let categoryName = '';
                      const titleElement = parent.querySelector('h1, h2, h3, h4, h5, h6, .title, [class*="title"]');
                      if (titleElement) {
                        categoryName = titleElement.textContent.trim();
                      } else {
                        categoryName = 'Cookie Category';
                      }
                      
                      // Extract description
                      let description = '';
                      const descElement = parent.querySelector('.ot-cat-desc, .category-description, [class*="desc"], p');
                      if (descElement) {
                        description = descElement.innerHTML.trim();
                      }
                      
                      // Create a representative toggle (first one)
                      const representativeToggle = toggles[0];
                      
                      // Check if this category is always active
                      const isAlwaysActive = isAlwaysActiveCategory(parent, representativeToggle, categoryName);
                      
                      // Create accordion category item
                      const accordionCategory = createAccordionCategory(categoryName, description, representativeToggle, isAlwaysActive);
                      categoriesContainer.appendChild(accordionCategory);
                    }
                  });
                }
              }
              
              // If still no categories found, create a simple default interface
              // if (!foundCategories) {
              //   const necessaryCategory = createAccordionCategory(
              //     'Necessary Cookies', 
              //     'These cookies are essential for the website to function and cannot be switched off in our systems.',
              //     createDisabledCheckbox(true),
              //     true
              //   );
                
              //   const analyticsCategory = createAccordionCategory(
              //     'Analytics Cookies', 
              //     'These cookies allow us to count visits and traffic sources so we can measure and improve the performance of our site.',
              //     createCheckbox(false),
              //     false
              //   );
                
              //   const marketingCategory = createAccordionCategory(
              //     'Marketing Cookies', 
              //     'These cookies may be set through our site by our advertising partners to build a profile of your interests.',
              //     createCheckbox(false),
              //     false
              //   );
                
              //   categoriesContainer.appendChild(necessaryCategory);
              //   categoriesContainer.appendChild(analyticsCategory);
              //   categoriesContainer.appendChild(marketingCategory);
              // }
              
              cleanContainer.appendChild(categoriesContainer);
              
              // Hide the original customization page
              foundPage.style.display = 'none';
              
              resolve(cleanContainer);
            }
          }, 100);
          
          // Timeout after 5 seconds
          setTimeout(() => {
            clearInterval(checkInterval);
            if (!pageFound) {
              log("[Cookie Simplifier] Timeout waiting for customization page");
              
              // Restore original banner position
              banner.style.position = originalBannerPosition;
              banner.style.left = '';
              
              // Hide any overlays that might be causing the black screen
              hideOverlays();
              
              // Return fallback content
              resolve(createFallbackCustomizationContent());
            }
          }, 5000);
        });
      }
    }
    
    if (customizationPage) {
      // Store reference to original customization page
      originalCustomizationPage = customizationPage;
      
      // Hide any overlays that might be causing the black screen
      hideOverlays();
      
      // Create a clean container for our extracted content
      const cleanContainer = document.createElement('div');
      cleanContainer.style.backgroundColor = '#ffffff';
      cleanContainer.style.color = '#000000';
      cleanContainer.style.padding = '15px';
      
      // Create a clean categories container
      const categoriesContainer = document.createElement('div');
      categoriesContainer.style.marginTop = '20px';
      
      // Find cookie categories - look for common patterns
      const categorySelectors = [
        '.ot-cat-item',          // OneTrust category item
        '.category-item',         // Generic category item
        '[class*="category"]',    // Any element with "category" in class
        '.cookie-category',       // Cookie category
        '.consent-category',      // Consent category
        '.option-group',          // Option group
        '.preference-group',      // Preference group
        '.ot-accordion-layout',   // OneTrust accordion layout
        '.ot-accordion-category', // OneTrust accordion category
        '.ot-category',           // OneTrust category
        '.category-header',       // Category header
        '.category-content',      // Category content
        '.preference-category',   // Preference category
        '.cookie-preference',     // Cookie preference
        '.consent-preference'     // Consent preference
      ];
      
      let foundCategories = false;
      
      // Try each selector to find categories
      for (const selector of categorySelectors) {
        const categoryElements = customizationPage.querySelectorAll(selector);
        if (categoryElements.length > 0) {
          foundCategories = true;
          
          categoryElements.forEach(category => {
            // Extract category name
            let categoryName = '';
            const titleElement = category.querySelector('h3, h4, h5, .title, .category-title, [class*="title"]');
            if (titleElement) {
              categoryName = titleElement.textContent.trim();
            } else {
              // Try to get category name from the first text node
              const textNodes = Array.from(category.childNodes).filter(node => 
                node.nodeType === Node.TEXT_NODE && node.textContent.trim()
              );
              if (textNodes.length > 0) {
                categoryName = textNodes[0].textContent.trim();
              }
            }
            
            // If no name found, use a default
            if (!categoryName) {
              categoryName = 'Cookie Category';
            }
            
            // Extract description - try multiple selectors
            let description = '';
            const descSelectors = [
              '.ot-cat-desc', 
              '.category-description', 
              '[class*="desc"]', 
              'p',
              '.description',
              '.category-detail',
              '.cookie-description',
              '.consent-description'
            ];
            
            for (const descSelector of descSelectors) {
              const descElement = category.querySelector(descSelector);
              if (descElement) {
                description = descElement.innerHTML.trim();
                break;
              }
            }
            
            // If no description found with selectors, try to get it from the text content
            if (!description) {
              const textElements = category.querySelectorAll('p, div:not([class])');
              for (const element of textElements) {
                const text = element.textContent.trim();
                // Check if it's a substantial text (more than 10 characters) and not just a title
                if (text.length > 10 && !element.querySelector('h1, h2, h3, h4, h5, h6')) {
                  description = text;
                  break;
                }
              }
            }
            
            // If still no description, use a default one based on the category name
            if (!description) {
              const defaultDescriptions = {
                'Strictly Necessary Cookies': 'These cookies are necessary for the website to function and cannot be switched off.',
                'Necessary Cookies': 'These cookies are necessary for the website to function and cannot be switched off.',
                'Analytics Cookies': 'These cookies allow us to count visits and traffic sources so we can measure and improve the performance of our site.',
                'Performance Cookies': 'These cookies allow us to count visits and traffic sources so we can measure and improve the performance of our site.',
                'Functional Cookies': 'These cookies enable the website to provide enhanced functionality and personalization.',
                'Targeting Cookies': 'These cookies may be set through our site by our advertising partners.',
                'Advertising Cookies': 'These cookies may be set through our site by our advertising partners.',
                'Social Media Cookies': 'These cookies enable you to share content and interact on social media platforms.'
              };
              
              // Try to match the category name to a default description
              for (const [key, value] of Object.entries(defaultDescriptions)) {
                if (categoryName.toLowerCase().includes(key.toLowerCase())) {
                  description = value;
                  break;
                }
              }
              
              // If still no description, use a generic one
              if (!description) {
                description = 'This category of cookies may collect information about your use of the website.';
              }
            }
            
            // Find the toggle/checkbox for this category
            let toggle = category.querySelector('input[type="checkbox"]');
            if (!toggle) {
              // Look for toggle switches or other input types
              toggle = category.querySelector('input[type="radio"], .toggle, .switch, [role="switch"], [role="checkbox"]');
            }
            
            // Create a toggle switch if none found
            if (!toggle) {
              toggle = document.createElement('input');
              toggle.type = 'checkbox';
              toggle.checked = true; // Default to checked
            }
            
            // Check if this category is always active using our improved function
            const isAlwaysActive = isAlwaysActiveCategory(category, toggle, categoryName);
            
            // Check for subcategories
            const subChoices = [];
            const subCategoryElements = category.querySelectorAll('.ot-subgrp, .subcategory, [class*="sub-cat"], .ot-sub-item');
            
            if (subCategoryElements.length > 0) {
              subCategoryElements.forEach(subCategory => {
                const subName = subCategory.querySelector('h4, h5, h6, .subtitle, [class*="title"]')?.textContent.trim() || 'Subcategory';
                
                // Extract subcategory description
                let subDesc = '';
                const subDescSelectors = [
                  'p', '.description', '[class*="desc"]', '.subcategory-description'
                ];
                
                for (const subDescSelector of subDescSelectors) {
                  const subDescElement = subCategory.querySelector(subDescSelector);
                  if (subDescElement) {
                    subDesc = subDescElement.innerHTML.trim();
                    break;
                  }
                }
                
                // If no description found, try to get it from text content
                if (!subDesc) {
                  const textElements = subCategory.querySelectorAll('p, div:not([class])');
                  for (const element of textElements) {
                    const text = element.textContent.trim();
                    if (text.length > 10) {
                      subDesc = text;
                      break;
                    }
                  }
                }
                
                let subToggle = subCategory.querySelector('input[type="checkbox"], input[type="radio"]');
                if (!subToggle) {
                  subToggle = document.createElement('input');
                  subToggle.type = 'checkbox';
                  subToggle.checked = toggle.checked; // Inherit from parent
                }
                
                // Check if this subcategory is always active
                const isSubAlwaysActive = isAlwaysActiveCategory(subCategory, subToggle, subName);
                
                subChoices.push({
                  name: subName,
                  description: subDesc,
                  toggle: subToggle,
                  isAlwaysActive: isSubAlwaysActive
                });
              });
            }
            
            // Create accordion category item
            const accordionCategory = createAccordionCategory(
              categoryName, 
              description, 
              toggle, 
              isAlwaysActive,
              subChoices
            );
            categoriesContainer.appendChild(accordionCategory);
          });
          
          break; // Stop after finding categories with the first successful selector
        }
      }
      
      // If no categories found with selectors, try to find checkboxes/radios directly
      if (!foundCategories) {
        const allToggles = customizationPage.querySelectorAll('input[type="checkbox"], input[type="radio"]');
        if (allToggles.length > 0) {
          foundCategories = true;
          
          // Group toggles by their parent containers
          const toggleGroups = new Map();
          
          allToggles.forEach(toggle => {
            // Find the closest parent that might be a category container
            let parent = toggle.parentElement;
            while (parent && parent !== customizationPage) {
              // Check if this parent contains a title or heading
              if (parent.querySelector('h1, h2, h3, h4, h5, h6, .title, [class*="title"]')) {
                break;
              }
              parent = parent.parentElement;
            }
            
            if (parent && parent !== customizationPage) {
              if (!toggleGroups.has(parent)) {
                toggleGroups.set(parent, []);
              }
              toggleGroups.get(parent).push(toggle);
            } else {
              // If no proper parent found, add to a default group
              if (!toggleGroups.has('default')) {
                toggleGroups.set('default', []);
              }
              toggleGroups.get('default').push(toggle);
            }
          });
          
          // Create category items for each group
          toggleGroups.forEach((toggles, parent) => {
            if (parent === 'default') {
              // Create a single category for all ungrouped toggles
              let categoryName = 'Cookie Preferences';
              let description = 'Manage your cookie preferences.';
              
              // Create a representative toggle (first one)
              const representativeToggle = toggles[0];
              
              // Check if this category is always active
              const isAlwaysActive = isAlwaysActiveCategory(parent, representativeToggle, categoryName);
              
              // Create accordion category item
              const accordionCategory = createAccordionCategory(categoryName, description, representativeToggle, isAlwaysActive);
              categoriesContainer.appendChild(accordionCategory);
            } else {
              // Extract category name from the parent
              let categoryName = '';
              const titleElement = parent.querySelector('h1, h2, h3, h4, h5, h6, .title, [class*="title"]');
              if (titleElement) {
                categoryName = titleElement.textContent.trim();
              } else {
                categoryName = 'Cookie Category';
              }
              
              // Extract description
              let description = '';
              const descElement = parent.querySelector('.ot-cat-desc, .category-description, [class*="desc"], p');
              if (descElement) {
                description = descElement.innerHTML.trim();
              }
              
              // Create a representative toggle (first one)
              const representativeToggle = toggles[0];
              
              // Check if this category is always active
              const isAlwaysActive = isAlwaysActiveCategory(parent, representativeToggle, categoryName);
              
              // Create accordion category item
              const accordionCategory = createAccordionCategory(categoryName, description, representativeToggle, isAlwaysActive);
              categoriesContainer.appendChild(accordionCategory);
            }
          });
        }
      }
      
      // If still no categories found, create a simple default interface
      if (!foundCategories) {
        const necessaryCategory = createAccordionCategory(
          'Necessary Cookies', 
          'These cookies are essential for the website to function and cannot be switched off in our systems.',
          createDisabledCheckbox(true),
          true
        );
        
        const analyticsCategory = createAccordionCategory(
          'Analytics Cookies', 
          'These cookies allow us to count visits and traffic sources so we can measure and improve the performance of our site.',
          createCheckbox(false),
          false
        );
        
        const marketingCategory = createAccordionCategory(
          'Marketing Cookies', 
          'These cookies may be set through our site by our advertising partners to build a profile of your interests.',
          createCheckbox(false),
          false
        );
        
        categoriesContainer.appendChild(necessaryCategory);
        categoriesContainer.appendChild(analyticsCategory);
        categoriesContainer.appendChild(marketingCategory);
      }
      
      cleanContainer.appendChild(categoriesContainer);
      
      // Hide the original customization page
      customizationPage.style.display = 'none';
      
      return cleanContainer;
    }
    
    log("[Cookie Simplifier] No customization page found");
    return createFallbackCustomizationContent();
  } catch (error) {
    log(`[Cookie Simplifier] Error extracting customization content: ${error.message}`);
    return createFallbackCustomizationContent();
  }
}

// Helper function to create a checkbox
function createCheckbox(checked) {
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = checked;
  return checkbox;
}

// Helper function to create a disabled checkbox
function createDisabledCheckbox(checked) {
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = checked;
  checkbox.disabled = true;
  return checkbox;
}

// Create simplified banner with prefetched customization content
function createSimplifiedBanner(banner, buttons, bannerContent, customizationContent) {
  log("[Cookie Simplifier] Creating simplified banner...");
  
  try {
    // Remove existing simplified banner
    const existingBanner = document.getElementById('simplified-cookie-banner');
    if (existingBanner) {
      log("[Cookie Simplifier] Simplified banner already exists, removing old one");
      existingBanner.remove();
    }
    
    // Get the original banner's dimensions
    const bannerRect = banner.getBoundingClientRect();
    
    const newBanner = document.createElement('div');
    newBanner.id = 'simplified-cookie-banner';
    newBanner.setAttribute('role', 'dialog');
    newBanner.setAttribute('aria-label', PERSIAN_TEXTS.bannerTitle);
    newBanner.setAttribute('dir', 'rtl'); // Set RTL direction for the entire banner
    
    // Position the banner in the center of the page
    newBanner.style.position = 'fixed';
    newBanner.style.top = '50%';
    newBanner.style.left = '50%';
    newBanner.style.transform = 'translate(-50%, -50%)';
    
    // Use the original banner's dimensions or default size
    newBanner.style.width = bannerRect.width > 300 ? `${bannerRect.width}px` : '600px';
    newBanner.style.maxWidth = '90vw'; // Use viewport width for better responsiveness
    newBanner.style.maxHeight = '85vh'; // Limit height to 85% of viewport height
    newBanner.style.overflow = 'hidden'; // Hide overflow for the main container
    
    newBanner.style.backgroundColor = 'white';
    newBanner.style.border = '1px solid #ccc';
    newBanner.style.padding = '0'; // Remove padding from main container
    newBanner.style.zIndex = '9999999';
    newBanner.style.boxShadow = '0 5px 15px rgba(0,0,0,0.3)';
    newBanner.style.borderRadius = '8px';
    newBanner.style.fontFamily = PERSIAN_TEXT_STYLING.fontFamily;
    newBanner.style.display = 'flex';
    newBanner.style.flexDirection = 'column';
    
    // Add CSS for black text class and RTL support with Persian styling
    const style = document.createElement('style');
    style.textContent = `
      .black-text p,
      .black-text h1,
      .black-text h2,
      .black-text h3,
      .black-text h4,
      .black-text h5,
      .black-text h6,
      .black-text span,
      .black-text div,
      .black-text li,
      .black-text td,
      .black-text th {
        color: #000000 !important;
      }
      .rtl-text {
        direction: rtl;
        text-align: right;
        font-family: ${PERSIAN_TEXT_STYLING.fontFamily};
        font-size: ${PERSIAN_TEXT_STYLING.fontSize};
        color: ${PERSIAN_TEXT_STYLING.color};
        line-height: ${PERSIAN_TEXT_STYLING.lineHeight};
      }
      .rtl-toggle {
        margin-left: 10px;
        margin-right: 0;
      }
      .cookie-category-name {
        font-family: ${PERSIAN_TEXT_STYLING.fontFamily};
        font-size: ${PERSIAN_TEXT_STYLING.fontSize};
        color: ${PERSIAN_TEXT_STYLING.color};
      }
      .cookie-category-description {
        margin-bottom: 10px;
        padding: 8px 12px;
        background-color: #f5f5f5;
        border-radius: 4px;
        font-family: ${PERSIAN_TEXT_STYLING.fontFamily};
        font-size: ${PERSIAN_TEXT_STYLING.fontSize};
        color: ${PERSIAN_TEXT_STYLING.color};
        line-height: ${PERSIAN_TEXT_STYLING.lineHeight};
        display: none;
      }
      .subcategory-description {
        margin-top: 5px;
        padding: 5px 10px;
        background-color: #f0f0f0;
        border-radius: 4px;
        font-size: 12px;
        color: #555;
        font-family: ${PERSIAN_TEXT_STYLING.fontFamily};
      }
    `;
    newBanner.appendChild(style);
    
    // Header section with title and close button
    const header = document.createElement('div');
    header.style.padding = '20px 20px 10px 20px';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    
    // Title - Use Persian text
    const title = document.createElement('h3');
    title.textContent = PERSIAN_TEXTS.bannerTitle;
    title.setAttribute('dir', 'rtl');
    title.style.margin = '0';
    title.style.fontSize = '18px';
    title.style.fontFamily = PERSIAN_TEXT_STYLING.fontFamily;
    title.style.color = PERSIAN_TEXT_STYLING.color;
    header.appendChild(title);
    
    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', 'Close cookie preferences');
    closeBtn.setAttribute('tabindex', '0');
    closeBtn.style.background = 'none';
    closeBtn.style.border = 'none';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.fontSize = '18px';
    closeBtn.style.color = '#777';
    closeBtn.style.padding = '0';
    closeBtn.style.width = '24px';
    closeBtn.style.height = '24px';
    closeBtn.style.display = 'flex';
    closeBtn.style.alignItems = 'center';
    closeBtn.style.justifyContent = 'center';
    closeBtn.addEventListener('click', () => {
      log("[Cookie Simplifier] Closed simplified banner");
      
      // Restore the original banner and remove our simplified banner
      restoreOriginalBanner();
      newBanner.remove();
    });
    closeBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        log("[Cookie Simplifier] Keyboard closed simplified banner");
        
        // Restore the original banner and remove our simplified banner
        restoreOriginalBanner();
        newBanner.remove();
      }
    });
    header.appendChild(closeBtn);
    
    newBanner.appendChild(header);
    
    // Content container with scrollable HTML content
    const contentContainer = document.createElement('div');
    contentContainer.style.padding = '0 20px 20px 20px';
    contentContainer.style.overflowY = 'auto'; // Make content scrollable
    contentContainer.style.flexGrow = '1'; // Allow this section to grow and take available space
    contentContainer.style.backgroundColor = '#ffffff'; // Ensure white background
    
    // Use Persian description with proper styling
    const persianDescription = document.createElement('div');
    persianDescription.className = 'extracted-banner-content black-text rtl-text';
    persianDescription.style.color = PERSIAN_TEXT_STYLING.color;
    persianDescription.style.backgroundColor = '#ffffff';
    persianDescription.style.fontFamily = PERSIAN_TEXT_STYLING.fontFamily;
    persianDescription.style.fontSize = PERSIAN_TEXT_STYLING.fontSize;
    persianDescription.setAttribute('dir', 'rtl');
    persianDescription.innerHTML = `<p style="color: ${PERSIAN_TEXT_STYLING.color}; font-family: ${PERSIAN_TEXT_STYLING.fontFamily}; font-size: ${PERSIAN_TEXT_STYLING.fontSize};">${PERSIAN_TEXTS.bannerDescription}</p>`;
    contentContainer.appendChild(persianDescription);
    
    // Add a separator between content and customization
    const separator = document.createElement('hr');
    separator.style.margin = '20px 0';
    separator.style.border = 'none';
    separator.style.borderTop = '1px solid #eee';
    contentContainer.appendChild(separator);
    
    // Add the prefetched customization content
    if (customizationContent) {
      // Remove any headings from the customization content
      const headings = customizationContent.querySelectorAll('h1, h2, h3, h4, h5, h6');
      headings.forEach(heading => {
        // Only remove headings that are not part of a category
        if (!heading.closest('.cookie-category-item')) {
          heading.remove();
        }
      });
      
      // Remove "About Your Privacy" text if present
      const aboutPrivacyElements = customizationContent.querySelectorAll('*');
      aboutPrivacyElements.forEach(element => {
        if (element.textContent.includes('About Your Privacy')) {
          element.remove();
        }
      });
      
      contentContainer.appendChild(customizationContent);
    } else {
      // Fallback customization content if none was prefetched
      const fallbackCustomization = createFallbackCustomizationContent();
      contentContainer.appendChild(fallbackCustomization);
    }
    
    newBanner.appendChild(contentContainer);
    
    // Button container (always at the bottom)
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.flexDirection = 'column';
    buttonContainer.style.gap = '10px';
    buttonContainer.style.padding = '0 20px 20px 20px';
    buttonContainer.style.backgroundColor = '#ffffff'; // Ensure white background
    
    // Add Accept button - Use Persian text
    const acceptBtn = document.createElement('button');
    acceptBtn.textContent = PERSIAN_TEXTS.acceptAllButton;
    acceptBtn.setAttribute('tabindex', '0');
    acceptBtn.style.padding = '12px 16px';
    acceptBtn.style.cursor = 'pointer';
    acceptBtn.style.border = 'none';
    acceptBtn.style.borderRadius = '4px';
    acceptBtn.style.fontSize = PERSIAN_TEXT_STYLING.fontSize;
    acceptBtn.style.fontWeight = 'bold';
    acceptBtn.style.fontFamily = PERSIAN_TEXT_STYLING.fontFamily;
    acceptBtn.style.width = '100%'; // Make buttons full width
    acceptBtn.style.backgroundColor = '#4CAF50';
    acceptBtn.style.color = 'white';
    
    // Add click handler for Accept button
    acceptBtn.addEventListener('click', () => {
      log("[Cookie Simplifier] Accept All button clicked");
      
      // Find and click the original accept button
      const originalAcceptBtn = buttons.find(btn => btn.type === 'accept');
      if (originalAcceptBtn) {
        try {
          const cookieBefore = document.cookie;
          
          // Ensure the original button is still in the DOM
          if (!document.body.contains(originalAcceptBtn.element)) {
            log("[Cookie Simplifier] Original accept button not in DOM, reattaching temporarily");
            const tempContainer = document.createElement('div');
            tempContainer.style.display = 'none';
            tempContainer.appendChild(originalAcceptBtn.element);
            document.body.appendChild(tempContainer);
            originalAcceptBtn.element.click();
            tempContainer.remove();
          } else {
            originalAcceptBtn.element.click();
          }
          
          // Check if cookies were set
          setTimeout(() => {
            const cookieAfter = document.cookie;
            log(`[Cookie Simplifier] Cookie change check - Before: "${cookieBefore}", After: "${cookieAfter}"`);
            
            // If no cookies were set, try alternative approach
            if (cookieBefore === cookieAfter) {
              log("[Cookie Simplifier] No cookies were set, trying alternative approach");
              
              // Try to find and click the accept button in the original customization page
              if (originalCustomizationPage) {
                const acceptAllBtn = originalCustomizationPage.querySelector('.accept-all, .accept-btn, #accept-all, [aria-label*="accept all"]');
                if (acceptAllBtn) {
                  acceptAllBtn.click();
                  log("[Cookie Simplifier] Clicked accept all button in original customization page");
                }
              }
            }
            
            // After accepting, hide any overlays that might have appeared
            hideOverlays();
          }, 500);
        } catch (error) {
          log(`[Cookie Simplifier] Error triggering accept button click: ${error.message}`);
        }
      }
      
      newBanner.remove();
    });
    
    // Add keyboard support for Accept button
    acceptBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        log("[Cookie Simplifier] Accept All button triggered via keyboard");
        
        // Find and click the original accept button
        const originalAcceptBtn = buttons.find(btn => btn.type === 'accept');
        if (originalAcceptBtn) {
          try {
            const cookieBefore = document.cookie;
            
            // Ensure the original button is still in the DOM
            if (!document.body.contains(originalAcceptBtn.element)) {
              log("[Cookie Simplifier] Original accept button not in DOM, reattaching temporarily");
              const tempContainer = document.createElement('div');
              tempContainer.style.display = 'none';
              tempContainer.appendChild(originalAcceptBtn.element);
              document.body.appendChild(tempContainer);
              originalAcceptBtn.element.click();
              tempContainer.remove();
            } else {
              originalAcceptBtn.element.click();
            }
            
            // Check if cookies were set
            setTimeout(() => {
              const cookieAfter = document.cookie;
              log(`[Cookie Simplifier] Cookie change check - Before: "${cookieBefore}", After: "${cookieAfter}"`);
              
              // If no cookies were set, try alternative approach
              if (cookieBefore === cookieAfter) {
                log("[Cookie Simplifier] No cookies were set, trying alternative approach");
                
                // Try to find and click the accept button in the original customization page
                if (originalCustomizationPage) {
                  const acceptAllBtn = originalCustomizationPage.querySelector('.accept-all, .accept-btn, #accept-all, [aria-label*="accept all"]');
                  if (acceptAllBtn) {
                    acceptAllBtn.click();
                    log("[Cookie Simplifier] Clicked accept all button in original customization page");
                  }
                }
              }
              
              // After accepting, hide any overlays that might have appeared
              hideOverlays();
            }, 500);
          } catch (error) {
            log(`[Cookie Simplifier] Error triggering accept button click: ${error.message}`);
          }
        }
        
        newBanner.remove();
      }
    });
    
    buttonContainer.appendChild(acceptBtn);
    
    // Add Reject button - Use Persian text
    const rejectBtn = document.createElement('button');
    rejectBtn.textContent = PERSIAN_TEXTS.rejectAllButton;
    rejectBtn.setAttribute('tabindex', '0');
    rejectBtn.style.padding = '12px 16px';
    rejectBtn.style.cursor = 'pointer';
    rejectBtn.style.border = 'none';
    rejectBtn.style.borderRadius = '4px';
    rejectBtn.style.fontSize = PERSIAN_TEXT_STYLING.fontSize;
    rejectBtn.style.fontWeight = 'bold';
    rejectBtn.style.fontFamily = PERSIAN_TEXT_STYLING.fontFamily;
    rejectBtn.style.width = '100%'; // Make buttons full width
    rejectBtn.style.backgroundColor = '#f44336';
    rejectBtn.style.color = 'white';
    
    // Add click handler for Reject button
    rejectBtn.addEventListener('click', () => {
      log("[Cookie Simplifier] Reject All button clicked");
      
      // Find and click the original reject button
      const originalRejectBtn = buttons.find(btn => btn.type === 'reject');
      if (originalRejectBtn) {
        try {
          const cookieBefore = document.cookie;
          
          // Ensure the original button is still in the DOM
          if (!document.body.contains(originalRejectBtn.element)) {
            log("[Cookie Simplifier] Original reject button not in DOM, reattaching temporarily");
            const tempContainer = document.createElement('div');
            tempContainer.style.display = 'none';
            tempContainer.appendChild(originalRejectBtn.element);
            document.body.appendChild(tempContainer);
            originalRejectBtn.element.click();
            tempContainer.remove();
          } else {
            originalRejectBtn.element.click();
          }
          
          // Check if cookies were set
          setTimeout(() => {
            const cookieAfter = document.cookie;
            log(`[Cookie Simplifier] Cookie change check - Before: "${cookieBefore}", After: "${cookieAfter}"`);
            
            // If no cookies were set, try alternative approach
            if (cookieBefore === cookieAfter) {
              log("[Cookie Simplifier] No cookies were set, trying alternative approach");
              
              // Try to find and click the reject button in the original customization page
              if (originalCustomizationPage) {
                const rejectAllBtn = originalCustomizationPage.querySelector('.reject-all, .reject-btn, #reject-all, [aria-label*="reject all"]');
                if (rejectAllBtn) {
                  rejectAllBtn.click();
                  log("[Cookie Simplifier] Clicked reject all button in original customization page");
                }
              }
            }
            
            // After rejecting, hide any overlays that might have appeared
            hideOverlays();
          }, 500);
        } catch (error) {
          log(`[Cookie Simplifier] Error triggering reject button click: ${error.message}`);
        }
      }
      
      newBanner.remove();
    });
    
    // Add keyboard support for Reject button
    rejectBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        log("[Cookie Simplifier] Reject All button triggered via keyboard");
        
        // Find and click the original reject button
        const originalRejectBtn = buttons.find(btn => btn.type === 'reject');
        if (originalRejectBtn) {
          try {
            const cookieBefore = document.cookie;
            
            // Ensure the original button is still in the DOM
            if (!document.body.contains(originalRejectBtn.element)) {
              log("[Cookie Simplifier] Original reject button not in DOM, reattaching temporarily");
              const tempContainer = document.createElement('div');
              tempContainer.style.display = 'none';
              tempContainer.appendChild(originalRejectBtn.element);
              document.body.appendChild(tempContainer);
              originalRejectBtn.element.click();
              tempContainer.remove();
            } else {
              originalRejectBtn.element.click();
            }
            
            // Check if cookies were set
            setTimeout(() => {
              const cookieAfter = document.cookie;
              log(`[Cookie Simplifier] Cookie change check - Before: "${cookieBefore}", After: "${cookieAfter}"`);
              
              // If no cookies were set, try alternative approach
              if (cookieBefore === cookieAfter) {
                log("[Cookie Simplifier] No cookies were set, trying alternative approach");
                
                // Try to find and click the reject button in the original customization page
                if (originalCustomizationPage) {
                  const rejectAllBtn = originalCustomizationPage.querySelector('.reject-all, .reject-btn, #reject-all, [aria-label*="reject all"]');
                  if (rejectAllBtn) {
                    rejectAllBtn.click();
                    log("[Cookie Simplifier] Clicked reject all button in original customization page");
                  }
                }
              }
              
              // After rejecting, hide any overlays that might have appeared
              hideOverlays();
            }, 500);
          } catch (error) {
            log(`[Cookie Simplifier] Error triggering reject button click: ${error.message}`);
          }
        }
        
        newBanner.remove();
      }
    });
    
    buttonContainer.appendChild(rejectBtn);
    
    // Add Accept Selection button - Use Persian text
    const acceptSelectionBtn = document.createElement('button');
    acceptSelectionBtn.textContent = PERSIAN_TEXTS.acceptSelectionButton;
    acceptSelectionBtn.setAttribute('tabindex', '0');
    acceptSelectionBtn.style.padding = '12px 16px';
    acceptSelectionBtn.style.cursor = 'pointer';
    acceptSelectionBtn.style.border = 'none';
    acceptSelectionBtn.style.borderRadius = '4px';
    acceptSelectionBtn.style.fontSize = PERSIAN_TEXT_STYLING.fontSize;
    acceptSelectionBtn.style.fontWeight = 'bold';
    acceptSelectionBtn.style.fontFamily = PERSIAN_TEXT_STYLING.fontFamily;
    acceptSelectionBtn.style.width = '100%'; // Make buttons full width
    acceptSelectionBtn.style.backgroundColor = '#2196F3';
    acceptSelectionBtn.style.color = 'white';
    
    // Add click handler for Accept Selection button
    acceptSelectionBtn.addEventListener('click', () => {
      log("[Cookie Simplifier] Accept Selection button clicked");
      
      // First, synchronize the toggle states from our simplified banner to the original customization page
      if (originalCustomizationPage) {
        try {
          // Find all category toggles in our simplified banner
          const categoryToggles = newBanner.querySelectorAll('.cookie-category-header input[type="checkbox"]');
          
          categoryToggles.forEach(toggle => {
            const categoryName = toggle.closest('.cookie-category-item').querySelector('.cookie-category-name').textContent;
            
            // Find the corresponding category in the original customization page
            const originalCategories = originalCustomizationPage.querySelectorAll('.ot-cat-item, .category-item, [class*="category"]');
            
            originalCategories.forEach(originalCategory => {
              const originalTitle = originalCategory.querySelector('h3, h4, h5, .title, .category-title, [class*="title"]');
              if (originalTitle && originalTitle.textContent.trim() === categoryName) {
                const originalToggle = originalCategory.querySelector('input[type="checkbox"]');
                if (originalToggle) {
                  originalToggle.checked = toggle.checked;
                  log(`[Cookie Simplifier] Synchronized toggle state for category: ${categoryName}`);
                }
              }
            });
          });
          
          // Find all subcategory toggles in our simplified banner
          const subCategoryToggles = newBanner.querySelectorAll('.cookie-sub-choices input[type="checkbox"]');
          
          subCategoryToggles.forEach(toggle => {
            const subCategoryName = toggle.closest('.cookie-sub-choices > div').querySelector('div > div:first-child').textContent;
            
            // Find the corresponding subcategory in the original customization page
            const originalSubCategories = originalCustomizationPage.querySelectorAll('.ot-subgrp, .subcategory, [class*="sub-cat"]');
            
            originalSubCategories.forEach(originalSubCategory => {
              const originalTitle = originalSubCategory.querySelector('h4, h5, h6, .subtitle, [class*="title"]');
              if (originalTitle && originalTitle.textContent.trim() === subCategoryName) {
                const originalToggle = originalSubCategory.querySelector('input[type="checkbox"]');
                if (originalToggle) {
                  originalToggle.checked = toggle.checked;
                  log(`[Cookie Simplifier] Synchronized toggle state for subcategory: ${subCategoryName}`);
                }
              }
            });
          });
          
          // Now find and click the save button in the original customization page
          const saveButton = originalCustomizationPage.querySelector('.save-preference-btn, .btn-primary, .accept-btn, #save-preferences, [aria-label*="save"]');
          if (saveButton) {
            saveButton.click();
            log("[Cookie Simplifier] Clicked save button in original customization page");
          } else {
            log("[Cookie Simplifier] Could not find save button in original customization page");
          }
          
          // After saving, hide any overlays that might have appeared
          setTimeout(() => {
            hideOverlays();
          }, 500);
        } catch (error) {
          log(`[Cookie Simplifier] Error synchronizing toggle states: ${error.message}`);
        }
      } else {
        log("[Cookie Simplifier] No original customization page found");
      }
      
      newBanner.remove();
    });
    
    // Add keyboard support for Accept Selection button
    acceptSelectionBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        log("[Cookie Simplifier] Accept Selection button triggered via keyboard");
        
        // First, synchronize the toggle states from our simplified banner to the original customization page
        if (originalCustomizationPage) {
          try {
            // Find all category toggles in our simplified banner
            const categoryToggles = newBanner.querySelectorAll('.cookie-category-header input[type="checkbox"]');
            
            categoryToggles.forEach(toggle => {
              const categoryName = toggle.closest('.cookie-category-item').querySelector('.cookie-category-name').textContent;
              
              // Find the corresponding category in the original customization page
              const originalCategories = originalCustomizationPage.querySelectorAll('.ot-cat-item, .category-item, [class*="category"]');
              
              originalCategories.forEach(originalCategory => {
                const originalTitle = originalCategory.querySelector('h3, h4, h5, .title, .category-title, [class*="title"]');
                if (originalTitle && originalTitle.textContent.trim() === categoryName) {
                  const originalToggle = originalCategory.querySelector('input[type="checkbox"]');
                  if (originalToggle) {
                    originalToggle.checked = toggle.checked;
                    log(`[Cookie Simplifier] Synchronized toggle state for category: ${categoryName}`);
                  }
                }
              });
            });
            
            // Find all subcategory toggles in our simplified banner
            const subCategoryToggles = newBanner.querySelectorAll('.cookie-sub-choices input[type="checkbox"]');
            
            subCategoryToggles.forEach(toggle => {
              const subCategoryName = toggle.closest('.cookie-sub-choices > div').querySelector('div > div:first-child').textContent;
              
              // Find the corresponding subcategory in the original customization page
              const originalSubCategories = originalCustomizationPage.querySelectorAll('.ot-subgrp, .subcategory, [class*="sub-cat"]');
              
              originalSubCategories.forEach(originalSubCategory => {
                const originalTitle = originalSubCategory.querySelector('h4, h5, h6, .subtitle, [class*="title"]');
                if (originalTitle && originalTitle.textContent.trim() === subCategoryName) {
                  const originalToggle = originalSubCategory.querySelector('input[type="checkbox"]');
                  if (originalToggle) {
                    originalToggle.checked = toggle.checked;
                    log(`[Cookie Simplifier] Synchronized toggle state for subcategory: ${subCategoryName}`);
                  }
                }
              });
            });
            
            // Now find and click the save button in the original customization page
            const saveButton = originalCustomizationPage.querySelector('.save-preference-btn, .btn-primary, .accept-btn, #save-preferences, [aria-label*="save"]');
            if (saveButton) {
              saveButton.click();
              log("[Cookie Simplifier] Clicked save button in original customization page");
            } else {
              log("[Cookie Simplifier] Could not find save button in original customization page");
            }
            
            // After saving, hide any overlays that might have appeared
            setTimeout(() => {
              hideOverlays();
            }, 500);
          } catch (error) {
            log(`[Cookie Simplifier] Error synchronizing toggle states: ${error.message}`);
          }
        } else {
          log("[Cookie Simplifier] No original customization page found");
        }
        
        newBanner.remove();
      }
    });
    
    buttonContainer.appendChild(acceptSelectionBtn);
    
    newBanner.appendChild(buttonContainer);
    
    // Add a subtle shadow indicator for scrollable content
    const scrollIndicator = document.createElement('div');
    scrollIndicator.style.position = 'absolute';
    scrollIndicator.style.bottom = '0';
    scrollIndicator.style.left = '0';
    scrollIndicator.style.right = '0';
    scrollIndicator.style.height = '10px';
    scrollIndicator.style.background = 'linear-gradient(to top, rgba(0,0,0,0.1), transparent)';
    scrollIndicator.style.pointerEvents = 'none';
    scrollIndicator.style.borderRadius = '0 0 8px 8px';
    newBanner.appendChild(scrollIndicator);
    
    // Add a function to show/hide scroll indicator based on content
    function updateScrollIndicator() {
      if (contentContainer.scrollHeight > contentContainer.clientHeight) {
        scrollIndicator.style.display = 'block';
      } else {
        scrollIndicator.style.display = 'none';
      }
    }
    
    // Initial check
    updateScrollIndicator();
    
    // Set up a MutationObserver to watch for when the banner is removed
    const bannerObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          // Check if our banner was removed
          if (Array.from(mutation.removedNodes).includes(newBanner)) {
            log("[Cookie Simplifier] Banner removed from DOM, cleaning up");
            window.removeEventListener('resize', updateScrollIndicator);
            bannerObserver.disconnect();
            return;
          }
        }
      }
    });
    
    // Start observing the document body for removal of our banner
    bannerObserver.observe(document.body, { childList: true });
    
    // Update on resize
    window.addEventListener('resize', updateScrollIndicator);
    
    log("[Cookie Simplifier] Simplified banner created");
    return newBanner;
  } catch (error) {
    log(`[Cookie Simplifier] Error creating simplified banner: ${error.message}`);
    return null;
  }
}

// Enhanced function to remove overlays completely
function hideOverlays() {
  log("[Cookie Simplifier] Removing overlays");
  
  // First, try to find and remove OneTrust-specific overlays
  const oneTrustOverlay = document.querySelector('.onetrust-pc-dark-filter, .ot-sdk-overlay');
  if (oneTrustOverlay) {
    const overlayInfo = {
      element: oneTrustOverlay,
      originalDisplay: oneTrustOverlay.style.display || '',
      className: oneTrustOverlay.className,
      id: oneTrustOverlay.id,
      style: oneTrustOverlay.getAttribute('style'),
      parent: oneTrustOverlay.parentNode,
      nextSibling: oneTrustOverlay.nextSibling
    };
    originalBanners.set(oneTrustOverlay, overlayInfo);
    
    if (oneTrustOverlay.parentNode) {
      oneTrustOverlay.parentNode.removeChild(oneTrustOverlay);
      log("[Cookie Simplifier] Removed OneTrust overlay from DOM");
    }
  }
  
  // Remove other overlays
  OVERLAY_SELECTORS.forEach(selector => {
    const overlays = document.querySelectorAll(selector);
    overlays.forEach(overlay => {
      // Skip if this is the original customization page
      if (overlay === originalCustomizationPage) {
        return;
      }
      
      if (overlay.parentNode) {
        const overlayInfo = {
          element: overlay,
          originalDisplay: overlay.style.display || '',
          className: overlay.className,
          id: overlay.id,
          style: overlay.getAttribute('style'),
          parent: overlay.parentNode,
          nextSibling: overlay.nextSibling
        };
        originalBanners.set(overlay, overlayInfo);
        
        overlay.parentNode.removeChild(overlay);
        log(`[Cookie Simplifier] Removed overlay: ${selector}`);
      }
    });
  });
  
  // Also try to find and remove any element that might be causing the overlay
  const allElements = document.querySelectorAll('*');
  allElements.forEach(element => {
    const style = window.getComputedStyle(element);
    if (
      (style.position === 'fixed' || style.position === 'absolute') &&
      parseInt(style.zIndex) > 9999 &&
      style.backgroundColor.includes('rgba(0, 0, 0') &&
      element.parentNode
    ) {
      const overlayInfo = {
        element: element,
        originalDisplay: element.style.display || '',
        className: element.className,
        id: element.id,
        style: element.getAttribute('style'),
        parent: element.parentNode,
        nextSibling: element.nextSibling
      };
      originalBanners.set(element, overlayInfo);
      
      element.parentNode.removeChild(element);
      log("[Cookie Simplifier] Removed problematic overlay element");
    }
  });
}

// Function to restore overlays (but NOT the original customization page or original banner)
function restoreOverlays() {
  log("[Cookie Simplifier] Restoring overlays");
  
  originalBanners.forEach((bannerInfo, banner) => {
    // Skip restoring the original customization page and original banner
    if (banner === originalCustomizationPage || banner === originalBanner) {
      return;
    }
    
    try {
      if (bannerInfo.parent && !document.body.contains(banner)) {
        if (bannerInfo.nextSibling && bannerInfo.nextSibling.parentNode === bannerInfo.parent) {
          bannerInfo.parent.insertBefore(banner, bannerInfo.nextSibling);
        } else {
          bannerInfo.parent.appendChild(banner);
        }
        log("[Cookie Simplifier] Restored overlay to DOM: " + (banner.id || banner.tagName));
      }
    } catch (error) {
      log(`[Cookie Simplifier] Error restoring overlay: ${error.message}`);
    }
  });
}

// Hide the original banner by removing it from the DOM
function hideBanner(banner) {
  if (!banner) {
    log("[Cookie Simplifier] No banner to hide");
    return;
  }
  
  try {
    // Store reference to the original banner before removal
    originalBanner = banner;
    
    const bannerInfo = {
      element: banner,
      originalDisplay: banner.style.display || '',
      className: banner.className,
      id: banner.id,
      style: banner.getAttribute('style'),
      parent: banner.parentNode,
      nextSibling: banner.nextSibling
    };
    
    log(`[Cookie Simplifier] Removing banner - ID: ${banner.id || 'none'}`);
    originalBanners.set(banner, bannerInfo);
    
    // Completely remove the banner from the DOM
    if (banner.parentNode) {
      banner.parentNode.removeChild(banner);
      log("[Cookie Simplifier] Banner completely removed from DOM");
    }
    
    // Also remove any OneTrust-specific elements
    const oneTrustElements = [
      { selector: '.onetrust-pc-dark-filter', name: 'OneTrust overlay' },
      { selector: '#onetrust-consent-sdk', name: 'OneTrust container' }
    ];
    
    oneTrustElements.forEach(({ selector, name }) => {
      const element = document.querySelector(selector);
      if (element) {
        const elementInfo = {
          element: element,
          originalDisplay: element.style.display || '',
          className: element.className,
          id: element.id,
          style: element.getAttribute('style'),
          parent: element.parentNode,
          nextSibling: element.nextSibling
        };
        originalBanners.set(element, elementInfo);
        
        if (element.parentNode) {
          element.parentNode.removeChild(element);
          log(`[Cookie Simplifier] Removed ${name} from DOM`);
        }
      }
    });
  } catch (error) {
    log(`[Cookie Simplifier] Error removing banner: ${error.message}`);
  }
}

// Function to restore the original banner
function restoreOriginalBanner() {
  log("[Cookie Simplifier] Restoring original banner");
  
  if (originalBanner && originalBanners.has(originalBanner)) {
    try {
      const bannerInfo = originalBanners.get(originalBanner);
      
      if (bannerInfo.parent && !document.body.contains(originalBanner)) {
        if (bannerInfo.nextSibling && bannerInfo.nextSibling.parentNode === bannerInfo.parent) {
          bannerInfo.parent.insertBefore(originalBanner, bannerInfo.nextSibling);
        } else {
          bannerInfo.parent.appendChild(originalBanner);
        }
        log("[Cookie Simplifier] Restored original banner to DOM");
        
        // Remove from the map so we don't restore it again
        originalBanners.delete(originalBanner);
      }
    } catch (error) {
      log(`[Cookie Simplifier] Error restoring original banner: ${error.message}`);
    }
  }
  
  // Also restore any overlays that were hidden
  restoreOverlays();
}

// Function to remove any existing simplified banners
function removeExistingBanners() {
  const existingBanner = document.getElementById('simplified-cookie-banner');
  if (existingBanner) {
    existingBanner.remove();
    log("[Cookie Simplifier] Removed existing simplified banner");
  }
  
  // Also ensure any original banners that were hidden are completely removed
  originalBanners.forEach((bannerInfo, banner) => {
    if (banner !== originalCustomizationPage && banner.parentNode) {
      banner.parentNode.removeChild(banner);
      log("[Cookie Simplifier] Completely removed original banner from DOM");
    }
  });
}

// Main function to handle cookie banners
async function handleCookieBanners() {
  if (isProcessing) {
    log("[Cookie Simplifier] Already processing, skipping");
    return;
  }
  
  if (!extensionEnabled) {
    log("[Cookie Simplifier] Extension is disabled, skipping banner handling");
    return;
  }
  
  isProcessing = true;
  log("[Cookie Simplifier] Handling cookie banners...");
  
  try {
    const banner = findBanner();
    if (!banner) {
      log("[Cookie Simplifier] No banner found to handle");
      return;
    }
    
    // Additional check to ensure the banner is actually visible to the user
    if (!isElementVisibleToUser(banner)) {
      log("[Cookie Simplifier] Banner is not visible to user, skipping");
      return;
    }
    
    const bannerContent = extractBannerContent(banner);
    const buttons = extractButtons(banner);
    
    if (buttons.length === 0) {
      log("[Cookie Simplifier] No buttons found in banner");
      return;
    }
    
    // Prefetch customization content only if the banner is visible
    log("[Cookie Simplifier] Prefetching customization content");
    let customizationContent = null;
    
    try {
      // Use a timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout')), 15000); // 15 seconds timeout
      });
      
      customizationContent = await Promise.race([
        extractCustomizationContent(banner),
        timeoutPromise
      ]);
      
      log("[Cookie Simplifier] Customization content prefetched successfully");
    } catch (error) {
      log(`[Cookie Simplifier] Error prefetching customization content: ${error.message}`);
      customizationContent = createFallbackCustomizationContent();
    }
    
    // Completely remove the original banner and overlays
    hideBanner(banner);
    hideOverlays();
    
    const simplifiedBanner = createSimplifiedBanner(banner, buttons, bannerContent, customizationContent);
    if (simplifiedBanner) {
      document.body.appendChild(simplifiedBanner);
      log("[Cookie Simplifier] Simplified banner added to page");
      
      // Check for banner reinsertion after a delay
      setTimeout(() => {
        // Check if the original banner was reinserted
        const reinsertedBanner = document.querySelector('#onetrust-banner-sdk, .ot-sdk-container');
        if (reinsertedBanner && !isProcessing) {
          log("[Cookie Simplifier] Detected banner reinsertion, removing it again");
          hideBanner(reinsertedBanner);
        }
      }, 2000);
    } else {
      log("[Cookie Simplifier] Failed to create simplified banner");
    }
  } catch (error) {
    log(`[Cookie Simplifier] Error handling banners: ${error.message}`);
  } finally {
    setTimeout(() => {
      isProcessing = false;
      log("[Cookie Simplifier] Processing complete");
    }, 1000);
  }
}

// Set up MutationObserver to detect dynamically added banners
function setupObserver() {
  if (!extensionEnabled) {
    log("[Cookie Simplifier] Extension is disabled, skipping observer setup");
    return;
  }
  
  log("[Cookie Simplifier] Setting up MutationObserver");
  
  if (observer) {
    observer.disconnect();
    log("[Cookie Simplifier] Disconnected existing observer");
  }
  
  observer = new MutationObserver(mutations => {
    const now = Date.now();
    if (now - lastProcessed < 1000) { // Throttle to 1s
      log("[Cookie Simplifier] Mutation observed but throttled, skipping");
      return;
    }
    lastProcessed = now;
    
    if (isProcessing) {
      log("[Cookie Simplifier] Mutation observed but already processing, skipping");
      return;
    }
    
    for (const mutation of mutations) {
      if (mutation.addedNodes.length) {
        let hasOwnBanner = false;
        for (const node of mutation.addedNodes) {
          if (node.id === 'simplified-banner' || 
              (node.querySelector && node.querySelector('#simplified-banner'))) {
            hasOwnBanner = true;
            break;
          }
        }
        
        if (hasOwnBanner) {
          log("[Cookie Simplifier] Mutation is from our own banner, skipping");
          continue;
        }
      }
      
      // Check specifically for OneTrust banner
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Check if it's a OneTrust banner
          for (const selector of ONETRUST_SELECTORS) {
            let element = null;
            if (node.matches && node.matches(selector)) {
              element = node;
            } else if (node.querySelector && node.querySelector(selector)) {
              element = node.querySelector(selector);
            }
            if (element && isElementVisibleToUser(element) && !shouldExclude(element)) {
              log(`[Cookie Simplifier] OneTrust banner detected via observer: ${selector}`);
              handleCookieBanners();
              return;
            }
          }
          
          // Check if it's a general banner but not a false positive
          for (const selector of BANNER_SELECTORS) {
            let element = null;
            if (node.matches && node.matches(selector)) {
              element = node;
            } else if (node.querySelector && node.querySelector(selector)) {
              element = node.querySelector(selector);
            }
            if (element && isElementVisibleToUser(element) && !shouldExclude(element)) {
              log(`[Cookie Simplifier] General banner detected via observer: ${selector}`);
              handleCookieBanners();
              return;
            }
          }
        }
      }
      
      // Also check for overlays that might be added
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          for (const selector of OVERLAY_SELECTORS) {
            let element = null;
            if (node.matches && node.matches(selector)) {
              element = node;
            } else if (node.querySelector && node.querySelector(selector)) {
              element = node.querySelector(selector);
            }
            if (element && isElementVisibleToUser(element)) {
              log(`[Cookie Simplifier] Overlay detected via observer: ${selector}`);
              hideOverlays();
              return;
            }
          }
        }
      }
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false
  });
  
  log("[Cookie Simplifier] MutationObserver set up");
}

// Initialize
function init() {
  log("[Cookie Simplifier] Initializing extension");
  
  getSettings((settings) => {
    if (!settings.enabled) {
      log("[Cookie Simplifier] Extension is disabled, skipping initialization");
      return;
    }
    
    if (document.readyState === 'complete') {
      log("[Cookie Simplifier] Document already loaded");
      // Add a delay to ensure banners are loaded
      setTimeout(() => {
        handleCookieBanners();
        setupObserver();
      }, 1000);
    } else {
      log("[Cookie Simplifier] Waiting for document to load");
      window.addEventListener('load', () => {
        log("[Cookie Simplifier] Document loaded");
        // Add a delay to ensure banners are loaded
        setTimeout(() => {
          handleCookieBanners();
          setupObserver();
        }, 1000);
      });
    }
  });
}

// Listen for settings changes
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "settingsChanged") {
    log("[Cookie Simplifier] Settings changed, updating extension state");
    
    extensionEnabled = message.settings.enabled;
    
    if (extensionEnabled) {
      log("[Cookie Simplifier] Extension enabled, checking for banners");
      handleCookieBanners();
      setupObserver();
    } else {
      log("[Cookie Simplifier] Extension disabled, removing simplified banner and restoring original");
      removeExistingBanners();
      restoreOriginalBanner();
      
      if (observer) {
        observer.disconnect();
        observer = null;
      }
    }
    sendResponse({ success: true });
  }
  debugMode = message.settings.debugMode;
  
  return true;
});

init();