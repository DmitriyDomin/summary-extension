// Modern Tab Switcher with Enhanced UI Interactions
console.log('🎨 Modern tab switcher loading...');

let debugElement = null;

function updateDebug(message) {
    if (!debugElement) {
        debugElement = document.getElementById('debugInfo');
    }
    if (debugElement) {
        debugElement.innerText = `Debug: ${message}`;
    }
    console.log('🔧 DEBUG:', message);
}

function setupModernTabSwitching() {
    try {
        updateDebug('Setting up modern tabs...');
        
        const navTabs = document.querySelectorAll('.nav-tab');
        updateDebug(`Found ${navTabs.length} navigation tabs`);
        
        if (navTabs.length === 0) {
            updateDebug('ERROR: No navigation tabs found!');
            return;
        }
        
        navTabs.forEach((navTab) => {
            navTab.addEventListener('click', (e) => {
                updateDebug(`Clicked tab: ${e.target.closest('.nav-tab').id}`);
                
                e.preventDefault();
                e.stopPropagation();
                
                const clickedTab = e.target.closest('.nav-tab');
                
                if (clickedTab.classList.contains('active')) {
                    updateDebug('Tab already active, skipping');
                    return;
                }
                
                switchToModernPage(clickedTab);
            });
        });
        
        // Setup expandable content toggles
        setupExpandableContent();
        
        // Setup modern interactions
        setupModernInteractions();
        
        updateDebug('Modern tabs ready!');
        
    } catch (error) {
        updateDebug(`Setup error: ${error.message}`);
        console.error('Setup error:', error);
    }
}

function switchToModernPage(clickedTab) {
    try {
        const targetPageId = clickedTab.dataset.page;
        updateDebug(`Switching to modern page: ${targetPageId}`);
        
        // Remove active from all tabs with smooth animation - FIXED: More thorough cleanup
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        
        // Also remove from old menu__item classes for compatibility
        document.querySelectorAll('.menu__item').forEach(item => {
            item.classList.remove('active');
        });
        
        // Hide all pages with fade out
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active-page');
        });
        
        // Show target page with fade in
        const targetPage = document.getElementById(targetPageId);
        if (targetPage) {
            // Add a small delay for smooth transition
            setTimeout(() => {
                targetPage.classList.add('active-page');
                clickedTab.classList.add('active');
                
                updateDebug(`SUCCESS! Showing: ${targetPageId}`);
                
                // Call the page switch handler from popup.js if available
                if (window.handlePageSwitch) {
                    window.handlePageSwitch(targetPageId);
                }
                
                // Trigger any page-specific setup
                setupPageSpecificFeatures(targetPageId);
                
            }, 100);
        } else {
            updateDebug(`ERROR: Page ${targetPageId} not found!`);
        }
        
    } catch (error) {
        updateDebug(`Switch error: ${error.message}`);
        console.error('Switch error:', error);
    }
}

function setupExpandableContent() {
    const toggleButtons = document.querySelectorAll('.toggle-button');
    
    toggleButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const card = button.closest('.content-card');
            const expandableContent = card.querySelector('.expandable');
            const isExpanded = button.classList.contains('expanded');
            
            if (isExpanded) {
                // Collapse
                button.classList.remove('expanded');
                expandableContent.classList.remove('expanded');
                expandableContent.style.maxHeight = '0px';
            } else {
                // Expand
                button.classList.add('expanded');
                expandableContent.classList.add('expanded');
                expandableContent.style.maxHeight = expandableContent.scrollHeight + 'px';
            }
        });
    });
}

function setupModernInteractions() {
    // Language toggle modal
    const languageToggle = document.getElementById('languageToggle');
    const languageModal = document.getElementById('languageModal');
    const closeLanguageModal = document.getElementById('closeLanguageModal');
    
    if (languageToggle && languageModal) {
        languageToggle.addEventListener('click', () => {
            languageModal.classList.add('active');
        });
    }
    
    if (closeLanguageModal && languageModal) {
        closeLanguageModal.addEventListener('click', () => {
            languageModal.classList.remove('active');
        });
    }
    
    // Language selection
    const languageOptions = document.querySelectorAll('.language-option');
    languageOptions.forEach(option => {
        option.addEventListener('click', (e) => {
            const selectedLang = option.dataset.lang;
            console.log('Selected language:', selectedLang);
            
            // Update hidden select for compatibility
            const userLanguageSelect = document.getElementById('userLanguage');
            if (userLanguageSelect) {
                userLanguageSelect.value = selectedLang;
                userLanguageSelect.dispatchEvent(new Event('change'));
            }
            
            // Close modal
            languageModal.classList.remove('active');
            
            // Show selection feedback
            showToast(`Language changed to ${option.querySelector('span').textContent}`);
        });
    });
    
    // Enhanced button interactions
    setupButtonEnhancements();
    
    // Smooth scrolling for iOS-like feel
    setupSmoothScrolling();
    
    // Form enhancements
    setupFormEnhancements();
}

