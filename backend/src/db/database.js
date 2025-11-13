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

                        // Migration: Add new columns if they don't exist (safe for existing databases)
                        const migrations = [
                            { name: 'html_hash', sql: 'ALTER TABLE archives ADD COLUMN html_hash TEXT' },
                            { name: 'arns_url', sql: 'ALTER TABLE archives ADD COLUMN arns_url TEXT' },
                            { name: 'archive_size_mb', sql: 'ALTER TABLE archives ADD COLUMN archive_size_mb REAL' },
                            { name: 'archive_time_seconds', sql: 'ALTER TABLE archives ADD COLUMN archive_time_seconds REAL' },
                            { name: 'status', sql: 'ALTER TABLE archives ADD COLUMN status TEXT DEFAULT "success"' }
                        ];

                        let completed = 0;
                        const runMigration = (index) => {
                            if (index >= migrations.length) {
                                resolve();
                                return;
                            }

                            const migration = migrations[index];
                            db.run(migration.sql, (err) => {
                                if (err && !err.message.includes('duplicate column')) {
                                    console.warn(`[Database] Could not add ${migration.name} column:`, err.message);
                                } else if (!err) {
                                    console.log(`[Database] Added ${migration.name} column`);
                                }
                                runMigration(index + 1);
                            });
                        };

                        runMigration(0);
                    }
                });
            }
        });
    });
}

/**
 * Save successful archive to database
 */
function saveMappingToDB(projectID, manifestId, htmlHash = null, arnsUrl = null, archiveSizeMB = null, archiveTimeSeconds = null) {
    return new Promise((resolve, reject) => {
        console.log(`[Database] Saving mapping: ${projectID} -> ${manifestId}${htmlHash ? ` (hash: ${htmlHash.substring(0, 8)}...)` : ''}${arnsUrl ? ` (ArNS: ${arnsUrl})` : ''}${archiveSizeMB ? ` (${archiveSizeMB.toFixed(2)} MB)` : ''}${archiveTimeSeconds ? ` (${archiveTimeSeconds.toFixed(1)}s)` : ''}`);
        db.run(
            `INSERT OR REPLACE INTO archives
             (project_id, manifest_id, html_hash, arns_url, archive_size_mb, archive_time_seconds, status)
             VALUES (?, ?, ?, ?, ?, ?, 'success')`,
            [projectID, manifestId, htmlHash, arnsUrl, archiveSizeMB, archiveTimeSeconds],
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
 * Log failed archive attempt
 */
function logFailedArchive(projectID, htmlHash = null, archiveTimeSeconds = null) {
    return new Promise((resolve, reject) => {
        console.log(`[Database] Logging failed archive: ${projectID}`);
        db.run(
            `INSERT OR REPLACE INTO archives
             (project_id, manifest_id, html_hash, archive_time_seconds, status)
             VALUES (?, 'failed', ?, ?, 'failed')`,
            [projectID, htmlHash, archiveTimeSeconds],
            (err) => {
                if (err) {
                    console.error('[Database] Error logging failure:', err);
                    reject(err);
                } else {
                    console.log('[Database] Logged failed archive');
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
 * Get database statistics
 */
function getDatabaseStats() {
    return new Promise((resolve, reject) => {
        db.get(`
            SELECT
                COUNT(CASE WHEN status = 'success' THEN 1 END) as total_archives,
                COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_archives,
                MAX(CASE WHEN status = 'success' THEN created_at END) as last_archive,
                SUM(CASE WHEN status = 'success' THEN archive_size_mb ELSE 0 END) as total_size_mb,
                AVG(CASE WHEN status = 'success' THEN archive_time_seconds END) as avg_archive_time_seconds
            FROM archives
        `, (err, row) => {
            if (err) {
                console.error('[Database] Failed to get stats:', err);
                reject(err);
            } else {
                resolve(row || {
                    total_archives: 0,
                    failed_archives: 0,
                    last_archive: null,
                    total_size_mb: 0,
                    avg_archive_time_seconds: null
                });
            }
        });
    });
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
    logFailedArchive,
    getManifestIDFromProjectID,
    getArchiveRecord,
    getDatabaseStats,
    closeDatabase
};
