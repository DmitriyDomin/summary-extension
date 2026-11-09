// Udemy-specific content script for automatic transcript extraction and summarization
let transcriptData = '';
let summaryButton = null;
let isUdemy = false;
let cachedCourseTitle = null; // cache real course title once resolved

console.log('Udemy content script loaded on:', window.location.href);

// Helper to build a normalized videoData object (mirrors YouTube structure) for side panel
function buildUdemyVideoDataObject({ transcript, lessonTitle, courseTitle, url }) {
  const courseId = extractCourseIdFromUrl(url || window.location.href);
  const title = `${courseTitle} - ${lessonTitle}`;
  // Provide a deterministic pseudo videoId using course + lesson (no hashing to keep simple)
  const videoId = `udemy_${courseId}_${encodeURIComponent(lessonTitle).slice(0,40)}`;
  return {
    videoId,
    title,
    url: url || window.location.href,
    thumbnail: getUdemyThumbnailForCourse(),
    transcript: transcript || '',
    timestampedTranscript: null, // Udemy currently no timestamped extraction
    platform: 'udemy',
    isNewVideo: true,
    chatHistory: []
  };
}

async function makeApiRequest(prompt) {
  const apiKey = await apiService.getApiKey('openai');
  if (!apiKey) {
    throw new Error('API key not configured. Please set your OpenAI API key in the extension settings.');
  }
  return apiService.getOpenAIResponse(apiKey, 'gpt-4o-mini', prompt, 800, 0.3);
}

// Helper functions for parsing
const parseText = (text) => SummaryUtils.extractTitle(text, 'Udemy Course Summary');
const getLanguage = (text) => SummaryUtils.extractLanguage(text, 'en');

// Listen for messages from background/popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Udemy content script received message:', request);
  
  if (request.action === 'getSummary') {
    const summaryDiv = document.querySelector('#udemy-summary-display p');
    sendResponse(summaryDiv ? summaryDiv.textContent : null);
  } else if (request.action === 'getSummaryTopic') {
    const topicElement = document.querySelector('#udemy-summary-display h3');
    sendResponse({ value: topicElement ? topicElement.textContent : null });
  } else if (request.action === 'getUdemyVideoData') {
    // Get current Udemy course/lesson data for quiz manager
    (async () => {
      try {
        const courseTitle = getCourseTitle();
        const lessonTitle = getLessonTitle();
        const moduleTitle = getModuleName();
        const courseUrl = window.location.href;
        
        // FIXED: Always try to fetch transcript for quiz data, but with timeout
        console.log('🎯 Fetching transcript for Udemy quiz data...');
        let transcript = transcriptData; // Use cached if available
        
        if (!transcript) {
          try {
            // Fetch transcript with a reasonable timeout for quiz use
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Transcript fetch timeout')), 8000)
            );
            
            transcript = await Promise.race([
              fetchUdemyTranscript(),
              timeoutPromise
            ]);
            
            // Cache the transcript for future use
            if (transcript && transcript !== 'No transcript available') {
              transcriptData = transcript;
              console.log('🎯 Successfully fetched and cached Udemy transcript');
            }
          } catch (error) {
            console.log('🎯 Transcript fetch failed or timed out:', error.message);
            // Continue without transcript - quiz will handle fallback
            transcript = null;
          }
        }
        
        const courseData = {
          courseId: extractCourseIdFromUrl(courseUrl),
          title: `${courseTitle} - ${lessonTitle}`,
          courseTitle: courseTitle,
          lessonTitle: lessonTitle,
          moduleTitle: moduleTitle,
          url: courseUrl,
          thumbnail: getUdemyThumbnailForCourse(),
          transcript: transcript || null,
          platform: 'udemy'
        };
        
        console.log('🎯 Sending Udemy course data to quiz manager:', {
          ...courseData,
          transcript: courseData.transcript ? courseData.transcript.substring(0, 100) + '...' : 'none'
        });
        sendResponse({ courseData: courseData });
        
      } catch (error) {
        console.error('Error getting Udemy course data:', error);
        sendResponse({ error: error.message });
      }
    })();
    
    return true; // CRITICAL: Keep message channel open for async response
  } else if (request.action === 'fetchUdemyTranscript') {
    // Fetch transcript for quiz generation
    fetchUdemyTranscript().then(transcript => {
      console.log('🎯 Fetched Udemy transcript for quiz:', transcript ? transcript.substring(0, 100) + '...' : 'none');
      sendResponse({ transcript: transcript });
    }).catch(error => {
      console.error('Error fetching Udemy transcript for quiz:', error);
      sendResponse({ error: error.message });
    });
    return true; // Keep channel open for async response
  } else if (request.action === 'summarize' || request.action === 'summarizeWebpage') {
    handleSummarization(request, sendResponse);
    return true;
  }
  
  return false; // Don't keep channel open for synchronous responses
});

// Helper functions for quiz manager integration
function extractCourseIdFromUrl(url) {
  try {
    // Extract course ID from Udemy URL if available
    const match = url.match(/\/course\/([^\/]+)/);
    return match ? match[1] : 'unknown';
  } catch (error) {
    console.error('Error extracting course ID:', error);
    return 'unknown';
  }
}

function getUdemyThumbnailForCourse() {
  // Try to get actual course thumbnail from page
  const thumbnailSelectors = [
    '.course-landing-page__main-content img',
    '[data-purpose="course-image"] img',
    '.course-image img',
    '.clp-lead__image img',
    'meta[property="og:image"]'
  ];
  
  for (const selector of thumbnailSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      const src = element.tagName === 'META' ? element.content : element.src;
      if (src && src.startsWith('http')) {
        return src;
      }
    }
  }
  
  // Fallback to generic Udemy thumbnail
  return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQwIiBoZWlnaHQ9IjEzNSIgdmlld0JveD0iMCAwIDI0MCAxMzUiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyNDAiIGhlaWdodD0iMTM1IiBmaWxsPSIjQTQzNUYwIi8+Cjx0ZXh0IHg9IjEyMCIgeT0iNzAiIGZvcnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxOCIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5VZGVteSBDb3Vyc2U8L3RleHQ+Cjwvc3ZnPg==';
}

