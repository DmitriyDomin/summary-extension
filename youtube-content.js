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
  const apiKey = await getApiKey();
  
  if (!apiKey) {
    throw new Error('API key not configured. Please set your OpenAI API key in the extension settings.');
  }
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.3
    })
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Invalid API key. Please check your OpenAI API key.');
    } else if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    } else {
      throw new Error(`API request failed: ${response.statusText}`);
    }
  }
  
  const data = await response.json();
  return data.choices[0].message.content.trim();
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
  } else if (request.action === 'getVideoData') {
    // Return current video data for Live Summary
    const videoId = getVideoId();
    if (videoId) {
      const title = document.querySelector('h1.ytd-watch-metadata')?.textContent || 'YouTube Video';
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
  } else if (request.action === 'summarize' || request.action === 'summarizeWebpage') {
    // Handle summarization requests
    handleSummarization(request, sendResponse);
    return true; // Keep channel open for async response
  }
  
  return true;
});

async function handleSummarization(request, sendResponse) {
  try {
    const videoId = getVideoId();
    if (!videoId) {
      throw new Error('Could not get video ID');
    }
    
    const transcript = await fetchTranscript(videoId);
    if (!transcript || transcript === 'No transcript available') {
      throw new Error('No transcript available for this video');
    }
    
    const title = document.querySelector('h1.ytd-watch-metadata')?.textContent || 'YouTube Video';
    const prompt = `Video Title: ${title}\n\nTranscript: ${transcript}\n\nSummarize this YouTube video transcript in a clear and concise manner. Include a title in parentheses () and language in brackets [].`;
    
    const summary = await makeApiRequest(prompt);
    let [updatedSummary, originalLang] = getLanguage(summary);
    let [finalSummary, topic] = parseText(updatedSummary);
    
    // Send topic to popup
    chrome.runtime.sendMessage({ action: "updateTags", data: topic });
    
    // Display summary on YouTube page
    displayYouTubeSummary(finalSummary, topic);
    
    sendResponse({ success: true, summary: finalSummary });
    
  } catch (error) {
    console.error('YouTube summarization error:', error);
    displayYouTubeError(error.message);
    sendResponse({ error: error.message });
  }
}

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

