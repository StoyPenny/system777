"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import BalanceBar from "@/components/BalanceBar";
import BetSelector from "@/components/BetSelector";
import WinEffect from "@/components/WinEffect";
import { loadSession, saveSession } from "@/lib/session";
import { playWin, playBigWin, playLose, playTick } from "@/lib/sounds";
import { UserProfile } from "@/types";

// B:1-15  I:16-30  N:31-45  G:46-60  O:61-75
const COLS = ["B", "I", "N", "G", "O"] as const;
const COL_RANGES: [number, number][] = [[1, 15], [16, 30], [31, 45], [46, 60], [61, 75]];

function generateCard(): number[][] {
  const columns = COL_RANGES.map(([min, max]) => {
    const pool: number[] = [];
    while (pool.length < 5) {
      const n = Math.floor(Math.random() * (max - min + 1)) + min;
      if (!pool.includes(n)) pool.push(n);
    }
    return pool;
  });
  // Transpose to row-major order: card[row][col]
  const card = Array.from({ length: 5 }, (_, row) => columns.map(col => col[row]));
  card[2][2] = 0; // FREE
  return card;
}

function countLines(card: number[][], called: Set<number>): number {
  const m = (n: number) => n === 0 || called.has(n);
  let lines = 0;
  for (let r = 0; r < 5; r++) if (card[r].every(m)) lines++;
  for (let c = 0; c < 5; c++) if (card.every(row => m(row[c]))) lines++;
  if ([0, 1, 2, 3, 4].every(i => m(card[i][i]))) lines++;
  if ([0, 1, 2, 3, 4].every(i => m(card[i][4 - i]))) lines++;
  return lines;
}

function isBlackout(card: number[][], called: Set<number>): boolean {
  return card.every(row => row.every(n => n === 0 || called.has(n)));
}

// Payout multiplier on per-card bet amount
const LINE_MULTS = [0, 2, 5, 12, 25, 50];
const BLACKOUT_MULT = 200;

function cardPayout(lines: number, blackout: boolean, betAmount: number): number {
  if (blackout) return betAmount * BLACKOUT_MULT;
  if (lines === 0) return 0;
  return betAmount * LINE_MULTS[Math.min(lines, 5)];
}

function ballBg(n: number): string {
  if (n <= 15) return "bg-blue-500";
  if (n <= 30) return "bg-orange-500";
  if (n <= 45) return "bg-neutral-500";
  if (n <= 60) return "bg-green-500";
  return "bg-red-500";
}

type Phase = "betting" | "drawing" | "result";

function BingoCard({
  card,
  called,
  compact,
  lines,
  blackout,
}: {
  card: number[][];
  called: Set<number>;
  compact: boolean;
  lines: number;
  blackout: boolean;
}) {
  const cell = compact ? "w-8 h-8 text-xs" : "w-10 h-10 text-sm";
  const border = blackout
    ? "border-yellow-400"
    : lines > 0
    ? "border-green-400"
    : "border-yellow-800";

  return (
    <div className={`bg-neutral-900 rounded-xl border-4 ${border} p-2 shadow-xl`}>
      <div className="grid grid-cols-5 gap-1 mb-1">
        {COLS.map(l => (
          <div key={l} className={`text-center font-black text-yellow-400 ${compact ? "text-xs" : "text-sm"}`}>
            {l}
          </div>
        ))}
      </div>
      {card.map((row, r) => (
        <div key={r} className="grid grid-cols-5 gap-1 mb-1">
          {row.map((n, c) => {
            const free = n === 0;
            const marked = free || called.has(n);
            return (
              <div
                key={c}
                className={`${cell} rounded flex items-center justify-center font-bold select-none
                  ${free
                    ? "bg-yellow-600 text-yellow-950 font-black"
                    : marked
                    ? "bg-yellow-500 text-yellow-950"
                    : "bg-neutral-800 text-neutral-300"}`}
              >
                {free ? "★" : n}
              </div>
            );
          })}
        </div>
      ))}
      {(lines > 0 || blackout) && (
        <div className={`text-center text-xs font-mono font-black mt-0.5 ${blackout ? "text-yellow-400" : "text-green-400"}`}>
          {blackout ? "BLACKOUT!" : `${lines} LINE${lines > 1 ? "S" : ""}`}
        </div>
      )}
    </div>
  );
}

