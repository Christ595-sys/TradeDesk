import { notFound, redirect } from 'next/navigation';
import { getVerifiedAdmin } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';
import { getTradeSummaries } from '@/lib/tradeQueries';
import TradeJournal from '@/components/TradeJournal';

export default async function AdminUserDashboardPage({ params }) {
  const { session, admin } = await getVerifiedAdmin();
  if (!session) redirect('/login');
  if (!admin) redirect('/dashboard');

  const user = await prisma.user.findFirst({
    where: { id: params.userId, role: 'USER' },
    select: { id: true, email: true, name: true, startingBalance: true },
  });

  if (!user) notFound();

  const trades = await getTradeSummaries(user.id);
  const userLabel = (user.name || user.email || '').toUpperCase();

  return (
    <TradeJournal
      userLabel={userLabel}
      initialTrades={trades}
      initialStartingBalance={user.startingBalance}
      readOnly
      adminBackHref="/admin"
      tradeDetailBasePath={`/api/admin/users/${user.id}/trades`}
    />
  );
}
