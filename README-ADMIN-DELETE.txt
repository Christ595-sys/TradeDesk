TradeDesk Admin Account Delete Patch

Copy these files into the matching paths of your current TradeDesk repo:

1. src/app/admin/page.js
2. src/components/AdminUserActions.jsx
3. src/app/api/admin/users/[userId]/route.js
4. src/lib/userAccountDeletion.js

No Prisma migration is required. Trade.user already uses onDelete: Cascade.

After copying:
  npm run build

Then test the admin dashboard with a disposable test user before pushing.
