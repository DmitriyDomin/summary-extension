// Floating Window System for Chrome Extension
// This script creates a draggable, resizable floating window that replaces the popup

class FloatingWindow {
  constructor() {
    this.windowId = 'confetti-ai-floating-window';
    this.isOpen = false;
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };
    this.defaultSize = { width: 420, height: 640 };
    this.minSize = { width: 350, height: 500 };
    this.position = null;
    this.window = null;
    
    this.init();
  }

  init() {
    // Check if window already exists
    if (document.getElementById(this.windowId)) {
      this.show();
      return;
    }
    
    this.createWindow();
    this.loadContent();
  }

  createWindow() {
    // Create the floating window container
    this.window = document.createElement('div');
    this.window.id = this.windowId;
    this.window.innerHTML = `
      <div class="floating-window-header">
        <div class="floating-window-title">
          <div class="floating-window-icon">
            <i class="fas fa-sparkles"></i>
          </div>
          <span>Confetti AI</span>
        </div>
        <div class="floating-window-controls">
          <button class="floating-window-btn minimize-btn" title="Minimize">
            <i class="fas fa-minus"></i>
          </button>
          <button class="floating-window-btn close-btn" title="Close">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>
      <div class="floating-window-content" id="floating-content">
        <div class="loading-spinner">
          <div class="spinner"></div>
          <p>Loading Confetti AI...</p>
        </div>
      </div>
      <div class="floating-window-resize-handle"></div>
    `;

    // Add styles
    this.addStyles();
    
    // Get saved position or calculate default
    this.position = this.getSavedPosition();
    
    // Set initial position and size
    this.window.style.left = this.position.x + 'px';
    this.window.style.top = this.position.y + 'px';
    this.window.style.width = this.defaultSize.width + 'px';
    this.window.style.height = this.defaultSize.height + 'px';
    
    // Add to page
    document.body.appendChild(this.window);
    
    // Setup event listeners
    this.setupEventListeners();
    
    this.isOpen = true;
  }

  addStyles() {
    if (document.getElementById('floating-window-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'floating-window-styles';
    style.textContent = `
      #${this.windowId} {
        position: fixed;
        z-index: 999999;
        background: #ffffff;
        border-radius: 16px;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        border: 1px solid rgba(0, 0, 0, 0.08);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        resize: both;
        min-width: ${this.minSize.width}px;
        min-height: ${this.minSize.height}px;
      }

      #${this.windowId}:hover {
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.15);
      }

      #${this.windowId}.minimized {
        height: 48px !important;
        overflow: hidden;
      }

      .floating-window-header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 12px 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: move;
        user-select: none;
        border-radius: 16px 16px 0 0;
        min-height: 48px;
        box-sizing: border-box;
      }

      .floating-window-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        font-size: 16px;
      }

      .floating-window-icon {
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
      }

      .floating-window-controls {
        display: flex;
        gap: 8px;
      }

      .floating-window-btn {
        width: 28px;
        height: 28px;
        border: none;
        background: rgba(255, 255, 255, 0.2);
        color: white;
        border-radius: 6px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        font-size: 12px;
      }

      .floating-window-btn:hover {
        background: rgba(255, 255, 255, 0.3);
        transform: scale(1.05);
      }

      .close-btn:hover {
        background: rgba(239, 68, 68, 0.8);
      }

      .floating-window-content {
        flex: 1;
        overflow: hidden;
        background: #f8fafc;
        display: flex;
        flex-direction: column;
      }

      .floating-window-content iframe {
        width: 100%;
        height: 100%;
        border: none;
        background: #f8fafc;
      }

      .loading-spinner {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: #64748b;
      }

      .loading-spinner .spinner {
        width: 32px;
        height: 32px;
        border: 3px solid rgba(59, 130, 246, 0.2);
        border-top: 3px solid #3b82f6;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 16px;
      }

      .floating-window-resize-handle {
        position: absolute;
        bottom: 0;
        right: 0;
        width: 20px;
        height: 20px;
        cursor: se-resize;
        background: linear-gradient(-45deg, transparent 40%, rgba(0,0,0,0.1) 40%, rgba(0,0,0,0.1) 60%, transparent 60%);
      }

      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }

      /* Responsive adjustments */
      @media (max-width: 768px) {
        #${this.windowId} {
          width: 90vw !important;
          height: 80vh !important;
          left: 5vw !important;
          top: 10vh !important;
        }
      }
    `;
    
    document.head.appendChild(style);
  }

  setupEventListeners() {
    const header = this.window.querySelector('.floating-window-header');
    const minimizeBtn = this.window.querySelector('.minimize-btn');
    const closeBtn = this.window.querySelector('.close-btn');
    
    // Dragging functionality
    header.addEventListener('mousedown', this.startDrag.bind(this));
    document.addEventListener('mousemove', this.drag.bind(this));
    document.addEventListener('mouseup', this.stopDrag.bind(this));
    
    // Window controls
    minimizeBtn.addEventListener('click', this.toggle.bind(this));
    closeBtn.addEventListener('click', this.close.bind(this));
    
    // Prevent dragging when clicking on buttons
    minimizeBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    closeBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    
    // Save position when window is moved
    header.addEventListener('mouseup', this.savePosition.bind(this));
  }

  startDrag(e) {
    this.isDragging = true;
    const rect = this.window.getBoundingClientRect();
    this.dragOffset.x = e.clientX - rect.left;
    this.dragOffset.y = e.clientY - rect.top;
    
    this.window.style.transition = 'none';
    document.body.style.userSelect = 'none';
  }

  drag(e) {
    if (!this.isDragging) return;
    
    e.preventDefault();
    
    let newX = e.clientX - this.dragOffset.x;
    let newY = e.clientY - this.dragOffset.y;
    
    // Keep window within viewport
    const maxX = window.innerWidth - this.window.offsetWidth;
    const maxY = window.innerHeight - this.window.offsetHeight;
    
    newX = Math.max(0, Math.min(maxX, newX));
    newY = Math.max(0, Math.min(maxY, newY));
    
    this.window.style.left = newX + 'px';
    this.window.style.top = newY + 'px';
    
    this.position = { x: newX, y: newY };
  }

  stopDrag() {
    if (!this.isDragging) return;
    
    this.isDragging = false;
    this.window.style.transition = '';
    document.body.style.userSelect = '';
    
    this.savePosition();
  }

  async loadContent() {
    try {
      // Get the extension URL for the popup HTML
      const extensionId = chrome.runtime.id;
      const popupUrl = chrome.runtime.getURL('popup.html');
      
      // Create iframe to load the popup content
      const iframe = document.createElement('iframe');
      iframe.src = popupUrl;
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.border = 'none';
      iframe.style.backgroundColor = '#f8fafc';
      
      // Replace loading content with iframe
      const contentDiv = this.window.querySelector('#floating-content');
      contentDiv.innerHTML = '';
      contentDiv.appendChild(iframe);
      
      // Wait for iframe to load
      iframe.addEventListener('load', () => {
        console.log('Floating window content loaded');
      });
      
    } catch (error) {
      console.error('Failed to load floating window content:', error);
      this.showError('Failed to load extension content');
    }
  }

  showError(message) {
    const contentDiv = this.window.querySelector('#floating-content');
    contentDiv.innerHTML = `
      <div class="loading-spinner">
        <i class="fas fa-exclamation-triangle" style="font-size: 32px; color: #ef4444; margin-bottom: 16px;"></i>
        <p style="color: #ef4444;">${message}</p>
        <button onclick="window.floatingWindow.loadContent()" style="margin-top: 16px; padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 8px; cursor: pointer;">
          Retry
        </button>
      </div>
    `;
  }

  toggle() {
    this.window.classList.toggle('minimized');
    this.saveState();
  }

  show() {
    if (this.window) {
      this.window.style.display = 'flex';
      this.window.classList.remove('minimized');
      this.isOpen = true;
    }
  }

  close() {
    if (this.window) {
      this.window.style.transform = 'scale(0.8)';
      this.window.style.opacity = '0';
      
      setTimeout(() => {
        if (this.window && this.window.parentNode) {
          this.window.parentNode.removeChild(this.window);
        }
        this.isOpen = false;
      }, 200);
    }
  }

  getSavedPosition() {
    try {
      const saved = localStorage.getItem('floating-window-position');
      if (saved) {
        const pos = JSON.parse(saved);
        // Ensure position is still within viewport
        const maxX = window.innerWidth - this.defaultSize.width;
        const maxY = window.innerHeight - this.defaultSize.height;
        
        return {
          x: Math.max(0, Math.min(maxX, pos.x)),
          y: Math.max(0, Math.min(maxY, pos.y))
        };
      }
    } catch (e) {
      console.log('Could not load saved position');
    }
    
    // Default position (center-right of screen)
    return {
      x: window.innerWidth - this.defaultSize.width - 50,
      y: Math.max(50, (window.innerHeight - this.defaultSize.height) / 2)
    };
  }

  savePosition() {
    if (this.position) {
      try {
        localStorage.setItem('floating-window-position', JSON.stringify(this.position));
      } catch (e) {
        console.log('Could not save position');
      }
    }
  }

  saveState() {
    try {
      const state = {
        isMinimized: this.window.classList.contains('minimized'),
        position: this.position
      };
      localStorage.setItem('floating-window-state', JSON.stringify(state));
    } catch (e) {
      console.log('Could not save state');
    }
  }
}

// Initialize floating window
if (!window.floatingWindow) {
  window.floatingWindow = new FloatingWindow();
} else {
  window.floatingWindow.show();
}