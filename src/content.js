console.log("[Cookie Simplifier] Content script loaded");
// ========================
// GLOBAL STATE MANAGEMENT
// ========================
const ExtensionState = {
  enabled: true,
  debugMode: true,
  isProcessing: false,
  observer: null,
  originalBanners: new Map(),
  lastProcessed: 0,
  prefetchedCustomizationContent: null,
  originalCustomizationPage: null,
  originalBanner: null,
  isClosing: false,
  formSubmissionData: null,
  customizationRequestData: null,
  originalCustomizeButton: null
};
// ========================
// CONSTANTS AND SELECTORS
// ========================
const Selectors = {
  // OneTrust-specific selectors
  onetrustBanner: [
    '#onetrust-banner-sdk',
    '#onetrust-consent-sdk',
    '#onetrust-group-container',
    '#onetrust-policy',
    '.onetrust-banner-sdk',
    '#ot-sdk-container',
    '.ot-sdk-container',
    '.ot-sdk-row',
    '#trustarc-banner-content',
    '[id*="onetrust"]',
    '[class*="onetrust"]',
    '[id*="ot-sdk"]',
    '[class*="ot-sdk"]'
  ],
  
  // General cookie banner selectors
  generalBanner: [
    '[id*="cookie"]',
    '[class*="cookie"]',
    '[id*="consent"]',
    '[class*="consent"]',
    '[id*="gdpr"]',
    '[class*="notice"]',
    '[id*="notice"]',
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
    '#wcpConsentBannerCtrl',
    '#awsccc-cb-content',
    '#cmpbox',
    '[data-cmp-host]'
  ],
  
  // Elements to exclude (common false positives)
  exclude: [
    '[aria-modal="true"][role="dialog"]:not([aria-label*="cookie"]):not([aria-label*="consent"]):not([aria-label*="privacy"]):not([id*="onetrust"]):not([class*="onetrust"])',
    '[role="dialog"]:not([aria-label*="cookie"]):not([aria-label*="consent"]):not([aria-label*="privacy"]):not([id*="onetrust"]):not([class*="onetrust"])',
    '.modal-backdrop:not(.cookie):not([id*="onetrust"]):not([class*="onetrust"])',
    '.g-signin2',
    '[data-testid*="signin"]',
    '[data-testid*="login"]',
    '[id*="signin"]:not([id*="onetrust"])',
    '[id*="login"]:not([id*="onetrust"])',
    '[class*="signin"]:not([class*="onetrust"])',
    '[class*="login"]:not([class*="onetrust"])',
    '.js-signup-modal',
    '.js-login-modal',
    '.signup-modal',
    '.login-modal',
    '.auth-popup',
    '[id*="auth"]:not([id*="onetrust"])',
    '[class*="auth"]:not([class*="onetrust"])',
    '#signup-modal',
    '#login-modal'
  ],
  
  // Overlay selectors
  overlays: [
    '.onetrust-pc-dark-filter',
    '.ot-sdk-overlay',
    '.cookie-modal-backdrop',
    '[class*="modal-backdrop"]',
    '.ot-dark-filter',
    '.onetrust-dark-filter',
    '#onetrust-pc-sdk + .dark-filter',
    '[id*="dark-filter"]',
    '[class*="dark-filter"]',
    '.backdrop',
    '.overlay',
    '[role="dialog"] ~ .backdrop',
    '.modal-backdrop',
    '.fade',
    '.onetrust-consent-sdk ~ .onetrust-pc-dark-filter',
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
  ],
  
  // Customization page selectors
  customization: [
    '#onetrust-pc-sdk',
    '#onetrust-consent-sdk',
    '.cookie-preferences',
    '.consent-preferences',
    '.privacy-preferences',
    '[id*="preference-center"]',
    '[class*="preference-center"]',
    '[id*="cookie-settings"]',
    '[class*="cookie-settings"]',
    '[id*="privacy-settings"]',
    '[class*="privacy-settings"]',
    '[id*="consent-settings"]',
    '[class*="consent-settings"]'
  ],
  
  // Save button selectors
  saveButtons: [
    '.save-preference-btn',
    '.btn-primary',
    '.accept-btn',
    '#save-preferences',
    '[aria-label*="save"]',
    '[data-testid*="save"]',
    '[data-automation-id*="save"]',
    '.ot-pc-footer .save-preference-btn',
    '.ot-pc-footer .btn-primary',
    '.consent-preferences .save',
    '.cookie-preferences .save',
    '.preferences-save',
    '.save-settings',
    '.save-consent',
    '.submit-preferences',
    '.apply-preferences',
    '[class*="save"]',
    '[id*="save"]'
  ],
  
  // Form selectors for POST requests
  forms: [
    'form[action*="consent"]',
    'form[action*="cookie"]',
    'form[action*="preference"]',
    'form[action*="privacy"]',
    '.ot-pc-content form',
    '#onetrust-pc-sdk form',
    '.cookie-preferences form',
    '.consent-preferences form',
    'form'
  ]
};
// Combined selectors for convenience
Selectors.banners = [...Selectors.onetrustBanner, ...Selectors.generalBanner];
// ========================
// TEXT STYLING AND TRANSLATIONS
// ========================
const Styling = {
  persian: {
    fontFamily: 'Vazirmatn, Tahoma, Arial, sans-serif',
    fontSize: '14px',
    color: '#333333',
    lineHeight: '1.5'
  }
};
const Translations = {
  category: {
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
  },
  banner: {
    title: "تنظیمات کوکی‌ها",
    description: "ما از کوکی‌ها برای بهبود تجربه شما در وب‌سایت استفاده می‌کنیم. لطفاً تنظیمات کوکی خود را انتخاب کنید.",
    acceptAll: "پذیرش همه",
    rejectAll: "رد همه",
    acceptSelection: "پذیرش انتخاب"
  },
  ui: {
    alwaysActive: "همیشه فعال"
  }
};
// Regex patterns for matching category names
const CategoryPatterns = [
  { pattern: /Strictly Necessary/i, key: "Strictly Necessary Cookies" },
  { pattern: /Required/i, key: "Strictly Necessary Cookies" },
  { pattern: /Necessary/i, key: "Necessary Cookies" },
  { pattern: /Analytics/i, key: "Analytics Cookies" },
  { pattern: /Performance/i, key: "Performance Cookies" },
  { pattern: /Functional/i, key: "Functional Cookies" },
  { pattern: /Targeting/i, key: "Targeting Cookies" },
  { pattern: /Advertising/i, key: "Advertising Cookies" },
  { pattern: /Social Media/i, key: "Social Media Cookies" },
  { pattern: /Unclassified/i, key: "Unclassified Cookies" },
  { pattern: /Save and communicate privacy choices/i, key: "Save and communicate privacy choices" }
];
// Button keywords for identification
const ButtonKeywords = {
  accept: ['accept', 'agree', 'allow', 'ok', 'confirm', 'got it', 'understand', 'continue', 'yes', 'submit', 'allow all', 'accept all', 'i agree', 'i accept'],
  reject: ['reject', 'decline', 'deny', 'disagree', 'no thanks', 'opt out', 'refuse', 'no', 'reject all', 'decline all', 'deny all'],
  customize: ['customize', 'settings', 'preferences', 'manage', 'options', 'configure', 'more info', 'learn more', 'details', 'cookie settings', 'privacy settings', 'manage preferences', 'privacy options', 'cookie preferences', 'privacy preferences']
};
// sign-in dialog based on content
const authKeywords = [
  'sign in', 'log in', 'login', 'signin', 'sign up', 'signup', 
  'register', 'create account', 'forgot password', 'reset password'
];
// ========================
// UTILITY FUNCTIONS
// ========================
/**
 * Get extension settings from storage
 */
function getSettings(callback) {
  chrome.runtime.sendMessage({ action: "getSettings" }, (settings) => {
    if (chrome.runtime.lastError) {
      log(`[Cookie Simplifier] Error getting settings: ${chrome.runtime.lastError.message}`);
      return;
    }
    ExtensionState.enabled = settings.enabled !== undefined ? settings.enabled : true;
    ExtensionState.debugMode = settings.debugMode !== undefined ? settings.debugMode : true;
    callback(settings);
  });
}
/**
 * Logging function that respects debug mode
 */
function log(message) {
  if (ExtensionState.debugMode) {
    console.log(message);
  }
}
/**
 * Check if element is visible
 */
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
/**
 * Check if element is visible to user (more comprehensive check)
 */
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
/**
 * Create a checkbox element
 */
function createCheckbox(checked, isDisabled = false) {
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = checked;
  checkbox.disabled = isDisabled;
  return checkbox;
}
/**
 * Translate category name using regex patterns
 */
function translateCategoryName(name) {
  // Try to match each pattern in order
  for (const { pattern, key } of CategoryPatterns) {
    if (pattern.test(name)) {
      return Translations.category[key] || name;
    }
  }
  // If no pattern matches, return the original name
  return name;
}
/**
 * Submit form data to the original endpoint
 */
function submitFormData(formData, actionUrl) {
  try {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = actionUrl;
    form.style.display = 'none';
    
    for (const [key, value] of formData.entries()) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = value;
      form.appendChild(input);
    }
    
    document.body.appendChild(form);
    form.submit();
    log(`[Cookie Simplifier] Form submitted to ${actionUrl}`);
    return true;
  } catch (error) {
    log(`[Cookie Simplifier] Error submitting form: ${error.message}`);
    return false;
  }
}
/**
 * Capture form data from a form element
 */
function captureFormData(form) {
  try {
    const formData = new FormData(form);
    const actionUrl = form.action || window.location.href;
    
    log(`[Cookie Simplifier] Captured form data from form with action: ${actionUrl}`);
    
    // Convert FormData to a plain object for easier manipulation
    const formDataObj = {};
    for (const [key, value] of formData.entries()) {
      formDataObj[key] = value;
    }
    
    return {
      formData: formData,
      formDataObj: formDataObj,
      actionUrl: actionUrl,
      method: form.method || 'POST'
    };
  } catch (error) {
    log(`[Cookie Simplifier] Error capturing form data: ${error.message}`);
    return null;
  }
}
/**
 * Capture request data from a button click
 */
