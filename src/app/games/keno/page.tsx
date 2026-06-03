"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import BalanceBar from "@/components/BalanceBar";
import BetSelector from "@/components/BetSelector";
import WinEffect from "@/components/WinEffect";
import { loadSession, saveSession } from "@/lib/session";
import { playWin, playBigWin, playLose, playTick } from "@/lib/sounds";
import { UserProfile } from "@/types";

const MIN_PICKS = 2;
const MAX_PICKS = 10;
const MIN_BET = 1;
const DRAW_COUNT = 20;
const DRAW_DELAY_MS = 120;

// catches → multiplier, keyed by number of picks
const PAYOUTS: Record<number, Record<number, number>> = {
  2:  { 2: 14 },
  3:  { 2: 2,  3: 47 },
  4:  { 2: 1,  3: 6,   4: 90 },
  5:  { 3: 2,  4: 12,  5: 800 },
  6:  { 3: 1,  4: 8,   5: 100,  6: 1600 },
  7:  { 4: 3,  5: 20,  6: 300,  7: 7000 },
  8:  { 4: 2,  5: 8,   6: 100,  7: 1500,  8: 10000 },
  9:  { 4: 1,  5: 4,   6: 44,   7: 300,   8: 4000,  9: 25000 },
  10: { 5: 2,  6: 22,  7: 142,  8: 1000,  9: 10000, 10: 100000 },
};

type Phase = "bet" | "pick" | "drawing" | "result";

