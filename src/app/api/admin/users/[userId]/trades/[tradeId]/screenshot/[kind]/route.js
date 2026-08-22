import { NextResponse } from 'next/server';
import { get } from '@vercel/blob';
import { getVerifiedAdmin } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';
import { isManagedBlobUrl, isOwnedTradeScreenshotReference } from '@/lib/blobOwnership';

export const runtime = 'nodejs';

function validKind(kind) {
  return kind === 'before' || kind === 'after';
}

export async function GET(request, { params }) {
  const { session, admin } = await getVerifiedAdmin();
  if (!session || !admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { userId, tradeId, kind } = await params;
  if (!validKind(kind)) {
    return NextResponse.json({ error: 'Invalid screenshot type.' }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, role: 'USER' },
    select: { id: true },
  });
  if (!user) return new NextResponse('Not found', { status: 404 });

  const trade = await prisma.trade.findFirst({
    where: { id: tradeId, userId },
    select: { beforeScreenshotUrl: true, afterScreenshotUrl: true },
  });

  if (!trade) return new NextResponse('Not found', { status: 404 });

  const url = kind === 'before' ? trade.beforeScreenshotUrl : trade.afterScreenshotUrl;
  if (!url || !isManagedBlobUrl(url) || !isOwnedTradeScreenshotReference(url, userId, kind)) {
    return new NextResponse('Not found', { status: 404 });
  }

  if (!url.includes('.private.blob.vercel-storage.com')) {
    return NextResponse.redirect(url);
  }

  try {
    const result = await get(url, {
      access: 'private',
      ifNoneMatch: request.headers.get('if-none-match') || undefined,
    });

    if (!result) return new NextResponse('Not found', { status: 404 });

    if (result.statusCode === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: result.blob.etag,
          'Cache-Control': 'private, max-age=300, stale-while-revalidate=60',
        },
      });
    }

    if (result.statusCode !== 200) return new NextResponse('Not found', { status: 404 });

    return new NextResponse(result.stream, {
      headers: {
        'Content-Type': result.blob.contentType || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        ETag: result.blob.etag,
        'Cache-Control': 'private, max-age=300, stale-while-revalidate=60',
      },
    });
  } catch (error) {
    console.error('Admin private trade screenshot read failed:', error);
    return new NextResponse('Could not load screenshot', { status: 500 });
  }
}
