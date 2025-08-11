import { log, isVisible, shouldExclude, originalBanners } from './utils.js';
import { 
  GENERAL_BANNER_SELECTORS, 
  BANNER_SELECTORS, 
  CONTENT_SELECTORS, 
  buttonKeywords,
  CUSTOMIZATION_SELECTORS,
  OVERLAY_SELECTORS
} from './constants.js';

// Find cookie banner
export function findBanner() {
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
export function extractBannerContent(banner) {
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
export function extractButtons(banner) {
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
export async function extractCustomizationContent(banner) {
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
                    
                    // Create accordion category item
                    const accordionCategory = createAccordionCategory(categoryName, description, toggle);
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
            
            // Create accordion category item
            const accordionCategory = createAccordionCategory(categoryName, description, toggle);
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