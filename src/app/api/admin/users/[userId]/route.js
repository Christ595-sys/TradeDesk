import { NextResponse } from 'next/server';
import { getVerifiedAdmin } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';
import { deleteAllUserScreenshotBlobs } from '@/lib/userAccountDeletion';

export const runtime = 'nodejs';

export async function DELETE(_request, { params }) {
  const { session, admin } = await getVerifiedAdmin();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { userId } = await params;
  if (!userId) return NextResponse.json({ error: 'User id is required.' }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true },
  });

  if (!user) return NextResponse.json({ error: 'User account not found.' }, { status: 404 });
  if (user.role !== 'USER') {
    return NextResponse.json({ error: 'Admin accounts cannot be deleted here.' }, { status: 403 });
  }

  try {
    // Clean the user's entire screenshot namespace first, including abandoned
    // uploads that are not referenced by a saved trade. If this fails, keep
    // the database account intact so the deletion can be retried safely.
    await deleteAllUserScreenshotBlobs(user.id);

    // Trade.user uses onDelete: Cascade, so deleting the user permanently
    // removes all trades, notes, balances and legacy screenshot data.
    const deleted = await prisma.user.deleteMany({
      where: { id: user.id, role: 'USER' },
    });

    if (deleted.count !== 1) {
      return NextResponse.json({ error: 'The account changed before it could be deleted. Refresh and try again.' }, { status: 409 });
    }

    return NextResponse.json({ success: true, deletedUserId: user.id });
  } catch (error) {
    console.error(`Could not completely delete user ${user.id}:`, error);
    return NextResponse.json(
      { error: 'Could not completely delete this account. Nothing was removed from the database. Try again.' },
      { status: 500 },
    );
  }
}
