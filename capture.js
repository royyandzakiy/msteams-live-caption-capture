// Track what we've already saved to avoid duplicates
let savedHashes = new Set();

const observer = new MutationObserver(() => {
    const elements = document.querySelectorAll('[data-tid="closed-caption-text"]');
    elements.forEach(el => {
        const text = el.textContent;
        const author = el.closest('.fui-ChatMessageCompact')?.querySelector('[data-tid="author"]')?.textContent || 'Unknown';
        const timestamp = new Date().toLocaleTimeString();
        
        // Create a unique hash for this caption
        const hash = `${timestamp}-${text}`;
        
        if (!savedHashes.has(hash)) {
            savedHashes.add(hash);
            
            // Get existing captions, add new one, save back
            chrome.storage.local.get(['captions'], (result) => {
                const existing = result.captions || [];
                existing.push({ author, text, timestamp });
                chrome.storage.local.set({ captions: existing });
            });
        }
    });
});

observer.observe(document.body, { childList: true, subtree: true });