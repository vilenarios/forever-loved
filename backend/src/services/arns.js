/**
 * ArNS Service
 * Handles ArNS undername assignment
 */

const { ArweaveSigner } = require('@ardrive/turbo-sdk');
const { ARIO, ANT } = require('@ar.io/sdk');
const { config, loadArNSWallet } = require('../config/config');

// Initialize AR.IO SDK
const ario = ARIO.mainnet();
let antInstance = null; // Cache for the ANT instance

/**
 * Get the ANT instance for the configured ArNS name (cached)
 */
async function getANT() {
    if (!antInstance) {
        console.log(`[ArNS] Getting ANT processId for "${config.arns.name}"...`);

        try {
            // Get the ArNS record which contains the ANT processId
            const arnsRecord = await ario.getArNSRecord({ name: config.arns.name });
            const processId = arnsRecord.processId;

            console.log(`[ArNS] Found ANT processId: ${processId}`);

            // Initialize ANT with the signer
            const wallet = loadArNSWallet();
            if (!wallet) {
                throw new Error('ArNS wallet not loaded');
            }

            const signer = new ArweaveSigner(wallet);
            antInstance = ANT.init({
                processId: processId,
                signer: signer
            });

            console.log(`[ArNS] ANT instance initialized for "${config.arns.name}"`);
        } catch (error) {
            console.error(`[ArNS] Failed to initialize ANT:`, error);
            throw error;
        }
    }
    return antInstance;
}

/**
 * Sets an ArNS undername pointing to the given manifestId
 * Format: {projectID}_forever-loved -> manifestId
 */
async function setArNSUndername(projectID, manifestId) {
    // Skip if wallet isn't loaded
    const wallet = loadArNSWallet();
    if (!wallet) {
        console.log(`[ArNS] Skipping undername assignment (wallet not loaded)`);
        return null;
    }

    try {
        console.log(`[ArNS] Setting undername for ${projectID}...`);

        const ant = await getANT();

        // Undername is just the projectID (ANT automatically handles the base name)
        const undername = projectID;

        // Validate length (max 63 chars including _arnsName)
        const fullName = `${undername}_${config.arns.name}`;
        if (fullName.length > 63) {
            throw new Error(`Undername too long: ${fullName.length} chars (max 63)`);
        }

        console.log(`[ArNS] Setting undername: ${undername} (will be ${fullName}.ar.io) -> ${manifestId}`);
        console.log(`[ArNS] TTL: ${config.arns.ttl} seconds`);

        // Set the record with configured TTL
        const result = await ant.setRecord({
            undername: undername,
            transactionId: manifestId,
            ttlSeconds: config.arns.ttl
        });

        const arnsUrl = `https://${fullName}.ar.io`;

        console.log(`[ArNS] Undername set successfully!`);
        console.log(`[ArNS] Transaction ID: ${result.id}`);
        console.log(`[ArNS] Access at: ${arnsUrl}`);

        return {
            undername: fullName,
            arnsUrl: arnsUrl,
            txId: result.id
        };

    } catch (error) {
        console.error('[ArNS] Failed to set undername:', error);
        // Don't throw - we don't want ArNS failures to break the archive process
        return null;
    }
}

module.exports = {
    setArNSUndername
};