function captureRequestData(button) {
  try {
    // Check if the button is part of a form
    const form = button.closest('form');
    if (form) {
      return captureFormData(form);
    }
    
    // If not part of a form, try to capture any onclick handlers
    const onclick = button.getAttribute('onclick');
    if (onclick) {
      log(`[Cookie Simplifier] Found onclick handler: ${onclick}`);
      
      // Try to extract URL from onclick
      const urlMatch = onclick.match(/['"`]([^'"`]*?)['"`]/g);
      if (urlMatch && urlMatch.length > 0) {
        const url = urlMatch[0].replace(/['"`]/g, '');
        log(`[Cookie Simplifier] Extracted URL from onclick: ${url}`);
        
        return {
          url: url,
          method: 'GET',
          isOnclick: true,
          onclickHandler: onclick
        };
      }
    }
    
    // Check for data attributes that might contain request info
    const dataUrl = button.getAttribute('data-url') || 
                   button.getAttribute('data-action') || 
                   button.getAttribute('data-href');
    
    if (dataUrl) {
      log(`[Cookie Simplifier] Found data URL: ${dataUrl}`);
      return {
        url: dataUrl,
        method: 'GET',
        isDataAttr: true
      };
    }
    
    // Check for href attribute (if it's a link styled as a button)
    const href = button.getAttribute('href');
    if (href && href !== '#') {
      log(`[Cookie Simplifier] Found href: ${href}`);
      return {
        url: href,
        method: 'GET',
        isHref: true
      };
    }
    
    return null;
  } catch (error) {
    log(`[Cookie Simplifier] Error capturing request data: ${error.message}`);
    return null;
  }
}
/**
 * Send a request based on captured data
 */
