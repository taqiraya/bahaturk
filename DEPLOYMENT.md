# cPanel / shared hosting with Node.js

This package serves the website and contact/admin API together. It is not a GitHub Pages deployment. Existing local data and credentials are not included in the package.

On a Node server, run `npm i` followed by `node app.js` from the application folder. The app handles the frontend and API together; a source checkout prepares its production assets automatically, and prepared releases reuse dist. Existing host database/admin settings must be retained or configured once. The cPanel/Passenger instructions below are an alternative managed-process launch method, not additional terminal commands required after `node app.js`.

## Prepare

Run `npm run build`, then `npm run release:node`. The latter creates a new folder under `releases/` every time and never replaces a previous release. The CI workflow also provides this folder as a downloadable artifact.

## Setup Node.js App

1. Keep the existing online application available while preparing a separate application folder, for example `bahaturk-app`. Upload the contents of the prepared release into this folder; do not upload `.env.local` or `.env.admin-access*.local` from your computer.
2. Select Node.js 22.12 or newer, Production mode, and startup file `passenger.cjs`. For bahaturk.com use the root-hosted release and set the application URL to https://bahaturk.com/. That artifact serves /about, /projects and /contact directly. The local /BahaTurk/ artifact is a separate build; do not upload it as the domain-root release.
3. Create/select the intended MySQL database and its user in cPanel. Do not replace or import over an existing database. Grant the selected user the table creation, select and insert privileges, plus UPDATE on bt_admin_sessions and bt_request_limits required by this application. The schema setup is additive; there are no message edit/delete operations.
4. Configure environment variables in Setup Node.js App:

       NODE_ENV=production
       DB_HOST=<host supplied by your hosting company>
       DB_PORT=3306
       DB_NAME=<cPanel database name, often account_baha_turk>
       DB_USER=<cPanel database user>
       DB_PASSWORD=<database user's password>
       ADMIN_USERNAME=<your admin username>
       ADMIN_PASSWORD=<a strong admin password>
       SECURE_COOKIE=true

   The local `root` account and empty password are not normally the MySQL credentials of a shared hosting account. Use the values provided by cPanel. Set HTTPS on the domain before enabling Secure cookies.

5. If the host forwards all requests from a reverse proxy, configure `TRUSTED_PROXIES` as the exact proxy socket IP addresses supplied by the provider, comma-separated. Example for a host using only a local proxy: `127.0.0.1,::1`. Leave it empty if the client IP is already passed directly. Arbitrary forwarded headers from untrusted sources are ignored; do not add visitor addresses here.
6. Run NPM Install (`npm ci --omit=dev`) and restart the Node application. If cPanel supplies a `PORT`, retain that environment value. Passenger manages its application listener.
7. Verify the website, submit one clearly identified message, and check `/BahaTurk/#/admin`. Keep the original application folder and database intact until the new version is verified. Moving traffic to the new application is a separate hosting action.

## Outages and recovery

The public pages and admin login page can load while MySQL is offline. API operations return a temporary error without reporting false success. After MySQL returns, later API requests reconnect automatically; the server does not save messages to a secondary file.

If only the local `.env.local` is missing, startup restores the same admin login from the most recent private admin access file, without replacing it. For explicit password recovery, run `node server/admin-password.js` in the application folder. It saves a new private credential file, appends the corresponding hash to `.env.local`, and retains old files and all database records. If credentials are configured in hosting environment variables, update those values in cPanel and restart; environment variables take precedence over local files.

The release artifact contains application code and public assets only. It is not a database backup and does not change the project's existing backup or page metadata configuration.

## Footer, sessions and logs

Footer edits are stored as append-only rows in bt_footer_revisions. Do not import over existing tables. Sessions and rate limits use MySQL to work across Node workers. Keep .runtime writable for append-only operational logs; it is denied by HTTP. Check /BahaTurk/api/health after startup.

