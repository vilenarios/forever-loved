/**
 * Configuration Module
 * Loads and validates environment variables
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const config = {
    // Server
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',

    // CORS
    corsOrigin: process.env.CORS_ORIGIN || '*',

    // Internet Archive (legacy/fallback - currently disabled)
    ia: {
        accessKey: process.env.IA_ACCESS_KEY || '',
        secretKey: process.env.IA_SECRET_KEY || '',
        proxyUrl: process.env.PROXY_URL || ''
    },

    // Arweave Upload Wallet (required)
    arweave: {
        keyfilePath: process.env.ARWEAVE_WALLET_PATH || null,
        keyfile: null // Will be loaded lazily
    },

    // ArNS Wallet (optional - for setting undernames)
    arns: {
        walletPath: process.env.ARNS_WALLET_PATH || null,
        wallet: null, // Will be loaded lazily
        name: process.env.ARNS_NAME || 'forever-loved',
        ttl: parseInt(process.env.ARNS_TTL || '60', 10) // TTL in seconds
    },

    // Database
    db: {
        path: process.env.DB_PATH || path.resolve(__dirname, '../../../archives.db')
    },

    // Scraping
    scraping: {
        mode: process.env.SCRAPING_MODE || 'direct',
        maxRoutes: 50,
        timeouts: {
            homepage: 500,   // Wait for pages without charts (networkidle2 handles loading)
            route: 200,      // Wait for routes without charts (networkidle2 handles loading)
            final: 0         // No wait needed after all routes visited
        }
    }
};

// Load Arweave keyfile
function loadArweaveKeyfile() {
    if (!config.arweave.keyfilePath) {
        throw new Error('ARWEAVE_WALLET_PATH not configured in .env file');
    }

    if (!fs.existsSync(config.arweave.keyfilePath)) {
        throw new Error(`Arweave wallet not found at: ${config.arweave.keyfilePath}`);
    }

    if (!config.arweave.keyfile) {
        config.arweave.keyfile = JSON.parse(
            fs.readFileSync(config.arweave.keyfilePath, 'utf-8')
        );
        console.log(`[Config] Loaded Arweave keyfile from: ${config.arweave.keyfilePath}`);
    }

    return config.arweave.keyfile;
}

// Load ArNS wallet
function loadArNSWallet() {
    if (!config.arns.walletPath) {
        console.log('[Config] ARNS_WALLET_PATH not configured - ArNS features disabled');
        return null;
    }

    if (!fs.existsSync(config.arns.walletPath)) {
        console.warn(`[Config] ArNS wallet not found at: ${config.arns.walletPath}`);
        return null;
    }

    if (!config.arns.wallet) {
        config.arns.wallet = JSON.parse(
            fs.readFileSync(config.arns.walletPath, 'utf-8')
        );
        console.log(`[Config] Loaded ArNS wallet from: ${config.arns.walletPath}`);
    }

    return config.arns.wallet;
}

module.exports = {
    config,
    loadArweaveKeyfile,
    loadArNSWallet
};
