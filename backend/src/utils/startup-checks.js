/**
 * Startup Validation Checks
 * Validates environment and configuration before server starts
 */

const fs = require('fs');
const path = require('path');

function validateEnvironment() {
    const errors = [];
    const warnings = [];

    // Check for Arweave keyfile
    const rootDir = path.resolve(__dirname, '../../../');
    const files = fs.readdirSync(rootDir);
    const keyfile = files.find(f => f.startsWith('arweave-keyfile-') && f.endsWith('.json'));

    if (!keyfile) {
        errors.push('Arweave keyfile not found. Place arweave-keyfile-*.json in project root.');
    }

    // Check for .env file
    const backendEnvPath = path.join(__dirname, '../../.env');
    const rootEnvPath = path.join(rootDir, '.env');

    if (!fs.existsSync(backendEnvPath) && !fs.existsSync(rootEnvPath)) {
        warnings.push('.env file not found. Using default configuration.');
    }

    // Check ArNS wallet (optional)
    const arnsWalletPath = process.env.ARNS_WALLET_PATH;
    if (arnsWalletPath && !fs.existsSync(arnsWalletPath)) {
        warnings.push(`ArNS wallet not found at ${arnsWalletPath}. ArNS features will be disabled.`);
    }

    // Display results
    if (warnings.length > 0) {
        console.warn('⚠️  Startup Warnings:');
        warnings.forEach(w => console.warn(`   - ${w}`));
    }

    if (errors.length > 0) {
        console.error('❌ Startup Errors:');
        errors.forEach(e => console.error(`   - ${e}`));
        console.error('\n💡 Tip: See README.md for setup instructions.\n');
        return false;
    }

    console.log('✅ Environment validation passed');
    return true;
}

module.exports = {
    validateEnvironment
};
