# Baha Turk Construction Company

React/Vite website with a Node.js + MySQL contact inbox. The public design and existing db.json content are preserved.

## Start the website

Requirements: Node.js 22.12+ and a running MySQL/MariaDB server.

Run these commands from the project folder:

    npm i
    node app.js

If dependencies are already installed, only node app.js is needed. node app.js and npm start serve the optimized production build on port 3000. A local source checkout automatically rebuilds when source inputs change; unchanged starts reuse dist. For development/HMR, use npm run dev (node app.js --dev). Hosting releases already contain dist and need no Vite/build dependencies.

The same `npm i` then `node app.js` commands run on a Node-capable server. No separate frontend/API terminal or manual build command is required. Build tools needed by a source checkout are installed even when npm omits development-only dependencies. Prepared hosting releases reuse their existing dist. The hosting environment must provide its database credentials once; existing .env/.env.local or configured environment variables and admin login are preserved. Node 22.12+ and a running MySQL/MariaDB service are prerequisites, installed independently of npm.

- Website: http://127.0.0.1:3000/
- Contact: http://127.0.0.1:3000/contact
- Admin: http://127.0.0.1:3000/admin

The default build serves the domain root locally and on hosting. Previous /BahaTurk/ links redirect to their root equivalents, preserving query strings and HTTP methods. Legacy hash bookmarks remain supported. Existing browser drafts and footer caches remain recoverable; migration does not delete their earlier records. SITE_BASE_PATH is available only for an explicitly requested subfolder installation.

The launcher serves React and the contact API on one port. It does not launch the old writable JSON Server against db.json.

## Database and admin login

Local database defaults:

    DB_HOST=127.0.0.1
    DB_PORT=3306
    DB_NAME=baha_turk
    DB_USER=root
    DB_PASSWORD=
    HOST=127.0.0.1
    PORT=3000

Set overrides in .env.local or environment variables. .env.example documents the settings. Do not prefix secrets with VITE_.

The first database operation creates baha_turk only if missing, then creates the contact, session, request-limit and footer-revision tables only if missing. Existing databases, tables and records are not replaced or imported. Public page content remains in the original db.json; contact submissions are stored separately in MySQL.

For first-time development setup with npm run dev, a random admin password is generated if credentials are absent. Production startup requires existing/configured admin credentials:

- .env.admin-access.local: private username and scrypt hash for recovery. Initial or explicitly reset passwords are displayed once in the owner command terminal, never saved as plaintext.
- .env.local: admin username and password hash used by the server.

Both files are excluded from Git and denied by the web server. Keep them private and retain .env.local between restarts. To use your own credentials, configure ADMIN_USERNAME and ADMIN_PASSWORD_HASH, or supply ADMIN_PASSWORD through the server environment. The MySQL root account is separate from the admin login.

## Contact and inbox

The form validates full name, email and message. Phone and subject are optional. A success message appears only after MySQL confirms storage. Entered text remains in the form, including after connection failures. Retrying an unchanged submission uses the same identifier to prevent duplicate records.

The admin inbox requires login and displays newest messages first: sender, email, phone, subject, full message and received time. It refreshes every 15 seconds while visible and supports pagination. There are no edit or delete operations. Message text is rendered as text rather than executable HTML.

Admin sessions use HttpOnly cookies, expire after eight hours, and are stored as token hashes in MySQL. Sessions survive worker changes and restarts; changing credentials invalidates previous sessions. Submissions and failed login attempts share atomic MySQL rate limits across workers. Successful authentication resets its login quota. Database credentials stay on the server.

## Checks

    npm run lint
    npm test
    npm run build
    npm run test:database

Standard tests use an isolated in-memory API fixture and the public-data/navigation tests; CI does not need MySQL.

The explicit local test:database check requires MySQL, a built dist folder, and a matching private local admin access file. It verifies real HTTP submission, MySQL storage, authenticated retrieval, duplicate retries, Unicode and private files inside a transaction, then rolls back the synthetic insert. It never deletes existing records or modifies db.json.

## Production

    npm run build
    npm run start:production

Configure database and admin credentials before production startup. Behind HTTPS, set SECURE_COOKIE=true. Set HOST and PORT for the Node hosting environment. Public files and /BahaTurk/api/ must be served by the same Node app or routed to it by a reverse proxy.

The CI workflow now prepares a complete Node.js hosting artifact instead of publishing an incomplete static-only version. For the purchased shared hosting with Setup Node.js App, run npm run release:node and follow DEPLOYMENT.md. The startup file on cPanel is passenger.cjs; local startup remains node app.js. No online files are changed by packaging.

