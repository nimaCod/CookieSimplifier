import { log, createCheckbox, createDisabledCheckbox } from './utils.js';
import { OVERLAY_SELECTORS } from './constants.js';

// Create an accordion category item with sub-choices
export function createAccordionCategory(categoryName, description, toggleElement, isAlwaysActive = false, subChoices = []) {
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

// Create fallback customization content
export function createFallbackCustomizationContent() {
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
export function createSimplifiedBanner(banner, buttons, bannerContent, customizationContent) {
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
          
          setTimeout(() => {
            const cookieAfter = document.cookie;
            log(`[Cookie Simplifier] Cookie change check - Before: "${cookieBefore}", After: "${cookieAfter}"`);
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
            
            setTimeout(() => {
              const cookieAfter = document.cookie;
              log(`[Cookie Simplifier] Cookie change check - Before: "${cookieBefore}", After: "${cookieAfter}"`);
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
          
          setTimeout(() => {
            const cookieAfter = document.cookie;
            log(`[Cookie Simplifier] Cookie change check - Before: "${cookieBefore}", After: "${cookieAfter}"`);
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
            
            setTimeout(() => {
              const cookieAfter = document.cookie;
              log(`[Cookie Simplifier] Cookie change check - Before: "${cookieBefore}", After: "${cookieAfter}"`);
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
      
      // Try to find and click the save button in the original customization page
      const hiddenCustomizationPage = document.querySelector('#onetrust-pc-sdk[style*="display: none"]');
      if (hiddenCustomizationPage) {
        const saveButton = hiddenCustomizationPage.querySelector('.save-preference-btn, .btn-primary, .accept-btn');
        if (saveButton) {
          saveButton.click();
        } else {
          log("[Cookie Simplifier] Could not find save button in hidden customization page");
        }
      } else {
        log("[Cookie Simplifier] No hidden customization page found");
      }
      
      newBanner.remove();
    });
    
    // Add keyboard support for Accept Selection button
    acceptSelectionBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        log("[Cookie Simplifier] Accept Selection button triggered via keyboard");
        
        // Try to find and click the save button in the original customization page
        const hiddenCustomizationPage = document.querySelector('#onetrust-pc-sdk[style*="display: none"]');
        if (hiddenCustomizationPage) {
          const saveButton = hiddenCustomizationPage.querySelector('.save-preference-btn, .btn-primary, .accept-btn');
          if (saveButton) {
            saveButton.click();
          } else {
            log("[Cookie Simplifier] Could not find save button in hidden customization page");
          }
        } else {
          log("[Cookie Simplifier] No hidden customization page found");
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