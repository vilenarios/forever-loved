/**
 * Archive Routes
 * HTTP endpoints for archiving Lovable projects
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { runArchiver } = require('../services/archiver');
const { getManifestIDFromProjectID, getArchiveRecord } = require('../db/database');
const { config } = require('../config/config');
const { getHTMLHash } = require('../utils/hash');

const router = express.Router();

// Rate limiter: 5 requests per IP per 15 minutes
const archiveRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 requests per windowMs
    message: 'Too many archive requests from this IP, please try again after 15 minutes.',
    standardHeaders: true, // Return rate limit info in RateLimit-* headers
    legacyHeaders: false, // Disable X-RateLimit-* headers
});

// Concurrent request limiter: Max 3 simultaneous archive operations
let activeArchiveRequests = 0;
const MAX_CONCURRENT_ARCHIVES = 3;

const concurrentLimiter = async (req, res, next) => {
    // Atomic check-and-increment to prevent race condition
    if (activeArchiveRequests >= MAX_CONCURRENT_ARCHIVES) {
        return res.status(503).json({
            error: 'Server is currently processing the maximum number of archive requests. Please try again in a few moments.'
        });
    }
    activeArchiveRequests++;
    console.log(`[Concurrent] Active archive requests: ${activeArchiveRequests}/${MAX_CONCURRENT_ARCHIVES}`);

    // Ensure we decrement on BOTH finish and close events
    // 'finish' = successful response sent
    // 'close' = connection closed (timeout, client disconnect, etc.)
    let decremented = false;
    const decrementCounter = () => {
        if (!decremented) {
            decremented = true;
            activeArchiveRequests--;
            console.log(`[Concurrent] Active archive requests: ${activeArchiveRequests}/${MAX_CONCURRENT_ARCHIVES}`);
        }
    };

    res.on('finish', decrementCounter);
    res.on('close', decrementCounter);

    next();
};

/**
 * POST /
 * Main archival endpoint that validates, archives, and uploads Lovable projects
 */
