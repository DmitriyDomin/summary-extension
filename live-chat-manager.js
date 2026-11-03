// Live Chat Manager - handles YouTube live summary functionality with state persistence
class LiveChatManager {
  constructor() {
    this.youtubeLiveSummary = null;
    this.currentVideoId = null;
    this.chatContainer = null;
    this.inputContainer = null;
    this.videoInfoContainer = null;
    this.isInitialized = false; // Add state tracking
    this.isInitializing = false; // Prevent duplicate initialization calls
  }

  async initialize() {
    console.log('🎬 LiveChatManager: Starting initialization...');
    
    // FIXED: Prevent duplicate initializations
    if (this.isInitializing) {
      console.log('🎬 LiveChatManager: Already initializing, skipping duplicate call');
      return;
    }
    
    if (this.isInitialized) {
      console.log('🎬 LiveChatManager: Already initialized, skipping');
      return;
    }
    
    this.isInitializing = true;
    
    this.chatContainer = document.getElementById('chatMessages');
    this.inputContainer = document.getElementById('chatInput');
    this.videoInfoContainer = document.getElementById('videoInfo');
    
    // Show loading state immediately to prevent error flash
    this.showLoadingState();
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Listen for video load requests
    window.addEventListener('loadVideoInLiveChat', (event) => {
      this.loadVideoWithHistory(event.detail.videoData, event.detail.chatHistory);
    });
    
    // CRITICAL FIX: Check if we have saved video data waiting first
    let hasSavedVideoWaiting = false;
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'getVideoData' }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      });
      
      if (response && response.videoData && response.isFromSavedVideo) {
        console.log('🎬 LiveChatManager: Found saved video data waiting:', response.videoData.title);
        hasSavedVideoWaiting = true;
        
        // Initialize directly with saved video data
        // await this.initializeWithCurrentVideo(response.videoData);
        this.isInitializing = false;
        this.isInitialized = true;
        return; // Exit early - don't run restorePreviousSession
      }
    } catch (error) {
      console.log('🎬 LiveChatManager: No saved video data waiting:', error.message);
    }
    
    console.log('🎬 LiveChatManager: First initialization, attempting restore...');
      // Add a small delay to ensure DOM is fully ready and avoid flash errors
      setTimeout(async () => {
        try {
          // await this.restorePreviousSession();
          this.isInitialized = true;
        } catch (error) {
          console.error('🎬 Error during session restore:', error);
          this.showNoVideoMessage();
        } finally {
          this.isInitializing = false;
        }
      }, 300);
  }

  // Setup event listeners for live chat functionality
  setupEventListeners() {
    const sendButton = document.getElementById('sendMessageBtn');
    const chatInput = document.getElementById('chatInput');
    // REMOVED: Duplicate bullet points and questions listeners - YouTubeLiveSummary handles these

    if (sendButton) {
      sendButton.addEventListener('click', () => this.sendMessage());
    }

    if (chatInput) {
      chatInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          this.sendMessage();
        }
      });
    }

    // Go Back button event listener
    const goBackBtn = document.getElementById('goBackToCurrentBtn');
    if (goBackBtn) {
      goBackBtn.addEventListener('click', () => this.goBackToCurrentVideo());
    }

    // Save button is handled by YouTubeLiveSummary to avoid conflicts
    // Bullet points and questions buttons are handled by YouTubeLiveSummary to avoid conflicts
  }

  async restorePreviousSession() {
    console.log('🎬 LiveChatManager: Attempting to restore previous session...');
    
    try {
      // FIXED: Use cross-window tab detection instead of problematic chrome.tabs.query
      const windows = await chrome.windows.getAll({ populate: true });
      let activeTab = null;
      let currentVideoId = null;
      
      // Look for active YouTube tabs across all windows
      for (const window of windows) {
        const activeTabInWindow = window.tabs.find(tab => tab.active);
        if (activeTabInWindow && activeTabInWindow.url && activeTabInWindow.url.includes('youtube.com/watch')) {
          activeTab = activeTabInWindow;
          // Extract video ID from URL
          const urlParams = new URLSearchParams(new URL(activeTab.url).search);
          currentVideoId = urlParams.get('v');
          console.log('🎬 Found active YouTube tab with video ID:', currentVideoId);
          break;
        }
      }

      if (!activeTab || !currentVideoId) {
        console.log('🎬 No active YouTube video found, trying to get current video info...');
        await this.tryGetCurrentVideoInfo();
        return;
      }

      console.log('🎬 Detected current video ID:', currentVideoId);

      // Check storage in priority order:
      
      // 1. Check temporary session storage first (most recent data with transcript)
      const sessionKey = `liveChatSession_${currentVideoId}`;
      const sessionResult = await chrome.storage.local.get([sessionKey]);
      const savedSession = sessionResult[sessionKey];


      if (savedSession && savedSession.videoData && savedSession.timestamp > Date.now() - (24 * 60 * 60 * 1000)) {
        console.log('🎬 Restoring from temporary session:', savedSession.videoData.title);
        await this.loadVideoWithHistory({ ...savedSession.videoData, isFromSavedVideo: false }, savedSession.chatHistory || []);
        return;
      }

      // 2. Check if this video is saved in long-term storage
      const savedVideosResult = await chrome.storage.local.get(['savedVideos']);
      const savedVideos = savedVideosResult.savedVideos || [];
      const savedVideo = savedVideos.find(v => v.videoId === currentVideoId);

      if (savedVideo) {
        console.log('🎬 Found saved video, loading:', savedVideo.title);
        // Load saved video data (without transcript, will be fetched fresh)
        const basicVideoData = {
          videoId: savedVideo.videoId,
          title: savedVideo.title,
          url: savedVideo.url,
          thumbnail: savedVideo.thumbnail,
          chatHistory: savedVideo.chatHistory || []
        };
        await this.loadVideoWithHistory(basicVideoData, savedVideo.chatHistory || []);
        return;
      }

      // 3. Try to get current video data using the found active tab
      await this.tryGetCurrentVideoInfo();
      
    } catch (error) {
      console.error('🎬 Error in restorePreviousSession:', error);
      this.showNoVideoMessage();
    }
  }

  // FIXED: New method to get current video info through background script
  async tryGetCurrentVideoInfo() {
    this.isInitialized = false;
    console.log('🎬 Trying to get current video info...');
    
    try {
      // FIXED: In side panel context, we need to get the current tab differently
      // First try to get the active tab from all windows
      const windows = await chrome.windows.getAll({ populate: true });
      let activeTab = null;
      
      for (const window of windows) {
        const activeTabInWindow = window.tabs.find(tab => tab.active);
        if (activeTabInWindow && activeTabInWindow.url && activeTabInWindow.url.includes('youtube.com/watch')) {
          activeTab = activeTabInWindow;
          console.log('🎬 Found active YouTube tab:', activeTab.title);
          break;
        }
      }
      
      if (!activeTab) {
        console.log('🎬 No active YouTube tab found in any window');
        this.showNoVideoMessage();
        return;
      }
      
      // Use background script to communicate with content script with retry logic
      let attempts = 0;
      const maxAttempts = 3;
      
      while (attempts < maxAttempts) {
        try {
          const response = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);
            
            chrome.runtime.sendMessage({ 
              action: 'getCurrentVideoInfo',
              tabId: activeTab.id  // Pass the specific tab ID
            }, (response) => {
              clearTimeout(timeout);
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve(response);
              }
            });
          });
          
          if (response && response.videoData) {
            console.log('🎬 Found current video data:', response.videoData.title);
            const fallbackVideoData = {
              ...response.videoData,
              isFromCurrentPage: true
            };
            
            await this.initializeWithCurrentVideo(fallbackVideoData);
            return;
          } else if (response && response.error) {
            console.log('🎬 Background script error:', response.error);
            if (response.error.includes('Not a YouTube page')) {
              this.showNoVideoMessage();
              return;
            }
          }
          
          throw new Error('No video data received');
          
        } catch (error) {
          attempts++;
          console.log(`🎬 Attempt ${attempts} failed:`, error.message);
          
          if (attempts < maxAttempts) {
            console.log(`🎬 Retrying in ${attempts * 1000}ms...`);
            await new Promise(resolve => setTimeout(resolve, attempts * 1000));
          }
        }
      }
      
      console.log('🎬 All attempts failed, showing no video message');
      this.showNoVideoMessage();
      
    } catch (error) {
      console.log('🎬 Could not get current video info:', error.message);
      this.showNoVideoMessage();
    }
  }

  async initializeWithCurrentVideo(videoData = null) {
    console.log('🎬 LiveChatManager: initializeWithCurrentVideo called with:', videoData?.title || 'no video data');
    
    // if (this.isInitialized && this.currentVideoId) {
    //   console.log('🎬 Already initialized with video:', this.currentVideoId, '- skipping re-initialization');
    //   return;
    // }

    this.setupEventListeners();
    
    // If video data is provided directly (from "Summarize Video" button)
    if (videoData) {
      console.log('🎬 Video data provided directly:', videoData.title);
      this.currentVideoId = videoData.videoId;
      
      // Clear any existing content to prevent flash
      this.clearChatDisplay();
      
      // CRITICAL FIX: Check temporary session storage FIRST (for recent unsaved summaries)
      const sessionKey = `liveChatSession_${videoData.videoId}`;
      const sessionResult = await chrome.storage.local.get([sessionKey]);
      const savedSession = sessionResult[sessionKey];
      const savedVideosResult = await chrome.storage.local.get(['savedVideos']);
      const savedVideos = savedVideosResult.savedVideos || [];
      const doesExistInSaved = !!savedVideos.find(v => v.videoId === this.currentVideoId);

      if (savedSession && savedSession.videoData && savedSession.timestamp > Date.now() - (24 * 60 * 60 * 1000)) {
        console.log('🎬 Found temporary session for this video - loading from temp storage:', savedSession.videoData.title);
        console.log('🎬 Temp session has', savedSession.chatHistory?.length || 0, 'chat messages');
        
        // Load from temporary session storage (preserves transcript and recent chat)
        await this.loadVideoWithHistory({ 
          ...savedSession.videoData, 
          isFromSavedVideo: doesExistInSaved 
        }, savedSession.chatHistory || []);
        this.isInitialized = true;
        return;
      }
      
      // SECOND: Check if this video is permanently saved 
      const savedVideo = await this.checkIfVideoSaved(videoData.videoId);
      
      if (savedVideo && savedVideo.chatHistory && savedVideo.chatHistory.length > 0) {
        console.log('🎬 Found saved video with existing chat history - loading saved data');
        
        // Use the saved video data instead of creating new
        const enhancedVideoData = {
          ...videoData,
          chatHistory: savedVideo.chatHistory,
          summary: savedVideo.summary || '',
          // isFromSavedVideo: true
        };
        
        await this.loadVideoWithHistory(enhancedVideoData, savedVideo.chatHistory);
        this.isInitialized = true;
        return;
      } else {
        console.log('🎬 No saved chat history found - using provided video data');
        
        // Use the provided video data (which may include fresh summary)
        await this.loadVideoWithHistory(videoData, videoData.chatHistory || []);
        this.isInitialized = true;
        return;
      }
    }

    // Fallback: Try to get video data from background script
    try {
      console.log('🎬 No video data provided, trying background script...');
      
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'getVideoData' }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      });
      
      if (response && response.videoData) {
        console.log('🎬 Found video data from background');
        this.currentVideoId = response.videoData.videoId;
        
        // Clear any existing content
        this.clearChatDisplay();
        
        // Let YouTubeLiveSummary handle the saved video check internally
        await this.youtubeLiveSummary.initialize(response.videoData);
        this.updateVideoInfo(response.videoData);
        await this.saveCurrentSession();
        
        // Mark as successfully initialized
        this.isInitialized = true;
        return;
      }
    } catch (error) {
      console.log('🎬 Error getting video data from background:', error.message);
    }
    
    // Try content script as fallback
    try {
      // FIXED: Use cross-window tab detection instead of problematic chrome.tabs.query
      const windows = await chrome.windows.getAll({ populate: true });
      let activeTab = null;
      
      // Look for active YouTube tabs across all windows
      for (const window of windows) {
        const activeTabInWindow = window.tabs.find(tab => tab.active);
        if (activeTabInWindow && activeTabInWindow.url && activeTabInWindow.url.includes('youtube.com/watch')) {
          activeTab = activeTabInWindow;
          console.log('🎬 Found active YouTube tab for content script fallback:', activeTab.title);
          break;
        }
      }
      
      if (activeTab) {
        const response = await Promise.race([
          new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(activeTab.id, { action: 'getVideoData' }, (response) => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve(response);
              }
            });
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Content script timeout')), 2000))
        ]);
        
        if (response && response.videoData) {
          console.log('🎬 Got video data from content script');
          this.currentVideoId = response.videoData.videoId;
          
          // Try to fetch transcript if not available
          if (!response.videoData.transcript) {
            try {
              const transcriptResponse = await Promise.race([
                new Promise((resolve, reject) => {
                  chrome.tabs.sendMessage(activeTab.id, { 
                    action: 'fetchTranscript', 
                    videoId: response.videoData.videoId 
                  }, (transcriptResponse) => {
                    if (chrome.runtime.lastError) {
                      reject(chrome.runtime.lastError);
                    } else {
                      resolve(transcriptResponse);
                    }
                  });
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Transcript timeout')), 5000))
              ]);
              
              if (transcriptResponse && transcriptResponse.transcript) {
                response.videoData.transcript = transcriptResponse.transcript;
                response.videoData.timestampedTranscript = transcriptResponse.timestampedTranscript;
              }
            } catch (transcriptError) {
              console.log('🎬 Transcript fetch timed out or failed:', transcriptError.message);
            }
          }
          
          // Clear any existing content
          this.clearChatDisplay();
          
          // Let YouTubeLiveSummary handle the initialization
          await this.youtubeLiveSummary.initialize(response.videoData);
          this.updateVideoInfo(response.videoData);
          await this.saveCurrentSession();
          
          // Mark as successfully initialized
          this.isInitialized = true;
          return;
        }
      }
    } catch (error) {
      console.log('🎬 Content script fallback failed:', error.message);
    }
    
    // If all else fails, show no video message
    console.log('🎬 No video data available from any source');
    this.showNoVideoMessage();
  }

  // Clear chat display to prevent flash of old content
  clearChatDisplay() {
    if (this.chatContainer) {
      this.chatContainer.innerHTML = '';
    }
  }

  async loadVideoWithHistory(videoData, chatHistory = []) {
    // console.log('Loading video with history:', videoData.title, 'Messages:', chatHistory.length);
    
    this.currentVideoId = videoData.videoId;
    
    if (!this.youtubeLiveSummary) {
      if (typeof YouTubeLiveSummary === 'undefined') {
        this.showErrorMessage('YouTube Live Summary functionality is not available.');
        return;
      }
      this.youtubeLiveSummary = new YouTubeLiveSummary();
    }
    
    // If this is a saved video (no transcript data), fetch it fresh
    if (!videoData.transcript && videoData.videoId) {
      console.log('Fetching fresh transcript for saved video:', videoData.videoId);
      
      try {
        // FIXED: Use cross-window tab detection instead of problematic chrome.tabs.query
        const windows = await chrome.windows.getAll({ populate: true });
        let activeTab = null;
        
        // Look for the specific YouTube video tab across all windows
        for (const window of windows) {
          for (const tab of window.tabs) {
            if (tab.url && tab.url.includes('youtube.com/watch') && tab.url.includes(videoData.videoId)) {
              activeTab = tab;
              console.log('🎬 Found matching YouTube video tab:', tab.title);
              break;
            }
          }
          if (activeTab) break;
        }
        
        // Check if we're on the same YouTube video
        if (activeTab) {
          const transcriptResponse = await new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(activeTab.id, { 
              action: 'fetchTranscript', 
              videoId: videoData.videoId 
            }, (response) => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve(response);
              }
            });
          });
          
          if (transcriptResponse && transcriptResponse.transcript) {
            videoData.transcript = transcriptResponse.transcript;
            videoData.timestampedTranscript = transcriptResponse.timestampedTranscript;
            console.log('Fresh transcript fetched successfully');
          }
        } else {
          console.log('Matching YouTube video tab not found, will work without transcript');
        }
      } catch (error) {
        console.log('Could not fetch fresh transcript:', error);
        // Continue without transcript - saved chat history will still work
      }
    }
    
    // Prepare video data with chat history for proper initialization
    const videoDataWithHistory = {
      ...videoData,
      chatHistory: chatHistory,
      // IMPORTANT: Mark if this came from saved video storage
      isFromSavedVideo: videoData.isFromSavedVideo ?? (chatHistory && chatHistory.length > 0 && !videoData.isNewVideo)
    };
    
    // Show Go Back button if this is a saved video (not from temporary storage)
    if (videoDataWithHistory.isFromSavedVideo) {
      this.updateGoBackButtonVisibility(true);
    } else {
      this.updateGoBackButtonVisibility(false);
    }
    
    // Initialize with video data - this will handle chat history restoration internally
    await this.youtubeLiveSummary.initialize(videoDataWithHistory);
    this.updateVideoInfo(videoData);
    
    // Save to temporary session storage (with transcript if available)
    await this.saveCurrentSession();
    
    // Mark as successfully initialized
    this.isInitialized = true;
  }

  updateVideoInfo(videoData) {
    if (!this.videoInfoContainer) return;
    
    const thumbnail = this.videoInfoContainer.querySelector('#videoThumbnail');
    const title = this.videoInfoContainer.querySelector('#videoTitle');
    const link = this.videoInfoContainer.querySelector('#videoLink');
    
    if (thumbnail) thumbnail.src = videoData.thumbnail || '';
    if (title) title.textContent = videoData.title || 'YouTube Video';
    if (link) {
      link.href = videoData.url || '';
      link.textContent = 'Watch on YouTube';
    }
    
    this.videoInfoContainer.style.display = 'block';
  }

  async sendMessage() {
    const input = this.inputContainer;
    if (!input || !input.value.trim() || !this.youtubeLiveSummary) return;
    
    const message = input.value.trim();
    input.value = '';
    
    try {
      await this.youtubeLiveSummary.sendMessage(message);
      await this.saveCurrentSession();
    } catch (error) {
      console.error('Error sending message:', error);
      this.showErrorMessage('Failed to send message. Please try again.');
    }
  }

  async saveCurrentSession() {
    if (!this.currentVideoId || !this.youtubeLiveSummary) return;
    
    const sessionKey = `liveChatSession_${this.currentVideoId}`;
    const sessionData = {
      videoData: {
        ...this.youtubeLiveSummary.currentVideoData,
        // Include transcript in temporary session storage for quick restoration
        transcript: this.youtubeLiveSummary.currentVideoData?.transcript || '',
        timestampedTranscript: this.youtubeLiveSummary.currentVideoData?.timestampedTranscript || []
      },
      chatHistory: this.youtubeLiveSummary.chatHistory || [],
      timestamp: Date.now()
    };
    
    try {
      await chrome.storage.local.set({ [sessionKey]: sessionData });
      console.log('Temporary session saved for video:', this.currentVideoId);
    } catch (error) {
      console.error('Error saving temporary session:', error);
    }
  }

  showNoVideoMessage() {
    if (!this.chatContainer) return;
    
    this.chatContainer.innerHTML = `
      <div class="chat-message error">
        <div class="message-content">
          <strong>No YouTube Video Detected</strong><br>
          To use Live Summary:
          <ol style="margin: 8px 0; padding-left: 20px;">
            <li>Navigate to a YouTube video</li>
            <li>Click the "Summarize Video" button below the video</li>
            <li>The Live Summary will automatically open</li>
          </ol>
          Or you can manually switch to this tab when viewing a YouTube video.
        </div>
      </div>
    `;
  }

  showErrorMessage(message) {
    if (!this.chatContainer) return;
    
    this.chatContainer.innerHTML = `
      <div class="chat-message error">
        <div class="message-content">
          <strong>Error</strong><br>
          ${message}
        </div>
      </div>
    `;
  }

  // Show loading state to prevent error flash
  showLoadingState() {
    if (!this.chatContainer) return;
    
    this.chatContainer.innerHTML = `
      <div class="chat-message loading-state">
        <div class="message-content" style="text-align: center; padding: 20px;">
          <div class="typing-indicator" style="margin: 0 auto 12px auto; width: fit-content;">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <strong>Preparing Live Summary...</strong><br>
          <span style="font-size: 12px; color: #666;">Loading video data and generating summary</span>
        </div>
      </div>
    `;
  }

  async checkIfVideoSaved(videoId) {
    try {
      const result = await chrome.storage.local.get(['savedVideos']);
      const savedVideos = result.savedVideos || [];
      return savedVideos.find(v => v.videoId === videoId);
    } catch (error) {
      console.error('Error checking saved videos:', error);
      return null;
    }
  }

  updateSaveButtonState(isAlreadySaved) {
    const saveButton = document.getElementById('saveVideoBtn');
    if (!saveButton) return;
    
    if (isAlreadySaved) {
      saveButton.disabled = true;
      saveButton.innerHTML = '<i class="fas fa-check"></i>';
      saveButton.style.background = '#4caf50';
      saveButton.style.cursor = 'not-allowed';
      saveButton.title = 'Video already saved';
    } else {
      saveButton.disabled = false;
      saveButton.innerHTML = '<i class="fas fa-bookmark"></i>';
      saveButton.style.background = '';
      saveButton.style.cursor = 'pointer';
      saveButton.title = 'Save video data';
    }
  }

  // Go back to current video from temporary storage
  async goBackToCurrentVideo() {
    console.log('🔄 Going back to current video from temporary storage...');
    this.restorePreviousSession();
    // try {
    //   // Get current video data from background script (temporary storage)
    //   const response = await new Promise((resolve, reject) => {
    //     chrome.runtime.sendMessage({ action: 'getVideoData' }, (response) => {
    //       if (chrome.runtime.lastError) {
    //         reject(chrome.runtime.lastError);
    //       } else {
    //         resolve(response);
    //       }
    //     });
    //   });
      
    //   if (response && response.videoData && !response.isFromSavedVideo) {
    //     console.log('🔄 Found current video in temporary storage:', response.videoData.title);
        
    //     // Load the temporary video data
    //     await this.loadVideoWithHistory(response.videoData, response.videoData.chatHistory || []);
        
    //     // Hide the go back button since we're now on the current video
    //     this.updateGoBackButtonVisibility(false);
        
    //     console.log('🔄 Successfully switched back to current video');
    //   } else {
    //     console.log('🔄 No current video found in temporary storage');
    //     // Try to get video from active YouTube tab
    //     await this.tryGetCurrentVideoInfo();
    //   }
    // } catch (error) {
    //   console.error('🔄 Error going back to current video:', error);
    //   this.showErrorMessage('Could not load current video. Please try refreshing the page.');
    // }
  }

  // Update Go Back button visibility based on whether we're viewing a saved video
  updateGoBackButtonVisibility(show = false) {
    const goBackBtn = document.getElementById('goBackToCurrentBtn');
    if (goBackBtn) {
      goBackBtn.style.display = show ? 'flex' : 'none';
    }
  }

  // Clean up old sessions (call this periodically)
  async cleanupOldSessions() {
    const storage = await chrome.storage.local.get(null);
    const keysToRemove = [];
    const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days
    
    for (const key in storage) {
      if (key.startsWith('liveChatSession_')) {
        const session = storage[key];
        if (!session.timestamp || session.timestamp < cutoffTime) {
          keysToRemove.push(key);
        }
      }
    }
    
    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
      console.log('Cleaned up', keysToRemove.length, 'old chat sessions');
    }
  }
}

// Export for use in popup
window.LiveChatManager = LiveChatManager;