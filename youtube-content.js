// YouTube-specific content script for automatic transcript extraction and summarization
let transcriptData = '';
let timestampedTranscriptData = null; // Store timestamped transcript data
let summaryButton = null;
let isYouTube = false;

// Global variable to store current video data for Live Summary
let currentVideoData = null;

// Built-in API functions (moved from secure-api.js to avoid loading issues)
async function getApiKey() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['apiKey'], (result) => {
      if (chrome.runtime.lastError) {
        console.error('Error getting API key:', chrome.runtime.lastError);
        resolve(null);
        return;
      }
      resolve(result.apiKey || null);
    });
  });
}

async function makeApiRequest(prompt) {
  // Get the preferred AI provider and API key
  const storage = await chrome.storage.local.get(['aiProvider', 'apiKey', 'googleApiKey']);
  const aiProvider = storage.aiProvider || 'openai';
  
  let apiKey;
  // if (aiProvider === 'google') {
  //   apiKey = storage.googleApiKey;
  //   // if (!apiKey) {
  //   //   throw new Error('Google AI API key not configured. Please set your Google AI API key in settings.');
  //   // }
  // } else {
  //   apiKey = storage.apiKey;
  //   if (!apiKey) {
  //     throw new Error('OpenAI API key not configured. Please set your OpenAI API key in settings.');
  //   }
  // }
  
  // Use the centralized API service
  if (true) {
    return await apiService.getGeminiResponse(
      apiKey, 
      'gemini-3.5-flash', 
      "You are a helpful AI assistant that analyzes YouTube video content and provides detailed, accurate responses based on video transcripts.", 
      prompt, 
      0.3
    );
  } else {
    return await apiService.getOpenAIResponse(
      apiKey, 
      'gpt-4o-mini', 
      prompt, 
      300, 
      0.3
    );
  }
}

// Helper functions for parsing
function parseText(text) {
  try {
    const match = text.match(/\(([^)]+)\)/);
    if (match) {
      const topic = match[1];
      const newText = text.replace(`(${topic})`, '');
      return [newText.trim(), topic];
    }
  } catch (e) {
    console.warn('Could not parse topic from text');
  }
  return [text, 'YouTube Video Summary'];
}

function getLanguage(text) {
  try {
    const match = text.match(/\[(.*?)\]/);
    if (match) {
      const lang = match[1];
      const newText = text.replace(`[${lang}]`, '');
      return [newText.trim(), lang];
    }
  } catch (e) {
    console.warn('Could not parse language from text');
  }
  return [text, 'en'];
}

// Import styles for summary display
function importStyles() {
  if (!document.getElementById('summary-styles-yt')) {
    const link = document.createElement('link');
    link.id = 'summary-styles-yt';
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('summary.css');
    document.head.appendChild(link);
  }
}

// Listen for messages from background/popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('YouTube content script received message:', request);
  
  if (request.action === 'getSummary') {
    const summaryDiv = document.querySelector('#yt-summary-display p');
    sendResponse(summaryDiv ? summaryDiv.textContent : null);
  } else if (request.action === 'getSummaryTopic') {
    const topicElement = document.querySelector('#yt-summary-display h3');
    sendResponse({ value: topicElement ? topicElement.textContent : null });
  } else if (request.action === 'getCurrentVideoData') {
    // Return current video data for Quiz Manager
    const videoId = getVideoId();
    if (videoId) {
      const title = document.querySelector('h1.ytd-watch-metadata')?.textContent?.trim() || 'YouTube Video';
      const videoUrl = window.location.href;
      const thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      
      sendResponse({
        videoData: {
          videoId,
          title,
          url: videoUrl,
          thumbnail,
          transcript: transcriptData || '', // Use cached transcript if available
          timestampedTranscript: timestampedTranscriptData || null
        }
      });
    } else {
      sendResponse({ videoData: null });
    }
  } else if (request.action === 'getVideoTitle') {
    // Get just the video title for Quiz Manager
    const title = document.querySelector('h1.ytd-watch-metadata')?.textContent?.trim() || 
                  document.querySelector('h1.ytd-video-primary-info-renderer')?.textContent?.trim() ||
                  'YouTube Video';
    sendResponse({ title });
  } else if (request.action === 'getVideoData') {
    // Return current video data for Live Summary (legacy compatibility)
    const videoId = getVideoId();
    if (videoId) {
      const title = document.querySelector('h1.ytd-watch-metadata')?.textContent?.trim() || 'YouTube Video';
      const videoUrl = window.location.href;
      const thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      
      sendResponse({
        videoData: {
          videoId,
          title,
          url: videoUrl,
          thumbnail,
          transcript: transcriptData || '', // Use cached transcript if available
          timestampedTranscript: timestampedTranscriptData || null
        }
      });
    } else {
      sendResponse({ videoData: null });
    }
  } else if (request.action === 'fetchTranscript') {
    // Fetch transcript with timestamps for a specific video
    fetchTranscriptWithTimestamps(request.videoId).then(result => {
      sendResponse(result);
    }).catch(error => {
      console.error('Error fetching transcript:', error);
      sendResponse({ 
        transcript: null, 
        timestampedTranscript: null,
        error: error.message 
      });
    });
    return true; // Keep channel open for async response
  } else if (request.action === 'clearVideoCache') {
    // Allow popup/background to clear the session cache and optionally regenerate
    handleRegenerateSummary().then(() => sendResponse({ success: true })).catch(err => {
      console.warn('clearVideoCache error:', err);
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
  
  return true;
});


// Check if we're on YouTube
function isYouTubePage() {
  return window.location.hostname === 'www.youtube.com' || window.location.hostname === 'youtube.com';
}

// Wait for YouTube page to load completely
function waitForYouTubeLoad() {
  return new Promise((resolve) => {
    // Check for multiple indicators that YouTube is ready
    const checkReady = () => {
      const moviePlayer = document.querySelector('#movie_player');
      const videoTitle = document.querySelector('h1.ytd-watch-metadata, h1.ytd-video-primary-info-renderer');
      const metaContainer = document.querySelector('#meta-contents, #primary-inner');
      
      if (moviePlayer && videoTitle && metaContainer) {
        console.log('YouTube page fully loaded and ready for button injection');
        resolve();
        return true;
      }
      return false;
    };

    // If already ready, resolve immediately
    if (checkReady()) return;

    // Otherwise, set up observers
    const observer = new MutationObserver((mutations, obs) => {
      if (checkReady()) {
        obs.disconnect();
      }
    });

    observer.observe(document.body, { 
      childList: true, 
      subtree: true,
      attributes: false // Reduce noise
    });

    // Fallback timeout to prevent infinite waiting
    setTimeout(() => {
      observer.disconnect();
      console.log('YouTube load timeout - proceeding anyway');
      resolve();
    }, 10000);
  });
}

// Extract video ID from URL
function getVideoId() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('v');
}

