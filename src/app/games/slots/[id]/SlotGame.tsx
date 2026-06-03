"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import BalanceBar from "@/components/BalanceBar";
import BetSelector from "@/components/BetSelector";
import WinEffect from "@/components/WinEffect";
import { loadSession, saveSession } from "@/lib/session";
import { playWin, playBigWin, playLose, playTick, playSpinClick } from "@/lib/sounds";
import { SlotMachineConfig } from "@/lib/slotMachines";
import { UserProfile } from "@/types";

const MIN_BET = 1;
const SYMBOL_H = 80;  // px per symbol cell
const VISIBLE = 3;    // symbols visible per reel
// 240Hz * 3.2s * 0.38 symbols/frame ≈ 292 symbols max before stop; 60 repeats = 420 symbols (safe)
const STRIP_REPEAT = 60;

interface ReelProps {
  symbols: string[];
  spinning: boolean;
  targetIndex: number | null;
  spinDelay?: number;
  onStop: () => void;
}

function Reel({ symbols, spinning, targetIndex, spinDelay = 0, onStop }: ReelProps) {
  const strip = useMemo(
    () => Array.from({ length: STRIP_REPEAT * symbols.length }, (_, i) => symbols[i % symbols.length]),
    [symbols]
  );

  const posRef = useRef(2.0);
  const [displayPos, setDisplayPos] = useState(2.0);
  const [transitioning, setTransitioning] = useState(false);
  const rafRef = useRef<number | null>(null);
  const hasStoppedRef = useRef(false);
  const onStopRef = useRef(onStop);
  useEffect(() => { onStopRef.current = onStop; });

  // Reset state when a new spin begins
  useEffect(() => {
    if (!spinning) return;
    hasStoppedRef.current = false;
    setTransitioning(false);
    posRef.current = 2.0;
    setDisplayPos(2.0);
  }, [spinning]);

  // Spin animation loop
  useEffect(() => {
    if (!spinning) return;

    const SPEED = 0.38; // symbols per frame at ~60fps
    let rafId: number;

    const timer = setTimeout(() => {
      function tick() {
        posRef.current += SPEED;
        setDisplayPos(posRef.current);
        rafId = requestAnimationFrame(tick);
        rafRef.current = rafId;
      }
      rafId = requestAnimationFrame(tick);
      rafRef.current = rafId;
    }, spinDelay);

    return () => {
      clearTimeout(timer);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [spinning, spinDelay]);

  // Stop when targetIndex is assigned
  useEffect(() => {
    if (targetIndex === null || hasStoppedRef.current) return;
    hasStoppedRef.current = true;

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const current = posRef.current;
    // Find target pos where the middle row (pos+1) lands on targetIndex
    const minAdvance = symbols.length + 3;
    let tp = Math.ceil(current) + minAdvance;
    for (let guard = 0; guard < symbols.length; guard++, tp++) {
      if ((tp + 1) % symbols.length === targetIndex) break;
    }
    // Clamp so the bottom of the visible window (tp+2) stays within the strip
    if (tp + VISIBLE >= strip.length) tp = strip.length - VISIBLE - 1;

    posRef.current = tp;
    setTransitioning(true);
    setDisplayPos(tp);

    const timer = setTimeout(() => {
      setTransitioning(false);
      onStopRef.current();
    }, 700);

    return () => clearTimeout(timer);
  }, [targetIndex, symbols.length]);

  const translateY = -(displayPos * SYMBOL_H);

  return (
    <div
      className="relative overflow-hidden rounded-lg border-2 border-neutral-700 bg-neutral-950 flex-1"
      style={{ height: SYMBOL_H * VISIBLE }}
    >
      {/* Scrolling strip */}
      <div
        style={{
          transform: `translateY(${translateY}px)`,
          transition: transitioning ? "transform 0.65s cubic-bezier(0.33, 1, 0.68, 1)" : "none",
          willChange: "transform",
        }}
      >
        {strip.map((sym, i) => (
          <div
            key={i}
            className="flex items-center justify-center select-none"
            style={{ height: SYMBOL_H, fontSize: "2.8rem" }}
          >
            {sym}
          </div>
        ))}
      </div>

      {/* Fade edges */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-neutral-950 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-neutral-950 to-transparent" />

      {/* Payline row highlight */}
      <div
        className="pointer-events-none absolute inset-x-0 border-y-2 border-amber-500/30"
        style={{ top: SYMBOL_H, height: SYMBOL_H }}
      />
    </div>
  );
}

interface SlotGameProps {
  config: SlotMachineConfig;
}

export default function SlotGame({ config }: SlotGameProps) {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [targets, setTargets] = useState<(number | null)[]>([null, null, null]);
  const [message, setMessage] = useState("PLACE YOUR BET AND SPIN!");
  const [bet, setBet] = useState(10);
  const [winEffect, setWinEffect] = useState<{ show: boolean; big: boolean }>({ show: false, big: false });

  // Refs to safely read current values inside async callbacks
  const betRef = useRef(bet);
  betRef.current = bet;
  const userRef = useRef(user);
  userRef.current = user;
  const finalSymbolsRef = useRef<string[]>([]);
  const stoppedCountRef = useRef(0);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const session = loadSession();
    if (!session) { router.replace("/"); return; }
    setUser(session);
  }, [router]);

  const recordResult = useCallback(async (delta: number, result: string, currentUser: UserProfile) => {
    const res = await fetch("/api/game-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: currentUser.id, game: "slots", result, amount: delta }),
    });
    if (res.ok) {
      const { user: updated } = await res.json();
      saveSession(updated);
      setUser(updated);
    }
  }, []);

  const handleReelStop = useCallback(() => {
    stoppedCountRef.current++;
    if (stoppedCountRef.current < 3) return;

    if (tickIntervalRef.current !== null) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }

    setSpinning(false);

    const final = finalSymbolsRef.current;
    const currentBet = betRef.current;
    const currentUser = userRef.current;
    if (!currentUser) return;

    let delta = -currentBet;
    let result = "lose";
    let msg = "TRY AGAIN!";

    if (final[0] === final[1] && final[1] === final[2]) {
      delta = currentBet * 10;
      result = "jackpot";
      msg = `JACKPOT! +${(currentBet * 10).toLocaleString()} CREDITS`;
      playBigWin();
      setWinEffect({ show: true, big: true });
    } else if (final[0] === final[1] || final[1] === final[2] || final[0] === final[2]) {
      delta = currentBet * 2;
      result = "two-of-a-kind";
      msg = `TWO OF A KIND! +${(currentBet * 2).toLocaleString()} CREDITS`;
      playWin();
      setWinEffect({ show: true, big: false });
    } else {
      playLose();
    }

    setMessage(msg);
    recordResult(delta, result, currentUser);
  }, [recordResult]);

  const spin = useCallback(() => {
    if (spinning || !userRef.current || betRef.current < MIN_BET || userRef.current.balance < betRef.current) {
      if (userRef.current && userRef.current.balance < betRef.current) setMessage("NOT ENOUGH CREDITS!");
      return;
    }

    playSpinClick();
    setSpinning(true);
    setMessage("SPINNING...");
    setTargets([null, null, null]);
    stoppedCountRef.current = 0;

    tickIntervalRef.current = setInterval(() => playTick(), 150);

    const s = config.symbols;
    const f = Array.from({ length: 3 }, () => s[Math.floor(Math.random() * s.length)]);
    finalSymbolsRef.current = f;

    // Stop reels left → middle → right
    [1600, 2200, 2800].forEach((delay, i) => {
      setTimeout(() => {
        setTargets(prev => {
          const next = [...prev];
          next[i] = s.indexOf(f[i]);
          return next;
        });
      }, delay);
    });
  }, [spinning, config.symbols]);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.code === "Space") { e.preventDefault(); spin(); }
      if (e.key === "Escape") router.push("/games/slots");
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [spin, router]);

  if (!user) return null;

  return (
    <div className={`flex flex-col min-h-screen ${config.bgColor} text-white transition-colors duration-500`}>
      <BalanceBar user={user} onLogout={() => router.replace("/")} />
      <WinEffect
        show={winEffect.show}
        game="slots"
        big={winEffect.big}
        onDone={() => setWinEffect({ show: false, big: false })}
      />

      <div className="flex flex-col items-center justify-center flex-1 gap-5 p-6 pt-24">
        <button
          onClick={() => router.push("/games/slots")}
          className="self-start px-4 py-2 bg-black/40 hover:bg-black/60 border border-neutral-700 rounded-lg text-sm font-mono"
        >
          ← [ESC] ALL MACHINES
        </button>

        <div className={`w-full max-w-xl bg-black rounded-3xl p-6 border-8 ${config.borderColor} shadow-2xl`}>
          <div className="text-center mb-2">
            <p className={`text-xl font-black tracking-widest ${config.accentColor}`}>
              {config.name.toUpperCase()}
            </p>
            <p className="text-neutral-600 text-xs mt-0.5">{config.tagline}</p>
          </div>

          {/* Reel window */}
          <div className="flex gap-3 bg-neutral-900 p-4 rounded-xl border-4 border-neutral-800 mt-4">
            {[0, 1, 2].map(i => (
              <Reel
                key={i}
                symbols={config.symbols}
                spinning={spinning}
                targetIndex={targets[i]}
                spinDelay={i * 60}
                onStop={handleReelStop}
              />
            ))}
          </div>

          <div className="flex items-center gap-2 mt-2 px-1">
            <div className="flex-1 h-px bg-amber-500/20" />
            <span className="text-amber-500/40 text-xs font-mono tracking-widest">PAYLINE</span>
            <div className="flex-1 h-px bg-amber-500/20" />
          </div>

          <div className="mt-2 bg-neutral-950 p-3 rounded-lg border border-neutral-800 text-center min-h-12 flex items-center justify-center">
            <p className={`font-mono text-sm font-bold tracking-wide ${
              message.includes("JACKPOT") ? `${config.accentColor} text-lg`
              : message.includes("TWO")   ? "text-green-400"
              : "text-white"
            }`}>
              {message}
            </p>
          </div>
        </div>

        <BetSelector balance={user.balance} bet={bet} onChange={setBet} disabled={spinning} />

        <button
          onClick={spin}
          disabled={spinning || bet < MIN_BET || user.balance < bet}
          className={`px-16 py-8 rounded-2xl text-3xl font-black tracking-wider transition-all shadow-2xl active:scale-95 border-b-8 disabled:opacity-50 disabled:cursor-not-allowed ${
            spinning
              ? "bg-neutral-700 border-neutral-900 text-neutral-400 cursor-wait"
              : "bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 border-green-800 active:border-b-2 text-white"
          }`}
        >
          {spinning ? "SPINNING..." : "SPIN [SPACE]"}
        </button>
      </div>
    </div>
  );
}
