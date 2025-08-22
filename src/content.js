console.log("[Cookie Simplifier] Content script loaded");
// Global variables to track extension state
let extensionEnabled = true;
let debugMode = true;
let isProcessing = false; // Flag to prevent re-entrancy
let observer = null; // Reference to our observer
let originalBanners = new Map(); // Track original banners we've hidden
let lastProcessed = 0; // For MutationObserver throttling
let customizationView = null; // Track if we're showing customization view
let prefetchedCustomizationContent = null; // Store prefetched customization content
let originalCustomizationPage = null; // Reference to original customization page
// OneTrust-specific selectors
const ONETRUST_SELECTORS = [
  '#onetrust-banner-sdk', // Main OneTrust banner
  '#onetrust-consent-sdk', // OneTrust container
  '#onetrust-group-container', // OneTrust group container
  '#onetrust-policy', // OneTrust policy section
  '.onetrust-banner-sdk', // Alternative class name
  '#ot-sdk-container',
];
// General cookie banner selectors
const GENERAL_BANNER_SELECTORS = [
  '[id*="cookie"]',
  '[class*="cookie"]',
  '[id*="consent"]',
  '[class*="consent"]',
  '[id*="gdpr"]',
  '[class*="gdpr"]',
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
  '[data-cmp-host]'
];
// Elements to exclude (common false positives)
const EXCLUDE_SELECTORS = [
  '[aria-modal="true"][role="dialog"]:not([aria-label*="cookie"])',
  '[role="dialog"]:not([aria-label*="cookie"]):not([aria-label*="consent"]):not([aria-label*="privacy"])',
  '.signin-dialog',
  '.login-dialog',
  '.auth-dialog',
  '.modal-backdrop:not(.cookie)',
  '.g-signin2',
  '[data-testid*="signin"]',
  '[data-testid*="login"]',
  '[id*="signin"]',
  '[id*="login"]',
  '[class*="signin"]',
  '[class*="login"]'
];
// Overlay selectors for dark filters and backdrops
const OVERLAY_SELECTORS = [
  '.onetrust-pc-dark-filter',  // OneTrust dark overlay
  '.ot-sdk-overlay',          // OneTrust overlay
  '.cookie-modal-backdrop',   // Generic cookie modal backdrop
  '[class*="modal-backdrop"]' // Any modal backdrop
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
  '.consent-content'
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
  accept: ['accept', 'agree', 'allow', 'ok', 'confirm', 'got it', 'understand'],
  reject: ['reject', 'decline', 'deny', 'disagree', 'no thanks', 'opt out'],
  customize: ['customize', 'settings', 'preferences', 'manage', 'options']
};
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
  
  for (const selector of GENERAL_BANNER_SELECTORS) {
    const elements = document.querySelectorAll(selector);
    log(`[Cookie Simplifier] Found ${elements.length} elements for general selector: ${selector}`);
    
    for (const element of elements) {
      if (originalBanners.has(element)) {
        log("[Cookie Simplifier] Skipping already processed banner: " + (element.id || element.tagName));
        continue;
      }
      
      // Use the new visibility check
      if (isElementVisibleToUser(element) && !shouldExclude(element)) {
        log(`[Cookie Simplifier] Found visible banner with selector: ${selector}, ID: ${element.id || 'none'}, Class: ${element.className}`);
        return element;
      }
    }
  }
  
  // Heuristic check for elements with cookie-related text or styling
  const allElements = document.querySelectorAll('div, section, aside, dialog');
  log(`[Cookie Simplifier] Checking ${allElements.length} elements for heuristic match`);
  
  for (const element of allElements) {
    if (originalBanners.has(element) || shouldExclude(element)) continue;
    
    // Use the new visibility check
    if (isElementVisibleToUser(element)) {
      const text = element.textContent.toLowerCase();
      if (text.includes('cookie') || text.includes('consent') || text.includes('gdpr') || text.includes('privacy')) {
        // Check if it has any of our banner selectors
        for (const selector of BANNER_SELECTORS) {
          if (element.matches(selector) || element.querySelector(selector)) {
            log(`[Cookie Simplifier] Found banner via heuristic and selector: ${selector}, ID: ${element.id || 'none'}`);
            return element;
          }
        }
        
        // Additional check for fixed position or high z-index
        if (element.style.position === 'fixed' || parseInt(element.style.zIndex) > 1000) {
          log(`[Cookie Simplifier] Found banner via heuristic (text and styling), ID: ${element.id || 'none'}`);
          return element;
        }
      }
    }
  }
  
  log("[Cookie Simplifier] No cookie banner found");
  return null;
}

