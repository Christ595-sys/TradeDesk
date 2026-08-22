import { PrismaClient } from '@prisma/client';
import { put } from '@vercel/blob';

const prisma = new PrismaClient();

function decodeLegacyScreenshot(value) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return { existingUrl: value };

  const match = value.match(/^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/s);
  if (!match) return null;

  const mime = match[1] === 'image/jpg' ? 'image/jpeg' : match[1];
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  return {
    mime,
    ext,
    buffer: Buffer.from(match[2], 'base64'),
  };
}

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN is required. Create/connect a Vercel Blob store and add its token to your local .env before running this script.');
  }

  let migrated = 0;
  let cleaned = 0;
  let skipped = 0;
  let cursor = null;

  while (true) {
    const trades = await prisma.trade.findMany({
      where: { screenshot: { not: null } },
      orderBy: { id: 'asc' },
      take: 20,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, userId: true, screenshot: true, beforeScreenshotUrl: true },
    });

    if (trades.length === 0) break;

    for (const trade of trades) {
      cursor = trade.id;

      if (trade.beforeScreenshotUrl) {
        await prisma.trade.update({ where: { id: trade.id }, data: { screenshot: null } });
        cleaned += 1;
        continue;
      }

      const decoded = decodeLegacyScreenshot(trade.screenshot);
      if (!decoded) {
        console.warn(`Skipped ${trade.id}: unsupported legacy screenshot format.`);
        skipped += 1;
        continue;
      }

      let url;
      if (decoded.existingUrl) {
        url = decoded.existingUrl;
      } else {
        const blob = await put(
          `trade-screenshots/${trade.userId}/before/legacy-${trade.id}.${decoded.ext}`,
          decoded.buffer,
          {
            access: 'private',
            contentType: decoded.mime,
            addRandomSuffix: true,
            token: process.env.BLOB_READ_WRITE_TOKEN,
          }
        );
        url = blob.url;
      }

      await prisma.trade.update({
        where: { id: trade.id },
        data: { beforeScreenshotUrl: url, screenshot: null },
      });
      migrated += 1;
      console.log(`Migrated legacy screenshot for trade ${trade.id}`);
    }
  }

  console.log(`Screenshot migration complete. Migrated: ${migrated}, cleaned duplicates: ${cleaned}, skipped: ${skipped}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
