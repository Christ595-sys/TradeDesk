import { del, list } from '@vercel/blob';

const PAGE_LIMIT = 1000;
const DELETE_BATCH_SIZE = 1000;

async function collectBlobUrls(prefix) {
  const urls = [];
  let cursor;
  let hasMore = true;

  while (hasMore) {
    const result = await list({
      prefix,
      cursor,
      limit: PAGE_LIMIT,
    });

    urls.push(...(result.blobs || []).map((blob) => blob.url).filter(Boolean));
    hasMore = Boolean(result.hasMore);
    cursor = result.cursor;
  }

  return urls;
}

async function deleteBlobPrefix(prefix) {
  
  const urls = await collectBlobUrls(prefix);

  for (let index = 0; index < urls.length; index += DELETE_BATCH_SIZE) {
    await del(urls.slice(index, index + DELETE_BATCH_SIZE));
  }
}

export async function deleteAllUserScreenshotBlobs(userId) {
  if (!userId) throw new Error('User id is required for screenshot cleanup.');

  
  await deleteBlobPrefix(`trade-screenshots/${userId}/`);

  await deleteBlobPrefix(`trade-screenshots/legacy-before/${userId}/`);
}
