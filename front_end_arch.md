# Frontend Architecture

**Repository**: `~/Documents/projects/mtrainier/tahomasite`

## Overview

A vanilla JavaScript static site hosted on Cloudflare Pages. Displays Mt. Rainier visibility status, provides historical browsing, and supports admin labeling interfaces.

## Technology Stack

- **Frontend**: HTML5, CSS3, ES6 JavaScript modules
- **Hosting**: Cloudflare Pages (auto-deploy from GitHub)
- **Data Source**: CloudFront CDN serving S3 content
- **Design**: NPS-inspired color palette, mobile-first responsive

## Project Structure

```
tahomasite/
├── index.html                  # Public status page
├── history.html               # Historical browser
├── admin/
│   ├── label.html            # Admin rapid labeling
│   └── review.html           # Admin label review
├── js/
│   ├── main.js               # Home page orchestration
│   ├── history.js            # History page logic
│   ├── admin/
│   │   ├── label.js         # Admin labeling controller
│   │   └── review.js        # Admin review controller
│   ├── components/
│   │   ├── StatusDisplay.js      # YES/NO/PARTIAL status
│   │   ├── ImageViewer.js        # Image display
│   │   ├── MetadataDisplay.js    # Frame state, confidence
│   │   ├── LabelForm.js          # Crowdsource correction form
│   │   └── TimelineViewer.js     # Historical timeline scrubber
│   ├── lib/
│   │   └── api.js            # Central API client
│   └── utils/
│       ├── format.js         # Date/percentage formatting
│       ├── dom.js            # DOM helpers
│       └── keyboard.js       # Keyboard shortcut system
├── config/
│   └── config.js             # Environment settings
├── css/
│   ├── reset.css
│   ├── variables.css         # Design tokens
│   ├── base.css              # Typography
│   ├── components.css        # Buttons, inputs, cards
│   └── pages/
│       ├── home.css
│       └── admin.css
└── assets/
    └── images/
        └── placeholder.jpg
```

## Pages

### 1. Public Status Page (`/index.html`)

**Status**: Fully working

Displays current Mt. Rainier visibility:
- Large status indicator: "YES" (green) / "NO" (red) / "PARTIAL" (yellow)
- Current webcam image from CloudFront
- Metadata panel: frame state, confidence percentages, model version
- Embedded timeline viewer with scrubber for day navigation
- Crowdsource correction form (collapsible)
- Auto-refresh every 60 seconds

### 2. History Page (`/history.html`)

**Status**: Fully working

Browse past images and predictions:
- Date picker for jumping to specific days
- Day navigation (prev/next buttons)
- Scrubber track for frame navigation (10-minute intervals)
- Frame info display (ID, timestamp)
- Play/pause playback controls
- Image preloading (batched)

### 3. Admin Labeling Page (`/admin/label.html`)

**Status**: UI complete, backend integration pending

Rapid labeling interface for bulk image labeling:
- Token-based auth (URL param or localStorage)
- Frame state buttons: Good / Out-of-Frame / Dark / Bad or Blurry
- Visibility buttons: Out / Partial / Not Out (disabled unless frame=good)
- Two navigation modes:
  - **Queue mode**: Jump to next unlabeled (fastest for bulk)
  - **Cursor mode**: Chronological navigation (for specific ranges)
- Keyboard shortcuts:
  - `G/F/D/B` — frame state
  - `O/P/N` — visibility (only if frame=good)
  - `←/→` — prev/next
  - `Space` — next unlabeled
  - `?` — help overlay
- Auto-advance after labeling non-good frames

### 4. Admin Review Page (`/admin/review.html`)

**Status**: UI complete, backend integration pending

Review and correct "out" / "partial" labels:
- Filter to high-value images (out or partial)
- Quick actions: Confirm (C), Change to Partial (P), Change to Not Out (N), Skip (S)
- Progress indicator (X of Y reviewed)
- Keyboard-driven workflow

## API Integration (`js/lib/api.js`)

Central module for all backend communication:

| Function | Purpose | Endpoint |
|----------|---------|----------|
| `fetchLatest()` | Current status | `CloudFront /latest/latest.json` |
| `fetchAnalysis(ts)` | Historical analysis | `CloudFront /analysis/v1/YYYY/MM/DD/HHMM.json` |
| `getImageUrl(keyOrTs)` | Construct image URL | `CloudFront /needle-cam/cropped-images/...` |
| `submitLabel(data)` | POST label correction | `/api/labels` (pending) |
| `fetchUnlabeled(limit)` | Get unlabeled queue | `/api/unlabeled` (pending) |
| `fetchLabels(start, end)` | Get labels for range | `/api/labels` (pending) |

**Data Normalization**: Handles multiple input formats, extracts top predictions from probability arrays, reconstructs S3 keys from timestamps.

## Configuration (`config/config.js`)

```javascript
api: {
  latestUrl: 'https://deaf937kouf5m.cloudfront.net/latest/latest.json',
  submitLabelUrl: '/api/labels',
  unlabeledUrl: '/api/unlabeled',
  labelsUrl: '/api/labels',
}
imageBaseUrl: 'https://deaf937kouf5m.cloudfront.net'
analysisVersion: 'v1'
historicalDataStart: '2025-01-01'
timeWindow: {
  startHour: 4,
  endHour: 22,
  intervalMinutes: 10,
}
refreshInterval: 60000
```

## Component Pattern

All components follow:
```javascript
class MyComponent {
  constructor(containerElement) { this.container = containerElement; }
  renderLoading() { /* loading spinner */ }
  renderError(message) { /* error state */ }
  render(data) { /* render with data */ }
}
```

## Design System

**NPS-inspired palette** (in `css/variables.css`):
- Primary: `#446443` (forest green)
- Dark: `#154c21`
- Brown accents: `#a86437`
- Danger: `#e52207`

CSS custom properties for all tokens. Mobile-first responsive design.

## Implementation Status

| Feature | Status |
|---------|--------|
| Public status page | ✅ Working |
| Timeline viewer | ✅ Working |
| History browser | ✅ Working |
| Crowdsource form UI | ✅ Working |
| Admin label UI | ✅ Working |
| Admin review UI | ✅ Working |
| Keyboard shortcuts | ✅ Working |
| Label submission API | ⏳ Endpoint not connected |
| Unlabeled queue fetch | ⏳ Endpoint not connected |
| Admin image loading | ⏳ Shows placeholder |

## Deployment

**Cloudflare Pages** (no build step):
- Build command: (empty)
- Build output directory: `/`
- Auto-deploys on push to main branch

No `wrangler.toml` needed—pure static site.

## What's Next

See [[Tasks and Roadmap]] for:
- Backend API endpoints for label submission
- Connect admin pages to real image queue
- Model toggle feature
- Calendar selector on main page