// Improved Udemy transcript fetching with retry logic and better error handling
async function fetchUdemyTranscript(retryCount = 0) {
  const maxRetries = 3;
  console.log(`Fetching Udemy transcript, attempt ${retryCount + 1}/${maxRetries + 1}`);
  
  try {
    // Method 1: Try to find and activate transcript panel
    await activateUdemyTranscriptPanel();
    
    // Wait for transcript to potentially load
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Method 2: Extract from transcript panel with multiple approaches
    const transcriptMethods = [
      extractFromUdemyTranscriptPanel,
      extractFromUdemyCaptions,
      extractFromUdemyVideoDescription,
      extractFromUdemyNotes
    ];
    
    for (const method of transcriptMethods) {
      try {
        const result = await method();
        if (result && result !== 'No transcript available' && result.length > 50) {
          console.log(`Udemy transcript extracted via ${method.name}`);
          return result;
        }
      } catch (e) {
        console.log(`Udemy method ${method.name} failed:`, e.message);
      }
    }
    
    // Method 3: If all methods failed and we haven't exceeded retries, try again
    if (retryCount < maxRetries) {
      console.log(`All Udemy methods failed, retrying in ${(retryCount + 1) * 2} seconds...`);
      await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 2000));
      return await fetchUdemyTranscript(retryCount + 1);
    }
    
    // Final fallback: get whatever content we can
    return await getUdemyContentFallback();
    
  } catch (error) {
    console.log('Error in fetchUdemyTranscript:', error);
    
    if (retryCount < maxRetries) {
      console.log(`Retrying Udemy transcript due to error in ${(retryCount + 1) * 2} seconds...`);
      await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 2000));
      return await fetchUdemyTranscript(retryCount + 1);
    }
    
    return await getUdemyContentFallback();
  }
}

// Try to activate the transcript panel
async function activateUdemyTranscriptPanel() {
  const transcriptSelectors = [
    '[data-purpose="transcript-toggle"]',
    '.transcript-toggle',
    'button[aria-label*="transcript" i]',
    'button[aria-label*="captions" i]',
    'button[title*="transcript" i]',
    'button[title*="captions" i]',
    '[data-testid="transcript-button"]',
    '.transcript-button',
    'button:has-text("Transcript")',
    'button:has-text("Captions")',
    '[class*="transcript"]',
    '[class*="caption"]'
  ];
  
  for (const selector of transcriptSelectors) {
    try {
      const button = document.querySelector(selector);
      if (button && !button.classList.contains('active') && !button.disabled) {
        console.log(`Found Udemy transcript button with selector: ${selector}`);
        button.click();
        await new Promise(resolve => setTimeout(resolve, 1500));
        return true;
      }
    } catch (e) {
      // Continue to next selector
    }
  }
  
  console.log('No Udemy transcript button found or already active');
  return false;
}

// Extract from transcript panel with improved selectors
async function extractFromUdemyTranscriptPanel() {
  const panelSelectors = [
    '[data-purpose="transcript-content"]',
    '.transcript-content',
    '.transcript-text',
    '[data-purpose="transcript"] p',
    '.transcript-container p',
    '.transcript-panel p',
    '[data-purpose="transcript-cue"]',
    '.transcript-item',
    '.transcript-segment',
    '[role="region"][aria-label*="transcript" i]',
    '.captions-display p',
    '.subtitle-display p'
  ];
  
  for (const selector of panelSelectors) {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      const text = Array.from(elements)
        .map(el => el.textContent?.trim())
        .filter(text => text && text.length > 0)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      if (text.length > 50) {
        return text;
      }
    }
  }
  
  throw new Error('No Udemy transcript panel found');
}

// Extract from video captions with monitoring
async function extractFromUdemyCaptions() {
  const captionSelectors = [
    '.vjs-text-track-display p',
    '.vjs-text-track-display div',
    '.caption-window p',
    '.subtitle-display p',
    '[data-purpose="captions-display"] p',
    '.video-js .vjs-text-track-display',
    '[class*="caption"] [class*="text"]',
    '.udemy-caption',
    '.video-caption'
  ];
  
  // Monitor captions for a longer period for Udemy
  const captionTexts = new Set();
  let monitoringTime = 0;
  const maxMonitoringTime = 8000; // 8 seconds for Udemy
  
  const monitor = setInterval(() => {
    for (const selector of captionSelectors) {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        const text = el.textContent?.trim();
        if (text && text.length > 0 && !text.includes('Loading...')) {
          captionTexts.add(text);
        }
      });
    }
    
    monitoringTime += 500;
    if (monitoringTime >= maxMonitoringTime) {
      clearInterval(monitor);
    }
  }, 500);
  
  // Wait for monitoring to complete
  await new Promise(resolve => setTimeout(resolve, maxMonitoringTime));
  
  if (captionTexts.size > 0) {
    const result = Array.from(captionTexts).join(' ').replace(/\s+/g, ' ').trim();
    if (result.length > 50) {
      return result;
    }
  }
  
  throw new Error('No Udemy captions found');
}

