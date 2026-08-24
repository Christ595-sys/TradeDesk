import { del } from '@vercel/blob';
import { blobPathnameFromReference, isOwnedTradeScreenshotReference } from './blobOwnership';

export async function deleteBlobIfOwned(reference, userId) {
  if (!reference || !isOwnedTradeScreenshotReference(reference, userId)) return;
  try {
    await del(reference);
  } catch (error) {
    console.warn('Could not delete screenshot blob:', error?.message || error);
  }
}

export async function deleteOwnedBlobReferences(references, userId) {
  const unique = [...new Set((references || []).filter(Boolean))]
    .filter((reference) => isOwnedTradeScreenshotReference(reference, userId));
  if (!unique.length) return;

  const normalized = unique.map((reference) => {
    if (/^https?:\/\//i.test(reference)) return reference;
    return blobPathnameFromReference(reference);
  }).filter(Boolean);

  if (!normalized.length) return;
  try {
    await del(normalized);
  } catch (error) {
    console.warn('Could not clean up screenshot blobs:', error?.message || error);
  }
}