// Extract transcript using ytInitialPlayerResponse (uses YouTube's own caption URLs)
// Returns { transcript: string, segments: array|null } or null
async function fetchTranscriptFromPlayerResponse() {
  try {
    const tracks = window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!tracks?.length) return null;

    const track = tracks.find(t => t.languageCode === 'en' && !t.kind) ||
                  tracks.find(t => t.languageCode?.startsWith('en')) ||
                  tracks.find(t => t.kind === 'asr') ||
                  tracks[0];
    if (!track?.baseUrl) return null;

    const url = track.baseUrl.includes('fmt=') ? track.baseUrl : `${track.baseUrl}&fmt=json3`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const text = await res.text();
    if (!text?.trim()) return null;

    if (text.trim().startsWith('{')) {
      const data = JSON.parse(text);
      if (!data.events?.length) return null;

      const segments = [];
      data.events.filter(e => e.segs && e.tStartMs !== undefined).forEach(e => {
        const startTime = Math.floor(e.tStartMs / 1000);
        const duration = e.dDurationMs ? Math.floor(e.dDurationMs / 1000) : 5;
        const segText = e.segs.map(s => s.utf8 || '').join('').trim();
        if (!segText) return;
        const mins = Math.floor(startTime / 60);
        const secs = startTime % 60;
        segments.push({
          text: segText,
          startTime,
          endTime: startTime + duration,
          timestamp: `${mins}:${secs.toString().padStart(2, '0')}`,
          youtubeTimestamp: `${startTime}s`
        });
      });

      if (!segments.length) return null;
      const transcript = segments.map(s => s.text).join(' ').replace(/\s+/g, ' ').trim();
      if (transcript.length < 50) return null;
      console.log(`Fetched transcript via ytInitialPlayerResponse: ${segments.length} segments`);
      return { transcript, segments };

    } else if (text.trim().startsWith('<')) {
      const xml = new DOMParser().parseFromString(text, 'text/xml');
      const transcript = Array.from(xml.querySelectorAll('text'))
        .map(t => t.textContent.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").trim())
        .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
      if (transcript.length < 50) return null;
      console.log('Fetched transcript via ytInitialPlayerResponse (XML)');
      return { transcript, segments: null };
    }
  } catch (e) {
    console.log('fetchTranscriptFromPlayerResponse failed:', e.message);
  }
  return null;
}

async function fetchTranscript(videoId) {
  console.log(`Fetching transcript for ${videoId}`);
  try {
    // Method 1: ytInitialPlayerResponse (fast, reliable)
    const result = await fetchTranscriptFromPlayerResponse();
    if (result) return result.transcript;

    // Method 2: DOM extraction (requires transcript panel to be open)
    console.log('Player response unavailable, trying page extraction...');
    const pageTranscript = await extractTranscriptFromPage();
    if (pageTranscript && pageTranscript !== 'No transcript available' && pageTranscript.length > 50) {
      return pageTranscript;
    }

    return await getVideoDescriptionFallback();
  } catch (error) {
    console.log('Error in fetchTranscript:', error);
    return await getVideoDescriptionFallback();
  }
}

// Function to detect if text contains UI elements rather than actual transcript
function isUIText(text) {
  const uiKeywords = [
    'tap to unmute', 'pull up for precise', 'play (k)', 'subscribe', 'subscribed',
    'scroll for details', 'autoplay', 'next video', 'up next', 'recommended',
    'skip ad', 'advertisement', 'sponsor', 'like this video', 'share', 'comment',
    'notification', 'bell icon', 'menu', 'settings', 'quality', 'speed',
    'captions', 'subtitles', 'theater mode', 'full screen', 'miniplayer',
    'watch later', 'add to queue', 'report', 'transcript', 'description',
    'show more', 'show less', 'sort by', 'newest first', 'top comments'
  ];
  
  const lowerText = text.toLowerCase();
  const uiMatches = uiKeywords.filter(keyword => lowerText.includes(keyword)).length;
  
  // If more than 20% of the text is UI keywords, it's probably not a real transcript
  const uiRatio = uiMatches / Math.max(text.split(' ').length / 10, 1);
  
  return uiRatio > 0.2 || text.length < 50;
}

