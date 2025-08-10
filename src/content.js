console.log("[Cookie Simplifier] Content script loaded");
// Global variables to track extension state
let extensionEnabled = true;
let debugMode = true;
let isProcessing = false; // Flag to prevent re-entrancy
let observer = null; // Reference to our observer
let originalBanners = new Map(); // Track original banners we've removed
let lastProcessed = 0; // For MutationObserver throttling
let customizationView = null; // Track if we're showing customization view

// OneTrust-specific selectors
const ONETRUST_SELECTORS = [
  '#onetrust-banner-sdk', // Main OneTrust banner
  '#onetrust-consent-sdk', // OneTrust container
  '#onetrust-group-container', // OneTrust group container
  '#onetrust-policy', // OneTrust policy section
  '.onetrust-banner-sdk', // Alternative class name
  '#ot-sdk-container',
  // '[id*="onetrust"]', // Any element with "onetrust" in ID
  // '[class*="onetrust"]' // Any element with "onetrust" in class
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
    log(`[Cookie Simplifier] Settings retrieved: enabled=${extensionEnabled}, debugMode=${debugMode}`);
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
      
      if (isVisible(element) && !shouldExclude(element)) {
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
    
    if (isVisible(element)) {
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

// Extract customization page content
async function extractCustomizationContent(banner) {
  log("[Cookie Simplifier] Extracting customization page content...");
  
  try {
    // First, check if customization page is already visible
    let customizationPage = null;
    
    // Try to find OneTrust preference center
    const oneTrustPC = document.querySelector('#onetrust-pc-sdk');
    if (oneTrustPC && isVisible(oneTrustPC)) {
      customizationPage = oneTrustPC;
      log("[Cookie Simplifier] Found OneTrust preference center already visible");
    }
    
    // If not found, try other selectors
    if (!customizationPage) {
      for (const selector of CUSTOMIZATION_SELECTORS) {
        const element = document.querySelector(selector);
        if (element && isVisible(element)) {
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
            if (oneTrustPC && isVisible(oneTrustPC)) {
              foundPage = oneTrustPC;
            }
            
            // Check other selectors if OneTrust not found
            if (!foundPage) {
              for (const selector of CUSTOMIZATION_SELECTORS) {
                const element = document.querySelector(selector);
                if (element && isVisible(element)) {
                  foundPage = element;
                  break;
                }
              }
            }
            
            if (foundPage) {
              clearInterval(checkInterval);
              pageFound = true;
              log("[Cookie Simplifier] Customization page appeared after clicking button");
              
              // Restore original banner position
              banner.style.position = originalBannerPosition;
              banner.style.left = '';
              
              // Hide any overlays that might be causing the black screen
              OVERLAY_SELECTORS.forEach(selector => {
                const overlays = document.querySelectorAll(selector);
                overlays.forEach(overlay => {
                  if (isVisible(overlay)) {
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
                    // Create a clean category item
                    const categoryItem = document.createElement('div');
                    categoryItem.style.backgroundColor = '#f9f9f9';
                    categoryItem.style.border = '1px solid #ddd';
                    categoryItem.style.borderRadius = '4px';
                    categoryItem.style.padding = '12px';
                    categoryItem.style.marginBottom = '10px';
                    categoryItem.style.display = 'flex';
                    categoryItem.style.alignItems = 'center';
                    categoryItem.style.justifyContent = 'space-between';
                    
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
                    
                    // Create category label
                    const categoryLabel = document.createElement('label');
                    categoryLabel.style.color = '#000000';
                    categoryLabel.style.fontWeight = 'bold';
                    categoryLabel.style.cursor = 'pointer';
                    categoryLabel.textContent = categoryName;
                    
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
                    
                    // Clone the toggle to avoid event conflicts
                    const toggleClone = toggle.cloneNode(true);
                    toggleClone.style.marginLeft = '10px';
                    toggleClone.style.cursor = 'pointer';
                    
                    // Add the label and toggle to the category item
                    categoryItem.appendChild(categoryLabel);
                    categoryItem.appendChild(toggleClone);
                    
                    categoriesContainer.appendChild(categoryItem);
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
                      const categoryItem = document.createElement('div');
                      categoryItem.style.backgroundColor = '#f9f9f9';
                      categoryItem.style.border = '1px solid #ddd';
                      categoryItem.style.borderRadius = '4px';
                      categoryItem.style.padding = '12px';
                      categoryItem.style.marginBottom = '10px';
                      
                      const categoryLabel = document.createElement('label');
                      categoryLabel.style.color = '#000000';
                      categoryLabel.style.fontWeight = 'bold';
                      categoryLabel.style.cursor = 'pointer';
                      categoryLabel.textContent = 'Cookie Preferences';
                      
                      categoryItem.appendChild(categoryLabel);
                      
                      // Add all toggles in this group
                      toggles.forEach(toggle => {
                        const toggleClone = toggle.cloneNode(true);
                        toggleClone.style.marginLeft = '10px';
                        toggleClone.style.cursor = 'pointer';
                        categoryItem.appendChild(toggleClone);
                      });
                      
                      categoriesContainer.appendChild(categoryItem);
                    } else {
                      // Create a category item for this parent group
                      const categoryItem = document.createElement('div');
                      categoryItem.style.backgroundColor = '#f9f9f9';
                      categoryItem.style.border = '1px solid #ddd';
                      categoryItem.style.borderRadius = '4px';
                      categoryItem.style.padding = '12px';
                      categoryItem.style.marginBottom = '10px';
                      
                      // Extract category name from the parent
                      let categoryName = '';
                      const titleElement = parent.querySelector('h1, h2, h3, h4, h5, h6, .title, [class*="title"]');
                      if (titleElement) {
                        categoryName = titleElement.textContent.trim();
                      } else {
                        categoryName = 'Cookie Category';
                      }
                      
                      const categoryLabel = document.createElement('label');
                      categoryLabel.style.color = '#000000';
                      categoryLabel.style.fontWeight = 'bold';
                      categoryLabel.style.cursor = 'pointer';
                      categoryLabel.textContent = categoryName;
                      
                      categoryItem.appendChild(categoryLabel);
                      
                      // Add all toggles in this group
                      toggles.forEach(toggle => {
                        const toggleClone = toggle.cloneNode(true);
                        toggleClone.style.marginLeft = '10px';
                        toggleClone.style.cursor = 'pointer';
                        categoryItem.appendChild(toggleClone);
                      });
                      
                      categoriesContainer.appendChild(categoryItem);
                    }
                  });
                }
              }
              
              // If still no categories found, create a simple default interface
              if (!foundCategories) {
                categoriesContainer.innerHTML = `
                  <div style="background-color: #f9f9f9; border: 1px solid #ddd; border-radius: 4px; padding: 12px; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
                    <label style="color: #000000; font-weight: bold; cursor: pointer;">Necessary Cookies</label>
                    <input type="checkbox" checked disabled style="margin-left: 10px; cursor: pointer;">
                  </div>
                  <div style="background-color: #f9f9f9; border: 1px solid #ddd; border-radius: 4px; padding: 12px; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
                    <label style="color: #000000; font-weight: bold; cursor: pointer;">Analytics Cookies</label>
                    <input type="checkbox" style="margin-left: 10px; cursor: pointer;">
                  </div>
                  <div style="background-color: #f9f9f9; border: 1px solid #ddd; border-radius: 4px; padding: 12px; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
                    <label style="color: #000000; font-weight: bold; cursor: pointer;">Marketing Cookies</label>
                    <input type="checkbox" style="margin-left: 10px; cursor: pointer;">
                  </div>
                `;
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
                  if (isVisible(overlay)) {
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
      // Hide any overlays that might be causing the black screen
      OVERLAY_SELECTORS.forEach(selector => {
        const overlays = document.querySelectorAll(selector);
        overlays.forEach(overlay => {
          if (isVisible(overlay)) {
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
            // Create a clean category item
            const categoryItem = document.createElement('div');
            categoryItem.style.backgroundColor = '#f9f9f9';
            categoryItem.style.border = '1px solid #ddd';
            categoryItem.style.borderRadius = '4px';
            categoryItem.style.padding = '12px';
            categoryItem.style.marginBottom = '10px';
            categoryItem.style.display = 'flex';
            categoryItem.style.alignItems = 'center';
            categoryItem.style.justifyContent = 'space-between';
            
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
            
            // Create category label
            const categoryLabel = document.createElement('label');
            categoryLabel.style.color = '#000000';
            categoryLabel.style.fontWeight = 'bold';
            categoryLabel.style.cursor = 'pointer';
            categoryLabel.textContent = categoryName;
            
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
            
            // Clone the toggle to avoid event conflicts
            const toggleClone = toggle.cloneNode(true);
            toggleClone.style.marginLeft = '10px';
            toggleClone.style.cursor = 'pointer';
            
            // Add the label and toggle to the category item
            categoryItem.appendChild(categoryLabel);
            categoryItem.appendChild(toggleClone);
            
            categoriesContainer.appendChild(categoryItem);
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
              const categoryItem = document.createElement('div');
              categoryItem.style.backgroundColor = '#f9f9f9';
              categoryItem.style.border = '1px solid #ddd';
              categoryItem.style.borderRadius = '4px';
              categoryItem.style.padding = '12px';
              categoryItem.style.marginBottom = '10px';
              
              const categoryLabel = document.createElement('label');
              categoryLabel.style.color = '#000000';
              categoryLabel.style.fontWeight = 'bold';
              categoryLabel.style.cursor = 'pointer';
              categoryLabel.textContent = 'Cookie Preferences';
              
              categoryItem.appendChild(categoryLabel);
              
              // Add all toggles in this group
              toggles.forEach(toggle => {
                const toggleClone = toggle.cloneNode(true);
                toggleClone.style.marginLeft = '10px';
                toggleClone.style.cursor = 'pointer';
                categoryItem.appendChild(toggleClone);
              });
              
              categoriesContainer.appendChild(categoryItem);
            } else {
              // Create a category item for this parent group
              const categoryItem = document.createElement('div');
              categoryItem.style.backgroundColor = '#f9f9f9';
              categoryItem.style.border = '1px solid #ddd';
              categoryItem.style.borderRadius = '4px';
              categoryItem.style.padding = '12px';
              categoryItem.style.marginBottom = '10px';
              
              // Extract category name from the parent
              let categoryName = '';
              const titleElement = parent.querySelector('h1, h2, h3, h4, h5, h6, .title, [class*="title"]');
              if (titleElement) {
                categoryName = titleElement.textContent.trim();
              } else {
                categoryName = 'Cookie Category';
              }
              
              const categoryLabel = document.createElement('label');
              categoryLabel.style.color = '#000000';
              categoryLabel.style.fontWeight = 'bold';
              categoryLabel.style.cursor = 'pointer';
              categoryLabel.textContent = categoryName;
              
              categoryItem.appendChild(categoryLabel);
              
              // Add all toggles in this group
              toggles.forEach(toggle => {
                const toggleClone = toggle.cloneNode(true);
                toggleClone.style.marginLeft = '10px';
                toggleClone.style.cursor = 'pointer';
                categoryItem.appendChild(toggleClone);
              });
              
              categoriesContainer.appendChild(categoryItem);
            }
          });
        }
      }
      
      // If still no categories found, create a simple default interface
      if (!foundCategories) {
        categoriesContainer.innerHTML = `
          <div style="background-color: #f9f9f9; border: 1px solid #ddd; border-radius: 4px; padding: 12px; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
            <label style="color: #000000; font-weight: bold; cursor: pointer;">Necessary Cookies</label>
            <input type="checkbox" checked disabled style="margin-left: 10px; cursor: pointer;">
          </div>
          <div style="background-color: #f9f9f9; border: 1px solid #ddd; border-radius: 4px; padding: 12px; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
            <label style="color: #000000; font-weight: bold; cursor: pointer;">Analytics Cookies</label>
            <input type="checkbox" style="margin-left: 10px; cursor: pointer;">
          </div>
          <div style="background-color: #f9f9f9; border: 1px solid #ddd; border-radius: 4px; padding: 12px; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
            <label style="color: #000000; font-weight: bold; cursor: pointer;">Marketing Cookies</label>
            <input type="checkbox" style="margin-left: 10px; cursor: pointer;">
          </div>
        `;
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

// Process the customization clone
function processCustomizationClone(clone) {
  // Fix background color
  clone.style.backgroundColor = '#ffffff';
  
  // Process links
  const links = clone.querySelectorAll('a');
  links.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      window.open(link.href, '_blank');
    });
    
    link.style.color = '#2196F3';
    link.style.textDecoration = 'underline';
    link.style.cursor = 'pointer';
  });
  
  // Process images
  const images = clone.querySelectorAll('img');
  images.forEach(img => {
    if (!img.src && img.getAttribute('data-src')) {
      img.src = img.getAttribute('data-src');
    }
  });
  
  // Make all text black
  const textElements = clone.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, div, li, td, th, label');
  textElements.forEach(element => {
    element.style.color = '#000000';
  });
  
  // Style checkboxes
  const checkboxes = clone.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach(checkbox => {
    checkbox.style.marginRight = '8px';
  });
}

// Create fallback customization content
function createFallbackCustomizationContent() {
  const fallback = document.createElement('div');
  fallback.className = 'customization-content black-text';
  fallback.style.color = '#000000';
  fallback.style.backgroundColor = '#ffffff';
  fallback.style.padding = '15px';
  fallback.innerHTML = `
    <h3 style="color: #000000; margin-bottom: 15px;">Cookie Settings</h3>
    <div style="background-color: #f9f9f9; border: 1px solid #ddd; border-radius: 4px; padding: 12px; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
      <label style="color: #000000; font-weight: bold; cursor: pointer;">Necessary Cookies</label>
      <input type="checkbox" checked disabled style="margin-left: 10px; cursor: pointer;">
    </div>
    <div style="background-color: #f9f9f9; border: 1px solid #ddd; border-radius: 4px; padding: 12px; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
      <label style="color: #000000; font-weight: bold; cursor: pointer;">Analytics Cookies</label>
      <input type="checkbox" style="margin-left: 10px; cursor: pointer;">
    </div>
    <div style="background-color: #f9f9f9; border: 1px solid #ddd; border-radius: 4px; padding: 12px; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
      <label style="color: #000000; font-weight: bold; cursor: pointer;">Marketing Cookies</label>
      <input type="checkbox" style="margin-left: 10px; cursor: pointer;">
    </div>
  `;
  return fallback;
}

// Create simplified banner with customization view
function createSimplifiedBanner(banner, buttons, bannerContent) {
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
    
    // Main view container
    const mainView = document.createElement('div');
    mainView.id = 'simplified-cookie-main-view';
    mainView.style.backgroundColor = '#ffffff'; // Ensure white background
    
    // Add the extracted HTML content
    if (bannerContent) {
      mainView.appendChild(bannerContent);
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
      mainView.appendChild(fallbackContent);
    }
    
    // Customization view container (initially hidden)
    const customizationView = document.createElement('div');
    customizationView.id = 'simplified-cookie-customization-view';
    customizationView.style.display = 'none';
    customizationView.style.backgroundColor = '#ffffff'; // Ensure white background
    
    // Button container for main view
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.flexDirection = 'column';
    buttonContainer.style.gap = '10px';
    buttonContainer.style.marginTop = '15px';
    buttonContainer.style.backgroundColor = '#ffffff'; // Ensure white background
    
    // Add original buttons to main view
    buttons.forEach(button => {
      const btn = document.createElement('button');
      btn.textContent = button.text;
      btn.setAttribute('tabindex', '0');
      btn.style.padding = '12px 16px';
      btn.style.cursor = 'pointer';
      btn.style.border = 'none';
      btn.style.borderRadius = '4px';
      btn.style.fontSize = '14px';
      btn.style.fontWeight = 'bold';
      btn.style.width = '100%'; // Make buttons full width
      
      // Set button colors based on type
      if (button.type === 'accept') {
        btn.style.backgroundColor = '#4CAF50';
        btn.style.color = 'white';
      } else if (button.type === 'reject') {
        btn.style.backgroundColor = '#f44336';
        btn.style.color = 'white';
      } else if (button.type === 'customize') {
        btn.style.backgroundColor = '#2196F3';
        btn.style.color = 'white';
      } else {
        btn.style.backgroundColor = '#888';
        btn.style.color = 'white';
      }
      
      // Add click handler
      btn.addEventListener('click', () => {
        if (button.type === 'customize') {
          // Show customization view
          log("[Cookie Simplifier] Showing customization view");
          mainView.style.display = 'none';
          customizationView.style.display = 'block';
          
          // Load customization content if not already loaded
          if (customizationView.children.length === 0) {
            log("[Cookie Simplifier] Loading customization content");
            
            // Show a loading indicator
            const loadingIndicator = document.createElement('div');
            loadingIndicator.textContent = 'Loading cookie preferences...';
            loadingIndicator.style.padding = '20px';
            loadingIndicator.style.textAlign = 'center';
            loadingIndicator.style.color = '#000000';
            customizationView.appendChild(loadingIndicator);
            
            // Extract customization content
            extractCustomizationContent(banner).then(content => {
              // Remove loading indicator
              if (loadingIndicator.parentNode) {
                loadingIndicator.parentNode.removeChild(loadingIndicator);
              }
              
              // Add the extracted content
              customizationView.appendChild(content);
              
              // Add back button
              const backButton = document.createElement('button');
              backButton.textContent = '← Back';
              backButton.style.marginTop = '15px';
              backButton.style.padding = '10px 15px';
              backButton.style.backgroundColor = '#888';
              backButton.style.color = 'white';
              backButton.style.border = 'none';
              backButton.style.borderRadius = '4px';
              backButton.style.cursor = 'pointer';
              backButton.style.fontSize = '14px';
              backButton.style.fontWeight = 'bold';
              
              backButton.addEventListener('click', () => {
                log("[Cookie Simplifier] Going back to main view");
                customizationView.style.display = 'none';
                mainView.style.display = 'block';
              });
              
              customizationView.appendChild(backButton);
              
              // Add accept button for customization
              const acceptButton = document.createElement('button');
              acceptButton.textContent = 'Accept Selection';
              acceptButton.style.marginTop = '10px';
              acceptButton.style.padding = '12px 16px';
              acceptButton.style.backgroundColor = '#4CAF50';
              acceptButton.style.color = 'white';
              acceptButton.style.border = 'none';
              acceptButton.style.borderRadius = '4px';
              acceptButton.style.cursor = 'pointer';
              acceptButton.style.fontSize = '14px';
              acceptButton.style.fontWeight = 'bold';
              acceptButton.style.width = '100%';
              
              acceptButton.addEventListener('click', () => {
                log("[Cookie Simplifier] Accepted customized settings");
                
                // Find and click the original accept button in the hidden customization page
                const hiddenCustomizationPage = document.querySelector('#onetrust-pc-sdk[style*="display: none"]');
                if (hiddenCustomizationPage) {
                  const saveButton = hiddenCustomizationPage.querySelector('.save-preference-btn, .btn-primary, .accept-btn');
                  if (saveButton) {
                    saveButton.click();
                  } else {
                    log("[Cookie Simplifier] Could not find save button in hidden customization page");
                  }
                }
                
                // Close our banner
                newBanner.remove();
              });
              
              customizationView.appendChild(acceptButton);
            }).catch(error => {
              log(`[Cookie Simplifier] Error loading customization content: ${error.message}`);
              
              // Remove loading indicator
              if (loadingIndicator.parentNode) {
                loadingIndicator.parentNode.removeChild(loadingIndicator);
              }
              
              // Show error message
              const errorMessage = document.createElement('div');
              errorMessage.textContent = 'Error loading cookie preferences. Please try again.';
              errorMessage.style.color = 'red';
              errorMessage.style.padding = '20px';
              errorMessage.style.textAlign = 'center';
              customizationView.appendChild(errorMessage);
              
              // Add back button
              const backButton = document.createElement('button');
              backButton.textContent = '← Back';
              backButton.style.marginTop = '15px';
              backButton.style.padding = '10px 15px';
              backButton.style.backgroundColor = '#888';
              backButton.style.color = 'white';
              backButton.style.border = 'none';
              backButton.style.borderRadius = '4px';
              backButton.style.cursor = 'pointer';
              backButton.style.fontSize = '14px';
              backButton.style.fontWeight = 'bold';
              
              backButton.addEventListener('click', () => {
                log("[Cookie Simplifier] Going back to main view");
                customizationView.style.display = 'none';
                mainView.style.display = 'block';
              });
              
              customizationView.appendChild(backButton);
            });
          }
        } else {
          // Handle accept/reject buttons
          log(`[Cookie Simplifier] Clicked button: ${button.type}, Text: "${button.text}"`);
          try {
            const cookieBefore = document.cookie;
            
            // Ensure the original button is still in the DOM for OneTrust
            if (!document.body.contains(button.element)) {
              log("[Cookie Simplifier] Original button not in DOM, reattaching temporarily");
              const tempContainer = document.createElement('div');
              tempContainer.style.display = 'none';
              tempContainer.appendChild(button.element);
              document.body.appendChild(tempContainer);
              button.element.click();
              tempContainer.remove();
            } else {
              button.element.click();
            }
            
            setTimeout(() => {
              const cookieAfter = document.cookie;
              log(`[Cookie Simplifier] Cookie change check - Before: "${cookieBefore}", After: "${cookieAfter}"`);
            }, 500);
          } catch (error) {
            log(`[Cookie Simplifier] Error triggering button click: ${error.message}`);
          }
          newBanner.remove();
        }
      });
      
      // Add keyboard support
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (button.type === 'customize') {
            // Show customization view
            log("[Cookie Simplifier] Showing customization view");
            mainView.style.display = 'none';
            customizationView.style.display = 'block';
            
            // Load customization content if not already loaded
            if (customizationView.children.length === 0) {
              log("[Cookie Simplifier] Loading customization content");
              
              // Show a loading indicator
              const loadingIndicator = document.createElement('div');
              loadingIndicator.textContent = 'Loading cookie preferences...';
              loadingIndicator.style.padding = '20px';
              loadingIndicator.style.textAlign = 'center';
              loadingIndicator.style.color = '#000000';
              customizationView.appendChild(loadingIndicator);
              
              // Extract customization content
              extractCustomizationContent(banner).then(content => {
                // Remove loading indicator
                if (loadingIndicator.parentNode) {
                  loadingIndicator.parentNode.removeChild(loadingIndicator);
                }
                
                // Add the extracted content
                customizationView.appendChild(content);
                
                // Add back button
                const backButton = document.createElement('button');
                backButton.textContent = '← Back';
                backButton.style.marginTop = '15px';
                backButton.style.padding = '10px 15px';
                backButton.style.backgroundColor = '#888';
                backButton.style.color = 'white';
                backButton.style.border = 'none';
                backButton.style.borderRadius = '4px';
                backButton.style.cursor = 'pointer';
                backButton.style.fontSize = '14px';
                backButton.style.fontWeight = 'bold';
                
                backButton.addEventListener('click', () => {
                  log("[Cookie Simplifier] Going back to main view");
                  customizationView.style.display = 'none';
                  mainView.style.display = 'block';
                });
                
                customizationView.appendChild(backButton);
                
                // Add accept button for customization
                const acceptButton = document.createElement('button');
                acceptButton.textContent = 'Accept Selection';
                acceptButton.style.marginTop = '10px';
                acceptButton.style.padding = '12px 16px';
                acceptButton.style.backgroundColor = '#4CAF50';
                acceptButton.style.color = 'white';
                acceptButton.style.border = 'none';
                acceptButton.style.borderRadius = '4px';
                acceptButton.style.cursor = 'pointer';
                acceptButton.style.fontSize = '14px';
                acceptButton.style.fontWeight = 'bold';
                acceptButton.style.width = '100%';
                
                acceptButton.addEventListener('click', () => {
                  log("[Cookie Simplifier] Accepted customized settings");
                  
                  // Find and click the original accept button in the hidden customization page
                  const hiddenCustomizationPage = document.querySelector('#onetrust-pc-sdk[style*="display: none"]');
                  if (hiddenCustomizationPage) {
                    const saveButton = hiddenCustomizationPage.querySelector('.save-preference-btn, .btn-primary, .accept-btn');
                    if (saveButton) {
                      saveButton.click();
                    } else {
                      log("[Cookie Simplifier] Could not find save button in hidden customization page");
                    }
                  }
                  
                  // Close our banner
                  newBanner.remove();
                });
                
                customizationView.appendChild(acceptButton);
              }).catch(error => {
                log(`[Cookie Simplifier] Error loading customization content: ${error.message}`);
                
                // Remove loading indicator
                if (loadingIndicator.parentNode) {
                  loadingIndicator.parentNode.removeChild(loadingIndicator);
                }
                
                // Show error message
                const errorMessage = document.createElement('div');
                errorMessage.textContent = 'Error loading cookie preferences. Please try again.';
                errorMessage.style.color = 'red';
                errorMessage.style.padding = '20px';
                errorMessage.style.textAlign = 'center';
                customizationView.appendChild(errorMessage);
                
                // Add back button
                const backButton = document.createElement('button');
                backButton.textContent = '← Back';
                backButton.style.marginTop = '15px';
                backButton.style.padding = '10px 15px';
                backButton.style.backgroundColor = '#888';
                backButton.style.color = 'white';
                backButton.style.border = 'none';
                backButton.style.borderRadius = '4px';
                backButton.style.cursor = 'pointer';
                backButton.style.fontSize = '14px';
                backButton.style.fontWeight = 'bold';
                
                backButton.addEventListener('click', () => {
                  log("[Cookie Simplifier] Going back to main view");
                  customizationView.style.display = 'none';
                  mainView.style.display = 'block';
                });
                
                customizationView.appendChild(backButton);
              });
            }
          } else {
            // Handle accept/reject buttons
            log(`[Cookie Simplifier] Keyboard triggered button: ${button.type}`);
            try {
              const cookieBefore = document.cookie;
              
              if (!document.body.contains(button.element)) {
                log("[Cookie Simplifier] Original button not in DOM, reattaching temporarily");
                const tempContainer = document.createElement('div');
                tempContainer.style.display = 'none';
                tempContainer.appendChild(button.element);
                document.body.appendChild(tempContainer);
                button.element.click();
                tempContainer.remove();
              } else {
                button.element.click();
              }
              
              setTimeout(() => {
                const cookieAfter = document.cookie;
                log(`[Cookie Simplifier] Cookie change check - Before: "${cookieBefore}", After: "${cookieAfter}"`);
              }, 500);
            } catch (error) {
              log(`[Cookie Simplifier] Error triggering button click: ${error.message}`);
            }
            newBanner.remove();
          }
        }
      });
      
      buttonContainer.appendChild(btn);
    });
    
    mainView.appendChild(buttonContainer);
    contentContainer.appendChild(mainView);
    contentContainer.appendChild(customizationView);
    newBanner.appendChild(contentContainer);
    
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

// Completely remove banner and store for restoration
function removeBanner(banner) {
  if (!banner) {
    log("[Cookie Simplifier] No banner to remove");
    return;
  }
  
  try {
    const bannerInfo = {
      element: banner,
      parent: banner.parentNode,
      nextSibling: banner.nextSibling,
      className: banner.className,
      id: banner.id,
      style: banner.getAttribute('style')
    };
    
    log(`[Cookie Simplifier] Removing banner - ID: ${banner.id || 'none'}, Parent: ${banner.parentNode?.tagName || 'none'}, Classes: ${banner.className}`);
    originalBanners.set(banner, bannerInfo);
    
    // Remove OneTrust-specific overlay and container
    const oneTrustElements = [
      { selector: '.onetrust-pc-dark-filter', name: 'OneTrust overlay' },
      { selector: '#onetrust-consent-sdk', name: 'OneTrust container' }
    ];
    
    oneTrustElements.forEach(({ selector, name }) => {
      const element = document.querySelector(selector);
      if (element && isVisible(element)) {
        const elementInfo = {
          element: element,
          parent: element.parentNode,
          nextSibling: element.nextSibling,
          className: element.className,
          id: element.id,
          style: element.getAttribute('style')
        };
        originalBanners.set(element, elementInfo);
        if (element.parentNode) {
          element.parentNode.removeChild(element);
          log(`[Cookie Simplifier] Removed ${name}`);
        } else {
          log(`[Cookie Simplifier] Failed to remove ${name}: no parent node`);
        }
      } else if (element) {
        log(`[Cookie Simplifier] ${name} found but not visible`);
      }
    });
    
    // Remove the banner itself
    if (banner.parentNode) {
      banner.parentNode.removeChild(banner);
      log("[Cookie Simplifier] Completely removed banner from DOM");
    } else {
      log("[Cookie Simplifier] Failed to remove banner: no parent node");
    }
  } catch (error) {
    log(`[Cookie Simplifier] Error removing banner: ${error.message}`);
  }
}

// Restore a removed banner
function restoreBanner(bannerInfo) {
  try {
    if (!bannerInfo.parent) {
      log("[Cookie Simplifier] Cannot restore banner: no parent node");
      return;
    }
    
    const newBanner = bannerInfo.element.cloneNode(true);
    if (bannerInfo.className) newBanner.className = bannerInfo.className;
    if (bannerInfo.id) newBanner.id = bannerInfo.id;
    if (bannerInfo.style) newBanner.setAttribute('style', bannerInfo.style);
    
    if (bannerInfo.nextSibling) {
      bannerInfo.parent.insertBefore(newBanner, bannerInfo.nextSibling);
    } else {
      bannerInfo.parent.appendChild(newBanner);
    }
    
    log("[Cookie Simplifier] Restored banner to DOM: " + (newBanner.id || newBanner.tagName));
  } catch (error) {
    log(`[Cookie Simplifier] Error restoring banner: ${error.message}`);
  }
}

// Main function to handle cookie banners
function handleCookieBanners() {
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
    
    const bannerContent = extractBannerContent(banner);
    const buttons = extractButtons(banner);
    
    if (buttons.length === 0) {
      log("[Cookie Simplifier] No buttons found in banner");
      return;
    }
    
    removeBanner(banner);
    const simplifiedBanner = createSimplifiedBanner(banner, buttons, bannerContent);
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
            if (node.matches && node.matches(selector)) {
              log(`[Cookie Simplifier] OneTrust banner detected via observer: ${selector}`);
              handleCookieBanners();
              return;
            }
            if (node.querySelector && node.querySelector(selector)) {
              log(`[Cookie Simplifier] OneTrust banner detected via observer (contains): ${selector}`);
              handleCookieBanners();
              return;
            }
          }
          
          // Check if it's a general banner but not a false positive
          for (const selector of GENERAL_BANNER_SELECTORS) {
            if (node.matches && node.matches(selector) && !shouldExclude(node)) {
              log(`[Cookie Simplifier] General banner detected via observer: ${selector}`);
              handleCookieBanners();
              return;
            }
            if (node.querySelector && node.querySelector(selector)) {
              const childBanner = node.querySelector(selector);
              if (!shouldExclude(childBanner)) {
                log(`[Cookie Simplifier] General banner detected via observer (contains): ${selector}`);
                handleCookieBanners();
                return;
              }
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
    log("[Cookie Simplifier] Settings changed, updating");
    
    extensionEnabled = message.settings.enabled;
    debugMode = message.settings.debugMode;
    
    log(`[Cookie Simplifier] New settings: enabled=${extensionEnabled}, debugMode=${debugMode}`);
    
    if (extensionEnabled) {
      log("[Cookie Simplifier] Extension enabled, handling banners");
      handleCookieBanners();
      setupObserver();
    } else {
      log("[Cookie Simplifier] Extension disabled, removing banners");
      removeExistingBanners();
      restoreOriginalBanners();
      
      if (observer) {
        observer.disconnect();
        observer = null;
        log("[Cookie Simplifier] Disconnected observer");
      }
    }
  }
  
  return true;
});

init();