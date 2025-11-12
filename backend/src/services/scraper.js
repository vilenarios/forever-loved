/**
 * Scraper Service
 * Handles direct scraping of Lovable projects using Puppeteer
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { config } = require('../config/config');

/**
 * Helper function to wait for a specified time
 */
function promiseToWait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Directly scrapes a Lovable project using Puppeteer
 * Works from residential IPs that aren't blocked by Lovable
 */
async function directScrape(urlToArchive, projectID) {
    // Security: Validate projectID to prevent path traversal attacks
    if (!projectID || projectID.includes('..') || projectID.includes('/') || projectID.includes('\\')) {
        throw new Error('Invalid projectID: potential path traversal attempt detected');
    }

    // Use path.resolve to ensure we stay within /tmp
    const downloadDir = path.resolve('/tmp', projectID);
    if (!downloadDir.startsWith('/tmp/')) {
        throw new Error('Invalid projectID: path traversal attempt detected');
    }

    if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true });
    }

    console.log(`[Direct Scrape] Launching browser for ${urlToArchive}`);
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();

        // Track all resources globally across all route visits
        const resources = new Map();
        const routeHtmls = new Map(); // Store HTML for each route
        const discoveredRoutes = new Set(['/']); // Track all routes we discover

        page.on('response', async (response) => {
            const url = response.url();
            const type = response.request().resourceType();

            // Skip data URLs and other protocols
            if (!url.startsWith('http')) return;

            // Skip analytics and tracking URLs - they won't work on archived sites anyway
            const analyticsHosts = [
                'google-analytics.com',
                'googletagmanager.com',
                'doubleclick.net',
                'googleadservices.com',
                'hotjar.io',
                'hotjar.com',
                'ahrefs.com',
                'www.google.com'
            ];
            try {
                const parsedUrl = new URL(url);
                const hostname = parsedUrl.hostname.toLowerCase();
                const shouldSkip = analyticsHosts.some(ah => hostname.includes(ah));
                if (shouldSkip) {
                    console.log(`[Direct Scrape] Skipping analytics: ${hostname}`);
                    return;
                }
            } catch (e) {
                // Invalid URL, continue
                console.warn(`[Direct Scrape] Failed to parse URL for analytics check: ${url}`);
            }

            // Skip HTML documents for routes - these will be saved separately from routeHtmls
            if (type === 'document') {
                try {
                    const parsedUrl = new URL(url);
                    const pathname = parsedUrl.pathname;
                    // Check if this is a route we're visiting
                    if (discoveredRoutes.has(pathname)) {
                        console.log(`[Direct Scrape] Skipping route document: ${pathname}`);
                        return; // Don't save route HTML documents in resources
                    }
                } catch (e) {
                    // Invalid URL, continue
                }
            }

            // Capture all resources, including from external domains
            try {
                const buffer = await response.buffer();
                resources.set(url, {
                    buffer: buffer,
                    type: type,
                    url: url
                });
                console.log(`[Direct Scrape] Captured: ${url.substring(0, 80)}...`);
            } catch (err) {
                // Some resources might fail to load, that's okay
                // Common causes:
                // - API endpoints with no body data
                // - Redirect responses (301, 302) have no body
                // - Large files evicted from Chrome's inspector cache
                // - 204 No Content responses
                const benignErrors = [
                    'No data found for resource',
                    'Response body is unavailable for redirect',
                    'evicted from inspector cache'
                ];
                const isBenign = benignErrors.some(msg => err.message.includes(msg));

                if (!isBenign) {
                    console.warn(`[Direct Scrape] Failed to capture ${url}:`, err.message);
                }
                // Skip this resource and continue
            }
        });

        // STEP 1: Navigate to homepage and discover all routes
        console.log(`[Direct Scrape] Navigating to homepage ${urlToArchive}`);
        await page.goto(urlToArchive, {
            waitUntil: 'networkidle0',
            timeout: 90000
        });

        // Scroll to trigger lazy-loaded content on homepage
        await page.evaluate(() => {
            return new Promise((resolve) => {
                let totalHeight = 0;
                const distance = 100;
                const timer = setInterval(() => {
                    const scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;

                    if (totalHeight >= scrollHeight) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 100);
            });
        });

        // Wait for charts to render (canvas or SVG elements)
        let hasChartsOnHomepage = false;
        try {
            console.log(`[Direct Scrape] Waiting for charts to render on homepage...`);
            await page.waitForSelector('canvas, svg', { timeout: 5000 });

            // Debug: Count chart elements
            const chartInfo = await page.evaluate(() => {
                const canvases = document.querySelectorAll('canvas');
                const svgs = document.querySelectorAll('svg');
                return {
                    canvasCount: canvases.length,
                    svgCount: svgs.length,
                    canvasSizes: Array.from(canvases).map(c => `${c.width}x${c.height}`),
                    svgSizes: Array.from(svgs).map(s => `${s.getAttribute('width')}x${s.getAttribute('height')}`)
                };
            });
            console.log(`[Direct Scrape] Chart elements found on homepage: ${chartInfo.canvasCount} canvas, ${chartInfo.svgCount} SVG`);
            if (chartInfo.canvasCount > 0) console.log(`[Direct Scrape]   Canvas sizes: ${chartInfo.canvasSizes.join(', ')}`);
            if (chartInfo.svgCount > 0) console.log(`[Direct Scrape]   SVG sizes: ${chartInfo.svgSizes.join(', ')}`);

            hasChartsOnHomepage = true;
            // Give chart library a moment to complete rendering
            await promiseToWait(1000);
        } catch (chartWaitErr) {
            console.log(`[Direct Scrape] No charts detected on homepage (this is normal if homepage has no charts)`);
        }

        // Save HTML immediately after chart detection to avoid losing them
        if (hasChartsOnHomepage) {
            console.log(`[Direct Scrape] Saving HTML immediately after chart detection on homepage`);
            const homepageHtml = await page.content();
            routeHtmls.set('/', homepageHtml);
        } else {
            // For pages without charts, wait normal time before saving
            await promiseToWait(config.scraping.timeouts.homepage);
            const homepageHtml = await page.content();
            routeHtmls.set('/', homepageHtml);
        }

        // Discover all internal routes from the homepage
        console.log(`[Direct Scrape] Discovering routes...`);
        const routes = await page.evaluate((baseUrl) => {
            const discoveredRoutes = new Set();

            // 1. Find routes from <a> tags
            const links = document.querySelectorAll('a[href]');
            links.forEach(link => {
                try {
                    const href = link.getAttribute('href');
                    if (!href) return;

                    // Handle relative paths
                    if (href.startsWith('/') && !href.startsWith('//')) {
                        // Clean route: remove query params and hash
                        const cleanRoute = href.split('?')[0].split('#')[0];
                        if (cleanRoute && cleanRoute !== '/') {
                            discoveredRoutes.add(cleanRoute);
                        }
                    }
                    // Handle same-domain absolute URLs
                    else if (href.startsWith(baseUrl)) {
                        const url = new URL(href);
                        const cleanRoute = url.pathname.split('?')[0].split('#')[0];
                        if (cleanRoute && cleanRoute !== '/') {
                            discoveredRoutes.add(cleanRoute);
                        }
                    }
                } catch (e) {
                    // Invalid URL, skip
                }
            });

            // 2. Find routes from React Router in JavaScript code
            // Look for patterns like: path: "/calendar", "/calendar", {path:"/calendar"}
            const scripts = Array.from(document.querySelectorAll('script[src]'));
            const scriptContents = Array.from(document.querySelectorAll('script:not([src])')).map(s => s.textContent);

            // Combine inline script content
            const allScriptText = scriptContents.join('\n');

            // Regex patterns to find routes in JS code
            const routePatterns = [
                /path:\s*["'](\/[a-zA-Z0-9_/-]+)["']/g,           // path: "/route"
                /to=["'](\/[a-zA-Z0-9_/-]+)["']/g,                // to="/route" (Link components)
                /navigate\(["'](\/[a-zA-Z0-9_/-]+)["']/g,         // navigate("/route")
                /\{\s*path:\s*["'](\/[a-zA-Z0-9_/-]+)["']/g,      // { path: "/route" }
                /<Route[^>]+path=["'](\/[a-zA-Z0-9_/-]+)["']/g    // <Route path="/route"
            ];

            routePatterns.forEach(pattern => {
                let match;
                while ((match = pattern.exec(allScriptText)) !== null) {
                    const route = match[1].split('?')[0].split('#')[0];
                    if (route && route !== '/' && !route.includes(':') && !route.includes('*')) {
                        discoveredRoutes.add(route);
                    }
                }
            });

            return Array.from(discoveredRoutes);
        }, urlToArchive);

        console.log(`[Direct Scrape] Found ${routes.length} unique routes from DOM: ${routes.join(', ')}`);

        // 3. Also scan the main JavaScript bundle for route definitions
        console.log(`[Direct Scrape] Scanning JavaScript bundles for additional routes...`);
        const jsRoutes = new Set();

        for (const [url, resource] of resources.entries()) {
            if ((url.endsWith('.js') || url.endsWith('.mjs')) && !url.includes('flock.js')) {
                try {
                    const jsContent = resource.buffer.toString('utf8');

                    // Look for route patterns in the JS code
                    const routePatterns = [
                        /path:\s*["'](\/[a-zA-Z0-9_/-]+)["']/g,
                        /to:\s*["'](\/[a-zA-Z0-9_/-]+)["']/g,
                        /navigate\(["'](\/[a-zA-Z0-9_/-]+)["']/g,
                        /"(\/[a-zA-Z0-9_-]+)"/g
                    ];

                    routePatterns.forEach(pattern => {
                        let match;
                        while ((match = pattern.exec(jsContent)) !== null) {
                            const route = match[1];
                            if (route &&
                                route !== '/' &&
                                !route.includes(':') &&
                                !route.includes('*') &&
                                !route.startsWith('/assets') &&
                                !route.startsWith('/api') &&
                                route.length > 1 &&
                                route.length < 50) {
                                jsRoutes.add(route);
                            }
                        }
                    });
                } catch (e) {
                    // Skip if can't read as text
                }
            }
        }

        // Merge JS-discovered routes with DOM routes
        const additionalRoutes = Array.from(jsRoutes).filter(r => !routes.includes(r));
        if (additionalRoutes.length > 0) {
            console.log(`[Direct Scrape] Found ${additionalRoutes.length} additional routes from JS: ${additionalRoutes.join(', ')}`);
            routes.push(...additionalRoutes);
        }

        // Add discovered routes to the Set so we can filter them from resources
        routes.forEach(route => discoveredRoutes.add(route));

        // STEP 2: Visit each route to trigger code-splitting chunks
        const routesToVisit = routes.slice(0, config.scraping.maxRoutes);

        for (const route of routesToVisit) {
            try {
                const routeUrl = new URL(route, urlToArchive).href;
                console.log(`[Direct Scrape] Visiting route: ${route}`);

                await page.goto(routeUrl, {
                    waitUntil: 'networkidle0',
                    timeout: 60000
                });

                // Scroll on this route too
                await page.evaluate(() => {
                    return new Promise((resolve) => {
                        let totalHeight = 0;
                        const distance = 100;
                        const timer = setInterval(() => {
                            const scrollHeight = document.body.scrollHeight;
                            window.scrollBy(0, distance);
                            totalHeight += distance;

                            if (totalHeight >= scrollHeight) {
                                clearInterval(timer);
                                resolve();
                            }
                        }, 100);
                    });
                });

                // Wait for charts to render (canvas or SVG elements)
                let hasCharts = false;
                try {
                    await page.waitForSelector('canvas, svg', { timeout: 5000 });
                    hasCharts = true;

                    // Wait for network to be idle (all API requests completed)
                    try {
                        await page.waitForNetworkIdle({ timeout: 10000, idleTime: 2000 });
                    } catch (networkErr) {
                        // Network idle timeout, proceed anyway
                    }

                    // Give chart library additional time to finish animations
                    await promiseToWait(500);
                } catch (chartWaitErr) {
                    // No charts detected on this route
                }

                // Save HTML after network idle and chart stabilization
                if (hasCharts) {
                    const routeHtml = await page.content();
                    routeHtmls.set(route, routeHtml);
                } else {
                    // For pages without charts, wait normal time before saving
                    await promiseToWait(config.scraping.timeouts.route);
                    const routeHtml = await page.content();
                    routeHtmls.set(route, routeHtml);
                }

            } catch (err) {
                console.warn(`[Direct Scrape] Failed to visit route ${route}:`, err.message);
            }
        }

        console.log(`[Direct Scrape] Finished visiting ${routeHtmls.size} routes`);
        await promiseToWait(config.scraping.timeouts.final);

        await browser.close();

        console.log(`[Direct Scrape] Captured ${resources.size} resources`);

        // Log JavaScript files for debugging
        const jsFiles = Array.from(resources.entries())
            .filter(([url, resource]) => url.endsWith('.js') || url.endsWith('.mjs'))
            .map(([url]) => url);
        console.log(`[Direct Scrape] JavaScript files captured: ${jsFiles.length}`);
        if (jsFiles.length > 0 && jsFiles.length < 20) {
            jsFiles.forEach(url => console.log(`  - ${url}`));
        }

        // STEP 3: Save all resources to disk and rewrite paths
        await saveResourcesToDisk(resources, downloadDir);

        // STEP 4: Save HTML files for each route with ABSOLUTE paths
        await saveRouteHTMLFiles(routeHtmls, downloadDir);

        console.log(`[Direct Scrape] Download complete to ${downloadDir}`);
        console.log(`[Direct Scrape] Total: ${resources.size} resources, ${routeHtmls.size} route HTML files`);
        return downloadDir;

    } catch (error) {
        await browser.close();
        throw error;
    }
}

/**
 * Save captured resources to disk with path rewriting
 */
async function saveResourcesToDisk(resources, downloadDir) {
    for (const [url, resource] of resources.entries()) {
        try {
            const parsedUrl = new URL(url);

            // Skip analytics/tracking URLs
            const analyticsHosts = ['google-analytics.com', 'googletagmanager.com', 'doubleclick.net',
                                   'googleadservices.com', 'hotjar.io', 'hotjar.com', 'ahrefs.com'];
            const hostname = parsedUrl.hostname.toLowerCase();
            if (analyticsHosts.some(ah => hostname.includes(ah)) || parsedUrl.pathname.includes('/pagead/')) {
                console.log(`[Direct Scrape] Skipping analytics resource: ${url.substring(0, 80)}...`);
                continue;
            }

            let filePath;

            // For external domains, preserve the full hostname + path
            if (!parsedUrl.hostname.includes('lovable.app')) {
                let pathname = parsedUrl.pathname;
                if (pathname.endsWith('/') && pathname.length > 1) {
                    pathname = pathname.slice(0, -1);
                }
                filePath = path.join('/_external', parsedUrl.hostname, pathname);
            } else {
                filePath = parsedUrl.pathname;
            }

            // Handle root path
            if (filePath === '/' || filePath === '') {
                filePath = '/index.html';
            }

            const fullPath = path.join(downloadDir, filePath);
            const dirPath = path.dirname(fullPath);

            // Handle file/directory conflicts
            if (!fs.existsSync(dirPath)) {
                try {
                    fs.mkdirSync(dirPath, { recursive: true });
                } catch (mkdirError) {
                    if (mkdirError.code === 'ENOTDIR' || mkdirError.code === 'EEXIST') {
                        const pathParts = dirPath.split(path.sep);
                        let currentPath = '';

                        for (const part of pathParts) {
                            if (!part) continue;
                            currentPath = currentPath ? path.join(currentPath, part) : part;

                            if (fs.existsSync(currentPath)) {
                                const stats = fs.statSync(currentPath);
                                if (stats.isFile()) {
                                    console.log(`[Direct Scrape] Removing file blocking directory: ${currentPath}`);
                                    fs.unlinkSync(currentPath);
                                }
                            }
                        }

                        fs.mkdirSync(dirPath, { recursive: true });
                    } else {
                        throw mkdirError;
                    }
                }
            }

            // Write the file
            fs.writeFileSync(fullPath, resource.buffer);

            // Rewrite paths in JS and CSS files
            if (fullPath.endsWith('.js') || fullPath.endsWith('.mjs') || fullPath.endsWith('.css')) {
                try {
                    let content = fs.readFileSync(fullPath, 'utf8');
                    let originalLength = content.length;

                    // 1. Rewrite lovable.app URLs in import/from statements
                    content = content.replace(/from\s+(["'])https?:\/\/[^"']*lovable\.app(\/[^"']*)\1/gi, (match, quote, path) => {
                        return `from ${quote}${path}${quote}`;
                    });

                    // 2. Rewrite lovable.app URLs in dynamic import() statements
                    content = content.replace(/import\s*\((["'])https?:\/\/[^"']*lovable\.app(\/[^"']*)\1\)/gi, (match, quote, path) => {
                        return `import(${quote}${path}${quote})`;
                    });

                    // 3. Rewrite lovable.app URLs in template literals
                    content = content.replace(/`https?:\/\/[^`]*lovable\.app(\/[^`]*)`/gi, '`$1`');

                    // 4. Rewrite remaining lovable.app URLs (preserve quote type)
                    content = content.replace(/(["'])https?:\/\/[^"']*lovable\.app(\/[^"']*)\1/gi, (match, quote, path) => {
                        return `${quote}${path}${quote}`;
                    });

                    // 5. Rewrite external domain URLs (preserve quote type)
                    content = content.replace(/(["'])https?:\/\/([^"'\/]+)(\/[^"']*)\1/gi, (match, quote, hostname, pathname) => {
                        if (hostname.includes('lovable.app') || hostname.includes('google') || hostname.includes('facebook')) {
                            return match;
                        }
                        return `${quote}/_external/${hostname}${pathname}${quote}`;
                    });

                    // 6. Rewrite external domain URLs in template literals
                    content = content.replace(/`https?:\/\/([^`\/]+)(\/[^`]*)`/gi, (match, hostname, pathname) => {
                        if (hostname.includes('lovable.app') || hostname.includes('google') || hostname.includes('facebook')) {
                            return match;
                        }
                        return `\`/_external/${hostname}${pathname}\``;
                    });

                    if (content.length !== originalLength) {
                        console.log(`[Direct Scrape] Rewrote paths in ${path.basename(fullPath)} (${originalLength} -> ${content.length} bytes)`);
                    }

                    fs.writeFileSync(fullPath, content, 'utf8');
                } catch (e) {
                    console.warn(`[Direct Scrape] Could not rewrite ${path.basename(fullPath)}: ${e.message}`);
                }
            }
        } catch (err) {
            console.warn(`[Direct Scrape] Failed to save ${url}:`, err.message);
        }
    }
}

/**
 * Save HTML files for each route with path rewriting
 */
async function saveRouteHTMLFiles(routeHtmls, downloadDir) {
    console.log(`[Direct Scrape] Saving HTML files for ${routeHtmls.size} routes...`);

    for (const [route, html] of routeHtmls.entries()) {
        try {
            let routePath;
            if (route === '/') {
                routePath = 'index.html';
            } else {
                routePath = path.join(route, 'index.html');
            }

            const fullPath = path.join(downloadDir, routePath);
            const dirPath = path.dirname(fullPath);

            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }

            // Rewrite HTML to use ABSOLUTE paths
            let modifiedHtml = html;

            // Fix Recharts color bug: rgb(var(--success)) should be hsl(var(--success))
            // CSS variables like --success contain HSL values (142 72% 52%), not RGB values
            modifiedHtml = modifiedHtml.replace(/rgb\(var\(--([^)]+)\)\)/g, 'hsl(var(--$1))');

            // Remove analytics scripts
            modifiedHtml = modifiedHtml.replace(/<script[^>]*src=["'][^"']*(google-analytics|googletagmanager|doubleclick|googleadservices|hotjar|ahrefs)[^"']*["'][^>]*><\/script>/gi, '<!-- Analytics script removed -->');
            modifiedHtml = modifiedHtml.replace(/<script[^>]*>[\s\S]*?googletagmanager\.com\/gtm\.js[\s\S]*?<\/script>/gi, '<!-- GTM script removed -->');
            modifiedHtml = modifiedHtml.replace(/<script[^>]*>[\s\S]*?_hjSettings[\s\S]*?<\/script>/gi, '<!-- Hotjar script removed -->');
            modifiedHtml = modifiedHtml.replace(/<script[^>]*>[\s\S]*?window\.dataLayer[\s\S]*?gtag[\s\S]*?<\/script>/gi, '<!-- gtag script removed -->');
            modifiedHtml = modifiedHtml.replace(/<noscript>[\s\S]*?googletagmanager\.com\/ns\.html[\s\S]*?<\/noscript>/gi, '<!-- GTM noscript removed -->');

            // Rewrite lovable.app URLs to absolute paths
            modifiedHtml = modifiedHtml.replace(/(href|src)=["']https?:\/\/[^"']*lovable\.app(\/[^"']*)["']/gi, '$1="$2"');

            // Rewrite external domain paths to absolute paths
            modifiedHtml = modifiedHtml.replace(/(href|src)=["']https?:\/\/([^"'\/]+)(\/[^"']*)["']/gi, (match, attr, hostname, pathname) => {
                if (hostname.includes('lovable.app')) {
                    return match;
                }
                return `${attr}="/_external/${hostname}${pathname}"`;
            });

            fs.writeFileSync(fullPath, modifiedHtml, 'utf8');
            console.log(`[Direct Scrape] Saved HTML: ${routePath}`);

        } catch (err) {
            console.warn(`[Direct Scrape] Failed to save HTML for route ${route}:`, err.message);
        }
    }
}

module.exports = {
    directScrape
};
