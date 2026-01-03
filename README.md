# Tahoma Tracker — Frontend Website

The public-facing website for the Tahoma Tracker project, answering the simple question: **"Is Mt. Rainier out right now?"**

## Project Overview

This is a simple, static website built with vanilla HTML, CSS, and JavaScript. It:
- Displays the current visibility status of Mt. Rainier
- Shows the latest webcam image from the Space Needle
- Allows crowdsourced label corrections
- Provides admin tools for rapid labeling and review

## Technology Stack

- **HTML5** - Semantic, accessible markup
- **CSS3** - Modern styling with CSS custom properties
- **JavaScript (ES6 modules)** - Component-based architecture
- **Hosting** - Cloudflare Pages
- **Backend** - AWS (Lambda, S3, DynamoDB, API Gateway)

## Project Structure

```
tahomasite/
├── index.html              # Public status page
├── admin/
│   ├── label.html         # Admin rapid labeling interface
│   └── review.html        # Admin review interface
├── css/
│   ├── reset.css          # CSS reset
│   ├── variables.css      # Design tokens (colors, spacing, etc.)
│   ├── base.css           # Base styles (typography, layout)
│   ├── components.css     # Reusable components (buttons, cards)
│   └── pages/
│       ├── home.css       # Home page specific styles
│       └── admin.css      # Admin pages specific styles
├── js/
│   ├── main.js            # Entry point for home page
│   ├── admin/
│   │   ├── label.js       # Admin labeling page entry point
│   │   └── review.js      # Admin review page entry point
│   ├── lib/
│   │   └── api.js         # API client (fetch data, submit labels)
│   ├── components/
│   │   ├── StatusDisplay.js      # Status indicator component
│   │   ├── ImageViewer.js        # Image display component
│   │   ├── MetadataDisplay.js    # Metadata display component
│   │   └── LabelForm.js          # Labeling form component
│   └── utils/
│       ├── format.js      # Formatting utilities (dates, percentages)
│       ├── dom.js         # DOM manipulation helpers
│       └── keyboard.js    # Keyboard shortcut handler
├── assets/
│   └── images/
│       └── placeholder.jpg
├── config/
│   └── config.js          # Configuration (API URLs, settings)
├── latest.json            # Test data for local development
├── .gitignore
└── README.md
```

## Local Development

### Prerequisites

- A modern web browser (Chrome, Firefox, Safari, Edge)
- Python 3 (for local server) or a similar tool

### Running Locally

1. **Clone the repository**:
   ```bash
   cd ~/Documents/projects/mtrainier/tahomasite
   ```

2. **Start a local server**:
   ```bash
   python3 -m http.server 8000
   ```

   Or use VS Code's Live Server extension.

3. **Open in browser**:
   ```
   http://localhost:8000
   ```

4. **Test pages**:
   - Home page: `http://localhost:8000/`
   - Admin labeling: `http://localhost:8000/admin/label.html?token=test`
   - Admin review: `http://localhost:8000/admin/review.html`

### Local Development Notes

- The site currently uses a local `latest.json` file for testing
- Images point to local placeholder
- Admin pages show placeholder UI (backend API not yet connected)
- To connect to production backend, update URLs in `config/config.js`

## Configuration

Edit `config/config.js` to change:

- **API endpoints** - Point to production API Gateway URLs
- **Image base URL** - Point to S3/CloudFront for images
- **Date ranges** - Historical data start date
- **Refresh interval** - How often to poll for updates

Example for production:
```javascript
export const config = {
  api: {
    latestUrl: 'https://d123abc.cloudfront.net/latest/latest.json',
    submitLabelUrl: 'https://api.tahomatracker.com/labels',
    // ...
  },
  imageBaseUrl: 'https://d123abc.cloudfront.net/',
  // ...
};
```

## Deployment

### Cloudflare Pages

1. **Create GitHub repository**:
   ```bash
   cd ~/Documents/projects/mtrainier/tahomasite
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/tahomasite.git
   git push -u origin main
   ```

2. **Connect to Cloudflare Pages**:
   - Log in to Cloudflare dashboard
   - Go to Pages → Create a project
   - Connect to GitHub repository
   - Configure build settings:
     - **Build command**: (leave empty)
     - **Build output directory**: `/`
     - **Root directory**: `/`

3. **Set environment variables** (if needed):
   - None required for static site
   - Can use Cloudflare Workers for dynamic config

4. **Deploy**:
   - Push to `main` branch
   - Cloudflare auto-deploys on every push

### Custom Domain (Optional)

- Add custom domain in Cloudflare Pages settings
- Configure DNS records (CNAME to Cloudflare Pages)

## Features

### Public Pages

- **Status Page** (`/`):
  - Current visibility status (YES/NO/UNKNOWN)
  - Latest webcam image
  - Confidence score and metadata
  - Auto-refreshes every 60 seconds
  - Crowdsource label correction form (collapsible)

### Admin Pages

- **Rapid Labeling** (`/admin/label.html`):
  - Keyboard-driven interface (G/F/D/B for frame state, O/P/N for visibility)
  - Two navigation modes (queue, cursor)
  - Date/time picker for jumping to specific images
  - Auto-advance after labeling

- **Review** (`/admin/review.html`):
  - Review "out" and "partial" labels
  - Quick corrections (confirm, change to partial, change to not out)
  - Progress tracking

## Keyboard Shortcuts (Admin Pages)

### Labeling Page

- **Frame State**:
  - `G` - Mark as Good
  - `F` - Mark as Off-Target
  - `D` - Mark as Dark
  - `B` - Mark as Bad/Blurry

- **Visibility** (only if frame = good):
  - `O` - Mark as Out (visible)
  - `P` - Mark as Partial
  - `N` - Mark as Not Out

- **Navigation**:
  - `←` - Previous image
  - `→` - Next image
  - `Space` - Next unlabeled image
  - `?` - Toggle help

### Review Page

- `C` - Confirm label is correct
- `P` - Change to Partial
- `N` - Change to Not Out
- `S` - Skip

## Code Style

- **HTML**: Semantic tags, ARIA labels, data attributes for JS hooks
- **CSS**: BEM-like naming, CSS custom properties, mobile-first responsive
- **JavaScript**: ES6 modules, component-based, async/await

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- ES6 modules required (no IE11 support)
- CSS custom properties required

## TODO

See [Tasks and Roadmap](../ObsidianPersonalVault/Projects/mtrainier/Tasks%20and%20Roadmap.md) for full list.

**MVP (Required)**:
- [ ] Connect to backend API (Lambda + API Gateway)
- [ ] Implement S3/CloudFront access for images
- [ ] Complete admin labeling page (fetch unlabeled images, navigate)
- [ ] Complete admin review page (fetch labeled images)
- [ ] Deploy to Cloudflare Pages

**Nice to Have**:
- [ ] Historical browser page
- [ ] Manifest-based batch loading for performance
- [ ] Progressive loading with chunking
- [ ] Offline mode / service worker

## License

Personal side project - not for commercial use.

## Links

- **Backend Repository**: `~/Documents/projects/mtrainier/tahomacdk`
- **POC Code**: `~/Documents/projects/mtrainier/poc`
- **Documentation**: `~/Documents/ObsidianPersonalVault/Projects/mtrainier/`
