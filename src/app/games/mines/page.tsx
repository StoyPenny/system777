"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import BalanceBar from "@/components/BalanceBar";
import BetSelector from "@/components/BetSelector";
import WinEffect from "@/components/WinEffect";
import { loadSession, saveSession } from "@/lib/session";
import { playWin, playBigWin, playLose, playTick } from "@/lib/sounds";
import { UserProfile } from "@/types";

const GRID = 25; // 5×5
const MINE_PRESETS = [1, 2, 3, 5, 10, 15, 20, 24];
const MIN_BET = 1;
const HOUSE_EDGE = 0.99;

// P(surviving k picks on GRID tiles with m mines) = ∏ (GRID-m-i)/(GRID-i)
// Fair multiplier = HOUSE_EDGE / P
function multiplierAt(picks: number, mines: number): number {
  if (picks === 0) return 1;
  let p = 1;
  for (let i = 0; i < picks; i++) {
    p *= (GRID - mines - i) / (GRID - i);
  }
  return HOUSE_EDGE / p;
}

function placeMines(count: number): boolean[] {
  const field = Array(GRID).fill(false) as boolean[];
  const idx = Array.from({ length: GRID }, (_, i) => i).sort(() => Math.random() - 0.5);
  for (let i = 0; i < count; i++) field[idx[i]] = true;
  return field;
}

type Phase = "betting" | "playing" | "result";

