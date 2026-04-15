let captureIntervalId = null;
let finalizeIntervalId = null;
let cleanupIntervalId = null;
let currentCaptureInterval = 10000; // 10 seconds default

// Connect to the content script
async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
}

async function sendToContentScript(action, data = {}) {
    const tab = await getActiveTab();
    return chrome.tabs.sendMessage(tab.id, { action, ...data });
}

// Check if current tab is a Teams meeting page
function isTeamsPage(url) {
    return url && (
        url.includes('teams.microsoft.com') || 
        url.includes('teams.cloud.microsoft')
    );
}

// Check if live captions are present on the page
async function checkLiveCaptionPresence() {
    try {
        const tab = await getActiveTab();
        if (!tab || !isTeamsPage(tab.url)) {
            return { hasCaptions: false, isTeamsPage: false };
        }
        
        // Try to detect if live captions are active
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'checkCaptions' });
        return { 
            hasCaptions: response?.hasCaptions || false, 
            isTeamsPage: true,
            captionCount: response?.captionCount || 0
        };
    } catch (e) {
        // Content script not loaded or not on Teams page
        return { hasCaptions: false, isTeamsPage: false };
    }
}

// Update UI based on state
async function updateUI() {
    const statusIndicator = document.getElementById('statusIndicator');
    const captureState = document.getElementById('captureState');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const captureNowBtn = document.getElementById('captureNowBtn');
    const clearBtn = document.getElementById('clearBtn');
    const captureIntervalInput = document.getElementById('captureInterval');
    const messageCountEl = document.getElementById('messageCount');
    
    try {
        const tab = await getActiveTab();
        
        // Check if we're on a Teams page
        if (!tab || !isTeamsPage(tab.url)) {
            statusIndicator.className = 'status stopped';
            captureState.textContent = 'No Teams';
            messageCountEl.textContent = '0';
            
            // Disable all controls
            startBtn.disabled = true;
            stopBtn.disabled = true;
            downloadBtn.disabled = true;
            captureNowBtn.disabled = true;
            clearBtn.disabled = true;
            captureIntervalInput.disabled = true;
            return;
        }
        
        // Check if live captions are present
        const captionCheck = await checkLiveCaptionPresence();
        
        if (!captionCheck.hasCaptions) {
            statusIndicator.className = 'status stopped';
            captureState.textContent = 'No Captions';
            messageCountEl.textContent = captionCheck.captionCount || '0';
            
            // Disable capture controls but enable others
            startBtn.disabled = true;
            stopBtn.disabled = true;
            captureNowBtn.disabled = true;
            captureIntervalInput.disabled = true;
            downloadBtn.disabled = false;
            clearBtn.disabled = false;
            return;
        }
        
        // We're on Teams with live captions - get full state
        try {
            const response = await sendToContentScript('getState');
            if (response) {
                messageCountEl.textContent = response.messageCount || 0;
                const isRunning = response.isRunning;
                
                // Enable all controls
                startBtn.disabled = false;
                stopBtn.disabled = false;
                downloadBtn.disabled = false;
                captureNowBtn.disabled = false;
                clearBtn.disabled = false;
                captureIntervalInput.disabled = false;
                
                if (isRunning) {
                    statusIndicator.className = 'status';
                    captureState.textContent = 'Capturing';
                    startBtn.disabled = true;
                    stopBtn.disabled = false;
                } else {
                    statusIndicator.className = 'status stopped';
                    captureState.textContent = 'Paused';
                    startBtn.disabled = false;
                    stopBtn.disabled = true;
                }
            }
        } catch (e) {
            // Content script might not be responding
            statusIndicator.className = 'status stopped';
            captureState.textContent = 'Loading...';
            startBtn.disabled = true;
            stopBtn.disabled = true;
            downloadBtn.disabled = false;
            captureNowBtn.disabled = true;
            clearBtn.disabled = false;
            captureIntervalInput.disabled = true;
        }
    } catch (e) {
        console.error('Failed to update UI:', e);
        statusIndicator.className = 'status stopped';
        captureState.textContent = 'Error';
        messageCountEl.textContent = '0';
    }
}

// Load saved interval
chrome.storage.local.get(['captureInterval'], (result) => {
    if (result.captureInterval) {
        currentCaptureInterval = result.captureInterval;
        document.getElementById('captureInterval').value = result.captureInterval / 1000;
    }
});

// Event listeners
document.getElementById('startBtn').addEventListener('click', async () => {
    const intervalSeconds = parseInt(document.getElementById('captureInterval').value) || 10;
    currentCaptureInterval = intervalSeconds * 1000;
    
    await chrome.storage.local.set({ captureInterval: currentCaptureInterval });
    await sendToContentScript('start', { interval: currentCaptureInterval });
    updateUI();
});

document.getElementById('stopBtn').addEventListener('click', async () => {
    await sendToContentScript('stop');
    updateUI();
});

document.getElementById('captureNowBtn').addEventListener('click', async () => {
    await sendToContentScript('captureNow');
    setTimeout(updateUI, 500);
});

document.getElementById('clearBtn').addEventListener('click', async () => {
    if (confirm('Clear all captured captions? This cannot be undone.')) {
        await sendToContentScript('clear');
        updateUI();
    }
});

document.getElementById('downloadBtn').addEventListener('click', async () => {
    await sendToContentScript('download');
});

document.getElementById('captureInterval').addEventListener('change', async (e) => {
    const intervalSeconds = parseInt(e.target.value) || 10;
    currentCaptureInterval = intervalSeconds * 1000;
    await chrome.storage.local.set({ captureInterval: currentCaptureInterval });
    
    // If running, restart with new interval
    try {
        const response = await sendToContentScript('getState');
        if (response && response.isRunning) {
            await sendToContentScript('stop');
            await sendToContentScript('start', { interval: currentCaptureInterval });
        }
    } catch (e) {
        // Ignore errors - will be handled by next updateUI
    }
});

// Initial update
updateUI();

// Refresh UI periodically
setInterval(updateUI, 2000);