function sendCapturedRequest(requestData, updatedData = {}) {
  try {
    if (!requestData) {
      log("[Cookie Simplifier] No request data to send");
      return false;
    }
    
    if (requestData.formData) {
      // Handle form submission
      const newFormData = new FormData();
      
      // Copy original form data
      for (const [key, value] of requestData.formData.entries()) {
        newFormData.append(key, value);
      }
      
      // Update with new data
      for (const [key, value] of Object.entries(updatedData)) {
        newFormData.set(key, value);
      }
      
      return submitFormData(newFormData, requestData.actionUrl);
    } else if (requestData.url) {
      // Handle URL-based request
      const url = new URL(requestData.url, window.location.origin);
      
      // Add/update query parameters
      for (const [key, value] of Object.entries(updatedData)) {
        url.searchParams.set(key, value);
      }
      
      // Navigate to the URL
      window.location.href = url.toString();
      return true;
    } else if (requestData.onclickHandler) {
      // Execute the onclick handler with updated data
      // This is a simplified approach - in a real scenario, you might need to parse and modify the handler
      log("[Cookie Simplifier] Executing onclick handler");
      eval(requestData.onclickHandler);
      return true;
    }
    
    return false;
  } catch (error) {
    log(`[Cookie Simplifier] Error sending captured request: ${error.message}`);
    return false;
  }
}
// ========================
// BANNER DETECTION MODULE
// ========================
const BannerDetector = {
  /**
   * Find cookie banner on the page
   */
  findBanner() {
    log("[Cookie Simplifier] Searching for cookie banner...");
    
    // Try all selectors
    for (const selector of Selectors.banners) {
      const elements = document.querySelectorAll(selector);
      log(`[Cookie Simplifier] Found ${elements.length} elements for selector: ${selector}`);
      
      for (const element of elements) {
        if (ExtensionState.originalBanners.has(element)) {
          log("[Cookie Simplifier] Skipping already processed banner: " + (element.id || element.tagName));
          continue;
        }
        
        if (isElementVisibleToUser(element) && !this.shouldExclude(element)) {
          log(`[Cookie Simplifier] Found visible banner with selector: ${selector}, ID: ${element.id || 'none'}`);
          return element;
        }
      }
    }
    
    log("[Cookie Simplifier] No cookie banner found");
    return null;
  },
  
  /**
   * Check if element should be excluded from processing
   */
  shouldExclude(element) {
    // First check explicit selectors
    for (const selector of Selectors.exclude) {
      if (element.matches(selector) || element.closest(selector)) {
        // Additional check for OneTrust elements
        let foundOnetrust = false;
        for(const otElemnts of Selectors.onetrustBanner){
          if (element.matches(otElemnts) || element.closest(otElemnts)) {
            // Don't exclude OneTrust elements even if they match other selectors
            foundOnetrust = true;
            break;
          }
        }
        if (foundOnetrust) {
          continue;
        }
        log(`[Cookie Simplifier] Excluding element with selector: ${selector}`);
        return true;
      }
    }
    
    // Enhanced content-based exclusion for authentication dialogs
    const text = element.textContent.toLowerCase();
    
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
    
    return false;
  },
  
  /**
   * Extract buttons from banner with improved logic
   */
  extractButtons(banner) {
    log("[Cookie Simplifier] Extracting buttons from banner...");
 
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
      
      // Process each clickable element
      clickableElements.forEach(element => {
        // Normalize the text by removing extra spaces and converting to lowercase
        const text = element.textContent.trim().toLowerCase().replace(/\s+/g, ' ');
        
        // Skip close buttons explicitly
        if (text === '✕' || text.includes('close') || text.includes('dismiss')) {
          log(`[Cookie Simplifier] Skipping close button with text: "${text}"`);
          return;
        }
        
        log(`[Cookie Simplifier] Processing button with text: "${text}"`);
        
        // Determine button type with improved scoring system
        let buttonType = null;
        let maxScore = 0;
        
        // Check against button keywords with scoring
        for (const [type, keywords] of Object.entries(ButtonKeywords)) {
          let score = 0;
          
          // Check for exact matches
          if (keywords.includes(text)) {
            score += 10; // Highest score for exact match
          }
          
          // Check for partial matches
          for (const keyword of keywords) {
            if (text.includes(keyword)) {
              score += 5; // Medium score for partial match
              
              // Additional score for longer keywords (more specific)
              if (keyword.length > 5) {
                score += 2;
              }
            }
          }
          
          // Check for attributes
          const attributes = element.getAttributeNames();
          const attributeValues = attributes.map(attr => element.getAttribute(attr).toLowerCase());
          
          if (attributes.some(attr => attr.includes(type)) || 
              attributeValues.some(val => val.includes(type))) {
            score += 3; // Lower score for attribute match
          }
          
          // Update button type if this score is higher
          if (score > maxScore) {
            maxScore = score;
            buttonType = type;
          }
        }
        
        // If still no match, try to infer from button position and styling
        if (!buttonType && clickableElements.length > 1) {
          const index = Array.from(clickableElements).indexOf(element);
          
          // Last button is often accept
          if (index === clickableElements.length - 1) {
            // Check if it has styling that suggests it's a primary/accept button
            const style = window.getComputedStyle(element);
            const hasPrimaryStyle = (
              style.backgroundColor && 
              (style.backgroundColor.includes('rgb(76, 175, 80)') || // Green
               style.backgroundColor.includes('rgb(33, 150, 243)') || // Blue
               style.backgroundColor.includes('rgb(3, 169, 244)'))   // Light blue
            );
            
            if (hasPrimaryStyle) {
              buttonType = 'accept';
            }
          }
          
          // Second to last button might be reject
          if (index === clickableElements.length - 2 && !buttonType) {
            // Check if it has styling that suggests it's a secondary/reject button
            const style = window.getComputedStyle(element);
            const hasSecondaryStyle = (
              style.backgroundColor && 
              (style.backgroundColor.includes('rgb(244, 67, 54)') || // Red
               style.backgroundColor.includes('rgb(158, 158, 158)'))  // Gray
            );
            
            if (hasSecondaryStyle) {
              buttonType = 'reject';
            }
          }
        }
        
        // If we found a button type, add it
        if (buttonType) {
          // Only add if we don't already have this type or if this one has a higher score
          const existingButtonIndex = buttons.findIndex(btn => btn.type === buttonType);
          
          if (existingButtonIndex === -1) {
            // We don't have this type yet, add it
            buttons.push({ 
              type: buttonType, 
              element, 
              text: element.textContent.trim() || buttonType.charAt(0).toUpperCase() + buttonType.slice(1),
              score: maxScore
            });
            log(`[Cookie Simplifier] Identified as ${buttonType.toUpperCase()} button with score ${maxScore}`);
          } else if (maxScore > buttons[existingButtonIndex].score) {
            // Replace with the higher scoring button
            buttons[existingButtonIndex] = {
              type: buttonType, 
              element, 
              text: element.textContent.trim() || buttonType.charAt(0).toUpperCase() + buttonType.slice(1),
              score: maxScore
            };
            log(`[Cookie Simplifier] Replaced ${buttonType.toUpperCase()} button with higher score ${maxScore}`);
          }
        }
      });
      
      // If we don't have a reject button, create a virtual one
      if (!buttons.find(btn => btn.type === 'reject')) {
        log("[Cookie Simplifier] No reject button found, will create virtual reject button");
        
        // Find the accept button to position our virtual reject button
        const acceptButton = buttons.find(btn => btn.type === 'accept');
        if (acceptButton) {
          // Create a virtual reject button
          buttons.push({
            type: 'reject',
            element: null, // No actual element
            text: Translations.banner.rejectAll,
            isVirtual: true,
            score: 1 // Low score, will only be used if no real button is found
          });
        }
      }
      
      log(`[Cookie Simplifier] Extracted ${buttons.length} buttons:`, buttons.map(b => ({ type: b.type, text: b.text, score: b.score })));
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
};
// ========================
// CONTENT EXTRACTION MODULE
// ========================
const ContentExtractor = {
  /**
   * Extract HTML content from banner
   */
  extractBannerContent(banner) {
    log("[Cookie Simplifier] Extracting banner HTML content...");
    
    try {
      // Create a container for the extracted content
      const contentContainer = document.createElement('div');
      contentContainer.className = 'extracted-content black-text';
      
      const bannerClone = banner.cloneNode(true);
      contentContainer.appendChild(bannerClone);
      log("[Cookie Simplifier] Added cloned banner");
      
      return contentContainer;
    } catch (error) {
      log(`[Cookie Simplifier] Error extracting banner content: ${error.message}`);
    }
  },
  
  /**
   * Extract customization page content using the customize button
   */
  async extractCustomizationContent(customizeButton) {
    log("[Cookie Simplifier] Extracting customization page content using customize button...");
    
    if (!customizeButton) {
      log("[Cookie Simplifier] No customize button provided");
      return null;
    }
    
    // Store the original customize button for later use
    ExtensionState.originalCustomizeButton = customizeButton;
    
    // Capture request data from the customize button
    const requestData = captureRequestData(customizeButton);
    if (requestData) {
      ExtensionState.customizationRequestData = requestData;
      log("[Cookie Simplifier] Captured request data from customize button");
    }
    
    try {
      return await this.triggerCustomizationPage(customizeButton);
    } catch (error) {
      log(`[Cookie Simplifier] Error extracting customization content: ${error.message}`);
      return null;
    }
  },
  
  /**
   * Trigger customization page by clicking the provided customize button
   */
  async triggerCustomizationPage(customizeButton) {
    log("[Cookie Simplifier] Clicking customize button to open preferences");
    
    // Store the current state of the document to detect changes
    const initialBodyHTML = document.body.innerHTML;
    
    try {
      // Click the customize button with error handling
      customizeButton.click();
    } catch (error) {
      log(`[Cookie Simplifier] Error clicking customize button: ${error.message}`);
      return null;
    }
    
    // Wait for the customization page to appear
    return new Promise((resolve) => {
      let pageFound = false;
      const checkInterval = setInterval(() => {
        // Look for any new elements that might be the customization page
        const foundPage = this.findNewCustomizationPage(initialBodyHTML);
        
        if (foundPage) {
          clearInterval(checkInterval);
          pageFound = true;
          log("[Cookie Simplifier] Customization page appeared after clicking button");
          
          // Store reference to original customization page
          ExtensionState.originalCustomizationPage = foundPage;
          
          // Hide any overlays that might be causing the black screen
          OverlayManager.hideOverlays();
          
          // Process the customization page (async)
          this.processCustomizationPage(foundPage).then(resolve).catch(() => resolve(null));
        }
      }, 100);
      
      // Timeout after 5 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        if (!pageFound) {
          log("[Cookie Simplifier] Timeout waiting for customization page");
          resolve(null);
        }
      }, 5000);
    });
  },
  
  /**
   * Find new customization page that appeared after clicking the button
   */
  findNewCustomizationPage(initialBodyHTML) {
    // Get all elements that contain cookie preferences
    const allElements = document.querySelectorAll('*');
    
    for (const element of allElements) {
      // Skip if element is not visible
      if (!isElementVisibleToUser(element)) continue;
      
      // Check if element contains cookie-related text and form controls
      const text = element.textContent.toLowerCase();
      const hasCookieText = text.includes('cookie') || text.includes('consent') || text.includes('preference');
      const hasFormControls = element.querySelectorAll('input[type="checkbox"], input[type="radio"]').length > 0;
      
      // Also check if this element is new (wasn't in the initial DOM)
      const elementHTML = element.outerHTML;
      const isNewElement = !initialBodyHTML.includes(elementHTML);
      
      if (hasCookieText && hasFormControls && isNewElement) {
        log(`[Cookie Simplifier] Found new customization page: ${element.tagName}${element.id ? '#' + element.id : ''}`);
        return element;
      }
    }
    
    return null;
  },
  
  /**
   * Process customization page using LLM (new feature) with fallback to manual
   */
  async processCustomizationPage(customizationPage) {
    // Create a clean container for our extracted content
    const cleanContainer = document.createElement('div');
    cleanContainer.style.backgroundColor = '#ffffff';
    cleanContainer.style.color = '#000000';
    cleanContainer.style.padding = '15px';
    
    // Hide the original customization page
    customizationPage.style.display = 'none';
    
    // Try to capture form data from the customization page
    const form = customizationPage.querySelector('form');
    if (form) {
      const formData = captureFormData(form);
      if (formData) {
        ExtensionState.formSubmissionData = formData;
        log("[Cookie Simplifier] Captured form data from customization page");
      }
    }
    
    try {
      const html = customizationPage.outerHTML;
      log("[Cookie Simplifier] Sending customization HTML to LLM for processing");
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: "processCustomization",
          html: html,
          categoryPatterns: CategoryPatterns,
          translations: Translations.category
        }, (response) => {
          if (chrome.runtime.lastError || response.error) {
            log(`[Cookie Simplifier] LLM processing failed: ${response.error || chrome.runtime.lastError.message}. Falling back to manual.`);
            // Fallback to manual processing
            const fallbackContainer = this.manualProcessCustomizationPage(customizationPage);
            resolve(fallbackContainer);
          } else {
            log("[Cookie Simplifier] Received processed categories from LLM");
            // Create categories container
            const categoriesContainer = document.createElement('div');
            categoriesContainer.style.marginTop = '20px';
            response.categories.forEach(cat => {
              let toggle = null;
              if (!cat.isTextOnly) {
                toggle = createCheckbox(cat.isChecked, cat.isDisabled);
              }
              const accordionCategory = UIComponents.createAccordionCategory(
                cat.translatedName,
                cat.description,
                toggle,
                cat.isAlwaysEnabled,
                cat.subChoices.map(sub => ({
                  name: sub.translatedName,
                  description: sub.description,
                  toggle: sub.isTextOnly ? null : createCheckbox(sub.isChecked, sub.isDisabled),
                  isAlwaysActive: sub.isAlwaysEnabled,
                  isTextOnly: sub.isTextOnly,
                  originalName: sub.originalName,
                  toggleId: sub.toggleId,
                  toggleName: sub.toggleName,
                  toggleValue: sub.toggleValue
                })),
                cat.isTextOnly,
                cat.originalName,
                cat.toggleId,
                cat.toggleName,
                cat.toggleValue
              );
              if (accordionCategory) {
                // Store original name for syncing
                accordionCategory.setAttribute('data-original-name', cat.originalName);
                categoriesContainer.appendChild(accordionCategory);
              }
            });
            cleanContainer.appendChild(categoriesContainer);
            resolve(cleanContainer);
          }
        });
      });
    } catch (error) {
      log(`[Cookie Simplifier] Error in LLM processing: ${error.message}. Falling back to manual.`);
      const fallbackContainer = this.manualProcessCustomizationPage(customizationPage);
      return fallbackContainer;
    }
  },
  
  /**
   * Manual processing (original logic as fallback)
   */
  manualProcessCustomizationPage(customizationPage) {
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
      '.consent-preference',    // Consent preference
      // GitLab specific
      '.cookie-categories .category',
      '.js-cookie-category',
      // Booking.com specific
      '[data-testid="cookie-category"]',
      '.cookie-settings__category'
    ];
    
    let foundCategories = false;
    
    // Try each selector to find categories
    for (const selector of categorySelectors) {
      const categoryElements = customizationPage.querySelectorAll(selector);
      if (categoryElements.length > 0) {
        foundCategories = true;
        
        categoryElements.forEach(category => {
          const categoryData = this.extractCategoryData(category);
          if (categoryData) {
            const accordionCategory = UIComponents.createAccordionCategory(
              categoryData.name, 
              categoryData.description, 
              categoryData.toggle, 
              categoryData.isAlwaysActive,
              categoryData.subChoices,
              categoryData.isTextOnly,
              categoryData.name, // For fallback, originalName = translatedName since manual translates name
              categoryData.toggleId,
              categoryData.toggleName,
              categoryData.toggleValue
            );
            // Only append if it's not null (not a text-only category)
            if (accordionCategory) {
              accordionCategory.setAttribute('data-original-name', categoryData.name); // In manual, use translated as original for sync
              categoriesContainer.appendChild(accordionCategory);
            }
          }
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
            const categoryName = 'Cookie Preferences';
            const description = 'Manage your cookie preferences.';
            
            // Create a representative toggle (first one)
            const representativeToggle = toggles[0];
            
            // Check if this category is always active
            const isAlwaysActive = this.isAlwaysActiveCategory(parent, representativeToggle, categoryName);
            
            const toggleId = representativeToggle.id || null;
            const toggleName = representativeToggle.name || null;
            const toggleValue = representativeToggle.value || null;
            
            // Create accordion category item
            const accordionCategory = UIComponents.createAccordionCategory(
              categoryName, 
              description, 
              representativeToggle, 
              isAlwaysActive,
              [], // No sub-choices
              false, // Not text-only
              categoryName, // originalName
              toggleId,
              toggleName,
              toggleValue
            );
            // Only append if it's not null (not a text-only category)
            if (accordionCategory) {
              accordionCategory.setAttribute('data-original-name', categoryName);
              categoriesContainer.appendChild(accordionCategory);
            }
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
            const isAlwaysActive = this.isAlwaysActiveCategory(parent, representativeToggle, categoryName);
            
            const toggleId = representativeToggle.id || null;
            const toggleName = representativeToggle.name || null;
            const toggleValue = representativeToggle.value || null;
            
            // Create accordion category item
            const accordionCategory = UIComponents.createAccordionCategory(
              categoryName, 
              description, 
              representativeToggle, 
              isAlwaysActive,
              [], // No sub-choices
              false, // Not text-only
              categoryName, // originalName
              toggleId,
              toggleName,
              toggleValue
            );
            // Only append if it's not null (not a text-only category)
            if (accordionCategory) {
              accordionCategory.setAttribute('data-original-name', categoryName);
              categoriesContainer.appendChild(accordionCategory);
            }
          }
        });
      }
    }
    
    // If still no categories found, create a simple default interface
    if (!foundCategories) {
      const necessaryCategory = UIComponents.createAccordionCategory(
        'Necessary Cookies', 
        'These cookies are essential for the website to function and cannot be switched off in our systems.',
        createCheckbox(true,true),
        true,
        [], // No sub-choices
        false, // Not text-only
        'Necessary Cookies', // originalName
        null,
        null,
        null
      );
      const analyticsCategory = UIComponents.createAccordionCategory(
        'Analytics Cookies', 
        'These cookies allow us to count visits and traffic sources so we can measure and improve the performance of our site.',
        createCheckbox(false),
        false,
        [], // No sub-choices
        false, // Not text-only
        'Analytics Cookies',
        null,
        null,
        null
      );
      const marketingCategory = UIComponents.createAccordionCategory(
        'Marketing Cookies', 
        'These cookies may be set through our site by our advertising partners to build a profile of your interests.',
        createCheckbox(false),
        false,
        [], // No sub-choices
        false, // Not text-only
        'Marketing Cookies',
        null,
        null,
        null
      );
      
      // Only append if they're not null (not text-only categories)
      if (necessaryCategory) {
        necessaryCategory.setAttribute('data-original-name', 'Necessary Cookies');
        categoriesContainer.appendChild(necessaryCategory);
      }
      if (analyticsCategory) {
        analyticsCategory.setAttribute('data-original-name', 'Analytics Cookies');
        categoriesContainer.appendChild(analyticsCategory);
      }
      if (marketingCategory) {
        marketingCategory.setAttribute('data-original-name', 'Marketing Cookies');
        categoriesContainer.appendChild(marketingCategory);
      }
    }
    
    cleanContainer.appendChild(categoriesContainer);
    
    return cleanContainer;
  },
  
  /**
   * Extract category data from a category element (for manual fallback)
   */
  extractCategoryData(category) {
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
    
    // Extract description
    let description = this.extractCategoryDescription(category);
    
    // If no description found, use a default one based on the category name
    if (!description) {
      description = this.getDefaultDescription(categoryName);
    }
    
    // Find the toggle/checkbox for this category
    let toggle = category.querySelector('input[type="checkbox"]');
    if (!toggle) {
      // Look for toggle switches or other input types
      toggle = category.querySelector('input[type="radio"], .toggle, .switch, [role="switch"], [role="checkbox"]');
    }
    
    // Check if this is a text-only category (no toggle element)
    const isTextOnly = !toggle;
    
    // Create a toggle switch if none found and it's not a text-only category
    if (!toggle && !isTextOnly) {
      toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.checked = true; // Default to checked
    }
    
    // Extract toggle attributes
    let toggleId = toggle ? toggle.id || null : null;
    let toggleName = toggle ? toggle.name || null : null;
    let toggleValue = toggle ? toggle.getAttribute('value') || null : null;
    
    // Check if this category is always active (only if it has a toggle)
    const isAlwaysActive = !isTextOnly && this.isAlwaysActiveCategory(category, toggle, categoryName);
    
    // Check for subcategories
    const subChoices = this.extractSubCategories(category);
    
    return {
      name: categoryName,
      description: description,
      toggle: toggle,
      isAlwaysActive: isAlwaysActive,
      isTextOnly: isTextOnly,
      subChoices: subChoices,
      toggleId: toggleId,
      toggleName: toggleName,
      toggleValue: toggleValue
    };
  },
  
  /**
   * Extract category description from a category element (for manual)
   */
  extractCategoryDescription(category) {
    // Try multiple selectors
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
        return descElement.innerHTML.trim();
      }
    }
    
    // If no description found with selectors, try to get it from the text content
    const textElements = category.querySelectorAll('p, div:not([class])');
    for (const element of textElements) {
      const text = element.textContent.trim();
      // Check if it's a substantial text (more than 10 characters) and not just a title
      if (text.length > 10 && !element.querySelector('h1, h2, h3, h4, h5, h6')) {
        return text;
      }
    }
    
    return null;
  },
  
  /**
   * Get default description based on category name (for manual)
   */
  getDefaultDescription(categoryName) {
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
        return value;
      }
    }
    
    // If still no description, use a generic one
    return 'This category of cookies may collect information about your use of the website.';
  },
  
  /**
   * Extract subcategories from a category element (for manual)
   */
  extractSubCategories(category) {
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
        
        // Check if this is a text-only subcategory (no toggle element)
        const isTextOnly = !subToggle;
        
        // Create a toggle switch if none found and it's not a text-only subcategory
        if (!subToggle && !isTextOnly) {
          subToggle = document.createElement('input');
          subToggle.type = 'checkbox';
          subToggle.checked = true; // Default to checked
        }
        
        // Extract sub toggle attributes
        let subToggleId = subToggle ? subToggle.id || null : null;
        let subToggleName = subToggle ? subToggle.name || null : null;
        let subToggleValue = subToggle ? subToggle.getAttribute('value') || null : null;
        
        // Check if this subcategory is always active (only if it has a toggle)
        const isSubAlwaysActive = !isTextOnly && this.isAlwaysActiveCategory(subCategory, subToggle, subName);
        
        subChoices.push({
          name: subName,
          description: subDesc,
          toggle: subToggle,
          isAlwaysActive: isSubAlwaysActive,
          isTextOnly: isTextOnly,
          toggleId: subToggleId,
          toggleName: subToggleName,
          toggleValue: subToggleValue
        });
      });
    }
    
    return subChoices;
  },
  
  /**
   * Check if a category is always active (for manual)
   */
  isAlwaysActiveCategory(categoryElement, toggle, categoryName) {
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
};
// ========================
// UI COMPONENTS MODULE
// ========================
const UIComponents = {
  /**
   * Create accordion category for customization content
   * Updated to accept originalName for data attribute and subChoices with originalName
   */
  createAccordionCategory(categoryName, description, toggleElement, isAlwaysActive = false, subChoices = [], isTextOnly = false, originalName = '', toggleId = null, toggleName = null, toggleValue = null) {
    // Translate the category name (fallback if needed)
    const translatedName = translateCategoryName(categoryName);
    
    const categoryItem = document.createElement('div');
    categoryItem.className = 'cookie-category-item';
    categoryItem.style.backgroundColor = '#f9f9f9';
    categoryItem.style.border = '1px solid #ddd';
    categoryItem.style.borderRadius = '4px';
    categoryItem.style.marginBottom = '10px';
    categoryItem.style.overflow = 'hidden';
    // Store original name for syncing
    categoryItem.setAttribute('data-original-name', originalName || translatedName);
    categoryItem.setAttribute('data-toggle-id', toggleId || '');
    categoryItem.setAttribute('data-toggle-name', toggleName || '');
    categoryItem.setAttribute('data-toggle-value', toggleValue || '');
    
    // Category header (always visible)
    const header = document.createElement('div');
    header.className = 'cookie-category-header';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.padding = '12px';
    header.style.cursor = 'pointer'; // Always make header clickable
    header.style.backgroundColor = '#f9f9f9';
    
    const nameContainer = document.createElement('div');
    nameContainer.style.display = 'flex';
    nameContainer.style.alignItems = 'center';
    
    const categoryNameElement = document.createElement('span');
    categoryNameElement.className = 'cookie-category-name';
    categoryNameElement.textContent = translatedName; // Use translated name
    categoryNameElement.style.fontWeight = 'bold';
    categoryNameElement.style.color = Styling.persian.color;
    categoryNameElement.style.fontFamily = Styling.persian.fontFamily;
    categoryNameElement.style.fontSize = Styling.persian.fontSize;
    categoryNameElement.style.marginRight = '10px';
    
    // Add "Always Active" badge if needed
    if (isAlwaysActive) {
      const alwaysActiveBadge = document.createElement('span');
      alwaysActiveBadge.textContent = Translations.ui.alwaysActive;
      alwaysActiveBadge.style.fontSize = '10px';
      alwaysActiveBadge.style.padding = '2px 6px';
      alwaysActiveBadge.style.backgroundColor = '#4CAF50';
      alwaysActiveBadge.style.color = 'white';
      alwaysActiveBadge.style.borderRadius = '10px';
      alwaysActiveBadge.style.marginLeft = '8px';
      alwaysActiveBadge.style.fontFamily = Styling.persian.fontFamily;
      nameContainer.appendChild(alwaysActiveBadge);
    }
    
    // Always add toggle icon (for both text-only and non-text-only)
    const toggleIcon = document.createElement('span');
    toggleIcon.className = 'cookie-category-toggle-icon';
    toggleIcon.textContent = '▼'; // Down arrow for collapsed state
    toggleIcon.style.color = '#666';
    toggleIcon.style.fontSize = '12px';
    toggleIcon.style.transition = 'transform 0.3s ease';
    toggleIcon.style.transform = 'rotate(0deg)'; // No rotation for collapsed state
    nameContainer.appendChild(toggleIcon);
    
    nameContainer.appendChild(categoryNameElement);
    header.appendChild(nameContainer);
    
    // Define toggleClone variable (will be null for text-only categories)
    let toggleClone = null;
    
    // Add toggle switch only if it's not text-only
    if (!isTextOnly) {
      const toggleContainer = document.createElement('div');
      toggleContainer.style.display = 'flex';
      toggleContainer.style.alignItems = 'center';
      
      toggleClone = toggleElement ? toggleElement.cloneNode(true) : null;
      if (toggleClone) {
        toggleClone.style.cursor = 'pointer';
        
        // Disable if always active
        if (isAlwaysActive) {
          toggleClone.disabled = true;
          toggleClone.checked = true;
        }
        
        // Add event listener for category toggle
        toggleClone.addEventListener('change', () => {
          // Update all sub-choices if category toggle is changed
          const subToggles = categoryItem.querySelectorAll('.cookie-sub-choices input[type="checkbox"]');
          subToggles.forEach(subToggle => {
            if (!subToggle.disabled) {
              subToggle.checked = toggleClone.checked;
            }
          });
        });
        
        // Prevent toggle switch from bubbling up to header
        toggleClone.addEventListener('click', (e) => {
          e.stopPropagation();
        });
      }
      
      if (toggleClone) toggleContainer.appendChild(toggleClone);
      header.appendChild(toggleContainer);
    }
    
    // Description container
    const descriptionContainer = document.createElement('div');
    descriptionContainer.className = 'cookie-category-description';
    descriptionContainer.style.padding = '0 12px 12px';
    descriptionContainer.style.fontSize = '13px';
    descriptionContainer.style.color = '#555';
    descriptionContainer.style.fontFamily = Styling.persian.fontFamily;
    descriptionContainer.innerHTML = description;
    descriptionContainer.style.display = 'none'; // Always start collapsed
    
    // Sub-choices container
    const subChoicesContainer = document.createElement('div');
    subChoicesContainer.className = 'cookie-sub-choices';
    subChoicesContainer.style.padding = '0 12px 12px 24px'; // Indent sub-choices
    subChoicesContainer.style.backgroundColor = '#ffffff';
    subChoicesContainer.style.display = 'none'; // Always start collapsed
    
    // Add sub-choices if any
    if (subChoices.length > 0) {
      subChoices.forEach(subChoice => {
        // Skip text-only subcategories
        if (subChoice.isTextOnly) {
          return;
        }
        
        const subChoiceItem = document.createElement('div');
        subChoiceItem.style.marginBottom = '10px';
        subChoiceItem.style.padding = '8px';
        subChoiceItem.style.backgroundColor = '#f0f0f0';
        subChoiceItem.style.borderRadius = '4px';
        // Store original sub name for syncing
        subChoiceItem.setAttribute('data-original-name', subChoice.originalName || subChoice.name);
        subChoiceItem.setAttribute('data-toggle-id', subChoice.toggleId || '');
        subChoiceItem.setAttribute('data-toggle-name', subChoice.toggleName || '');
        subChoiceItem.setAttribute('data-toggle-value', subChoice.toggleValue || '');
        
        const subChoiceHeader = document.createElement('div');
        subChoiceHeader.style.display = 'flex';
        subChoiceHeader.style.justifyContent = 'space-between';
        subChoiceHeader.style.alignItems = 'center';
        subChoiceHeader.style.marginBottom = '5px';
        
        const subChoiceName = document.createElement('span');
        subChoiceName.style.fontWeight = 'bold';
        subChoiceName.style.color = Styling.persian.color;
        subChoiceName.style.fontFamily = Styling.persian.fontFamily;
        subChoiceName.style.fontSize = Styling.persian.fontSize;
        subChoiceName.textContent = subChoice.name;
        
        // Add "Always Active" badge for sub-choice if needed
        if (subChoice.isAlwaysActive) {
          const subAlwaysActiveBadge = document.createElement('span');
          subAlwaysActiveBadge.textContent = Translations.ui.alwaysActive;
          subAlwaysActiveBadge.style.fontSize = '9px';
          subAlwaysActiveBadge.style.padding = '1px 4px';
          subAlwaysActiveBadge.style.backgroundColor = '#4CAF50';
          subAlwaysActiveBadge.style.color = 'white';
          subAlwaysActiveBadge.style.borderRadius = '8px';
          subAlwaysActiveBadge.style.marginLeft = '6px';
          subAlwaysActiveBadge.style.fontFamily = Styling.persian.fontFamily;
          subChoiceName.appendChild(subAlwaysActiveBadge);
        }
        
        // Add subcategory toggle
        const subChoiceToggle = subChoice.toggle ? subChoice.toggle.cloneNode(true) : null;
        if (subChoiceToggle) {
          subChoiceToggle.style.cursor = 'pointer';
          
          // Disable if always active
          if (subChoice.isAlwaysActive) {
            subChoiceToggle.disabled = true;
            subChoiceToggle.checked = true;
          }
          
          // Add event listener for subcategory toggle
          subChoiceToggle.addEventListener('change', () => {
            // Check if all non-disabled subcategories are checked
            const allSubToggles = Array.from(subChoicesContainer.querySelectorAll('input[type="checkbox"]'))
              .filter(toggle => !toggle.disabled);
            const checkedSubToggles = allSubToggles.filter(toggle => toggle.checked);
            
            // Update main category toggle based on subcategory states
            // Only update if not all subcategories are always active AND main category has a toggle
            const hasNonAlwaysActiveSubcategories = allSubToggles.length > 0;
            if (hasNonAlwaysActiveSubcategories && toggleClone) {
              toggleClone.checked = allSubToggles.length === checkedSubToggles.length;
            }
          });
        }
        
        subChoiceHeader.appendChild(subChoiceName);
        if (subChoiceToggle) subChoiceHeader.appendChild(subChoiceToggle);
        
        // Add subcategory description
        const subChoiceDescription = document.createElement('div');
        subChoiceDescription.className = 'subcategory-description';
        subChoiceDescription.style.marginTop = '5px';
        subChoiceDescription.style.fontSize = '12px';
        subChoiceDescription.style.color = '#555';
        subChoiceDescription.style.fontFamily = Styling.persian.fontFamily;
        subChoiceDescription.innerHTML = subChoice.description;
        
        subChoiceItem.appendChild(subChoiceHeader);
        subChoiceItem.appendChild(subChoiceDescription);
        subChoicesContainer.appendChild(subChoiceItem);
      });
    }
    
    // Add click event to toggle description and sub-choices visibility (for all categories)
    header.addEventListener('click', (e) => {
      // For non-text-only categories, prevent toggle switch from triggering header click
      // For text-only categories, always allow toggling
      if (!isTextOnly && toggleClone && e.target === toggleClone) {
        return; // Don't toggle if clicking on the toggle switch of a non-text-only category
      }
      
      // Toggle visibility
      if (descriptionContainer.style.display === 'none') {
        descriptionContainer.style.display = 'block';
        subChoicesContainer.style.display = 'block';
        if (toggleIcon) {
          toggleIcon.textContent = '▲'; // Up arrow
          toggleIcon.style.transform = 'rotate(180deg)';
        }
      } else {
        descriptionContainer.style.display = 'none';
        subChoicesContainer.style.display = 'none';
        if (toggleIcon) {
          toggleIcon.textContent = '▼'; // Down arrow
          toggleIcon.style.transform = 'rotate(0deg)';
        }
      }
    });
    
    categoryItem.appendChild(header);
    categoryItem.appendChild(descriptionContainer);
    categoryItem.appendChild(subChoicesContainer);
    
    return categoryItem;
  },
  
  /**
   * Create simplified banner with prefetched customization content
   */
  createSimplifiedBanner(banner, buttons, bannerContent, customizationContent) {
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
      newBanner.setAttribute('aria-label', Translations.banner.title);
      newBanner.setAttribute('dir', 'rtl');
      
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
      newBanner.style.border = '1px solid #e0e0e0';
      newBanner.style.padding = '0'; // Remove padding from main container
      newBanner.style.zIndex = '9999999';
      newBanner.style.boxShadow = '0 10px 25px rgba(0,0,0,0.15)';
      newBanner.style.borderRadius = '12px';
      newBanner.style.fontFamily = Styling.persian.fontFamily;
      newBanner.style.display = 'flex';
      newBanner.style.flexDirection = 'column';
      
      // Add CSS for black text class and RTL support with Persian styling
      const style = document.createElement('style');
      style.textContent = `
        * {
          font-family: ${Styling.persian.fontFamily} !important;
          font-size: ${Styling.persian.fontSize} !important;
          color: ${Styling.persian.color} !important;
          line-height: ${Styling.persian.lineHeight} !important;
        }
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
          font-family: ${Styling.persian.fontFamily} !important;
          font-size: ${Styling.persian.fontSize} !important;
        }
        .rtl-text {
          direction: rtl;
          text-align: right;
          font-family: ${Styling.persian.fontFamily} !important;
          font-size: ${Styling.persian.fontSize} !important;
          color: ${Styling.persian.color} !important;
          line-height: ${Styling.persian.lineHeight} !important;
        }
        .rtl-toggle {
          margin-left: 10px;
          margin-right: 0;
        }
        .cookie-category-name {
          font-family: ${Styling.persian.fontFamily} !important;
          font-size: ${Styling.persian.fontSize} !important;
          color: ${Styling.persian.color} !important;
        }
        .cookie-category-description {
          margin-bottom: 10px;
          padding: 8px 12px;
          background-color: #f5f5f5;
          border-radius: 4px;
          font-family: ${Styling.persian.fontFamily} !important;
          font-size: ${Styling.persian.fontSize} !important;
          color: ${Styling.persian.color} !important;
          line-height: ${Styling.persian.lineHeight} !important;
          display: none;
        }
        .subcategory-description {
          margin-top: 5px;
          padding: 5px 10px;
          background-color: #f0f0f0;
          border-radius: 4px;
          font-size: 12px !important;
          color: #555 !important;
          font-family: ${Styling.persian.fontFamily} !important;
        }
        .action-buttons-row {
          display: flex;
          gap: 12px;
          margin-bottom: 12px;
        }
        .action-button {
          flex: 1;
          padding: 10px 16px;
          border-radius: 8px;
          border: none;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          font-family: ${Styling.persian.fontFamily} !important;
          font-size: ${Styling.persian.fontSize} !important;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .action-button:hover {
          opacity: 0.9;
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(0,0,0,0.15);
        }
        .action-button:active {
          transform: translateY(0);
          box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        }
        .accept-button {
          background-color: #66BB6A; /* Softer green */
          color: white;
        }
        .reject-button {
          background-color: #EF5350; /* Softer red */
          color: white;
        }
        .selection-button {
          background-color: #42A5F5; /* Softer blue */
          color: white;
          width: 100%;
          padding: 12px 16px;
        }
        .selection-button:hover {
          background-color: #1E88E5; /* Darker blue on hover */
        }
      `;
      newBanner.appendChild(style);
      
      // Header section with title and close button
      const header = document.createElement('div');
      header.style.padding = '20px 20px 15px 20px';
      header.style.display = 'flex';
      header.style.justifyContent = 'space-between';
      header.style.alignItems = 'center';
      header.style.borderBottom = '1px solid #f0f0f0';
      
      // Title
      const title = document.createElement('h3');
      title.textContent = Translations.banner.title;
      title.setAttribute('dir', 'rtl');
      title.style.margin = '0';
      title.style.fontSize = '18px';
      title.style.fontWeight = 'bold';
      title.style.fontFamily = Styling.persian.fontFamily;
      title.style.color = '#333';
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
      closeBtn.style.width = '32px';
      closeBtn.style.height = '32px';
      closeBtn.style.display = 'flex';
      closeBtn.style.alignItems = 'center';
      closeBtn.style.justifyContent = 'center';
      closeBtn.style.borderRadius = '50%';
      closeBtn.style.transition = 'background-color 0.2s';
      
      // Add hover effect for close button
      closeBtn.addEventListener('mouseenter', () => {
        closeBtn.style.backgroundColor = '#f0f0f0';
      });
      closeBtn.addEventListener('mouseleave', () => {
        closeBtn.style.backgroundColor = 'transparent';
      });
      
      // Add event listener for close button
      closeBtn.addEventListener('click', () => {
        log("[Cookie Simplifier] Closed simplified banner");
        
        // Set closing flag to prevent banner reprocessing
        ExtensionState.isClosing = true;
        
        // Remove our simplified banner
        newBanner.remove();
        
        // Reset closing flag after a short delay
        setTimeout(() => {
          ExtensionState.isClosing = false;
        }, 1000);
      });
      
      header.appendChild(closeBtn);
      newBanner.appendChild(header);
      
      // Content container with scrollable HTML content
      const contentContainer = document.createElement('div');
      contentContainer.style.padding = '15px 20px';
      contentContainer.style.overflowY = 'auto'; // Make content scrollable
      contentContainer.style.flexGrow = '1'; // Allow this section to grow and take available space
      contentContainer.style.backgroundColor = '#ffffff'; // Ensure white background
      
      // Use Persian description with proper styling
      const persianDescription = document.createElement('div');
      persianDescription.className = 'extracted-banner-content black-text rtl-text';
      persianDescription.style.color = Styling.persian.color;
      persianDescription.style.backgroundColor = '#ffffff';
      persianDescription.style.fontFamily = Styling.persian.fontFamily;
      persianDescription.style.fontSize = Styling.persian.fontSize;
      persianDescription.setAttribute('dir', 'rtl');
      persianDescription.style.marginBottom = '15px';
      persianDescription.innerHTML = `<p style="color: ${Styling.persian.color}; font-family: ${Styling.persian.fontFamily}; font-size: ${Styling.persian.fontSize};">${Translations.banner.description}</p>`;
      contentContainer.appendChild(persianDescription);
      
      // Add a separator between content and customization
      const separator = document.createElement('hr');
      separator.style.margin = '15px 0';
      separator.style.border = 'none';
      separator.style.borderTop = '1px solid #eee';
      contentContainer.appendChild(separator);
      
      // Add the prefetched customization content if it exists
      if (customizationContent) {    
        contentContainer.appendChild(customizationContent);
      }
      
      newBanner.appendChild(contentContainer);
      
      // Button container with improved layout
      const buttonContainer = document.createElement('div');
      buttonContainer.style.padding = '15px 20px 20px 20px';
      buttonContainer.style.backgroundColor = '#ffffff';
      buttonContainer.style.borderTop = '1px solid #f0f0f0';
      
      // Create a reference to the banner for use in button handlers
      const bannerRef = newBanner;
      
      // Create a row for Accept and Reject buttons
      const actionButtonsRow = document.createElement('div');
      actionButtonsRow.className = 'action-buttons-row';
      
      // Add Reject button - Use Persian text
      const rejectBtn = this.createActionButton(
        Translations.banner.rejectAll,
        '#EF5350', // Softer red
        () => this.handleRejectButton(buttons, bannerRef),
        'reject-button action-button'
      );
      
      // Add Accept button - Use Persian text
      const acceptBtn = this.createActionButton(
        Translations.banner.acceptAll,
        '#66BB6A', // Softer green
        () => this.handleAcceptButton(buttons, bannerRef),
        'accept-button action-button'
      );
      
      actionButtonsRow.appendChild(rejectBtn);
      actionButtonsRow.appendChild(acceptBtn);
      
      // Add Accept Selection button - Use Persian text (full width below)
      const acceptSelectionBtn = this.createActionButton(
        Translations.banner.acceptSelection,
        '#42A5F5', // Softer blue
        () => this.handleAcceptSelectionButton(bannerRef),
        'selection-button action-button'
      );
      
      buttonContainer.appendChild(actionButtonsRow);
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
      scrollIndicator.style.borderRadius = '0 0 12px 12px';
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
  },

  /**
   * Create action button with consistent styling
   * Updated with improved styling and CSS class support
   */
  createActionButton(text, backgroundColor, clickHandler, className = '') {
    const button = document.createElement('button');
    button.textContent = text;
    button.setAttribute('tabindex', '0');
    button.className = className;
    button.style.cursor = 'pointer';
    button.style.border = 'none';
    button.style.fontWeight = '600';
    
    // Add click handler
    button.addEventListener('click', clickHandler);
    
    // Add keyboard support
    button.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        clickHandler();
      }
    });
    
    return button;
  },
  
  /**
   * Handle accept button click
   */
  handleAcceptButton(buttons, banner) {
    log("[Cookie Simplifier] Accept All button clicked");
    
    // Find and click the original accept button
    const originalAcceptBtn = buttons.find(btn => btn.type === 'accept');
    if (originalAcceptBtn && !originalAcceptBtn.isVirtual) {
      try {
        const cookieBefore = document.cookie;
        
        // Store reference to our simplified banner
        const simplifiedBanner = banner;
        
        // Ensure the original button is still in the DOM
        if (!document.body.contains(originalAcceptBtn.element)) {
          log("[Cookie Simplifier] Original accept button not in DOM, reattaching temporarily");
          const tempContainer = document.createElement('div');
          tempContainer.style.display = 'none';
          tempContainer.appendChild(originalAcceptBtn.element);
          document.body.appendChild(tempContainer);
          
          // Execute click with a delay to ensure it's processed
          setTimeout(() => {
            originalAcceptBtn.element.click();
            tempContainer.remove();
            
            // Remove our simplified banner after a short delay
            setTimeout(() => {
              simplifiedBanner.remove();
            }, 300);
          }, 100);
        } else {
          // Execute click with a delay to ensure it's processed
          setTimeout(() => {
            originalAcceptBtn.element.click();
            
            // Remove our simplified banner after a short delay
            setTimeout(() => {
              simplifiedBanner.remove();
            }, 300);
          }, 100);
        }
        
        // Check if cookies were set
        setTimeout(() => {
          const cookieAfter = document.cookie;
          log(`[Cookie Simplifier] Cookie change check - Before: "${cookieBefore}", After: "${cookieAfter}"`);
          
          // If no cookies were set, try alternative approach
          if (cookieBefore === cookieAfter) {
            log("[Cookie Simplifier] No cookies were set, trying alternative approach");
            
            // Try to find and click the accept button in the original customization page
            if (ExtensionState.originalCustomizationPage) {
              const acceptAllBtn = ExtensionState.originalCustomizationPage.querySelector('.accept-all, .accept-btn, #accept-all, [aria-label*="accept all"]');
              if (acceptAllBtn) {
                acceptAllBtn.click();
                log("[Cookie Simplifier] Clicked accept all button in original customization page");
              }
            }
          }
          
          // After accepting, hide any overlays that might have appeared
          OverlayManager.hideOverlays();
        }, 500);
      } catch (error) {
        log(`[Cookie Simplifier] Error triggering accept button click: ${error.message}`);
        // Remove banner even if there's an error
        banner.remove();
      }
    } else {
      // If it's a virtual button or no button found, just remove our banner
      banner.remove();
    }
  },
  
  /**
   * Handle reject button click with improved logic
   */
  handleRejectButton(buttons, banner) {
    log("[Cookie Simplifier] Reject All button clicked");
    
    // Find and click the original reject button
    const originalRejectBtn = buttons.find(btn => btn.type === 'reject');
    if (originalRejectBtn && !originalRejectBtn.isVirtual) {
      try {
        const cookieBefore = document.cookie;
        
        // Store reference to our simplified banner
        const simplifiedBanner = banner;
        
        // Ensure the original button is still in the DOM
        if (!document.body.contains(originalRejectBtn.element)) {
          log("[Cookie Simplifier] Original reject button not in DOM, reattaching temporarily");
          const tempContainer = document.createElement('div');
          tempContainer.style.display = 'none';
          tempContainer.appendChild(originalRejectBtn.element);
          document.body.appendChild(tempContainer);
          
          // Execute click with a delay to ensure it's processed
          setTimeout(() => {
            originalRejectBtn.element.click();
            tempContainer.remove();
            
            // Remove our simplified banner after a short delay
            setTimeout(() => {
              simplifiedBanner.remove();
            }, 300);
          }, 100);
        } else {
          // Execute click with a delay to ensure it's processed
          setTimeout(() => {
            originalRejectBtn.element.click();
            
            // Remove our simplified banner after a short delay
            setTimeout(() => {
              simplifiedBanner.remove();
            }, 300);
          }, 100);
        }
        
        // Check if cookies were set
        setTimeout(() => {
          const cookieAfter = document.cookie;
          log(`[Cookie Simplifier] Cookie change check - Before: "${cookieBefore}", After: "${cookieAfter}"`);
          
          // If no cookies were set, try alternative approach
          if (cookieBefore === cookieAfter) {
            log("[Cookie Simplifier] No cookies were set, trying alternative approach");
            
            // Try to find and click the reject button in the original customization page
            if (ExtensionState.originalCustomizationPage) {
              const rejectAllBtn = ExtensionState.originalCustomizationPage.querySelector('.reject-all, .reject-btn, #reject-all, [aria-label*="reject all"]');
              if (rejectAllBtn) {
                rejectAllBtn.click();
                log("[Cookie Simplifier] Clicked reject all button in original customization page");
              }
            }
          }
          
          // After rejecting, hide any overlays that might have appeared
          OverlayManager.hideOverlays();
        }, 500);
      } catch (error) {
        log(`[Cookie Simplifier] Error triggering reject button click: ${error.message}`);
        // Remove banner even if there's an error
        banner.remove();
      }
    } else {
      // Virtual reject: uncheck all non-disabled toggles in our UI
      const allOurToggles = banner.querySelectorAll('input[type="checkbox"]');
      allOurToggles.forEach(t => {
        if (!t.disabled) {
          t.checked = false;
        }
      });
      
      // Then handle as accept selection (sync and save)
      this.handleAcceptSelectionButton(banner);
    }
  },

  /**
   * Handle accept selection button click
   * Updated to use data-original-name for syncing
   */
  handleAcceptSelectionButton(banner) {
    log("[Cookie Simplifier] Accept Selection button clicked");
    
    // First, try to use the captured request data if available
    if (ExtensionState.customizationRequestData) {
      log("[Cookie Simplifier] Using captured request data from customize button");
      
      // Create updated data based on user selections
      const updatedData = {};
      
      // Get all category toggles in our simplified banner
      const categoryToggles = banner.querySelectorAll('.cookie-category-header input[type="checkbox"]');
      
      // Build a representation of user selections
      const userSelections = {};
      categoryToggles.forEach(toggle => {
        const categoryItem = toggle.closest('.cookie-category-item');
        const originalName = categoryItem.getAttribute('data-original-name');
        
        // Store user selection
        userSelections[originalName] = toggle.checked;
        
        // Map category names to form field names (this will need to be customized per website)
        if (originalName.includes('Analytics')) {
          updatedData['analytics'] = toggle.checked ? '1' : '0';
          updatedData['C0003'] = toggle.checked ? '1' : '0'; // OneTrust common ID
        } else if (originalName.includes('Targeting') || originalName.includes('Advertising')) {
          updatedData['advertising'] = toggle.checked ? '1' : '0';
          updatedData['C0004'] = toggle.checked ? '1' : '0'; // OneTrust common ID
        } else if (originalName.includes('Functional') || originalName.includes('Performance')) {
          updatedData['functional'] = toggle.checked ? '1' : '0';
          updatedData['C0002'] = toggle.checked ? '1' : '0'; // OneTrust common ID
        } else if (originalName.includes('Necessary') || originalName.includes('Essential')) {
          // Necessary cookies should always be enabled
          updatedData['necessary'] = '1';
          updatedData['C0001'] = '1';
        }
      });
      
      log("[Cookie Simplifier] User selections:", userSelections);
      
      // Send the request with updated data
      if (sendCapturedRequest(ExtensionState.customizationRequestData, updatedData)) {
        log("[Cookie Simplifier] Successfully sent request with updated data");
        // Remove our banner after a short delay
        setTimeout(() => {
          banner.remove();
        }, 300);
        return;
      }
    }
    
    // If we have form submission data, use that
    if (ExtensionState.formSubmissionData) {
      log("[Cookie Simplifier] Using captured form data");
      
      // Create a new FormData object to modify the values
      const modifiedFormData = new FormData();
      
      // Copy all form data but modify the values based on user selection
      const { formData, actionUrl } = ExtensionState.formSubmissionData;
      
      // Get the current groups value
      const groupsValue = formData.get('groups');
      
      // Parse the groups value to modify it according to user selections
      if (groupsValue) {
        // Start with only the necessary cookies (C0001) which should always be enabled
        let newGroupsValue = 'C0001:1';
        
        // Add other categories based on user selection
        const categoryToggles = banner.querySelectorAll('.cookie-category-header input[type="checkbox"]');
        
        categoryToggles.forEach(toggle => {
          if (!toggle.disabled && toggle.checked) {
            const categoryItem = toggle.closest('.cookie-category-item');
            const originalName = categoryItem.getAttribute('data-original-name');
            
            // Map category names to OneTrust group IDs (adjust based on common mappings)
            if (originalName.includes('Analytics')) {
              newGroupsValue += ',C0003:1';
            } else if (originalName.includes('Targeting') || originalName.includes('Advertising')) {
              newGroupsValue += ',C0004:1';
            } else if (originalName.includes('Functional') || originalName.includes('Performance')) {
              newGroupsValue += ',C0002:1';
            }
          }
        });
        
        // Set the modified groups value
        modifiedFormData.set('groups', newGroupsValue);
        
        // Copy all other form data
        for (const [key, value] of formData.entries()) {
          if (key !== 'groups') {
            modifiedFormData.set(key, value);
          }
        }
        
        // Submit the modified form data
        if (submitFormData(modifiedFormData, actionUrl)) {
          log("[Cookie Simplifier] Modified form submitted successfully");
          // Remove our banner after a short delay
          setTimeout(() => {
            banner.remove();
          }, 300);
          return;
        }
      }
    }
    
    // Fallback: synchronize the toggle states from our simplified banner to the original customization page
    if (ExtensionState.originalCustomizationPage) {
      try {
        // Find all category toggles in our simplified banner
        const categoryToggles = banner.querySelectorAll('.cookie-category-header input[type="checkbox"]');
        
        // Synchronize category toggles
        categoryToggles.forEach(toggle => {
          const categoryItem = toggle.closest('.cookie-category-item');
          const originalName = categoryItem.getAttribute('data-original-name');
          const toggleId = categoryItem.getAttribute('data-toggle-id');
          const toggleName = categoryItem.getAttribute('data-toggle-name');
          
          let originalToggle = null;
          
          if (toggleId && toggleId !== '') {
            originalToggle = document.getElementById(toggleId);
          } else if (toggleName && toggleName !== '') {
            originalToggle = document.querySelector(`input[name="${toggleName}"]`);
          } 
          
          if (!originalToggle) {
            // Fallback to searching by title
            const originalCategories = ExtensionState.originalCustomizationPage.querySelectorAll('.ot-cat-item, .category-item, [class*="category"]');
            
            for (const originalCategory of originalCategories) {
              const originalTitleElem = originalCategory.querySelector('h3, h4, h5, .title, .category-title, [class*="title"]');
              const titleText = originalTitleElem ? originalTitleElem.textContent.trim() : '';
              
              if (titleText === originalName) {
                originalToggle = originalCategory.querySelector('input[type="checkbox"], input[type="radio"], .toggle, .switch');
                if (originalToggle) break;
              }
            }
          }
          
          if (originalToggle) {
            if (!originalToggle.disabled) {
              originalToggle.checked = toggle.checked;
              log(`[Cookie Simplifier] Synchronized category toggle for ${originalName} to ${toggle.checked}`);
            } else {
              log(`[Cookie Simplifier] Skipping disabled toggle for category: ${originalName}`);
            }
          } else {
            log(`[Cookie Simplifier] Could not find original toggle for category: ${originalName}`);
          }
        });
        
        // Also synchronize subcategories
        const subCategoryToggles = banner.querySelectorAll('.cookie-sub-choices input[type="checkbox"]');
        
        subCategoryToggles.forEach(toggle => {
          const subItem = toggle.closest('div'); // The sub-choice div
          if (subItem) {
            const originalSubName = subItem.getAttribute('data-original-name');
            const toggleId = subItem.getAttribute('data-toggle-id');
            const toggleName = subItem.getAttribute('data-toggle-name');
            
            let originalToggle = null;
            
            if (toggleId && toggleId !== '') {
              originalToggle = document.getElementById(toggleId);
            } else if (toggleName && toggleName !== '') {
              originalToggle = document.querySelector(`input[name="${toggleName}"]`);
            } 
            
            if (!originalToggle) {
              // Fallback to searching by title
              const originalSubCategories = ExtensionState.originalCustomizationPage.querySelectorAll('.ot-subgrp, .subcategory, [class*="sub-cat"], .ot-sub-item');
              
              for (const originalSub of originalSubCategories) {
                const originalTitleElem = originalSub.querySelector('h4, h5, h6, .subtitle, [class*="title"]');
                const titleText = originalTitleElem ? originalTitleElem.textContent.trim() : '';
                
                if (titleText === originalSubName) {
                  originalToggle = originalSub.querySelector('input[type="checkbox"], input[type="radio"], .toggle, .switch');
                  if (originalToggle) break;
                }
              }
            }
            
            if (originalToggle) {
              if (!originalToggle.disabled) {
                originalToggle.checked = toggle.checked;
                log(`[Cookie Simplifier] Synchronized subcategory toggle for ${originalSubName} to ${toggle.checked}`);
              } else {
                log(`[Cookie Simplifier] Skipping disabled toggle for subcategory: ${originalSubName}`);
              }
            } else {
              log(`[Cookie Simplifier] Could not find original toggle for subcategory: ${originalSubName}`);
            }
          }
        });
        
        // Make the original customization page visible temporarily
        const originalDisplay = ExtensionState.originalCustomizationPage.style.display;
        ExtensionState.originalCustomizationPage.style.display = 'block';
        
        // Now find and click the save button in the original customization page
        let saveButton = null;
        for (const selector of Selectors.saveButtons) {
          saveButton = ExtensionState.originalCustomizationPage.querySelector(selector);
          if (saveButton) break;
        }
        
        if (saveButton) {
          log("[Cookie Simplifier] Found save button using selectors, clicking it");
          saveButton.click();
        } else {
          // Try alternative save button selectors
          const altSaveButtons = ExtensionState.originalCustomizationPage.querySelectorAll('button');
          let saveBtnFound = false;
          const possibleTexts = ['save', 'confirm', 'submit', 'apply', 'ok'];
          
          for (const text of possibleTexts) {
            for (const btn of altSaveButtons) {
              const btnText = btn.textContent.toLowerCase();
              if (btnText.includes(text)) {
                log(`[Cookie Simplifier] Found alternative save button with text '${btn.textContent}', clicking it`);
                btn.click();
                saveBtnFound = true;
                break;
              }
            }
            if (saveBtnFound) break;
          }
          
          if (!saveBtnFound) {
            log("[Cookie Simplifier] No save button found");
          }
        }
        
        // Hide the original customization page again after a short delay
        setTimeout(() => {
          ExtensionState.originalCustomizationPage.style.display = originalDisplay;
          
          // Hide any overlays that might have appeared
          OverlayManager.hideOverlays();
          
          // Remove our banner
          banner.remove();
        }, 500);
      } catch (error) {
        log(`[Cookie Simplifier] Error synchronizing toggle states: ${error.message}`);
        banner.remove();
      }
    } else {
      log("[Cookie Simplifier] No original customization page found");
      banner.remove();
    }
  }
};
// ========================
// BANNER MANAGEMENT MODULE
// ========================
const BannerManager = {
  /**
   * Hide the original banner by removing it from the DOM
   */
  hideBanner(banner) {
    if (!banner) {
      log("[Cookie Simplifier] No banner to hide");
      return;
    }
    
    try {
      // Store reference to the original banner before removal
      ExtensionState.originalBanner = banner;
      
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
      ExtensionState.originalBanners.set(banner, bannerInfo);
      
      // Completely remove the banner from the DOM
      if (banner.parentNode) {
        banner.parentNode.removeChild(banner);
        log("[Cookie Simplifier] Banner completely removed from DOM");
      }
    } catch (error) {
      log(`[Cookie Simplifier] Error removing banner: ${error.message}`);
    }
  },
  
  /**
   * Function to restore the original banner
   */
  restoreOriginalBanner() {
    log("[Cookie Simplifier] Restoring original banner");
    
    if (ExtensionState.originalBanner && ExtensionState.originalBanners.has(ExtensionState.originalBanner)) {
      try {
        const bannerInfo = ExtensionState.originalBanners.get(ExtensionState.originalBanner);
        
        if (bannerInfo.parent && !document.body.contains(ExtensionState.originalBanner)) {
          if (bannerInfo.nextSibling && bannerInfo.nextSibling.parentNode === bannerInfo.parent) {
            bannerInfo.parent.insertBefore(ExtensionState.originalBanner, bannerInfo.nextSibling);
          } else {
            bannerInfo.parent.appendChild(ExtensionState.originalBanner);
          }
          log("[Cookie Simplifier] Restored original banner to DOM");
          
          // Remove from the map so we don't restore it again
          ExtensionState.originalBanners.delete(ExtensionState.originalBanner);
        }
      } catch (error) {
        log(`[Cookie Simplifier] Error restoring original banner: ${error.message}`);
      }
    }
    
    // Also restore any overlays that were hidden
    OverlayManager.restoreOverlays();
  },
  
  /**
   * Function to remove any existing simplified banners
   */
  removeExistingBanners() {
    const existingBanner = document.getElementById('simplified-cookie-banner');
    if (existingBanner) {
      existingBanner.remove();
      log("[Cookie Simplifier] Removed existing simplified banner");
    }
    
    // Also ensure any original banners that were hidden are completely removed
    ExtensionState.originalBanners.forEach((bannerInfo, banner) => {
      if (banner !== ExtensionState.originalCustomizationPage && banner.parentNode) {
        banner.parentNode.removeChild(banner);
        log("[Cookie Simplifier] Completely removed original banner from DOM");
      }
    });
  }
};
// ========================
// OVERLAY MANAGEMENT MODULE
// ========================
const OverlayManager = {
  /**
   * Enhanced function to remove overlays completely
   */
  hideOverlays() {
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
      ExtensionState.originalBanners.set(oneTrustOverlay, overlayInfo);
      
      if (oneTrustOverlay.parentNode) {
        oneTrustOverlay.parentNode.removeChild(oneTrustOverlay);
        log("[Cookie Simplifier] Removed OneTrust overlay from DOM");
      }
    }
    
    // Remove other overlays
    Selectors.overlays.forEach(selector => {
      const overlays = document.querySelectorAll(selector);
      overlays.forEach(overlay => {
        // Skip if this is the original customization page
        if (overlay === ExtensionState.originalCustomizationPage) {
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
          ExtensionState.originalBanners.set(overlay, overlayInfo);
          
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
        ExtensionState.originalBanners.set(element, overlayInfo);
        
        element.parentNode.removeChild(element);
        log("[Cookie Simplifier] Removed problematic overlay element");
      }
    });
  },
  
  /**
   * Function to restore overlays (but NOT the original customization page or original banner)
   */
  restoreOverlays() {
    log("[Cookie Simplifier] Restoring overlays");
    
    ExtensionState.originalBanners.forEach((bannerInfo, banner) => {
      // Skip restoring the original customization page and original banner
      if (banner === ExtensionState.originalCustomizationPage || banner === ExtensionState.originalBanner) {
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
};
// ========================
// OBSERVER MODULE
// ========================
const ObserverManager = {
  /**
   * Set up MutationObserver to detect dynamically added banners
   */
  setupObserver() {
    if (!ExtensionState.enabled) {
      log("[Cookie Simplifier] Extension is disabled, skipping observer setup");
      return;
    }
    
    log("[Cookie Simplifier] Setting up MutationObserver");
    
    if (ExtensionState.observer) {
      ExtensionState.observer.disconnect();
      log("[Cookie Simplifier] Disconnected existing observer");
    }
    
    ExtensionState.observer = new MutationObserver(mutations => {
      const now = Date.now();
      if (now - ExtensionState.lastProcessed < 1000) { // Throttle to 1s
        log("[Cookie Simplifier] Mutation observed but throttled, skipping");
        return;
      }
      ExtensionState.lastProcessed = now;
      
      if (ExtensionState.isProcessing || ExtensionState.isClosing) {
        log("[Cookie Simplifier] Mutation observed but already processing or closing, skipping");
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
            for (const selector of Selectors.onetrustBanner) {
              let element = null;
              if (node.matches && node.matches(selector)) {
                element = node;
              } else if (node.querySelector && node.querySelector(selector)) {
                element = node.querySelector(selector);
              }
              if (element && isElementVisibleToUser(element) && !BannerDetector.shouldExclude(element)) {
                log(`[Cookie Simplifier] OneTrust banner detected via observer: ${selector}`);
                this.handleCookieBanners();
                return;
              }
            }
            
            // Check if it's a general banner but not a false positive
            for (const selector of Selectors.generalBanner) {
              let element = null;
              if (node.matches && node.matches(selector)) {
                element = node;
              } else if (node.querySelector && node.querySelector(selector)) {
                element = node.querySelector(selector);
              }
              if (element && isElementVisibleToUser(element) && !BannerDetector.shouldExclude(element)) {
                log(`[Cookie Simplifier] General banner detected via observer: ${selector}`);
                this.handleCookieBanners();
                return;
              }
            }
          }
        }
        
        // Also check for overlays that might be added
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            for (const selector of Selectors.overlays) {
              let element = null;
              if (node.matches && node.matches(selector)) {
                element = node;
              } else if (node.querySelector && node.querySelector(selector)) {
                element = node.querySelector(selector);
              }
              if (element && isElementVisibleToUser(element)) {
                log(`[Cookie Simplifier] Overlay detected via observer: ${selector}`);
                OverlayManager.hideOverlays();
                return;
              }
            }
          }
        }
      }
    });
    
    ExtensionState.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false
    });
    
    log("[Cookie Simplifier] MutationObserver set up");
  },
  
  /**
   * Main function to handle cookie banners
   */
  async handleCookieBanners() {
    if (ExtensionState.isProcessing || ExtensionState.isClosing) {
      log("[Cookie Simplifier] Already processing or closing, skipping");
      return;
    }
    
    if (!ExtensionState.enabled) {
      log("[Cookie Simplifier] Extension is disabled, skipping banner handling");
      return;
    }
    
    ExtensionState.isProcessing = true;
    log("[Cookie Simplifier] Handling cookie banners...");
    
    try {
      const banner = BannerDetector.findBanner();
      if (!banner) {
        log("[Cookie Simplifier] No banner found to handle");
        return;
      }
      
      const bannerContent = ContentExtractor.extractBannerContent(banner);
      const buttons = BannerDetector.extractButtons(banner);
      
      if (buttons.length === 0) {
        log("[Cookie Simplifier] No buttons found in banner");
        return;
      }
      
      // Find the customize button
      const customizeButton = buttons.find(btn => btn.type === 'customize')?.element || null;
      
      // Prefetch customization content only if the banner is visible
      log("[Cookie Simplifier] Prefetching customization content");
      let customizationContent = null;
      
      try {
        // Use a timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), 15000); // 15 seconds timeout
        });
        
        // Pass the customize button directly instead of the banner
        customizationContent = await Promise.race([
          ContentExtractor.extractCustomizationContent(customizeButton),
          timeoutPromise
        ]);
        
        if (customizationContent) {
          log("[Cookie Simplifier] Customization content prefetched successfully");
        } else {
          log("[Cookie Simplifier] No customization content found");
        }
      } catch (error) {
        log(`[Cookie Simplifier] Error prefetching customization content: ${error.message}`);
        customizationContent = null;
      }
      
      // Completely remove the original banner and overlays
      BannerManager.hideBanner(banner);
      OverlayManager.hideOverlays();
      
      const simplifiedBanner = UIComponents.createSimplifiedBanner(banner, buttons, bannerContent, customizationContent);
      if (simplifiedBanner) {
        document.body.appendChild(simplifiedBanner);
        log("[Cookie Simplifier] Simplified banner added to page");
        
      } else {
        log("[Cookie Simplifier] Failed to create simplified banner");
      }
    } catch (error) {
      log(`[Cookie Simplifier] Error handling banners: ${error.message}`);
    } finally {
      setTimeout(() => {
        ExtensionState.isProcessing = false;
        log("[Cookie Simplifier] Processing complete");
      }, 1000);
    }
  }
};
// ========================
// INITIALIZATION MODULE
// ========================
const Initializer = {
  /**
   * Initialize the extension
   */
  init() {
    log("[Cookie Simplifier] Initializing extension");
    
    getSettings((settings) => {
      if (settings.enabled === false) {
        log("[Cookie Simplifier] Extension is disabled, skipping initialization");
        return;
      }
      
      if (document.readyState === 'complete') {
        log("[Cookie Simplifier] Document already loaded");
        setTimeout(() => {
          ObserverManager.handleCookieBanners();
          ObserverManager.setupObserver();
        }, 1000);
      } else {
        log("[Cookie Simplifier] Waiting for document to load");
        window.addEventListener('load', () => {
          log("[Cookie Simplifier] Document loaded");
          setTimeout(() => {
            ObserverManager.handleCookieBanners();
            ObserverManager.setupObserver();
          }, 1000);
        });
      }
    });
  },
  
  /**
   * Listen for settings changes
   */
  setupSettingsListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === "settingsChanged") {
        log("[Cookie Simplifier] Settings changed, updating extension state");
        
        ExtensionState.enabled = message.settings.enabled;
        ExtensionState.debugMode = message.settings.debugMode;
        
        if (ExtensionState.enabled) {
          log("[Cookie Simplifier] Extension enabled, checking for banners");
          ObserverManager.handleCookieBanners();
          ObserverManager.setupObserver();
        } else {
          log("[Cookie Simplifier] Extension disabled, removing simplified banner and restoring original");
          BannerManager.removeExistingBanners();
          BannerManager.restoreOriginalBanner();
          
          if (ExtensionState.observer) {
            ExtensionState.observer.disconnect();
            ExtensionState.observer = null;
          }
        }
        sendResponse({ success: true });
      }
      
      return true;
    });
  }
};
// Initialize the extension
Initializer.init();
Initializer.setupSettingsListener();