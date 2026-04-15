// Store messages with their unique IDs to prevent duplicates
let capturedMessages = new Map(); // uniqueId -> { author, text, firstSeen, lastUpdated }
let processedIds = new Set(); // Track which IDs we've already finalized

// Interval IDs
let captureIntervalId = null;
let finalizeIntervalId = null;
let cleanupIntervalId = null;

// State
let isRunning = true;
let captureIntervalMs = 10000; // default 10 seconds

function normalize(text) {
    return text.replace(/\s+/g, " ").trim();
}

function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `[${hours}:${minutes}:${seconds}]`;
}

function getUniqueId(container) {
    const avatarSpan = container.querySelector('span[id^="avatar-"]');
    if (avatarSpan) return avatarSpan.id;
    
    const author = container.querySelector('[data-tid="author"]')?.textContent || 'unknown';
    const textEl = container.querySelector('[data-tid="closed-caption-text"]');
    if (textEl) {
        const rect = textEl.getBoundingClientRect();
        return `${author}-${rect.top}-${rect.left}`;
    }
    
    return `container-${Array.from(document.querySelectorAll('.fui-ChatMessageCompact')).indexOf(container)}`;
}

function isComplete(text) {
    return /[.!?]$/.test(text) && text.length > 2;
}

function captureCurrentState() {
    const containers = document.querySelectorAll('.fui-ChatMessageCompact');
    const now = Date.now();
    
    containers.forEach(container => {
        const authorElement = container.querySelector('[data-tid="author"]');
        const textElement = container.querySelector('[data-tid="closed-caption-text"]');
        
        if (!authorElement || !textElement) return;
        
        const author = authorElement.textContent.trim();
        const text = normalize(textElement.textContent);
        
        if (!text) return;
        
        const uniqueId = getUniqueId(container);
        const existing = capturedMessages.get(uniqueId);
        
        if (existing) {
            existing.text = text;
            existing.lastUpdated = now;
        } else {
            capturedMessages.set(uniqueId, {
                author,
                text,
                firstSeen: now,
                lastUpdated: now,
                uniqueId: uniqueId
            });
        }
    });
}

function finalizeCompleteMessages() {
    const now = Date.now();
    const messagesToFinalize = [];
    
    capturedMessages.forEach((data, id) => {
        const { author, text, firstSeen, lastUpdated } = data;
        
        if (processedIds.has(id)) return;
        
        const isStable = (now - lastUpdated) > 3000;
        const isCompleteMessage = isComplete(text);
        
        if (isStable && isCompleteMessage) {
            messagesToFinalize.push({ id, author, text, timestamp: firstSeen });
            processedIds.add(id);
        }
    });
    
    messagesToFinalize.sort((a, b) => a.timestamp - b.timestamp);
    
    messagesToFinalize.forEach(msg => {
        console.log(`${formatTimestamp(msg.timestamp)} ${msg.author}\n${msg.text}`);
    });
    
    return messagesToFinalize;
}

function getAllFinalizedMessages() {
    const finalized = [];
    const sortedEntries = Array.from(capturedMessages.entries())
        .sort((a, b) => a[1].firstSeen - b[1].firstSeen);
    
    sortedEntries.forEach(([id, data]) => {
        if (processedIds.has(id) && isComplete(data.text)) {
            finalized.push({ 
                author: data.author, 
                text: data.text,
                timestamp: data.firstSeen
            });
        }
    });
    
    return finalized;
}

function downloadFile() {
    capturedMessages.forEach((data, id) => {
        if (!processedIds.has(id) && isComplete(data.text)) {
            processedIds.add(id);
            console.log(`${formatTimestamp(data.firstSeen)} ${data.author}\n${data.text}`);
        }
    });
    
    const finalized = getAllFinalizedMessages();
    
    const deduped = [];
    finalized.forEach(msg => {
        const last = deduped[deduped.length - 1];
        if (!last || last.author !== msg.author || last.text !== msg.text) {
            deduped.push(msg);
        }
    });
    
    const content = deduped
        .map(msg => `${formatTimestamp(msg.timestamp)} ${msg.author}\n${msg.text}`)
        .join('\n\n');
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const fileTimestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const a = document.createElement('a');
    a.href = url;
    a.download = `teams_captions_${fileTimestamp}.txt`;
    a.click();
    
    URL.revokeObjectURL(url);
    
    console.log(`Downloaded ${deduped.length} captions`);
}

function clearCaptions() {
    capturedMessages.clear();
    processedIds.clear();
    console.log('Captions cleared');
}

function cleanupOldMessages() {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000;
    
    capturedMessages.forEach((data, id) => {
        if (now - data.lastUpdated > maxAge) {
            capturedMessages.delete(id);
            processedIds.delete(id);
        }
    });
}

// Start/stop functions
function startCapture(intervalMs) {
    if (captureIntervalId) clearInterval(captureIntervalId);
    if (finalizeIntervalId) clearInterval(finalizeIntervalId);
    if (cleanupIntervalId) clearInterval(cleanupIntervalId);
    
    captureIntervalId = setInterval(() => captureCurrentState(), intervalMs);
    finalizeIntervalId = setInterval(() => finalizeCompleteMessages(), 5000);
    cleanupIntervalId = setInterval(() => cleanupOldMessages(), 60000);
    
    isRunning = true;
    console.log(`Capture started with ${intervalMs}ms interval`);
}

function stopCapture() {
    if (captureIntervalId) clearInterval(captureIntervalId);
    if (finalizeIntervalId) clearInterval(finalizeIntervalId);
    if (cleanupIntervalId) clearInterval(cleanupIntervalId);
    
    captureIntervalId = null;
    finalizeIntervalId = null;
    cleanupIntervalId = null;
    
    isRunning = false;
    console.log('Capture stopped');
}

// Message listener for popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
        case 'getState':
            sendResponse({
                isRunning,
                messageCount: capturedMessages.size,
                processedCount: processedIds.size
            });
            break;
        case 'start':
            startCapture(request.interval || captureIntervalMs);
            sendResponse({ success: true });
            break;
        case 'stop':
            stopCapture();
            sendResponse({ success: true });
            break;
        case 'captureNow':
            captureCurrentState();
            sendResponse({ success: true });
            break;
        case 'clear':
            clearCaptions();
            sendResponse({ success: true });
            break;
        case 'download':
            downloadFile();
            sendResponse({ success: true });
            break;
    }
    return true;
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.altKey && e.key.toLowerCase() === 'd') {
        downloadFile();
    }
    if (e.altKey && e.key.toLowerCase() === 'c') {
        clearCaptions();
    }
    if (e.altKey && e.key.toLowerCase() === 's') {
        captureCurrentState();
        console.log('Manual capture triggered');
    }
});

// Load saved interval and start
chrome.storage.local.get(['captureInterval'], (result) => {
    if (result.captureInterval) {
        captureIntervalMs = result.captureInterval;
    }
    startCapture(captureIntervalMs);
    setTimeout(() => captureCurrentState(), 1000);
});

console.log('Teams Live Caption Capture loaded.');
console.log('Press Alt+D to download, Alt+C to clear, Alt+S to force capture');