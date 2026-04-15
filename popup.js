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

// Update UI based on state
async function updateUI() {
    try {
        const response = await sendToContentScript('getState');
        if (response) {
            document.getElementById('messageCount').textContent = response.messageCount || 0;
            const isRunning = response.isRunning;
            const statusIndicator = document.getElementById('statusIndicator');
            const captureState = document.getElementById('captureState');
            const startBtn = document.getElementById('startBtn');
            const stopBtn = document.getElementById('stopBtn');
            
            if (isRunning) {
                statusIndicator.className = 'status';
                captureState.textContent = 'Active';
                startBtn.disabled = true;
                stopBtn.disabled = false;
            } else {
                statusIndicator.className = 'status stopped';
                captureState.textContent = 'Stopped';
                startBtn.disabled = false;
                stopBtn.disabled = true;
            }
        }
    } catch (e) {
        console.error('Failed to get state:', e);
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
    const response = await sendToContentScript('getState');
    if (response && response.isRunning) {
        await sendToContentScript('stop');
        await sendToContentScript('start', { interval: currentCaptureInterval });
    }
});

// Initial update
updateUI();

// Refresh UI periodically
setInterval(updateUI, 2000);