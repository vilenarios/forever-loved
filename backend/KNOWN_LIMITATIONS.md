# Known Limitations

This document describes known limitations when archiving Lovable.dev projects to Arweave.

## Dynamic Charts with Live Data Fetching

**Issue:** React-based charts (e.g., Recharts) that fetch live data from APIs may not render correctly in archived versions.

**Symptoms:**
- Charts appear briefly on page load, then disappear
- Only axis labels (dates, values) remain visible
- Chart areas show data on hover but are visually invisible

**Root Cause:**
Lovable apps are Single Page Applications (SPAs) that use React. When the archived static HTML loads:

1. Static HTML renders with charts initially visible
2. React JavaScript bundle loads and hydrates the page
3. Chart components mount and attempt to fetch fresh data from APIs
4. API calls fail (no live backend in archived version)
5. Charts re-render in empty/loading state, clearing the static content

**Technical Details:**
- We successfully capture chart SVG elements with full data paths
- Charts are present in the static HTML with correct styling
- React's hydration process intentionally replaces static content with dynamic components
- Chart libraries like Recharts enter a loading state when data fetching fails

**Workarounds:**
None currently implemented. Possible future solutions include:
- Service Workers to intercept and mock API responses (complex, app-specific)
- Injecting captured data directly into the JavaScript bundle (fragile)
- Disabling JavaScript entirely (breaks navigation and interactivity)

**Affected Features:**
- Stock market charts with live price data
- Real-time dashboards with API-driven visualizations
- Any chart component that fetches data on mount

**Recommendation:**
For Lovable apps with critical chart functionality, test the archived version and set appropriate expectations. Most other Lovable features (navigation, static content, UI interactions) archive correctly.

**Related Code:**
- Chart detection: `backend/src/services/scraper.js:338-386`
- Network idle waiting ensures data is captured: `backend/src/services/scraper.js:361-368`
- Color fix for static charts: `backend/src/services/scraper.js:591-594`