## Shared public data

Public database reads use the immutable build-time snapshot in src/api/client.js; changing that content requires rebuilding. Contact messages use src/api/contact.js and the server API, so new messages appear in the inbox without rebuilding the site.

## Reliability and access recovery

The website continues serving public pages when MySQL is offline. Message operations report a temporary failure and automatically reconnect on later requests. Configure TRUSTED_PROXIES only with exact reverse-proxy IP addresses supplied by the host, so rate limits distinguish visitors without trusting spoofed headers.

If .env.local is lost, the same admin login is recovered from the most recent private admin access file. For explicit credential recovery use node server/admin-password.js, then restart. Existing files and database records are retained. Hosting environment variables take precedence; update them in cPanel if they specify the admin password/hash.

## Editable footer

The admin sidebar contains only footer/contact settings, received contact messages and password change, in that order. Password change requires the current password and matching confirmation (8–128 characters), stores a scrypt hash in the additive bt_admin_credentials table, and invalidates previous sessions across workers without deleting them. The admin must sign in with the new password after success. No credential change occurs simply by installing this version. Message and footer records are not modified by password changes; unsaved footer drafts remain retained when moving between admin sections. The configured environment/file credentials act as the initial credential seed; explicitly replacing that seed through the existing owner recovery/configuration mechanism resets the active credential lineage.

After login at /BahaTurk/#/admin, use the footer settings form to edit both phone numbers, email, business address, Google Maps and Facebook/Instagram/YouTube links. Save confirms only after MySQL stores a new revision. Previous revisions are retained; existing footer values and public styling are preserved. Public footer values refresh on page load, window focus and every 30 seconds without rebuilding. Other page content remains unchanged. Footer writes require the revision loaded by the editor; stale writes return 409 without replacing newer values. The admin history panel can load a previous version into the form and save it as a new version. Confirmed public values are retained in browser storage and immutable private server snapshots for database outages.

## Operational checks

New server events are compressed and appended under .runtime/events-YYYY-MM-DD-HH.jsonl.gz without contact contents, credentials or visitor IPs. Retention is manual; the app deletes no log files. GET /BahaTurk/api/health checks database availability; run npm run healthcheck against the local server. Password verification uses asynchronous scrypt.

For isolated desktop/mobile browser tests, install Playwright browsers with npx playwright install chromium firefox webkit, then run npm run test:browser after building. Tests use a separate in-memory fixture and never the owner database.

## Storage monitoring and image originals

Run npm run storage:status to inspect runtime size, application table size and retained expired/revoked sessions. The running app checks hourly, logs changes in warnings, and writes warnings to the process console. Defaults: 100 MiB runtime files, 500 MiB application tables, 100,000 retired sessions. Configure RUNTIME_WARN_MB, DATABASE_WARN_MB and RETIRED_SESSIONS_WARN as needed. Monitoring never deletes or truncates records, files or history. Old plain JSONL logs are retained; new logs are gzip-compressed. Total retained storage can still grow, so warnings require operator action.

Image originals and a manifest of hashes, dimensions and quality measurements are kept privately in .media-originals/compression-1792829821553/. Eleven used images above 150,000 bytes were optimized with unchanged dimensions/crop, SSIM >= 0.99 at up to 1440px display width, and a 40.2% total reduction. Eight remain above 150,000 bytes to preserve image quality. Neither original images nor browser comparison screenshots are included in hosting releases. The optional scripts/optimize-images.cjs tool needs sharp supplied by IMAGE_TOOLS_MODULE or installed in its environment.

## Performance delivery

Production HTML is compressed with negotiated Brotli/Gzip. Build-time .br/.gz variants serve JavaScript, CSS, SVG and JSON without runtime file compression; identity, HEAD and conditional 304 requests remain supported. Sensitive authenticated API responses stay separate from static delivery. Hashed assets and responsive image derivatives use immutable caching; mutable public assets use ETag/Last-Modified revalidation, and footer HTML remains no-store. Old built assets are retained so already-open tabs can continue loading their chunks.

About, Projects, Contact and Admin are separate route chunks. Hover/focus warms only the target route; directly opened routes resolve before the initial render. ResponsiveImage emits native srcset/sizes and keeps every existing image class, crop and original fallback. Its sizing includes object-cover height and a quality margin; original raster files are retained.

