// Summaries Manager - handles saved summaries and videos functionality
class SummariesManager {
  constructor() {
    this.container = null;
  }

  async initialize() {
    this.container = document.getElementById('savedSummaries');
    await this.displaySavedContent();
  }

  async displaySavedContent() {
    if (!this.container) return;
    
    this.container.innerHTML = '';
    
    // Display saved summaries
    const savedSummaries = (await chrome.storage.local.get('savedSummaries')).savedSummaries || [];
    await this.displaySavedSummaries(savedSummaries);
    
    // Display saved videos
    await this.displaySavedVideos();
  }

  async displaySavedSummaries(savedSummaries) {
    if (savedSummaries.length === 0) return;

    savedSummaries.forEach((savedSummary, index) => {
      const summaryElement = document.createElement('div');
      summaryElement.classList.add('summary-card');
      summaryElement.innerHTML = `
        <div class="summary-card-header">
          <div class="summary-tags">
            ${savedSummary.tags.map(tag => `<span class="summary-tag">${tag}</span>`).join('')}
          </div>
          <div class="summary-timestamp">
            ${new Date(savedSummary.timestamp).toLocaleDateString()}
          </div>
        </div>
        <div class="summary-content">
          <div class="summary-text">${savedSummary.summary}</div>
          <div class="summary-actions">
            <button class="summary-action-btn summary__copy" data-index="${index}" title="Copy summary">
              <i class="fas fa-copy"></i>
            </button>
            <button class="summary-action-btn summary__delete delete" data-index="${index}" title="Delete summary">
              <i class="fas fa-trash-alt"></i>
            </button>
          </div>
        </div>
      `;
      this.container.appendChild(summaryElement);
    });

    // Add event listeners for summary actions
    this.container.querySelectorAll('.summary__delete').forEach((button) => {
      button.addEventListener('click', (event) => {
        const index = parseInt(button.getAttribute('data-index'));
        this.deleteSummary(index);
      });
    });

    this.container.querySelectorAll('.summary__copy').forEach((button) => {
      button.addEventListener('click', (event) => {
        const index = parseInt(button.getAttribute('data-index'));
        this.copySummary(index, savedSummaries);
      });
    });
  }

