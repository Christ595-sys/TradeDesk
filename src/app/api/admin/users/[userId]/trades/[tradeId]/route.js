import { NextResponse } from 'next/server';
import { getVerifiedAdmin } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';

export async function GET(req, { params }) {
  const { session, admin } = await getVerifiedAdmin();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const trade = await prisma.trade.findFirst({
    where: {
      id: params.tradeId,
      userId: params.userId,
      user: { is: { role: 'USER' } },
    },
  });

  if (!trade) return NextResponse.json({ error: 'Trade not found.' }, { status: 404 });
  return NextResponse.json(trade);
}
