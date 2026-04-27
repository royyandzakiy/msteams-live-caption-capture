// Store messages with their unique IDs to prevent duplicates
let capturedMessages = new Map(); // uniqueId -> { author, text, firstSeen, lastUpdated }
let processedIds = new Set(); // Track which IDs we've already finalized
let captionsPresent = false;
let autoDownloadTriggered = false;

// Interval IDs
let captureIntervalId = null;
let finalizeIntervalId = null;
let cleanupIntervalId = null;
let monitorIntervalId = null;

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
    // Try to get a unique ID from the avatar element
    const avatarSpan = container.querySelector('span[id^="avatar-"]');
    if (avatarSpan) return avatarSpan.id;
    
    // Fallback: use a combination of author and position
    const author = container.querySelector('[data-tid="author"]')?.textContent || 'unknown';
    const textEl = container.querySelector('[data-tid="closed-caption-text"]');
    if (textEl) {
        // Create a simple hash of the element's position in DOM
        const rect = textEl.getBoundingClientRect();
        return `${author}-${rect.top}-${rect.left}`;
    }
    
    // Last resort: use the container itself as reference
    return `container-${Array.from(document.querySelectorAll('.fui-ChatMessageCompact')).indexOf(container)}`;
}

function isComplete(text) {
    return /[.!?]$/.test(text) && text.length > 2;
}

function checkCaptionsPresence() {
    const captionsWindow = document.querySelector('[data-tid="closed-caption-renderer-wrapper"]');
    const captionTexts = document.querySelectorAll('[data-tid="closed-caption-text"]');
    return captionsWindow !== null && captionTexts.length > 0;
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
            // Update text but keep original firstSeen timestamp
            existing.text = text;
            existing.lastUpdated = now;
        } else {
            // New message - store with firstSeen timestamp
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
        
        // Skip if already processed
        if (processedIds.has(id)) return;
        
        // Check if message is complete and stable (no updates for 3 seconds)
        const isStable = (now - lastUpdated) > 3000;
        const isCompleteMessage = isComplete(text);
        
        if (isStable && isCompleteMessage) {
            messagesToFinalize.push({ 
                id, 
                author, 
                text, 
                timestamp: firstSeen 
            });
            processedIds.add(id);
        }
    });
    
    // Sort by timestamp to maintain order
    messagesToFinalize.sort((a, b) => a.timestamp - b.timestamp);
    
    // Output finalized messages
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

function getMeetingName() {
    try {
        const title = document.title;
        // Pattern matches: anything between "|" and "| Microsoft Teams"
        // Handles formats like:
        // - "Chat | Meeting Name | Microsoft Teams"
        // - "Meeting Name | Microsoft Teams"
        const match = title.match(/\|\s*([^|]+?)\s*\|\s*Microsoft Teams$/);
        if (match && match[1]) {
            // Clean up the meeting name (remove any extra spaces)
            let meetingName = match[1].trim();
            // Remove "Chat" if it's at the beginning of the meeting name
            meetingName = meetingName.replace(/^Chat\s*\|\s*/, '');
            return meetingName;
        }
        
        // Fallback: try without the "Chat" part
        const simpleMatch = title.match(/^([^|]+?)\s*\|\s*Microsoft Teams$/);
        if (simpleMatch && simpleMatch[1]) {
            return simpleMatch[1].trim();
        }
        
        return null;
    } catch (e) {
        console.error('Error getting meeting name:', e);
        return null;
    }
}


