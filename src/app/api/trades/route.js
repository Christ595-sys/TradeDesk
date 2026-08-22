import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getTradeSummaries, tradeSummarySelect } from '@/lib/tradeQueries';
import { isAllowedTradeScreenshotValue } from '@/lib/blobOwnership';

function parseRequiredNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseOptionalNumber(value) {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  const number = Number(value);
  return Number.isFinite(number) ? { ok: true, value: number } : { ok: false, value: null };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const trades = await getTradeSummaries(session.user.id);
  return NextResponse.json(trades);
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role === 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const {
    symbol, direction, date, entryPrice, stopLoss, size, pnl, notes,
    beforeScreenshotUrl, afterScreenshotUrl,
    beforeScreenshotPreviewUrl, afterScreenshotPreviewUrl,
  } = body;

  const cleanSymbol = String(symbol || '').trim().toUpperCase();
  const entry = parseRequiredNumber(entryPrice);
  const lots = parseRequiredNumber(size);
  const stop = parseOptionalNumber(stopLoss);
  const profit = parseOptionalNumber(pnl);
  const tradeDate = date ? new Date(date) : new Date();

  if (!cleanSymbol || entry === null || lots === null || lots <= 0) {
    return NextResponse.json({ error: 'Symbol, a valid entry price, and a positive size are required.' }, { status: 400 });
  }
  if (!stop.ok || !profit.ok || Number.isNaN(tradeDate.getTime())) {
    return NextResponse.json({ error: 'One or more trade values are invalid.' }, { status: 400 });
  }

  const screenshotValuesAreOwned =
    isAllowedTradeScreenshotValue(beforeScreenshotUrl, session.user.id, 'before') &&
    isAllowedTradeScreenshotValue(afterScreenshotUrl, session.user.id, 'after') &&
    isAllowedTradeScreenshotValue(beforeScreenshotPreviewUrl, session.user.id, 'before') &&
    isAllowedTradeScreenshotValue(afterScreenshotPreviewUrl, session.user.id, 'after');

  if (!screenshotValuesAreOwned) {
    return NextResponse.json({ error: 'Invalid screenshot reference.' }, { status: 400 });
  }

  const trade = await prisma.trade.create({
    data: {
      userId: session.user.id,
      symbol: cleanSymbol,
      direction: direction === 'short' ? 'short' : 'long',
      date: tradeDate,
      entryPrice: entry,
      stopLoss: stop.value,
      size: lots,
      pnl: profit.value,
      notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
      beforeScreenshotUrl: beforeScreenshotUrl || null,
      afterScreenshotUrl: afterScreenshotUrl || null,
      beforeScreenshotPreviewUrl: beforeScreenshotPreviewUrl || null,
      afterScreenshotPreviewUrl: afterScreenshotPreviewUrl || null,
    },
    select: tradeSummarySelect,
  });

  return NextResponse.json({
    ...trade,
    hasBeforeScreenshot: Boolean(beforeScreenshotUrl),
    hasAfterScreenshot: Boolean(afterScreenshotUrl),
    hasScreenshot: Boolean(beforeScreenshotUrl || afterScreenshotUrl),
  });
}
