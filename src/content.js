console.log("[Cookie Simplifier] Content script loaded");

// Global variables to track extension state
let extensionEnabled = true;
let debugMode = true;
let isProcessing = false; // Flag to prevent re-entrancy
let observer = null; // Reference to our observer
let originalBanners = new Map(); // Track original banners we've removed
let lastProcessed = 0; // For MutationObserver throttling

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

// Common selectors for cookie banners
const BANNER_SELECTORS = [
  '[id*="cookie"]',
  '[class*="cookie"]',
  '[id*="consent"]',
  '[class*="consent"]',
  '[id*="gdpr"]',
  '[class*="gdpr"]',
  '#onetrust-banner-sdk', // OneTrust banner
  '#onetrust-consent-sdk', // OneTrust container
  '#truste-consent-track',
  '#onetrust-group-container',
  '.cc-window',
  '.cookie-banner',
  '.cookie-notice',
  '.consent-popup',
  '.gdpr-banner',
  '.privacy-banner',
  '.modal-backdrop',
  '[data-testid*="cookie"]',
  '[aria-label*="cookie"]',
  '[role="dialog"][aria-label*="privacy"]',
  '.eucookie',
  '.cookie-consent',
  '.cookie-policy',
  '.banner-consent',
  '[data-consent]',
  '[data-cy*="cookie"]',
  '.js-cookie-consent',
  '.cmp-container', // Consent Management Platforms
  '[data-cmp-host]'
];

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

