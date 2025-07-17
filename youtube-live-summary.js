// YouTube Live Summary Manager
class YouTubeLiveSummary {
  constructor() {
    this.currentVideoData = null;
    this.chatHistory = [];
    this.isProcessing = false;
    this.autoSaveEnabled = true;
    this.saveTimeout = null;
    this.messageMap = new Map(); // Track messages for deletion
  }

  async initialize(videoData) {
    console.log('🎬 YouTubeLiveSummary: Initializing with video data:', videoData?.title);
    
    try {
      this.currentVideoData = videoData;
      
      // IMMEDIATELY setup UI with what we have
      this.setupUI();
      this.setupEventListeners();
      
      // Show loading message right away if we need to generate content
      let needsInitialSummary = true;
      let hasExistingChat = false;
      
      // Check for existing chat history in passed data
      if (videoData.chatHistory && videoData.chatHistory.length > 0) {
        console.log('🎬 Video has existing chat history, loading...');
        this.chatHistory = videoData.chatHistory;
        await this.restoreChatHistory();
        hasExistingChat = true;
        needsInitialSummary = false;
        
        // ONLY mark as saved if this data came from a manually saved video
        if (videoData.isFromSavedVideo) {
          this.updateSaveButtonForSavedVideo();
        } else {
          this.updateSaveButtonToDefault();
        }
      } else {
        // Check if this video is saved in storage (fallback check)
        const savedVideo = await this.checkIfVideoAlreadySaved(videoData.videoId);
        if (savedVideo && savedVideo.chatHistory && savedVideo.chatHistory.length > 0) {
          console.log('🎬 Found saved video in storage, loading existing data:', savedVideo.title);
          // Update current video data with saved data
          this.currentVideoData = {
            ...this.currentVideoData,
            chatHistory: savedVideo.chatHistory
          };
          this.chatHistory = savedVideo.chatHistory;
          await this.restoreChatHistory();
          hasExistingChat = true;
          needsInitialSummary = false;
          this.updateSaveButtonForSavedVideo(); // This video is actually saved
        }
      }
      
      // If we need an initial summary, show loading and generate asynchronously
      if (needsInitialSummary) {
        console.log('🎬 No existing summary found, generating new one...');
        // Add loading message immediately
        const loadingId = this.addLoadingMessage();
        
        // Generate summary asynchronously without blocking UI
        this.generateInitialSummaryAsync(loadingId);
      }
      
    } catch (error) {
      console.error('🎬 Error initializing YouTubeLiveSummary:', error);
      this.showErrorMessage('Failed to initialize Live Summary. Please try again.');
    }
  }

  // Generate initial summary asynchronously to avoid blocking UI
  async generateInitialSummaryAsync(loadingId) {
    try {
      // If no loading message was created, try to add one now
      if (!loadingId) {
        console.log('🎬 generateInitialSummaryAsync: No loadingId provided, trying to add loading message again...');
        loadingId = this.addLoadingMessage();
      }
      
      const initialMessage = `Please provide a comprehensive summary of this YouTube video: "${this.currentVideoData?.title}". You should include really important information, key points, and any relevant details that would help someone understand the content without watching the video. You just describe what the video is about in one sentence. Then provide a brief overview of the main topics covered in the video, we need value not just summary`;
      
      // Prepare the prompt with video context
      const contextualPrompt = this.buildContextualPrompt(initialMessage, true);
      
      // Get API response
      const response = await this.makeApiRequest(contextualPrompt);
      
      // Remove loading message only if we have a valid loadingId
      if (loadingId) {
        this.removeLoadingMessage(loadingId);
      }
      
      // Add response to chat
      this.addMessageToChat(response, 'assistant');
      
      // Save to chat history
      const chatEntry = { 
        message: 'Initial Summary', 
        response, 
        timestamp: new Date().toISOString(),
        type: 'summary'
      };
      
      this.chatHistory.push(chatEntry);
      
      // Auto-save chat history
      await this.autoSaveChatHistory();
      
    } catch (error) {
      console.error('🎬 Error generating initial summary:', error);
      if (loadingId) {
        this.removeLoadingMessage(loadingId);
      }
      this.addMessageToChat(`Error generating summary: ${error.message}`, 'error');
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
      saveBtn.innerHTML = '<i class="fas fa-check"></i>';
      saveBtn.style.background = '#4caf50';
      saveBtn.style.cursor = 'not-allowed';
      saveBtn.title = 'Video already saved';
    }
  }

