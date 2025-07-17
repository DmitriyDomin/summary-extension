// Quiz Manager - Handles quiz generation and functionality
class QuizManager {
  constructor() {
    this.currentQuiz = null;
    this.currentQuestionIndex = 0;
    this.userAnswers = [];
    this.quizSource = 'video'; // 'video' or 'text'
    this.isQuizActive = false;
    this.currentVideoData = null;
  }

  initialize() {
    this.setupEventListeners();
    this.checkCurrentVideo();
  }

  setupEventListeners() {
    // Source toggle buttons
    const useVideoBtn = document.getElementById('useVideoBtn');
    const useTextBtn = document.getElementById('useTextBtn');
    
    if (useVideoBtn) {
      useVideoBtn.addEventListener('click', () => this.switchToVideoSource());
    }
    
    if (useTextBtn) {
      useTextBtn.addEventListener('click', () => this.switchToTextSource());
    }

    // Generate quiz button
    const generateQuizBtn = document.getElementById('generateQuizBtn');
    if (generateQuizBtn) {
      generateQuizBtn.addEventListener('click', () => this.generateQuiz());
    }

    // Quiz action buttons
    const checkAnswersBtn = document.getElementById('checkAnswersBtn');
    const regenerateQuizBtn = document.getElementById('regenerateQuizBtn');
    const retakeQuizBtn = document.getElementById('retakeQuizBtn');
    const newQuizBtn = document.getElementById('newQuizBtn');
    const seeResultsBtn = document.getElementById('seeResultsBtn');

    if (checkAnswersBtn) {
      checkAnswersBtn.addEventListener('click', () => this.checkAnswers());
    }
    
    if (regenerateQuizBtn) {
      regenerateQuizBtn.addEventListener('click', () => this.regenerateQuiz());
    }
    
    if (retakeQuizBtn) {
      retakeQuizBtn.addEventListener('click', () => this.retakeQuiz());
    }
    
    if (newQuizBtn) {
      newQuizBtn.addEventListener('click', () => this.startNewQuiz());
    }
    
    if (seeResultsBtn) {
      seeResultsBtn.addEventListener('click', () => this.showDetailedResults());
    }

    // Custom text input
    const quizCustomText = document.getElementById('quizCustomText');
    if (quizCustomText) {
      quizCustomText.addEventListener('input', () => this.validateInput());
    }
  }