function setupButtonEnhancements() {
    // Add loading states to buttons
    const primaryButtons = document.querySelectorAll('.primary-button');
    
    primaryButtons.forEach(button => {
        button.addEventListener('click', function() {
            if (!this.disabled) {
                this.classList.add('loading');
                
                // Remove loading state after a delay (will be overridden by actual functionality)
                setTimeout(() => {
                    this.classList.remove('loading');
                }, 3000);
            }
        });
    });
    
    // Add ripple effect to buttons
    document.querySelectorAll('.primary-button, .action-button, .nav-tab').forEach(button => {
        button.addEventListener('click', createRippleEffect);
    });
}

function createRippleEffect(e) {
    const button = e.currentTarget;
    const ripple = document.createElement('span');
    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    
    ripple.style.cssText = `
        position: absolute;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.6);
        transform: scale(0);
        animation: ripple 0.6s linear;
        width: ${size}px;
        height: ${size}px;
        left: ${x}px;
        top: ${y}px;
        pointer-events: none;
    `;
    
    // Add ripple animation keyframes if not exists
    if (!document.querySelector('#ripple-animation')) {
        const style = document.createElement('style');
        style.id = 'ripple-animation';
        style.textContent = `
            @keyframes ripple {
                to {
                    transform: scale(4);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    // Ensure button has relative position
    if (getComputedStyle(button).position === 'static') {
        button.style.position = 'relative';
    }
    
    button.style.overflow = 'hidden';
    button.appendChild(ripple);
    
    // Remove ripple after animation
    setTimeout(() => {
        ripple.remove();
    }, 600);
}

function setupSmoothScrolling() {
    // Add momentum scrolling for iOS feel
    const scrollableElements = document.querySelectorAll('.main-content, .chat-messages');
    
    scrollableElements.forEach(element => {
        element.style.webkitOverflowScrolling = 'touch';
        element.style.scrollBehavior = 'smooth';
    });
}

function setupFormEnhancements() {
    // Auto-resize textareas
    const textareas = document.querySelectorAll('textarea');
    textareas.forEach(textarea => {
        textarea.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 200) + 'px';
        });
    });
    
    // Enhanced input focus effects
    const inputs = document.querySelectorAll('.text-input, textarea, .modern-select select');
    inputs.forEach(input => {
        input.addEventListener('focus', function() {
            this.closest('.input-group, .modern-select, .password-input')?.classList.add('focused');
        });
        
        input.addEventListener('blur', function() {
            this.closest('.input-group, .modern-select, .password-input')?.classList.remove('focused');
        });
    });
}

function setupPageSpecificFeatures(pageId) {
    switch(pageId) {
        case 'homePage':
            setupHomePageFeatures();
            break;
        case 'liveSummaryPage':
            setupLiveSummaryFeatures();
            break;
        case 'quizPage':
            setupQuizPageFeatures();
            break;
        case 'summariesPage':
            setupSummariesPageFeatures();
            break;
        case 'settingsPage':
            setupSettingsPageFeatures();
            break;
    }
}

function setupHomePageFeatures() {
    // Setup instant summary toggle
    const instantSummaryToggle = document.getElementById('instantSummaryToggle');
    const textSummaryContent = document.getElementById('textSummaryContent');
    
    if (instantSummaryToggle && textSummaryContent) {
        // Initially collapsed
        textSummaryContent.style.maxHeight = '0px';
        
        instantSummaryToggle.addEventListener('click', () => {
            const isExpanded = instantSummaryToggle.classList.contains('expanded');
            
            if (isExpanded) {
                instantSummaryToggle.classList.remove('expanded');
                textSummaryContent.classList.remove('expanded');
                textSummaryContent.style.maxHeight = '0px';
            } else {
                instantSummaryToggle.classList.add('expanded');
                textSummaryContent.classList.add('expanded');
                textSummaryContent.style.maxHeight = textSummaryContent.scrollHeight + 'px';
            }
        });
    }
    
    // Setup textarea auto-enable button
    const instantSummaryTextarea = document.getElementById('instantSummaryTextarea');
    const instantSummaryButton = document.getElementById('instantSummaryButton');
    
    if (instantSummaryTextarea && instantSummaryButton) {
        instantSummaryTextarea.addEventListener('input', () => {
            instantSummaryButton.disabled = !instantSummaryTextarea.value.trim();
        });
    }
    
    // Setup tags input auto-enable save button
    const tagsInput = document.getElementById('tags');
    const saveButton = document.getElementById('saveButton');
    
    if (tagsInput && saveButton) {
        tagsInput.addEventListener('input', () => {
            const errorMessage = document.getElementById('saveButtonError');
            if (errorMessage) {
                errorMessage.classList.remove('show');
            }
            saveButton.disabled = !tagsInput.value.trim();
        });
    }
}

function setupLiveSummaryFeatures() {
    console.log('Setting up live summary page features');
    
    // Setup chat input auto-resize
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const sendButton = document.getElementById('sendMessageBtn');
                if (sendButton && chatInput.value.trim()) {
                    sendButton.click();
                }
            }
        });
    }
}

function setupQuizPageFeatures() {
    console.log('Setting up quiz page features');
    
    // Notify quiz manager that the tab was activated
    if (window.quizManager) {
        window.quizManager.onTabActivated();
    }
    
    // Setup quiz text input auto-resize
    const quizCustomText = document.getElementById('quizCustomText');
    if (quizCustomText) {
        quizCustomText.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 300) + 'px';
        });
    }
}

function setupSummariesPageFeatures() {
    console.log('Setting up summaries page features');
    
    // Setup search functionality
    const summaryInput = document.getElementById('summaryInput');
    if (summaryInput) {
        summaryInput.addEventListener('input', debounce(() => {
            const searchTerm = summaryInput.value.toLowerCase();
            console.log('Searching for:', searchTerm);
            // This will be handled by the existing popup.js functionality
        }, 300));
    }
}

function setupSettingsPageFeatures() {
    console.log('Setting up settings page features');
    
    // Setup password toggles
    const passwordToggles = document.querySelectorAll('.toggle-password');
    passwordToggles.forEach(toggle => {
        toggle.addEventListener('click', () => {
            const input = toggle.previousElementSibling;
            const icon = toggle.querySelector('i');
            
            if (input.type === 'password') {
                input.type = 'text';
                icon.className = 'fas fa-eye-slash';
            } else {
                input.type = 'password';
                icon.className = 'fas fa-eye';
            }
        });
    });
}

function showToast(message, type = 'info') {
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--accent-primary);
        color: var(--text-white);
        padding: 12px 20px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        z-index: 10000;
        transform: translateX(100%);
        transition: transform 0.3s ease;
        box-shadow: var(--shadow-lg);
    `;
    
    document.body.appendChild(toast);
    
    // Animate in
    setTimeout(() => {
        toast.style.transform = 'translateX(0)';
    }, 100);
    
    // Animate out and remove
    setTimeout(() => {
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Initialize when DOM is ready
function initModernTabSwitcher() {
    updateDebug('Modern script loaded');
    
    // Try to setup immediately, and also on DOM ready
    if (document.readyState === 'loading') {
        updateDebug('DOM still loading, waiting...');
        document.addEventListener('DOMContentLoaded', () => {
            updateDebug('DOM loaded!');
            setupModernTabSwitching();
        });
    } else {
        updateDebug('DOM already ready!');
        setupModernTabSwitching();
    }
    
    // Fallback - setup after a short delay anyway
    setTimeout(() => {
        const debugInfo = document.getElementById('debugInfo');
        if (debugInfo && (debugInfo.innerText.includes('Starting') || 
            debugInfo.innerText.includes('DOM still loading'))) {
            updateDebug('Fallback setup...');
            setupModernTabSwitching();
        }
    }, 500);
}

// Enhanced compatibility with existing menu system
document.addEventListener('DOMContentLoaded', () => {
    // Map old menu classes to new nav-tab classes for backward compatibility
    const oldMenuItems = document.querySelectorAll('.menu__item');
    oldMenuItems.forEach(item => {
        if (!item.classList.contains('nav-tab')) {
            item.classList.add('nav-tab');
            
            // Map data-page attributes
            switch(item.id) {
                case 'menuHome':
                    item.dataset.page = 'homePage';
                    break;
                case 'menuLive':
                    item.dataset.page = 'liveSummaryPage';
                    break;
                case 'menuSummaries':
                    item.dataset.page = 'summariesPage';
                    break;
                case 'menuSettings':
                    item.dataset.page = 'settingsPage';
                    break;
            }
        }
    });
});

// Start immediately
initModernTabSwitcher();