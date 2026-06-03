import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";

// GET /api/users — list all users (no PINs)
export async function GET() {
  const users = await prisma.user.findMany({
    select: { id: true, username: true, balance: true },
    orderBy: { username: "asc" },
  });
  return NextResponse.json(users);
}

// POST /api/users — create new user
export async function POST(req: NextRequest) {
  const { username, pin } = await req.json();

  if (!username || !pin || String(pin).length !== 4) {
    return NextResponse.json(
      { error: "Username and 4-digit PIN required" },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return NextResponse.json({ error: "Username taken" }, { status: 409 });
  }

  const hashed = await bcrypt.hash(String(pin), 10);
  const user = await prisma.user.create({
    data: { username, pin: hashed },
    select: { id: true, username: true, balance: true },
  });

  return NextResponse.json(user, { status: 201 });
}
