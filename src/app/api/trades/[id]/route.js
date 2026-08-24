import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getTradeDetail, tradeSummarySelect } from '@/lib/tradeQueries';
import { deleteBlobIfOwned } from '@/lib/blobCleanup';
import { createTradeScreenshotAccess } from '@/lib/blobSignedUrls';
import { isAllowedTradeScreenshotValue } from '@/lib/blobOwnership';

function parseOptionalFinite(value, allowNull = true) {
  if (value === undefined) return { present: false, ok: true, value: undefined };
  if (value === '' || value === null) return { present: true, ok: allowNull, value: null };
  const number = Number(value);
  return { present: true, ok: Number.isFinite(number), value: Number.isFinite(number) ? number : null };
}

export async function GET(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const trade = await getTradeDetail(session.user.id, id);
  if (!trade) return NextResponse.json({ error: 'Trade not found.' }, { status: 404 });
  try {
    const access = await createTradeScreenshotAccess(trade, session.user.id);
    return NextResponse.json({ ...trade, ...access });
  } catch (error) {
    console.error('Could not sign trade screenshots:', error);
    return NextResponse.json(trade);
  }
}

export async function PATCH(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role === 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;

  const existing = await getTradeDetail(session.user.id, id);
  if (!existing) return NextResponse.json({ error: 'Trade not found.' }, { status: 404 });

  const body = await req.json();
  const {
    symbol, direction, date, entryPrice, stopLoss, size, pnl, notes,
    beforeScreenshotUrl, afterScreenshotUrl,
    beforeScreenshotPreviewUrl, afterScreenshotPreviewUrl,
  } = body;

  const screenshotValuesAreOwned =
    isAllowedTradeScreenshotValue(beforeScreenshotUrl, session.user.id, 'before') &&
    isAllowedTradeScreenshotValue(afterScreenshotUrl, session.user.id, 'after') &&
    isAllowedTradeScreenshotValue(beforeScreenshotPreviewUrl, session.user.id, 'before') &&
    isAllowedTradeScreenshotValue(afterScreenshotPreviewUrl, session.user.id, 'after');

  if (!screenshotValuesAreOwned) {
    return NextResponse.json({ error: 'Invalid screenshot reference.' }, { status: 400 });
  }

  const entry = parseOptionalFinite(entryPrice, false);
  const stop = parseOptionalFinite(stopLoss, true);
  const lots = parseOptionalFinite(size, false);
  const profit = parseOptionalFinite(pnl, true);
  if (!entry.ok || !stop.ok || !lots.ok || !profit.ok || (lots.present && lots.value <= 0)) {
    return NextResponse.json({ error: 'One or more trade values are invalid.' }, { status: 400 });
  }

  const data = {};
  if (symbol !== undefined) {
    const cleanSymbol = String(symbol).trim().toUpperCase();
    if (!cleanSymbol) return NextResponse.json({ error: 'Symbol / market is required.' }, { status: 400 });
    data.symbol = cleanSymbol;
  }
  if (direction !== undefined) data.direction = direction === 'short' ? 'short' : 'long';
  if (date !== undefined) {
    const tradeDate = new Date(date);
    if (Number.isNaN(tradeDate.getTime())) return NextResponse.json({ error: 'Invalid trade date.' }, { status: 400 });
    data.date = tradeDate;
  }
  if (entry.present) data.entryPrice = entry.value;
  if (stop.present) data.stopLoss = stop.value;
  if (lots.present) data.size = lots.value;
  if (profit.present) data.pnl = profit.value;
  if (notes !== undefined) data.notes = typeof notes === 'string' && notes.trim() ? notes.trim() : null;
  if (beforeScreenshotUrl !== undefined) data.beforeScreenshotUrl = beforeScreenshotUrl || null;
  if (afterScreenshotUrl !== undefined) data.afterScreenshotUrl = afterScreenshotUrl || null;
  if (beforeScreenshotPreviewUrl !== undefined) data.beforeScreenshotPreviewUrl = beforeScreenshotPreviewUrl || null;
  if (afterScreenshotPreviewUrl !== undefined) data.afterScreenshotPreviewUrl = afterScreenshotPreviewUrl || null;

 
  if (existing.hasLegacyScreenshot && beforeScreenshotUrl) data.screenshot = null;

  const trade = await prisma.trade.update({
    where: { id },
    data,
    select: tradeSummarySelect,
  });

  const finalBefore = beforeScreenshotUrl !== undefined ? (beforeScreenshotUrl || null) : existing.beforeScreenshotUrl;
  const finalAfter = afterScreenshotUrl !== undefined ? (afterScreenshotUrl || null) : existing.afterScreenshotUrl;
  const finalBeforePreview = beforeScreenshotPreviewUrl !== undefined ? (beforeScreenshotPreviewUrl || null) : existing.beforeScreenshotPreviewUrl;
  const finalAfterPreview = afterScreenshotPreviewUrl !== undefined ? (afterScreenshotPreviewUrl || null) : existing.afterScreenshotPreviewUrl;

  const cleanup = [];
  if (beforeScreenshotUrl !== undefined && existing.beforeScreenshotUrl && existing.beforeScreenshotUrl !== finalBefore) {
    cleanup.push(deleteBlobIfOwned(existing.beforeScreenshotUrl, session.user.id));
  }
  if (afterScreenshotUrl !== undefined && existing.afterScreenshotUrl && existing.afterScreenshotUrl !== finalAfter) {
    cleanup.push(deleteBlobIfOwned(existing.afterScreenshotUrl, session.user.id));
  }
  if (beforeScreenshotPreviewUrl !== undefined && existing.beforeScreenshotPreviewUrl && existing.beforeScreenshotPreviewUrl !== finalBeforePreview) {
    cleanup.push(deleteBlobIfOwned(existing.beforeScreenshotPreviewUrl, session.user.id));
  }
  if (afterScreenshotPreviewUrl !== undefined && existing.afterScreenshotPreviewUrl && existing.afterScreenshotPreviewUrl !== finalAfterPreview) {
    cleanup.push(deleteBlobIfOwned(existing.afterScreenshotPreviewUrl, session.user.id));
  }
  if (cleanup.length) await Promise.all(cleanup);

  return NextResponse.json({
    ...trade,
    hasBeforeScreenshot: Boolean(finalBefore || (existing.hasLegacyScreenshot && !beforeScreenshotUrl)),
    hasAfterScreenshot: Boolean(finalAfter),
    hasScreenshot: Boolean(finalBefore || finalAfter || (existing.hasLegacyScreenshot && !beforeScreenshotUrl)),
  });
}

export async function DELETE(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role === 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;

  const existing = await getTradeDetail(session.user.id, id);
  if (!existing) return NextResponse.json({ error: 'Trade not found.' }, { status: 404 });

  const result = await prisma.trade.deleteMany({
    where: { id, userId: session.user.id },
  });

  if (result.count === 0) return NextResponse.json({ error: 'Trade not found.' }, { status: 404 });

  await Promise.all([
    deleteBlobIfOwned(existing.beforeScreenshotUrl, session.user.id),
    deleteBlobIfOwned(existing.afterScreenshotUrl, session.user.id),
    deleteBlobIfOwned(existing.beforeScreenshotPreviewUrl, session.user.id),
    deleteBlobIfOwned(existing.afterScreenshotPreviewUrl, session.user.id),
  ]);

  return NextResponse.json({ success: true });
}