  async displaySavedVideos() {
    const result = await chrome.storage.local.get(['savedVideos']);
    const savedVideos = result.savedVideos || [];
    
    if (savedVideos.length === 0) return;
    
    // Add a separator for videos if we also have summaries
    const existingContent = this.container.innerHTML;
    if (existingContent.trim()) {
      const separator = document.createElement('div');
      separator.className = 'section-separator';
      separator.innerHTML = '<h3><i class="fas fa-video"></i> Saved YouTube Videos</h3>';
      this.container.appendChild(separator);
    }
    
    savedVideos.forEach((video, index) => {
      const videoElement = document.createElement('div');
      videoElement.className = 'saved-video';
      videoElement.innerHTML = `
        <div class="video-card" data-video-id="${video.videoId}">
          <div class="video-thumbnail-container">
            <img src="${video.thumbnail}" alt="Video thumbnail" class="video-thumbnail">
            <div class="video-duration-overlay">
              <i class="fas fa-play"></i>
            </div>
          </div>
          <div class="video-info">
            <h4 class="video-title">${video.title}</h4>
            <p class="video-saved-date">Saved: ${new Date(video.savedAt).toLocaleDateString()}</p>
            <div class="video-actions">
              <button class="video-action-btn watch-btn" onclick="window.open('${video.url}', '_blank')" title="Watch on YouTube">
                <i class="fab fa-youtube"></i>
                <span>Watch</span>
              </button>
              <button class="video-action-btn chat-btn video-chat-btn" data-video-id="${video.videoId}" title="Open in Live Chat">
                <i class="fas fa-comments"></i>
                <span>Chat</span>
              </button>
              <button class="video-action-btn copy-transcript-btn" data-video-id="${video.videoId}" title="Copy transcript">
                <i class="fas fa-copy"></i>
                <span>Copy Transcript</span>
              </button>
              <button class="video-action-btn delete-btn video-delete-btn" data-video-index="${index}" title="Delete video">
                <i class="fas fa-trash-alt"></i>
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      `;
      this.container.appendChild(videoElement);
    });

    // Add event listeners for video actions
    this.container.querySelectorAll('.video-card').forEach((card) => {
      card.addEventListener('click', (event) => {
        // Only trigger if not clicking on action buttons
        if (!event.target.closest('.video-actions')) {
          const videoId = card.getAttribute('data-video-id');
          this.openVideoDetails(videoId);
        }
      });
    });

    this.container.querySelectorAll('.video-chat-btn').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const videoId = button.getAttribute('data-video-id');
        this.loadVideoInLiveChat(videoId);
      });
    });

    this.container.querySelectorAll('.video-delete-btn').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const index = parseInt(button.getAttribute('data-video-index'));
        this.deleteVideo(index);
      });
    });

    this.container.querySelectorAll('.copy-transcript-btn').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const videoId = button.getAttribute('data-video-id');
        this.copyTranscript(videoId);
      });
    });
  }

  async deleteSummary(index) {
    const savedSummaries = (await chrome.storage.local.get('savedSummaries')).savedSummaries || [];
    savedSummaries.splice(index, 1);
    await chrome.storage.local.set({ savedSummaries });
    await this.displaySavedContent();
  }

  async copySummary(index, savedSummaries) {
    const summary = savedSummaries[index]?.summary;
    if (summary) {
      try {
        await navigator.clipboard.writeText(summary);
        // Show a brief success indication
        const button = this.container.querySelector(`[data-index="${index}"].summary__copy`);
        if (button) {
          const originalHtml = button.innerHTML;
          button.innerHTML = '<span><i class="fas fa-check"></i></span>';
          setTimeout(() => {
            button.innerHTML = originalHtml;
          }, 1000);
        }
      } catch (error) {
        console.error('Failed to copy summary:', error);
      }
    }
  }

  async copyTranscript(videoId) {
    const video = await this.loadSavedVideo(videoId);
    if (!video || !video.transcript) return;
    
    try {
      await navigator.clipboard.writeText(video.transcript);
      // Show a brief success indication
      const button = this.container.querySelector(`[data-video-id="${videoId}"].copy-transcript-btn`);
      if (button) {
        const originalHtml = button.innerHTML;
        button.innerHTML = '<span><i class="fas fa-check"></i></span>';
        setTimeout(() => {
          button.innerHTML = originalHtml;
        }, 1000);
      }
    } catch (error) {
      console.error('Failed to copy transcript:', error);
    }
  }

  async openVideoDetails(videoId) {
    const video = await this.loadSavedVideo(videoId);
    if (!video) return;
    
    // Create a modal to show video details
    const modal = document.createElement('div');
    modal.className = 'video-details-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>${video.title}</h3>
          <button class="modal-close">×</button>
        </div>
        <div class="modal-body">
          <div class="video-details-section">
            <h4>Summary</h4>
            <p>${video.summary || 'No summary available'}</p>
          </div>
          ${video.bulletPoints ? `
            <div class="video-details-section">
              <h4>Key Points</h4>
              <div>${video.bulletPoints}</div>
            </div>
          ` : ''}
          ${video.questions ? `
            <div class="video-details-section">
              <h4>Discussion Questions</h4>
              <div>${video.questions}</div>
            </div>
          ` : ''}
          <div class="modal-actions">
            <a href="${video.url}" target="_blank" class="button">Watch Video</a>
            <button class="load-in-chat-btn" data-video-id="${video.videoId}">Open in Live Chat</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);

    // Add event listeners
    modal.querySelector('.modal-close').addEventListener('click', () => {
      modal.remove();
    });

    modal.querySelector('.load-in-chat-btn').addEventListener('click', () => {
      const videoId = modal.querySelector('.load-in-chat-btn').getAttribute('data-video-id');
      this.loadVideoInLiveChat(videoId);
      modal.remove();
    });
  }

  async loadVideoInLiveChat(videoId) {
    const video = await this.loadSavedVideo(videoId);
    if (!video) return;
    
    console.log('Loading saved video in live chat:', video.title);
    
    // Prepare video data WITHOUT transcript (will be fetched fresh)
    const basicVideoData = { ...video };
    
    // Store the basic video data in background script
    chrome.runtime.sendMessage({
      action: "storeSavedVideoData",
      videoData: basicVideoData
    }, (response) => {
      console.log('Saved video data stored in background:', response);
      
      // Switch to live summary tab
      const liveTab = document.getElementById('menuLive');
      if (liveTab) {
        liveTab.click();
        
        // Small delay to ensure tab switch happens first
        setTimeout(() => {
          // Send event to live chat manager
          const event = new CustomEvent('loadVideoInLiveChat', {
            detail: {
              videoData: basicVideoData,
              chatHistory: video.chatHistory || []
            }
          });
          window.dispatchEvent(event);
        }, 200);
      }
    });
  }

  async deleteVideo(index) {
    if (!confirm('Are you sure you want to delete this saved video?')) return;
    
    const result = await chrome.storage.local.get(['savedVideos']);
    const savedVideos = result.savedVideos || [];
    
    savedVideos.splice(index, 1);
    await chrome.storage.local.set({ savedVideos });
    
    // Refresh the display
    await this.displaySavedContent();
  }

  async loadSavedVideo(videoId) {
    const result = await chrome.storage.local.get(['savedVideos']);
    const savedVideos = result.savedVideos || [];
    return savedVideos.find(video => video.videoId === videoId);
  }
}

// Export for use in popup and make global instance available
window.SummariesManager = SummariesManager;

// Global instance that other components can access
window.summariesManager = null;