  updateSaveButtonToDefault() {
    const saveBtn = document.getElementById('saveVideoBtn');
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fas fa-bookmark"></i>';
      saveBtn.style.background = '';
      saveBtn.style.cursor = 'pointer';
      saveBtn.title = 'Save video data';
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
      if (chatMessages) {
        // Remove the default loading message and clear container
        const defaultLoading = document.getElementById('defaultLoadingMessage');
        if (defaultLoading) {
          defaultLoading.remove();
        }
        chatMessages.innerHTML = '';
      }
    } else {
      // Don't clear the chat - it will be restored by loadVideoWithHistory
      console.log('🎬 Preserving existing chat for saved video');
      // But still remove the default loading message
      const defaultLoading = document.getElementById('defaultLoadingMessage');
      if (defaultLoading) {
        defaultLoading.remove();
      }
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

    // Set up event delegation for dynamically added copy buttons
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
      chatMessages.addEventListener('click', (e) => {
        if (e.target.closest('.copy-message-btn')) {
          e.preventDefault();
          const button = e.target.closest('.copy-message-btn');
          const message = button.getAttribute('data-message');
          this.handleCopyMessage(message, button);
        }
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
    console.log('🎬 addLoadingMessage: Starting...');
    const chatMessages = document.getElementById('chatMessages');
    
    if (!chatMessages) {
      console.error('🎬 addLoadingMessage: chatMessages container not found!');
      console.log('🎬 addLoadingMessage: Available elements:', 
        Array.from(document.querySelectorAll('[id]')).map(el => el.id));
      return null; // Return null if container doesn't exist
    }
    
    console.log('🎬 addLoadingMessage: chatMessages container found, adding loading message...');
    
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
        <div style="margin-top: 8px; font-size: 12px; color: #666;">
          Generating summary...
        </div>
      </div>
    `;
    
    chatMessages.appendChild(loadingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    console.log('🎬 addLoadingMessage: Loading message added with ID:', loadingId);
    return loadingId;
  }

  removeLoadingMessage(loadingId) {
    console.log(2345);
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
      
      console.log('addLoadingMessage');
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
        
        // Update transcript data if available (for videos saved before transcript storage was implemented)
        if (this.currentVideoData.transcript && !savedVideos[videoIndex].transcript) {
          savedVideos[videoIndex].transcript = this.currentVideoData.transcript;
        }
        if (this.currentVideoData.timestampedTranscript && !savedVideos[videoIndex].timestampedTranscript) {
          savedVideos[videoIndex].timestampedTranscript = this.currentVideoData.timestampedTranscript;
        }
        
        // Update summary for display
        const latestSummary = this.chatHistory.find(h => h.type === 'summary')?.response;
        if (latestSummary) {
          savedVideos[videoIndex].summary = latestSummary;
        }
        
        await chrome.storage.local.set({ savedVideos });
        console.log('🎬 Updated saved video with new chat history and transcript data');
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
    
    // Add recent chat history for context (limit to last 5 exchanges to avoid token limits)
    if (this.chatHistory && this.chatHistory.length > 0 && !isAutomatic) {
      prompt += `Previous Conversation:\n`;
      const recentHistory = this.chatHistory.slice(-5); // Get last 5 exchanges
      recentHistory.forEach(chat => {
        if (chat.type !== 'summary') { // Don't repeat the summary in context
          prompt += `User: ${chat.message}\n`;
        }
        prompt += `Assistant: ${chat.response}\n\n`;
      });
      prompt += `---\n\n`;
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
    
    // Generate unique message ID for deletion
    const messageId = 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    messageDiv.setAttribute('data-message-id', messageId);
    
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
          <button class="delete-message-btn" data-message-id="${messageId}" title="Delete message">
            <i class="fas fa-trash"></i>
          </button>
        </div>
        <div class="message-content">${this.formatMessage(message)}</div>
      `;
    } else if (type === 'assistant') {
      content = `
        <div class="message-header">
          <strong>Assistant</strong>
          <span class="timestamp">${timestamp}</span>
          <button class="delete-message-btn" data-message-id="${messageId}" title="Delete message">
            <i class="fas fa-trash"></i>
          </button>
        </div>
        <div class="message-content">${this.formatMessage(message)}</div>
        <div class="message-actions">
          <button class="copy-message-btn" data-message="${message.replace(/'/g, "\\'")}">
            <i class="fas fa-copy"></i>
            Copy
          </button>
        </div>
      `;
    } else if (type === 'error') {
      content = `
        <div class="message-header">
          <strong>Error</strong>
          <span class="timestamp">${timestamp}</span>
          <button class="delete-message-btn" data-message-id="${messageId}" title="Delete message">
            <i class="fas fa-trash"></i>
          </button>
        </div>
        <div class="message-content error-content">${message}</div>
      `;
    }
    
    messageDiv.innerHTML = content;
    
    // Add click handler for delete button
    const deleteBtn = messageDiv.querySelector('.delete-message-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handleDeleteMessage(messageId);
      });
    }
    
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
    
