import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { tradeSummarySelect } from '@/lib/tradeQueries';

export async function GET(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const trade = await prisma.trade.findFirst({
    where: { id: params.id, userId: session.user.id },
  });

  if (!trade) return NextResponse.json({ error: 'Trade not found.' }, { status: 404 });
  return NextResponse.json(trade);
}

export async function PATCH(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const existing = await prisma.trade.findFirst({
    where: { id: params.id, userId: session.user.id },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: 'Trade not found.' }, { status: 404 });

  const body = await req.json();
  const { symbol, direction, date, entryPrice, stopLoss, size, pnl, notes, screenshot } = body;
  const data = {};

  if (symbol !== undefined) data.symbol = String(symbol).toUpperCase();
  if (direction !== undefined) data.direction = direction === 'short' ? 'short' : 'long';
  if (date) data.date = new Date(date);
  if (entryPrice !== undefined && entryPrice !== '') data.entryPrice = parseFloat(entryPrice);
  if (stopLoss !== undefined) data.stopLoss = stopLoss !== '' && stopLoss !== null ? parseFloat(stopLoss) : null;
  if (size !== undefined && size !== '') data.size = parseFloat(size);
  if (pnl !== undefined) data.pnl = pnl !== '' && pnl !== null ? parseFloat(pnl) : null;
  if (notes !== undefined) data.notes = notes || null;
  if (screenshot !== undefined) data.screenshot = screenshot || null;

  const trade = await prisma.trade.update({
    where: { id: params.id },
    data,
    select: tradeSummarySelect,
  });

  return NextResponse.json(trade);
}

export async function DELETE(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await prisma.trade.deleteMany({
    where: { id: params.id, userId: session.user.id },
  });

  if (result.count === 0) return NextResponse.json({ error: 'Trade not found.' }, { status: 404 });
  return NextResponse.json({ success: true });
}
