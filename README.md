# TradeDesk

A private, database-backed trading journal built with Next.js, NextAuth, Prisma, PostgreSQL, Recharts, and Tailwind CSS.

## Local setup

1. Install Node.js 22.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Fill in `DATABASE_URL`, `NEXTAUTH_SECRET`, and `NEXTAUTH_URL`.
5. Apply database migrations with `npm run db:deploy`.
6. Run `npm run dev`.
7. Open `http://localhost:3000`.

Do not commit `.env` or `.env.local`. They are intentionally ignored by Git.

## One-time admin account setup

The admin password is never committed to GitHub and is never stored as plaintext in PostgreSQL.

1. Temporarily add `ADMIN_EMAIL` and `ADMIN_PASSWORD` to your local `.env`.
2. Run `npm run db:deploy`.
3. Run `npm run db:seed-admin`.
4. After the seed succeeds, remove `ADMIN_PASSWORD` from `.env`. The database keeps the account and only the bcrypt password hash.

The admin signs in through the normal `/login` screen and is automatically routed to `/admin`.

## Admin dashboard behavior

- `/admin` is protected server-side and the ADMIN role is re-checked against the database.
- Normal users have no admin navigation or admin access.
- The admin user list shows registered users, trade counts, starting balances, and live balances.
- Clicking **View Dashboard** opens that user's TradeDesk dashboard.
- Admin user views are read-only: no trade creation, starting-balance edits, trade edits, or deletions.
- The admin can open a trade to inspect its notes and screenshot through an admin-only read endpoint.
- There are no admin write endpoints for another user's trades or balance.

## Useful commands

- `npm run dev` — local development server
- `npm run build` — production build test
- `npm run start` — run the production build locally
- `npm run db:generate` — regenerate Prisma Client
- `npm run db:deploy` — apply committed Prisma migrations
- `npm run db:seed-admin` — one-time admin seed; reads local `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env`

## GitHub

```bash
git init
git add .
git commit -m "Prepare TradeDesk for production"
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
```

## Vercel deployment

Before pushing to GitHub, run `npm run db:deploy` and `npm run db:seed-admin` locally against the production PostgreSQL database you plan to use. This applies the ADMIN role migration and creates the admin account once.

Then:

1. Import the GitHub repository into Vercel.
2. Keep the framework preset as **Next.js** and the default build command (`npm run build`).
3. Add `DATABASE_URL`, `NEXTAUTH_SECRET`, and `NEXTAUTH_URL` in **Project Settings → Environment Variables**.
4. Deploy.

Do not add `ADMIN_EMAIL` or `ADMIN_PASSWORD` to Vercel after the admin has been seeded. The application does not need the plaintext admin password at runtime.

The project pins Node.js 22 through `package.json` and `.nvmrc`.

## Performance changes retained

- Profit Factor remains removed.
- Dashboard data is server-loaded.
- Screenshot blobs are excluded from the initial trade list.
- Screenshots load only when a trade is opened.
- Large screenshots are compressed before upload.
- Equity updates locally after trade changes.
- Recharts is code-split.
- The unused global NextAuth session provider remains removed.
- Login avoids the unnecessary router refresh.
- Expensive continuous animations remain reduced.
