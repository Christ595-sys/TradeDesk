import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getTradeSummaries } from '@/lib/tradeQueries';
import TradeJournal from '@/components/TradeJournal';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { startingBalance: true, role: true },
  });

  if (!user) redirect('/login');
  if (user.role === 'ADMIN') redirect('/admin');

  const trades = await getTradeSummaries(session.user.id);

  const userLabel = (session.user.name || session.user.email || '').toUpperCase();

  return (
    <TradeJournal
      userLabel={userLabel}
      initialTrades={trades}
      initialStartingBalance={user.startingBalance}
    />
  );
}