// Fetch transcript with timestamps for Live Summary
async function fetchTranscriptWithTimestamps(videoId) {
  console.log(`Fetching timestamped transcript for ${videoId}`);
  try {
    // Method 1: ytInitialPlayerResponse (includes timestamps)
    const result = await fetchTranscriptFromPlayerResponse();
    if (result) {
      transcriptData = result.transcript;
      timestampedTranscriptData = result.segments;
      return { transcript: result.transcript, timestampedTranscript: result.segments, success: true };
    }

    // Method 2: DOM extraction with timestamps
    console.log('Player response unavailable, trying page extraction...');
    const pageResult = await extractTimestampedTranscriptFromPage();
    if (pageResult?.transcript?.length > 50) {
      transcriptData = pageResult.transcript;
      timestampedTranscriptData = pageResult.timestampedTranscript;
      return pageResult;
    }

    // Method 3: Plain transcript fallback
    const plainTranscript = await fetchTranscript(videoId);
    if (plainTranscript && plainTranscript !== 'No transcript available') {
      transcriptData = plainTranscript;
      return { transcript: plainTranscript, timestampedTranscript: null, success: true, fallback: true };
    }

    return { transcript: null, timestampedTranscript: null, success: false, error: 'No transcript available' };
  } catch (error) {
    console.log('Error in fetchTranscriptWithTimestamps:', error);
    return { transcript: null, timestampedTranscript: null, success: false, error: error.message };
  }
}

// Extract from transcript segments
async function extractFromTranscriptSegments() {
  // Selector pairs: [container, text-child] — try text-child first for precision,
  // fall back to grabbing textContent of the whole container.
  const segmentSelectors = [
    // New YouTube DOM (2024+): transcript-segment-view-model
    'transcript-segment-view-model span[role="text"]',
    'transcript-segment-view-model .ytAttributedStringHost',
    // Legacy DOM: ytd-transcript-segment-renderer
    'ytd-transcript-segment-renderer .segment-text',
    'ytd-transcript-segment-renderer yt-formatted-string',
    // Generic fallback: grab any transcript container and pull its text
    'transcript-segment-view-model',
    'ytd-transcript-segment-renderer'
  ];
  
  for (const selector of segmentSelectors) {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      console.log(`Found ${elements.length} transcript segments with selector: ${selector}`);
      
      const transcriptParts = Array.from(elements)
        .map(el => {
          // For container elements, skip timestamp/a11y children and grab only text
          const tag = el.tagName?.toLowerCase();
          let text;
          if (tag === 'transcript-segment-view-model' || tag === 'ytd-transcript-segment-renderer') {
            // Get only the text node from the span[role=text] or .segment-text child
            const textEl = el.querySelector('span[role="text"], .segment-text, yt-formatted-string');
            text = (textEl || el).textContent?.trim();
          } else {
            text = el.textContent?.trim();
          }
          if (!text || text.length < 2) return null;
          // Skip standalone timestamp strings like "0:05" or accessibility labels
          if (/^\d+:\d+(:\d+)?$/.test(text)) return null;
          if (/^\d+ (second|minute|hour)/.test(text)) return null;
          return text;
        })
        .filter(Boolean);
      
      if (transcriptParts.length > 0) {
        const transcript = transcriptParts.join(' ').replace(/\s+/g, ' ').trim();
        if (transcript.length > 100 && !isUIText(transcript)) {
          console.log('Successfully extracted transcript from segments');
          return transcript;
        }
      }
    }
  }
  
  throw new Error('No valid transcript segments found');
}

// Final fallback for when everything else fails
async function getVideoDescriptionFallback() {
  try {
    const title = document.querySelector('h1.ytd-watch-metadata')?.textContent || 'YouTube Video';
    const description = document.querySelector('#meta-contents #description-text')?.textContent || '';
    
    if (description.length > 50) {
      return `Video: ${title}\n\nDescription: ${description}`.trim();
    }
    
    // If no description, at least return the title
    return `Video: ${title}\n\nNo transcript or description available. This appears to be a video that may not have captions enabled.`;
    
  } catch (error) {
    return 'No transcript available';
  }
}

