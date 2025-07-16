// Shared ChatGPT integration utilities for auto-paste and send functionality
// Used by both YouTube and Udemy content scripts

// Store prompt and open ChatGPT with auto-send
async function openChatGPTWithPrompt(prompt, platformName = 'Video', platformColor = '#10a37f') {
  try {
    // Copy to clipboard
    await navigator.clipboard.writeText(prompt);
    
    // Show enhanced notification with instructions
    showChatGPTNotification(platformName, platformColor);
    
    // Store for auto-injection and open ChatGPT
    chrome.storage.local.set({ 
      pendingChatGptPrompt: prompt,
      promptTimestamp: Date.now()
    });
    
    window.open('https://chat.openai.com/', '_blank');
    
  } catch (clipboardError) {
    console.warn('Clipboard access failed, showing manual copy modal');
    showTranscriptModal(prompt, platformName, platformColor);
  }
}

// Show enhanced notification for ChatGPT integration
function showChatGPTNotification(platformName = 'Video', platformColor = '#10a37f') {
  const notification = document.createElement('div');
  notification.innerHTML = `
    <div style="display: flex; align-items: flex-start; gap: 12px;">
      <div style="width: 24px; height: 24px; background: ${platformColor}; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px;">
        <div style="width: 8px; height: 4px; border: 2px solid white; border-top: none; border-right: none; transform: rotate(-45deg); margin-top: -2px;"></div>
      </div>
      <div>
        <div style="font-weight: 600; margin-bottom: 4px;">Ready for ChatGPT! 🚀</div>
        <div style="font-size: 13px; opacity: 0.9; line-height: 1.4;">
          ${platformName} transcript copied! Opening ChatGPT...<br>
          <strong>The message will be automatically pasted and sent!</strong>
        </div>
      </div>
    </div>
  `;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, ${platformColor} 0%, ${adjustColor(platformColor, -20)} 100%);
    color: white;
    padding: 16px 20px;
    border-radius: 12px;
    z-index: 10000;
    font-size: 14px;
    max-width: 320px;
    box-shadow: 0 8px 32px ${platformColor}4D;
    animation: slideInBounce 0.5s ease-out;
  `;
  
  addChatGPTNotificationStyles();
  document.body.appendChild(notification);
  
  // Auto-remove notification with bounce out
  setTimeout(() => {
    notification.style.animation = 'slideOutBounce 0.4s ease-in';
    setTimeout(() => notification.remove(), 400);
  }, 6000);
}

// Enhanced modal for manual copying with better UX
function showTranscriptModal(prompt, platformName = 'Video', platformColor = '#10a37f') {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.8);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.3s ease-out;
  `;
  
  const content = document.createElement('div');
  content.style.cssText = `
    background: white;
    padding: 24px;
    border-radius: 12px;
    max-width: 80%;
    max-height: 80%;
    overflow: auto;
    box-shadow: 0 20px 40px rgba(0,0,0,0.3);
    animation: scaleIn 0.3s ease-out;
  `;
  
  content.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
      <div style="width: 32px; height: 32px; background: ${platformColor}; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
          <path d="M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4M12,6A6,6 0 0,1 18,12A6,6 0 0,1 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6M12,8A4,4 0 0,0 8,12A4,4 0 0,0 12,16A4,4 0 0,0 16,12A4,4 0 0,0 12,8Z" />
        </svg>
      </div>
      <h3 style="margin: 0; color: #333; font-size: 18px; font-weight: 600;">Ready for ChatGPT</h3>
    </div>
    <p style="margin: 0 0 16px 0; color: #666; font-size: 14px;">The ${platformName.toLowerCase()} transcript has been formatted and is ready to paste into ChatGPT. Click the button below to copy and then paste it into ChatGPT.</p>
    <textarea readonly id="transcript-text" style="width: 100%; height: 300px; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-family: monospace; font-size: 12px; resize: vertical;">${prompt}</textarea>
    <div style="margin-top: 20px; display: flex; gap: 12px; justify-content: flex-end;">
      <button onclick="this.closest('[style*=fixed]').remove()" style="background: #f0f0f0; color: #333; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: 500;">Cancel</button>
      <button onclick="copyAndOpenChatGPT()" style="background: ${platformColor}; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: 500; display: flex; align-items: center; gap: 8px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z" />
        </svg>
        Copy & Open ChatGPT
      </button>
    </div>
  `;
  
  // Add animations if not already present
  addChatGPTNotificationStyles();
  
  // Add copy function to window
  window.copyAndOpenChatGPT = async function() {
    const textarea = document.getElementById('transcript-text');
    textarea.select();
    
    try {
      await navigator.clipboard.writeText(textarea.value);
      
      // Store for auto-injection
      chrome.storage.local.set({ 
        pendingChatGptPrompt: textarea.value,
        promptTimestamp: Date.now()
      });
      
      // Show success feedback
      const button = event.target.closest('button');
      const originalText = button.innerHTML;
      button.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M9,20.42L2.79,14.21L5.62,11.38L9,14.77L18.88,4.88L21.71,7.71L9,20.42Z" />
        </svg>
        Copied!
      `;
      button.style.background = '#22c55e';
      
      setTimeout(() => {
        modal.remove();
        window.open('https://chat.openai.com/', '_blank');
      }, 1000);
      
    } catch (err) {
      textarea.select();
      alert('Please copy the text manually (Ctrl+C or Cmd+C)');
    }
  };
  
  modal.appendChild(content);
  document.body.appendChild(modal);
  
  // Auto-select text
  setTimeout(() => {
    content.querySelector('textarea').select();
  }, 100);
}

// Add notification styles
function addChatGPTNotificationStyles() {
  if (!document.querySelector('#chatgpt-shared-styles')) {
    const style = document.createElement('style');
    style.id = 'chatgpt-shared-styles';
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
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes scaleIn {
        from { transform: scale(0.9); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }
}

// Utility function to adjust color brightness
function adjustColor(color, percent) {
  const hex = color.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  const newR = Math.max(0, Math.min(255, r + (r * percent / 100)));
  const newG = Math.max(0, Math.min(255, g + (g * percent / 100)));
  const newB = Math.max(0, Math.min(255, b + (b * percent / 100)));
  
  return `#${Math.round(newR).toString(16).padStart(2, '0')}${Math.round(newG).toString(16).padStart(2, '0')}${Math.round(newB).toString(16).padStart(2, '0')}`;
}

// Create loading button state
function setButtonLoading(button, loadingText = 'Preparing...') {
  const originalHTML = button.innerHTML;
  button.innerHTML = `
    <div style="width: 16px; height: 16px; border: 2px solid #ffffff; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 8px;"></div>
    ${loadingText}
  `;
  button.disabled = true;
  return originalHTML;
}

// Reset button from loading state
function resetButton(button, originalHTML) {
  button.innerHTML = originalHTML;
  button.disabled = false;
}

// Export functions for global use
window.ChatGPTIntegration = {
  openChatGPTWithPrompt,
  showChatGPTNotification,
  showTranscriptModal,
  setButtonLoading,
  resetButton
};