// ChatGPT auto-injection content script
console.log('ChatGPT content script loaded');

// Check if we're on ChatGPT
function isChatGPTPage() {
  return window.location.hostname === 'chat.openai.com' || window.location.hostname === 'chatgpt.com';
}

// Wait for ChatGPT interface to load with multiple selector attempts
function waitForChatGPTLoad() {
  return new Promise((resolve) => {
    let attempts = 0;
    const maxAttempts = 60; // 30 seconds max wait
    
    const checkForTextarea = () => {
      attempts++;
      
      // Multiple possible selectors for ChatGPT textarea
      const selectors = [
        'textarea[placeholder*="Message"]',
        'textarea[data-id="root"]', 
        '#prompt-textarea',
        'textarea[placeholder*="Send a message"]',
        'textarea[placeholder*="Type a message"]',
        '[contenteditable="true"][data-testid="textbox"]',
        'div[contenteditable="true"][role="textbox"]',
        'textarea',
        '[contenteditable="true"]'
      ];
      
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && (element.tagName === 'TEXTAREA' || element.contentEditable === 'true')) {
          console.log('Found ChatGPT input element with selector:', selector);
          resolve(element);
          return;
        }
      }
      
      if (attempts < maxAttempts) {
        setTimeout(checkForTextarea, 500);
      } else {
        console.warn('Could not find ChatGPT input element after maximum attempts');
        resolve(null);
      }
    };
    
    checkForTextarea();
  });
}

// Improved auto-paste and send function
async function autoPasteAndSend() {
  try {
    console.log('Checking for pending ChatGPT prompt...');
    
    // Get the pending prompt from storage
    const result = await chrome.storage.local.get(['pendingChatGptPrompt', 'promptTimestamp']);
    
    if (!result.pendingChatGptPrompt) {
      console.log('No pending prompt found');
      return;
    }
    
    console.log('Found pending prompt, checking timestamp...');
    
    // Check if prompt is recent (within 5 minutes - increased from 2)
    const now = Date.now();
    if (now - result.promptTimestamp > 300000) {
      console.log('Prompt too old, clearing...');
      chrome.storage.local.remove(['pendingChatGptPrompt', 'promptTimestamp']);
      return;
    }
    
    console.log('Waiting for ChatGPT interface to load...');
    
    // Wait for ChatGPT to load
    const inputElement = await waitForChatGPTLoad();
    
    if (!inputElement) {
      console.error('Could not find ChatGPT input element');
      showManualPasteNotification(result.pendingChatGptPrompt);
      return;
    }
    
    console.log('ChatGPT input found, starting auto-paste...');
    
    // Show notification that we're about to auto-paste
    showAutopasteNotification();
    
    // Wait a bit for user to see the notification and ChatGPT to be ready
    setTimeout(async () => {
      try {
        console.log('Setting prompt text...');
        
        // Handle both textarea and contenteditable elements
        if (inputElement.tagName === 'TEXTAREA') {
          // Standard textarea
          inputElement.value = result.pendingChatGptPrompt;
          inputElement.focus();
          
          // Trigger events
          inputElement.dispatchEvent(new Event('input', { bubbles: true }));
          inputElement.dispatchEvent(new Event('change', { bubbles: true }));
          inputElement.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
          inputElement.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
        } else {
          // Contenteditable div
          inputElement.focus();
          inputElement.textContent = result.pendingChatGptPrompt;
          
          // Trigger events for contenteditable
          inputElement.dispatchEvent(new Event('input', { bubbles: true }));
          inputElement.dispatchEvent(new Event('paste', { bubbles: true }));
          inputElement.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
        }
        
        console.log('Text set, waiting before sending...');
        
        // Wait longer for ChatGPT to process the input
        setTimeout(() => {
          console.log('Looking for send button...');
          
          // Multiple possible send button selectors
          const sendSelectors = [
            'button[data-testid="send-button"]',
            'button[aria-label*="Send"]',
            'button[aria-label*="send"]',
            'button:has(svg path[d*="M7 11"])',
            'button:has(svg path[d*="m12 3"])',
            'button[type="submit"]',
            'button:has(svg):not([disabled])',
            'button svg[data-testid="send-button"]',
            'button[class*="send"]'
          ];
          
          let sendButton = null;
          for (const selector of sendSelectors) {
            try {
              sendButton = document.querySelector(selector);
              if (sendButton && !sendButton.disabled && sendButton.offsetParent !== null) {
                console.log('Found send button with selector:', selector);
                break;
              }
            } catch (e) {
              // Some selectors might fail, continue
            }
          }
          
          if (sendButton && !sendButton.disabled) {
            console.log('Clicking send button...');
            sendButton.click();
            
            // Show success notification
            showSuccessNotification();
            
            // Clear the prompt from storage
            chrome.storage.local.remove(['pendingChatGptPrompt', 'promptTimestamp']);
          } else {
            console.log('Send button not found or disabled, showing manual instruction');
            showManualSendNotification();
          }
        }, 2000); // Increased wait time
        
      } catch (error) {
        console.error('Error auto-sending:', error);
        showManualSendNotification();
      }
    }, 3000); // Increased initial wait time
    
  } catch (error) {
    console.error('Error in auto-paste:', error);
    showManualPasteNotification();
  }
}