// Improved transcript fetching with retry logic and better error handling
async function fetchTranscript(videoId, retryCount = 0) {
  const maxRetries = 3;
  console.log(`Fetching transcript for video ${videoId}, attempt ${retryCount + 1}/${maxRetries + 1}`);
  
  try {
    // Method 1: Try YouTube's internal timedtext API with multiple language attempts
    const languages = ['en', 'en-US', 'en-GB', 'auto'];
    
    for (const lang of languages) {
      try {
        console.log(`Trying timedtext API with language: ${lang}`);
        const response = await fetch(`https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}&fmt=json3`);
        
        if (response.ok) {
          const data = await response.json();
          if (data.events && data.events.length > 0) {
            const transcript = data.events
              .filter(event => event.segs)
              .map(event => event.segs.map(seg => seg.utf8).join(''))
              .join(' ')
              .replace(/\n/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();
            
            if (transcript.length > 50 && !isUIText(transcript)) {
              console.log(`Successfully fetched transcript via API (${lang}):`, transcript.substring(0, 100) + '...');
              return transcript;
            }
          }
        }
      } catch (e) {
        console.log(`Timedtext API failed for ${lang}:`, e.message);
      }
    }
    
    // Method 2: Try to extract from page with improved reliability and filtering
    console.log('API methods failed, trying page extraction...');
    const pageTranscript = await extractTranscriptFromPage();
    if (pageTranscript && pageTranscript !== 'No transcript available' && pageTranscript.length > 50 && !isUIText(pageTranscript)) {
      console.log('Successfully extracted transcript from page');
      return pageTranscript;
    }
    
    // Method 3: If all else fails and we haven't exceeded retries, wait and try again
    if (retryCount < maxRetries) {
      console.log(`All methods failed, retrying in ${(retryCount + 1) * 2} seconds...`);
      await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 2000));
      return await fetchTranscript(videoId, retryCount + 1);
    }
    
    // Final fallback: try to get video description or any available text
    console.log('All transcript methods failed, trying description fallback...');
    return await getVideoDescriptionFallback();
    
  } catch (error) {
    console.log('Error in fetchTranscript:', error);
    
    if (retryCount < maxRetries) {
      console.log(`Retrying due to error in ${(retryCount + 1) * 2} seconds...`);
      await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 2000));
      return await fetchTranscript(videoId, retryCount + 1);
    }
    
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
async function fetchTranscriptWithTimestamps(videoId, retryCount = 0) {
  const maxRetries = 3;
  console.log(`Fetching timestamped transcript for video ${videoId}, attempt ${retryCount + 1}/${maxRetries + 1}`);
  
  try {
    // Method 1: Try YouTube's internal timedtext API with timestamps
    const languages = ['en', 'en-US', 'en-GB', 'auto'];
    
    for (const lang of languages) {
      try {
        console.log(`Trying timedtext API with language: ${lang} for timestamps`);
        const response = await fetch(`https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}&fmt=json3`);
        
        if (response.ok) {
          const data = await response.json();
          if (data.events && data.events.length > 0) {
            // Build both plain transcript and timestamped version
            const timestampedSegments = [];
            let plainTranscript = '';
            
            data.events
              .filter(event => event.segs && event.tStartMs !== undefined)
              .forEach(event => {
                const startTime = Math.floor(event.tStartMs / 1000);
                const duration = event.dDurationMs ? Math.floor(event.dDurationMs / 1000) : 5;
                const text = event.segs.map(seg => seg.utf8).join('').trim();
                
                if (text && text.length > 0) {
                  const minutes = Math.floor(startTime / 60);
                  const seconds = startTime % 60;
                  const timestamp = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                  
                  timestampedSegments.push({
                    text: text,
                    startTime: startTime,
                    endTime: startTime + duration,
                    timestamp: timestamp,
                    youtubeTimestamp: `${startTime}s`
                  });
                  
                  plainTranscript += text + ' ';
                }
              });
            
            if (timestampedSegments.length > 0) {
              console.log(`Successfully fetched timestamped transcript via API (${lang}):`, timestampedSegments.length, 'segments');
              
              // Store both versions
              transcriptData = plainTranscript.replace(/\s+/g, ' ').trim();
              timestampedTranscriptData = timestampedSegments;
              
              return {
                transcript: transcriptData,
                timestampedTranscript: timestampedSegments,
                success: true
              };
            }
          }
        }
      } catch (e) {
        console.log(`Timestamped timedtext API failed for ${lang}:`, e.message);
      }
    }
    
    // Method 2: Try to extract from page with timestamps
    console.log('API methods failed, trying page extraction with timestamps...');
    const pageResult = await extractTimestampedTranscriptFromPage();
    if (pageResult && pageResult.transcript && pageResult.transcript.length > 50) {
      console.log('Successfully extracted timestamped transcript from page');
      transcriptData = pageResult.transcript;
      timestampedTranscriptData = pageResult.timestampedTranscript;
      return pageResult;
    }
    
    // Method 3: Fallback to regular transcript
    console.log('Timestamped extraction failed, falling back to regular transcript...');
    const regularTranscript = await fetchTranscript(videoId);
    if (regularTranscript && regularTranscript !== 'No transcript available') {
      transcriptData = regularTranscript;
      return {
        transcript: regularTranscript,
        timestampedTranscript: null,
        success: true,
        fallback: true
      };
    }
    
    // If all else fails and we haven't exceeded retries, wait and try again
    if (retryCount < maxRetries) {
      console.log(`All timestamped methods failed, retrying in ${(retryCount + 1) * 2} seconds...`);
      await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 2000));
      return await fetchTranscriptWithTimestamps(videoId, retryCount + 1);
    }
    
    return {
      transcript: null,
      timestampedTranscript: null,
      success: false,
      error: 'No transcript available'
    };
    
  } catch (error) {
    console.log('Error in fetchTranscriptWithTimestamps:', error);
    
    if (retryCount < maxRetries) {
      console.log(`Retrying due to error in ${(retryCount + 1) * 2} seconds...`);
      await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 2000));
      return await fetchTranscriptWithTimestamps(videoId, retryCount + 1);
    }
    
    return {
      transcript: null,
      timestampedTranscript: null,
      success: false,
      error: error.message
    };
  }
}

