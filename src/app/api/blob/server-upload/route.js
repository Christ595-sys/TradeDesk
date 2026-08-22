import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { put } from '@vercel/blob';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

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
    const formData = await request.formData();
    const file = formData.get('file');
    const kind = formData.get('kind');

    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: 'Screenshot file is required.' }, { status: 400 });
    }
    if (kind !== 'before' && kind !== 'after') {
      return NextResponse.json({ error: 'Invalid screenshot type.' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'Screenshots must be JPG, PNG, or WebP.' }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'Screenshot is too large after optimization.' }, { status: 413 });
    }

    const originalName = typeof file.name === 'string' ? file.name : 'screenshot.webp';
    const cleanName = originalName.replace(/[^a-zA-Z0-9._-]+/g, '-');
    const pathname = `trade-screenshots/${user.id}/${kind}/${Date.now()}-${cleanName}`;

    const blob = await put(pathname, file, {
      access: 'private',
      addRandomSuffix: true,
      cacheControlMaxAge: 365 * 24 * 60 * 60,
    });

    return NextResponse.json({ url: blob.url });
  } catch (error) {
    console.error('Screenshot server upload failed:', error);
    return NextResponse.json({ error: 'Could not store the screenshot. Try again.' }, { status: 500 });
  }
}
