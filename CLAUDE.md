# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Forever Loved is a full-stack application that permanently archives Lovable.dev projects to the Arweave permaweb. The project consists of:
- **Frontend**: Vanilla JavaScript with Vite for the UI (`frontend/`)
- **Backend**: Modular Express.js API server (`backend/`)
- **Database**: SQLite for storing projectID → manifestID mappings
- **Scraper**: Puppeteer-based direct scraping (no Internet Archive dependency)
- **Integrations**: Arweave/ARDrive Turbo SDK, AR.IO SDK for ArNS

## Architecture

### Project Structure

```
foreverloved/
├── frontend/                    # Vite-powered frontend
│   ├── src/
│   │   ├── main.js             # Entry point with API calls
│   │   └── styles/main.css     # All styles
│   ├── index.html              # HTML template
│   ├── vite.config.js          # Vite configuration
│   ├── package.json            # Frontend dependencies
│   └── .env                    # Frontend config (API URL)
│
├── backend/                     # Express backend
│   ├── src/
│   │   ├── index.js            # Server entry point
│   │   ├── config/config.js    # Environment configuration
│   │   ├── routes/archive.js   # HTTP endpoints
│   │   ├── services/           # Business logic
│   │   │   ├── scraper.js      # Puppeteer scraping logic
│   │   │   ├── arweave.js      # Arweave upload logic
│   │   │   ├── arns.js         # ArNS undername assignment
│   │   │   └── archiver.js     # Orchestration layer
│   │   ├── db/database.js      # SQLite operations
│   │   └── utils/              # Helper functions
│   ├── package.json            # Backend dependencies
│   └── .env                    # Backend secrets
│
├── package.json                 # Root workspace config
├── archives.db                  # SQLite database
├── arweave-keyfile-*.json      # Arweave wallet (gitignored)
└── CLAUDE.md                    # This file
```

### Key Technical Flow

1. **User Input**: User enters a Lovable project URL in the frontend:
   - **New format**: `https://{project-id}.lovable.app/`
   - **Old format**: `https://lovable.dev/projects/{uuid}`

2. **Direct Scraping** (`backend/src/services/scraper.js`):
   - Launches Puppeteer headless browser
   - Navigates to the Lovable project
   - Discovers all routes by analyzing DOM links and React Router config in JS bundles
   - Visits each route to trigger code-splitting chunks
   - Captures all resources (JS, CSS, images, fonts, etc.)
   - Rewrites URLs from absolute to relative paths
   - Handles template literals, preserves quote types

3. **Arweave Upload** (`backend/src/services/arweave.js`):
   - Uploads folder to Arweave using Turbo SDK
   - Returns manifest ID

4. **Database Storage** (`backend/src/db/database.js`):
   - Saves `projectID → manifestID` mapping in SQLite

5. **ArNS Assignment** (`backend/src/services/arns.js`) - Optional:
   - Sets ArNS undername: `{projectID}_{ARNS_NAME}.arweave.net`
   - TTL: Configurable via `ARNS_TTL` env var (default: 60 seconds)

### Why This Architecture

- **Direct Scraping**: No dependency on Internet Archive, works from residential IPs
- **Modular Backend**: Separation of concerns makes code maintainable and testable
- **Vite Frontend**: Fast development, optimized production builds, easy deployment to Arweave
- **SQLite Database**: Lightweight, serverless, no external dependencies
- **ArNS Integration**: Friendly URLs for archived projects
- **Hybrid Deployment**: Frontend on Arweave (static), backend on ar.io gateway (dynamic)

## Common Commands

### Initial Setup

```bash
# Clone repository
git clone <repository-url>
cd Foreverloved

# Install all dependencies (root, frontend, backend)
npm run install:all

# Configure backend
cp backend/.env.example backend/.env
# Edit backend/.env and configure settings

# Configure frontend (optional, for production)
cp frontend/.env.example frontend/.env
# Edit frontend/.env with your production API URL

# Ensure arweave-keyfile-*.json is in the root directory
```

### Development