// Extract from video description with multiple selectors
async function extractFromUdemyVideoDescription() {
  const descriptionSelectors = [
    '[data-purpose="lecture-description"]',
    '.lecture-description',
    '.lecture-content',
    '.curriculum-item-description',
    '[data-purpose="lecture-content"] p',
    '.course-content-description',
    '.lecture-overview',
    '[data-purpose="curriculum-item-description"]',
    '.curriculum-section-description'
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
  
  throw new Error('No Udemy description found');
}

// Extract from lecture notes or attachments
async function extractFromUdemyNotes() {
  const notesSelectors = [
    '[data-purpose="lecture-notes"]',
    '.lecture-notes',
    '.lecture-attachments',
    '.supplementary-content',
    '.lecture-resources p',
    '[data-purpose="supplementary-content"]'
  ];
  
  for (const selector of notesSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      const text = element.textContent?.trim();
      if (text && text.length > 100) {
        return text.replace(/\s+/g, ' ').trim();
      }
    }
  }
  
  throw new Error('No Udemy notes found');
}

// Final fallback for Udemy content
async function getUdemyContentFallback() {
  try {
    const lessonTitle = getLessonTitle();
    const courseTitle = getCourseTitle();
    
    // Try to get any visible text content from the lesson
    const contentSelectors = [
      '.curriculum-item-content',
      '.lecture-content',
      '.course-content',
      '.video-description',
      '.lesson-content'
    ];
    
    let description = '';
    for (const selector of contentSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const text = element.textContent?.trim();
        if (text && text.length > 50) {
          description = text;
          break;
        }
      }
    }
    
    if (description.length > 50) {
      return `Course: ${courseTitle}\nLesson: ${lessonTitle}\n\nDescription: ${description}`.trim();
    }
    
    // If no description, at least return the titles
    return `Course: ${courseTitle}\nLesson: ${lessonTitle}\n\nNo transcript or detailed content available. This lecture may not have captions or descriptions enabled.`;
    
  } catch (error) {
    return 'No transcript available';
  }
}

// Create and inject the summarize buttons
function createUdemySummarizeButton() {
  if (summaryButton) {
    console.log('Udemy buttons already exist');
    return;
  }
  
  console.log('Creating Udemy summarize buttons...');
  
  // Find a good place to inject buttons - updated selectors for current Udemy
  const possibleContainers = [
    '[data-purpose="curriculum-item-view"]',
    '.curriculum-item-view',
    '[data-purpose="video-viewer"]',
    '.video-viewer--wrapper',
    '.lecture-view',
    '.video-viewer',
    '.course-taking-page',
    'main[role="main"]',
    '.main-content'
  ];
  
  let container = null;
  for (const selector of possibleContainers) {
    container = document.querySelector(selector);
    if (container) {
      console.log('Found container with selector:', selector);
      break;
    }
  }
  
  if (!container) {
    console.log('No suitable container found, using body');
    container = document.body;
  }
  
  // Create button container with drag functionality
  const buttonContainer = document.createElement('div');
  buttonContainer.id = 'udemy-summary-button-container';
  buttonContainer.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 10000;
    padding: 12px;
    background: #f7f9fa;
    border-radius: 8px;
    border-left: 4px solid #a435f0;
    box-shadow: 0 2px 8px rgba(164, 53, 240, 0.2);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    cursor: move;
    user-select: none;
    max-width: 180px;
    min-height: 26px;
  `;
  
  // Add drag functionality
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };
  
  buttonContainer.addEventListener('mousedown', (e) => {
    // Only start drag on the header area, not on buttons
    if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
    
    isDragging = true;
    const rect = buttonContainer.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
    buttonContainer.style.cursor = 'grabbing';
    e.preventDefault();
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    
    const x = e.clientX - dragOffset.x;
    const y = e.clientY - dragOffset.y;
    
    // Keep within viewport bounds
    const maxX = window.innerWidth - buttonContainer.offsetWidth;
    const maxY = window.innerHeight - buttonContainer.offsetHeight;
    
    buttonContainer.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
    buttonContainer.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
    buttonContainer.style.right = 'auto'; // Remove right positioning when dragging
  });
  
  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      buttonContainer.style.cursor = 'move';
    }
  });
  
  // Add minimize/expand functionality
  let isMinimized = false;
  
  const toggleButton = document.createElement('button');
  toggleButton.innerHTML = '−';
  toggleButton.style.cssText = `
    position: absolute;
    top: 4px;
    right: 4px;
    background: none;
    border: none;
    font-size: 20px;
    cursor: pointer;
    color: #6a6f73;
    width: 20px;
    height: 20px;
    line-height: 1;
    border-radius: 3px;
  `;
  
  toggleButton.addEventListener('click', (e) => {
    e.stopPropagation();
    isMinimized = !isMinimized;
    
    const buttons = buttonContainer.querySelectorAll('button:not(:last-child)');
    const headerText = buttonContainer.querySelector('div:first-child');
    
    if (isMinimized) {
      buttons.forEach(btn => btn.style.display = 'none');
      headerText.style.display = 'none';
      toggleButton.innerHTML = '+';
      buttonContainer.style.padding = '8px 24px 8px 8px';
      buttonContainer.style.minWidth = '60px';
    } else {
      buttons.forEach(btn => btn.style.display = 'flex');
      headerText.style.display = 'block';
      toggleButton.innerHTML = '−';
      buttonContainer.style.padding = '12px';
      buttonContainer.style.minWidth = 'auto';
    }
  });
  
  // Add hover effects for the container
  buttonContainer.addEventListener('mouseenter', () => {
    if (!isDragging) {
      buttonContainer.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    }
  });
  
  buttonContainer.addEventListener('mouseleave', () => {
    if (!isDragging) {
      buttonContainer.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
    }
  });
  
  // Create button elements (summarize, open in GPT, add to Notion)
  // Create summarize button
  summaryButton = document.createElement('button');
  summaryButton.id = 'udemy-summarize-btn';
  summaryButton.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 6px;">
      <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
    </svg>
    Summarize Lecture
  `;
  summaryButton.style.cssText = `
    background: #a435f0;
    color: white;
    border: none;
    padding: 8px 12px;
    border-radius: 16px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    display: flex;
    align-items: center;
    transition: all 0.2s;
    margin-bottom: 8px;
    width: 100%;
    box-shadow: 0 2px 4px rgba(164, 53, 240, 0.3);
  `;
  
  summaryButton.addEventListener('mouseenter', () => {
    summaryButton.style.backgroundColor = '#8710d8';
    summaryButton.style.transform = 'translateY(-1px)';
  });
  
  summaryButton.addEventListener('mouseleave', () => {
    summaryButton.style.backgroundColor = '#a435f0';
    summaryButton.style.transform = 'translateY(0)';
  });
  
  // Create "Open in GPT" button
  const gptButton = document.createElement('button');
  gptButton.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 6px;">
      <path d="M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4M12,6A6,6 0 0,1 18,12A6,6 0 0,1 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6M12,8A4,4 0 0,0 8,12A4,4 0 0,0 12,16A4,4 0 0,0 16,12A4,4 0 0,0 12,8Z" />
    </svg>
    Open in ChatGPT
  `;
  gptButton.style.cssText = `
    background: #10a37f;
    color: white;
    border: none;
    padding: 8px 12px;
    border-radius: 16px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    display: flex;
    align-items: center;
    transition: all 0.2s;
    margin-bottom: 8px;
    width: 100%;
    box-shadow: 0 2px 4px rgba(16, 163, 127, 0.3);
  `;
  
  gptButton.addEventListener('mouseenter', () => {
    gptButton.style.backgroundColor = '#0d8f6f';
    gptButton.style.transform = 'translateY(-1px)';
  });
  
  gptButton.addEventListener('mouseleave', () => {
    gptButton.style.backgroundColor = '#10a37f';
    gptButton.style.transform = 'translateY(0)';
  });

  // Create "Add to Notion" button
  const notionButton = document.createElement('button');
  notionButton.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 6px;">
      <path d="M4,6H2V20A2,2 0 0,0 4,22H18V20H4V6M20,2H8A2,2 0 0,0 6,4V16A2,2 0 0,0 8,18H20A2,2 0 0,0 22,16V4A2,2 0 0,0 20,2M20,16H8V4H20V16Z" />
    </svg>
    Add to Notion
  `;
  notionButton.style.cssText = `
    background: #000000;
    color: white;
    border: none;
    padding: 8px 12px;
    border-radius: 16px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    display: flex;
    align-items: center;
    transition: all 0.2s;
    width: 100%;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  `;
  
  notionButton.addEventListener('mouseenter', () => {
    notionButton.style.backgroundColor = '#333333';
    notionButton.style.transform = 'translateY(-1px)';
  });
  
  notionButton.addEventListener('mouseleave', () => {
    notionButton.style.backgroundColor = '#000000';
    notionButton.style.transform = 'translateY(0)';
  });
  
  // Add click handlers
  summaryButton.addEventListener('click', handleUdemySummarize);
  gptButton.addEventListener('click', handleUdemyOpenInGPT);
  notionButton.addEventListener('click', handleUdemyAddToNotion);
  
  // Add buttons to container
  const headerText = document.createElement('div');
  headerText.textContent = 'AI Summary';
  headerText.style.cssText = `
    font-size: 11px;
    font-weight: 600;
    color: #1c1d1f;
    margin-bottom: 8px;
    text-align: center;
  `;
  
  buttonContainer.appendChild(headerText);
  buttonContainer.appendChild(summaryButton);
  buttonContainer.appendChild(gptButton);
  buttonContainer.appendChild(notionButton);
  buttonContainer.appendChild(toggleButton);
  
  // Insert the floating button container
  document.body.appendChild(buttonContainer);
  
  console.log('Udemy summarize buttons created and inserted');
}

