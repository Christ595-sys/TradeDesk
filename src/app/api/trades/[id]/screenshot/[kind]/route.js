import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { get } from '@vercel/blob';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isManagedBlobUrl, isOwnedTradeScreenshotReference } from '@/lib/blobOwnership';

export const runtime = 'nodejs';

function validKind(kind) {
  return kind === 'before' || kind === 'after';
}

export async function GET(request, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role === 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id, kind } = await params;
  if (!validKind(kind)) {
    return NextResponse.json({ error: 'Invalid screenshot type.' }, { status: 400 });
  }

  const trade = await prisma.trade.findFirst({
    where: { id, userId: session.user.id },
    select: { beforeScreenshotUrl: true, afterScreenshotUrl: true },
  });

  if (!trade) return new NextResponse('Not found', { status: 404 });

  const url = kind === 'before' ? trade.beforeScreenshotUrl : trade.afterScreenshotUrl;
  if (!url || !isManagedBlobUrl(url) || !isOwnedTradeScreenshotReference(url, session.user.id, kind)) {
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
    console.error('Private trade screenshot read failed:', error);
    return new NextResponse('Could not load screenshot', { status: 500 });
  }
}