// Show notification for manual paste if auto-paste fails completely
function showManualPasteNotification(promptText = '') {
  const notification = document.createElement('div');
  notification.innerHTML = `
    <div style="display: flex; align-items: flex-start; gap: 12px;">
      <div style="width: 24px; height: 24px; background: #ef4444; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
          <path d="M11,9H13V7H11M12,20C7.59,20 4,16.41 4,4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,17H13V11H11V17Z" />
        </svg>
      </div>
      <div style="flex: 1;">
        <div style="font-weight: 600; margin-bottom: 4px;">Auto-paste failed</div>
        <div style="font-size: 12px; opacity: 0.9; margin-bottom: 8px;">Please paste manually using Ctrl+V or Cmd+V</div>
        ${promptText ? `<button onclick="navigator.clipboard.writeText(${JSON.stringify(promptText)}).then(() => this.textContent = 'Copied!')" style="background: #fff; color: #ef4444; border: 1px solid #fff; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer;">Copy Text</button>` : ''}
      </div>
    </div>
  `;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    color: white;
    padding: 16px 20px;
    border-radius: 12px;
    z-index: 10000;
    font-size: 14px;
    max-width: 320px;
    box-shadow: 0 8px 32px rgba(239, 68, 68, 0.3);
    animation: slideInBounce 0.5s ease-out;
  `;
  
  addNotificationStyles();
  document.body.appendChild(notification);
  
  // Remove after 8 seconds
  setTimeout(() => {
    notification.style.animation = 'slideOutBounce 0.4s ease-in';
    setTimeout(() => notification.remove(), 400);
  }, 8000);
}

// Show notification that auto-paste is happening
function showAutopasteNotification() {
  const notification = document.createElement('div');
  notification.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px;">
      <div style="width: 24px; height: 24px; border: 3px solid #10a37f; border-top: 3px solid transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
      <div>
        <div style="font-weight: 600; margin-bottom: 2px;">Auto-pasting YouTube transcript...</div>
        <div style="font-size: 12px; opacity: 0.8;">Message will be sent automatically</div>
      </div>
    </div>
  `;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #10a37f 0%, #0d8f6f 100%);
    color: white;
    padding: 16px 20px;
    border-radius: 12px;
    z-index: 10000;
    font-size: 14px;
    max-width: 300px;
    box-shadow: 0 8px 32px rgba(16, 163, 127, 0.3);
    animation: slideInBounce 0.5s ease-out;
  `;
  
  addNotificationStyles();
  document.body.appendChild(notification);
  
  // Remove after 3 seconds
  setTimeout(() => {
    notification.style.animation = 'slideOutBounce 0.4s ease-in';
    setTimeout(() => notification.remove(), 400);
  }, 3000);
}

// Show success notification
function showSuccessNotification() {
  const notification = document.createElement('div');
  notification.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px;">
      <div style="width: 24px; height: 24px; background: #22c55e; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
          <path d="M9,20.42L2.79,14.21L5.62,11.38L9,14.77L18.88,4.88L21.71,7.71L9,20.42Z" />
        </svg>
      </div>
      <div>
        <div style="font-weight: 600; margin-bottom: 2px;">Message sent successfully! 🎉</div>
        <div style="font-size: 12px; opacity: 0.8;">YouTube transcript summarization request delivered</div>
      </div>
    </div>
  `;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
    color: white;
    padding: 16px 20px;
    border-radius: 12px;
    z-index: 10000;
    font-size: 14px;
    max-width: 300px;
    box-shadow: 0 8px 32px rgba(34, 197, 94, 0.3);
    animation: slideInBounce 0.5s ease-out;
  `;
  
  addNotificationStyles();
  document.body.appendChild(notification);
  
  // Remove after 4 seconds
  setTimeout(() => {
    notification.style.animation = 'slideOutBounce 0.4s ease-in';
    setTimeout(() => notification.remove(), 400);
  }, 4000);
}

// Show manual send instruction if auto-send fails
function showManualSendNotification() {
  const notification = document.createElement('div');
  notification.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px;">
      <div style="width: 24px; height: 24px; background: #f59e0b; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
          <path d="M11,9H13V7H11M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,17H13V11H11V17Z" />
        </svg>
      </div>
      <div>
        <div style="font-weight: 600; margin-bottom: 2px;">Transcript pasted successfully!</div>
        <div style="font-size: 12px; opacity: 0.8;">Please click the Send button to submit your request</div>
      </div>
    </div>
  `;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    color: white;
    padding: 16px 20px;
    border-radius: 12px;
    z-index: 10000;
    font-size: 14px;
    max-width: 300px;
    box-shadow: 0 8px 32px rgba(245, 158, 11, 0.3);
    animation: slideInBounce 0.5s ease-out;
  `;
  
  addNotificationStyles();
  document.body.appendChild(notification);
  
  // Remove after 5 seconds
  setTimeout(() => {
    notification.style.animation = 'slideOutBounce 0.4s ease-in';
    setTimeout(() => notification.remove(), 400);
  }, 5000);
}

// Add notification styles
function addNotificationStyles() {
  if (!document.querySelector('#chatgpt-notification-styles')) {
    const style = document.createElement('style');
    style.id = 'chatgpt-notification-styles';
    style.textContent = `
      @keyframes slideInBounce {
        0% { transform: translateX(100%) scale(0.8); opacity: 0; }
        60% { transform: translateX(-10px) scale(1.05); opacity: 1; }
        100% { transform: translateX(0) scale(1); opacity: 1; }
      }
      @keyframes slideOutBounce {
        0% { transform: translateX(0) scale(1); opacity: 1; }
        100% { transform: translateX(100%) scale(0.8); opacity: 0; }
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }
}

// Initialize ChatGPT integration with better error handling
async function initChatGPTIntegration() {
  if (!isChatGPTPage()) {
    console.log('Not a ChatGPT page, skipping initialization');
    return;
  }
  
  console.log('ChatGPT page detected, initializing integration...');
  
  // Wait a bit for page to settle
  setTimeout(async () => {
    await autoPasteAndSend();
  }, 2000);
  
  // Also listen for storage changes with debouncing
  let storageChangeTimeout;
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.pendingChatGptPrompt && changes.pendingChatGptPrompt.newValue) {
      console.log('New pending prompt detected via storage change');
      
      // Debounce multiple rapid changes
      clearTimeout(storageChangeTimeout);
      storageChangeTimeout = setTimeout(autoPasteAndSend, 1500);
    }
  });
  
  // Listen for URL changes (ChatGPT is SPA)
  let currentUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== currentUrl) {
      currentUrl = location.href;
      console.log('ChatGPT navigation detected, re-checking for prompts...');
      setTimeout(autoPasteAndSend, 3000);
    }
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
}

// Start integration when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initChatGPTIntegration);
} else {
  initChatGPTIntegration();
}

// Also try again when window loads
window.addEventListener('load', () => {
  setTimeout(initChatGPTIntegration, 1000);
});