    // Store message info for potential deletion
    if (shouldAutoSave) {
      const messageInfo = {
        id: messageId,
        message: type === 'user' ? message : null,
        response: type === 'assistant' ? message : null,
        type: type,
        timestamp: new Date().toISOString()
      };
      
      // Store message info temporarily for deletion mapping
      if (!this.messageMap) this.messageMap = new Map();
      this.messageMap.set(messageId, messageInfo);
    }
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

  // Handle message deletion
  async handleDeleteMessage(messageId) {
    try {
      // Show confirmation dialog
      const confirmed = confirm('Are you sure you want to delete this message? This action cannot be undone.');
      if (!confirmed) return;
      
      // Remove message from UI
      const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
      if (messageElement) {
        messageElement.remove();
      }
      
      // Get message info from map
      const messageInfo = this.messageMap.get(messageId);
      if (messageInfo) {
        // Remove from chat history based on message content
        if (messageInfo.type === 'user') {
          // Find and remove the chat entry that contains this user message
          const entryIndex = this.chatHistory.findIndex(entry => 
            entry.message === messageInfo.message
          );
          if (entryIndex !== -1) {
            this.chatHistory.splice(entryIndex, 1);
            console.log('🗑️ Removed user message and corresponding chat entry from history');
          }
        } else if (messageInfo.type === 'assistant') {
          // Find and remove the chat entry that contains this assistant response
          const entryIndex = this.chatHistory.findIndex(entry => 
            entry.response === messageInfo.response
          );
          if (entryIndex !== -1) {
            this.chatHistory.splice(entryIndex, 1);
            console.log('🗑️ Removed assistant response and corresponding chat entry from history');
          }
        }
        
        // Remove from message map
        this.messageMap.delete(messageId);
      }
      
      // Auto-save updated chat history
      await this.autoSaveChatHistory();
      
      // Show brief confirmation
      this.showDeleteConfirmation();
      
    } catch (error) {
      console.error('Error deleting message:', error);
      alert('Failed to delete message. Please try again.');
    }
  }

