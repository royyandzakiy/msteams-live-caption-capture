// capture.js

let lastPrinted = new Set();

function getTimestamp() {
    return new Date().toLocaleTimeString();
}

function captureCaptions() {
    const elements = document.querySelectorAll('[data-tid="closed-caption-text"]');
    const current = new Set();

    elements.forEach(el => {
        const text = el.textContent?.trim();
        if (!text) return;

        const author = el
            .closest('.fui-ChatMessageCompact')
            ?.querySelector('[data-tid="author"]')
            ?.textContent || 'Unknown';

        const key = `${author}:${text}`;
        current.add(key);

        // Only print if NOT seen in previous cycle
        if (!lastPrinted.has(key)) {
            const timestamp = getTimestamp();
            console.log(`[${timestamp}] ${author}: ${text}`);
        }
    });

    // Replace previous snapshot (NOT accumulate forever)
    lastPrinted = current;
}

// Poll faster for smoother capture
setInterval(captureCaptions, 500);