// Create and inject the summarize button with improved timing and detection
function createSummarizeButton() {
  if (summaryButton) {
    console.log('Summary button already exists, skipping creation');
    return; // Already exists
  }
  
  // Multiple selectors for different YouTube layouts
  const containerSelectors = [
    '#meta-contents',
    '#primary-inner', 
    '#info-contents',
    '.ytd-watch-metadata',
    '#watch-header'
  ];
  
  let container = null;
  for (const selector of containerSelectors) {
    container = document.querySelector(selector);
    if (container) {
      console.log(`Found container with selector: ${selector}`);
      break;
    }
  }
  
  if (!container) {
    console.log('No suitable container found for button placement');
    return;
  }
  
  // Check if we already have our button container (in case of duplicate calls)
  if (document.querySelector('#yt-summary-button-container')) {
    console.log('Button container already exists');
    return;
  }
  
  console.log('Creating summarize button...');
  
  // Create button container
  const buttonContainer = document.createElement('div');
  buttonContainer.id = 'yt-summary-button-container';
  buttonContainer.style.cssText = `
    margin: 16px 0;
    padding: 16px;
    background: #0f172a;
    border-radius: 16px;
    border: 1px solid rgba(59, 130, 246, 0.2);
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    position: relative;
    overflow: hidden;
    transition: all 0.3s ease;
  `;
  
  // Add hover effect
  buttonContainer.addEventListener('mouseenter', () => {
    buttonContainer.style.transform = 'translateY(-2px)';
    buttonContainer.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
    buttonContainer.style.borderColor = 'rgba(59, 130, 246, 0.4)';
  });
  
  buttonContainer.addEventListener('mouseleave', () => {
    buttonContainer.style.transform = 'translateY(0)';
    buttonContainer.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
    buttonContainer.style.borderColor = 'rgba(59, 130, 246, 0.2)';
  });
  
  // Create summarize button
  summaryButton = document.createElement('button');
  summaryButton.id = 'yt-summarize-btn';
  summaryButton.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 8px;">
      <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
    </svg>
    Summarize Video
  `;
  summaryButton.style.cssText = `
    background: #ff0000;
    color: white;
    border: none;
    padding: 10px 16px;
    border-radius: 20px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    display: flex;
    align-items: center;
    transition: background-color 0.2s;
    margin-right: 12px;
  `;
  
  summaryButton.addEventListener('mouseenter', () => {
    summaryButton.style.backgroundColor = '#cc0000';
  });
  
  summaryButton.addEventListener('mouseleave', () => {
    summaryButton.style.backgroundColor = '#ff0000';
  });
  
  // Create "Open in GPT" button
  const gptButton = document.createElement('button');
  gptButton.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 8px;">
      <path d="M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4M12,6A6,6 0 0,1 18,12A6,6 0 0,1 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6M12,8A4,4 0 0,0 8,12A4,4 0 0,0 12,16A4,4 0 0,0 16,12A4,4 0 0,0 12,8Z" />
    </svg>
    Open in ChatGPT
  `;
  gptButton.style.cssText = `
    background: #10a37f;
    color: white;
    border: none;
    padding: 10px 16px;
    border-radius: 20px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    display: flex;
    align-items: center;
    transition: background-color 0.2s;
  `;
  
  gptButton.addEventListener('mouseenter', () => {
    gptButton.style.backgroundColor = '#0d8f6f';
  });
  
  gptButton.addEventListener('mouseleave', () => {
    gptButton.style.backgroundColor = '#10a37f';
  });
  
  // Create "Regenerate" button — clears session cache and forces a fresh summary
  const regenerateButton = document.createElement('button');
  regenerateButton.id = 'yt-regenerate-btn';
  regenerateButton.title = 'Clear cache & regenerate summary';
  regenerateButton.innerHTML = '&#x21BA;'; // ↺
  regenerateButton.style.cssText = `
    background: #555;
    color: white;
    border: none;
    padding: 10px 13px;
    border-radius: 20px;
    cursor: pointer;
    font-size: 17px;
    display: flex;
    align-items: center;
    transition: background-color 0.2s;
  `;
  regenerateButton.addEventListener('mouseenter', () => {
    regenerateButton.style.backgroundColor = '#333';
  });
  regenerateButton.addEventListener('mouseleave', () => {
    regenerateButton.style.backgroundColor = '#555';
  });
  regenerateButton.addEventListener('click', handleRegenerateSummary);

  // Add click handlers
  summaryButton.addEventListener('click', handleSummarize);
  gptButton.addEventListener('click', handleOpenInGPT);
  
  // Add buttons to container
  const buttonWrapper = document.createElement('div');
  buttonWrapper.style.display = 'flex';
  buttonWrapper.style.gap = '8px';
  buttonWrapper.appendChild(summaryButton);
  buttonWrapper.appendChild(regenerateButton);
  buttonWrapper.appendChild(gptButton);
  
  buttonContainer.appendChild(buttonWrapper);
  
  // Try different insertion strategies
  const titleSelectors = [
    'h1.ytd-watch-metadata',
    'h1.ytd-video-primary-info-renderer', 
    '#title h1',
    '.ytd-watch-metadata h1'
  ];
  
  let titleElement = null;
  for (const selector of titleSelectors) {
    titleElement = document.querySelector(selector);
    if (titleElement) {
      console.log(`Found title element with selector: ${selector}`);
      break;
    }
  }
  
  if (titleElement && titleElement.parentNode) {
    console.log('Inserting button after title element');
    titleElement.parentNode.insertBefore(buttonContainer, titleElement.nextSibling);
  } else {
    console.log('Inserting button at beginning of container');
    container.insertBefore(buttonContainer, container.firstChild);
  }
  
  console.log('✅ Summary button created and inserted successfully');
}

// Clear all cached session data for the current video and force-generate a fresh summary
async function handleRegenerateSummary() {
  const videoId = getVideoId();
  if (!videoId) return;

  try {
    // Remove the temporary session
    await libraryStore.deleteSession(videoId);

    // Also wipe chatHistory from the saved video (keep the entry, just clear history)
    const saved = await libraryStore.getVideo(videoId);
    if (saved) {
      await libraryStore.putVideo({ ...saved, chatHistory: [] });
    }

    // Clear in-memory transcript cache
    transcriptData = '';
    timestampedTranscriptData = null;

    console.log('🗑️ Cache cleared for video:', videoId);
  } catch (err) {
    console.warn('Could not clear video cache:', err);
  }

  // Now trigger a normal fresh summarise
  handleSummarize();
}

