import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";

// POST /api/auth — verify PIN and return user profile
export async function POST(req: NextRequest) {
  const { userId, pin } = await req.json();

  if (!userId || !pin) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const valid = await bcrypt.compare(String(pin), user.pin);
  if (!valid) {
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  }

  return NextResponse.json({
    id: user.id,
    username: user.username,
    balance: user.balance,
  });
}