// Handle summarize button click
async function handleUdemySummarize() {
  try {
    summaryButton.disabled = true;
    summaryButton.innerHTML = `
      <div style="width: 20px; height: 20px; border: 2px solid #ffffff; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 8px;"></div>
      Loading...
    `;
    
    // Add spinner animation
    if (!document.querySelector('#udemy-spinner-style')) {
      const style = document.createElement('style');
      style.id = 'udemy-spinner-style';
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }
    
    // Get transcript
    const transcript = await fetchUdemyTranscript();
    if (!transcript || transcript === 'No transcript available') {
      throw new Error('No transcript available for this lecture');
    }
    
    transcriptData = transcript;
    
    // Get lecture and course titles
    const lessonTitle = getLessonTitle();
    const courseTitle = getCourseTitle();
    
    // Send for summarization
    const prompt = SummaryUtils.buildLecturePrompt({ courseTitle, lessonTitle, transcript });
    
    const summary = await makeApiRequest(prompt);
    let [updatedSummary, originalLang] = getLanguage(summary);
    let [finalSummary, topic] = parseText(updatedSummary);
    
    // Send topic to popup
    chrome.runtime.sendMessage({ action: "updateTags", data: topic });
    
    // Display summary
    displayUdemySummary(finalSummary, topic);

    // NEW: Open side panel (live summary) similar to YouTube implementation
    try {
      const videoData = buildUdemyVideoDataObject({
        transcript: transcriptData,
        lessonTitle,
        courseTitle,
        url: window.location.href
      });
      chrome.runtime.sendMessage({ action: 'openLiveSummary', videoData });
    } catch (e) {
      console.log('Udemy side panel open failed (non-fatal):', e.message);
    }
    
  } catch (error) {
    console.error('Error summarizing:', error);
    displayUdemyError(error.message);
  } finally {
    // Reset button
    summaryButton.disabled = false;
    summaryButton.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 8px;">
        <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
      </svg>
      Summarize Lecture
    `;
  }
}

// Handle "Open in GPT" button click
async function handleUdemyOpenInGPT() {
  try {
    // Show loading state - fix selector
    const gptButton = document.querySelector('#udemy-summary-button-container button:nth-child(3)');
    const originalHTML = gptButton ? gptButton.innerHTML : '';
    
    if (gptButton) {
      gptButton.disabled = true;
      gptButton.innerHTML = `
        <div style="width: 16px; height: 16px; border: 2px solid #ffffff; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 6px;"></div>
        Preparing...
      `;
    }
    
    // Get transcript if not already fetched
    if (!transcriptData) {
      transcriptData = await fetchUdemyTranscript();
    }
    
    if (!transcriptData || transcriptData === 'No transcript available') {
      alert('No transcript available for this lecture');
      if (gptButton) {
        gptButton.disabled = false;
        gptButton.innerHTML = originalHTML;
      }
      return;
    }
    
    // Get lecture details
    const lessonTitle = getLessonTitle();
    const courseTitle = getCourseTitle();
    const lectureUrl = window.location.href;
    
    // Create comprehensive prompt for ChatGPT
    const prompt = `Please provide a detailed summary of this Udemy lecture:

🎓 **Course:** ${courseTitle}
📚 **Lecture:** ${lessonTitle}
🔗 **URL:** ${lectureUrl}

📝 **Transcript:**
${transcriptData}

**Please provide:**
1. A comprehensive summary (2-3 paragraphs)
2. Key learning objectives and takeaways
3. Important concepts, techniques, or methods covered
4. Any practical examples or applications mentioned
5. Main conclusions or next steps

Format your response in a clear, educational manner suitable for study notes.`;
    
    // Use shared ChatGPT integration with Udemy branding
    await ChatGPTIntegration.openChatGPTWithPrompt(prompt, 'Udemy lecture', '#a435f0');
    
  } catch (error) {
    console.error('Error opening in GPT:', error);
    alert('Error: ' + error.message);
  } finally {
    // Reset button - fix selector and HTML
    const gptButton = document.querySelector('#udemy-summary-button-container button:nth-child(3)');
    if (gptButton) {
      gptButton.disabled = false;
      gptButton.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 6px;">
          <path d="M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4M12,6A6,6 0 0,1 18,12A6,6 0 0,1 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6M12,8A4,4 0 0,0 8,12A4,4 0 0,0 12,16A4,4 0 0,0 16,12A4,4 0 0,0 12,8Z" />
      `;
    }
  }
}