export default function BingoPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [bet, setBet] = useState(10);
  const [numCards, setNumCards] = useState(1);
  const [phase, setPhase] = useState<Phase>("betting");
  const [cards, setCards] = useState<number[][][]>([]);
  const [calledBalls, setCalledBalls] = useState<number[]>([]);
  const [message, setMessage] = useState("SELECT CARDS AND PLACE YOUR BET!");
  const [winEffect, setWinEffect] = useState({ show: false, big: false });

  useEffect(() => {
    const session = loadSession();
    if (!session) { router.replace("/"); return; }
    setUser(session);
  }, [router]);

  const calledSet = useMemo(() => new Set(calledBalls), [calledBalls]);

  const results = useMemo(
    () => cards.map(card => ({ lines: countLines(card, calledSet), blackout: isBlackout(card, calledSet) })),
    [cards, calledSet]
  );

  const play = useCallback(async () => {
    if (!user || user.balance < bet * numCards) {
      setMessage("NOT ENOUGH CREDITS!");
      return;
    }

    const newCards = Array.from({ length: numCards }, generateCard);
    setCards(newCards);
    setCalledBalls([]);
    setPhase("drawing");
    setMessage("DRAWING BALLS...");

    // Generate 30 unique balls from 1–75
    const ballPool: number[] = [];
    while (ballPool.length < 30) {
      const n = Math.floor(Math.random() * 75) + 1;
      if (!ballPool.includes(n)) ballPool.push(n);
    }

    // Reveal one ball at a time, auto-daubing cards live
    const called: number[] = [];
    for (const ball of ballPool) {
      await new Promise<void>(r => setTimeout(r, 100));
      called.push(ball);
      setCalledBalls([...called]);
      playTick();
    }

    // Compute wins from local state (avoid stale closure over `cards`)
    const finalSet = new Set(called);
    const cardResults = newCards.map(card => ({
      lines: countLines(card, finalSet),
      blackout: isBlackout(card, finalSet),
    }));

    const totalPayout = cardResults.reduce((s, r) => s + cardPayout(r.lines, r.blackout, bet), 0);
    const totalWagered = bet * numCards;
    const delta = totalPayout - totalWagered;
    const totalLines = cardResults.reduce((s, r) => s + r.lines, 0);
    const anyBlackout = cardResults.some(r => r.blackout);

    setPhase("result");

    if (anyBlackout) {
      setMessage(`BLACKOUT! +${totalPayout.toLocaleString()} CREDITS`);
      playBigWin();
      setWinEffect({ show: true, big: true });
    } else if (delta > 0) {
      setMessage(`${totalLines} LINE${totalLines !== 1 ? "S" : ""}! +${delta.toLocaleString()} CREDITS`);
      playWin();
      setWinEffect({ show: true, big: false });
    } else if (totalLines > 0) {
      setMessage(`${totalLines} LINE${totalLines !== 1 ? "S" : ""} — -${Math.abs(delta).toLocaleString()} CREDITS`);
      playLose();
    } else {
      setMessage(`NO LINES — -${totalWagered.toLocaleString()} CREDITS`);
      playLose();
    }

    const res = await fetch("/api/game-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.id,
        game: "bingo",
        result: anyBlackout ? "blackout" : totalLines > 0 ? (delta > 0 ? "win" : "partial") : "lose",
        amount: delta,
      }),
    });
    if (res.ok) {
      const { user: updated } = await res.json();
      saveSession(updated);
      setUser(updated);
    }
  }, [user, bet, numCards]);

  const reset = useCallback(() => {
    setCards([]);
    setCalledBalls([]);
    setPhase("betting");
    setMessage("SELECT CARDS AND PLACE YOUR BET!");
  }, []);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") { router.push("/lobby"); return; }
      if (phase === "betting" && e.code === "Space") { e.preventDefault(); play(); }
      if (phase === "result" && e.code === "Space") { e.preventDefault(); reset(); }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [phase, play, reset, router]);

  if (!user) return null;

  const compact = numCards >= 3;
  const totalBet = bet * numCards;
  const currentBall = calledBalls[calledBalls.length - 1];

  const cardGridClass =
    numCards === 1 ? "grid-cols-1" :
    numCards === 2 ? "grid-cols-2" :
    numCards === 3 ? "grid-cols-3" :
    "grid-cols-2";

  return (
    <div className="flex flex-col min-h-screen bg-yellow-950 text-white">
      <BalanceBar user={user} onLogout={() => router.replace("/")} />
      <WinEffect
        show={winEffect.show}
        game="bingo"
        big={winEffect.big}
        onDone={() => setWinEffect({ show: false, big: false })}
      />

      <div className="flex flex-col items-center gap-4 p-4 pt-24 pb-8 w-full max-w-4xl mx-auto">
        <button
          onClick={() => router.push("/lobby")}
          className="self-start px-4 py-2 bg-black/40 hover:bg-black/60 border border-neutral-700 rounded-lg text-sm font-mono"
        >
          ← [ESC] LOBBY
        </button>

        <div className="w-full bg-black rounded-3xl p-5 border-8 border-yellow-600 shadow-2xl">
          <div className="text-center text-lg font-black tracking-widest mb-4 pb-3 border-b border-neutral-800 text-yellow-400">
            VIDEO BINGO
            {phase !== "betting" && (
              <span className="ml-4 text-sm font-mono font-normal text-neutral-400">
                {numCards} CARD{numCards > 1 ? "S" : ""} · BET:{" "}
                <span className="text-yellow-400">{totalBet.toLocaleString()}</span>
              </span>
            )}
          </div>

          {/* Ball tracker — visible during draw and result */}
          {phase !== "betting" && (
            <div className="flex flex-col items-center gap-2 mb-4">
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-neutral-500 tracking-widest uppercase">Last Ball</span>
                {currentBall ? (
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-black ${ballBg(currentBall)} text-white shadow-lg`}>
                    {currentBall}
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-full bg-neutral-800" />
                )}
                <span className="text-xs font-mono text-neutral-500">{calledBalls.length}/30</span>
              </div>

              <div className="flex flex-wrap gap-1 justify-center max-w-2xl">
                {calledBalls.map(n => (
                  <span
                    key={n}
                    className={`${ballBg(n)} text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0`}
                  >
                    {n}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Cards */}
          {cards.length > 0 && (
            <div className={`grid ${cardGridClass} gap-3 justify-items-center`}>
              {cards.map((card, i) => (
                <BingoCard
                  key={i}
                  card={card}
                  called={calledSet}
                  compact={compact}
                  lines={results[i]?.lines ?? 0}
                  blackout={results[i]?.blackout ?? false}
                />
              ))}
            </div>
          )}

          {/* Paytable — shown only in betting phase */}
          {phase === "betting" && (
            <div className="mt-2">
              <p className="text-center text-xs font-mono text-yellow-700 tracking-widest uppercase mb-2">
                Paytable (per card)
              </p>
              <div className="grid grid-cols-3 gap-1 text-xs font-mono">
                {[
                  ["1 line", "2×"],
                  ["2 lines", "5×"],
                  ["3 lines", "12×"],
                  ["4 lines", "25×"],
                  ["5+ lines", "50×"],
                  ["BLACKOUT", "200×"],
                ].map(([label, mult]) => (
                  <div key={label} className="flex justify-between px-2 py-1 bg-neutral-900 rounded">
                    <span className="text-neutral-400">{label}</span>
                    <span className="text-yellow-400 font-black">{mult}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 bg-neutral-950 p-3 rounded-lg border border-neutral-800 text-center min-h-12 flex items-center justify-center">
            <p className={`font-mono text-sm font-bold tracking-wide ${
              message.includes("+") ? "text-green-400" :
              message.includes("-") || message.includes("NO LINES") ? "text-red-400" :
              message.includes("DRAWING") || message.includes("SELECT") ? "text-yellow-300" :
              message.includes("LINE") ? "text-yellow-300" :
              "text-white"
            }`}>
              {message}
            </p>
          </div>
        </div>

        {/* Betting controls */}
        {phase === "betting" && (
          <>
            <div className="flex flex-col items-center gap-2">
              <label className="text-xs font-mono text-neutral-400 tracking-widest">NUMBER OF CARDS</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4].map(n => (
                  <button
                    key={n}
                    onClick={() => setNumCards(n)}
                    className={`w-14 h-14 rounded-xl font-black text-xl transition-all ${
                      numCards === n
                        ? "bg-yellow-500 text-black ring-2 ring-yellow-300 scale-105"
                        : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-xs font-mono text-neutral-500">
                TOTAL: <span className="text-yellow-400">{totalBet.toLocaleString()}</span> CREDITS
              </p>
            </div>

            <BetSelector balance={user.balance} bet={bet} onChange={setBet} disabled={false} />

            <button
              onClick={play}
              disabled={user.balance < totalBet}
              className="px-16 py-8 rounded-2xl text-3xl font-black tracking-wider bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 border-b-8 border-yellow-900 active:border-b-2 transition-all active:scale-95 shadow-2xl disabled:opacity-50 text-black"
            >
              PLAY [SPACE]
            </button>
          </>
        )}

        {phase === "result" && (
          <button
            onClick={reset}
            className="px-16 py-8 rounded-2xl text-3xl font-black tracking-wider bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 border-b-8 border-yellow-900 active:border-b-2 transition-all active:scale-95 shadow-2xl text-black"
          >
            PLAY AGAIN [SPACE]
          </button>
        )}
      </div>
    </div>
  );
}
