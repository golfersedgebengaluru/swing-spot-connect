

## Make EdgeCollective Installable on Mobile (Add to Home Screen)

### What This Does
Adds a web app manifest so users visiting `golfersedge.golf-collective.com` on their phone can tap "Add to Home Screen" and get a native-looking app icon — no app store needed. The app opens full-screen without a browser address bar.

### What You Need to Provide
- A **square PNG icon**, ideally **512x512 pixels** (upload it in the chat)

### Implementation Steps

1. **Copy the uploaded icon** to `public/` directory (e.g., `public/app-icon-512.png`)

2. **Create `public/manifest.json`** with:
   - `name`: "EdgeCollective - Golfer's Edge"
   - `short_name`: "EdgeCollective"
   - `start_url`: "/"
   - `display`: "standalone"
   - `background_color` and `theme_color` matching app branding
   - Icon references at 192x192 and 512x512 sizes

3. **Update `index.html`** to link the manifest:
   - Add `<link rel="manifest" href="/manifest.json">`
   - Add `<meta name="apple-mobile-web-app-capable" content="yes">`
   - Add `<link rel="apple-touch-icon" href="/app-icon-512.png">`
   - Add `<meta name="theme-color">` for the browser toolbar color

### No Service Workers
This is a lightweight manifest-only approach — no service workers, no offline caching, no interference with the Lovable preview. It simply makes the app installable.

### How Users Install It
- **iPhone**: Open the site in Safari → tap Share → "Add to Home Screen"
- **Android**: Open in Chrome → tap the 3-dot menu → "Add to Home Screen" (or accept the install prompt)

