/**
 * Forever Loved Archive Service - Backend Server
 *
 * Main entry point for the Express server
 */

const express = require('express');
const cors = require('cors');
const { config } = require('./config/config');
const { initDatabase, closeDatabase } = require('./db/database');
const { validateEnvironment } = require('./utils/startup-checks');
const archiveRoutes = require('./routes/archive');

const app = express();

// CORS Middleware - Explicit configuration to handle preflight requests
app.use(cors({
    origin: config.corsOrigin,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
    optionsSuccessStatus: 200
}));

// Handle preflight requests explicitly
app.options('*', cors());

app.use(express.json({ limit: '10mb' })); // Limit request body size

// Request logging middleware with IP address
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log(`[${timestamp}] ${ip} ${req.method} ${req.path}`);
    next();
});

// Request timeout middleware (10 minutes)
app.use((req, res, next) => {
    req.setTimeout(10 * 60 * 1000); // 10 minutes in milliseconds
    res.setTimeout(10 * 60 * 1000);
    next();
});

// API Routes
app.use('/', archiveRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not Found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('[Error]', err);
    res.status(500).json({ error: 'Internal Server Error' });
});

// Initialize database and start server
async function startServer() {
    try {
        // Validate environment
        if (!validateEnvironment()) {
            process.exit(1);
        }

        // Initialize database
        await initDatabase();

        // Start listening
        app.listen(config.port, () => {
            console.log('=====================================');
            console.log('Forever Loved Archive Service');
            console.log('=====================================');
            console.log(`Environment: ${config.nodeEnv}`);
            console.log(`Server running on port ${config.port}`);
            console.log(`Archive endpoint: POST http://localhost:${config.port}/`);
            console.log(`Health check: GET http://localhost:${config.port}/health`);
            console.log(`CORS origin: ${config.corsOrigin}`);
            console.log(`ArNS name: ${config.arns.name}`);
            console.log('=====================================');
        });
    } catch (error) {
        console.error('[Startup] Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('[Shutdown] SIGTERM received, closing database...');
    await closeDatabase();
    console.log('[Shutdown] Database closed');
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('[Shutdown] SIGINT received, closing database...');
    await closeDatabase();
    console.log('[Shutdown] Database closed');
    process.exit(0);
});

// Start the server
startServer();