// Extract from transcript segments (most reliable method)
async function extractFromTranscriptSegments() {
  // More specific selectors for actual transcript content
  const segmentSelectors = [
    'ytd-transcript-segment-renderer .segment-text',
    'ytd-transcript-segment-renderer [class*="cue"]',
    '.ytd-transcript-segment-list-renderer .segment-text',
    '.transcript-segment .segment-text',
    '[data-testid="transcript-segment"] .segment-text'
  ];
  
  for (const selector of segmentSelectors) {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      console.log(`Found ${elements.length} transcript segments with selector: ${selector}`);
      
      const transcriptParts = Array.from(elements)
        .map(el => {
          const text = el.textContent?.trim();
          // Filter out obvious UI elements
          if (!text || text.length < 3) return null;
          if (text.toLowerCase().includes('subscribe') || 
              text.toLowerCase().includes('tap to') ||
              text.toLowerCase().includes('play (k)') ||
              text.toLowerCase().includes('pull up')) return null;
          return text;
        })
        .filter(text => text !== null);
      
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

// Extract from transcript panel with better filtering
async function extractFromTranscriptPanel() {
  const panelSelectors = [
    'ytd-transcript-renderer',
    '.ytd-transcript-renderer',
    '[data-testid="transcript-content"]',
    '.transcript-content',
    '#transcript-content'
  ];
  
  for (const selector of panelSelectors) {
    const panel = document.querySelector(selector);
    if (panel) {
      console.log(`Found transcript panel with selector: ${selector}`);
      
      // Try to get only the transcript text, not UI elements
      const transcriptElements = panel.querySelectorAll('.segment-text, [class*="cue"], [class*="transcript-text"]');
      
      if (transcriptElements.length > 0) {
        const transcriptParts = Array.from(transcriptElements)
          .map(el => el.textContent?.trim())
          .filter(text => text && text.length > 3 && !isUIText(text));
        
        if (transcriptParts.length > 0) {
          const transcript = transcriptParts.join(' ').replace(/\s+/g, ' ').trim();
          if (transcript.length > 100) {
            return transcript;
          }
        }
      }
      
      // Fallback: get all text but filter more aggressively
      const allText = panel.textContent?.trim();
      if (allText && allText.length > 100) {
        // Remove common UI text patterns
        const cleanedText = allText
          .replace(/tap to unmute/gi, '')
          .replace(/pull up for precise seeking/gi, '')
          .replace(/play \(k\)/gi, '')
          .replace(/subscribe/gi, '')
          .replace(/subscribed/gi, '')
          .replace(/scroll for details/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
        
        if (cleanedText.length > 100 && !isUIText(cleanedText)) {
          return cleanedText;
        }
      }
    }
  }
  
  throw new Error('No transcript panel found');
}

// Extract from video description as last resort
async function extractFromVideoDescription() {
  const descriptionSelectors = [
    '#meta-contents #description-text',
    '.ytd-video-secondary-info-renderer #description',
    '[data-testid="description"]',
    '#description',
    '.description'
  ];
  
  for (const selector of descriptionSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      const text = element.textContent?.trim();
      if (text && text.length > 100) {
        return text.replace(/\s+/g, ' ').trim();
      }
    }
  }
  
  throw new Error('No description found');
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
    margin: 12px 0;
    padding: 8px;
    background: #f9f9f9;
    border-radius: 8px;
    border-left: 4px solid #ff0000;
  `;
  
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
  
  // Add click handlers
  summaryButton.addEventListener('click', handleSummarize);
  gptButton.addEventListener('click', handleOpenInGPT);
  
  // Add buttons to container
  const buttonWrapper = document.createElement('div');
  buttonWrapper.style.display = 'flex';
  buttonWrapper.style.gap = '8px';
  buttonWrapper.appendChild(summaryButton);
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

// Handle summarize button click
async function handleSummarize() {
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
    const sessionKey = `liveChatSession_${videoId}`;
    const sessionResult = await chrome.storage.local.get([sessionKey]);
    const savedSession = sessionResult[sessionKey];
    
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
    const savedVideosResult = await chrome.storage.local.get(['savedVideos']);
    const savedVideos = savedVideosResult.savedVideos || [];
    const existingSavedVideo = savedVideos.find(v => v.videoId === videoId);
    
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
      Generating summary...
    `;
    
    // Generate an initial summary
    const title = document.querySelector('h1.ytd-watch-metadata')?.textContent?.trim() || 'YouTube Video';
    const prompt = `Video Title: ${title}\n\nTranscript: ${transcriptResult.transcript}\n\nProvide a comprehensive summary of this YouTube video. Focus on the main topics, key points, and important insights. Make it detailed enough to understand the video's content without watching it.`;
    
    let videoData;
    
    try {
      const summary = await makeApiRequest(prompt);
      
      // Parse the summary
      let [cleanSummary, originalLang] = getLanguage(summary);
      let [finalSummary, topic] = parseText(cleanSummary);
      
      // Create initial chat history with the summary
      const initialChatHistory = [{
        type: 'summary',
        message: 'Generate a summary of this video',
        response: finalSummary,
        timestamp: new Date().toISOString()
      }];
      
      const videoUrl = window.location.href;
      const thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      
      videoData = {
        videoId,
        title,
        url: videoUrl,
        thumbnail,
        transcript: transcriptResult.transcript,
        timestampedTranscript: transcriptResult.timestampedTranscript,
        chatHistory: initialChatHistory,
        isNewVideo: true
      };
      
      // Send topic to popup for saving
      chrome.runtime.sendMessage({ action: "updateTags", data: topic || title });
      
    } catch (apiError) {
      console.error('Error generating summary:', apiError);
      // Still proceed with Live Summary even if initial summary fails
      const videoUrl = window.location.href;
      const thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      
      videoData = {
        videoId,
        title,
        url: videoUrl,
        thumbnail,
        transcript: transcriptResult.transcript,
        timestampedTranscript: transcriptResult.timestampedTranscript,
        chatHistory: [],
        isNewVideo: true
      };
    }
    
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
  try {
    const videoId = getVideoId();
    if (!videoId) {
      throw new Error('Could not get video ID');
    }
    
    let transcript = transcriptData;
    if (!transcript) {
      transcript = await fetchTranscript(videoId);
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
    await chrome.storage.local.set({ 
      pendingChatGptPrompt: prompt,
      promptTimestamp: Date.now()
    });
    
    // Copy to clipboard as backup
    try {
      await navigator.clipboard.writeText(prompt);
    } catch (clipboardError) {
      console.warn('Clipboard access failed, but storage method will work');
    }
    
    // Show enhanced notification
    showChatGPTAutoNotification(platformName, platformColor);
    
    // Open ChatGPT - the content script will handle auto-paste and send
    window.open('https://chat.openai.com/', '_blank');
    
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
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Try multiple extraction methods with better filtering
    const methods = [
      extractFromTranscriptSegments,
      extractFromTranscriptPanel,
      extractFromVideoDescription
    ];
    
    for (const method of methods) {
      try {
        const result = await method();
        if (result && result.length > 50 && !isUIText(result)) {
          console.log(`Transcript extracted via ${method.name}`);
          return result;
        }
      } catch (e) {
        console.log(`Method ${method.name} failed:`, e.message);
      }
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
      if (button && !button.classList.contains('active') && !button.disabled) {
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