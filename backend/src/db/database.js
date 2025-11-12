/**
 * Database Module
 * Handles all SQLite database operations
 */

const sqlite3 = require('sqlite3').verbose();
const { config } = require('../config/config');

let db = null;

/**
 * Initialize SQLite database connection
 */
function initDatabase() {
    return new Promise((resolve, reject) => {
        db = new sqlite3.Database(config.db.path, (err) => {
            if (err) {
                console.error('[Database] Error opening database:', err);
                reject(err);
            } else {
                console.log(`[Database] Connected to SQLite database at ${config.db.path}`);

                // Create table if it doesn't exist
                db.run(`CREATE TABLE IF NOT EXISTS archives (
                    project_id TEXT PRIMARY KEY,
                    manifest_id TEXT NOT NULL,
                    html_hash TEXT,
                    arns_url TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        console.log('[Database] Archives table ready');

                        // Add html_hash column if it doesn't exist (for existing databases)
                        db.run(`ALTER TABLE archives ADD COLUMN html_hash TEXT`, (hashErr) => {
                            // Ignore error if column already exists
                            if (hashErr && !hashErr.message.includes('duplicate column')) {
                                console.warn('[Database] Could not add html_hash column:', hashErr.message);
                            } else if (!hashErr) {
                                console.log('[Database] Added html_hash column to existing table');
                            }

                            // Add arns_url column if it doesn't exist (for existing databases)
                            db.run(`ALTER TABLE archives ADD COLUMN arns_url TEXT`, (arnsErr) => {
                                // Ignore error if column already exists
                                if (arnsErr && !arnsErr.message.includes('duplicate column')) {
                                    console.warn('[Database] Could not add arns_url column:', arnsErr.message);
                                } else if (!arnsErr) {
                                    console.log('[Database] Added arns_url column to existing table');
                                }
                                resolve();
                            });
                        });
                    }
                });
            }
        });
    });
}

/**
 * Save projectID -> manifestID mapping to database with optional HTML hash and ArNS URL
 */
function saveMappingToDB(projectID, manifestId, htmlHash = null, arnsUrl = null) {
    return new Promise((resolve, reject) => {
        console.log(`[Database] Saving mapping: ${projectID} -> ${manifestId}${htmlHash ? ` (hash: ${htmlHash.substring(0, 8)}...)` : ''}${arnsUrl ? ` (ArNS: ${arnsUrl})` : ''}`);
        db.run(
            'INSERT OR REPLACE INTO archives (project_id, manifest_id, html_hash, arns_url) VALUES (?, ?, ?, ?)',
            [projectID, manifestId, htmlHash, arnsUrl],
            (err) => {
                if (err) {
                    console.error('[Database] Error saving mapping:', err);
                    reject(err);
                } else {
                    console.log('[Database] Successfully saved mapping');
                    resolve();
                }
            }
        );
    });
}

/**
 * Get archive record for a given projectID (includes manifestID, hash, and ArNS URL)
 */
function getArchiveRecord(projectID) {
    return new Promise((resolve, reject) => {
        db.get('SELECT manifest_id, html_hash, arns_url FROM archives WHERE project_id = ?', [projectID], (err, row) => {
            if (err) {
                console.error(`[Database] Failed to check database for project ${projectID}:`, err);
                reject(err);
            } else {
                resolve(row || null);
            }
        });
    });
}

/**
 * Get manifestID for a given projectID (backwards compatibility)
 */
function getManifestIDFromProjectID(projectID) {
    return getArchiveRecord(projectID).then(record => record ? record.manifest_id : null);
}

/**
 * Close database connection gracefully
 */
function closeDatabase() {
    return new Promise((resolve) => {
        if (db) {
            db.close(() => {
                console.log('[Database] Database connection closed');
                resolve();
            });
        } else {
            resolve();
        }
    });
}

module.exports = {
    initDatabase,
    saveMappingToDB,
    getManifestIDFromProjectID,
    getArchiveRecord,
    closeDatabase
};
