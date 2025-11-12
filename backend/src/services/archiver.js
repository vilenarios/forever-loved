/**
 * Archiver Service
 * Orchestrates the entire archival process: scraping, uploading, and ArNS assignment
 */

const { directScrape } = require('./scraper');
const { uploadFolderToArweave } = require('./arweave');
const { setArNSUndername } = require('./arns');
const { saveMappingToDB } = require('../db/database');
const { getHTMLHash } = require('../utils/hash');

/**
 * Orchestrates the entire archival process for a Lovable project
 */
async function runArchiver(targetUrl, projectID, isOldFormat) {
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
        throw new Error('archiveerror');
    }

    // STEP 2: Upload to Arweave with custom tags (including hash)
    console.log(`[Archiver] Uploading to Arweave...`);
    let manifestId;
    try {
        manifestId = await uploadFolderToArweave(downloadFolder, projectID, htmlHash);
    } catch (error) {
        console.error(`[Archiver] Arweave upload failed for ${projectID}:`, error);
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

    // STEP 4: Save to database with HTML hash and ArNS URL
    console.log(`[Archiver] Saving mapping to database...`);
    try {
        const arnsUrl = arnsInfo?.arnsUrl || null;
        await saveMappingToDB(projectID, manifestId, htmlHash, arnsUrl);
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
