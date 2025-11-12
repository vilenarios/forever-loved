/**
 * HTML Hash Utility
 * Computes SHA-256 hash of homepage HTML for version detection
 */

const crypto = require('crypto');
const https = require('https');
const http = require('http');

/**
 * Fetch HTML content from a URL
 */
function fetchHTML(url) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;

        const request = protocol.get(url, {
            headers: {
                'User-Agent': 'ForeverLoved-Archiver/1.0'
            },
            timeout: 10000 // 10 second timeout
        }, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode} when fetching ${url}`));
                return;
            }

            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                resolve(data);
            });
        });

        request.on('error', (err) => {
            reject(err);
        });

        request.on('timeout', () => {
            request.destroy();
            reject(new Error('Request timeout when fetching HTML'));
        });
    });
}

/**
 * Compute SHA-256 hash of a string
 */
function computeHash(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Fetch homepage HTML and compute its hash
 * Returns null on error (graceful degradation)
 */
async function getHTMLHash(url) {
    try {
        console.log(`[Hash] Fetching HTML from ${url}...`);
        const html = await fetchHTML(url);

        // Normalize HTML (remove dynamic timestamps, etc.) - optional optimization
        // For now, hash the raw HTML
        const hash = computeHash(html);

        console.log(`[Hash] Computed hash: ${hash.substring(0, 16)}...`);
        return hash;
    } catch (error) {
        console.warn(`[Hash] Failed to compute HTML hash for ${url}:`, error.message);
        console.warn(`[Hash] Continuing without hash (cache check disabled for this request)`);
        return null;
    }
}

module.exports = {
    getHTMLHash,
    computeHash
};