```bash
# Start both frontend and backend with hot-reload
npm run dev
# Frontend: http://localhost:5173
# Backend:  http://localhost:3000

# Or run separately:
npm run dev:frontend  # Vite dev server
npm run dev:backend   # Nodemon for backend
```

### Production

```bash
# Build frontend for production
npm run build:frontend
# Output in frontend/dist/

# Start backend server
npm run start
# Or: cd backend && npm start

# Deploy frontend dist/ to Arweave
turbo upload-folder frontend/dist --index-file index.html
```

### Testing

```bash
# Health check
curl http://localhost:3000/health

# Test archival endpoint
curl -X POST http://localhost:3000/archive \
  -H "Content-Type: application/json" \
  -d '{"url":"https://your-project.lovable.app/"}'
```

## Critical Configuration

### Required Credentials

**Backend Environment Variables (`backend/.env`):**

1. **Server Configuration**:
   - `PORT` - Server port (default: 3000)
   - `NODE_ENV` - Environment (development/production)
   - `CORS_ORIGIN` - Allowed CORS origins (default: *)

2. **Arweave Keyfile**:
   - Place `arweave-keyfile-*.json` in **root directory**
   - Auto-discovered by `backend/src/config/config.js`

3. **ArNS Configuration** (Optional):
   - `ARNS_WALLET_PATH` - Path to ArNS wallet JSON file
   - `ARNS_NAME` - Your ArNS name (default: "undertaker")
   - `ARNS_TTL` - TTL in seconds (default: 60; use 3600 for production)

**Frontend Environment Variables (`frontend/.env`):**

1. **API Configuration**:
   - `VITE_API_URL` - Backend API URL
   - Development: `http://localhost:3000`
   - Production: Your ar.io gateway URL

### Database

- **Type**: SQLite (file-based, no server needed)
- **Location**: `./archives.db` (created automatically on first run)
- **Schema**:
  ```sql
  CREATE TABLE archives (
      project_id TEXT PRIMARY KEY,
      manifest_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
  ```

### Server Configuration

- **Default Port**: 3000 (configurable via `PORT` environment variable)
- **Request Timeout**: 10 minutes maximum per request
- **CORS**: Configurable via `CORS_ORIGIN` (default: `*`)
- **Body Size Limit**: 10MB maximum request body

### Security Features

Production-ready security is built-in and automatically enforced:

- **Rate Limiting**: 5 requests per IP per 15 minutes on `/archive` endpoint (express-rate-limit)
- **Concurrent Limiting**: Maximum 3 simultaneous archive operations (prevents memory exhaustion)
- **Request Timeout**: 10-minute maximum per HTTP request (prevents hung requests)
- **Body Size Limit**: 10MB maximum JSON body (prevents DoS attacks)
- **Path Sanitization**: Directory traversal protection in projectID validation
- **IP Logging**: Client IP addresses logged with every request
- **URL Validation**: Only accepts `lovable.dev` and `*.lovable.app` domains
- **Connection Cleanup**: Properly handles client disconnects and aborted requests

All security features are enforced automatically - no configuration needed!

## Key Code Sections

### Frontend (`frontend/src/`)
- `main.js` - Entry point, handles form submission and API calls
- `styles/main.css` - All application styles
- `index.html` - HTML template

### Backend Entry Points
- `backend/src/index.js` - Express server initialization
- `backend/src/routes/archive.js` - HTTP endpoints (`POST /archive`, `GET /health`)

### Core Services (`backend/src/services/`)
- **`archiver.js`** - Orchestrates scraping → upload → ArNS assignment
  - `runArchiver()` - Main orchestration function
- **`scraper.js`** - Puppeteer-based direct scraping
  - `directScrape()` - Captures all resources from Lovable project
  - `saveResourcesToDisk()` - Saves files with path rewriting
  - `saveRouteHTMLFiles()` - Saves HTML for each route
- **`arweave.js`** - Arweave upload via Turbo SDK
  - `uploadFolderToArweave()` - Uploads folder and returns manifest ID
- **`arns.js`** - ArNS undername assignment
  - `setArNSUndername()` - Sets `{projectID}_undertaker.arweave.net`

