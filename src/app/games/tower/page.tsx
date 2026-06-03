"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import BalanceBar from "@/components/BalanceBar";
import BetSelector from "@/components/BetSelector";
import WinEffect from "@/components/WinEffect";
import { loadSession, saveSession } from "@/lib/session";
import { playWin, playBigWin, playLose, playTick } from "@/lib/sounds";
import { UserProfile } from "@/types";

const ROWS = 8;
const COLS = 3;
const MIN_BET = 1;

// multiplierAt(k) = payout after clearing k rows (1-indexed). 2/3 safe per row → (3/2)^k odds.
const MULTIPLIERS: number[] = Array.from({ length: ROWS }, (_, k) =>
  Math.floor(0.99 * 1.5 ** (k + 1) * 100) / 100
);
// [1.48, 2.22, 3.34, 5.01, 7.51, 11.27, 16.90, 25.36]

type Phase = "betting" | "climbing" | "result";

export default function TowerPage() {
  const router = useRouter();
  const [user, setUser]       = useState<UserProfile | null>(null);
  const [bet, setBet]         = useState(10);
  const [phase, setPhase]     = useState<Phase>("betting");
  const [traps, setTraps]     = useState<number[]>(Array(ROWS).fill(0));
  const [picks, setPicks]     = useState<number[]>(Array(ROWS).fill(-1));
  const [currentRow, setCurrentRow] = useState(0);
  const [failed, setFailed]   = useState(false);
  const [message, setMessage] = useState("SET YOUR BET — CLIMB THE TOWER!");
  const [winEffect, setWinEffect] = useState({ show: false, big: false });

  useEffect(() => {
    const session = loadSession();
    if (!session) { router.replace("/"); return; }
    setUser(session);
  }, [router]);

  const reset = useCallback(() => {
    setTraps(Array(ROWS).fill(0));
    setPicks(Array(ROWS).fill(-1));
    setCurrentRow(0);
    setFailed(false);
    setPhase("betting");
    setMessage("SET YOUR BET — CLIMB THE TOWER!");
  }, []);

  const startGame = useCallback(() => {
    if (!user || user.balance < bet || bet < MIN_BET) {
      setMessage(bet < MIN_BET ? `MINIMUM BET IS ${MIN_BET}!` : "NOT ENOUGH CREDITS!");
      return;
    }
    setTraps(Array.from({ length: ROWS }, () => Math.floor(Math.random() * COLS)));
    setPicks(Array(ROWS).fill(-1));
    setCurrentRow(0);
    setFailed(false);
    setPhase("climbing");
    setMessage("PICK A TILE — 2 ARE SAFE, 1 IS A TRAP!");
  }, [user, bet]);

  const cashOut = useCallback(async () => {
    if (phase !== "climbing" || currentRow === 0 || !user) return;
    const mult  = MULTIPLIERS[currentRow - 1];
    const delta = Math.floor(bet * mult);
    const isBig = currentRow >= 5;

    setPhase("result");
    setMessage(`CASHED OUT ${mult}× — +${delta.toLocaleString()} CREDITS!`);
    if (isBig) { playBigWin(); setWinEffect({ show: true, big: true }); }
    else        { playWin();    setWinEffect({ show: true, big: false }); }

    const res = await fetch("/api/game-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, game: "tower", result: "win", amount: delta }),
    });
    if (res.ok) {
      const { user: updated } = await res.json();
      saveSession(updated);
      setUser(updated);
    }
  }, [phase, currentRow, user, bet]);

  const pickTile = useCallback(async (col: number) => {
    if (phase !== "climbing" || !user || picks[currentRow] !== -1) return;

    const newPicks = picks.map((p, i) => (i === currentRow ? col : p));
    setPicks(newPicks);

    if (traps[currentRow] === col) {
      // Trap hit
      setFailed(true);
      setPhase("result");
      playLose();
      setMessage(`💥 TRAP on row ${currentRow + 1}! -${bet.toLocaleString()} CREDITS`);

      const res = await fetch("/api/game-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, game: "tower", result: "lose", amount: -bet }),
      });
      if (res.ok) {
        const { user: updated } = await res.json();
        saveSession(updated);
        setUser(updated);
      }
    } else {
      // Safe pick
      playTick();
      const cleared = currentRow;
      const next    = cleared + 1;

      if (next === ROWS) {
        // All rows cleared!
        const mult  = MULTIPLIERS[ROWS - 1];
        const delta = Math.floor(bet * mult);
        setCurrentRow(next);
        setPhase("result");
        playBigWin();
        setWinEffect({ show: true, big: true });
        setMessage(`TOWER CLEARED! ${mult}× — +${delta.toLocaleString()} CREDITS!`);

        const res = await fetch("/api/game-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id, game: "tower", result: "win", amount: delta }),
        });
        if (res.ok) {
          const { user: updated } = await res.json();
          saveSession(updated);
          setUser(updated);
        }
      } else {
        setCurrentRow(next);
        setMessage(`ROW ${cleared + 1} SAFE! ${MULTIPLIERS[cleared]}× — KEEP CLIMBING OR CASH OUT`);
      }
    }
  }, [phase, picks, currentRow, traps, user, bet]);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") { router.push("/lobby"); return; }
      if (phase === "betting"  && e.code === "Space") { e.preventDefault(); startGame(); }
      if (phase === "climbing") {
        if (e.key === "1") pickTile(0);
        if (e.key === "2") pickTile(1);
        if (e.key === "3") pickTile(2);
        if (e.code === "Space") { e.preventDefault(); cashOut(); }
      }
      if (phase === "result"   && e.code === "Space") { e.preventDefault(); reset(); }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [phase, startGame, pickTile, cashOut, reset, router]);

  if (!user) return null;

  const curMult = currentRow > 0 ? MULTIPLIERS[currentRow - 1] : null;

  const msgColor =
    message.includes("+") || message.includes("CASHED") || message.includes("CLEARED") ? "text-green-400" :
    message.includes("TRAP")  || message.includes("-") ? "text-red-400" :
    message.includes("SAFE!")                          ? "text-yellow-400" :
    "text-white";

  return (
    <div className="flex flex-col min-h-screen bg-violet-950 text-white">
      <BalanceBar user={user} onLogout={() => router.replace("/")} />
      <WinEffect
        show={winEffect.show}
        game="tower"
        big={winEffect.big}
        onDone={() => setWinEffect({ show: false, big: false })}
      />

      <div className="flex flex-col items-center gap-4 p-4 pt-24 pb-8 w-full max-w-md mx-auto">
        <button
          onClick={() => router.push("/lobby")}
          className="self-start px-4 py-2 bg-black/40 hover:bg-black/60 border border-neutral-700 rounded-lg text-sm font-mono"
        >
          ← [ESC] LOBBY
        </button>

        <div className="w-full bg-black rounded-3xl p-4 border-8 border-violet-600 shadow-2xl">
          {/* Header */}
          <div className="text-center text-lg font-black tracking-widest mb-3 pb-3 border-b border-neutral-800 text-violet-400">
            TOWER CLIMB
            {phase !== "betting" && curMult !== null && (
              <span className="ml-3 text-sm font-mono font-normal text-neutral-400">
                BET: <span className="text-yellow-400">{bet.toLocaleString()}</span>
                {" · "}<span className="text-violet-300">{curMult}×</span>
              </span>
            )}
          </div>

          {/* Tower grid — row ROWS-1 at top, row 0 at bottom */}
          <div className="flex flex-col gap-1.5">
            {Array.from({ length: ROWS }, (_, i) => ROWS - 1 - i).map((rowIdx) => {
              const isCompleted = rowIdx < currentRow;
              const isActive    = phase === "climbing" && rowIdx === currentRow;
              const isFailed    = phase === "result"   && failed && rowIdx === currentRow;
              const mult        = MULTIPLIERS[rowIdx];

              let rowCls = "flex items-center gap-2 py-1 px-1 rounded-xl transition-all ";
              if (isActive)    rowCls += "bg-violet-900/50 ring-2 ring-violet-400";
              else if (isFailed)    rowCls += "bg-red-950/50 ring-2 ring-red-700";
              else if (isCompleted) rowCls += "bg-green-950/30";

              const multCls =
                isActive    ? "text-yellow-400" :
                isCompleted ? "text-green-500"  :
                isFailed    ? "text-red-400"    :
                              "text-neutral-700";

              return (
                <div key={rowIdx} className={rowCls}>
                  {/* Multiplier */}
                  <div className={`w-12 text-right font-mono text-xs font-black shrink-0 ${multCls}`}>
                    {mult}×
                  </div>

                  {/* 3 tiles */}
                  <div className="flex gap-1.5 flex-1">
                    {Array.from({ length: COLS }, (_, col) => {
                      const isPicked = picks[rowIdx] === col;
                      const isTrap   = traps[rowIdx] === col;

                      let cls  = "flex-1 h-11 rounded-lg flex items-center justify-center text-sm font-black border-2 transition-all select-none ";
                      let icon = "";

                      if (isActive) {
                        cls  += "bg-violet-800 border-violet-500 hover:bg-violet-600 hover:border-violet-300 cursor-pointer active:scale-95";
                        icon  = String(col + 1);
                      } else if (isCompleted) {
                        if (isPicked)    { cls += "bg-green-700 border-green-500";              icon = "✓"; }
                        else if (isTrap) { cls += "bg-red-900 border-red-800";                  icon = "💀"; }
                        else             { cls += "bg-neutral-700 border-neutral-600"; }
                      } else if (isFailed) {
                        // Player picked the trap on this row
                        if (isPicked) { cls += "bg-red-600 border-red-400 animate-pulse"; icon = "💣"; }
                        else          { cls += "bg-green-900/50 border-green-800";        icon = "✓"; }
                      } else if (phase === "result") {
                        // Future rows revealed after game ends
                        if (isTrap) { cls += "bg-red-950 border-red-900 opacity-60"; icon = "💀"; }
                        else        { cls += "bg-neutral-800 border-neutral-700 opacity-25"; }
                      } else {
                        // Locked future row during climbing
                        cls += "bg-neutral-800 border-neutral-700 opacity-25";
                      }

                      return (
                        <button
                          key={col}
                          onClick={() => pickTile(col)}
                          disabled={!isActive}
                          className={cls}
                        >
                          {icon}
                        </button>
                      );
                    })}
                  </div>

                  {/* Row status */}
                  <div className="w-5 shrink-0 text-center">
                    {isCompleted && <span className="text-green-400 text-sm">✓</span>}
                    {isActive    && <span className="text-violet-400 text-base animate-pulse">▶</span>}
                    {isFailed    && <span className="text-red-400 text-sm">✗</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Message bar */}
          <div className="mt-3 bg-neutral-950 p-2.5 rounded-lg border border-neutral-800 text-center min-h-10 flex items-center justify-center">
            <p className={`font-mono text-xs font-bold tracking-wide ${msgColor}`}>{message}</p>
          </div>
        </div>

        {/* Betting controls */}
        {phase === "betting" && (
          <>
            {/* Payout ladder */}
            <div className="w-full bg-black/40 rounded-xl border border-violet-900 p-3">
              <p className="text-center text-xs text-violet-400 font-mono mb-2 uppercase tracking-wider">
                Payout ladder — 2/3 safe per row
              </p>
              <div className="grid grid-cols-4 gap-1">
                {MULTIPLIERS.map((m, i) => (
                  <div key={i} className="flex flex-col items-center py-1.5 bg-neutral-900 rounded text-xs font-mono">
                    <span className="text-neutral-500 text-[10px]">Row {i + 1}</span>
                    <span className="text-yellow-400 font-black">{m}×</span>
                  </div>
                ))}
              </div>
            </div>
            <BetSelector balance={user.balance} bet={bet} onChange={setBet} disabled={false} />
            <button
              onClick={startGame}
              disabled={user.balance < bet || bet < MIN_BET}
              className="px-16 py-8 rounded-2xl text-3xl font-black tracking-wider bg-gradient-to-r from-violet-500 to-violet-600 hover:from-violet-400 hover:to-violet-500 border-b-8 border-violet-900 active:border-b-2 transition-all active:scale-95 shadow-2xl disabled:opacity-50"
            >
              CLIMB [SPACE]
            </button>
          </>
        )}

        {/* Cash out button */}
        {phase === "climbing" && (
          <button
            onClick={cashOut}
            disabled={currentRow === 0}
            className="w-full px-8 py-6 rounded-2xl text-xl font-black tracking-wider bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 border-b-8 border-orange-900 active:border-b-2 transition-all active:scale-95 shadow-2xl disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {currentRow === 0
              ? "PICK YOUR FIRST TILE"
              : `CASH OUT ${curMult}× [SPACE] · +${Math.floor(bet * curMult!).toLocaleString()}`}
          </button>
        )}

        {/* Play again */}
        {phase === "result" && (
          <button
            onClick={reset}
            className="px-16 py-8 rounded-2xl text-3xl font-black tracking-wider bg-gradient-to-r from-violet-500 to-violet-600 hover:from-violet-400 hover:to-violet-500 border-b-8 border-violet-900 active:border-b-2 transition-all active:scale-95 shadow-2xl"
          >
            PLAY AGAIN [SPACE]
          </button>
        )}
      </div>
    </div>
  );
}
