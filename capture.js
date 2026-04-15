// Store messages with their unique IDs to prevent duplicates
let capturedMessages = new Map(); // uniqueId -> { author, text, timestamp }
let processedIds = new Set(); // Track which IDs we've already finalized

function normalize(text) {
    return text.replace(/\s+/g, " ").trim();
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
        
        // Store or update this message
        capturedMessages.set(uniqueId, {
            author,
            text,
            timestamp: now,
            container: container,
            uniqueId: uniqueId
        });
    });
}

function finalizeCompleteMessages() {
    const now = Date.now();
    const messagesToFinalize = [];
    
    capturedMessages.forEach((data, id) => {
        const { author, text, timestamp } = data;
        
        // Skip if already processed
        if (processedIds.has(id)) return;
        
        // Check if message is complete and stable (no updates for 3 seconds)
        const isStable = (now - timestamp) > 3000;
        const isCompleteMessage = isComplete(text);
        
        if (isStable && isCompleteMessage) {
            messagesToFinalize.push({ id, author, text });
            processedIds.add(id);
        }
    });
    
    // Sort by timestamp to maintain order
    messagesToFinalize.sort((a, b) => {
        const msgA = capturedMessages.get(a.id);
        const msgB = capturedMessages.get(b.id);
        return msgA.timestamp - msgB.timestamp;
    });
    
    // Output finalized messages
    messagesToFinalize.forEach(msg => {
        console.log(`${msg.author}\n${msg.text}`);
    });
    
    return messagesToFinalize;
}

function getAllFinalizedMessages() {
    const finalized = [];
    const sortedEntries = Array.from(capturedMessages.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    sortedEntries.forEach(([id, data]) => {
        if (processedIds.has(id) && isComplete(data.text)) {
            finalized.push({ author: data.author, text: data.text });
        }
    });
    
    return finalized;
}

function downloadFile() {
    // Force finalize any complete messages that haven't been processed yet
    const now = Date.now();
    capturedMessages.forEach((data, id) => {
        if (!processedIds.has(id) && isComplete(data.text)) {
            processedIds.add(id);
            console.log(`${data.author}\n${data.text}`);
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
    
    const content = deduped
        .map(msg => `${msg.author}\n${msg.text}`)
        .join('\n\n');
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const a = document.createElement('a');
    a.href = url;
    a.download = `teams_captions_${timestamp}.txt`;
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
    // Remove messages older than 30 minutes to prevent memory bloat
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutes
    
    capturedMessages.forEach((data, id) => {
        if (now - data.timestamp > maxAge) {
            capturedMessages.delete(id);
            processedIds.delete(id);
        }
    });
}

// Capture state every 10 seconds
setInterval(() => {
    captureCurrentState();
}, 10000);

// Finalize complete messages every 5 seconds
setInterval(() => {
    finalizeCompleteMessages();
}, 5000);

// Cleanup old messages every minute
setInterval(() => {
    cleanupOldMessages();
}, 60000);

// Initial capture
setTimeout(() => {
    captureCurrentState();
}, 1000);

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.altKey && e.key.toLowerCase() === 'd') {
        downloadFile();
    }
    if (e.altKey && e.key.toLowerCase() === 'c') {
        clearCaptions();
    }
    // Alt+S to force a capture now
    if (e.altKey && e.key.toLowerCase() === 's') {
        captureCurrentState();
        console.log('Manual capture triggered');
    }
});

console.log('Teams Caption Extractor loaded.');
console.log('Press Alt+D to download, Alt+C to clear, Alt+S to force capture');