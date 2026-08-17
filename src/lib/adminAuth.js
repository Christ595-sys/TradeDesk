import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { prisma } from './prisma';

export async function getVerifiedAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { session: null, admin: null };

  const admin = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, role: true },
  });

  if (!admin || admin.role !== 'ADMIN') return { session, admin: null };
  return { session, admin };
}
