import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { restoreLegacyScreenshot } from '@/lib/legacyScreenshot';
import { createTradeScreenshotAccess } from '@/lib/blobSignedUrls';

export async function POST(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role === 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  try {
    const result = await restoreLegacyScreenshot(session.user.id, id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    const access = result.url
      ? await createTradeScreenshotAccess({ beforeScreenshotUrl: result.url }, session.user.id)
      : {};
    return NextResponse.json({ beforeScreenshotUrl: result.url, ...access });
  } catch (error) {
    console.error('Legacy screenshot restore failed:', error);
    return NextResponse.json({ error: 'Could not restore the old screenshot.' }, { status: 500 });
  }
}
