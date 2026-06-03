import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/game-session — record a game result and update balance
export async function POST(req: NextRequest) {
  const { userId, game, result, amount } = await req.json();

  if (!userId || !game || !result || amount === undefined) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const newBalance = user.balance + amount;
  if (newBalance < 0) {
    return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
  }

  const [updatedUser, session] = await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { balance: newBalance },
      select: { id: true, username: true, balance: true },
    }),
    prisma.gameSession.create({
      data: { userId, game, result, amount, balance: newBalance },
    }),
  ]);

  return NextResponse.json({ user: updatedUser, session });
}