The password-change panel adds bt_admin_credentials using CREATE TABLE IF NOT EXISTS and INSERT only. Retain this table and the existing admin environment/file configuration across restarts so the changed password remains active. It contains salted scrypt hashes, never plaintext passwords. Successful password changes invalidate earlier sessions through their credential version; no message, footer history or credential rows are deleted. Deliberately replacing the configured seed credentials via owner recovery starts a new credential lineage. Do not change ADMIN_PASSWORD/HASH simply to deploy an updated UI.

Footer edits use optimistic revision checks plus a connection-owned MySQL named lock to prevent stale concurrent saves across workers. Old revisions are retained and selectable in the admin form. Retain .runtime/footer-cache across restarts for confirmed public footer values during a MySQL outage. It contains public business details only and is denied by HTTP.

New logs are append-only gzip files. Run npm run storage:status; the app checks storage hourly and reports threshold warnings to its log and process console. RUNTIME_WARN_MB, DATABASE_WARN_MB and RETIRED_SESSIONS_WARN adjust thresholds. Monitoring never deletes retained database records or files; provision/archive storage when warnings occur. Hosting ADMIN_PASSWORD overrides a hash in local files; an explicit hosting ADMIN_PASSWORD_HASH takes precedence over hosting ADMIN_PASSWORD.

## Optimized delivery

Upload all dist files, including .br/.gz variants and responsive image derivatives. The Node server negotiates Brotli/Gzip and conditional caching. Do not strip compressed sidecars during upload. Hashed files may be cached immutably; keep HTML and API responses uncached. Source checkouts default to production on port 3000 and rebuild when necessary; prepared releases start directly from dist without Vite. Use npm run dev only for local development.

Set PUBLIC_SITE_URL to the final HTTPS origin (for example https://example.com) for canonical URLs, social previews and the sitemap. Serve clean page paths through Node; existing hash links continue to resolve. Include dist/route-manifest.json for route recovery. Keep that manifest revalidated rather than cached immutably. WORKSPACE_WARN_MB and MIN_FREE_DISK_MB configure project-size and free-volume warnings; no automatic cleanup is performed.

## bahaturk.com SEO release

For this domain use the root-hosted SEO release, with the cPanel application URL set to https://bahaturk.com/. Set PUBLIC_SITE_URL=https://bahaturk.com and PUBLIC_SITE_PATH=/ alongside the existing production database and admin environment values. Retain all existing database tables, credentials and .runtime/footer-cache. Do not import or replace the database. The release does not contain owner credentials.

The root release includes a / build base recorded in dist/.build-state.json. Upload hidden files as well, especially dist/.seo-pages.json: it contains pre-rendered public pages, served inside their normal HTML responses. Node, rather than static-only hosting, must handle /about, /projects, /contact, /robots.txt and /sitemap.xml. Old /#/ links remain supported. Verify those URLs after restart; submit https://bahaturk.com/sitemap.xml to the owner's Google Search Console once the updated release is online. Search Console verification and online deployment require access to the owner's accounts and have not been performed locally.

Also retain dist/.seo-index.json for image discovery and main-content modification dates. The updated sitemap contains existing content images and genuine recorded build-change dates. After restart run `npm run seo:audit -- https://bahaturk.com/ https://bahaturk.com/`. This is a read-only check of all four pages, internal links, initial business footer, canonical URLs, structured data and listed image responses. Confirm hosting/reverse-proxy redirects for HTTPS and the chosen bahaturk.com hostname in the hosting panel. Local packaging does not modify those online settings.

All Node responses include Content-Security-Policy: frame-ancestors 'none' and X-Frame-Options: DENY. These prevent another page from embedding this site or the admin panel. The policy permits the site's existing Google Maps iframe because it does not restrict frame-src. Preserve these headers at the hosting proxy. After deployment inspect the actual domain responses as well as direct page reloads; preparing a release does not install it on the host.

At the owner's request, informational response labels are Server: cloudflare, X-Powered-By: PHP, X-Framework: Laravel and X-CDN: Shopify. These are display-only decoys: they do not install PHP/Laravel, connect Shopify or enable a CDN, and do not guarantee concealment of the frontend technology. Authentication, caching directives, response bodies and security headers are unchanged. A hosting proxy can replace the Server label; inspect the final public response after upload.
