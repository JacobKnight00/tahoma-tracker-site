# Tahoma Tracker — Frontend Website

The public-facing website for the Tahoma Tracker project, answering the simple question: **"Is Mt. Rainier out right now?"**

## Project Overview

This is a simple, static website built with vanilla HTML, CSS, and JavaScript. It:
- Displays the current visibility status of Mt. Rainier
- Shows the latest webcam image from the Space Needle
- Allows crowdsourced label corrections
- Provides admin tools for rapid labeling and model comparison

## Technology Stack

- **HTML5** - Semantic, accessible markup
- **CSS3** - Modern styling with CSS custom properties
- **JavaScript (ES6 modules)** - Component-based architecture
- **Hosting** - Cloudflare Pages (with Pages Functions for API proxy)
- **Backend** - AWS (Lambda, S3, DynamoDB)

## Project Structure

```
tahomasite/
├── index.html              # Public status page
├── about.html              # About the project page
├── admin/
│   ├── label.html          # Admin rapid labeling interface
│   └── compare.html        # Model comparison interface
├── css/
│   ├── reset.css           # CSS reset
│   ├── variables.css       # Design tokens (colors, spacing, etc.)
│   ├── base.css            # Base styles (typography, layout)
│   ├── components.css      # Reusable components (buttons, cards)
│   └── pages/
│       ├── home.css        # Home page specific styles
│       ├── about.css       # About page specific styles
│       └── admin.css       # Admin pages specific styles
├── js/
│   ├── main.js             # Entry point for home page
│   ├── admin/
│   │   ├── label.js                  # Admin labeling page entry point
│   │   ├── AdminLabelingController.js # Labeling state management
│   │   ├── compare.js                # Model comparison page entry point
│   │   └── CompareController.js      # Comparison state management
│   ├── lib/
│   │   └── api.js          # API client (fetch data, submit labels)
│   ├── components/
│   │   ├── StatusDisplay.js    # Status indicator component
│   │   ├── ImageViewer.js      # Image display component
│   │   ├── MetadataDisplay.js  # Metadata display component
│   │   ├── LabelForm.js        # Labeling form component
│   │   ├── TimelineViewer.js   # Timeline/playback component
│   │   └── CalendarPicker.js   # Date selection component
│   └── utils/
│       ├── format.js       # Formatting utilities (dates, percentages)
│       ├── dom.js          # DOM manipulation helpers
│       └── keyboard.js     # Keyboard shortcut handler
├── functions/              # Cloudflare Pages Functions (API proxy)
│   └── api/
│       ├── labels.js       # Crowdsource label submission proxy
│       └── admin/
│           ├── labels.js   # Admin labels API proxy
│           └── labels/
│               └── batch.js # Admin batch submission proxy
├── config/
│   └── config.js           # Configuration (API paths, settings)
├── assets/
│   └── images/
└── README.md
```

## Security

### Admin Page Protection

Admin pages (`/admin/*`) are protected by **Cloudflare Access** using email OTP authentication. This operates at the Cloudflare edge—unauthenticated requests never reach the site.

### API Proxy Pattern

Backend Lambda Function URLs are never exposed to the browser. Instead, API calls go through Cloudflare Pages Functions that:
1. Read Lambda URLs from environment variables (server-side only)
2. Forward requests with an `X-Api-Secret` header for backend validation
3. Return responses to the client

This provides defense-in-depth: even if someone bypasses Cloudflare Access, they can't call the Lambda directly without the shared secret.

## Local Development

### Prerequisites

- A modern web browser (Chrome, Firefox, Safari, Edge)
- Python 3 (for simple static server) or Node.js (for full API testing with Wrangler)

### Option A: UI-Only Testing (Simple)

Use Python's built-in server to view the UI. API calls will fail, but you can test layouts and navigation:

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080` in your browser.

### Option B: Full Local Testing with APIs (Wrangler)

To test the API proxy functions locally, use Cloudflare's Wrangler CLI:

1. **Install Wrangler** (if not already):
   ```bash
   npm install -g wrangler
   ```

2. **Create `.dev.vars`** file in the project root (this is gitignored):
   ```
   SUBMIT_LABEL_LAMBDA_URL=https://your-label-lambda.lambda-url.us-west-2.on.aws/
   ADMIN_LABELS_LAMBDA_URL=https://your-admin-lambda.lambda-url.us-west-2.on.aws/
   API_SHARED_SECRET=your-secret-here
   ```

3. **Run with Wrangler**:
   ```bash
   npx wrangler pages dev . --port 8080
   ```

This runs the Pages Functions locally, so API calls work just like in production.

### Test Pages

- Home page: `http://localhost:8080/`
- About page: `http://localhost:8080/about.html`
- Admin labeling: `http://localhost:8080/admin/label.html`
- Model comparison: `http://localhost:8080/admin/compare.html`

