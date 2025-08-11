import { 
  log, 
  extensionEnabled, 
  isProcessing, 
  observer, 
  originalBanners, 
  lastProcessed,
  prefetchedCustomizationContent,
  getSettings 
} from './utils.js';
import { 
  findBanner, 
  extractBannerContent, 
  extractButtons, 
  extractCustomizationContent 
} from './extractors.js';
import { 
  createSimplifiedBanner, 
  createFallbackCustomizationContent 
} from './creators.js';
import { 
  ONETRUST_SELECTORS, 
  GENERAL_BANNER_SELECTORS,
  OVERLAY_SELECTORS 
} from './constants.js';

// Hide the original banner instead of removing it
export function hideBanner(banner) {
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
export function restoreBanner(bannerInfo) {
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
export async function handleCookieBanners() {
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
    
    // Prefetch customization content
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
export function setupObserver() {
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
export function removeExistingBanners() {
  const existingBanner = document.getElementById('simplified-cookie-banner');
  if (existingBanner) {
    existingBanner.remove();
    log("[Cookie Simplifier] Removed existing simplified banner");
  }
}

// Function to restore original banners
export function restoreOriginalBanners() {
  log("[Cookie Simplifier] Restoring original banners");
  
  originalBanners.forEach((bannerInfo, banner) => {
    restoreBanner(bannerInfo);
  });
  
  originalBanners.clear();
}