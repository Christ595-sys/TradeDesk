import { NextResponse } from 'next/server';
import { getVerifiedAdmin } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';
import { restoreLegacyScreenshot } from '@/lib/legacyScreenshot';
import { createTradeScreenshotAccess } from '@/lib/blobSignedUrls';

export async function POST(req, { params }) {
  const { session, admin } = await getVerifiedAdmin();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { userId, tradeId } = await params;
  const user = await prisma.user.findFirst({
    where: { id: userId, role: 'USER' },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

  try {
    const result = await restoreLegacyScreenshot(userId, tradeId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    const access = result.url
      ? await createTradeScreenshotAccess({ beforeScreenshotUrl: result.url }, userId)
      : {};
    return NextResponse.json({ beforeScreenshotUrl: result.url, ...access });
  } catch (error) {
    console.error('Admin legacy screenshot restore failed:', error);
    return NextResponse.json({ error: 'Could not restore the old screenshot.' }, { status: 500 });
  }
}
