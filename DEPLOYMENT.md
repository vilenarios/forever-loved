# Forever Loved - Deployment Guide

## Docker Compose Deployment (Recommended)

### Prerequisites

- Docker and Docker Compose installed on your server
- Git installed
- Your Arweave keyfile JSON
- Internet Archive API credentials
- Residential proxy credentials (Decodo or equivalent)

### Step 1: Clone the Repository

```bash
git clone https://github.com/vilenarios/forever-loved.git
cd forever-loved
```

### Step 2: Set Up Environment Variables

```bash
# Copy the example env file
cp backend/.env.example backend/.env

# Edit the .env file with your credentials
nano backend/.env
```

Add your credentials:
```env
# Internet Archive API Credentials
IA_ACCESS_KEY=your_ia_access_key
IA_SECRET_KEY=your_ia_secret_key

# Residential Proxy (Decodo or equivalent)
PROXY_URL=http://user:pass@gate.decodo.com:7000

# Arweave Configuration
ARWEAVE_KEYFILE_PATH=./arweave-keyfile.json

# Server Configuration
PORT=3000
NODE_ENV=production

# CORS (adjust for your frontend domain)
CORS_ORIGIN=*
```

### Step 3: Add Arweave Keyfile

Place your Arweave keyfile in the backend directory:

```bash
# Copy your keyfile to the backend directory
cp /path/to/your/arweave-keyfile.json backend/arweave-keyfile.json
```

### Step 4: Build and Run with Docker Compose

```bash
# Build and start the container
docker-compose up -d

# Check logs
docker-compose logs -f backend

# Check container status
docker-compose ps
```

### Step 5: Verify Deployment

```bash
# Test health endpoint
curl http://localhost:3000/health

# Expected response: {"status":"ok"}
```

### Step 6: Set Up Reverse Proxy (Optional but Recommended)

If you want to expose the backend on a domain with HTTPS:

#### Using Nginx

```nginx
server {
    listen 80;
    server_name api.foreverloved.dev;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Increase timeout for long-running archive operations
        proxy_read_timeout 600s;
        proxy_connect_timeout 600s;
        proxy_send_timeout 600s;
    }
}
```

Then add SSL with Let's Encrypt:
```bash
sudo certbot --nginx -d api.foreverloved.dev
```

## Docker Compose Commands

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f

# Restart services
docker-compose restart

# Rebuild after code changes
docker-compose up -d --build

# View container status
docker-compose ps

# Execute command in container
docker-compose exec backend sh
```

## Database Management

The SQLite database is stored in `backend/data/archives.db` and is persisted using Docker volumes.

```bash
# Backup database
docker-compose exec backend cp /app/data/archives.db /app/data/archives.db.backup

# View database from host
sqlite3 backend/data/archives.db "SELECT * FROM archives;"
```

## Updating the Application

```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
docker-compose up -d --build

# Check logs
docker-compose logs -f backend
```

## Monitoring

### Check Container Health

```bash
docker-compose ps
```

### View Real-time Logs

```bash
docker-compose logs -f backend
```

### Check Resource Usage

```bash
docker stats foreverloved-backend
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker-compose logs backend

# Common issues:
# 1. Missing .env file - ensure backend/.env exists
# 2. Missing keyfile - ensure backend/arweave-keyfile.json exists
# 3. Port already in use - change PORT in .env or docker-compose.yml
```

### Database Errors

```bash
# Reset database (WARNING: deletes all data)
docker-compose down
rm -f backend/data/archives.db
docker-compose up -d
```

### Network Issues

```bash
# Recreate network
docker-compose down
docker network prune
docker-compose up -d
```

## Security Considerations

1. **Never commit sensitive files:**
   - `.env` files
   - Arweave keyfiles
   - Database files

2. **Use environment-specific configs:**
   - Different `.env` for development/production
   - Restrict CORS_ORIGIN in production

3. **Regular backups:**
   - Backup `backend/data/archives.db` regularly
   - Backup Arweave keyfile securely

4. **Keep Docker updated:**
   ```bash
   docker-compose pull
   docker-compose up -d --build
   ```

## Alternative Deployment: PM2 (Without Docker)

If you prefer not to use Docker:

```bash
# Install PM2 globally
npm install -g pm2

# Navigate to backend
cd backend

# Install dependencies
npm install

# Start with PM2
pm2 start src/index.js --name foreverloved-backend

# Save PM2 configuration
pm2 save

# Set up auto-restart on boot
pm2 startup
```

## Performance Tuning

### For High Traffic

Adjust Docker resource limits in `docker-compose.yml`:

```yaml
services:
  backend:
    # ... existing config
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
```

### Database Optimization

SQLite is suitable for moderate traffic. For high traffic, consider:
- PostgreSQL for better concurrency
- Redis for caching manifest IDs
- CDN for serving archived content

## Support

For issues or questions:
- GitHub Issues: https://github.com/vilenarios/forever-loved/issues
- Review CLAUDE.md for technical details
- Check KNOWN_LIMITATIONS.md for current limitations
