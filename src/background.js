console.log("[Cookie Simplifier] Background service worker started");
// Handle extension installation
chrome.runtime.onInstalled.addListener(() => {
  console.log("[Cookie Simplifier] Extension installed");
  
  // Set default settings
  chrome.storage.sync.set({
    enabled: true,
    debugMode: true,
    excludedDomains: []
  });
});
// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Cookie Simplifier] Received message:", message);
  
  if (message.action === "getSettings") {
    chrome.storage.sync.get(['enabled', 'debugMode', 'excludedDomains'], (data) => {
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
    chrome.storage.sync.get(['enabled', 'debugMode'], (settings) => {
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
  // Handle translation request
  if (message.action === "translateText") {
    console.log("[Cookie Simplifier] Background script: Received translation request");
    console.log("[Cookie Simplifier] Background script: Text to translate:", message.text);
    
    const apiKey = "JqkFmI0KQvz39VzqVQFrkSYgByr4tt8gG+9OVU4rTdMpyxeCA9PP11H0o1mJk3ZUrJj1+qCadt//khtU/Vt00hlAFnqdu7/7XyhaH2bUqMTARbAv2OFU99WPXc+i";
    const url = "https://api.llm7.io/v1/chat/completions";
    
    const prompt = `
      Translate the following cookie banner text from English to Persian.
      Also, identify any cookie categories or subcategories that are always enabled (like "Strictly Necessary Cookies").
      
      Return the response in this JSON format:
      {
        "translatedText": "The translated text in Persian",
        "alwaysEnabledItems": [
          {
            "name": "Strictly Necessary Cookies",
            "type": "category"  // or "subcategory"
          },
          {
            "name": "Essential Cookies",
            "type": "subcategory",
            "parentCategory": "Functional Cookies"  // only for subcategories
          }
        ]
      }
      
      Text to translate:
      ${message.text}
      `;
    
    console.log("[Cookie Simplifier] Background script: About to send API request to:", url);
    
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that translates cookie banner text from English to Persian and identifies always-enabled categories and subcategories."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 1000
      })
    })
    .then(response => {
      console.log("[Cookie Simplifier] Background script: API response received, status:", response.status);
      console.log("[Cookie Simplifier] Background script: API response headers:", response.headers);
      
      if (!response.ok) {
        return response.text().then(text => {
          console.error("[Cookie Simplifier] Background script: API error response:", text);
          throw new Error(`API request failed with status ${response.status}: ${text}`);
        });
      }
      return response.json();
    })
    .then(data => {
      console.log("[Cookie Simplifier] Background script: Parsed API response:", data);
      
      if (data.choices && data.choices.length > 0) {
        const content = data.choices[0].message.content;
        console.log("[Cookie Simplifier] Background script: Content from API:", content);
        
        try {
          const parsedResponse = JSON.parse(content);
          console.log("[Cookie Simplifier] Background script: Parsed JSON response:", parsedResponse);
          
          sendResponse({
            translatedText: parsedResponse.translatedText || message.text,
            alwaysEnabledItems: parsedResponse.alwaysEnabledItems || []
          });
        } catch (parseError) {
          console.error("[Cookie Simplifier] Background script: Error parsing JSON:", parseError);
          sendResponse({
            translatedText: message.text,
            alwaysEnabledItems: []
          });
        }
      } else {
        console.error("[Cookie Simplifier] Background script: No choices in response");
        throw new Error("No choices returned from API");
      }
    })
    .catch(error => {
      console.error("[Cookie Simplifier] Background script: Error in API call:", error);
      sendResponse({
        error: error.message,
        translatedText: message.text,
        alwaysEnabledItems: []
      });
    });

    return true; // Indicates we will send a response asynchronously
  }

  // New handler for processing customization HTML with LLM
  if (message.action === "processCustomization") {
    console.log("[Cookie Simplifier] Background script: Received processCustomization request");

    const apiKey = "JqkFmI0KQvz39VzqVQFrkSYgByr4tt8gG+9OVU4rTdMpyxeCA9PP11H0o1mJk3ZUrJj1+qCadt//khtU/Vt00hlAFnqdu7/7XyhaH2bUqMTARbAv2OFU99WPXc+i";
    const url = "https://api.llm7.io/v1/chat/completions";

    // Stringify patterns and translations for the prompt
    const patternsStr = JSON.stringify(message.categoryPatterns.map(p => ({
      pattern: p.pattern.source, // Regex source for matching
      key: p.key
    })));
    const translationsStr = JSON.stringify(message.translations);
    
  const prompt = `
You are an expert in parsing and restructuring cookie preference HTML. Analyze the given data carefully as a human interacting with a website would.

Given this HTML (which may include CSS and JS):
${message.html}

1. Parse the HTML to extract all cookie categories and subcategories.
2. For category names:
   - Match the original English name against these regex patterns: ${patternsStr}
   - If it matches a pattern, use the corresponding translation from: ${translationsStr}
   - If no match, translate the name naturally to Persian.
3. For descriptions:
   - Extract the description text.
   - Translate it to Persian.
   - Summarize description concisely while keeping key information.
4. For each category/subcategory:
   - Boolean values must be answered with true or false, not null.
   - Determine if it has a toggle (checkbox or radio). If not, set isTextOnly: true.
   - If it has a toggle, extract:
     - isChecked: true if checked, false otherwise.
     - isDisabled: true if disabled, false otherwise.
     - toggleId: the id attribute of the input if present, otherwise null.
     - toggleName: the name attribute if present, otherwise null.
     - toggleValue: the value attribute if present, otherwise null.
   - If no toggle or it's a descriptive section only, mark as isTextOnly: true.
   - Always-enabled: Typically if isDisabled or it has text indicators like "always active", "necessary", "cannot be disabled".
5. Ignore non-category elements like headers, footers, or save buttons.

IMPORTANT: Return ONLY the following JSON structure with no additional text, explanations, or markdown formatting:
{
  "categories": [
    {
      "originalName": "Original English name",
      "translatedName": "Translated Persian name",
      "description": "Translated and summarized Persian description",
      "isChecked": true/false,
      "isDisabled": true/false,
      "toggleId": "id" or null,
      "toggleName": "name" or null,
      "toggleValue": "value" or null,
      "isTextOnly": true/false,
      "isAlwaysEnabled": true/false,
      "subChoices": [
        {
          "originalName": "Original sub name",
          "translatedName": "Translated sub name",
          "description": "Translated sub desc",
          "isChecked": true/false,
          "isDisabled": true/false,
          "toggleId": "id" or null,
          "toggleName": "name" or null,
          "toggleValue": "value" or null,
          "isTextOnly": true/false,
          "isAlwaysEnabled": true/false
        }
      ]
    }
  ]
}
`;
  
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that parses, translates, and structures cookie preference HTML into JSON. Return only valid JSON with no additional text."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.2, 
      max_tokens: 3000
    })
  })
  .then(response => {
    if (!response.ok) {
      return response.text().then(text => { 
        console.error("[Cookie Simplifier] Background script: API error:", text);
        throw new Error(`API failed: ${text}`); 
      });
    }
    return response.json();
  })
  .then(data => {
    if (data.choices && data.choices.length > 0) {
      let content = data.choices[0].message.content;
      console.log("[Cookie Simplifier] Background script: Raw LLM response:", content);
      
      // Clean the response before parsing
      content = content.trim();
      
      // Remove any markdown code block formatting if present
      if (content.startsWith('```json')) {
        content = content.substring(7);
      }
      if (content.endsWith('```')) {
        content = content.substring(0, content.length - 3);
      }
      
      // Try to find JSON object boundaries in case there's extra text
      const jsonStart = content.indexOf('{');
      const jsonEnd = content.lastIndexOf('}');
      
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        content = content.substring(jsonStart, jsonEnd + 1);
      }
      
      try {
        const parsed = JSON.parse(content);
        console.log("[Cookie Simplifier] Background script: Successfully parsed JSON");
        sendResponse(parsed);
      } catch (e) {
        console.error("[Cookie Simplifier] Background script: JSON parse error:", e);
        console.error("[Cookie Simplifier] Background script: Content that failed to parse:", content);
        sendResponse({ error: "Failed to parse JSON from LLM" });
      }
    } else {
      console.error("[Cookie Simplifier] Background script: No choices in LLM response");
      sendResponse({ error: "No response from LLM" });
    }
  })
  .catch(error => {
    console.error("[Cookie Simplifier] Background script: LLM error:", error);
    sendResponse({ error: error.message });
  });
  return true; // Async response
}
  
});