import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { deleteOwnedBlobReferences } from '@/lib/blobCleanup';
import { blobPathnameFromReference, isOwnedTradeScreenshotReference } from '@/lib/blobOwnership';

export const runtime = 'nodejs';

const MAX_REFERENCES = 8;

async function referenceIsSaved(userId, reference) {
  const pathname = blobPathnameFromReference(reference);
  if (!pathname) return true;

  const existing = await prisma.trade.findFirst({
    where: {
      userId,
      OR: [
        { beforeScreenshotUrl: { endsWith: pathname } },
        { afterScreenshotUrl: { endsWith: pathname } },
        { beforeScreenshotPreviewUrl: { endsWith: pathname } },
        { afterScreenshotPreviewUrl: { endsWith: pathname } },
      ],
    },
    select: { id: true },
  });
  return Boolean(existing);
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role === 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await prisma.user.findFirst({
    where: { id: session.user.id, role: 'USER' },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const references = Array.isArray(body?.references)
      ? [...new Set(body.references.filter((value) => typeof value === 'string' && value.trim()))].slice(0, MAX_REFERENCES)
      : [];

    const owned = references.filter((reference) =>
      isOwnedTradeScreenshotReference(reference, user.id)
    );

    const deletable = [];
    for (const reference of owned) {
      if (!(await referenceIsSaved(user.id, reference))) deletable.push(reference);
    }

    await deleteOwnedBlobReferences(deletable, user.id);
    return NextResponse.json({ deleted: deletable.length });
  } catch (error) {
    console.error('Screenshot cleanup failed:', error);
    return NextResponse.json({ error: 'Could not clean up screenshot files.' }, { status: 500 });
  }
}