function downloadFile(isAutoDownload = false) {
    // Force finalize any complete messages that haven't been processed yet
    capturedMessages.forEach((data, id) => {
        if (!processedIds.has(id) && isComplete(data.text)) {
            processedIds.add(id);
            console.log(`${formatTimestamp(data.firstSeen)} ${data.author}\n${data.text}`);
        }
    });
    
    const finalized = getAllFinalizedMessages();
    
    // Deduplicate consecutive identical messages from same author
    const deduped = [];
    finalized.forEach(msg => {
        const last = deduped[deduped.length - 1];
        if (!last || last.author !== msg.author || last.text !== msg.text) {
            deduped.push(msg);
        }
    });
    
    if (deduped.length === 0) {
        console.log('No captions to download');
        return;
    }
    
    const content = deduped
        .map(msg => `${formatTimestamp(msg.timestamp)} ${msg.author}\n${msg.text}`)
        .join('\n\n');
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const fileTimestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const prefix = isAutoDownload ? 'auto_' : '';
    
    // Get meeting name and create filename
    let meetingName = getMeetingName();
    let filename;
    
    if (meetingName) {
        // Sanitize meeting name for filesystem (remove invalid characters)
        const sanitizedName = meetingName.replace(/[<>:"/\\|?*]/g, '-').replace(/\s+/g, '_');
        filename = `${prefix}teams_captions_${sanitizedName}_${fileTimestamp}.txt`;
    } else {
        filename = `${prefix}teams_captions_${fileTimestamp}.txt`;
    }
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    
    URL.revokeObjectURL(url);
    
    console.log(`${isAutoDownload ? 'Auto-d' : 'D'}ownloaded ${deduped.length} captions${meetingName ? ` from "${meetingName}"` : ''}`);
    
    // Clear captions after download if it was auto-download
    if (isAutoDownload) {
        clearCaptions();
        autoDownloadTriggered = true;
    }
}

function clearCaptions() {
    capturedMessages.clear();
    processedIds.clear();
    console.log('Captions cleared');
}

function cleanupOldMessages() {
    // Remove messages older than 30 minutes to prevent memory bloat
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutes
    
    capturedMessages.forEach((data, id) => {
        if (now - data.lastUpdated > maxAge) {
            capturedMessages.delete(id);
            processedIds.delete(id);
        }
    });
}

function monitorCaptionsPresence() {
    const wasPresent = captionsPresent;
    captionsPresent = checkCaptionsPresence();
    
    // If captions were present but now disappeared, meeting likely ended
    if (wasPresent && !captionsPresent && !autoDownloadTriggered) {
        console.log('Captions disappeared - meeting may have ended. Auto-downloading...');
        downloadFile(true);
    }
    
    // Reset auto-download trigger when captions appear again (new meeting)
    if (captionsPresent && autoDownloadTriggered) {
        autoDownloadTriggered = false;
        console.log('New meeting detected - ready to capture');
    }
}

// Start/stop functions
function startCapture(intervalMs) {
    if (captureIntervalId) clearInterval(captureIntervalId);
    if (finalizeIntervalId) clearInterval(finalizeIntervalId);
    if (cleanupIntervalId) clearInterval(cleanupIntervalId);
    if (monitorIntervalId) clearInterval(monitorIntervalId);
    
    captureIntervalId = setInterval(() => captureCurrentState(), intervalMs);
    finalizeIntervalId = setInterval(() => finalizeCompleteMessages(), 5000);
    // cleanupIntervalId = setInterval(() => cleanupOldMessages(), 60000);
    monitorIntervalId = setInterval(() => monitorCaptionsPresence(), 3000);
    
    isRunning = true;
    console.log(`Capture started with ${intervalMs}ms interval`);
}

function stopCapture() {
    if (captureIntervalId) clearInterval(captureIntervalId);
    if (finalizeIntervalId) clearInterval(finalizeIntervalId);
    if (cleanupIntervalId) clearInterval(cleanupIntervalId);
    if (monitorIntervalId) clearInterval(monitorIntervalId);
    
    captureIntervalId = null;
    finalizeIntervalId = null;
    cleanupIntervalId = null;
    monitorIntervalId = null;
    
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
                processedCount: processedIds.size,
                captionsPresent: checkCaptionsPresence()
            });
            break;
        case 'checkCaptions':
            const present = checkCaptionsPresence();
            sendResponse({
                hasCaptions: present,
                captionCount: document.querySelectorAll('[data-tid="closed-caption-text"]').length,
                containerCount: document.querySelectorAll('.fui-ChatMessageCompact').length
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
            downloadFile(false);
            sendResponse({ success: true });
            break;
    }
    return true;
});

function handleTabClose() {
    console.log('Tab is closing - checking for captions to download...');
    
    // Check if we have any captured messages
    if (capturedMessages.size > 0) {
        // Force finalize any complete messages
        capturedMessages.forEach((data, id) => {
            if (!processedIds.has(id) && isComplete(data.text)) {
                processedIds.add(id);
            }
        });
        
        const finalized = getAllFinalizedMessages();
        
        if (finalized.length > 0) {
            console.log(`Tab closing with ${finalized.length} captions - downloading...`);
            downloadFile(true); // This will also clear captions
        
            // Note: downloadFile() is async, but the browser will usually complete it
            // before the tab closes. If you want to be safer, you can use synchronous
            // confirmation but it's not recommended for UX.
        } else {
            console.log('No complete captions to download');
        }
    } else {
        console.log('No captions captured to download');
    }
}

window.addEventListener('beforeunload', (e) => {
    handleTabClose();
    
    if (capturedMessages.size > 0 && getAllFinalizedMessages().length > 0) {
        e.preventDefault();
        e.returnValue = 'You have unsaved captions. They will be downloaded automatically.';
        return e.returnValue;
    }
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        console.log('Tab hidden - monitoring for potential meeting end');
    } else {
        console.log('Tab visible again');
        setTimeout(() => {
            if (!checkCaptionsPresence() && capturedMessages.size > 0 && !autoDownloadTriggered) {
                console.log('Captions missing after tab became visible - auto-downloading...');
                downloadFile(true);
            }
        }, 1000);
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.altKey && e.key.toLowerCase() === 'd') {
        downloadFile(false);
    }
    if (e.altKey && e.key.toLowerCase() === 'c') {
        clearCaptions();
    }
    // Alt+S to force a capture now
    if (e.altKey && e.key.toLowerCase() === 's') {
        captureCurrentState();
        console.log('Manual capture triggered');
    }
    // Alt+R to reset auto-download flag (for testing)
    if (e.altKey && e.key.toLowerCase() === 'r') {
        autoDownloadTriggered = false;
        console.log('Auto-download flag reset');
    }
});

// Load saved interval and start
chrome.storage.local.get(['captureInterval'], (result) => {
    if (result.captureInterval) {
        captureIntervalMs = result.captureInterval;
    }
    startCapture(captureIntervalMs);
    setTimeout(() => {
        captureCurrentState();
        captionsPresent = checkCaptionsPresence();
        console.log(`Captions ${captionsPresent ? 'detected' : 'not detected'}`);
    }, 1000);
});

console.log('Teams Caption Extractor loaded.');
console.log('Press Alt+D to download, Alt+C to clear, Alt+S to force capture');
console.log('Auto-download enabled - will trigger when meeting ends');