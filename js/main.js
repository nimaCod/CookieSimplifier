import { 
  getSettings, 
  extensionEnabled, 
  debugMode, 
  observer,
  isProcessing
} from './utils.js';
import { 
  handleCookieBanners, 
  setupObserver, 
  removeExistingBanners, 
  restoreOriginalBanners 
} from './handlers.js';

// Initialize
function init() {
  console.log("[Cookie Simplifier] Content script loaded");
  
  getSettings((settings) => {
    if (!settings.enabled) {
      console.log("[Cookie Simplifier] Extension is disabled, skipping initialization");
      return;
    }
    
    if (document.readyState === 'complete') {
      console.log("[Cookie Simplifier] Document already loaded");
      // Add a delay to ensure banners are loaded
      setTimeout(() => {
        handleCookieBanners();
        setupObserver();
      }, 1000);
    } else {
      console.log("[Cookie Simplifier] Waiting for document to load");
      window.addEventListener('load', () => {
        console.log("[Cookie Simplifier] Document loaded");
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
    console.log("[Cookie Simplifier] Settings changed, updating extension state");
    
    extensionEnabled = message.settings.enabled;
    debugMode = message.settings.debugMode;
    const autoOpenCustomization = message.settings.autoOpenCustomization;
    
    if (extensionEnabled) {
      console.log("[Cookie Simplifier] Extension enabled, checking for banners");
      handleCookieBanners();
      setupObserver();
    } else {
      console.log("[Cookie Simplifier] Extension disabled, removing simplified banner and restoring original");
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

// Start the extension
init();