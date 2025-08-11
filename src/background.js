console.log("[Cookie Simplifier] Background service worker started");
// Handle extension installation
chrome.runtime.onInstalled.addListener(() => {
  console.log("[Cookie Simplifier] Extension installed");
  
  // Set default settings
  chrome.storage.sync.set({
    enabled: true,
    debugMode: true,
    autoOpenCustomization: true, // Default to auto-open
    excludedDomains: []
  });
});
// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Cookie Simplifier] Received message:", message);
  
  if (message.action === "getSettings") {
    chrome.storage.sync.get(['enabled', 'debugMode', 'autoOpenCustomization', 'excludedDomains'], (data) => {
      sendResponse(data);
    });
    return true; // Indicates async response
  }
  
  if (message.action === "updateSettings") {
    chrome.storage.sync.set(message.settings, () => {
      console.log("[Cookie Simplifier] Settings updated:", message.settings);
      sendResponse({ success: true });
    });
    return true;
  }
  
  // Forward settings changes to all tabs
  if (message.action === "settingsChanged") {
    console.log("[Cookie Simplifier] Forwarding settings change to all tabs");
    
    // Get current settings
    chrome.storage.sync.get(['enabled', 'debugMode', 'autoOpenCustomization'], (settings) => {
      // Notify all tabs about the settings change
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, {
            action: "settingsChanged",
            settings: settings
          }, (response) => {
            if (chrome.runtime.lastError) {
              console.log("[Cookie Simplifier] Error sending message to tab:", chrome.runtime.lastError.message);
            }
          });
        });
      });
    });
    
    sendResponse({ success: true });
    return true;
  }
});