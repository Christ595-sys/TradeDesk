import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getTradeSummaries, tradeSummarySelect } from '@/lib/tradeQueries';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const trades = await getTradeSummaries(session.user.id);
  return NextResponse.json(trades);
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { symbol, direction, date, entryPrice, stopLoss, size, pnl, notes, screenshot } = body;

  if (!symbol || entryPrice === undefined || entryPrice === '' || size === undefined || size === '') {
    return NextResponse.json({ error: 'Symbol, entry price, and size are required.' }, { status: 400 });
  }

  const trade = await prisma.trade.create({
    data: {
      userId: session.user.id,
      symbol: String(symbol).toUpperCase(),
      direction: direction === 'short' ? 'short' : 'long',
      date: date ? new Date(date) : new Date(),
      entryPrice: parseFloat(entryPrice),
      stopLoss: stopLoss !== '' && stopLoss !== undefined && stopLoss !== null ? parseFloat(stopLoss) : null,
      size: parseFloat(size),
      pnl: pnl !== '' && pnl !== undefined && pnl !== null ? parseFloat(pnl) : null,
      notes: notes || null,
      screenshot: screenshot || null,
    },
    select: tradeSummarySelect,
  });

  return NextResponse.json({ ...trade, hasScreenshot: Boolean(screenshot) });
}