// Handle "Add to Notion" button click
async function handleUdemyAddToNotion() {
  try {
    // Show loading state - fix selector
    const notionButton = document.querySelector('#udemy-summary-button-container button:nth-child(4)');
    const originalHTML = notionButton ? notionButton.innerHTML : '';
    
    if (notionButton) {
      notionButton.disabled = true;
      notionButton.innerHTML = `
        <div style="width: 16px; height: 16px; border: 2px solid #ffffff; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 6px;"></div>
        Adding...
      `;
    }
    
    // Get transcript if not already fetched
    if (!transcriptData) {
      transcriptData = await fetchUdemyTranscript();
    }
    
    if (!transcriptData || transcriptData === 'No transcript available') {
      N8NIntegration.showErrorMessage('No transcript available for this lecture');
      if (notionButton) {
        notionButton.disabled = false;
        notionButton.innerHTML = originalHTML;
      }
      return;
    }
    
    // Get lecture details
    const lessonTitle = getLessonTitle();
    const courseTitle = getCourseTitle();
    const moduleName = getModuleName();
    const courseDuration = getCourseDuration();
    const lectureUrl = window.location.href;
    
    // Prepare data for N8N with proper structure including module
    const summaryData = {
      title: `${courseTitle} - ${lessonTitle}`,
      content: transcriptData,
      url: lectureUrl,
      source: 'udemy',
      course: courseTitle,
      module: moduleName,
      lesson: lessonTitle,
      duration: courseDuration,
      transcript: transcriptData,
      tags: [courseTitle, moduleName, 'udemy', 'lecture']
    };
    
    // Send to N8N
    await N8NIntegration.sendSummaryToNotion(summaryData);
    
    // Show success message
    N8NIntegration.showSuccessMessage('Lecture content added to Notion successfully!');
    
  } catch (error) {
    console.error('Error adding to Notion:', error);
    N8NIntegration.showErrorMessage(error.message);
  } finally {
    // Reset button - fix selector and HTML
    const notionButton = document.querySelector('#udemy-summary-button-container button:nth-child(4)');
    if (notionButton) {
      notionButton.disabled = false;
      notionButton.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 6px;">
          <path d="M4,6H2V20A2,2 0 0,0 4,22H18V20H4V6M20,2H8A2,2 0 0,0 6,4V16A2,2 0 0,0 8,18H20A2,2 0 0,0 22,16V4A2,2 0 0,0 20,2M20,16H8V4H20V16Z" />
        </svg>
        Add to Notion
      `;
    }
  }
}

// Display summary specifically for Udemy
function displayUdemySummary(summary, topic) {
  // Remove existing summary
  const existing = document.querySelector('#udemy-summary-display');
  if (existing) existing.remove();
  
  const summaryContainer = document.createElement('div');
  summaryContainer.id = 'udemy-summary-display';
  summaryContainer.style.cssText = `
    margin: 16px 0;
    padding: 16px;
    background: #f7f9fa;
    border-radius: 8px;
    border-left: 4px solid #a435f0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  `;
  
  summaryContainer.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <h3 style="margin: 0; color: #1c1d1f; font-size: 16px; font-weight: 600;">${topic}</h3>
      <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #6a6f73; hover: color: #1c1d1f;">×</button>
    </div>
    <p style="margin: 0; color: #1c1d1f; line-height: 1.5; font-size: 14px;">${summary}</p>
    <div style="margin-top: 12px;">
      <button class="copy-summary-btn" data-summary="${summary.replace(/'/g, "\\'")}">
        <i class="fas fa-copy"></i> Copy Summary
      </button>
    </div>
  `;
  
  // Insert in appropriate location
  const insertionTarget = document.querySelector('#udemy-summary-button-container') ||
                         document.querySelector('[data-purpose="lecture-title"]') ||
                         document.querySelector('.lecture-title');
  
  if (insertionTarget) {
    insertionTarget.parentNode.insertBefore(summaryContainer, insertionTarget.nextSibling);
  }
}

// Display error for Udemy
function displayUdemyError(message) {
  // ...existing code... (similar to YouTube error display but with Udemy styling)
}

// Handle summarization for Udemy
async function handleSummarization(request, sendResponse) {
  try {
    const lessonTitle = getLessonTitle();
    const courseTitle = getCourseTitle();
    
    const transcript = await fetchUdemyTranscript();
    if (!transcript || transcript === 'No transcript available') {
      throw new Error('No transcript available for this lecture');
    }
    
    const prompt = SummaryUtils.buildLecturePrompt({ courseTitle, lessonTitle, transcript, withMetadataRequest: true });
    
    const summary = await makeApiRequest(prompt);
    let [updatedSummary, originalLang] = getLanguage(summary);
    let [finalSummary, topic] = parseText(updatedSummary);
    
    // Send topic to popup
    chrome.runtime.sendMessage({ action: "updateTags", data: topic });
    
    // Display summary on Udemy page
    displayUdemySummary(finalSummary, topic);
    
    sendResponse({ success: true, summary: finalSummary });
    
  } catch (error) {
    console.error('Udemy summarization error:', error);
    displayUdemyError(error.message);
    sendResponse({ error: error.message });
  }
}

// Check if we're on Udemy
function isUdemyPage() {
  const isUdemy = window.location.hostname.includes('udemy.com');
  console.log('Is Udemy page:', isUdemy, window.location.hostname);
  return isUdemy;
}

// Check if we're on a lecture page
function isLecturePage() {
  const isLecture = window.location.pathname.includes('/learn/lecture/') || 
         document.querySelector('[data-purpose="video-viewer"]') !== null ||
         document.querySelector('.video-viewer--wrapper') !== null ||
         document.querySelector('[data-purpose="curriculum-item-view"]') !== null;
  console.log('Is lecture page:', isLecture, window.location.pathname);
  return isLecture;
}

// Wait for Udemy lecture page to load
function waitForUdemyLoad() {
  return new Promise((resolve) => {
    console.log('Waiting for Udemy to load...');
    
    const checkForElements = () => {
      const videoViewer = document.querySelector('[data-purpose="video-viewer"]') || 
                         document.querySelector('.video-viewer--wrapper') ||
                         document.querySelector('.curriculum-item-view') ||
                         document.querySelector('[data-purpose="curriculum-item-view"]');
      
      console.log('Found video viewer:', !!videoViewer);
      return videoViewer;
    };
    
    if (checkForElements()) {
      console.log('Udemy elements found immediately');
      resolve();
    } else {
      let attempts = 0;
      const maxAttempts = 20;
      
      const observer = new MutationObserver((mutations, obs) => {
        attempts++;
        console.log(`Udemy load attempt ${attempts}/${maxAttempts}`);
        
        if (checkForElements() || attempts >= maxAttempts) {
          obs.disconnect();
          console.log('Udemy loading complete, found elements:', !!checkForElements());
          resolve();
        }
      });
      
      observer.observe(document.body, { 
        childList: true, 
        subtree: true,
        attributes: true 
      });
      
      // Fallback timeout
      setTimeout(() => {
        observer.disconnect();
        console.log('Udemy load timeout reached');
        resolve();
      }, 10000);
    }
  });
}

// Get lesson title
function getLessonTitle() {
  // Try to get the current lesson title from the active curriculum item
  const currentLessonSelectors = [
    // Look for the current/active lesson specifically
    '.curriculum-item-link--is-current span[data-purpose="item-title"]',
    '.curriculum-item-link--is-current .curriculum-item-link--title',
    '[class*="curriculum-item-link--is-current"] [data-purpose="item-title"]',
    '[class*="curriculum-item-link--is-current"] span',
    '[class*="is-current"] [data-purpose="item-title"]',
    
    // Fallback to general curriculum item selectors
    '[data-purpose="curriculum-item-title"] .curriculum-item-title',
    '[data-purpose="lecture-title"]',
    '.lecture-title',
    '.curriculum-item-title-text',
    '[data-purpose="item-title"]',
    '.udlite-text-sm.udlite-text-gray-900',
    '.section-content--lecture-view--title-text',
    'h1[data-purpose="lecture-title"]',
    '.curriculum-item-view--title--title'
  ];
  
  for (const selector of currentLessonSelectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent.trim()) {
      console.log(`Found lesson title with selector: ${selector}`);
      return element.textContent.trim();
    }
  }
  
  // Fallback to generic title
  const fallbackTitle = document.querySelector('h1')?.textContent?.trim() || 'Udemy Lecture';
  console.log('Using fallback lesson title:', fallbackTitle);
  return fallbackTitle;
}

// Get module/section name
function getModuleName() {
  // First, try to find the current lesson and then traverse up to find its module
  const currentLessonElement = document.querySelector('.curriculum-item-link--is-current, [class*="curriculum-item-link--is-current"], [class*="is-current"]');
  
  if (currentLessonElement) {
    console.log('Found current lesson element, looking for parent module');
    
    // Traverse up the DOM to find the accordion panel or section container
    let parent = currentLessonElement.parentElement;
    let attempts = 0;
    const maxAttempts = 10;
    
    while (parent && attempts < maxAttempts) {
      attempts++;
      
      // Look for accordion panel module
      if (parent.classList.contains('accordion-panel-module--outer-panel-toggler') || 
          parent.querySelector('[class*="accordion-panel-module--outer-panel-toggler"]')) {
        
        const moduleSelectors = [
          // Look within this accordion panel for the module title
          '[class*="accordion-panel-module--outer-panel-toggler"] button span',
          '[class*="accordion-panel-module--outer-panel-toggler"] [data-purpose="section-title"]',
          '[class*="accordion-panel-module--outer-panel-toggler"] .udlite-heading-md',
          '[class*="accordion-panel-module--outer-panel-toggler"] .section--section-title--title-text',
          // Look in parent for section title
          '.section--section-title--title-text',
          '[data-purpose="curriculum-section-title"]',
          '[data-purpose="section-title"]'
        ];
        
        for (const selector of moduleSelectors) {
          const moduleElement = parent.querySelector(selector);
          if (moduleElement && moduleElement.textContent.trim()) {
            console.log(`Found module name with selector: ${selector}`);
            return moduleElement.textContent.trim();
          }
        }
      }
      
      // Look for other section containers
      if (parent.classList.contains('curriculum-section') || 
          parent.classList.contains('section') ||
          parent.querySelector('[data-purpose="curriculum-section-title"]')) {
        
        const sectionSelectors = [
          '[data-purpose="curriculum-section-title"]',
          '.section--section-title--title-text',
          '.curriculum-section-title',
          '.section-title',
          '[data-purpose="section-title"]',
          '.udlite-heading-md'
        ];
        
        for (const selector of sectionSelectors) {
          const sectionElement = parent.querySelector(selector);
          if (sectionElement && sectionElement.textContent.trim()) {
            console.log(`Found section name with selector: ${selector} in parent`);
            return sectionElement.textContent.trim();
          }
        }
      }
      
      parent = parent.parentElement;
    }
  }
  
  // Fallback to general module selectors
  const generalModuleSelectors = [
    // Accordion panel modules
    '[class*="accordion-panel-module--outer-panel-toggler"] button span',
    '[class*="accordion-panel-module--outer-panel-toggler"] [data-purpose="section-title"]',
    '.accordion-panel-module--outer-panel-toggler .udlite-heading-md',
    
    // Standard section selectors
    '[data-purpose="curriculum-section-title"].section--section-title--title-text',
    '.section--section-title--title-text',
    '.curriculum-section-title',
    '.section-title',
    '[data-purpose="section-title"]',
    '.curriculum-section--title',
    '.section-content--section-title',
    '.udlite-heading-md'
  ];
  
  for (const selector of generalModuleSelectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent.trim()) {
      console.log(`Found module name with general selector: ${selector}`);
      return element.textContent.trim();
    }
  }
  
  // Try to find the active/current section in curriculum sidebar
  const activeSectionSelectors = [
    '.curriculum-item-link--is-current .curriculum-item-link--title',
    '.curriculum-section--expanded .section--section-title--title-text',
    '.active-lecture-section .section-title',
    '[class*="is-current"] .section-title'
  ];
  
  for (const selector of activeSectionSelectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent.trim()) {
      console.log(`Found active section with selector: ${selector}`);
      return element.textContent.trim();
    }
  }
  
  console.log('Using fallback module name');
  return 'Course Module';
}

// Get course title
function getCourseTitle() {
  // Return cached if still same course slug
  const slug = extractCourseIdFromUrl(window.location.href); // reuse existing extractor (slug)
  if (cachedCourseTitle && cachedCourseTitle.slug === slug) {
    return cachedCourseTitle.title;
  }

  // First try to get the actual course name from the header above the video
  const headerSelectors = [
    '.header--header-text--zBvgT',
    '[class*="header--header-text"]',
    '.header-text',
  '.course-header-text',
  // NEW explicit Udemy course title class provided in requirements
  '.ud-text-xl.course-lead--course-title--neX4I'
  ];
  
  for (const selector of headerSelectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent.trim()) {
      const text = element.textContent.trim();
      if (!looksLikeLessonTitle(text)) {
        console.log(`Found course title with header selector: ${selector}`);
        cacheCourseTitle(slug, text);
        return text;
      }
    }
  }
  
  // Fallback to other course title selectors
  const courseTitleSelectors = [
    '[data-purpose="course-title"]',
    '.course-title',
    '[data-purpose="breadcrumb"] a:last-child',
    '.breadcrumb-item:last-child a',
    '.course-header-title',
    '.clp-lead__title h1',
    'h1.clp-lead__title',
  '.course-landing-page__main-content h1',
  '.ud-text-xl.course-lead--course-title--neX4I'
  ];
  
  for (const selector of courseTitleSelectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent.trim()) {
      const text = element.textContent.trim();
      if (!looksLikeLessonTitle(text)) {
        console.log(`Found course title with fallback selector: ${selector}`);
        cacheCourseTitle(slug, text);
        return text;
      }
    }
  }
  
  // Try to get from breadcrumb navigation
  const breadcrumbLinks = document.querySelectorAll('[data-purpose="breadcrumb"] a, .breadcrumb a');
  if (breadcrumbLinks.length > 0) {
    const lastBreadcrumb = breadcrumbLinks[breadcrumbLinks.length - 1];
    if (lastBreadcrumb && lastBreadcrumb.textContent.trim()) {
      console.log('Found course title from breadcrumb');
      const text = lastBreadcrumb.textContent.trim();
      if (!looksLikeLessonTitle(text)) {
        cacheCourseTitle(slug, text);
        return text;
      }
    }
  }

  // FINAL ATTEMPT: If we accidentally captured lesson title earlier, try dedicated class again
  try {
    const lessonTitle = getLessonTitle();
    const explicit = document.querySelector('.ud-text-xl.course-lead--course-title--neX4I');
    if (explicit && explicit.textContent.trim() && explicit.textContent.trim() !== lessonTitle) {
      console.log('Using explicit Udemy course title class after fallback');
      const text = explicit.textContent.trim();
      cacheCourseTitle(slug, text);
      return text;
    }
  } catch (e) { /* ignore */ }

  // EXTRA FALLBACKS: scan anchors linking to /course/<slug>
  const anchorCandidates = Array.from(document.querySelectorAll('a[href*="/course/"]'))
    .filter(a => a.href.includes('/course/') && !a.href.includes('/learn/') && a.textContent.trim().length > 5)
    .map(a => a.textContent.trim())
    .filter(t => !looksLikeLessonTitle(t));
  if (anchorCandidates.length > 0) {
    // choose longest meaningful text
    anchorCandidates.sort((a,b)=>b.length - a.length);
    const text = anchorCandidates[0];
    cacheCourseTitle(slug, text);
    console.log('Derived course title from anchor candidate');
    return text;
  }

  // FINAL: build from slug
  if (slug && slug !== 'unknown') {
    const text = slug
      .replace(/[-_]+/g, ' ')
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    cacheCourseTitle(slug, text);
    console.log('Constructed course title from slug');
    return text;
  }
  
  console.log('Using fallback course title');
  return 'Udemy Course';
}

// Helper: determine if string likely equals current lesson title
function looksLikeLessonTitle(text) {
  const lesson = getLessonTitle();
  if (!text || !lesson) return false;
  const t = text.trim();
  const l = lesson.trim();
  if (t === l) return true; // exact
  // if lesson fully contained and shorter, treat as lesson
  if (l.length >= 8 && t.toLowerCase().includes(l.toLowerCase()) && t.split(' ').length <= l.split(' ').length + 2) return true;
  return false;
}

function cacheCourseTitle(slug, title) {
  cachedCourseTitle = { slug, title };
}

// Get course duration/length
function getCourseDuration() {
  const durationSelectors = [
    '[data-purpose="course-content-length"]',
    '.course-content-length',
    '.total-time',
    '.course-duration',
    '.course-landing-page__course-content-length',
    '.clp-component-render--course-content-length',
    '.course-info-item[data-purpose="course-content-length"]',
    '[data-testid="course-content-length"]'
  ];
  
  for (const selector of durationSelectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent.trim()) {
      const durationText = element.textContent.trim();
      // Extract duration patterns like "12.5 hours", "3h 45m", etc.
      const durationMatch = durationText.match(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|h)|(\d+)\s*(minutes?|mins?|m)/i);
      if (durationMatch) {
        return durationText;
      }
    }
  }
  
  // Try to find course info items that contain "total" text
  const courseInfoItems = document.querySelectorAll('[data-purpose="course-info"] .course-info-item, .course-info-item');
  for (const item of courseInfoItems) {
    const text = item.textContent.trim().toLowerCase();
    if (text.includes('total') || text.includes('hour') || text.includes('duration')) {
      const durationMatch = text.match(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|h)|(\d+)\s*(minutes?|mins?|m)/i);
      if (durationMatch) {
        return item.textContent.trim();
      }
    }
  }
  
  // Try to calculate from curriculum items
  const lectureItems = document.querySelectorAll('[data-purpose="curriculum-item-duration"], .curriculum-item-duration');
  if (lectureItems.length > 0) {
    let totalMinutes = 0;
    lectureItems.forEach(item => {
      const duration = item.textContent.trim();
      const minuteMatch = duration.match(/(\d+):(\d+)/); // Format like "12:34"
      if (minuteMatch) {
        totalMinutes += parseInt(minuteMatch[1]) * 60 + parseInt(minuteMatch[2]);
      }
    });
    
    if (totalMinutes > 0) {
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return `${hours}h ${minutes}m total`;
    }
  }
  
  return 'Duration not available';
}

// Initialize Udemy integration
async function initUdemyIntegration() {
  console.log('Initializing Udemy integration...');
  
  if (!isUdemyPage()) {
    console.log('Not a Udemy page, skipping');
    return;
  }
  
  isUdemy = true;
  console.log('Udemy page confirmed');
  
  // Wait for lecture page to load
  if (isLecturePage()) {
    console.log('Lecture page detected, waiting for load...');
    await waitForUdemyLoad();
    console.log('Creating buttons...');
    createUdemySummarizeButton();
  } else {
    console.log('Not a lecture page, monitoring for navigation...');
  }
  
  // Listen for navigation changes (Udemy is SPA)
  let currentUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== currentUrl) {
      currentUrl = location.href;
      console.log('Udemy navigation detected to:', currentUrl);
      // Reset course title cache if course slug changed
      try {
        const newSlug = extractCourseIdFromUrl(currentUrl);
        if (cachedCourseTitle && cachedCourseTitle.slug !== newSlug) {
          cachedCourseTitle = null;
          console.log('Course slug changed, reset cached course title');
        }
      } catch(e) { /* ignore */ }
      
      if (isLecturePage()) {
        console.log('Navigated to lecture page, creating buttons...');
        setTimeout(() => {
          // Remove old button
          const oldContainer = document.querySelector('#udemy-summary-button-container');
          if (oldContainer) {
            console.log('Removing old buttons');
            oldContainer.remove();
          }
          summaryButton = null;
          transcriptData = '';
          
          // Create new button
          createUdemySummarizeButton();
        }, 2000); // Increased timeout for Udemy's slower loading
      } else {
        // Remove buttons if not on lecture page
        const oldContainer = document.querySelector('#udemy-summary-button-container');
        if (oldContainer) {
          console.log('Not on lecture page, removing buttons');
          oldContainer.remove();
          summaryButton = null;
        }
      }
    }
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
  console.log('Udemy navigation observer started');
}

// Start integration
console.log('Udemy content script starting...');
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initUdemyIntegration);
} else {
  initUdemyIntegration();
}