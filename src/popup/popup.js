document.addEventListener('DOMContentLoaded', () => {
  console.log("[Cookie Simplifier] Popup loaded");
  
  const enableToggle = document.getElementById('enableToggle');
  const debugToggle = document.getElementById('debugToggle');
  const refreshButton = document.getElementById('refreshPage');
  const debugInfo = document.getElementById('debugInfo');
  
  // Get current settings
  chrome.runtime.sendMessage({ action: "getSettings" }, (settings) => {
    console.log("[Cookie Simplifier] Retrieved settings:", settings);
    
    if (settings.enabled !== undefined) {
      enableToggle.checked = settings.enabled;
    }
    
    if (settings.debugMode !== undefined) {
      debugToggle.checked = settings.debugMode;
    }
    
    // If extension is disabled, disable other toggles
    if (!settings.enabled) {
      debugToggle.disabled = true;
    }
    
    updateDebugInfo(settings);
  });
  
  // Handle enable toggle
  enableToggle.addEventListener('change', () => {
    const enabled = enableToggle.checked;
    console.log("[Cookie Simplifier] Extension enabled:", enabled);
    
    // If disabling extension, also disable debug mode and auto-open
    let debugMode = debugToggle.checked;
    if (!enabled) {
      debugMode = false;
      debugToggle.checked = false;
      debugToggle.disabled = true;
    } else {
      debugToggle.disabled = false;
    }
    
    // Update settings
    chrome.runtime.sendMessage({
      action: "updateSettings",
      settings: { enabled, debugMode }
    }, (response) => {
      if (response && response.success) {
        updateDebugInfo({ enabled, debugMode });
        
        // Notify all active tabs about the change
        notifyTabsOfSettingsChange();
      }
    });
  });
  
  // Handle debug toggle
  debugToggle.addEventListener('change', () => {
    const debugMode = debugToggle.checked;
    console.log("[Cookie Simplifier] Debug mode:", debugMode);
    
    // Update settings
    chrome.runtime.sendMessage({
      action: "updateSettings",
      settings: { debugMode }
    }, (response) => {
      if (response && response.success) {
        updateDebugInfo({ debugMode });
        // Notify all active tabs about the change
        notifyTabsOfSettingsChange();
      }
    });
  });

  
  // Handle refresh button
  refreshButton.addEventListener('click', () => {
    console.log("[Cookie Simplifier] Refreshing current page");
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.reload(tabs[0].id);
    });
  });
  
  // Function to notify all tabs about settings changes
  function notifyTabsOfSettingsChange() {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { 
          action: "settingsChanged",
          settings: {
            enabled: enableToggle.checked,
            debugMode: debugToggle.checked,
          }
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.log("[Cookie Simplifier] Error sending message to tab:", chrome.runtime.lastError.message);
          }
        });
      });
    });
  }
  
  // Update debug info display
  function updateDebugInfo(settings) {
    let info = `<strong>Current Settings:</strong><br>`;
    info += `Extension: ${settings.enabled ? 'Enabled' : 'Disabled'}<br>`;
    info += `Debug Mode: ${settings.debugMode ? 'Enabled' : 'Disabled'}<br>`;
    info += `Excluded Domains: ${settings.excludedDomains ? settings.excludedDomains.length : 0}`;
    
    debugInfo.innerHTML = info;
  }
});