// Extract HTML content from OneTrust banner
function extractOneTrustContent(banner) {
  log("[Cookie Simplifier] Extracting OneTrust banner HTML content...");
  
  try {
    // Create a container for the extracted content
    const contentContainer = document.createElement('div');
    contentContainer.className = 'extracted-banner-content black-text';
    
    // Get the main policy section - this contains the primary content
    const policySection = banner.querySelector('#onetrust-policy');
    if (policySection) {
      const policyClone = policySection.cloneNode(true);
      contentContainer.appendChild(policyClone);
      log("[Cookie Simplifier] Added policy section");
    }
    
    // Only add additional description if it's not already included in the policy section
    const addlDesc = banner.querySelector('.ot-b-addl-desc');
    if (addlDesc && !policySection?.contains(addlDesc)) {
      const addlDescClone = addlDesc.cloneNode(true);
      contentContainer.appendChild(addlDescClone);
      log("[Cookie Simplifier] Added additional description");
    }
    
    // Only add data processing description if it's not already included
    const dpdContainer = banner.querySelector('.ot-dpd-container');
    if (dpdContainer && !policySection?.contains(dpdContainer) && !addlDesc?.contains(dpdContainer)) {
      const dpdClone = dpdContainer.cloneNode(true);
      contentContainer.appendChild(dpdClone);
      log("[Cookie Simplifier] Added data processing container");
    }
    
    // If we couldn't find specific sections, clone the entire banner (excluding buttons)
    if (contentContainer.children.length === 0) {
      const bannerClone = banner.cloneNode(true);
      
      // Remove button sections
      const buttonSections = bannerClone.querySelectorAll('#onetrust-button-group-parent, #onetrust-button-group, #onetrust-close-btn-container');
      buttonSections.forEach(section => section.remove());
      
      // Remove individual buttons that might be outside button sections
      const buttons = bannerClone.querySelectorAll('button');
      buttons.forEach(button => {
        // Only remove buttons that are not part of the content
        if (!button.closest('.ot-dpd-content') && !button.closest('.ot-b-addl-desc')) {
          button.remove();
        }
      });
      
      contentContainer.appendChild(bannerClone);
      log("[Cookie Simplifier] Added cloned banner with buttons removed");
    }
    
    // Process links to ensure they work properly
    const links = contentContainer.querySelectorAll('a');
    links.forEach(link => {
      // Add event listener to links
      link.addEventListener('click', (e) => {
        e.preventDefault();
        log(`[Cookie Simplifier] Link clicked: ${link.textContent.trim()}, href: ${link.href}`);
        // Open in new tab
        window.open(link.href, '_blank');
      });
      
      // Make links look clickable
      link.style.color = '#2196F3';
      link.style.textDecoration = 'underline';
      link.style.cursor = 'pointer';
    });
    
    // Process images to ensure they load properly
    const images = contentContainer.querySelectorAll('img');
    images.forEach(img => {
      // Ensure images have the correct source
      if (!img.src && img.getAttribute('data-src')) {
        img.src = img.getAttribute('data-src');
      }
      
      // Add error handling
      img.addEventListener('error', () => {
        log(`[Cookie Simplifier] Failed to load image: ${img.src || img.getAttribute('data-src')}`);
      });
    });
    
    // Make all text elements black
    const textElements = contentContainer.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, div, li, td, th');
    textElements.forEach(element => {
      element.style.color = '#000000';
    });
    
    log(`[Cookie Simplifier] Extracted OneTrust content with ${contentContainer.children.length} sections`);
    return contentContainer;
  } catch (error) {
    log(`[Cookie Simplifier] Error extracting OneTrust content: ${error.message}`);
    return createFallbackContent();
  }
}
// Extract HTML content from banner
function extractBannerContent(banner) {
  log("[Cookie Simplifier] Extracting banner HTML content...");
  
  // Check if it's a OneTrust banner
  if (banner.id === 'onetrust-banner-sdk' || banner.id === 'onetrust-consent-sdk' || 
      banner.classList.contains('onetrust-banner-sdk') || banner.querySelector('#onetrust-banner-sdk')) {
    return extractOneTrustContent(banner);
  }
  
  try {
    // Create a container for the extracted content
    const contentContainer = document.createElement('div');
    contentContainer.className = 'extracted-banner-content black-text';
    
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
      
      // Remove buttons and interactive elements
      const interactiveElements = bannerClone.querySelectorAll('button, [role="button"], input, select, textarea');
      interactiveElements.forEach(element => element.remove());
      
      contentContainer.appendChild(bannerClone);
      log("[Cookie Simplifier] Added cloned banner with interactive elements removed");
    }
    
    // Process links to ensure they work properly
    const links = contentContainer.querySelectorAll('a');
    links.forEach(link => {
      // Add event listener to links
      link.addEventListener('click', (e) => {
        e.preventDefault();
        log(`[Cookie Simplifier] Link clicked: ${link.textContent.trim()}, href: ${link.href}`);
        // Open in new tab
        window.open(link.href, '_blank');
      });
      
      // Make links look clickable
      link.style.color = '#2196F3';
      link.style.textDecoration = 'underline';
      link.style.cursor = 'pointer';
    });
    
    // Process images to ensure they load properly
    const images = contentContainer.querySelectorAll('img');
    images.forEach(img => {
      // Ensure images have the correct source
      if (!img.src && img.getAttribute('data-src')) {
        img.src = img.getAttribute('data-src');
      }
      
      // Add error handling
      img.addEventListener('error', () => {
        log(`[Cookie Simplifier] Failed to load image: ${img.src || img.getAttribute('data-src')}`);
      });
    });
    
    // Make all text elements black
    const textElements = contentContainer.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, div, li, td, th');
    textElements.forEach(element => {
      element.style.color = '#000000';
    });
    
    log(`[Cookie Simplifier] Extracted banner content with ${contentContainer.children.length} sections`);
    return contentContainer;
  } catch (error) {
    log(`[Cookie Simplifier] Error extracting banner content: ${error.message}`);
    return createFallbackContent();
  }
}
// Create fallback content if extraction fails
function createFallbackContent() {
  const fallback = document.createElement('div');
  fallback.className = 'extracted-banner-content black-text';
  fallback.style.color = '#000000';
  fallback.innerHTML = `
    <p style="color: #000000;">This website uses cookies to enhance your experience. By continuing to use this site, you agree to our use of cookies.</p>
    <p style="color: #000000;">For more information, please review the website's privacy policy.</p>
  `;
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
    const clickableElements = banner.querySelectorAll('button, a[role="button"], [role="button"], div[onclick], [data-consent], [data-cmp]');
    log(`[Cookie Simplifier] Found ${clickableElements.length} clickable elements`);
    
    clickableElements.forEach(element => {
      const text = element.textContent.trim().toLowerCase();
      
      // Skip close buttons explicitly
      if (text === '✕' || text.includes('close') || text.includes('dismiss') || element.closest('#onetrust-close-btn-container')) {
        log(`[Cookie Simplifier] Skipping close button with text: "${text}"`);
        return;
      }
      
      log(`[Cookie Simplifier] Processing button with text: "${text}"`);
      
      for (const [type, keywords] of Object.entries(buttonKeywords)) {
        if (keywords.some(keyword => text.includes(keyword))) {
          buttons.push({ 
            type, 
            element, 
            text: element.textContent.trim() || type.charAt(0).toUpperCase() + type.slice(1) 
          });
          log(`[Cookie Simplifier] Identified as ${type.toUpperCase()} button`);
          break;
        }
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
// Create an accordion category item with sub-choices
function createAccordionCategory(categoryName, description, toggleElement, isAlwaysActive = false, subChoices = []) {
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
  categoryNameElement.textContent = categoryName;
  categoryNameElement.style.fontWeight = 'bold';
  categoryNameElement.style.color = '#000000';
  categoryNameElement.style.marginRight = '10px';
  
  // Add "Always Active" badge if needed
  if (isAlwaysActive) {
    const alwaysActiveBadge = document.createElement('span');
    alwaysActiveBadge.textContent = 'Always Active';
    alwaysActiveBadge.style.fontSize = '10px';
    alwaysActiveBadge.style.padding = '2px 6px';
    alwaysActiveBadge.style.backgroundColor = '#4CAF50';
    alwaysActiveBadge.style.color = 'white';
    alwaysActiveBadge.style.borderRadius = '10px';
    alwaysActiveBadge.style.marginLeft = '8px';
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
  
  // Category description (initially hidden)
  const descriptionContainer = document.createElement('div');
  descriptionContainer.className = 'cookie-category-description';
  descriptionContainer.style.padding = '0 12px 12px 12px';
  descriptionContainer.style.backgroundColor = '#ffffff';
  descriptionContainer.style.color = '#000000';
  descriptionContainer.style.display = 'none'; // Initially hidden
  descriptionContainer.innerHTML = description || 'No description available.';
  
  // Sub-choices container (initially hidden)
  const subChoicesContainer = document.createElement('div');
  subChoicesContainer.className = 'cookie-sub-choices';
  subChoicesContainer.style.padding = '0 12px 12px 24px'; // Indent sub-choices
  subChoicesContainer.style.backgroundColor = '#ffffff';
  subChoicesContainer.style.display = 'none'; // Initially hidden
  
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
      subChoiceName.style.color = '#000000';
      subChoiceName.textContent = subChoice.name;
      
      const subChoiceToggle = subChoice.toggle.cloneNode(true);
      subChoiceToggle.style.cursor = 'pointer';
      
      // Disable if always active
      if (subChoice.isAlwaysActive) {
        subChoiceToggle.disabled = true;
        subChoiceToggle.checked = true;
      }
      
      subChoiceHeader.appendChild(subChoiceName);
      subChoiceHeader.appendChild(subChoiceToggle);
      
      const subChoiceDesc = document.createElement('div');
      subChoiceDesc.style.color = '#000000';
      subChoiceDesc.style.fontSize = '12px';
      subChoiceDesc.innerHTML = subChoice.description || '';
      
      subChoiceItem.appendChild(subChoiceHeader);
      subChoiceItem.appendChild(subChoiceDesc);
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
        
        // Click the customize button
        customizeBtn.click();
        
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
              OVERLAY_SELECTORS.forEach(selector => {
                const overlays = document.querySelectorAll(selector);
                overlays.forEach(overlay => {
                  if (isElementVisibleToUser(overlay)) {
                    overlay.style.display = 'none';
                    log(`[Cookie Simplifier] Hidden overlay: ${selector}`);
                  }
                });
              });
              
              // Create a clean container for our extracted content
              const cleanContainer = document.createElement('div');
              cleanContainer.style.backgroundColor = '#ffffff';
              cleanContainer.style.color = '#000000';
              cleanContainer.style.padding = '15px';
              
              // Extract title
              const titleElement = foundPage.querySelector('h1, h2, h3, .title, .header');
              if (titleElement) {
                const titleClone = titleElement.cloneNode(true);
                titleClone.style.color = '#000000';
                titleClone.style.marginBottom = '15px';
                cleanContainer.appendChild(titleClone);
              }
              
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
                '.preference-group'       // Preference group
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
                    
                    // Extract description
                    let description = '';
                    const descElement = category.querySelector('.ot-cat-desc, .category-description, [class*="desc"], p');
                    if (descElement) {
                      description = descElement.innerHTML.trim();
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
                    
                    // Check for subcategories
                    const subChoices = [];
                    const subCategoryElements = category.querySelectorAll('.ot-subgrp, .subcategory, [class*="sub-cat"]');
                    
                    if (subCategoryElements.length > 0) {
                      subCategoryElements.forEach(subCategory => {
                        const subName = subCategory.querySelector('h4, h5, h6, .subtitle, [class*="title"]')?.textContent.trim() || 'Subcategory';
                        const subDesc = subCategory.querySelector('p, .description, [class*="desc"]')?.innerHTML.trim() || '';
                        
                        let subToggle = subCategory.querySelector('input[type="checkbox"], input[type="radio"]');
                        if (!subToggle) {
                          subToggle = document.createElement('input');
                          subToggle.type = 'checkbox';
                          subToggle.checked = toggle.checked; // Inherit from parent
                        }
                        
                        subChoices.push({
                          name: subName,
                          description: subDesc,
                          toggle: subToggle,
                          isAlwaysActive: false
                        });
                      });
                    }
                    
                    // Create accordion category item
                    const accordionCategory = createAccordionCategory(
                      categoryName, 
                      description, 
                      toggle, 
                      toggle.disabled || toggle.hasAttribute('data-always-active'),
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
                      
                      // Create accordion category item
                      const accordionCategory = createAccordionCategory(categoryName, description, representativeToggle);
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
                      
                      // Create accordion category item
                      const accordionCategory = createAccordionCategory(categoryName, description, representativeToggle);
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
                  createDisabledCheckbox(true)
                );
                
                const analyticsCategory = createAccordionCategory(
                  'Analytics Cookies', 
                  'These cookies allow us to count visits and traffic sources so we can measure and improve the performance of our site.',
                  createCheckbox(false)
                );
                
                const marketingCategory = createAccordionCategory(
                  'Marketing Cookies', 
                  'These cookies may be set through our site by our advertising partners to build a profile of your interests.',
                  createCheckbox(false)
                );
                
                categoriesContainer.appendChild(necessaryCategory);
                categoriesContainer.appendChild(analyticsCategory);
                categoriesContainer.appendChild(marketingCategory);
              }
              
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
              OVERLAY_SELECTORS.forEach(selector => {
                const overlays = document.querySelectorAll(selector);
                overlays.forEach(overlay => {
                  if (isElementVisibleToUser(overlay)) {
                    overlay.style.display = 'none';
                    log(`[Cookie Simplifier] Hidden overlay: ${selector}`);
                  }
                });
              });
              
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
      OVERLAY_SELECTORS.forEach(selector => {
        const overlays = document.querySelectorAll(selector);
        overlays.forEach(overlay => {
          if (isElementVisibleToUser(overlay)) {
            overlay.style.display = 'none';
            log(`[Cookie Simplifier] Hidden overlay: ${selector}`);
          }
        });
      });
      
      // Create a clean container for our extracted content
      const cleanContainer = document.createElement('div');
      cleanContainer.style.backgroundColor = '#ffffff';
      cleanContainer.style.color = '#000000';
      cleanContainer.style.padding = '15px';
      
      // Extract title
      const titleElement = customizationPage.querySelector('h1, h2, h3, .title, .header');
      if (titleElement) {
        const titleClone = titleElement.cloneNode(true);
        titleClone.style.color = '#000000';
        titleClone.style.marginBottom = '15px';
        cleanContainer.appendChild(titleClone);
      }
      
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
        '.preference-group'       // Preference group
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
            
            // Extract description
            let description = '';
            const descElement = category.querySelector('.ot-cat-desc, .category-description, [class*="desc"], p');
            if (descElement) {
              description = descElement.innerHTML.trim();
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
            
            // Check for subcategories
            const subChoices = [];
            const subCategoryElements = category.querySelectorAll('.ot-subgrp, .subcategory, [class*="sub-cat"]');
            
            if (subCategoryElements.length > 0) {
              subCategoryElements.forEach(subCategory => {
                const subName = subCategory.querySelector('h4, h5, h6, .subtitle, [class*="title"]')?.textContent.trim() || 'Subcategory';
                const subDesc = subCategory.querySelector('p, .description, [class*="desc"]')?.innerHTML.trim() || '';
                
                let subToggle = subCategory.querySelector('input[type="checkbox"], input[type="radio"]');
                if (!subToggle) {
                  subToggle = document.createElement('input');
                  subToggle.type = 'checkbox';
                  subToggle.checked = toggle.checked; // Inherit from parent
                }
                
                subChoices.push({
                  name: subName,
                  description: subDesc,
                  toggle: subToggle,
                  isAlwaysActive: false
                });
              });
            }
            
            // Create accordion category item
            const accordionCategory = createAccordionCategory(
              categoryName, 
              description, 
              toggle, 
              toggle.disabled || toggle.hasAttribute('data-always-active'),
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
              
              // Create accordion category item
              const accordionCategory = createAccordionCategory(categoryName, description, representativeToggle);
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
              
              // Create accordion category item
              const accordionCategory = createAccordionCategory(categoryName, description, representativeToggle);
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
          createDisabledCheckbox(true)
        );
        
        const analyticsCategory = createAccordionCategory(
          'Analytics Cookies', 
          'These cookies allow us to count visits and traffic sources so we can measure and improve the performance of our site.',
          createCheckbox(false)
        );
        
        const marketingCategory = createAccordionCategory(
          'Marketing Cookies', 
          'These cookies may be set through our site by our advertising partners to build a profile of your interests.',
          createCheckbox(false)
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
// Create fallback customization content
function createFallbackCustomizationContent() {
  const fallback = document.createElement('div');
  fallback.className = 'customization-content black-text';
  fallback.style.color = '#000000';
  fallback.style.backgroundColor = '#ffffff';
  fallback.style.padding = '15px';
  
  // Title
  const title = document.createElement('h3');
  title.textContent = 'Cookie Settings';
  title.style.color = '#000000';
  title.style.marginBottom = '15px';
  fallback.appendChild(title);
  
  // Necessary category (Always Active)
  const necessarySubChoices = [
    {
      name: 'Authentication',
      description: 'These cookies are necessary for the website to function and cannot be switched off.',
      toggle: createDisabledCheckbox(true),
      isAlwaysActive: true
    },
    {
      name: 'Security',
      description: 'These cookies help us protect the website from malicious activities.',
      toggle: createDisabledCheckbox(true),
      isAlwaysActive: true
    }
  ];
  
  const necessaryCategory = createAccordionCategory(
    'Strictly Necessary Cookies', 
    'These cookies are necessary for the website to function and cannot be switched off in our systems. They are usually only set in response to actions made by you which amount to a request for services, such as setting your privacy preferences, logging in or filling in forms.',
    createDisabledCheckbox(true),
    true,
    necessarySubChoices
  );
  
  // Analytics category
  const analyticsSubChoices = [
    {
      name: 'Performance Measurement',
      description: 'These cookies allow us to count visits and traffic sources so we can measure and improve the performance of our site.',
      toggle: createCheckbox(false),
      isAlwaysActive: false
    },
    {
      name: 'User Behavior Analysis',
      description: 'These cookies help us understand how visitors interact with our website.',
      toggle: createCheckbox(false),
      isAlwaysActive: false
    }
  ];
  
  const analyticsCategory = createAccordionCategory(
    'Analytics Cookies', 
    'These cookies allow us to count visits and traffic sources so we can measure and improve the performance of our site. They help us to know which pages are the most and least popular and see how visitors move around the site.',
    createCheckbox(false),
    false,
    analyticsSubChoices
  );
  
  // Marketing category
  const marketingSubChoices = [
    {
      name: 'Personalized Advertising',
      description: 'These cookies are used to make advertising messages more relevant to you.',
      toggle: createCheckbox(false),
      isAlwaysActive: false
    },
    {
      name: 'Cross-Device Tracking',
      description: 'These cookies may be set through our site by our advertising partners.',
      toggle: createCheckbox(false),
      isAlwaysActive: false
    }
  ];
  
  const marketingCategory = createAccordionCategory(
    'Targeting Cookies', 
    'These cookies are used to make advertising messages more relevant to you and may be set through our site by us or by our advertising partners. They may be used to build a profile of your interests and show you relevant advertising on our site or on other sites.',
    createCheckbox(false),
    false,
    marketingSubChoices
  );
  
  // Save choices category (Always Active)
  const saveChoicesCategory = createAccordionCategory(
    'Save and communicate privacy choices', 
    'The choices you make regarding the purposes and entities listed in this notice are saved and made available to those entities in the form of digital signals (such as a string of characters). This is necessary in order to enable both this service and those entities to respect such choices.',
    createDisabledCheckbox(true),
    true
  );
  
  fallback.appendChild(necessaryCategory);
  fallback.appendChild(analyticsCategory);
  fallback.appendChild(marketingCategory);
  fallback.appendChild(saveChoicesCategory);
  
  return fallback;
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
    newBanner.setAttribute('aria-label', 'Cookie Preferences');
    
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
    newBanner.style.fontFamily = 'Arial, sans-serif';
    newBanner.style.display = 'flex';
    newBanner.style.flexDirection = 'column';
    
    // Add CSS for black text class
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
    `;
    newBanner.appendChild(style);
    
    // Header section with title and close button
    const header = document.createElement('div');
    header.style.padding = '20px 20px 10px 20px';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    
    // Title
    const title = document.createElement('h3');
    title.textContent = 'Cookie Preferences';
    title.style.margin = '0';
    title.style.fontSize = '18px';
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
    closeBtn.style.width = '24px';
    closeBtn.style.height = '24px';
    closeBtn.style.display = 'flex';
    closeBtn.style.alignItems = 'center';
    closeBtn.style.justifyContent = 'center';
    closeBtn.addEventListener('click', () => {
      log("[Cookie Simplifier] Closed simplified banner");
      
      // Restore any hidden overlays when closing the banner
      OVERLAY_SELECTORS.forEach(selector => {
        const overlays = document.querySelectorAll(selector);
        overlays.forEach(overlay => {
          if (overlay.style.display === 'none') {
            overlay.style.display = '';
            log(`[Cookie Simplifier] Restored overlay: ${selector}`);
          }
        });
      });
      
      // Restore original customization page if it exists
      if (originalCustomizationPage) {
        originalCustomizationPage.style.display = '';
        log("[Cookie Simplifier] Restored original customization page");
      }
      
      newBanner.remove();
    });
    closeBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        log("[Cookie Simplifier] Keyboard closed simplified banner");
        
        // Restore any hidden overlays when closing the banner
        OVERLAY_SELECTORS.forEach(selector => {
          const overlays = document.querySelectorAll(selector);
          overlays.forEach(overlay => {
            if (overlay.style.display === 'none') {
              overlay.style.display = '';
              log(`[Cookie Simplifier] Restored overlay: ${selector}`);
            }
          });
        });
        
        // Restore original customization page if it exists
        if (originalCustomizationPage) {
          originalCustomizationPage.style.display = '';
          log("[Cookie Simplifier] Restored original customization page");
        }
        
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
    
    // Add the extracted HTML content
    if (bannerContent) {
      contentContainer.appendChild(bannerContent);
    } else {
      // Fallback content if extraction failed
      const fallbackContent = document.createElement('div');
      fallbackContent.className = 'extracted-banner-content black-text';
      fallbackContent.style.color = '#000000';
      fallbackContent.style.backgroundColor = '#ffffff';
      fallbackContent.innerHTML = `
        <p style="color: #000000;">This website uses cookies to enhance your experience. By continuing to use this site, you agree to our use of cookies.</p>
        <p style="color: #000000;">For more information, please review the website's privacy policy.</p>
      `;
      contentContainer.appendChild(fallbackContent);
    }
    
    // Add a separator between content and customization
    const separator = document.createElement('hr');
    separator.style.margin = '20px 0';
    separator.style.border = 'none';
    separator.style.borderTop = '1px solid #eee';
    contentContainer.appendChild(separator);
    
    // Add the prefetched customization content
    if (customizationContent) {
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
    
    // Add Accept button
    const acceptBtn = document.createElement('button');
    acceptBtn.textContent = 'Accept All';
    acceptBtn.setAttribute('tabindex', '0');
    acceptBtn.style.padding = '12px 16px';
    acceptBtn.style.cursor = 'pointer';
    acceptBtn.style.border = 'none';
    acceptBtn.style.borderRadius = '4px';
    acceptBtn.style.fontSize = '14px';
    acceptBtn.style.fontWeight = 'bold';
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
            }, 500);
          } catch (error) {
            log(`[Cookie Simplifier] Error triggering accept button click: ${error.message}`);
          }
        }
        
        newBanner.remove();
      }
    });
    
    buttonContainer.appendChild(acceptBtn);
    
    // Add Reject button
    const rejectBtn = document.createElement('button');
    rejectBtn.textContent = 'Reject All';
    rejectBtn.setAttribute('tabindex', '0');
    rejectBtn.style.padding = '12px 16px';
    rejectBtn.style.cursor = 'pointer';
    rejectBtn.style.border = 'none';
    rejectBtn.style.borderRadius = '4px';
    rejectBtn.style.fontSize = '14px';
    rejectBtn.style.fontWeight = 'bold';
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
            }, 500);
          } catch (error) {
            log(`[Cookie Simplifier] Error triggering reject button click: ${error.message}`);
          }
        }
        
        newBanner.remove();
      }
    });
    
    buttonContainer.appendChild(rejectBtn);
    
    // Add Accept Selection button
    const acceptSelectionBtn = document.createElement('button');
    acceptSelectionBtn.textContent = 'Accept Selection';
    acceptSelectionBtn.setAttribute('tabindex', '0');
    acceptSelectionBtn.style.padding = '12px 16px';
    acceptSelectionBtn.style.cursor = 'pointer';
    acceptSelectionBtn.style.border = 'none';
    acceptSelectionBtn.style.borderRadius = '4px';
    acceptSelectionBtn.style.fontSize = '14px';
    acceptSelectionBtn.style.fontWeight = 'bold';
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
// Hide the original banner instead of removing it
function hideBanner(banner) {
  if (!banner) {
    log("[Cookie Simplifier] No banner to hide");
    return;
  }
  
  try {
    const bannerInfo = {
      element: banner,
      originalDisplay: banner.style.display || '',
      className: banner.className,
      id: banner.id,
      style: banner.getAttribute('style')
    };
    
    log(`[Cookie Simplifier] Hiding banner - ID: ${banner.id || 'none'}, Original display: ${bannerInfo.originalDisplay}`);
    originalBanners.set(banner, bannerInfo);
    
    // Hide the banner
    banner.style.display = 'none';
    
    // Hide OneTrust-specific overlay and container
    const oneTrustElements = [
      { selector: '.onetrust-pc-dark-filter', name: 'OneTrust overlay' },
      { selector: '#onetrust-consent-sdk', name: 'OneTrust container' }
    ];
    
    oneTrustElements.forEach(({ selector, name }) => {
      const element = document.querySelector(selector);
      if (element && isVisible(element)) {
        const elementInfo = {
          element: element,
          originalDisplay: element.style.display || '',
          className: element.className,
          id: element.id,
          style: element.getAttribute('style')
        };
        originalBanners.set(element, elementInfo);
        element.style.display = 'none';
        log(`[Cookie Simplifier] Hid ${name}`);
      } else if (element) {
        log(`[Cookie Simplifier] ${name} found but not visible`);
      }
    });
    
    log("[Cookie Simplifier] Banner hidden from view");
  } catch (error) {
    log(`[Cookie Simplifier] Error hiding banner: ${error.message}`);
  }
}
// Restore a hidden banner
function restoreBanner(bannerInfo) {
  try {
    const banner = bannerInfo.element;
    if (!banner) {
      log("[Cookie Simplifier] Cannot restore banner: no element");
      return;
    }
    
    // Restore the original display value
    banner.style.display = bannerInfo.originalDisplay;
    
    log("[Cookie Simplifier] Restored banner to view: " + (banner.id || banner.tagName));
  } catch (error) {
    log(`[Cookie Simplifier] Error restoring banner: ${error.message}`);
  }
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
    
    // Check if this is a customization page that's hidden
    const isCustomizationPage = CUSTOMIZATION_SELECTORS.some(selector => 
      banner.matches(selector) || banner.querySelector(selector)
    );
    
    if (isCustomizationPage && !isElementVisibleToUser(banner)) {
      log("[Cookie Simplifier] Found hidden customization page, skipping");
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
      customizationContent = await extractCustomizationContent(banner);
      prefetchedCustomizationContent = customizationContent;
      log("[Cookie Simplifier] Customization content prefetched successfully");
    } catch (error) {
      log(`[Cookie Simplifier] Error prefetching customization content: ${error.message}`);
      customizationContent = createFallbackCustomizationContent();
    }
    
    hideBanner(banner);
    const simplifiedBanner = createSimplifiedBanner(banner, buttons, bannerContent, customizationContent);
    if (simplifiedBanner) {
      document.body.appendChild(simplifiedBanner);
      log("[Cookie Simplifier] Simplified banner added to page");
      
      // Check for banner reinsertion after a delay
      setTimeout(() => {
        if (document.querySelector('#onetrust-banner-sdk') && !isProcessing) {
          log("[Cookie Simplifier] Detected banner reinsertion, reprocessing");
          handleCookieBanners();
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
          if (node.id === 'simplified-cookie-banner' || 
              (node.querySelector && node.querySelector('#simplified-cookie-banner'))) {
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
          for (const selector of GENERAL_BANNER_SELECTORS) {
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
// Function to remove any existing simplified banners
function removeExistingBanners() {
  const existingBanner = document.getElementById('simplified-cookie-banner');
  if (existingBanner) {
    existingBanner.remove();
    log("[Cookie Simplifier] Removed existing simplified banner");
  }
}
// Function to restore original banners
function restoreOriginalBanners() {
  log("[Cookie Simplifier] Restoring original banners");
  
  originalBanners.forEach((bannerInfo, banner) => {
    restoreBanner(bannerInfo);
  });
  
  originalBanners.clear();
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
    debugMode = message.settings.debugMode;
    autoOpenCustomization = message.settings.autoOpenCustomization;
    
    if (extensionEnabled) {
      log("[Cookie Simplifier] Extension enabled, checking for banners");
      handleCookieBanners();
      setupObserver();
    } else {
      log("[Cookie Simplifier] Extension disabled, removing simplified banner and restoring original");
      removeExistingBanners();
      restoreOriginalBanners();
      
      if (observer) {
        observer.disconnect();
        observer = null;
      }
    }
    
    sendResponse({ success: true });
  }
  
  return true; // Indicates async response
});
init();