Fonts keep their original glyph metrics, outlines, weights and complete unicode coverage across core/extended WOFF2 files. Current page glyphs are included in the preloaded core faces. Additional alphabets load the complementary face only when required. Original font files are retained. Build tools scripts/prepare-responsive-images.cjs and scripts/prepare-fonts.py are optional maintenance tools, not hosting runtime dependencies.

## Navigation and recovery

The existing logo covers page transitions for at least 300 ms and stays until the route and visible images/fonts finish loading or report a network error. A fixed bottom-right arrow appears after scrolling down and returns to the top; reduced-motion preferences are respected. Existing page layout and business content are retained.

Public pages use clean URLs under /BahaTurk/; previous /#/ links remain supported. Route-specific HTML includes titles, descriptions, canonical and social tags. Set PUBLIC_SITE_URL to the public HTTPS origin on hosting; sitemap.xml and robots.txt are generated by Node. A failed route chunk offers retry using route-manifest.json; failed responsive derivatives retry the retained original image.

Unsent contact drafts use sessionStorage in the current tab and survive refresh until that tab closes. After successful submission, only a confirmation marker remains in browser storage; the message remains in MySQL. Legacy contact drafts transfer safely from localStorage before their persistent copies are removed. Unsaved footer drafts continue using localStorage. Leaving unsaved work prompts for confirmation. Browser storage must be available; private browsing, clearing browser data or using another device cannot guarantee recovery. Submitted messages and confirmed footer revisions remain stored in MySQL. Footer history requests are serialized and duplicate revisions are suppressed.

Storage checks also include dist, releases, public assets, preserved originals and available disk space. WORKSPACE_WARN_MB defaults to 1024 and MIN_FREE_DISK_MB to 512. Dependency/tool caches are excluded from workspace totals. Monitoring never deletes files or records.

## SEO and domain deployment

All four public pages are pre-rendered from their existing React components at build time into private dist/.seo-pages.json. Node includes that public markup in the first HTML response for everyone; JavaScript continues mounting the existing application and logo transition. The pre-render process has no MySQL connection and includes no admin panel or browser drafts. Public data still comes from the same immutable build snapshot. Keep the hidden .seo-pages.json and .build-state.json files when uploading dist.

Organization, WebSite and page JSON-LD describe only existing content and confirmed footer contact details. Server snapshots and client footer refreshes keep these details consistent. No reviews, prices, opening hours or ratings are invented. Admin, unknown pages and APIs receive indexing restrictions. Existing index.html aliases redirect to the canonical page, preserving query parameters and legacy fragment links.

The confirmed online domain is https://bahaturk.com with public pages at its root. PUBLIC_SITE_URL=https://bahaturk.com and PUBLIC_SITE_PATH=/ control canonical and sitemap destinations independently of the local /BahaTurk/ development path. The existing online deployment needs the updated Node release to support direct /about, /projects and /contact paths. It is not changed by local builds. Root-hosted releases can be built separately with `pnpm exec vite build --base / --outDir .runtime/seo-root-dist` and packaged with RELEASE_DIST_DIR=.runtime/seo-root-dist. The Node runtime reads the build base from .build-state.json, so the local and root-hosted artifacts each serve the matching URLs.

The initial public HTML also includes the existing footer rendered from its React component and updated with the server's confirmed footer snapshot. Values are escaped and replaced in a single pass; special characters are preserved literally. Client rendering, saved revisions and the footer's appearance are unchanged. The build never reads MySQL.

The sitemap includes existing, locally resolvable content photos and background images. Inline/decorative small images, missing files and responsive variants are excluded. Private dist/.seo-index.json records content hashes and last significant main-content/metadata build dates; identical rebuilds retain lastmod rather than claiming a new page update. Keep this file across rebuilds and uploads, together with .seo-pages.json. Missing historical dates are not invented for older releases. Social previews use the corresponding page's existing image and verified dimensions; public pages permit large image previews.

Run `npm run seo:audit -- http://127.0.0.1:3000/BahaTurk/ https://bahaturk.com/` locally. After deployment run `npm run seo:audit -- https://bahaturk.com/ https://bahaturk.com/`. It performs only GET/HEAD requests: page status, unique titles/descriptions, canonicals, H1, initial footer, structured JSON, internal links, sitemap images and robots. It does not submit forms, edit data, verify Search Console ownership or promise ranking results.

Private admin recovery files contain hashes only. Existing plaintext recovery files are converted in place on startup without changing the configured password hash or the active login. Keep these files private. All dotfiles under the application URL, including .build-state.json and compressed variants, are denied by the web server.