// Find cookie banner
function findBanner() {
  log("[Cookie Simplifier] Searching for cookie banner...");
  
  // Check if running in an iframe
  if (window !== window.top) {
    log("[Cookie Simplifier] Running in iframe, checking for banners...");
  }

  // First try selectors
  for (const selector of BANNER_SELECTORS) {
    const elements = document.querySelectorAll(selector);
    log(`[Cookie Simplifier] Found ${elements.length} elements for selector: ${selector}`);
    
    for (const element of elements) {
      if (originalBanners.has(element)) {
        log("[Cookie Simplifier] Skipping already processed banner: " + (element.id || element.tagName));
        continue;
      }
      
      if (isVisible(element)) {
        log(`[Cookie Simplifier] Found visible banner with selector: ${selector}, ID: ${element.id || 'none'}, Class: ${element.className}`);
        return element;
      }
    }
  }

  // Heuristic check for elements with cookie-related text or styling
  const allElements = document.querySelectorAll('div, section, aside, dialog');
  log(`[Cookie Simplifier] Checking ${allElements.length} elements for heuristic match`);
  for (const element of allElements) {
    if (originalBanners.has(element)) continue;
    if (isVisible(element)) {
      const text = element.textContent.toLowerCase();
      if (text.includes('cookie') || text.includes('consent') || text.includes('gdpr') || text.includes('privacy')) {
        for (const selector of BANNER_SELECTORS) {
          if (element.matches(selector) || element.querySelector(selector)) {
            log(`[Cookie Simplifier] Found banner via heuristic and selector: ${selector}, ID: ${element.id || 'none'}`);
            return element;
          }
        }
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

// Extract text content from banner
function extractBannerText(banner) {
  log("[Cookie Simplifier] Extracting banner text...");
  
  const textSelectors = [
    '#onetrust-policy-text', // OneTrust
    '.banner-text',
    '.cookie-message',
    '.consent-message',
    '.privacy-notice',
    '.cookie-notice-text',
    '[data-testid*="message"]',
    '[data-consent*="message"]',
    '.cmp-intro_intro', // Quantcast
    '.cookie-consent__message',
    'p:not(:empty)', // Non-empty paragraphs
    'div:not(:empty)' // Non-empty divs as fallback
  ];
  
  let textContent = '';
  
  try {
    // Try specific selectors
    for (const selector of textSelectors) {
      const textElement = banner.querySelector(selector);
    //   if (textElement && textElement.textContent.trim().length > 20) {
    //     const tempDiv = textElement.cloneNode(true);
    //     // Remove unwanted nested elements
    //     const unwanted = tempDiv.querySelectorAll('a, button, span.ot-tcf2-vendor-count, [class*="vendor-count"], [id*="button"], [class*="button"]');
    //     unwanted.forEach(el => el.remove());
    //     textContent = tempDiv.textContent.trim();
    //     if (textContent.length > 20) {
    //       log(`[Cookie Simplifier] Found text using selector: ${selector}, Text: "${textContent.substring(0, 50)}..."`);
    //       break;
    //     }
    //   }
    }
    
    // Fallback: Clone banner and remove interactive elements
    if (!textContent) {
      const tempDiv = banner.cloneNode(true);
      const interactive = tempDiv.querySelectorAll('button, a, [role="button"], input, select, [id*="button"], [class*="button"]');
      interactive.forEach(el => el.remove());
      textContent = tempDiv.textContent.trim();
      if (textContent.length < 20) {
        textContent = '';
      }
      log("[Cookie Simplifier] Extracted text from entire banner (excluding interactive elements): " + (textContent.substring(0, 50) || 'empty') + "...");
    }
    
    // Clean up text
    textContent = textContent.replace(/\s+/g, ' ').trim(); // Normalize whitespace
    textContent = textContent.replace(/<[^>]+>/g, ''); // Remove HTML tags
    // if (textContent.length > 200) {
    //   textContent = textContent.substring(0, 200) + '...';
    // }
    
    log(`[Cookie Simplifier] Final extracted text: "${textContent}"`);
    return textContent || 'This website uses cookies to enhance your experience. Please choose an option below.';
  } catch (error) {
    log(`[Cookie Simplifier] Error extracting text: ${error.message}`);
    return 'This website uses cookies to enhance your experience. Please choose an option below.';
  }
}

// Extract buttons from banner
function extractButtons(banner) {
  log("[Cookie Simplifier] Extracting buttons from banner...");
  const buttons = [];
  
  const buttonKeywords = {
    accept: ['accept', 'agree', 'allow', 'ok', 'confirm', 'got it', 'understand'],
    reject: ['reject', 'decline', 'deny', 'disagree', 'no thanks', 'opt out'],
    customize: ['customize', 'settings', 'preferences', 'manage', 'options']
    // Exclude 'close' to prevent extracting OneTrust close button
  };

  try {
    // OneTrust buttons
    const oneTrustButtons = [
      { id: '#onetrust-accept-btn-handler', type: 'accept', defaultText: 'Accept All' },
      { id: '#onetrust-reject-all-handler', type: 'reject', defaultText: 'Necessary Cookies Only' },
      { id: '#onetrust-pc-btn-handler', type: 'customize', defaultText: 'Customize Settings' }
    ];

    oneTrustButtons.forEach(({ id, type, defaultText }) => {
      const button = banner.querySelector(id);
      if (button && isVisible(button)) {
        buttons.push({
          type,
          element: button,
          text: button.textContent.trim() || defaultText
        });
        log(`[Cookie Simplifier] Found OneTrust ${type.toUpperCase()} button: "${button.textContent.trim()}"`);
      } else if (button) {
        log(`[Cookie Simplifier] OneTrust ${type.toUpperCase()} button found but not visible`);
      } else {
        log(`[Cookie Simplifier] OneTrust ${type.toUpperCase()} button not found`);
      }
    });

    // If we found OneTrust buttons, skip general search
    if (buttons.length > 0) {
      log(`[Cookie Simplifier] Found ${buttons.length} OneTrust buttons, skipping general search`);
      return buttons;
    }
    
    // General buttons
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

// Create simplified banner
function createSimplifiedBanner(banner, buttons, bannerText) {
  log("[Cookie Simplifier] Creating simplified banner...");
  
  try {
    // Remove existing simplified banner
    const existingBanner = document.getElementById('simplified-cookie-banner');
    if (existingBanner) {
      log("[Cookie Simplifier] Simplified banner already exists, removing old one");
      existingBanner.remove();
    }
    
    const newBanner = document.createElement('div');
    newBanner.id = 'simplified-cookie-banner';
    newBanner.setAttribute('role', 'dialog');
    newBanner.setAttribute('aria-label', 'Cookie Preferences');
    newBanner.style.position = 'fixed';
    newBanner.style.bottom = '20px';
    newBanner.style.right = '20px';
    newBanner.style.width = '350px';
    newBanner.style.maxHeight = '70vh';
    newBanner.style.overflowY = 'auto';
    newBanner.style.backgroundColor = 'white';
    newBanner.style.border = '1px solid #ccc';
    newBanner.style.padding = '15px';
    newBanner.style.zIndex = '9999999';
    newBanner.style.boxShadow = '0 0 10px rgba(0,0,0,0.2)';
    newBanner.style.borderRadius = '5px';
    newBanner.style.fontFamily = 'Arial, sans-serif';
    
    // Title
    const title = document.createElement('h4');
    title.textContent = 'Cookie Preferences';
    title.style.marginTop = '0';
    title.style.marginBottom = '10px';
    newBanner.appendChild(title);
    
    // Banner text
    const textContainer = document.createElement('div');
    textContainer.textContent = bannerText;
    textContainer.style.marginBottom = '15px';
    textContainer.style.fontSize = '14px';
    textContainer.style.lineHeight = '1.4';
    newBanner.appendChild(textContainer);
    
    // Button container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.flexWrap = 'wrap';
    buttonContainer.style.gap = '8px';
    buttonContainer.style.marginTop = '10px';
    
    // Add original buttons
    buttons.forEach(button => {
      const btn = document.createElement('button');
      btn.textContent = button.text;
      btn.setAttribute('tabindex', '0');
      btn.style.padding = '8px 12px';
      btn.style.cursor = 'pointer';
      btn.style.border = 'none';
      btn.style.borderRadius = '3px';
      btn.style.fontSize = '14px';
      btn.style.flex = '1 0 calc(50% - 8px)';
      btn.style.minWidth = '120px';
      
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
      });
      
      // Add keyboard support
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
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
      });
      
      buttonContainer.appendChild(btn);
    });
    
    newBanner.appendChild(buttonContainer);
    
    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', 'Close cookie preferences');
    closeBtn.setAttribute('tabindex', '0');
    closeBtn.style.position = 'absolute';
    closeBtn.style.top = '5px';
    closeBtn.style.right = '5px';
    closeBtn.style.background = 'none';
    closeBtn.style.border = 'none';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.fontSize = '16px';
    closeBtn.addEventListener('click', () => {
      log("[Cookie Simplifier] Closed simplified banner");
      newBanner.remove();
    });
    closeBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        log("[Cookie Simplifier] Keyboard closed simplified banner");
        newBanner.remove();
      }
    });
    newBanner.appendChild(closeBtn);
    
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
    
    const bannerText = extractBannerText(banner);
    const buttons = extractButtons(banner);
    
    if (buttons.length === 0) {
      log("[Cookie Simplifier] No buttons found in banner");
      return;
    }
    
    removeBanner(banner);
    const simplifiedBanner = createSimplifiedBanner(banner, buttons, bannerText);
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
    if (now - lastProcessed < 1000) { // Increased throttle to 1s
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
      
      let hasBanner = false;
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          for (const selector of BANNER_SELECTORS) {
            if (node.matches && node.matches(selector)) {
              log(`[Cookie Simplifier] Mutation matched selector: ${selector}`);
              hasBanner = true;
              break;
            }
            if (node.querySelector && node.querySelector(selector)) {
              log(`[Cookie Simplifier] Mutation contains selector: ${selector}`);
              hasBanner = true;
              break;
            }
          }
        }
        if (hasBanner) break;
      }
      
      if (hasBanner) {
        log("[Cookie Simplifier] DOM nodes added that match banner selectors");
        handleCookieBanners();
        break;
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
      handleCookieBanners();
      setupObserver();
    } else {
      log("[Cookie Simplifier] Waiting for document to load");
      window.addEventListener('load', () => {
        log("[Cookie Simplifier] Document loaded");
        handleCookieBanners();
        setupObserver();
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

// Start the extension
init();