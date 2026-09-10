# Light deployment

Recommended low-cost stack:

- Dashboard: Vercel
- API and WebSocket: Render
- PostgreSQL: Neon
- Browser extension: downloadable ZIP or Chrome Web Store

The cloud API must use HTTPS. The extension converts it to WSS automatically for its WebSocket connection.

## 1. Put the project in a Git repository

This folder is not currently a Git repository. Create a private GitHub repository, then run:

```powershell
git init
git add .
git commit -m "Prepare Light for deployment"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/light.git
git push -u origin main
```

Never commit `.env`; it is already ignored.

## 2. Create the Neon PostgreSQL database

1. Create a free project at <https://neon.com/>.
2. Copy its PostgreSQL connection string.
3. Keep `sslmode=require` in the URL.
4. Use this URL as `DATABASE_URL` on Render.

Local development continues to use `apps/api/prisma/schema.prisma` with SQLite. Render uses
`apps/api/prisma/schema.postgresql.prisma`, so the current local database is not changed.

## 3. Deploy the API on Render

1. Open <https://dashboard.render.com/blueprints>.
2. Create a Blueprint from the GitHub repository.
3. Render will detect `render.yaml`.
4. Enter the requested values:
   - `DATABASE_URL`: Neon connection string
   - `GEMINI_API_KEY`: Gemini server API key
   - `API_URL`: the final Render service URL, such as `https://light-api.onrender.com`
   - `WEB_URL`: use a temporary expected Vercel URL for the first deploy
   - `CORS_ORIGINS`: use the same temporary Vercel URL
5. Deploy and open `https://YOUR_RENDER_URL/api/health`.

A healthy response includes `"ok": true` and `"database": "connected"`.

Render generates the JWT, cookie, and extension-token secrets. Do not replace them after users have
registered or paired extensions, because doing so invalidates existing sessions.

## 4. Deploy the dashboard on Vercel

1. Import the same GitHub repository at <https://vercel.com/new>.
2. Keep the repository root as the project root; `vercel.json` supplies the monorepo build settings.
3. Add these environment variables before deploying:

```text
NEXT_PUBLIC_API_URL=https://YOUR_RENDER_URL
NEXT_PUBLIC_WS_URL=wss://YOUR_RENDER_HOST
NEXT_PUBLIC_APP_NAME=Light
```

For example, if the API is `https://light-api.onrender.com`, the WebSocket URL is
`wss://light-api.onrender.com`.

4. Deploy and copy the final Vercel URL.
5. In Render, update both `WEB_URL` and `CORS_ORIGINS` to the exact Vercel URL without a trailing slash.
6. Redeploy/restart the Render service.

## 5. Build the production extension

From PowerShell, pass the deployed Render API URL:

```powershell
.\scripts\build-extension-production.ps1 -ApiUrl "https://YOUR_RENDER_URL"
```

The distributable file is:

```text
artifacts/light-extension.zip
```

The deployed Gemini key is never included in the extension.

## 6. Install on another computer

1. Copy/download `light-extension.zip`.
2. Extract it.
3. Open `chrome://extensions`.
4. Enable Developer mode.
5. Select **Load unpacked** and choose the extracted folder containing `manifest.json`.
6. Open the deployed Light dashboard and register/login.
7. Generate a pairing code from onboarding.
8. Open the Light extension and enter the pairing code.
9. Allow website and microphone permissions when Chrome asks.

For one-click installation and automatic updates, upload `light-extension.zip` to the Chrome Web
Store instead. Store publishing requires its developer registration and review process.

## Free-tier behavior

- Render free services can sleep when inactive, so the first connection may take up to about a minute.
- Neon can scale to zero when idle.
- The extension reconnects automatically after the API wakes.
- Open the API health URL shortly before a live demo to avoid the initial cold start.

## Updating

- Dashboard/API: push to `main`; Vercel and Render deploy automatically.
- Unpacked extension: rebuild the ZIP and reinstall/reload it manually.
- Chrome Web Store extension: upload the new ZIP with an incremented manifest version.
