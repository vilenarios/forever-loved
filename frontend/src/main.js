/**
 * Forever Loved - Frontend Application
 * Pixel-perfect Figma implementation
 */

// API endpoint - uses environment variable in production, localhost in development
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3420';

// DOM elements - Sections
const heroSection = document.getElementById('heroSection');
const doneSection = document.getElementById('doneSection');
const loadingOverlay = document.getElementById('loadingOverlay');

// DOM elements - Form
const archiveForm = document.getElementById('archiveForm');
const projectUrl = document.getElementById('projectUrl');
const foreverBtn = document.getElementById('foreverBtn');

// DOM elements - Result display
const archivedUrl = document.getElementById('archivedUrl');
const archivedUrlLink = document.getElementById('archivedUrlLink');
const viewSiteBtn = document.getElementById('viewSiteBtn');
const newProjectBtn = document.getElementById('newProjectBtn');
const shareBtn = document.getElementById('shareBtn');
const reArchiveBtn = document.getElementById('reArchiveBtn');

/**
 * State management
 */
let currentArchivedUrl = '';
let currentManifestId = '';
let currentOriginalUrl = '';

/**
 * Handle form submission
 */
archiveForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const url = projectUrl.value.trim();

    // Validate URL format - support both old and new Lovable formats
    // Old format: https://lovable.dev/projects/{uuid}
    // New format: https://{project-id}.lovable.app/
    const oldUrlRegex = /^https:\/\/lovable\.dev\/projects\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(\?.*)?$/i;
    const newUrlRegex = /^https:\/\/[a-z0-9-]+\.lovable\.app\/?(\?.*)?$/i;

    if (!oldUrlRegex.test(url) && !newUrlRegex.test(url)) {
        alert('Invalid URL format. Please enter a valid Lovable project URL (either lovable.dev/projects/{uuid} or {project}.lovable.app).');
        return;
    }

    // Store the original URL
    currentOriginalUrl = url;

    // Start archiving process
    await archiveProject(url);
});

/**
 * Archive project - Main API call
 */
async function archiveProject(url, forceReArchive = false) {
    try {
        // Show loading state
        showLoading();

        const requestBody = { url };

        // Add force parameter if requested
        if (forceReArchive) {
            requestBody.force = true;
        }

        let response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        // Retry once on 502
        if (response.status === 502) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
        }

        if (response.ok) {
            // Parse JSON response
            const data = await response.json();

            // Store results
            currentArchivedUrl = data.arnsUrl || data.manifestUrl || '';
            currentManifestId = data.manifestId || '';

            // Show success state
            showSuccess(data);

        } else {
            // Handle error response
            const errorText = await response.text();
            if (response.status >= 400 && response.status < 500) {
                showError(`Error: ${errorText}`);
            } else {
                showError('Failed to retrieve the page for archival. The service might be temporarily unavailable. Please try again in a few seconds.');
            }
        }

    } catch (error) {
        showError(`Network error: ${error.message}. Please check your connection and try again.`);
    }
}

/**
 * Show loading state
 */
function showLoading() {
    heroSection.style.display = 'none';
    doneSection.style.display = 'none';
    loadingOverlay.style.display = 'flex';

    // Scroll to top so user can see the loading state
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Show success state
 */
function showSuccess(data) {
    loadingOverlay.style.display = 'none';
    heroSection.style.display = 'none';

    // Update URL display
    const displayUrl = data.arnsUrl || data.manifestUrl || 'URL not available';
    archivedUrl.textContent = displayUrl;
    archivedUrlLink.href = displayUrl;

    // Show done section
    doneSection.style.display = 'flex';

    // Scroll to top smoothly
    window.scrollTo({ top: 0, behavior: 'smooth' });

    console.log(`[Forever Loved] Archive successful:`, data);
}

/**
 * Show error state
 */
function showError(message) {
    loadingOverlay.style.display = 'none';
    alert(message);

    // Return to hero section
    heroSection.style.display = 'flex';
    doneSection.style.display = 'none';
}

/**
 * View site button - Copy link to clipboard
 */
viewSiteBtn.addEventListener('click', async () => {
    if (!currentArchivedUrl) return;

    try {
        await navigator.clipboard.writeText(currentArchivedUrl);

        // Visual feedback
        const originalText = viewSiteBtn.textContent;
        viewSiteBtn.textContent = 'Copied!';

        setTimeout(() => {
            viewSiteBtn.textContent = originalText;
        }, 2000);

    } catch (err) {
        console.error('Failed to copy:', err);
        alert('Failed to copy to clipboard. Please copy manually.');
    }
});

/**
 * Store another project - Reset to home
 */
newProjectBtn.addEventListener('click', () => {
    // Reset form
    projectUrl.value = '';
    currentArchivedUrl = '';
    currentManifestId = '';
    currentOriginalUrl = '';

    // Hide done section, show hero section
    doneSection.style.display = 'none';
    heroSection.style.display = 'flex';

    // Scroll to top smoothly
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Focus input
    setTimeout(() => {
        projectUrl.focus();
    }, 300);
});

/**
 * Share with friends - Open native share or copy to clipboard
 */
shareBtn.addEventListener('click', async () => {
    if (!currentArchivedUrl) return;

    const shareData = {
        title: 'Forever Loved - Check out my archived project!',
        text: 'I permanently archived my Lovable project on the Permanent Cloud:',
        url: currentArchivedUrl
    };

    // Try native share API first (mobile-friendly)
    if (navigator.share) {
        try {
            await navigator.share(shareData);
            console.log('[Forever Loved] Shared successfully');
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Share failed:', err);
            }
        }
    } else {
        // Fallback: Copy to clipboard
        try {
            await navigator.clipboard.writeText(currentArchivedUrl);

            // Visual feedback
            const originalText = shareBtn.textContent;
            shareBtn.textContent = 'Link copied!';

            setTimeout(() => {
                shareBtn.textContent = originalText;
            }, 2000);

        } catch (err) {
            console.error('Failed to copy:', err);
            alert('Failed to copy to clipboard. Please copy manually.');
        }
    }
});

/**
 * Re-archive project - Force re-archiving of already archived project
 */
reArchiveBtn.addEventListener('click', async () => {
    if (!currentOriginalUrl) return;

    // Confirm with user
    const confirmed = confirm('This will create a fresh archive of your project. The current archive will remain accessible. Continue?');

    if (confirmed) {
        // Re-archive with force flag
        await archiveProject(currentOriginalUrl, true);
    }
});

/**
 * Initialize app
 */
function init() {
    console.log(`[Forever Loved] Frontend initialized`);
    console.log(`[Forever Loved] API URL: ${API_URL}`);

    // Ensure correct initial state
    heroSection.style.display = 'flex';
    doneSection.style.display = 'none';
    loadingOverlay.style.display = 'none';

    // Log font loading for debugging
    document.fonts.ready.then(() => {
        console.log('[Forever Loved] Fonts loaded successfully');
    });
}

// Run initialization when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
