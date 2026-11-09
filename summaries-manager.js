// Summaries Manager - handles saved summaries and videos functionality
class SummariesManager {
  constructor() {
    this.container = null;
  }

  async initialize() {
    this.container = document.getElementById('savedSummaries');
    await this.displaySavedContent();
    if (window.librarySearchUI) window.librarySearchUI.init();
    this.bindLibraryTools();
  }

  bindLibraryTools() {
    if (this.toolsBound) return;
    const byId = (id) => document.getElementById(id);
    const json = byId('exportJsonBtn');
    if (!json) return;
    this.toolsBound = true;
    json.addEventListener('click', () => this.exportLibrary('json'));
    byId('exportMarkdownBtn').addEventListener('click', () => this.exportLibrary('markdown'));
    const input = byId('importJsonInput');
    byId('importJsonBtn').addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      input.value = '';
      if (file) await this.importLibrary(file);
    });
  }

  setToolsStatus(message, isError = false) {
    const el = document.getElementById('libraryToolsStatus');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('error', isError);
  }

  download(filename, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async exportLibrary(kind) {
    try {
      const library = await libraryStore.exportAll();
      if (!library.videos.length && !library.summaries.length) {
        this.setToolsStatus('Nothing saved yet, so there is nothing to export.', true);
        return;
      }
      const day = new Date().toISOString().slice(0, 10);
      if (kind === 'json') {
        const data = LibraryExport.buildExport(library);
        this.download(`summary-library-${day}.json`, JSON.stringify(data), 'application/json');
      } else {
        this.download(`summary-library-${day}.md`, LibraryExport.libraryToMarkdown(library), 'text/markdown');
      }
      this.setToolsStatus(`Exported ${library.videos.length} videos and ${library.summaries.length} page summaries.`);
    } catch (error) {
      console.error('Export failed:', error);
      this.setToolsStatus(`Export failed: ${error.message}`, true);
    }
  }

  async importLibrary(file) {
    try {
      const prepared = LibraryExport.prepareImport(JSON.parse(await file.text()));
      const [videos, summaries] = await Promise.all([libraryStore.listVideos(), libraryStore.listSummaries()]);
      const plan = LibraryExport.planImport(prepared, videos.map((v) => v.videoId), summaries);
      const added = await libraryStore.importPlanned(plan);
      window.librarySearch?.invalidate();
      await this.displaySavedContent();
      window.librarySearchUI?.init();
      const parts = [`Imported ${added.videos} videos and ${added.summaries} page summaries.`];
      if (plan.duplicates) parts.push(`${plan.duplicates} already saved were kept as they are.`);
      if (prepared.skipped) parts.push(`${prepared.skipped} unreadable entries were skipped.`);
      this.setToolsStatus(parts.join(' '));
    } catch (error) {
      const unreadable = error instanceof SyntaxError ? 'That file is not valid JSON.' : error.message;
      this.setToolsStatus(`Import failed: ${unreadable}`, true);
    }
  }

  async removeTranscript(videoId) {
    const ok = confirm('Remove the transcript for this video? The summary and your chat stay, but the chat can no longer use the full transcript. You can summarize the video again later to get it back.');
    if (!ok) return;
    await libraryStore.removeTranscript(videoId);
    window.librarySearch?.invalidate();
    await this.displaySavedContent();
  }

  async displaySavedContent() {
    if (!this.container) return;
    
    this.container.innerHTML = '';
    
    // Display saved summaries
    const savedSummaries = await libraryStore.listSummaries();
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
            ${(savedSummary.tags || []).map(tag => `<span class="summary-tag">${LibrarySearchUI.escapeHtml(tag)}</span>`).join('')}
          </div>
          <div class="summary-timestamp">
            ${new Date(savedSummary.timestamp).toLocaleDateString()}
          </div>
        </div>
        <div class="summary-content">
          <div class="summary-text">${LibrarySearchUI.escapeHtml(savedSummary.summary)}</div>
          <div class="summary-actions">
            <button class="summary-action-btn summary__copy" data-index="${index}" title="Copy summary">
              <i class="fas fa-copy"></i>
            </button>
            <button class="summary-action-btn summary__delete delete" data-index="${index}" data-id="${savedSummary.id}" title="Delete summary">
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
        this.deleteSummary(Number(button.getAttribute('data-id')));
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
    const savedVideos = await libraryStore.listVideos();
    
    if (savedVideos.length === 0) return;
    
    // Add a separator for videos if we also have summaries
    const existingContent = this.container.innerHTML;
    if (existingContent.trim()) {
      const separator = document.createElement('div');
      separator.className = 'section-separator';
      separator.innerHTML = '<h3><i class="fas fa-video"></i> Saved YouTube Videos</h3>';
      this.container.appendChild(separator);
    }
    
    const esc = (value) => LibrarySearchUI.escapeHtml(value == null ? '' : value);
    savedVideos.forEach((video, index) => {
      const videoElement = document.createElement('div');
      videoElement.className = 'saved-video';
      videoElement.innerHTML = `
        <div class="video-card" data-video-id="${esc(video.videoId)}">
          <div class="video-thumbnail-container">
            <img src="${esc(video.thumbnail)}" alt="Video thumbnail" class="video-thumbnail">
            <div class="video-duration-overlay">
              <i class="fas fa-play"></i>
            </div>
          </div>
          <div class="video-info">
            <h4 class="video-title">${esc(video.title)}</h4>
            <p class="video-saved-date">Saved: ${new Date(video.savedAt).toLocaleDateString()} · ${esc(LibraryExport.formatBytes(video.sizeBytes))}${video.transcriptRemoved ? ' · transcript removed' : ''}</p>
            <div class="video-actions">
              <button class="video-action-btn watch-btn" data-url="${esc(video.url)}" title="Open original">
                <i class="fab fa-youtube"></i>
                <span>Watch</span>
              </button>
              <button class="video-action-btn chat-btn video-chat-btn" data-video-id="${esc(video.videoId)}" title="Open in Live Chat">
                <i class="fas fa-comments"></i>
                <span>Chat</span>
              </button>
              <button class="video-action-btn copy-transcript-btn" data-video-id="${esc(video.videoId)}" title="Copy transcript">
                <i class="fas fa-copy"></i>
                <span>Transcript</span>
              </button>
              ${video.hasTranscript ? `<button class="video-action-btn free-space-btn" data-video-id="${esc(video.videoId)}" title="Remove the transcript, keep the summary">
                <i class="fas fa-compress-alt"></i>
                <span>Free space</span>
              </button>` : ''}
              <button class="video-action-btn delete-btn video-delete-btn" data-video-id="${esc(video.videoId)}" title="Delete video">
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

    // Inline onclick handlers are blocked by the extension CSP, so bind the open button here.
    this.container.querySelectorAll('.watch-btn').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const url = button.getAttribute('data-url');
        if (/^https?:\/\//i.test(url)) window.open(url, '_blank', 'noopener');
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
        this.deleteVideo(button.getAttribute('data-video-id'));
      });
    });

    this.container.querySelectorAll('.free-space-btn').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        this.removeTranscript(button.getAttribute('data-video-id'));
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

  async deleteSummary(id) {
    await libraryStore.deleteSummary(id);
    window.librarySearch?.invalidate();
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
    const esc = (value) => LibrarySearchUI.escapeHtml(value == null ? '' : value);
    
    // Create a modal to show video details
    const modal = document.createElement('div');
    modal.className = 'video-details-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>${esc(video.title)}</h3>
          <button class="modal-close">×</button>
        </div>
        <div class="modal-body">
          <div class="video-details-section">
            <h4>Summary</h4>
            <p>${esc(video.summary) || 'No summary available'}</p>
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
            <a href="${esc(video.url)}" target="_blank" rel="noopener noreferrer" class="button">Watch Video</a>
            <button class="load-in-chat-btn" data-video-id="${esc(video.videoId)}">Open in Live Chat</button>
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

  async deleteVideo(videoId) {
    if (!confirm('Are you sure you want to delete this saved video?')) return;
    
    await libraryStore.deleteVideo(videoId);
    window.librarySearch?.invalidate();
    
    // Refresh the display
    await this.displaySavedContent();
  }

  async loadSavedVideo(videoId) {
    return libraryStore.getVideo(videoId);
  }
}

// Export for use in popup and make global instance available
window.SummariesManager = SummariesManager;

// Global instance that other components can access
window.summariesManager = null;