### Database (`backend/src/db/`)
- `database.js` - SQLite operations
  - `initDatabase()` - Creates tables if needed
  - `saveMappingToDB()` - Stores projectID → manifestID
  - `getManifestIDFromProjectID()` - Retrieves existing mapping

### Configuration (`backend/src/config/`)
- `config.js` - Centralized configuration, loads environment variables and keyfiles

## Important Constraints

### Scraping Configuration (`backend/src/config/config.js`)
- **Homepage Timeout**: 5 seconds (wait for all initial chunks)
- **Route Timeout**: 4 seconds (per route for lazy-loaded components)
- **Final Timeout**: 5 seconds (after visiting all routes for final assets)
- **Max Routes**: 50 (safety limit to prevent infinite scraping)

### URL Validation
- Accepts two formats (`backend/src/routes/archive.js`):
  - **New format**: `https://{project-id}.lovable.app/` where project-id is alphanumeric with hyphens
  - **Old format**: `https://lovable.dev/projects/{UUIDv4}` (legacy support)
- Query parameters (e.g., `?view=main`) are stripped and ignored

### Path Rewriting (`backend/src/services/scraper.js`)
- Handles template literals (backticks)
- Preserves quote types (single vs double quotes)
- Rewrites both string literals and template expressions
- External resources saved to `/_external/{hostname}/{path}`

### Error Handling
- **`archiveerror`**: Scraping failed (Puppeteer error, timeout, etc.)
- **`arerror`**: Arweave upload failed
- Returns cached manifestID if database mapping exists (idempotent)
- Frontend retries once on 502 status

## Dependencies

**Backend** (`backend/package.json`):
- `express@4.21.0` - Web server framework
- `express-rate-limit@8.2.1` - Rate limiting middleware
- `sqlite3@5.1.7` - SQLite database driver
- `cors@2.8.5` - CORS middleware
- `puppeteer@24.29.1` - Headless Chrome for scraping (latest, security fixes)
- `@ardrive/turbo-sdk@1.18.1` - Arweave upload via Turbo
- `@ar.io/sdk@3.21.0` - AR.IO SDK for ArNS (major update, fixes 6 axios vulnerabilities)
- `dotenv@17.2.3` - Environment variable loading (latest)
- `nodemon@3.1.7` - Development auto-reload

**Frontend** (`frontend/package.json`):
- `vite` - Build tool and dev server

**Root** (`package.json`):
- `concurrently` - Run multiple npm scripts in parallel

## Deployment Options

### Option 1: Hybrid Deployment (Recommended)

**Frontend on Arweave:**
```bash
# Build frontend
npm run build:frontend

# Upload to Arweave using Turbo CLI
turbo upload-folder frontend/dist --index-file index.html

# Note the manifest ID, then set up ArNS record pointing to it
```

**Backend on ar.io Gateway / VPS:**
```bash
# On your server
git clone <repo>
cd Foreverloved
npm run install:all

# Configure backend
cp backend/.env.example backend/.env
# Edit backend/.env with your settings
# Place arweave-keyfile-*.json in root

# Start with PM2
pm2 start backend/src/index.js --name foreverloved-backend
pm2 save
```

Update `frontend/.env` before building:
```
VITE_API_URL=https://your-gateway-domain.com
```

### Option 2: Traditional VPS (Both Frontend & Backend)

```bash
# On server
git clone <repo>
cd Foreverloved
npm run install:all

# Configure
cp backend/.env.example backend/.env
# Configure backend/.env

# Build frontend
npm run build:frontend

# Serve frontend/dist with Nginx
# Run backend with PM2
pm2 start backend/src/index.js --name foreverloved
```

**Nginx config:**
```nginx
server {
    listen 80;
    server_name foreverloved.example.com;

    # Serve frontend
    location / {
        root /path/to/Foreverloved/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to backend
    location /archive {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /health {
        proxy_pass http://localhost:3000;
    }
}
```

### Option 3: Docker

