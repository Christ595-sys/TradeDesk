import { put, del } from '@vercel/blob';
import { prisma } from '@/lib/prisma';

function decodeDataUrl(value) {
  const match = value?.match(/^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/s);
  if (!match) return null;
  const contentType = match[1] === 'image/jpg' ? 'image/jpeg' : match[1];
  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  return { buffer: Buffer.from(match[2], 'base64'), contentType, ext };
}

async function readLegacyImage(value) {
  const decoded = decodeDataUrl(value);
  if (decoded) return decoded;

  if (!/^https?:\/\//i.test(value || '')) return null;
  const response = await fetch(value, { cache: 'no-store' });
  if (!response.ok) return null;
  const contentType = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) return null;
  const buffer = Buffer.from(await response.arrayBuffer());
  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  return { buffer, contentType, ext };
}

export async function restoreLegacyScreenshot(userId, tradeId) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return { ok: false, error: 'Blob storage is not configured.' };
  }

  const trade = await prisma.trade.findFirst({
    where: { id: tradeId, userId },
    select: { id: true, userId: true, screenshot: true, beforeScreenshotUrl: true },
  });

  if (!trade) return { ok: false, error: 'Trade not found.' };
  if (trade.beforeScreenshotUrl) return { ok: true, url: trade.beforeScreenshotUrl };
  if (!trade.screenshot) return { ok: true, url: null };

  const image = await readLegacyImage(trade.screenshot);
  if (!image) return { ok: false, error: 'The old screenshot format could not be restored.' };

  const blob = await put(
    `trade-screenshots/${trade.userId}/before/legacy-${trade.id}.${image.ext}`,
    image.buffer,
    {
      access: 'private',
      contentType: image.contentType,
      addRandomSuffix: true,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    }
  );

  const updated = await prisma.trade.updateMany({
    where: { id: trade.id, userId: trade.userId, beforeScreenshotUrl: null, screenshot: { not: null } },
    data: { beforeScreenshotUrl: blob.url, screenshot: null },
  });

  if (updated.count === 0) {
    try { await del(blob.url, { token: process.env.BLOB_READ_WRITE_TOKEN }); } catch {}
    const current = await prisma.trade.findUnique({
      where: { id: trade.id },
      select: { beforeScreenshotUrl: true },
    });
    return { ok: true, url: current?.beforeScreenshotUrl || null };
  }

  return { ok: true, url: blob.url };
}
