/**
 * Arweave Service
 * Handles file uploads to Arweave using Turbo SDK
 */

const fs = require('fs');
const { ArweaveSigner, TurboFactory } = require('@ardrive/turbo-sdk');
const { loadArweaveKeyfile } = require('../config/config');

/**
 * Upload a folder to Arweave and return the manifest ID
 */
async function uploadFolderToArweave(folderPath, projectID, htmlHash = null) {
    console.log(`[Arweave] Uploading files from: ${folderPath} to Arweave...`);

    try {
        const keyFile = loadArweaveKeyfile();
        const signer = new ArweaveSigner(keyFile);
        const turbo = TurboFactory.authenticated({ signer });

        // Prepare custom tags for the upload (Turbo SDK handles Content-Type automatically)
        const customTags = [
            { name: 'App-Name', value: 'ForeverLoved' },
            { name: 'App-Version', value: '1.0.0' },
            { name: 'Project-Type', value: 'Lovable' },
            { name: 'Project-ID', value: projectID }
        ];

        // Add HTML hash tag if available
        if (htmlHash) {
            customTags.push({ name: 'HTML-Hash', value: htmlHash });
            console.log(`[Arweave] Adding HTML-Hash tag: ${htmlHash.substring(0, 16)}...`);
        }

        const uploadResult = await turbo.uploadFolder({
            folderPath: folderPath,
            manifestOptions: {
                indexFile: "index.html",
                fallbackFile: "index.html" // SPA support
            },
            dataItemOpts: {
                tags: customTags
            }
        });

        const manifestId = uploadResult?.manifestResponse?.id;
        if (!manifestId) {
            throw new Error("Upload succeeded but manifest ID was not found in response.");
        }

        console.log(`[Arweave] Folder uploaded successfully. Manifest ID: ${manifestId}`);
        console.log(`[Arweave] Tags: ${customTags.map(t => `${t.name}=${t.value}`).join(', ')}`);
        return manifestId;

    } catch (error) {
        console.error('[Arweave] Error uploading folder:', error);
        throw error;
    } finally {
        // Clean up temporary folder
        if (fs.existsSync(folderPath)) {
            fs.rmSync(folderPath, { recursive: true, force: true });
            console.log(`[Arweave] Cleaned up temporary folder: ${folderPath}`);
        }
    }
}

module.exports = {
    uploadFolderToArweave
};