**Dockerfile for backend:**
```dockerfile
FROM node:18-alpine
WORKDIR /app

# Install Chromium for Puppeteer
RUN apk add --no-cache chromium

# Set Puppeteer to use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Install dependencies
COPY backend/package*.json ./
RUN npm install --production

# Copy backend code
COPY backend/src ./src

EXPOSE 3000
CMD ["node", "src/index.js"]
```

```bash
docker build -t foreverloved-backend -f Dockerfile .
docker run -p 3000:3000 \
  -v $(pwd)/backend/.env:/app/.env \
  -v $(pwd)/arweave-keyfile-*.json:/app/arweave-keyfile.json \
  foreverloved-backend
```

## Testing a New Archive

### Using Frontend UI
1. Open `http://localhost:5173` (development) or your deployed frontend
2. Enter Lovable project URL: `https://your-project.lovable.app/`
3. Click "Forever." button
4. Wait for archival (watch browser console and backend logs)
5. Access archived project:
   - ArNS URL: `https://{projectID}_undertaker.arweave.net`
   - Direct URL: `https://arweave.net/{manifestID}`

### Using API Directly
```bash
curl -X POST http://localhost:3000/archive \
  -H "Content-Type: application/json" \
  -d '{"url":"https://your-project.lovable.app/"}'
```

Response:
```json
{
  "success": true,
  "projectId": "your-project",
  "manifestId": "abc123...",
  "manifestUrl": "https://arweave.net/abc123...",
  "arnsUrl": "https://your-project_undertaker.arweave.net",
  "arnsTxId": "xyz789..."
}
```

## Adding New Features

### Adding a New Backend Service

1. Create file in `backend/src/services/`
2. Export functions for use in orchestrator
3. Import in `backend/src/services/archiver.js`
4. Add to orchestration flow

### Adding Frontend Components

1. Create file in `frontend/src/components/`
2. Import in `frontend/src/main.js`
3. Use vanilla JavaScript (no framework)

### Modifying Scraping Behavior

- **Timeouts**: Edit `backend/src/config/config.js`
- **Route discovery**: Edit `backend/src/services/scraper.js` - scans JavaScript bundles for React Router patterns
- **Path rewriting**: Edit `backend/src/services/scraper.js` - handles absolute to relative path conversion
- **Security limits**: Edit `backend/src/routes/archive.js` - rate limits and concurrent request limits

## Known Issues & Limitations

### Cache Check Disabled
**Location**: `backend/src/routes/archive.js:79-92`

The cache check is currently commented out with note "disabled for testing". This means:
- Every request re-archives the project (costs Arweave upload fees)
- No deduplication of identical projects
- Slower response times

**To re-enable caching**:
Uncomment lines 79-92 in `backend/src/routes/archive.js`. The system will:
1. Check database for existing manifestID
2. Return cached URL immediately if found
3. Only archive if not in database

### Bug Fixes Applied
- **Fixed**: Race condition in concurrent request limiter (could exceed limit with simultaneous requests)
- **Fixed**: Counter leak on connection close (now listens to both 'finish' and 'close' events)
- **Fixed**: Deprecated `page.waitForTimeout()` replaced with helper function
- **Fixed**: Path traversal vulnerability with projectID sanitization
- **Fixed**: Regex escaping in route discovery patterns

## Security Considerations

### What's Protected
✅ Rate limit abuse (5 req/15min per IP)
✅ Memory exhaustion (concurrent + body size limits)
✅ Hung requests (10 minute timeout)
✅ Path traversal attacks (projectID validation)
✅ Arbitrary website scraping (URL validation)

### What's NOT Protected
⚠️ **No authentication** - Anyone can submit archive requests
⚠️ **No payment required** - Uses your Arweave wallet balance
⚠️ **Residential IP required** - Won't work from datacenter IPs (Lovable blocks them)
⚠️ **Cache disabled by default** - Re-archives every request (consider enabling for production)

**Future Improvements**:
- Add authentication (x402 micropayments recommended)
- Enable cache check for production
- Add metrics/monitoring
- Add archive size limits
- Add user quota management