  // Show brief confirmation when message is deleted
  showDeleteConfirmation() {
    // Remove any existing confirmation
    const existingConfirmation = document.getElementById('deleteConfirmation');
    if (existingConfirmation) existingConfirmation.remove();
    
    const confirmation = document.createElement('div');
    confirmation.id = 'deleteConfirmation';
    confirmation.innerHTML = `
      <i class="fas fa-check-circle"></i>
      <span>Message deleted</span>
    `;
    confirmation.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #ff5722;
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
    
    document.body.appendChild(confirmation);
    
    // Animate in
    setTimeout(() => {
      confirmation.style.opacity = '1';
      confirmation.style.transform = 'translateX(0)';
    }, 50);
    
    // Animate out and remove
    setTimeout(() => {
      confirmation.style.opacity = '0';
      confirmation.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (confirmation.parentElement) {
          confirmation.remove();
        }
      }, 300);
    }, 2000);
  }

  // Handle copying message to clipboard
  async handleCopyMessage(message, button) {
    try {
      await navigator.clipboard.writeText(message);
      
      // Show success feedback
      const originalHtml = button.innerHTML;
      button.innerHTML = '<i class="fas fa-check"></i> Copied!';
      button.style.background = '#4caf50';
      
      setTimeout(() => {
        button.innerHTML = originalHtml;
        button.style.background = '';
      }, 2000);
      
    } catch (error) {
      console.error('Failed to copy message:', error);
      // Fallback for browsers that don't support clipboard API
      const textArea = document.createElement('textarea');
      textArea.value = message;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        button.innerHTML = '<i class="fas fa-check"></i> Copied!';
        setTimeout(() => {
          button.innerHTML = '<i class="fas fa-copy"></i> Copy';
        }, 2000);
      } catch (fallbackError) {
        console.error('Fallback copy failed:', fallbackError);
      }
      document.body.removeChild(textArea);
    }
  }

  // Show success indicator when video is saved
  showSaveSuccessIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'saveSuccessIndicator';
    indicator.innerHTML = `
      <i class="fas fa-check-circle"></i>
      <span>Video saved successfully!</span>
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
      transform: translateY(-10px);
      transition: all 0.3s ease;
    `;
    
    document.body.appendChild(indicator);
    
    // Animate in
    setTimeout(() => {
      indicator.style.opacity = '1';
      indicator.style.transform = 'translateY(0)';
    }, 50);
    
    // Animate out and remove
    setTimeout(() => {
      indicator.style.opacity = '0';
      indicator.style.transform = 'translateY(-10px)';
      setTimeout(() => {
        if (indicator.parentElement) {
          indicator.remove();
        }
      }, 300);
    }, 2000);
  }

  async handleSaveVideo() {
    console.log('🎬 handleSaveVideo: Starting save process...');
    
    if (!this.currentVideoData || this.chatHistory.length === 0) {
      console.log('🎬 handleSaveVideo: Missing data - videoData:', !!this.currentVideoData, 'chatHistory length:', this.chatHistory.length);
      alert('No video data or chat history to save.');
      return;
    }

    console.log('🎬 handleSaveVideo: Attempting to save video:', this.currentVideoData.title);
    console.log('🎬 handleSaveVideo: Current transcript available:', !!this.currentVideoData.transcript);
    console.log('🎬 handleSaveVideo: Current timestampedTranscript available:', !!this.currentVideoData.timestampedTranscript);

    // Show saving indicator immediately
    const saveBtn = document.getElementById('saveVideoBtn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      saveBtn.title = 'Saving video...';
    }

    try {
      // Get existing saved videos with detailed logging
      console.log('🎬 handleSaveVideo: Getting existing saved videos...');
      const result = await chrome.storage.local.get(['savedVideos']);
      const savedVideos = result.savedVideos || [];
      console.log('🎬 handleSaveVideo: Found', savedVideos.length, 'existing saved videos');

      // Check if already saved with detailed logging
      const existingIndex = savedVideos.findIndex(v => v.videoId === this.currentVideoData.videoId);
      console.log('🎬 handleSaveVideo: Checking for duplicate, existingIndex:', existingIndex);
      
      if (existingIndex !== -1) {
        console.log('🎬 handleSaveVideo: Video already saved at index:', existingIndex);
        alert('This video is already saved!');
        
        // Reset button
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerHTML = '<i class="fas fa-bookmark"></i>';
        }
        return;
      }

      // ENSURE we have transcript data before saving
      let transcriptData = this.currentVideoData.transcript || '';
      let timestampedTranscriptData = this.currentVideoData.timestampedTranscript || [];

      console.log('🎬 handleSaveVideo: Initial transcript data:', {
        hasTranscript: !!transcriptData,
        transcriptLength: transcriptData.length,
        hasTimestampedTranscript: !!timestampedTranscriptData,
        timestampedTranscriptLength: timestampedTranscriptData.length
      });

      // If we don't have transcript, try to fetch it fresh
      if (!transcriptData && this.currentVideoData.videoId) {
        console.log('🎬 handleSaveVideo: No transcript available, attempting to fetch fresh...');
        try {
          const activeTab = await new Promise((resolve) =>
            chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => resolve(tab))
          );
          
          if (activeTab.url && activeTab.url.includes('youtube.com/watch') && activeTab.url.includes(this.currentVideoData.videoId)) {
            console.log('🎬 handleSaveVideo: Sending transcript fetch request...');
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
              console.log('🎬 handleSaveVideo: Successfully fetched fresh transcript for saving');
              transcriptData = transcriptResponse.transcript;
              timestampedTranscriptData = transcriptResponse.timestampedTranscript || [];
              
              // Update current video data
              this.currentVideoData.transcript = transcriptData;
              this.currentVideoData.timestampedTranscript = timestampedTranscriptData;
            } else {
              console.log('🎬 handleSaveVideo: No transcript in response');
            }
          } else {
            console.log('🎬 handleSaveVideo: Not on matching YouTube page');
          }
        } catch (error) {
          console.log('🎬 handleSaveVideo: Could not fetch fresh transcript for saving:', error.message);
          // Continue without transcript - better to save something than nothing
        }
      }

      const videoSaveData = {
        videoId: this.currentVideoData.videoId,
        title: this.currentVideoData.title,
        url: this.currentVideoData.url,
        thumbnail: this.currentVideoData.thumbnail,
        // CRITICAL: Save transcript data to permanent storage
        transcript: transcriptData,
        timestampedTranscript: timestampedTranscriptData,
        // Save summary for display in saved videos list
        summary: this.chatHistory.find(h => h.type === 'summary')?.response || '',
        // Keep chat history for restoring conversations
        chatHistory: this.chatHistory,
        savedAt: new Date().toISOString(),
        // Additional data for backward compatibility
        bulletPoints: this.chatHistory.find(h => h.message && h.message.toLowerCase().includes('bullet points'))?.response || '',
        questions: this.chatHistory.find(h => h.message && h.message.toLowerCase().includes('questions'))?.response || ''
      };

      console.log('🎬 handleSaveVideo: Prepared video data for saving:', {
        videoId: videoSaveData.videoId,
        title: videoSaveData.title,
        hasTranscript: !!videoSaveData.transcript,
        transcriptLength: videoSaveData.transcript?.length || 0,
        hasTimestampedTranscript: !!videoSaveData.timestampedTranscript,
        timestampedTranscriptLength: videoSaveData.timestampedTranscript?.length || 0,
        chatHistoryLength: videoSaveData.chatHistory.length,
        hasSummary: !!videoSaveData.summary
      });

      // Add new video
      savedVideos.push(videoSaveData);
      console.log('🎬 handleSaveVideo: Added video to array, new length:', savedVideos.length);

      // Save to storage with error handling
      console.log('🎬 handleSaveVideo: Saving to chrome.storage.local...');
      await chrome.storage.local.set({ savedVideos });
      
      console.log('🎬 handleSaveVideo: ✅ Video successfully saved to storage');
      
      // Update save button to show it's saved
      this.updateSaveButtonForSavedVideo();
      
      // Show success indicator
      this.showSaveSuccessIndicator();
      
      // Force refresh saved videos display if summaries manager exists
      if (window.SummariesManager && window.summariesManager) {
        console.log('🎬 handleSaveVideo: Refreshing summaries manager display...');
        setTimeout(async () => {
          await window.summariesManager.displaySavedContent();
          console.log('🎬 handleSaveVideo: Summaries display refreshed');
        }, 500);
      } else {
        console.log('🎬 handleSaveVideo: No summaries manager available for refresh');
      }
      
    } catch (error) {
      console.error('🎬 handleSaveVideo: ❌ Error saving video:', error);
      alert('Error saving video data: ' + error.message);
      
      // Reset button on error
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-bookmark"></i>';
      }
    }
  }
}

// Global instance
let youtubeLiveSummary = null;