export default function MinesPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [bet, setBet] = useState(10);
  const [mineCount, setMineCount] = useState(3);
  const [phase, setPhase] = useState<Phase>("betting");
  const [field, setField] = useState<boolean[]>(Array(GRID).fill(false));
  const [revealed, setRevealed] = useState<boolean[]>(Array(GRID).fill(false));
  const [picks, setPicks] = useState(0);
  const [hitMine, setHitMine] = useState(false);
  const [message, setMessage] = useState("SET YOUR BET AND CHOOSE MINE COUNT");
  const [winEffect, setWinEffect] = useState({ show: false, big: false });

  useEffect(() => {
    const session = loadSession();
    if (!session) { router.replace("/"); return; }
    setUser(session);
  }, [router]);

  const reset = useCallback(() => {
    setField(Array(GRID).fill(false));
    setRevealed(Array(GRID).fill(false));
    setPicks(0);
    setHitMine(false);
    setPhase("betting");
    setMessage("SET YOUR BET AND CHOOSE MINE COUNT");
  }, []);

  const startGame = useCallback(() => {
    if (!user || user.balance < bet || bet < MIN_BET) {
      setMessage(bet < MIN_BET ? `MINIMUM BET IS ${MIN_BET}!` : "NOT ENOUGH CREDITS!");
      return;
    }
    setField(placeMines(mineCount));
    setRevealed(Array(GRID).fill(false));
    setPicks(0);
    setHitMine(false);
    setPhase("playing");
    setMessage("CLICK A TILE — AVOID THE MINES!");
  }, [user, bet, mineCount]);

  const cashOut = useCallback(async () => {
    if (phase !== "playing" || picks === 0 || !user) return;
    const mult = multiplierAt(picks, mineCount);
    const delta = Math.floor(bet * mult);
    const isBig = mult >= 5;

    setMessage(`CASHED OUT ${mult.toFixed(2)}× — +${delta.toLocaleString()} CREDITS!`);
    setPhase("result");

    if (isBig) { playBigWin(); setWinEffect({ show: true, big: true }); }
    else        { playWin();    setWinEffect({ show: true, big: false }); }

    const res = await fetch("/api/game-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, game: "mines", result: "win", amount: delta }),
    });
    if (res.ok) {
      const { user: updated } = await res.json();
      saveSession(updated);
      setUser(updated);
    }
  }, [phase, picks, user, bet, mineCount]);

  const revealTile = useCallback(async (idx: number) => {
    if (phase !== "playing" || revealed[idx] || !user) return;

    const newRevealed = revealed.map((v, i) => i === idx ? true : v);
    setRevealed(newRevealed);

    if (field[idx]) {
      // Mine!
      setHitMine(true);
      setPhase("result");
      playLose();
      setMessage(`💥 BOOM! You hit a mine. -${bet.toLocaleString()} CREDITS`);

      const res = await fetch("/api/game-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, game: "mines", result: "lose", amount: -bet }),
      });
      if (res.ok) {
        const { user: updated } = await res.json();
        saveSession(updated);
        setUser(updated);
      }
      return;
    }

    // Safe gem
    playTick();
    const newPicks = picks + 1;
    setPicks(newPicks);
    const gemsTotal = GRID - mineCount;

    if (newPicks === gemsTotal) {
      // All gems found — auto-win
      const mult = multiplierAt(newPicks, mineCount);
      const delta = Math.floor(bet * mult);
      setMessage(`ALL GEMS FOUND! ${mult.toFixed(2)}× — +${delta.toLocaleString()} CREDITS!`);
      setPhase("result");
      playBigWin();
      setWinEffect({ show: true, big: true });

      const res = await fetch("/api/game-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, game: "mines", result: "win", amount: delta }),
      });
      if (res.ok) {
        const { user: updated } = await res.json();
        saveSession(updated);
        setUser(updated);
      }
    } else {
      const mult = multiplierAt(newPicks, mineCount);
      const next = multiplierAt(newPicks + 1, mineCount);
      setMessage(`${newPicks} GEM${newPicks !== 1 ? "S" : ""} — ${mult.toFixed(2)}× · NEXT: ${next.toFixed(2)}× · CASH OUT OR KEEP GOING`);
    }
  }, [phase, revealed, field, user, bet, mineCount, picks]);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") { router.push("/lobby"); return; }
      if (phase === "betting" && e.code === "Space") { e.preventDefault(); startGame(); }
      if (phase === "playing" && e.code === "Space") { e.preventDefault(); cashOut(); }
      if (phase === "result"  && e.code === "Space") { e.preventDefault(); reset(); }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [phase, startGame, cashOut, reset, router]);

  if (!user) return null;

  const curMult  = multiplierAt(picks, mineCount);
  const nextMult = multiplierAt(picks + 1, mineCount);
  const maxMult  = multiplierAt(GRID - mineCount, mineCount);

  const msgColor =
    message.includes("+") || message.includes("CASHED") || message.includes("ALL GEMS") ? "text-green-400" :
    message.includes("BOOM") || message.includes("-") ? "text-red-400" :
    "text-white";

  return (
    <div className="flex flex-col min-h-screen bg-lime-950 text-white">
      <BalanceBar user={user} onLogout={() => router.replace("/")} />
      <WinEffect
        show={winEffect.show}
        game="mines"
        big={winEffect.big}
        onDone={() => setWinEffect({ show: false, big: false })}
      />

      <div className="flex flex-col items-center gap-4 p-4 pt-24 pb-8 w-full max-w-xl mx-auto">
        <button
          onClick={() => router.push("/lobby")}
          className="self-start px-4 py-2 bg-black/40 hover:bg-black/60 border border-neutral-700 rounded-lg text-sm font-mono"
        >
          ← [ESC] LOBBY
        </button>

        <div className="w-full bg-black rounded-3xl p-4 border-8 border-lime-600 shadow-2xl">
          {/* Header */}
          <div className="text-center text-lg font-black tracking-widest mb-3 pb-3 border-b border-neutral-800 text-lime-400">
            MINES
            {phase !== "betting" && (
              <span className="ml-3 text-sm font-mono font-normal text-neutral-400">
                BET: <span className="text-yellow-400">{bet.toLocaleString()}</span>
                {" · "}
                <span className="text-red-400">💣 {mineCount} mines</span>
              </span>
            )}
          </div>

          {/* Live stats (playing or result) */}
          {phase !== "betting" && (
            <div className="flex justify-around mb-3">
              <div className="text-center">
                <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">Multiplier</div>
                <div className={`text-2xl font-black ${hitMine ? "text-red-400" : "text-lime-400"}`}>
                  {curMult.toFixed(2)}×
                </div>
              </div>
              {phase === "playing" && (
                <div className="text-center">
                  <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">Next Gem</div>
                  <div className="text-2xl font-black text-yellow-400">{nextMult.toFixed(2)}×</div>
                </div>
              )}
              <div className="text-center">
                <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">Gems Found</div>
                <div className="text-2xl font-black text-green-400">{picks} / {GRID - mineCount}</div>
              </div>
            </div>
          )}

          {/* 5×5 grid */}
          <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
            {Array.from({ length: GRID }, (_, idx) => {
              const isRevealed  = revealed[idx];
              const isMine      = field[idx];
              const showGem     = isRevealed && !isMine;
              const showHitMine = isRevealed && isMine;                        // tile player clicked
              const showHintMine = phase === "result" && !isRevealed && isMine; // other mines revealed after game

              let cls = "aspect-square rounded-lg text-xl flex items-center justify-center transition-all select-none font-bold ";
              if (showHitMine) {
                cls += "bg-red-700 border-2 border-red-400 cursor-default animate-pulse";
              } else if (showGem) {
                cls += "bg-lime-700 border-2 border-lime-400 cursor-default";
              } else if (showHintMine) {
                cls += "bg-red-950 border-2 border-red-800 cursor-default opacity-80";
              } else if (phase === "playing") {
                cls += "bg-neutral-700 hover:bg-lime-900 hover:border-lime-700 border-2 border-neutral-600 cursor-pointer active:scale-90";
              } else {
                cls += "bg-neutral-800 border-2 border-neutral-700 cursor-default";
              }

              return (
                <button
                  key={idx}
                  onClick={() => revealTile(idx)}
                  disabled={phase !== "playing" || isRevealed}
                  className={cls}
                >
                  {showGem      && "💎"}
                  {showHitMine  && "💣"}
                  {showHintMine && "💣"}
                </button>
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
          <div className="w-full flex flex-col items-center gap-4">
            {/* Mine count picker */}
            <div className="w-full bg-black/40 rounded-xl border border-lime-900 p-3">
              <p className="text-center text-xs text-lime-400 font-mono mb-2 uppercase tracking-wider">
                Mines on board
              </p>
              <div className="flex gap-2 flex-wrap justify-center">
                {MINE_PRESETS.map((n) => (
                  <button
                    key={n}
                    onClick={() => setMineCount(n)}
                    className={`px-3 py-2 rounded-lg text-sm font-black font-mono transition-all
                      ${mineCount === n
                        ? "bg-lime-600 text-white border-2 border-lime-300 scale-105"
                        : "bg-neutral-800 text-neutral-400 border-2 border-neutral-700 hover:border-neutral-500"}`}
                  >
                    {n} 💣
                  </button>
                ))}
              </div>
              <p className="text-center text-[11px] text-neutral-600 font-mono mt-2">
                {GRID - mineCount} gems · max payout {maxMult.toFixed(2)}×
              </p>
            </div>

            <BetSelector balance={user.balance} bet={bet} onChange={setBet} disabled={false} />
            <button
              onClick={startGame}
              disabled={user.balance < bet || bet < MIN_BET}
              className="px-16 py-8 rounded-2xl text-3xl font-black tracking-wider bg-gradient-to-r from-lime-500 to-lime-600 hover:from-lime-400 hover:to-lime-500 border-b-8 border-lime-900 active:border-b-2 transition-all active:scale-95 shadow-2xl disabled:opacity-50"
            >
              PLAY [SPACE]
            </button>
          </div>
        )}

        {/* Cash out button */}
        {phase === "playing" && (
          <button
            onClick={cashOut}
            disabled={picks === 0}
            className="w-full px-8 py-6 rounded-2xl text-2xl font-black tracking-wider bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 border-b-8 border-orange-900 active:border-b-2 transition-all active:scale-95 shadow-2xl disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {picks === 0
              ? "REVEAL A GEM FIRST"
              : `CASH OUT ${curMult.toFixed(2)}× · +${Math.floor(bet * curMult).toLocaleString()} [SPACE]`}
          </button>
        )}

        {/* Play again */}
        {phase === "result" && (
          <button
            onClick={reset}
            className="px-16 py-8 rounded-2xl text-3xl font-black tracking-wider bg-gradient-to-r from-lime-500 to-lime-600 hover:from-lime-400 hover:to-lime-500 border-b-8 border-lime-900 active:border-b-2 transition-all active:scale-95 shadow-2xl"
          >
            PLAY AGAIN [SPACE]
          </button>
        )}
      </div>
    </div>
  );
}
