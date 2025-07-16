// N8N Integration for sending summaries to Notion
class N8NIntegration {
  
  // Get N8N webhook URL from storage
  static async getN8NEndpoint() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['n8nEndpoint'], (result) => {
        if (chrome.runtime.lastError) {
          console.error('Error getting N8N endpoint:', chrome.runtime.lastError);
          resolve(null);
          return;
        }
        resolve(result.n8nEndpoint || null);
      });
    });
  }

  // Send data to N8N webhook
  static async sendToN8N(data) {
    // const endpoint = await this.getN8NEndpoint();
    const endpoint = 'https://example.invalid/webhook/REDACTED';
    
    if (!endpoint) {
      throw new Error('N8N endpoint not configured. Please set your N8N webhook URL in the extension settings.');
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          timestamp: new Date().toISOString(),
          source: 'summary-extension'
        })
      });

      if (!response.ok) {
        throw new Error(`N8N request failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('N8N request error:', error);
      throw error;
    }
  }

  // Send summary to Notion via N8N
  static async sendSummaryToNotion(summaryData) {
    const payload = {
      action: 'add_to_notion',
      type: 'summary',
      data: {
        title: summaryData.title || 'Summary',
        transcript: summaryData.content,
        url: summaryData.url,
        source: summaryData.source || 'web',
        tags: summaryData.tags || [],
        course: summaryData.course,
        module: summaryData.module,
        duration: summaryData.duration,
        lesson: summaryData.lesson,
        transcript: summaryData.transcript
      }
    };

    return await this.sendToN8N(payload);
  }

  // Set button loading state
  static setButtonLoading(button, loadingText = 'Sending...') {
    if (!button) return '';
    
    const originalHTML = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `
      <div style="width: 16px; height: 16px; border: 2px solid #ffffff; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 8px;"></div>
      ${loadingText}
    `;
    
    // Add spinner animation if not exists
    if (!document.querySelector('#n8n-spinner-style')) {
      const style = document.createElement('style');
      style.id = 'n8n-spinner-style';
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }
    
    return originalHTML;
  }

  // Reset button state
  static resetButton(button, originalHTML) {
    if (!button) return;
    
    button.disabled = false;
    button.innerHTML = originalHTML;
  }

  // Show success message
  static showSuccessMessage(message = 'Successfully sent to Notion!') {
    // Create or update success notification
    let notification = document.querySelector('#n8n-success-notification');
    if (!notification) {
      notification = document.createElement('div');
      notification.id = 'n8n-success-notification';
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10001;
        background: #10a37f;
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        transform: translateX(100%);
        transition: transform 0.3s ease;
      `;
      document.body.appendChild(notification);
    }
    
    notification.textContent = message;
    
    // Animate in
    setTimeout(() => {
      notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Animate out after 3 seconds
    setTimeout(() => {
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }

  // Show error message
  static showErrorMessage(message) {
    // Create or update error notification
    let notification = document.querySelector('#n8n-error-notification');
    if (!notification) {
      notification = document.createElement('div');
      notification.id = 'n8n-error-notification';
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10001;
        background: #dc3545;
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        transform: translateX(100%);
        transition: transform 0.3s ease;
        cursor: pointer;
      `;
      document.body.appendChild(notification);
      
      // Click to dismiss
      notification.addEventListener('click', () => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 300);
      });
    }
    
    notification.textContent = message;
    
    // Animate in
    setTimeout(() => {
      notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 300);
      }
    }, 5000);
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.N8NIntegration = N8NIntegration;
}