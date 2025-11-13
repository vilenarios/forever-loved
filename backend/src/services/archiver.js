/**
 * Archiver Service
 * Orchestrates the entire archival process: scraping, uploading, and ArNS assignment
 */

const { directScrape } = require('./scraper');
const { uploadFolderToArweave } = require('./arweave');
const { setArNSUndername } = require('./arns');
const { saveMappingToDB, logFailedArchive } = require('../db/database');
const { getHTMLHash } = require('../utils/hash');
const fs = require('fs');
const path = require('path');

/**
 * Calculate folder size recursively
 */
function getFolderSize(folderPath) {
    let totalSize = 0;

    function walkDir(dir) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
                walkDir(filePath);
            } else {
                totalSize += stat.size;
            }
        }
    }

    try {
        walkDir(folderPath);
        return totalSize / (1024 * 1024); // Convert to MB
    } catch (error) {
        console.warn('[Archiver] Could not calculate folder size:', error);
        return null;
    }
}

/**
 * Orchestrates the entire archival process for a Lovable project
 */
async function runArchiver(targetUrl, projectID, isOldFormat) {
    const startTime = Date.now();
    // For old format, construct the preview URL
    // For new format, the URL is already in the correct format
    const urlToArchive = isOldFormat
        ? `https://id-preview--${projectID}.lovable.app/`
        : targetUrl;

    // STEP 0: Compute HTML hash for version detection
    console.log(`[Archiver] Computing HTML hash for ${urlToArchive}...`);
    let htmlHash = null;
    try {
        htmlHash = await getHTMLHash(urlToArchive);
    } catch (error) {
        console.warn(`[Archiver] Hash computation failed, continuing without hash:`, error);
        // Continue - hash is optional for cache detection
    }

    // STEP 1: Scrape the project
    console.log(`[Archiver] Starting direct scraping for ${urlToArchive}`);
    let downloadFolder;
    try {
        downloadFolder = await directScrape(urlToArchive, projectID);
    } catch (error) {
        console.error(`[Archiver] Scraping failed for ${projectID}:`, error);
        const elapsedSeconds = (Date.now() - startTime) / 1000;
        // Log failure to database
        try {
            await logFailedArchive(projectID, htmlHash, elapsedSeconds);
        } catch (dbError) {
            console.warn('[Archiver] Could not log failure to database:', dbError);
        }
        throw new Error('archiveerror');
    }

    // Calculate archive size
    const archiveSizeMB = getFolderSize(downloadFolder);
    if (archiveSizeMB) {
        console.log(`[Archiver] Archive size: ${archiveSizeMB.toFixed(2)} MB`);
    }

    // STEP 2: Upload to Arweave with custom tags (including hash)
    console.log(`[Archiver] Uploading to Arweave...`);
    let manifestId;
    try {
        manifestId = await uploadFolderToArweave(downloadFolder, projectID, htmlHash);
    } catch (error) {
        console.error(`[Archiver] Arweave upload failed for ${projectID}:`, error);
        const elapsedSeconds = (Date.now() - startTime) / 1000;
        // Log failure to database
        try {
            await logFailedArchive(projectID, htmlHash, elapsedSeconds);
        } catch (dbError) {
            console.warn('[Archiver] Could not log failure to database:', dbError);
        }
        throw new Error('arerror');
    }

    // STEP 3: Set ArNS undername (before database save so we can store the URL)
    console.log(`[Archiver] Setting ArNS undername...`);
    let arnsInfo = null;
    try {
        arnsInfo = await setArNSUndername(projectID, manifestId);
    } catch (error) {
        console.warn(`[Archiver] ArNS undername assignment failed, but archive succeeded:`, error);
    }

    // STEP 4: Save to database with HTML hash, ArNS URL, size, and time
    console.log(`[Archiver] Saving mapping to database...`);
    const elapsedSeconds = (Date.now() - startTime) / 1000;
    console.log(`[Archiver] Total archive time: ${elapsedSeconds.toFixed(1)}s`);

    try {
        const arnsUrl = arnsInfo?.arnsUrl || null;
        await saveMappingToDB(projectID, manifestId, htmlHash, arnsUrl, archiveSizeMB, elapsedSeconds);
    } catch (error) {
        console.error(`[Archiver] Database save failed for ${projectID}:`, error);
        // Don't throw - the archive succeeded even if DB save failed
    }

    console.log(`[Archiver] Archive complete for ${projectID}!`);
    return { manifestId, arnsInfo, htmlHash };
}

module.exports = {
    runArchiver
};
