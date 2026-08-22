import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { issueSignedToken, presignUrl } from '@vercel/blob';
import { randomUUID } from 'node:crypto';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const FULL_MAX_BYTES = 2 * 1024 * 1024;
const PREVIEW_MAX_BYTES = 600 * 1024;
const URL_TTL_MS = 10 * 60 * 1000;
const CACHE_SECONDS = 365 * 24 * 60 * 60;
const UPLOAD_TOKEN_TTL_MS = 60 * 60 * 1000;
let cachedUploadToken = null;

async function getUploadToken(urlValidUntil) {
  if (cachedUploadToken?.validUntil && cachedUploadToken.validUntil > urlValidUntil + 60 * 1000) {
    return cachedUploadToken;
  }
  cachedUploadToken = await issueSignedToken({
    operations: ['put'],
    validUntil: Date.now() + UPLOAD_TOKEN_TTL_MS,
    allowedContentTypes: [...ALLOWED_TYPES],
    maximumSizeInBytes: FULL_MAX_BYTES,
  });
  return cachedUploadToken;
}

function extensionFor(contentType) {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/jpeg') return 'jpg';
  return 'webp';
}

function validateMeta(meta, maxBytes) {
  return Boolean(
    meta &&
    ALLOWED_TYPES.has(meta.contentType) &&
    Number.isFinite(Number(meta.size)) &&
    Number(meta.size) > 0 &&
    Number(meta.size) <= maxBytes
  );
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
    const { kind, full, preview } = body || {};

    if (kind !== 'before' && kind !== 'after') {
      return NextResponse.json({ error: 'Invalid screenshot type.' }, { status: 400 });
    }
    if (!validateMeta(full, FULL_MAX_BYTES)) {
      return NextResponse.json({ error: 'The full screenshot is invalid or too large.' }, { status: 400 });
    }
    if (!validateMeta(preview, PREVIEW_MAX_BYTES)) {
      return NextResponse.json({ error: 'The screenshot preview is invalid or too large.' }, { status: 400 });
    }

    const uploadId = randomUUID();
    const base = `trade-screenshots/${user.id}/${kind}/${uploadId}`;
    const fullPathname = `${base}-full.${extensionFor(full.contentType)}`;
    const previewPathname = `${base}-preview.${extensionFor(preview.contentType)}`;
    const validUntil = Date.now() + URL_TTL_MS;

    // The client receives only two exact, short-lived PUT URLs. It never
    // receives the broader delegation token used on the server to mint them.
    const token = await getUploadToken(validUntil);

    const [fullSigned, previewSigned] = await Promise.all([
      presignUrl(token, {
        access: 'private',
        operation: 'put',
        pathname: fullPathname,
        validUntil,
        allowedContentTypes: [full.contentType],
        maximumSizeInBytes: FULL_MAX_BYTES,
        cacheControlMaxAge: CACHE_SECONDS,
      }),
      presignUrl(token, {
        access: 'private',
        operation: 'put',
        pathname: previewPathname,
        validUntil,
        allowedContentTypes: [preview.contentType],
        maximumSizeInBytes: PREVIEW_MAX_BYTES,
        cacheControlMaxAge: CACHE_SECONDS,
      }),
    ]);

    return NextResponse.json({
      full: { uploadUrl: fullSigned.presignedUrl, pathname: fullPathname },
      preview: { uploadUrl: previewSigned.presignedUrl, pathname: previewPathname },
      expiresAt: validUntil,
    });
  } catch (error) {
    console.error('Could not create screenshot upload URLs:', error);
    return NextResponse.json({ error: 'Could not prepare screenshot upload. Try again.' }, { status: 500 });
  }
}
