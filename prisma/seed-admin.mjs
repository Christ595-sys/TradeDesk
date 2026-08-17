import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || '';

if (!email || !password) {
  console.error('ADMIN_EMAIL and ADMIN_PASSWORD must be set before running the admin seed.');
  process.exit(1);
}

if (password.length < 12) {
  console.error('ADMIN_PASSWORD must be at least 12 characters.');
  process.exit(1);
}

try {
  const hashedPassword = await bcrypt.hash(password, 12);
  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      password: hashedPassword,
      role: 'ADMIN',
      name: 'Administrator',
    },
    create: {
      email,
      password: hashedPassword,
      role: 'ADMIN',
      name: 'Administrator',
      startingBalance: 0,
    },
    select: { id: true, email: true, role: true },
  });

  console.log(`Admin account ready: ${admin.email} (${admin.role})`);
  console.log('The plaintext password was not stored in the database.');
} finally {
  await prisma.$disconnect();
}
