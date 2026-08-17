import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

async function getAccount(userId) {
  const [user, pnl] = await prisma.$transaction([
    prisma.user.findUnique({
      where: { id: userId },
      select: { startingBalance: true },
    }),
    prisma.trade.aggregate({
      where: { userId, pnl: { not: null } },
      _sum: { pnl: true },
    }),
  ]);

  if (!user) return null;
  const totalPnl = pnl._sum.pnl ?? 0;
  return {
    startingBalance: user.startingBalance,
    totalPnl,
    currentBalance: user.startingBalance + totalPnl,
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const account = await getAccount(session.user.id);
  if (!account) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
  return NextResponse.json(account);
}

export async function PATCH(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { startingBalance } = await req.json();
  const value = Number(startingBalance);
  if (!Number.isFinite(value) || value < 0) {
    return NextResponse.json({ error: 'Enter a valid starting balance.' }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { startingBalance: value },
  });

  return NextResponse.json(await getAccount(session.user.id));
}
