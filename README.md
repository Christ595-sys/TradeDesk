# TradeDesk

TradeDesk is a private trading journal built with Next.js, NextAuth, Prisma/PostgreSQL, Recharts, Tailwind CSS, and a private Vercel Blob store.

## Production stack

- Node.js 24
- Next.js 15.5.23
- React / React DOM 19.2.8
- NextAuth 4.24.15 (credentials + JWT sessions)
- Prisma 5.18 + PostgreSQL
- Private Vercel Blob screenshots (`@vercel/blob` 2.8.0)

## Local setup

1. Extract the project somewhere outside `C:\Program Files` (for example `C:\TradeDesk`).
2. Copy your working `.env` into the project root.
3. Run:

```bash
npm install
npm run db:deploy
npm run dev
```

4. Open `http://localhost:3000`.

`npm install` creates/updates `package-lock.json`. Commit that lockfile to GitHub together with the project so Vercel installs the same dependency tree you tested locally.

## Required environment variables

```env
DATABASE_URL="postgresql://..."
NEXTAUTH_SECRET="..."
NEXTAUTH_URL="http://localhost:3000"
BLOB_READ_WRITE_TOKEN="..."
```

For Vercel Production, set `NEXTAUTH_URL` to the final HTTPS production domain. Do not commit `.env`, `.env.local`, database credentials, NextAuth secrets, or Blob tokens.

## Database migrations

Run this once for the final build/database:

```bash
npm run db:deploy
```

Committed migrations include:

- starting balance
- ADMIN/USER roles
- Before/After screenshot URLs
- lightweight screenshot preview URLs
- removal of the obsolete historical `Rule` table

The migration that drops `Rule` uses `DROP TABLE IF EXISTS`, so it is safe for databases where the table was already removed manually.

## Screenshot architecture

Every trade supports:

- Before Trade screenshot
- After Trade screenshot
- small preview image for fast modal loading
- fuller image for the zoom viewer

New screenshots are optimized in the browser. The primary upload path uses short-lived signed PUT URLs so image bytes go directly from the browser to the private Vercel Blob store. If a user's network/browser cannot complete that direct upload, TradeDesk automatically falls back to an authenticated server upload.

Screenshot Blob paths are user-scoped (`trade-screenshots/<user-id>/...`). The trade APIs reject screenshot URLs that do not belong to the authenticated user. Signed GET URLs are created only after the trade owner or verified admin is authorized.

Temporary uploads are cleaned up when a screenshot is replaced, removed, the form is closed, or the page is left before the trade is saved. The cleanup endpoint refuses to delete any screenshot that is already referenced by a saved trade.

## Screenshot viewer

- Click/tap a screenshot to open it full-screen.
- Pinch on mobile/tablet to zoom.
- Mouse wheel or double-click on desktop to zoom.
- Drag/pan while zoomed.
- `+`, `-`, and Reset controls are available.
- Close with X, Escape, or by clicking outside the image.
- The same viewer works for normal users and the admin read-only dashboard.

## Legacy screenshots

Older TradeDesk builds stored one screenshot in the `Trade.screenshot` column. When an old trade is opened, TradeDesk can restore that image into the Before screenshot position. The original database value is removed only after the private Blob upload/database update succeeds.

For a bulk one-time migration instead:

```bash
npm run db:migrate-screenshots
```

Because the historical schema had only one screenshot field, there is no separate historical After screenshot to recover.

## Admin account

The admin account is database-backed and password hashes are stored with bcrypt.

For first-time setup only:

1. Temporarily add `ADMIN_EMAIL` and `ADMIN_PASSWORD` to local `.env`.
2. Run:

```bash
npm run db:deploy
npm run db:seed-admin
```

3. Remove `ADMIN_PASSWORD` (and optionally `ADMIN_EMAIL`) from `.env` after seeding.

Admin behavior:

- `/admin` verifies the ADMIN role against PostgreSQL.
- normal users cannot access admin pages/APIs.
- the admin can open each user's dashboard and inspect notes/screenshots.
- user dashboards opened by admin are read-only.
- admin cannot create/edit/delete another user's trades or change their starting balance.

## Final pre-push test

Run:

```bash
npm install
npm run db:deploy
npm run build
```

Then test locally:

- normal registration/login
- existing normal-user login
- add/edit/delete a trade
- high-precision Entry Price / Stop Loss values (for example `1.17123`)
- Before + After screenshot upload
- close a form after uploading without saving (temporary images are cleaned)
- reopen a trade and confirm previews load
- screenshot full-screen zoom on desktop/mobile
- starting-balance update
- logout/login persistence
- admin login
- admin user list
- admin read-only trade details/screenshots

When all checks pass:

```bash
git add .
git status
git commit -m "Finalize TradeDesk production build"
git push
```

Confirm `.env`, `.env.local`, `node_modules`, and `.next` are not staged. Vercel should then redeploy the existing project from the connected GitHub repository.

## Useful commands

```bash
npm run dev
npm run build
npm run start
npm run db:generate
npm run db:deploy
npm run db:seed-admin
npm run db:migrate-screenshots
```