### Notes

- Use ports 8080–8090 for CORS compatibility with the Lambda backend
- With Wrangler, the `.dev.vars` file provides secrets locally (it's gitignored)
- With Python server, you can browse the UI but API calls will fail

## Configuration

### Environment Variables (Cloudflare Pages)

Set these in the Cloudflare Pages dashboard under Settings → Environment variables:

| Variable | Description |
|----------|-------------|
| `SUBMIT_LABEL_LAMBDA_URL` | Lambda Function URL for crowdsource label submission |
| `ADMIN_LABELS_LAMBDA_URL` | Lambda Function URL for admin labels API |
| `API_SHARED_SECRET` | Shared secret for backend validation (encrypt this) |

### config/config.js

The frontend config uses relative paths that get proxied through Pages Functions:

```javascript
export const config = {
  api: {
    submitLabelUrl: '/api/labels',
    adminLabelsUrl: '/api/admin/labels',
    adminBatchUrl: '/api/admin/labels/batch',
  },
  imageBaseUrl: 'https://your-cloudfront-distribution.cloudfront.net',
  // ...
};
```

The `imageBaseUrl` points directly to CloudFront (public CDN, no proxy needed).

## Deployment

### Cloudflare Pages Setup

1. **Connect to Cloudflare Pages**:
   - Log in to Cloudflare dashboard → Pages → Create a project
   - Connect to your GitHub repository
   - Configure build settings:
     - **Build command**: (leave empty)
     - **Build output directory**: `/`
     - **Root directory**: `/`

2. **Set environment variables**:
   - Go to Settings → Environment variables
   - Add `SUBMIT_LABEL_LAMBDA_URL`, `ADMIN_LABELS_LAMBDA_URL`, `API_SHARED_SECRET`
   - Click "Encrypt" for `API_SHARED_SECRET`
   - Save

3. **Set up Cloudflare Access** (for admin pages):
   - Go to Cloudflare Zero Trust → Access → Applications
   - Create an application for `/admin/*` path
   - Configure authentication (email OTP recommended)

4. **Deploy**:
   - Push to `main` branch
   - Cloudflare auto-deploys and picks up the `functions/` directory

### Custom Domain (Optional)

- Add custom domain in Cloudflare Pages settings
- Configure DNS records (CNAME to Cloudflare Pages)

## Features

### Public Pages

- **Status Page** (`/`):
  - Current visibility status (YES/NO/UNKNOWN)
  - Latest webcam image with timeline playback
  - Confidence score and metadata
  - Auto-refreshes every 60 seconds
  - Crowdsource label correction form

- **About Page** (`/about.html`):
  - Project background and motivation
  - Technical overview

### Admin Pages

- **Rapid Labeling** (`/admin/label.html`):
  - Keyboard-driven interface for fast labeling
  - Advanced filtering by date, confidence, label source
  - Batch submission with auto-submit at threshold
  - Progress tracking

- **Model Comparison** (`/admin/compare.html`):
  - Compare predictions between model versions
  - Filter by agreement/disagreement
  - Navigate through differences

## Keyboard Shortcuts (Admin Labeling)

### Frame State
- `G` - Mark as Good
- `F` - Mark as Off-Target
- `D` - Mark as Dark
- `B` - Mark as Bad/Blurry

### Visibility (only if frame = good)
- `O` - Mark as Out (visible)
- `P` - Mark as Partial
- `N` - Mark as Not Out

### Navigation
- `←` / `→` - Previous / Next image
- `S` - Skip image
- `Enter` - Submit batch

## Code Style

- **HTML**: Semantic tags, ARIA labels, data attributes for JS hooks
- **CSS**: BEM-like naming, CSS custom properties, mobile-first responsive
- **JavaScript**: ES6 modules, component-based, async/await

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- ES6 modules required (no IE11 support)
- CSS custom properties required

## License

Personal side project - not for commercial use.