// Handle summarize button click
async function handleSummarize() {
  // Guard: if the extension was reloaded while this tab was open the chrome APIs
  // become unavailable. Detect this early and ask the user to refresh the page.
  if (!chrome?.storage?.local) {
    showLiveSummaryError('Extension was updated. Please refresh this page and try again.');
    return;
  }

  // Open the side panel NOW — before any await — while the user-gesture context is
  // still alive. chrome.sidePanel.open() silently fails if called after an await.
  chrome.runtime.sendMessage({ action: 'openSidePanel' });

  try {
    summaryButton.disabled = true;
    summaryButton.innerHTML = `
      <div style="width: 20px; height: 20px; border: 2px solid #ffffff; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 8px;"></div>
      Checking for existing summary...
    `;
    
    // Add spinner animation
    if (!document.querySelector('#spinner-style')) {
      const style = document.createElement('style');
      style.id = 'spinner-style';
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }
    
    const videoId = getVideoId();
    if (!videoId) {
      throw new Error('Could not get video ID');
    }
    
    console.log('🎬 Checking for existing summary for video:', videoId);
    
    // PRIORITY 1: Check temporary session storage first (most recent with transcript)
    const savedSession = await libraryStore.getSession(videoId);
    
    if (savedSession && savedSession.videoData && savedSession.timestamp > Date.now() - (24 * 60 * 60 * 1000)) {
      console.log('🎬 Found existing session data:', savedSession.videoData.title);
      
      summaryButton.innerHTML = `
        <div style="width: 20px; height: 20px; border: 2px solid #ffffff; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 8px;"></div>
        Loading existing summary...
      `;
      
      // Use existing session data directly
      console.log('🎬 Sending openLiveSummary message with existing session data');
      chrome.runtime.sendMessage({
        action: 'openLiveSummary',
        videoData: savedSession.videoData
      }, (response) => {
        console.log('Response from background script:', response);
        showLiveSummaryMessage('Existing summary loaded!', 'Your previous conversation about this video has been restored.');
      });
      
      return; // Exit early - don't create new summary
    }
    
    // PRIORITY 2: Check if this video is already saved with a summary in long-term storage
    const existingSavedVideo = await libraryStore.getVideo(videoId);
    
    if (existingSavedVideo && existingSavedVideo.chatHistory && existingSavedVideo.chatHistory.length > 0) {
      console.log('🎬 Found existing saved video with summary:', existingSavedVideo.title);
      
      summaryButton.innerHTML = `
        <div style="width: 20px; height: 20px; border: 2px solid #ffffff; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 8px;"></div>
        Loading saved summary...
      `;
      
      // Create video data from saved video
      const title = document.querySelector('h1.ytd-watch-metadata')?.textContent?.trim() || existingSavedVideo.title;
      const videoUrl = window.location.href;
      const thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      
      const videoData = {
        videoId,
        title,
        url: videoUrl,
        thumbnail,
        chatHistory: existingSavedVideo.chatHistory,
        // Don't include transcript here - it will be fetched fresh if needed
        isExistingVideo: true
      };
      
      console.log('🎬 Sending openLiveSummary message with saved video data');
      chrome.runtime.sendMessage({
        action: 'openLiveSummary',
        videoData: videoData
      }, (response) => {
        console.log('Response from background script:', response);
        showLiveSummaryMessage('Saved summary loaded!', 'Your previous conversation about this video has been restored.');
      });
      
      return; // Exit early - don't create new summary
    }
    
    // PRIORITY 3: No existing summary found - create new one
    console.log('🎬 No existing summary found, generating new one...');
    
    summaryButton.innerHTML = `
      <div style="width: 20px; height: 20px; border: 2px solid #ffffff; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 8px;"></div>
      Fetching transcript...
    `;
    
    // Get timestamped transcript
    const transcriptResult = await fetchTranscriptWithTimestamps(videoId);
    if (!transcriptResult.success || !transcriptResult.transcript) {
      throw new Error('No transcript available for this video');
    }
    
    // Store both versions globally
    transcriptData = transcriptResult.transcript;
    timestampedTranscriptData = transcriptResult.timestampedTranscript;
    
    summaryButton.innerHTML = `
      <div style="width: 20px; height: 20px; border: 2px solid #ffffff; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 8px;"></div>
      Preparing Live Summary...
    `;
    
    // Create proper video data with all necessary information
    const title = document.querySelector('h1.ytd-watch-metadata')?.textContent?.trim() || 'YouTube Video';
    const videoUrl = window.location.href;
    const thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    
    const videoData = {
      videoId,
      title,
      url: videoUrl,
      thumbnail,
      transcript: transcriptResult.transcript,
      timestampedTranscript: transcriptResult.timestampedTranscript,
      chatHistory: [],
      isNewVideo: true
    };
    
    // Send topic to popup for saving
    chrome.runtime.sendMessage({ action: "updateTags", data: title });
    
    // Update button to show opening popup
    summaryButton.innerHTML = `
      <div style="width: 20px; height: 20px; border: 2px solid #ffffff; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 8px;"></div>
      Opening Live Summary...
    `;
    
    // Store video data and trigger Live Summary opening
    console.log('🎬 Sending openLiveSummary message with new video data:', videoData);
    chrome.runtime.sendMessage({
      action: 'openLiveSummary',
      videoData: videoData
    }, (response) => {
      console.log('Response from background script:', response);
      showLiveSummaryMessage('New summary created!', 'A fresh summary has been generated. You can now chat about this video.');
    });
    
  } catch (error) {
    console.error('Error preparing video summary:', error);
    showLiveSummaryError(error.message);
  } finally {
    // Reset button after delay
    setTimeout(() => {
      summaryButton.disabled = false;
      summaryButton.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 8px;">
          <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
        </svg>
        Summarize Video
      `;
    }, 3000);
  }
}

// Handle "Open in GPT" button click
async function handleOpenInGPT() {
  if (!chrome?.storage?.local) {
    showLiveSummaryError('Extension was updated. Please refresh this page and try again.');
    return;
  }

  try {
    const videoId = getVideoId();
    if (!videoId) {
      throw new Error('Could not get video ID');
    }
    
    // Always fetch fresh — never reuse cached data from a previous video
    let transcript = await fetchTranscript(videoId);
    if (!transcript) throw new Error('Could not fetch transcript');

    // Truncate to ~80k chars — enough for any video, avoids storage quota errors
    const MAX_TRANSCRIPT_CHARS = 80000;
    if (transcript.length > MAX_TRANSCRIPT_CHARS) {
      transcript = transcript.slice(0, MAX_TRANSCRIPT_CHARS) + '\n[transcript truncated]';
    }
    
    const title = document.querySelector('h1.ytd-watch-metadata')?.textContent?.trim() || 'YouTube Video';
    const videoUrl = window.location.href;
    
    // Create a comprehensive prompt for ChatGPT
    const prompt = `Please analyze this YouTube video and provide a comprehensive summary:

Title: ${title}
URL: ${videoUrl}

Transcript:
${transcript}

Please provide a detailed summary covering:
1. Main topics and key points
2. Important insights and takeaways
3. Any actionable information or recommendations
4. Overall conclusion

Format your response in a clear, well-structured manner.`;
    
    // Use the proper ChatGPT integration system for auto-paste and send
    if (window.ChatGPTIntegration) {
      await window.ChatGPTIntegration.openChatGPTWithPrompt(prompt, 'YouTube', '#ff0000');
    } else {
      // Fallback to the shared integration
      await openChatGPTWithPrompt(prompt, 'YouTube', '#ff0000');
    }
    
  } catch (error) {
    console.error('Error opening in ChatGPT:', error);
    showLiveSummaryError('Error preparing ChatGPT prompt: ' + error.message);
  }
}

// Use the shared ChatGPT integration function
async function openChatGPTWithPrompt(prompt, platformName = 'YouTube', platformColor = '#ff0000') {
  try {
    // Store for auto-injection and open ChatGPT
    if (chrome?.storage?.local) {
      await chrome.storage.local.set({ 
        pendingChatGptPrompt: prompt,
        promptTimestamp: Date.now()
      });
    }
    
    // Copy to clipboard as backup
    try {
      await navigator.clipboard.writeText(prompt);
    } catch (clipboardError) {
      console.warn('Clipboard access failed, but storage method will work');
    }
    
    // Show enhanced notification
    showChatGPTAutoNotification(platformName, platformColor);
    
    // Open ChatGPT - the content script will handle auto-paste and send
    window.open('https://chatgpt.com/?model=auto&temporary-chat=true', '_blank');
    
  } catch (error) {
    console.error('Error in ChatGPT integration:', error);
    showLiveSummaryError('Error opening ChatGPT: ' + error.message);
  }
}

// Show enhanced notification for ChatGPT auto-integration
function showChatGPTAutoNotification(platformName = 'YouTube', platformColor = '#ff0000') {
  // Remove any existing notification
  const existing = document.querySelector('#chatgpt-auto-notification');
  if (existing) existing.remove();
  
  const notification = document.createElement('div');
  notification.id = 'chatgpt-auto-notification';
  notification.innerHTML = `
    <div style="display: flex; align-items: flex-start; gap: 12px;">
      <div style="width: 24px; height: 24px; background: ${platformColor}; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px;">
        <div style="width: 8px; height: 4px; border: 2px solid white; border-top: none; border-right: none; transform: rotate(-45deg); margin-top: -2px;"></div>
      </div>
      <div>
        <div style="font-weight: 600; margin-bottom: 4px;">ChatGPT Auto-Magic! 🚀</div>
        <div style="font-size: 13px; opacity: 0.9; line-height: 1.4;">
          ${platformName} transcript prepared! Opening ChatGPT...<br>
          <strong>The message will be automatically pasted and sent!</strong>
        </div>
      </div>
    </div>
  `;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, ${platformColor} 0%, ${adjustColorBrightness(platformColor, -20)} 100%);
    color: white;
    padding: 16px 20px;
    border-radius: 12px;
    z-index: 10000;
    font-size: 14px;
    max-width: 320px;
    box-shadow: 0 8px 32px ${platformColor}4D;
    animation: slideIn 0.5s ease-out;
  `;
  
  // Add animation styles if not present
  if (!document.querySelector('#chatgpt-notification-styles')) {
    const style = document.createElement('style');
    style.id = 'chatgpt-notification-styles';
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(notification);
  
  // Auto-remove notification
  setTimeout(() => {
    if (notification.parentNode) {
      notification.style.animation = 'slideIn 0.3s ease-out reverse';
      setTimeout(() => notification.remove(), 300);
    }
  }, 6000);
}

// Utility function to adjust color brightness
function adjustColorBrightness(color, percent) {
  const hex = color.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  const newR = Math.max(0, Math.min(255, r + (r * percent / 100)));
  const newG = Math.max(0, Math.min(255, g + (g * percent / 100)));
  const newB = Math.max(0, Math.min(255, b + (b * percent / 100)));
  
  return `#${Math.round(newR).toString(16).padStart(2, '0')}${Math.round(newG).toString(16).padStart(2, '0')}${Math.round(newB).toString(16).padStart(2, '0')}`;
}

// Initialize YouTube integration with improved reliability
async function initYouTubeIntegration() {
  if (!isYouTubePage()) {
    console.log('Not on YouTube page, skipping integration');
    return;
  }
  
  console.log('🎬 Initializing YouTube integration...');
  isYouTube = true;
  
  // Wait for page to load completely
  await waitForYouTubeLoad();
  
  // Additional wait to ensure DOM is stable
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Create summarize button
  createSummarizeButton();
  
  // Set up navigation observer for YouTube SPA
  setupNavigationObserver();
  
  console.log('🎬 YouTube integration initialized successfully');
}

// Set up observer for YouTube navigation changes
function setupNavigationObserver() {
  let currentUrl = location.href;
  let currentVideoId = getVideoId();
  
  // Use a more targeted observer to reduce performance impact
  const observer = new MutationObserver((mutations) => {
    // Check if URL or video ID changed
    const newUrl = location.href;
    const newVideoId = getVideoId();
    
    if (newUrl !== currentUrl || newVideoId !== currentVideoId) {
      console.log('🎬 YouTube navigation detected:', newVideoId);
      currentUrl = newUrl;
      currentVideoId = newVideoId;
      
      if (newVideoId) {
        // Use a longer delay to ensure new page is fully loaded
        setTimeout(async () => {
          console.log('🎬 Handling YouTube page change...');
          
          // Remove old button and reset state
          const oldContainer = document.querySelector('#yt-summary-button-container');
          if (oldContainer) {
            console.log('🎬 Removing old button container');
            oldContainer.remove();
          }
          
          summaryButton = null;
          transcriptData = '';
          timestampedTranscriptData = null;
          
          // Wait for new page to stabilize
          await waitForYouTubeLoad();
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Create new button
          createSummarizeButton();
          
        }, 2000); // Increased delay for better reliability
      }
    }
  });
  
  // Observe with minimal scope to reduce performance impact
  observer.observe(document.body, { 
    childList: true, 
    subtree: true,
    attributes: false,
    characterData: false
  });
  
  console.log('🎬 Navigation observer set up');
}

// Start integration with improved error handling
try {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initYouTubeIntegration);
  } else {
    // Use a small delay if DOM is already loaded to ensure all scripts are ready
    setTimeout(initYouTubeIntegration, 500);
  }
} catch (error) {
  console.error('Error initializing YouTube integration:', error);
  // Retry once after a delay
  setTimeout(() => {
    try {
      initYouTubeIntegration();
    } catch (retryError) {
      console.error('Retry failed:', retryError);
    }
  }, 2000);
}

// Extract timestamped transcript from page elements
async function extractTimestampedTranscriptFromPage() {
  try {
    console.log('Starting timestamped page transcript extraction...');
    
    // Try to activate transcript panel first
    await activateTranscriptPanel();
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Look for transcript segments with timestamps
    const segmentSelectors = [
      'ytd-transcript-segment-renderer',
      '[data-testid="transcript-segment"]',
      '.transcript-segment'
    ];
    
    for (const selector of segmentSelectors) {
      const segments = document.querySelectorAll(selector);
      if (segments.length > 0) {
        const timestampedSegments = [];
        let plainTranscript = '';
        
        segments.forEach(segment => {
          try {
            // Look for timestamp and text elements
            const timestampEl = segment.querySelector('[class*="timestamp"], .segment-timestamp, [data-testid="timestamp"]');
            const textEl = segment.querySelector('.segment-text, [class*="segment-text"], [data-testid="segment-text"]') || segment;
            
            if (textEl) {
              const text = textEl.textContent?.trim();
              let timestamp = timestampEl ? timestampEl.textContent?.trim() : null;
              
              if (text && text.length > 0) {
                // Parse timestamp if available
                let startTime = 0;
                if (timestamp && timestamp.match(/\d+:\d+/)) {
                  const parts = timestamp.split(':');
                  if (parts.length === 2) {
                    startTime = parseInt(parts[0]) * 60 + parseInt(parts[1]);
                  } else if (parts.length === 3) {
                    startTime = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
                  }
                }
                
                timestampedSegments.push({
                  text: text,
                  startTime: startTime,
                  endTime: startTime + 5, // Estimate 5 second duration
                  timestamp: timestamp || `${Math.floor(startTime / 60)}:${(startTime % 60).toString().padStart(2, '0')}`,
                  youtubeTimestamp: `${startTime}s`
                });
                
                plainTranscript += text + ' ';
              }
            }
          } catch (e) {
            console.log('Error processing segment:', e);
          }
        });
        
        if (timestampedSegments.length > 0) {
          return {
            transcript: plainTranscript.replace(/\s+/g, ' ').trim(),
            timestampedTranscript: timestampedSegments,
            success: true
          };
        }
      }
    }
    
    // Fallback to regular extraction
    const regularTranscript = await extractTranscriptFromPage();
    if (regularTranscript && regularTranscript !== 'No transcript available') {
      return {
        transcript: regularTranscript,
        timestampedTranscript: null,
        success: true,
        fallback: true
      };
    }
    
    throw new Error('No timestamped transcript found on page');
    
  } catch (error) {
    console.log('Error extracting timestamped transcript from page:', error);
    return null;
  }
}

// Improved page transcript extraction with better selectors and retry logic
async function extractTranscriptFromPage() {
  try {
    console.log('Starting page transcript extraction...');
    
    // First, try to find and activate transcript if not already visible
    await activateTranscriptPanel();
    
    // Wait for transcript to load
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    try {
      const result = await extractFromTranscriptSegments();
      if (result && result.length > 50 && !isUIText(result)) {
        console.log('Transcript extracted from segments');
        return result;
      }
    } catch (e) {
      console.log('extractFromTranscriptSegments failed:', e.message);
    }
    
    return 'No transcript available';
    
  } catch (error) {
    console.log('Error extracting transcript from page:', error);
    return 'No transcript available';
  }
}

// Try to activate the transcript panel
async function activateTranscriptPanel() {
  const transcriptSelectors = [
    'button[aria-label*="transcript" i]',
    'button[aria-label*="Show transcript" i]',
    'button[title*="transcript" i]',
    'button:has-text("Transcript")',
    '[data-testid="transcript-button"]',
    '.ytp-transcript-button',
    'button[class*="transcript"]'
  ];
  
  for (const selector of transcriptSelectors) {
    try {
      const button = document.querySelector(selector);
      if (button && !button.disabled) {
        console.log(`Found transcript button with selector: ${selector}`);
        button.click();
        await new Promise(resolve => setTimeout(resolve, 1500));
        return true;
      }
    } catch (e) {
      // Continue to next selector
    }
  }
  
  console.log('No transcript button found or already active');
  return false;
}

// Show success message for Live Summary
function showLiveSummaryMessage(title, message) {
  // Remove any existing notification
  const existing = document.querySelector('#live-summary-notification');
  if (existing) existing.remove();
  
  const notification = document.createElement('div');
  notification.id = 'live-summary-notification';
  notification.innerHTML = `
    <div style="display: flex; align-items: flex-start; gap: 12px;">
      <div style="width: 24px; height: 24px; background: #4caf50; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px;">
        <div style="width: 8px; height: 4px; border: 2px solid white; border-top: none; border-right: none; transform: rotate(-45deg); margin-top: -2px;"></div>
      </div>
      <div>
        <div style="font-weight: 600; margin-bottom: 4px;">${title}</div>
        <div style="font-size: 13px; opacity: 0.9; line-height: 1.4;">
          ${message}
        </div>
      </div>
    </div>
  `;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #4caf50;
    color: white;
    padding: 16px 20px;
    border-radius: 12px;
    z-index: 10000;
    font-size: 14px;
    max-width: 320px;
    box-shadow: 0 8px 32px rgba(76, 175, 80, 0.3);
    animation: slideIn 0.5s ease-out;
  `;
  
  // Add animation styles if not present
  if (!document.querySelector('#live-summary-notification-styles')) {
    const style = document.createElement('style');
    style.id = 'live-summary-notification-styles';
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(notification);
  
  // Auto-remove notification
  setTimeout(() => {
    if (notification.parentNode) {
      notification.style.animation = 'slideIn 0.3s ease-out reverse';
      setTimeout(() => notification.remove(), 300);
    }
  }, 4000);
}

// Show error message for Live Summary
function showLiveSummaryError(message) {
  // Remove any existing notification
  const existing = document.querySelector('#live-summary-error');
  if (existing) existing.remove();
  
  const notification = document.createElement('div');
  notification.id = 'live-summary-error';
  notification.innerHTML = `
    <div style="display: flex; align-items: flex-start; gap: 12px;">
      <div style="width: 24px; height: 24px; background: #f44336; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px;">
        <div style="color: white; font-weight: bold; font-size: 14px;">!</div>
      </div>
      <div>
        <div style="font-weight: 600; margin-bottom: 4px;">Error</div>
        <div style="font-size: 13px; opacity: 0.9; line-height: 1.4;">
          ${message}
        </div>
      </div>
    </div>
  `;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #f44336;
    color: white;
    padding: 16px 20px;
    border-radius: 12px;
    z-index: 10000;
    font-size: 14px;
    max-width: 320px;
    box-shadow: 0 8px 32px rgba(244, 67, 54, 0.3);
    animation: slideIn 0.5s ease-out;
  `;
  
  document.body.appendChild(notification);
  
  // Auto-remove notification
  setTimeout(() => {
    if (notification.parentNode) {
      notification.style.animation = 'slideIn 0.3s ease-out reverse';
      setTimeout(() => notification.remove(), 300);
    }
  }, 6000);
}