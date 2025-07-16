// Tab switching functionality - CSP compliant
console.log('🔧 Tab switcher loading...');

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

function setupTabSwitching() {
    try {
        updateDebug('Setting up tabs...');
        
        const menuItems = document.querySelectorAll('.menu__item');
        updateDebug(`Found ${menuItems.length} menu items`);
        
        if (menuItems.length === 0) {
            updateDebug('ERROR: No menu items found!');
            return;
        }
        
        menuItems.forEach((menuItem) => {
            menuItem.addEventListener('click', (e) => {
                updateDebug(`Clicked: ${e.target.id}`);
                
                e.preventDefault();
                e.stopPropagation();
                
                if (e.target.classList.contains('active')) {
                    updateDebug('Already active, skipping');
                    return;
                }
                
                switchPage(e.target);
            });
        });
        
        updateDebug('Tabs ready! Click a tab to test.');
        
    } catch (error) {
        updateDebug(`Setup error: ${error.message}`);
        console.error('Setup error:', error);
    }
}

function switchPage(clickedTab) {
    try {
        updateDebug(`Switching to: ${clickedTab.id}`);
        
        // Remove active from all tabs
        document.querySelectorAll('.menu__item').forEach(tab => {
            tab.classList.remove('active');
        });
        
        // Hide all pages
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active-page');
        });
        
        // Show target page
        let targetPageId = '';
        switch(clickedTab.id) {
            case 'menuHome':
                targetPageId = 'homePage';
                break;
            case 'menuLive':
                targetPageId = 'liveSummaryPage';
                break;
            case 'menuSummaries':
                targetPageId = 'summariesPage';
                break;
            case 'menuSettings':
                targetPageId = 'settingsPage';
                break;
            default:
                updateDebug(`Unknown tab: ${clickedTab.id}`);
                return;
        }
        
        const targetPage = document.getElementById(targetPageId);
        if (targetPage) {
            targetPage.classList.add('active-page');
            clickedTab.classList.add('active');
            updateDebug(`SUCCESS! Showing: ${targetPageId}`);
            
            // Call the page switch handler from popup.js if available
            if (window.handlePageSwitch) {
                window.handlePageSwitch(targetPageId);
            }
        } else {
            updateDebug(`ERROR: Page ${targetPageId} not found!`);
        }
        
    } catch (error) {
        updateDebug(`Switch error: ${error.message}`);
        console.error('Switch error:', error);
    }
}

// Initialize when DOM is ready
function initTabSwitcher() {
    updateDebug('Script loaded');
    
    // Try to setup immediately, and also on DOM ready
    if (document.readyState === 'loading') {
        updateDebug('DOM still loading, waiting...');
        document.addEventListener('DOMContentLoaded', () => {
            updateDebug('DOM loaded!');
            setupTabSwitching();
        });
    } else {
        updateDebug('DOM already ready!');
        setupTabSwitching();
    }
    
    // Fallback - setup after a short delay anyway
    setTimeout(() => {
        const debugInfo = document.getElementById('debugInfo');
        if (debugInfo && (debugInfo.innerText.includes('Starting') || 
            debugInfo.innerText.includes('DOM still loading'))) {
            updateDebug('Fallback setup...');
            setupTabSwitching();
        }
    }, 500);
}

// Start immediately
initTabSwitcher();