export default function KenoPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [bet, setBet] = useState(10);
  const [phase, setPhase] = useState<Phase>("bet");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [drawn, setDrawn] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState("SET YOUR BET TO START");
  const [winEffect, setWinEffect] = useState({ show: false, big: false });

  useEffect(() => {
    const session = loadSession();
    if (!session) { router.replace("/"); return; }
    setUser(session);
  }, [router]);

  const resetBoard = useCallback(() => {
    setSelected(new Set());
    setDrawn(new Set());
    setPhase("bet");
    setMessage("SET YOUR BET TO START");
  }, []);

  const confirmBet = useCallback(() => {
    if (!user || user.balance < bet || bet < MIN_BET) {
      setMessage(bet < MIN_BET ? "MINIMUM BET IS 1!" : "NOT ENOUGH CREDITS!");
      return;
    }
    setPhase("pick");
    setMessage(`PICK ${MIN_PICKS}–${MAX_PICKS} NUMBERS, THEN PRESS DRAW`);
  }, [user, bet]);

  const toggleNumber = useCallback((n: number) => {
    if (phase !== "pick") return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(n)) {
        next.delete(n);
      } else if (next.size < MAX_PICKS) {
        next.add(n);
      }
      return next;
    });
  }, [phase]);

  const draw = useCallback(async () => {
    if (phase !== "pick" || selected.size < MIN_PICKS || !user) return;
    setPhase("drawing");
    setMessage("DRAWING...");

    const pool = Array.from({ length: 80 }, (_, i) => i + 1)
      .sort(() => Math.random() - 0.5)
      .slice(0, DRAW_COUNT);

    const drawnSet = new Set<number>();
    for (const n of pool) {
      await new Promise<void>((r) => setTimeout(r, DRAW_DELAY_MS));
      drawnSet.add(n);
      setDrawn(new Set(drawnSet));
      playTick();
    }

    const catches = [...selected].filter((n) => drawnSet.has(n)).length;
    const picks = selected.size;
    const mult = PAYOUTS[picks]?.[catches] ?? 0;
    const delta = mult > 0 ? bet * mult - bet : -bet;

    setPhase("result");

    let msg = "";
    if (mult === 0) {
      msg = `${catches} CATCH${catches !== 1 ? "ES" : ""} — NO WIN  -${bet.toLocaleString()} CREDITS`;
      playLose();
    } else if (mult >= 100) {
      msg = `${catches}/${picks} CATCHES!  ${mult}x — +${(bet * mult - bet).toLocaleString()} CREDITS`;
      playBigWin();
      setWinEffect({ show: true, big: true });
    } else {
      msg = `${catches}/${picks} CATCHES!  ${mult}x — +${(bet * mult - bet).toLocaleString()} CREDITS`;
      playWin();
      setWinEffect({ show: true, big: false });
    }
    setMessage(msg);

    const res = await fetch("/api/game-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, game: "keno", result: mult > 0 ? "win" : "lose", amount: delta }),
    });
    if (res.ok) {
      const { user: updated } = await res.json();
      saveSession(updated);
      setUser(updated);
    }
  }, [phase, selected, user, bet]);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.push("/lobby");
      if (phase === "bet" && e.code === "Space") { e.preventDefault(); confirmBet(); }
      if (phase === "pick" && e.code === "Space") { e.preventDefault(); draw(); }
      if (phase === "result" && e.code === "Space") { e.preventDefault(); resetBoard(); }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [phase, confirmBet, draw, resetBoard, router]);

  if (!user) return null;

  const currentPayout = PAYOUTS[selected.size];

  return (
    <div className="flex flex-col min-h-screen bg-purple-950 text-white">
      <BalanceBar user={user} onLogout={() => router.replace("/")} />
      <WinEffect
        show={winEffect.show}
        game="keno"
        big={winEffect.big}
        onDone={() => setWinEffect({ show: false, big: false })}
      />

      <div className="flex flex-col items-center gap-4 p-4 pt-24 pb-8 w-full max-w-3xl mx-auto">
        <button
          onClick={() => router.push("/lobby")}
          className="self-start px-4 py-2 bg-black/40 hover:bg-black/60 border border-neutral-700 rounded-lg text-sm font-mono"
        >
          ← [ESC] LOBBY
        </button>

        <div className="w-full bg-black rounded-3xl p-4 border-8 border-purple-600 shadow-2xl">
          <div className="text-center text-lg font-black tracking-widest mb-3 pb-3 border-b border-neutral-800 text-purple-400">
            KENO
            {phase !== "bet" && (
              <span className="ml-4 text-sm font-mono font-normal text-neutral-400">
                BET: <span className="text-yellow-400">{bet.toLocaleString()}</span>
                {" · "}PICKS: <span className="text-purple-300">{selected.size}</span>
              </span>
            )}
          </div>

          {/* Number grid — 10 columns × 8 rows = 80 numbers */}
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: "repeat(10, minmax(0, 1fr))" }}
          >
            {Array.from({ length: 80 }, (_, i) => i + 1).map((n) => {
              const isSelected = selected.has(n);
              const isDrawn = drawn.has(n);
              const isCatch = isSelected && isDrawn;
              const isMissed = isSelected && !isDrawn && (phase === "result" || phase === "drawing");
              const isHot = isDrawn && !isSelected;

              let cls =
                "aspect-square rounded text-[11px] font-black flex items-center justify-center transition-colors select-none ";
              if (isCatch)
                cls += "bg-green-500 text-white ring-2 ring-green-300 shadow-md shadow-green-500/60";
              else if (isMissed)
                cls += "bg-neutral-700 text-neutral-500";
              else if (isHot)
                cls += "bg-orange-600 text-white";
              else if (isSelected)
                cls += "bg-yellow-400 text-black ring-2 ring-yellow-200";
              else
                cls += "bg-neutral-800 hover:bg-neutral-700 text-neutral-300 cursor-pointer";

              return (
                <button
                  key={n}
                  onClick={() => toggleNumber(n)}
                  disabled={phase !== "pick"}
                  className={cls}
                >
                  {n}
                </button>
              );
            })}
          </div>

          <div className="mt-3 bg-neutral-950 p-3 rounded-lg border border-neutral-800 text-center min-h-12 flex items-center justify-center">
            <p className={`font-mono text-sm font-bold tracking-wide ${
              message.includes("+") ? "text-green-400" :
              message.includes("NO WIN") || message.includes("-") ? "text-red-400" :
              message.includes("CATCHES") ? "text-yellow-400" :
              "text-white"
            }`}>
              {message}
            </p>
          </div>
        </div>

        {/* Color legend */}
        {phase !== "bet" && (
          <div className="flex gap-5 text-xs font-mono text-neutral-400 flex-wrap justify-center">
            <span><span className="inline-block w-3 h-3 rounded bg-yellow-400 mr-1 align-middle" />Your picks</span>
            <span><span className="inline-block w-3 h-3 rounded bg-green-500 mr-1 align-middle" />Match!</span>
            <span><span className="inline-block w-3 h-3 rounded bg-orange-600 mr-1 align-middle" />Drawn (no match)</span>
          </div>
        )}

        {/* Paytable for current pick count */}
        {phase === "pick" && selected.size >= MIN_PICKS && currentPayout && (
          <div className="w-full bg-black/50 rounded-xl border border-purple-900 p-3">
            <p className="text-center text-xs text-purple-400 font-mono mb-2 uppercase tracking-wider">
              Paytable — Pick {selected.size}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
              {Object.entries(currentPayout).map(([c, mult]) => (
                <div key={c} className="flex justify-between px-3 py-1 bg-neutral-900 rounded text-xs font-mono">
                  <span className="text-neutral-400">{c} catch{Number(c) !== 1 ? "es" : ""}</span>
                  <span className="text-yellow-400 font-black">{mult}×</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Phase controls */}
        {phase === "bet" && (
          <div className="flex flex-col items-center gap-4">
            <BetSelector balance={user.balance} bet={bet} onChange={setBet} disabled={false} />
            <button
              onClick={confirmBet}
              disabled={user.balance < bet || bet < MIN_BET}
              className="px-16 py-8 rounded-2xl text-3xl font-black tracking-wider bg-gradient-to-r from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600 border-b-8 border-violet-900 active:border-b-2 transition-all active:scale-95 shadow-2xl disabled:opacity-50"
            >
              PLAY [SPACE]
            </button>
          </div>
        )}

        {phase === "pick" && (
          <button
            onClick={draw}
            disabled={selected.size < MIN_PICKS}
            className="px-12 py-6 rounded-2xl text-2xl font-black tracking-wider bg-gradient-to-r from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600 border-b-8 border-violet-900 active:border-b-2 transition-all active:scale-95 shadow-2xl disabled:opacity-50"
          >
            {selected.size >= MIN_PICKS
              ? `DRAW [SPACE]`
              : `PICK ${MIN_PICKS - selected.size} MORE`}
          </button>
        )}

        {phase === "result" && (
          <button
            onClick={resetBoard}
            className="px-12 py-6 rounded-2xl text-2xl font-black tracking-wider bg-gradient-to-r from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600 border-b-8 border-violet-900 active:border-b-2 transition-all active:scale-95 shadow-2xl"
          >
            PLAY AGAIN [SPACE]
          </button>
        )}
      </div>
    </div>
  );
}