  async checkCurrentVideo() {
    // Check if we're on a YouTube page and get current video data
    try {
      // FIXED: In side panel context, we need to find YouTube tabs across all windows
      const windows = await chrome.windows.getAll({ populate: true });
      let activeTab = null;
      
      // Look for active YouTube tabs across all windows
      for (const window of windows) {
        const activeTabInWindow = window.tabs.find(tab => tab.active);
        if (activeTabInWindow && activeTabInWindow.url && activeTabInWindow.url.includes('youtube.com/watch')) {
          activeTab = activeTabInWindow;
          console.log('🎯 Found active YouTube tab:', activeTab.title);
          break;
        }
      }
      
      if (activeTab) {
        console.log('🎯 Detected YouTube page, getting video data...');
        
        // FIXED: First, try to get video data from the live summary manager if available
        if (window.liveChatManager && window.liveChatManager.youtubeLiveSummary && window.liveChatManager.youtubeLiveSummary.currentVideoData) {
          console.log('🎯 Found video data from live chat manager');
          this.currentVideoData = window.liveChatManager.youtubeLiveSummary.currentVideoData;
          this.updateVideoDisplay();
          return;
        }
        
        // FIXED: Second, check background script for video data
        try {
          const backgroundResponse = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: 'getVideoData' }, (response) => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve(response);
              }
            });
          });
          
          if (backgroundResponse && backgroundResponse.videoData) {
            console.log('🎯 Found video data from background script');
            this.currentVideoData = backgroundResponse.videoData;
            this.updateVideoDisplay();
            return;
          }
        } catch (error) {
          console.log('🎯 No video data in background script:', error.message);
        }
        
        // FIXED: Third, use improved background communication for current video info
        try {
          const currentVideoResponse = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ 
              action: 'getCurrentVideoInfo',
              tabId: activeTab.id  // Pass the specific tab ID
            }, (response) => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve(response);
              }
            });
          });
          
          if (currentVideoResponse && currentVideoResponse.videoData) {
            console.log('🎯 Got video data via background communication:', currentVideoResponse.videoData.title);
            this.currentVideoData = currentVideoResponse.videoData;
            this.updateVideoDisplay();
            return;
          }
        } catch (error) {
          console.log('🎯 Could not get video data via background communication:', error.message);
        }
        
        // If we reach here, try to extract video ID from URL and fetch data manually
        const videoIdMatch = activeTab.url.match(/[?&]v=([^&]+)/);
        if (videoIdMatch) {
          const videoId = videoIdMatch[1];
          console.log('🎯 Extracted video ID from URL:', videoId);
          
          try {
            // FIXED: Use background script to fetch transcript for better communication
            const transcriptResponse = await new Promise((resolve, reject) => {
              chrome.runtime.sendMessage({ 
                action: 'fetchTranscriptForSidePanel', 
                videoId: videoId,
                tabId: activeTab.id  // Pass the specific tab ID
              }, (response) => {
                if (chrome.runtime.lastError) {
                  reject(chrome.runtime.lastError);
                } else {
                  resolve(response);
                }
              });
            });
            
            if (transcriptResponse && transcriptResponse.transcript) {
              console.log('🎯 Successfully fetched transcript via background communication');
              
              // Get basic video info from the page
              const videoTitle = await this.getVideoTitleFromPage(activeTab.id);
              const videoThumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
              
              this.currentVideoData = {
                videoId: videoId,
                title: videoTitle || 'YouTube Video',
                url: activeTab.url,
                thumbnail: videoThumbnail,
                transcript: transcriptResponse.transcript,
                timestampedTranscript: transcriptResponse.timestampedTranscript || []
              };
              
              this.updateVideoDisplay();
              return;
            }
          } catch (error) {
            console.log('🎯 Could not fetch transcript via background communication:', error.message);
          }
        }
      }
      
      // If we reach here, no video data was found
      console.log('🎯 No YouTube video data available');
      this.currentVideoData = null;
      this.updateVideoDisplay();
      
    } catch (error) {
      console.error('🎯 Error checking current video:', error);
      this.currentVideoData = null;
      this.updateVideoDisplay();
    }
  }

  async getVideoTitleFromPage(tabId) {
    try {
      const response = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);
        
        chrome.tabs.sendMessage(tabId, { action: 'getVideoTitle' }, (response) => {
          clearTimeout(timeout);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
      
      return response && response.title ? response.title : null;
    } catch (error) {
      console.log('Could not get video title from page:', error.message);
      return null;
    }
  }

  updateVideoDisplay() {
    const quizVideoInfo = document.getElementById('quizVideoInfo');
    const quizVideoThumbnail = document.getElementById('quizVideoThumbnail');
    const quizVideoTitle = document.getElementById('quizVideoTitle');
    
    if (this.currentVideoData && quizVideoInfo && quizVideoThumbnail && quizVideoTitle) {
      quizVideoThumbnail.src = this.currentVideoData.thumbnail || '';
      quizVideoTitle.textContent = this.currentVideoData.title || 'Current YouTube Video';
      quizVideoInfo.style.display = 'block';
      console.log('🎯 Video display updated with data:', this.currentVideoData.title);
    } else {
      if (quizVideoTitle) {
        quizVideoTitle.textContent = 'No video available';
      }
      if (quizVideoInfo) {
        quizVideoInfo.style.display = 'none';
      }
      console.log('🎯 No video data available for display');
    }
    
    // Always validate input after updating display
    this.validateInput();
  }

  switchToVideoSource() {
    this.quizSource = 'video';
    const useVideoBtn = document.getElementById('useVideoBtn');
    const useTextBtn = document.getElementById('useTextBtn');
    const quizVideoInfo = document.getElementById('quizVideoInfo');
    const quizTextInput = document.getElementById('quizTextInput');
    
    if (useVideoBtn) useVideoBtn.classList.add('active');
    if (useTextBtn) useTextBtn.classList.remove('active');
    if (quizVideoInfo) quizVideoInfo.style.display = this.currentVideoData ? 'block' : 'none';
    if (quizTextInput) quizTextInput.style.display = 'none';
    
    this.validateInput();
  }

  switchToTextSource() {
    this.quizSource = 'text';
    const useVideoBtn = document.getElementById('useVideoBtn');
    const useTextBtn = document.getElementById('useTextBtn');
    const quizVideoInfo = document.getElementById('quizVideoInfo');
    const quizTextInput = document.getElementById('quizTextInput');
    
    if (useVideoBtn) useVideoBtn.classList.remove('active');
    if (useTextBtn) useTextBtn.classList.add('active');
    if (quizVideoInfo) quizVideoInfo.style.display = 'none';
    if (quizTextInput) quizTextInput.style.display = 'block';
    
    this.validateInput();
  }

  validateInput() {
    const generateQuizBtn = document.getElementById('generateQuizBtn');
    const quizCustomText = document.getElementById('quizCustomText');
    
    let isValid = false;
    
    if (this.quizSource === 'video') {
      // For video source, we just need to confirm we have a video available
      // The transcript will be fetched when generating the quiz
      isValid = this.currentVideoData && this.currentVideoData.videoId;
    } else {
      isValid = quizCustomText && quizCustomText.value.trim().length > 100;
    }
    
    if (generateQuizBtn) {
      generateQuizBtn.disabled = !isValid;
      console.log('🎯 Quiz validation:', {
        source: this.quizSource,
        hasVideoData: !!this.currentVideoData,
        videoId: this.currentVideoData?.videoId,
        textLength: quizCustomText?.value?.trim()?.length || 0,
        isValid
      });
    }
  }

  async generateQuiz() {
    const generateQuizBtn = document.getElementById('generateQuizBtn');
    const questionCount = document.getElementById('questionCount');
    
    if (generateQuizBtn) {
      generateQuizBtn.disabled = true;
      generateQuizBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
    }

    try {
      let sourceText = '';
      let sourceId = '';
      
      if (this.quizSource === 'video' && this.currentVideoData) {
        sourceId = this.currentVideoData.videoId || 'unknown';
        
        // Check if we already have transcript
        if (this.currentVideoData.transcript && this.currentVideoData.transcript.length > 100) {
          sourceText = this.currentVideoData.transcript;
          console.log('🎯 Using existing transcript from video data');
        } else {
          // Need to fetch transcript
          console.log('🎯 Fetching transcript for quiz generation...');
          
          if (generateQuizBtn) {
            generateQuizBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Fetching transcript...';
          }
          
          try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            const activeTab = tabs[0];
            
            const transcriptResponse = await new Promise((resolve, reject) => {
              const timeout = setTimeout(() => reject(new Error('Timeout fetching transcript')), 15000);
              
              chrome.tabs.sendMessage(activeTab.id, { 
                action: 'fetchTranscript', 
                videoId: this.currentVideoData.videoId 
              }, (response) => {
                clearTimeout(timeout);
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message));
                } else {
                  resolve(response);
                }
              });
            });
            
            if (transcriptResponse && transcriptResponse.transcript) {
              sourceText = transcriptResponse.transcript;
              // Update the current video data with the transcript
              this.currentVideoData.transcript = transcriptResponse.transcript;
              if (transcriptResponse.timestampedTranscript) {
                this.currentVideoData.timestampedTranscript = transcriptResponse.timestampedTranscript;
              }
              console.log('🎯 Successfully fetched transcript for quiz generation');
            } else {
              throw new Error('No transcript available for this video');
            }
          } catch (transcriptError) {
            console.error('🎯 Error fetching transcript:', transcriptError);
            throw new Error('Could not fetch video transcript: ' + transcriptError.message);
          }
        }
      } else {
        const quizCustomText = document.getElementById('quizCustomText');
        sourceText = quizCustomText ? quizCustomText.value.trim() : '';
        sourceId = 'custom_' + Date.now();
      }
      
      if (!sourceText || sourceText.length < 100) {
        throw new Error('No content available to generate quiz. Content must be at least 100 characters.');
      }
      
      if (generateQuizBtn) {
        generateQuizBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating questions...';
      }
      
      const numQuestions = questionCount ? parseInt(questionCount.value) : 7;
      
      // Generate quiz using AI
      const quiz = await this.generateQuizQuestions(sourceText, numQuestions);
      
      // Store quiz temporarily
      this.currentQuiz = {
        id: sourceId,
        questions: quiz.questions,
        source: this.quizSource,
        sourceText: sourceText.substring(0, 200) + '...',
        generatedAt: new Date().toISOString()
      };
      
      // Reset quiz state
      this.currentQuestionIndex = 0;
      this.userAnswers = [];
      this.isQuizActive = true;
      
      // Display quiz
      this.displayQuiz();
      
    } catch (error) {
      console.error('Error generating quiz:', error);
      this.showError('Failed to generate quiz: ' + error.message);
    } finally {
      if (generateQuizBtn) {
        generateQuizBtn.disabled = false;
        generateQuizBtn.innerHTML = '<i class="fas fa-magic"></i> Generate Quiz';
      }
    }
  }

  async generateQuizQuestions(sourceText, numQuestions) {
    const prompt = `Based on the following content, generate exactly ${numQuestions} multiple choice questions. Each question should test understanding of important topics, concepts, or facts from the content.

Content:
${sourceText}

Please generate questions in the following JSON format:
{
  "questions": [
    {
      "question": "Question text here?",
      "answers": [
        {"answer": "Correct answer", "isCorrect": true},
        {"answer": "Wrong answer 1", "isCorrect": false},
        {"answer": "Wrong answer 2", "isCorrect": false}
      ]
    }
  ]
}

Rules:
1. Each question must have exactly 3 answer choices
2. Only one answer should be marked as correct (isCorrect: true)
3. Questions should cover different important topics from the content
4. Answers should be plausible but clearly distinguishable
5. Focus on key concepts, facts, and main ideas
6. Return valid JSON only, no additional text`;

    try {
      // Get API response using the same service as other components
      const response = await apiService.getGeminiResponse(
        '', // API key will be retrieved internally
        'gemini-2.0-flash-001',
        'You are a quiz generator that creates multiple choice questions based on provided content. Always respond with valid JSON in the exact format requested.',
        prompt,
        0.7
      );
      
      // Parse JSON response
      let parsedResponse;
      try {
        // Try to extract JSON from response if it's wrapped in text
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        const jsonText = jsonMatch ? jsonMatch[0] : response;
        parsedResponse = JSON.parse(jsonText);
      } catch (parseError) {
        console.error('Failed to parse JSON response:', response);
        throw new Error('Invalid response format from AI');
      }
      
      // Validate response structure
      if (!parsedResponse.questions || !Array.isArray(parsedResponse.questions)) {
        throw new Error('Invalid quiz format received');
      }
      
      // Validate each question
      parsedResponse.questions.forEach((q, index) => {
        if (!q.question || !q.answers || !Array.isArray(q.answers) || q.answers.length !== 3) {
          throw new Error(`Invalid question format at index ${index}`);
        }
        
        const correctAnswers = q.answers.filter(a => a.isCorrect);
        if (correctAnswers.length !== 1) {
          throw new Error(`Question ${index + 1} must have exactly one correct answer`);
        }
      });
      
      return parsedResponse;
      
    } catch (error) {
      console.error('Error generating quiz questions:', error);
      throw error;
    }
  }

  displayQuiz() {
    const quizInputSection = document.getElementById('quizInputSection');
    const quizDisplaySection = document.getElementById('quizDisplaySection');
    const quizResultsSection = document.getElementById('quizResultsSection');
    
    // Hide input and results, show quiz
    if (quizInputSection) quizInputSection.style.display = 'none';
    if (quizDisplaySection) quizDisplaySection.style.display = 'block';
    if (quizResultsSection) quizResultsSection.style.display = 'none';
    
    this.renderQuizQuestions();
    this.updateProgress();
  }

  renderQuizQuestions() {
    const quizContainer = document.getElementById('quizContainer');
    if (!quizContainer || !this.currentQuiz) return;
    
    const questions = this.currentQuiz.questions;
    quizContainer.innerHTML = '';
    
    questions.forEach((questionData, questionIndex) => {
      const questionDiv = document.createElement('div');
      questionDiv.className = 'quiz-question';
      
      // Shuffle answers to randomize their order
      const shuffledAnswers = [...questionData.answers].sort(() => Math.random() - 0.5);
      
      questionDiv.innerHTML = `
        <div class="question-header">
          <span class="question-number">Question ${questionIndex + 1}</span>
        </div>
        <div class="question-text">${questionData.question}</div>
        <div class="answer-options">
          ${shuffledAnswers.map((answer, answerIndex) => `
            <label class="answer-option">
              <input type="radio" name="question_${questionIndex}" value="${answerIndex}" data-correct="${answer.isCorrect}">
              <span class="answer-text">${answer.answer}</span>
              <span class="answer-indicator"></span>
            </label>
          `).join('')}
        </div>
      `;
      
      quizContainer.appendChild(questionDiv);
    });
    
    // Add event listeners for answer selection
    this.setupAnswerListeners();
    
    // Show check answers button when all questions are answered
    this.checkIfAllAnswered();
  }

  setupAnswerListeners() {
    const answerInputs = document.querySelectorAll('input[type="radio"]');
    answerInputs.forEach(input => {
      input.addEventListener('change', () => {
        this.handleAnswerSelection(input);
        this.checkIfAllAnswered();
      });
    });
  }

  handleAnswerSelection(input) {
    const questionIndex = parseInt(input.name.split('_')[1]);
    const answerIndex = parseInt(input.value);
    const isCorrect = input.dataset.correct === 'true';
    
    // Store user answer
    this.userAnswers[questionIndex] = {
      questionIndex,
      answerIndex,
      isCorrect
    };
  }

  checkIfAllAnswered() {
    const totalQuestions = this.currentQuiz ? this.currentQuiz.questions.length : 0;
    const answeredQuestions = this.userAnswers.filter(answer => answer !== undefined).length;
    
    const checkAnswersBtn = document.getElementById('checkAnswersBtn');
    if (checkAnswersBtn) {
      if (answeredQuestions === totalQuestions) {
        checkAnswersBtn.style.display = 'block';
      } else {
        checkAnswersBtn.style.display = 'none';
      }
    }
  }

  updateProgress() {
    const quizProgress = document.getElementById('quizProgress');
    if (quizProgress && this.currentQuiz) {
      const totalQuestions = this.currentQuiz.questions.length;
      const answeredQuestions = this.userAnswers.filter(answer => answer !== undefined).length;
      quizProgress.textContent = `${answeredQuestions} of ${totalQuestions} answered`;
    }
  }

  checkAnswers() {
    if (!this.currentQuiz) return;
    
    // Calculate score
    const correctAnswers = this.userAnswers.filter(answer => answer && answer.isCorrect).length;
    const totalQuestions = this.currentQuiz.questions.length;
    const percentage = Math.round((correctAnswers / totalQuestions) * 100);
    
    // Mark answers visually
    this.markAnswers();
    
    // Show results
    this.showResults(correctAnswers, totalQuestions, percentage);
  }

  markAnswers() {
    const questions = document.querySelectorAll('.quiz-question');
    questions.forEach((questionDiv, questionIndex) => {
      const answerOptions = questionDiv.querySelectorAll('.answer-option');
      const userAnswer = this.userAnswers[questionIndex];
      
      answerOptions.forEach((option, optionIndex) => {
        const input = option.querySelector('input');
        const indicator = option.querySelector('.answer-indicator');
        const isCorrect = input.dataset.correct === 'true';
        const isSelected = userAnswer && userAnswer.answerIndex === optionIndex;
        
        if (isCorrect) {
          option.classList.add('correct');
          indicator.innerHTML = '<i class="fas fa-check"></i>';
        } else if (isSelected) {
          option.classList.add('incorrect');
          indicator.innerHTML = '<i class="fas fa-times"></i>';
        }
        
        // Disable all inputs
        input.disabled = true;
      });
    });
  }

  showResults(correctAnswers, totalQuestions, percentage) {
    const quizDisplaySection = document.getElementById('quizDisplaySection');
    const quizResultsSection = document.getElementById('quizResultsSection');
    const scoreNumber = document.getElementById('scoreNumber');
    const scoreTotal = document.getElementById('scoreTotal');
    const scorePercentage = document.getElementById('scorePercentage');
    const scoreBreakdown = document.getElementById('scoreBreakdown');
    
    // Hide quiz display, show results
    if (quizDisplaySection) quizDisplaySection.style.display = 'none';
    if (quizResultsSection) quizResultsSection.style.display = 'block';
    
    // Update score display
    if (scoreNumber) scoreNumber.textContent = correctAnswers;
    if (scoreTotal) scoreTotal.textContent = `/ ${totalQuestions}`;
    if (scorePercentage) scorePercentage.textContent = `${percentage}%`;
    
    // Generate score breakdown
    if (scoreBreakdown) {
      let message = '';
      let iconClass = '';
      
      if (percentage >= 90) {
        message = '🎉 Excellent! You have a great understanding of the content.';
        iconClass = 'excellent';
      } else if (percentage >= 80) {
        message = '👍 Great job! You understood most of the key concepts.';
        iconClass = 'good';
      } else if (percentage >= 70) {
        message = '👌 Good work! You got most questions right.';
        iconClass = 'fair';
      } else if (percentage >= 60) {
        message = '📖 You might want to review the content to improve your understanding.';
        iconClass = 'needs-improvement';
      } else {
        message = '🤔 Consider reviewing the content more carefully and try again.';
        iconClass = 'poor';
      }
      
      scoreBreakdown.innerHTML = `
        <div class="score-message ${iconClass}">
          <p>${message}</p>
          <div class="score-details">
            <span>Correct: ${correctAnswers}</span>
            <span>Incorrect: ${totalQuestions - correctAnswers}</span>
          </div>
        </div>
      `;
    }
    
    this.isQuizActive = false;
  }

  retakeQuiz() {
    if (!this.currentQuiz) return;
    
    // Reset quiz state
    this.userAnswers = [];
    this.isQuizActive = true;
    
    // Show quiz display again
    this.displayQuiz();
  }

  regenerateQuiz() {
    // Generate a new quiz with the same source
    this.generateQuiz();
  }

  startNewQuiz() {
    // Reset everything and go back to input
    this.currentQuiz = null;
    this.userAnswers = [];
    this.isQuizActive = false;
    
    const quizInputSection = document.getElementById('quizInputSection');
    const quizDisplaySection = document.getElementById('quizDisplaySection');
    const quizResultsSection = document.getElementById('quizResultsSection');
    
    if (quizInputSection) quizInputSection.style.display = 'block';
    if (quizDisplaySection) quizDisplaySection.style.display = 'none';
    if (quizResultsSection) quizResultsSection.style.display = 'none';
  }

  showError(message) {
    // Create and show error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'quiz-error';
    errorDiv.innerHTML = `
      <div class="error-content">
        <i class="fas fa-exclamation-triangle"></i>
        <span>${message}</span>
        <button onclick="this.parentElement.parentElement.remove()">×</button>
      </div>
    `;
    errorDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #f44336;
      color: white;
      padding: 12px 16px;
      border-radius: 6px;
      z-index: 10000;
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

  // Method to be called when switching to quiz tab
  onTabActivated() {
    this.checkCurrentVideo();
    this.validateInput();
  }

  showDetailedResults() {
    if (!this.currentQuiz || this.userAnswers.length === 0) return;
    
    const quizResultsSection = document.getElementById('quizResultsSection');
    const quizDisplaySection = document.getElementById('quizDisplaySection');
    
    // Switch back to quiz display to show the marked answers
    if (quizResultsSection) quizResultsSection.style.display = 'none';
    if (quizDisplaySection) quizDisplaySection.style.display = 'block';
    
    // Update the header to show this is the results view
    const quizDisplayHeader = quizDisplaySection.querySelector('.card-header h3');
    if (quizDisplayHeader) {
      quizDisplayHeader.innerHTML = `
        <i class="fas fa-check-circle"></i>
        Quiz Results - Detailed View
      `;
    }
    
    // Update progress to show final score
    const quizProgress = document.getElementById('quizProgress');
    if (quizProgress) {
      const correctAnswers = this.userAnswers.filter(answer => answer && answer.isCorrect).length;
      const totalQuestions = this.currentQuiz.questions.length;
      const percentage = Math.round((correctAnswers / totalQuestions) * 100);
      quizProgress.innerHTML = `
        <span style="color: var(--accent-success); font-weight: 600;">
          Final Score: ${correctAnswers}/${totalQuestions} (${percentage}%)
        </span>
      `;
    }
    
    // Re-render the quiz with answers marked
    this.renderQuizQuestions();
    this.markAnswers();
    
    // Update the action buttons for results view
    const quizActions = quizDisplaySection.querySelector('.quiz-actions');
    if (quizActions) {
      quizActions.innerHTML = `
        <button id="backToResultsBtn" class="action-button">
          <i class="fas fa-arrow-left"></i>
          Back to Summary
        </button>
        <button id="retakeQuizBtn" class="primary-button">
          <i class="fas fa-redo"></i>
          Retake Quiz
        </button>
        <button id="newQuizBtn" class="action-button">
          <i class="fas fa-plus"></i>
          Generate New Quiz
        </button>
      `;
      
      // Add event listeners to the new buttons
      const backToResultsBtn = document.getElementById('backToResultsBtn');
      const retakeQuizBtn = document.getElementById('retakeQuizBtn');
      const newQuizBtn = document.getElementById('newQuizBtn');
      
      if (backToResultsBtn) {
        backToResultsBtn.addEventListener('click', () => this.showResultsSummary());
      }
      
      if (retakeQuizBtn) {
        retakeQuizBtn.addEventListener('click', () => this.retakeQuiz());
      }
      
      if (newQuizBtn) {
        newQuizBtn.addEventListener('click', () => this.startNewQuiz());
      }
    }
    
    // Scroll to top to show all questions
    const quizContainer = document.getElementById('quizContainer');
    if (quizContainer) {
      quizContainer.scrollTop = 0;
    }
  }

  showResultsSummary() {
    const quizDisplaySection = document.getElementById('quizDisplaySection');
    const quizResultsSection = document.getElementById('quizResultsSection');
    
    // Switch back to results summary
    if (quizDisplaySection) quizDisplaySection.style.display = 'none';
    if (quizResultsSection) quizResultsSection.style.display = 'block';
    
    // Restore original header
    const quizDisplayHeader = quizDisplaySection.querySelector('.card-header h3');
    if (quizDisplayHeader) {
      quizDisplayHeader.innerHTML = `
        <i class="fas fa-clipboard-list"></i>
        Quiz Questions
      `;
    }
  }
}

// Global instance
let quizManager = null;

// Initialize when DOM is loaded or immediately if already loaded
function initializeQuizManager() {
  if (!quizManager) {
    console.log('🎯 Initializing Quiz Manager...');
    quizManager = new QuizManager();
    quizManager.initialize();
  }
}

// Check if DOM is already loaded
if (document.readyState === 'loading') {
  // DOM is still loading, wait for DOMContentLoaded
  document.addEventListener('DOMContentLoaded', initializeQuizManager);
} else {
  // DOM is already loaded, initialize immediately
  initializeQuizManager();
}

// Also listen for the popupLoaded event as a fallback
document.addEventListener('popupLoaded', () => {
  console.log('🎯 Popup loaded event received, ensuring quiz manager is initialized...');
  initializeQuizManager();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = QuizManager;
}