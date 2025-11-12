# Forever Loved

Permanently preserve AI-generated web projects on the Arweave permaweb.

## What It Does

Forever Loved archives [Lovable.dev](https://lovable.dev) projects to [Arweave](https://arweave.org), making them permanently accessible on the decentralized web. Projects are directly scraped using Puppeteer, uploaded to Arweave, and made accessible through user-friendly ArNS URLs.

## Quick Start

### Prerequisites

- Node.js 18 or higher
- Arweave wallet keyfile with sufficient balance
- (Optional) ArNS wallet for undername assignment

### Installation

1. **Clone and install all dependencies:**
   ```bash
   git clone <repository-url>
   cd Foreverloved
   npm run install:all
   ```

2. **Configure backend environment:**
   ```bash
   cp backend/.env.example backend/.env
   ```

   Edit `backend/.env` and configure:
   - `PORT` - Backend server port (default: 3000)
   - `ARNS_WALLET_PATH` - Path to ArNS wallet (optional)
   - `ARNS_NAME` - Your ArNS name (default: "forever-loved")
   - `ARNS_TTL` - TTL in seconds (default: 60 for testing; 3600 for production)

3. **Add Arweave keyfile:**
   - Place your `arweave-keyfile-*.json` in the root directory

4. **Configure frontend (optional):**
   ```bash
   cp frontend/.env.example frontend/.env
   ```

   Edit `frontend/.env` for production:
   - `VITE_API_URL` - Your backend API URL

5. **Start development servers:**
   ```bash
   npm run dev
   ```

   - Backend API: `http://localhost:3000`
   - Frontend UI: `http://localhost:5173`

## Usage

1. Open your browser to `http://localhost:5173` (frontend)
2. Enter a Lovable project URL:
   - New format: `https://your-project.lovable.app/`
   - Old format: `https://lovable.dev/projects/{uuid}`
3. Click "Forever." to archive
4. Wait for the archival process (may take several minutes)
5. Access your archived project at the provided Arweave URL

## How It Works

1. **Direct Scrape**: Uses Puppeteer to directly scrape Lovable projects (works from residential IPs)
2. **Route Discovery**: Intelligently discovers all routes by analyzing React Router config
3. **Asset Capture**: Captures all JavaScript chunks, CSS, images, and other assets
4. **Path Rewriting**: Rewrites URLs to work on Arweave (absolute paths, external resources)
5. **Upload**: Uploads to Arweave using ARDrive Turbo SDK
6. **Store**: Saves project ID → manifest ID mapping in SQLite database
7. **ArNS Assignment**: Optionally assigns ArNS undername for friendly URLs

## Architecture

- **Frontend**: Vanilla JavaScript with Vite (`frontend/`)
- **Backend**: Express.js server with modular services (`backend/`)
- **Database**: SQLite (`archives.db`)
- **Storage**: Arweave permaweb
- **Scraper**: Puppeteer with intelligent route discovery

## Security Features

The backend includes production-ready security measures:

- **Rate Limiting**: 5 requests per IP per 15 minutes on `/archive` endpoint
- **Concurrent Request Limiting**: Maximum 3 simultaneous archive operations
- **Request Timeout**: 10-minute maximum per request
- **Body Size Limit**: 10MB maximum request body size
- **Path Sanitization**: Prevents directory traversal attacks
- **IP Logging**: Client IP addresses logged with each request
- **URL Validation**: Only accepts `lovable.dev` and `*.lovable.app` domains

Security is enforced automatically - no configuration needed!

## Development

```bash
# Start both frontend and backend in development mode
npm run dev

# Or run them separately:
npm run dev:backend   # Backend with nodemon
npm run dev:frontend  # Frontend with Vite

# Test the API
curl -X POST http://localhost:3000/archive \
  -H "Content-Type: application/json" \
  -d '{"url":"https://your-project.lovable.app/"}'
```

## Production Deployment

### Hybrid Deployment (Recommended)

**Frontend on Arweave:**
```bash
# Build frontend
npm run build:frontend

# Upload frontend/dist to Arweave using Turbo CLI
turbo upload-folder frontend/dist --index-file index.html

# Get the manifest ID and set up ArNS pointing to it
```

**Backend on Your ar.io Gateway:**
```bash
# On your server
cd backend
npm install --production
npm start

# Or use PM2 for process management
pm2 start src/index.js --name foreverloved-backend
pm2 save
```

Update `frontend/.env` for production:
```
VITE_API_URL=https://your-gateway-domain.com
```

### Traditional VPS Deployment

Run both frontend and backend on the same server with Nginx as reverse proxy.

See [CLAUDE.md](./CLAUDE.md) for detailed deployment instructions.

## Project Structure

```
/
├── frontend/                    # Vite-powered frontend
│   ├── src/
│   │   ├── main.js             # Entry point
│   │   └── styles/main.css     # Styles
│   ├── index.html              # HTML template
│   ├── vite.config.js          # Vite configuration
│   └── package.json
│
├── backend/                     # Express backend
│   ├── src/
│   │   ├── index.js            # Server entry point
│   │   ├── config/             # Configuration
│   │   ├── routes/             # HTTP endpoints
│   │   ├── services/           # Business logic
│   │   │   ├── scraper.js      # Puppeteer scraping
│   │   │   ├── arweave.js      # Arweave uploads
│   │   │   ├── arns.js         # ArNS assignment
│   │   │   └── archiver.js     # Orchestration
│   │   ├── db/                 # Database
│   │   └── utils/              # Helpers
│   ├── package.json
│   └── .env
│
├── package.json                 # Root workspace config
├── archives.db                  # SQLite database
├── arweave-keyfile-*.json      # Arweave wallet (not in git)
└── README.md                    # This file
```

## Technical Details

### Supported URL Formats

- **New Lovable format**: `https://{project-id}.lovable.app/`
- **Old Lovable format**: `https://lovable.dev/projects/{uuid}`

### Scraping Configuration

- **Homepage timeout**: 5 seconds (wait for all chunks to load)
- **Route timeout**: 4 seconds (per route for lazy-loaded components)
- **Final timeout**: 5 seconds (after visiting all routes)
- **Max routes**: 50 (safety limit to prevent infinite scraping)

### Database Schema

```sql
CREATE TABLE archives (
    project_id TEXT PRIMARY KEY,
    manifest_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

## Troubleshooting

**"Failed to retrieve the page for archival"**
- The direct scraping failed (Puppeteer error)
- Ensure you're running from a residential IP (not datacenter IP)
- Check if Chromium/Puppeteer installed correctly
- Try increasing timeouts in `backend/src/config/config.js`

**"Error with ARWeave/Turbo"**
- Verify your Arweave keyfile is in the root directory
- Check your Arweave wallet has sufficient balance
- Ensure keyfile name matches pattern `arweave-keyfile-*.json`

**Backend server won't start**
- Ensure Node.js 18+ is installed
- Check `backend/.env` file is properly configured
- Verify port 3000 is not already in use
- Run `npm run install:all` to ensure all dependencies are installed

**Frontend not connecting to backend**
- Check `VITE_API_URL` in `frontend/.env`
- Ensure backend is running on the configured port
- Check for CORS issues in browser console

## License

MIT

## Credits

Refactored from monolithic Express server to modular architecture with separated frontend/backend for better maintainability and deployment flexibility.
