import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

export async function POST(req) {
  const { email, password, name, startingBalance } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: 'An account with that email already exists.' }, { status: 409 });
  }

  const parsedStartingBalance = Number(startingBalance);
  if (!Number.isFinite(parsedStartingBalance) || parsedStartingBalance < 0) {
    return NextResponse.json({ error: 'Enter a valid starting balance.' }, { status: 400 });
  }

  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      password: hashed,
      name: name?.trim() || null,
      startingBalance: parsedStartingBalance,
    },
    select: { id: true, email: true },
  });

  return NextResponse.json(user);
}