router.post('/', archiveRateLimiter, concurrentLimiter, async (req, res) => {
    console.log('[Archive] Request received');

    const { url, force } = req.body;
    if (!url) {
        return res.status(400).send('Bad Request: The "url" property is required in the request body.');
    }

    const forceReArchive = force === true || force === 'true';
    if (forceReArchive) {
        console.log('[Archive] Force re-archive requested');
    }

    // Support both old and new Lovable URL formats
    // Old format: https://lovable.dev/projects/{uuid}
    // New format: https://{project-id}.lovable.app/
    const oldUrlRegex = /^https:\/\/lovable\.dev\/projects\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(\?.*)?$/i;
    const newUrlRegex = /^https:\/\/([a-z0-9-]+)\.lovable\.app\/?(\?.*)?$/i;

    let projectID;
    let isOldFormat = false;

    if (oldUrlRegex.test(url)) {
        // Old format: extract UUID from path
        isOldFormat = true;
        projectID = url.split("/projects/")[1].split("?")[0];
    } else if (newUrlRegex.test(url)) {
        // New format: extract subdomain as project ID
        const match = url.match(newUrlRegex);
        projectID = match[1];
    } else {
        return res.status(400).send('Bad Request: Invalid URL format. Expected "https://lovable.dev/projects/{uuid}" or "https://{project-id}.lovable.app/".');
    }

    try {
        // Cache check with HTML hash comparison (unless force=true)
        if (!forceReArchive) {
            const archiveRecord = await getArchiveRecord(projectID);
            if (archiveRecord) {
                console.log(`[Archive] Found existing archive for ${projectID}`);

                // If we have a hash, check if the project has changed
                if (archiveRecord.html_hash) {
                    console.log(`[Archive] Checking if project has changed...`);
                    try {
                        const currentHash = await getHTMLHash(url);
                        if (currentHash && currentHash === archiveRecord.html_hash) {
                            console.log(`[Archive] Project unchanged (hash match). Returning cached archive.`);
                            const manifestUrl = `https://arweave.net/${archiveRecord.manifest_id}`;
                            return res.status(200).json({
                                success: true,
                                cached: true,
                                projectId: projectID,
                                manifestId: archiveRecord.manifest_id,
                                manifestUrl: manifestUrl,
                                arnsUrl: archiveRecord.arns_url || null
                            });
                        } else if (currentHash) {
                            console.log(`[Archive] Project has changed (hash mismatch). Re-archiving...`);
                        } else {
                            console.warn(`[Archive] Could not compute current hash. Re-archiving to be safe...`);
                        }
                    } catch (hashError) {
                        console.warn(`[Archive] Hash comparison failed:`, hashError.message);
                        console.warn(`[Archive] Re-archiving to be safe...`);
                    }
                } else {
                    // No hash stored - return cached archive anyway (backward compatibility)
                    console.log(`[Archive] No hash stored for existing archive. Returning cached version.`);
                    const manifestUrl = `https://arweave.net/${archiveRecord.manifest_id}`;
                    return res.status(200).json({
                        success: true,
                        cached: true,
                        projectId: projectID,
                        manifestId: archiveRecord.manifest_id,
                        manifestUrl: manifestUrl,
                        arnsUrl: archiveRecord.arns_url || null
                    });
                }
            }
        }

        console.log(`[Archive] Creating new archive for ${projectID}...`);

        // Execute the full archival and upload process
        const result = await runArchiver(url, projectID, isOldFormat);
        const manifestUrl = `https://arweave.net/${result.manifestId}`;

        res.status(200).json({
            success: true,
            projectId: projectID,
            manifestId: result.manifestId,
            manifestUrl: manifestUrl,
            arnsUrl: result.arnsInfo?.arnsUrl || null,
            arnsTxId: result.arnsInfo?.txId || null
        });

    } catch (error) {
        console.error(`[Archive] Critical error for project ${projectID}:`, error);

        // If error occurred after mapping was saved, return success
        const archiveRecord = await getArchiveRecord(projectID);
        if (archiveRecord) {
            console.warn(`[Archive] Error occurred, but DB mapping for ${projectID} exists. Returning success response.`);

            const manifestUrl = `https://arweave.net/${archiveRecord.manifest_id}`;

            return res.status(200).json({
                success: true,
                projectId: projectID,
                manifestId: archiveRecord.manifest_id,
                manifestUrl: manifestUrl,
                arnsUrl: archiveRecord.arns_url || null
            });
        }

        // Return specific error strings
        if (error.message === 'archiveerror') {
            res.status(500).send('Failed to retrieve the page for archival, chances are Lovable blocked our connection, please try again in a few seconds.');
        } else if (error.message === 'arerror') {
            res.status(500).send('Error with ARWeave/Turbo');
        } else {
            res.status(500).send('Internal Server Error: An unknown error occurred during archiving.');
        }
    }
});

/**
 * GET /health
 * Health check endpoint with archive metrics
 */
router.get('/health', async (req, res) => {
    try {
        const { getDatabaseStats } = require('../db/database');

        // Get database stats
        const dbStats = await getDatabaseStats();

        res.status(200).json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            metrics: {
                totalArchives: dbStats.total_archives || 0,
                failedArchives: dbStats.failed_archives || 0,
                lastArchive: dbStats.last_archive,
                totalSizeArchivedMB: dbStats.total_size_mb ? parseFloat(dbStats.total_size_mb.toFixed(2)) : 0,
                averageArchiveTimeSeconds: dbStats.avg_archive_time_seconds ? parseFloat(dbStats.avg_archive_time_seconds.toFixed(1)) : null
            },
            config: {
                arnsName: config.arns.name,
                uptimeHours: parseFloat((process.uptime() / 3600).toFixed(2))
            }
        });
    } catch (error) {
        console.error('[Health] Error generating metrics:', error);
        res.status(200).json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            error: 'Could not fetch metrics'
        });
    }
});

module.exports = router;
