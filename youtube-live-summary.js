// YouTube Live Summary Manager
class YouTubeLiveSummary {
  constructor() {
    this.currentVideoData = null;
    this.chatHistory = [];
    this.isProcessing = false;
    this.autoSaveEnabled = true;
    this.saveTimeout = null;
  }

  async initialize(videoData) {
    console.log('🎬 YouTubeLiveSummary: Initializing with video data:', videoData?.title);
    
    try {
      this.currentVideoData = videoData;
      
      // First check if this video is already saved
      const savedVideo = await this.checkIfVideoAlreadySaved(videoData.videoId);
      
      if (savedVideo) {
        console.log('🎬 Video already saved, loading existing data:', savedVideo.title);
        // Load saved data instead of creating new summary
        await this.loadSavedVideoData(savedVideo);
        return;
      }
      
      this.setupUI();
      this.setupEventListeners();
      
      // Only start initial summary if this is NOT a saved video with existing chat history
      if (!videoData.chatHistory || videoData.chatHistory.length === 0) {
        // FIXED: Generate summary in background but don't show it in chat
        await this.generateBackgroundSummary();
      } else {
        console.log('🎬 Loading saved video with existing chat history, skipping initial summary');
        // Set the chat history from saved data
        this.chatHistory = videoData.chatHistory || [];
        // Restore chat in UI
        await this.restoreChatHistory();
      }
      
    } catch (error) {
      console.error('🎬 Error initializing YouTubeLiveSummary:', error);
      this.showErrorMessage('Failed to initialize Live Summary. Please try again.');
    }
  }

  async checkIfVideoAlreadySaved(videoId) {
    try {
      const result = await chrome.storage.local.get(['savedVideos']);
      const savedVideos = result.savedVideos || [];
      return savedVideos.find(v => v.videoId === videoId);
    } catch (error) {
      console.error('Error checking saved videos:', error);
      return null;
    }
  }

  async loadSavedVideoData(savedVideo) {
    // Set current video data from saved data
    this.currentVideoData = {
      videoId: savedVideo.videoId,
      title: savedVideo.title,
      url: savedVideo.url,
      thumbnail: savedVideo.thumbnail,
      // IMPORTANT: Restore transcript and timestamped transcript for AI access
      transcript: savedVideo.transcript,
      timestampedTranscript: savedVideo.timestampedTranscript,
      chatHistory: savedVideo.chatHistory || []
    };
    
    // Set chat history
    this.chatHistory = savedVideo.chatHistory || [];
    
    this.setupUI();
    this.setupEventListeners();
    
    // Restore chat history in the UI
    await this.restoreChatHistory();
    
    // Update save button to show it's already saved
    this.updateSaveButtonForSavedVideo();
  }

  async restoreChatHistory() {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;
    
    // Clear chat display
    chatMessages.innerHTML = '';
    
    // Restore chat history in the UI
    if (this.chatHistory && this.chatHistory.length > 0) {
      console.log('🎬 Restoring', this.chatHistory.length, 'chat messages');
      
      this.chatHistory.forEach(chat => {
        // Only add user message if it's not the initial summary
        if (chat.type !== 'summary') {
          this.addMessageToChat(chat.message, 'user', false); // Don't auto-save when restoring
        }
        this.addMessageToChat(chat.response, 'assistant', false); // Don't auto-save when restoring
      });
    }
  }

  updateSaveButtonForSavedVideo() {
    const saveBtn = document.getElementById('saveVideoBtn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="fas fa-check"></i> Saved';
      saveBtn.style.background = '#4caf50';
      saveBtn.style.cursor = 'not-allowed';
      saveBtn.title = 'Video already saved';
    }
  }

  setupUI() {
    const videoInfo = document.getElementById('videoInfo');
    const videoThumbnail = document.getElementById('videoThumbnail');
    const videoTitle = document.getElementById('videoTitle');
    const videoLink = document.getElementById('videoLink');

    if (this.currentVideoData && videoInfo && videoThumbnail && videoTitle && videoLink) {
      videoThumbnail.src = this.currentVideoData.thumbnail;
      videoTitle.textContent = this.currentVideoData.title;
      videoLink.href = this.currentVideoData.url;
      videoInfo.style.display = 'block';
    }

    // Clear previous chat only if this is a new video (no existing chat history)
    if (!this.currentVideoData.chatHistory || this.currentVideoData.chatHistory.length === 0) {
      this.chatHistory = [];
      const chatMessages = document.getElementById('chatMessages');
      if (chatMessages) chatMessages.innerHTML = '';
    } else {
      // Don't clear the chat - it will be restored by loadVideoWithHistory
      console.log('🎬 Preserving existing chat for saved video');
    }
  }

  setupEventListeners() {
    // Send message button
    const sendBtn = document.getElementById('sendMessageBtn');
    if (sendBtn) {
      sendBtn.addEventListener('click', () => {
        this.handleSendMessage();
      });
    }

    // Chat input enter key
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
      chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.handleSendMessage();
        }
      });
    }

    // Quick action buttons
    const bulletPointsBtn = document.getElementById('bulletPointsBtn');
    if (bulletPointsBtn) {
      bulletPointsBtn.addEventListener('click', () => {
        this.handleQuickAction('bulletPoints');
      });
    }

    const questionsBtn = document.getElementById('questionsBtn');
    if (questionsBtn) {
      questionsBtn.addEventListener('click', () => {
        this.handleQuickAction('questions');
      });
    }

    const saveVideoBtn = document.getElementById('saveVideoBtn');
    if (saveVideoBtn) {
      saveVideoBtn.addEventListener('click', () => {
        this.handleSaveVideo();
      });
    }
  }

  async startInitialSummary() {
    const initialMessage = `Please provide a comprehensive summary of this YouTube video: "${this.currentVideoData?.title}". You should include really important information, key points, and any relevant details that would help someone understand the content without watching the video. You just describe what the video is about in one sentence. Then provide a brief overview of the main topics covered in the video, we need value not just summary`;
    await this.sendMessage(initialMessage, true);
  }

  async handleSendMessage() {
    const input = document.getElementById('chatInput');
    if (!input) return;
    
    const message = input.value.trim();
    
    if (!message || this.isProcessing) return;
    
    input.value = '';
    await this.sendMessage(message, false);
  }

  addLoadingMessage() {
    const chatMessages = document.getElementById('chatMessages');
    const loadingDiv = document.createElement('div');
    const loadingId = 'loading-' + Date.now();
    loadingDiv.id = loadingId;
    loadingDiv.className = 'chat-message assistant loading';
    loadingDiv.innerHTML = `
      <div class="message-header">
        <strong>Assistant</strong>
      </div>
      <div class="message-content">
        <div class="typing-indicator">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    `;
    
    chatMessages.appendChild(loadingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return loadingId;
  }

  removeLoadingMessage(loadingId) {
    const loadingElement = document.getElementById(loadingId);
    if (loadingElement) {
      loadingElement.remove();
    }
  }

  async sendMessage(message, isAutomatic = false) {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    
    try {
      // Add user message to chat (unless it's automatic)
      if (!isAutomatic) {
        this.addMessageToChat(message, 'user');
      }
      
      // Add loading message
      const loadingId = this.addLoadingMessage();
      
      // Prepare the prompt with video context
      const contextualPrompt = this.buildContextualPrompt(message, isAutomatic);
      
      // Get API response
      const response = await this.makeApiRequest(contextualPrompt);
      
      // Remove loading message (check if loadingId exists)
      if (loadingId) {
        this.removeLoadingMessage(loadingId);
      }
      
      // Add response to chat
      this.addMessageToChat(response, 'assistant');
      
      // Save to chat history
      const chatEntry = { 
        message: isAutomatic ? 'Initial Summary' : message, 
        response, 
        timestamp: new Date().toISOString(),
        type: isAutomatic ? 'summary' : 'question'
      };
      
      this.chatHistory.push(chatEntry);
      
      // Auto-save chat history
      await this.autoSaveChatHistory();
      
    } catch (error) {
      // Remove loading message if it exists
      if (typeof loadingId !== 'undefined' && loadingId) {
        this.removeLoadingMessage(loadingId);
      }
      this.addMessageToChat(`Error: ${error.message}`, 'error');
      console.error('🎬 Error in sendMessage:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  // Auto-save chat history with debouncing
  async autoSaveChatHistory() {
    if (!this.autoSaveEnabled || !this.currentVideoData?.videoId) return;
    
    // Clear existing timeout
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    
    // Set new timeout to save after 2 seconds of inactivity
    this.saveTimeout = setTimeout(async () => {
      try {
        console.log('🎬 Auto-saving chat history...');
        
        // Save to temporary session storage first
        const sessionKey = `liveChatSession_${this.currentVideoData.videoId}`;
        const sessionData = {
          videoData: this.currentVideoData,
          chatHistory: this.chatHistory,
          timestamp: Date.now(),
          autoSaved: true
        };
        
        await chrome.storage.local.set({ [sessionKey]: sessionData });
        
        // Also update saved videos if this video is already saved
        const savedVideo = await this.checkIfVideoAlreadySaved(this.currentVideoData.videoId);
        if (savedVideo) {
          await this.updateSavedVideoWithNewChat();
        }
        
        console.log('🎬 Chat history auto-saved successfully');
        this.showAutoSaveIndicator();
        
      } catch (error) {
        console.error('🎬 Error auto-saving chat history:', error);
      }
    }, 2000);
  }

  // Update saved video with new chat history
  async updateSavedVideoWithNewChat() {
    try {
      const result = await chrome.storage.local.get(['savedVideos']);
      const savedVideos = result.savedVideos || [];
      
      const videoIndex = savedVideos.findIndex(v => v.videoId === this.currentVideoData.videoId);
      if (videoIndex !== -1) {
        // Update the chat history
        savedVideos[videoIndex].chatHistory = this.chatHistory;
        savedVideos[videoIndex].lastUpdated = new Date().toISOString();
        
        // Update summary for display
        const latestSummary = this.chatHistory.find(h => h.type === 'summary')?.response;
        if (latestSummary) {
          savedVideos[videoIndex].summary = latestSummary;
        }
        
        await chrome.storage.local.set({ savedVideos });
        console.log('🎬 Updated saved video with new chat history');
      }
    } catch (error) {
      console.error('🎬 Error updating saved video:', error);
    }
  }

  // Show auto-save indicator
  showAutoSaveIndicator() {
    const indicator = document.getElementById('autoSaveIndicator') || this.createAutoSaveIndicator();
    indicator.style.opacity = '1';
    indicator.style.transform = 'translateX(0)';
    
    setTimeout(() => {
      indicator.style.opacity = '0';
      indicator.style.transform = 'translateX(100%)';
    }, 2000);
  }

  createAutoSaveIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'autoSaveIndicator';
    indicator.innerHTML = `
      <i class="fas fa-check-circle"></i>
      <span>Auto-saved</span>
    `;
    indicator.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4caf50;
      color: white;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 6px;
      z-index: 10000;
      opacity: 0;
      transform: translateX(100%);
      transition: all 0.3s ease;
    `;
    
    document.body.appendChild(indicator);
    return indicator;
  }

  // Show error messages in a non-intrusive way
  showErrorMessage(message) {
    console.error('🎬 Error:', message);
    
    // Remove any existing error messages
    const existingError = document.getElementById('liveSummaryError');
    if (existingError) existingError.remove();
    
    const errorDiv = document.createElement('div');
    errorDiv.id = 'liveSummaryError';
    errorDiv.innerHTML = `
      <i class="fas fa-exclamation-triangle"></i>
      <span>${message}</span>
      <button onclick="this.parentElement.remove()">×</button>
    `;
    errorDiv.style.cssText = `
      position: fixed;
      top: 60px;
      right: 20px;
      background: #f44336;
      color: white;
      padding: 12px 16px;
      border-radius: 6px;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 8px;
      z-index: 10001;
      max-width: 300px;
      box-shadow: 0 4px 12px rgba(244, 67, 54, 0.3);
    `;
    
    document.body.appendChild(errorDiv);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (errorDiv.parentElement) {
        errorDiv.remove();
      }
    }, 5000);
  }

  async handleQuickAction(action) {
    if (this.isProcessing) return;
    
    const prompts = {
      bulletPoints: 'Generate bullet points summarizing the key topics and main points from this video.',
      questions: 'Generate 5-7 thoughtful questions that someone might ask after watching this video to test their understanding.'
    };
    
    await this.sendMessage(prompts[action], false);
  }

  buildContextualPrompt(userMessage, isAutomatic) {
    let prompt = '';
    
    if (this.currentVideoData?.transcript) {
      prompt += `Video Title: ${this.currentVideoData.title}\n`;
      prompt += `Video URL: ${this.currentVideoData.url}\n`;
      
      // Include timestamped transcript if available
      if (this.currentVideoData.timestampedTranscript && this.currentVideoData.timestampedTranscript.length > 0) {
        prompt += `Timestamped Transcript:\n`;
        this.currentVideoData.timestampedTranscript.forEach(segment => {
          prompt += `[${segment.timestamp}] ${segment.text}\n`;
        });
        prompt += '\n';
      } else {
        prompt += `Transcript: ${this.currentVideoData.transcript}\n\n`;
      }
    }
    
    if (isAutomatic) {
      prompt += userMessage;
    } else {
      prompt += `Based on the video content above, please answer this question: ${userMessage}`;
      
      // If user asks about specific time or wants to watch something, suggest timestamps
      if (userMessage.toLowerCase().includes('time') || 
          userMessage.toLowerCase().includes('when') || 
          userMessage.toLowerCase().includes('where') ||
          userMessage.toLowerCase().includes('minute') ||
          userMessage.toLowerCase().includes('part') ||
          userMessage.toLowerCase().includes('section')) {
        prompt += '\n\nIMPORTANT: If relevant to the question, provide specific timestamps in the format [MM:SS] where the user can find the information in the video. Make these timestamps clickable references to the exact moments in the video.';
      }
      
      // Enhanced prompt for better AI responses
      prompt += '\n\nPlease provide a detailed and helpful response. If you reference specific parts of the video, include the relevant timestamps so the user can easily navigate to those sections.';
    }
    
    return prompt;
  }

  async makeApiRequest(prompt) {
    // Use the centralized API service
    try {
      // Get the preferred AI provider and API key
      const storage = await chrome.storage.local.get(['aiProvider', 'apiKey', 'googleApiKey']);
      const aiProvider = storage.aiProvider || 'openai';
      
      let apiKey;
      // if (aiProvider === 'google') {
      //   apiKey = storage.googleApiKey;
      //   if (!apiKey) {
      //     throw new Error('Google AI API key not configured. Please set your Google AI API key in settings.');
      //   }
      // } else {
      //   apiKey = storage.apiKey;
      //   if (!apiKey) {
      //     throw new Error('OpenAI API key not configured. Please set your OpenAI API key in settings.');
      //   }
      // }
      
      // Ensure we have transcript data in the context
      let contextualPrompt = prompt;
      
      // If the current video data doesn't have transcript, try to fetch it
      if (this.currentVideoData && this.currentVideoData.videoId && !this.currentVideoData.transcript) {
        console.log('📝 Video data missing transcript, attempting to fetch...');
        
        try {
          // Try to get transcript from YouTube content script
          const activeTab = await new Promise((resolve) =>
            chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => resolve(tab))
          );
          
          if (this.currentVideoData.videoId) {
            const transcriptResponse = await new Promise((resolve, reject) => {
              const timeout = setTimeout(() => reject(new Error('Timeout')), 10000);
              chrome.tabs.sendMessage(activeTab.id, { 
                action: 'fetchTranscript', 
                videoId: this.currentVideoData.videoId 
              }, (response) => {
                clearTimeout(timeout);
                if (chrome.runtime.lastError) {
                  reject(chrome.runtime.lastError);
                } else {
                  resolve(response);
                }
              });
            });
            
            if (transcriptResponse && transcriptResponse.transcript) {
              console.log('📝 Successfully fetched fresh transcript for video');
              this.currentVideoData.transcript = transcriptResponse.transcript;
              this.currentVideoData.timestampedTranscript = transcriptResponse.timestampedTranscript;
              
              // Save the updated video data to session storage
              const sessionKey = `liveChatSession_${this.currentVideoData.videoId}`;
              const sessionData = {
                videoData: this.currentVideoData,
                chatHistory: this.chatHistory || [],
                timestamp: Date.now()
              };
              await chrome.storage.local.set({ [sessionKey]: sessionData });
            }
          }
        } catch (error) {
          console.log('📝 Could not fetch fresh transcript:', error.message);
          // Continue without transcript - the AI can still work with previous context
        }
      }
      
      // Build enhanced contextual prompt with transcript if available
      if (this.currentVideoData?.transcript) {
        const transcriptSection = this.currentVideoData.timestampedTranscript 
          ? this.buildTimestampedTranscriptSection()
          : `Transcript: ${this.currentVideoData.transcript}`;
          
        contextualPrompt = `Video Title: ${this.currentVideoData.title}
Video URL: ${this.currentVideoData.url}

${transcriptSection}

User Question: ${prompt}

Based on the video content above, please provide a detailed and helpful response. If you reference specific parts of the video, include relevant timestamps so the user can easily navigate to those sections.`;
      } else {
        console.log('📝 No transcript available, using prompt without video context');
      }
      
      // Make API request using the centralized service
      if (true) {
        return await apiService.getGeminiResponse(
          apiKey, 
          'gemini-2.0-flash-001', 
          "You are a helpful AI assistant that analyzes YouTube video content and provides detailed, accurate responses based on video transcripts.", 
          contextualPrompt, 
          0.3
        );
      } else {
        return await apiService.getOpenAIResponse(
          apiKey, 
          'gpt-4o-mini', 
          contextualPrompt, 
          2000, 
          0.3
        );
      }
      
    } catch (error) {
      console.error('📝 API request error:', error);
      throw error; // Re-throw to maintain existing error handling
    }
  }

  // Helper method to build timestamped transcript section
  buildTimestampedTranscriptSection() {
    if (!this.currentVideoData?.timestampedTranscript) {
      return `Transcript: ${this.currentVideoData?.transcript || 'No transcript available'}`;
    }
    
    let timestampedSection = 'Timestamped Transcript:\n';
    this.currentVideoData.timestampedTranscript.forEach(segment => {
      timestampedSection += `[${segment.timestamp}] ${segment.text}\n`;
    });
    
    return timestampedSection;
  }

  formatMessage(message) {
    // Convert markdown-style formatting and timestamps
    return message
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\[(\d{1,2}:\d{2})\]/g, (match, timeString) => {
        // Convert MM:SS to seconds for YouTube URL
        const [minutes, seconds] = timeString.split(':').map(Number);
        const totalSeconds = minutes * 60 + seconds;
        const videoUrl = this.currentVideoData?.url || '';
        const baseUrl = videoUrl.split('&t=')[0].split('?t=')[0]; // Remove existing timestamp
        const timestampUrl = `${baseUrl}&t=${totalSeconds}s`;
        
        return `<span class="timestamp-link" data-url="${timestampUrl}" style="color: #065fd4; cursor: pointer; text-decoration: underline; font-weight: 500;">[🕒 ${timeString}]</span>`;
      })
      .replace(/\n/g, '<br>');
  }

  addMessageToChat(message, type, shouldAutoSave = true) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${type}`;
    
    const timestamp = new Date().toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    let content = '';
    if (type === 'user') {
      content = `
        <div class="message-header">
          <strong>You</strong>
          <span class="timestamp">${timestamp}</span>
        </div>
        <div class="message-content">${this.formatMessage(message)}</div>
      `;
    } else if (type === 'assistant') {
      content = `
        <div class="message-header">
          <strong>Assistant</strong>
          <span class="timestamp">${timestamp}</span>
        </div>
        <div class="message-content">${this.formatMessage(message)}</div>
        <div class="message-actions">
          <button onclick="navigator.clipboard.writeText('${message.replace(/'/g, "\\'")}')">
            <i class="fas fa-copy"></i>
          </button>
        </div>
      `;
    } else if (type === 'error') {
      content = `
        <div class="message-header">
          <strong>Error</strong>
          <span class="timestamp">${timestamp}</span>
        </div>
        <div class="message-content error-content">${message}</div>
      `;
    }
    
    messageDiv.innerHTML = content;
    
    // Add click handlers for timestamp links after adding to DOM
    const timestampLinks = messageDiv.querySelectorAll('.timestamp-link');
    timestampLinks.forEach(link => {
      link.addEventListener('click', async (e) => {
        e.preventDefault();
        const url = link.getAttribute('data-url');
        if (url) {
          console.log('🕒 Navigating to timestamp in same tab:', url);
          
          try {
            // Get the current active tab
            const activeTab = await new Promise((resolve) =>
              chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => resolve(tab))
            );
            
            // Update the current tab's URL to the timestamp URL
            chrome.tabs.update(activeTab.id, { url: url });
            
            // Show a brief confirmation
            this.showTimestampNavigationIndicator(link.textContent);
            
          } catch (error) {
            console.error('Error navigating to timestamp:', error);
            // Fallback to opening in new tab if update fails
            window.open(url, '_blank');
          }
        }
      });
    });
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Show brief indicator when navigating to timestamp
  showTimestampNavigationIndicator(timestampText) {
    // Remove any existing indicator
    const existingIndicator = document.getElementById('timestampNavigationIndicator');
    if (existingIndicator) existingIndicator.remove();
    
    const indicator = document.createElement('div');
    indicator.id = 'timestampNavigationIndicator';
    indicator.innerHTML = `
      <i class="fas fa-play"></i>
      <span>Jumping to ${timestampText}</span>
    `;
    indicator.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #065fd4;
      color: white;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 6px;
      z-index: 10000;
      opacity: 0;
      transform: translateX(100%);
      transition: all 0.3s ease;
    `;
    
    document.body.appendChild(indicator);
    
    // Animate in
    setTimeout(() => {
      indicator.style.opacity = '1';
      indicator.style.transform = 'translateX(0)';
    }, 50);
    
    // Animate out and remove
    setTimeout(() => {
      indicator.style.opacity = '0';
      indicator.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (indicator.parentElement) {
          indicator.remove();
        }
      }, 300);
    }, 2000);
  }

  async handleSaveVideo() {
    if (!this.currentVideoData || this.chatHistory.length === 0) {
      alert('No video data or chat history to save.');
      return;
    }

    // Check if already saved
    const existingSavedVideo = await this.checkIfVideoAlreadySaved(this.currentVideoData.videoId);
    if (existingSavedVideo) {
      alert('This video is already saved!');
      return;
    }

    try {
      // Get existing saved videos
      const result = await chrome.storage.local.get(['savedVideos']);
      const savedVideos = result.savedVideos || [];

      const videoSaveData = {
        videoId: this.currentVideoData.videoId,
        title: this.currentVideoData.title,
        url: this.currentVideoData.url,
        thumbnail: this.currentVideoData.thumbnail,
        // DON'T save transcript data to long-term storage (space optimization)
        // transcript: this.currentVideoData.transcript,
        // timestampedTranscript: this.currentVideoData.timestampedTranscript,
        // Save summary for display in saved videos list
        summary: this.chatHistory.find(h => h.type === 'summary')?.response || '',
        // Keep chat history for restoring conversations
        chatHistory: this.chatHistory,
        savedAt: new Date().toISOString(),
        // Additional data for backward compatibility
        bulletPoints: this.chatHistory.find(h => h.message.includes('bullet points'))?.response || '',
        questions: this.chatHistory.find(h => h.message.includes('questions'))?.response || ''
      };

      // Add new video (no need to check existingIndex since we already verified it doesn't exist)
      savedVideos.push(videoSaveData);

      // Save to storage
      await chrome.storage.local.set({ savedVideos });
      
      // Update save button to show it's saved
      this.updateSaveButtonForSavedVideo();
      
    } catch (error) {
      console.error('Error saving video:', error);
      alert('Error saving video data: ' + error.message);
    }
  }

  // Static method to load saved video
  static async loadSavedVideo(videoId) {
    const result = await chrome.storage.local.get(['savedVideos']);
    const savedVideos = result.savedVideos || [];
    return savedVideos.find(v => v.videoId === videoId);
  }
}

// Global instance
let youtubeLiveSummary = null;