"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import BalanceBar from "@/components/BalanceBar";
import WinEffect from "@/components/WinEffect";
import { loadSession, saveSession } from "@/lib/session";
import { playWin, playBigWin, playLose, playTick } from "@/lib/sounds";
import { UserProfile } from "@/types";

// Crown & Anchor uses a per-symbol betting board — no BetSelector needed.
// Keys 1-5 select chip denomination; clicking any symbol adds the active chip.

interface SymDef {
  key:    string;
  label:  string;
  name:   string;
  dieCls: string; // Tailwind class applied to the label on a white die
}

const SYMBOLS: SymDef[] = [
  { key: "spade",   label: "♠",  name: "Spade",   dieCls: "text-neutral-900" },
  { key: "heart",   label: "♥",  name: "Heart",   dieCls: "text-red-600"     },
  { key: "club",    label: "♣",  name: "Club",    dieCls: "text-neutral-900" },
  { key: "diamond", label: "♦",  name: "Diamond", dieCls: "text-blue-600"    },
  { key: "crown",   label: "👑", name: "Crown",   dieCls: ""                 },
  { key: "anchor",  label: "⚓", name: "Anchor",  dieCls: ""                 },
];

const CHIPS      = [1, 5, 10, 25, 50];
const EMPTY_BETS = (): Record<string, number> =>
  Object.fromEntries(SYMBOLS.map(s => [s.key, 0]));
const BLANK_DICE = ["", "", ""];

type Phase = "betting" | "rolling" | "result";

function Die({ symbol, blank }: { symbol: string; blank: boolean }) {
  const sym = SYMBOLS.find(s => s.key === symbol);
  if (blank || !sym) {
    return (
      <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-neutral-800 border-4 border-neutral-600 flex items-center justify-center shadow-xl">
        <span className="text-neutral-600 text-3xl">?</span>
      </div>
    );
  }
  return (
    <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-white border-4 border-neutral-200 flex items-center justify-center shadow-xl shadow-white/10">
      <span className={`text-4xl font-black leading-none ${sym.dieCls}`}>{sym.label}</span>
    </div>
  );
}

export default function CrownAnchorPage() {
  const router = useRouter();
  const [user,     setUser]     = useState<UserProfile | null>(null);
  const [bets,     setBets]     = useState<Record<string, number>>(EMPTY_BETS());
  const [chip,     setChip]     = useState(10);
  const [phase,    setPhase]    = useState<Phase>("betting");
  const [dice,     setDice]     = useState<string[]>(BLANK_DICE);
  const [counts,   setCounts]   = useState<Record<string, number>>({});
  const [message,  setMessage]  = useState("PLACE YOUR BETS — CLICK A SYMBOL TO ADD CHIPS!");
  const [winEffect,setWinEffect]= useState({ show: false, big: false });

  useEffect(() => {
    const session = loadSession();
    if (!session) { router.replace("/"); return; }
    setUser(session);
  }, [router]);

  const totalBet = Object.values(bets).reduce((s, b) => s + b, 0);

  const addBet = useCallback((key: string) => {
    if (phase !== "betting") return;
    setBets(prev => ({ ...prev, [key]: prev[key] + chip }));
  }, [phase, chip]);

  const subtractBet = useCallback((key: string) => {
    if (phase !== "betting") return;
    setBets(prev => ({ ...prev, [key]: Math.max(0, prev[key] - chip) }));
  }, [phase, chip]);

  const clearBets  = useCallback(() => setBets(EMPTY_BETS()), []);

  const newRound = useCallback(() => {
    setPhase("betting");
    setDice(BLANK_DICE);
    setCounts({});
    setMessage("PLACE YOUR BETS — CLICK A SYMBOL TO ADD CHIPS!");
    // bets are intentionally kept so players can roll again unchanged
  }, []);

  const roll = useCallback(async () => {
    if (!user || phase !== "betting") return;
    if (totalBet === 0) { setMessage("CLICK A SYMBOL TO PLACE A CHIP!"); return; }
    if (user.balance < totalBet) { setMessage("NOT ENOUGH CREDITS — REDUCE YOUR BETS!"); return; }

    const keys    = SYMBOLS.map(s => s.key);
    const randSym = () => keys[Math.floor(Math.random() * 6)];

    setPhase("rolling");
    setMessage("ROLLING...");

    for (let i = 0; i < 12; i++) {
      await new Promise<void>(r => setTimeout(r, 55));
      setDice([randSym(), randSym(), randSym()]);
      if (i % 4 === 0) playTick();
    }

    const final = [randSym(), randSym(), randSym()];
    setDice(final);

    const finalCounts: Record<string, number> = {};
    for (const d of final) finalCounts[d] = (finalCounts[d] ?? 0) + 1;
    setCounts(finalCounts);

    // Net delta: for each symbol bet, +hits×bet if any match, -bet if none
    let delta = 0;
    for (const sym of SYMBOLS) {
      const b = bets[sym.key];
      if (b > 0) {
        const hits = finalCounts[sym.key] ?? 0;
        delta += hits > 0 ? b * hits : -b;
      }
    }

    const apiResult = delta > 0 ? "win" : delta === 0 ? "push" : "lose";
    const msg =
      delta > 0  ? `YOU WIN! +${delta.toLocaleString()} CREDITS` :
      delta === 0 ? "PUSH — BREAK EVEN!" :
                   `HOUSE WINS — -${Math.abs(delta).toLocaleString()} CREDITS`;

    setMessage(msg);
    setPhase("result");

    if (delta > 0) {
      const big = delta >= totalBet * 2; // e.g. triple on a symbol
      if (big) { playBigWin(); setWinEffect({ show: true, big: true }); }
      else      { playWin();    setWinEffect({ show: true, big: false }); }
    } else if (delta < 0) {
      playLose();
    }

    const res = await fetch("/api/game-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, game: "crownanchor", result: apiResult, amount: delta }),
    });
    if (res.ok) {
      const { user: updated } = await res.json();
      saveSession(updated);
      setUser(updated);
    }
  }, [user, phase, totalBet, bets]);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") { router.push("/lobby"); return; }
      if (phase === "betting") {
        if (e.code === "Space") { e.preventDefault(); roll(); }
        const ci = Number(e.key) - 1;
        if (ci >= 0 && ci < CHIPS.length) setChip(CHIPS[ci]);
      }
      if (phase === "result" && e.code === "Space") { e.preventDefault(); newRound(); }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [phase, roll, newRound, router]);

  if (!user) return null;

  const canRoll = totalBet > 0 && user.balance >= totalBet;

  return (
    <div className="flex flex-col min-h-screen bg-fuchsia-950 text-white">
      <BalanceBar user={user} onLogout={() => router.replace("/")} />
      <WinEffect
        show={winEffect.show}
        game="crownanchor"
        big={winEffect.big}
        onDone={() => setWinEffect({ show: false, big: false })}
      />

      <div className="flex flex-col items-center gap-4 p-4 pt-24 pb-8 w-full max-w-lg mx-auto">
        <button
          onClick={() => router.push("/lobby")}
          className="self-start px-4 py-2 bg-black/40 hover:bg-black/60 border border-neutral-700 rounded-lg text-sm font-mono"
        >
          ← [ESC] LOBBY
        </button>

        <div className="w-full bg-black rounded-3xl p-5 border-8 border-fuchsia-600 shadow-2xl">
          {/* Header */}
          <div className="text-center text-lg font-black tracking-widest mb-4 pb-4 border-b border-neutral-800 text-fuchsia-400">
            CROWN & ANCHOR
            {phase !== "betting" && totalBet > 0 && (
              <span className="ml-3 text-sm font-mono font-normal text-neutral-400">
                BET: <span className="text-yellow-400">{totalBet.toLocaleString()}</span>
              </span>
            )}
          </div>

          {/* Dice row */}
          <div className="flex justify-center gap-4 mb-4">
            {[0, 1, 2].map(i => (
              <Die key={i} symbol={dice[i]} blank={phase === "betting"} />
            ))}
          </div>

          {/* Message bar */}
          <div className="bg-neutral-950 p-2.5 rounded-lg border border-neutral-800 text-center min-h-10 flex items-center justify-center mb-4">
            <p className={`font-mono text-xs font-bold tracking-wide ${
              message.includes("+")       ? "text-green-400"   :
              message.includes("HOUSE")   ? "text-red-400"     :
              message.includes("NOT")     ? "text-red-400"     :
              message.includes("PUSH")    ? "text-neutral-400" :
              message.includes("ROLLING") ? "text-yellow-400"  : "text-white"
            }`}>{message}</p>
          </div>

          {/* ── Betting board — 3 × 2 ── */}
          <div className="grid grid-cols-3 gap-2">
            {SYMBOLS.map(sym => {
              const bet      = bets[sym.key];
              const hitCount = counts[sym.key] ?? 0;
              const hasBet   = bet > 0;
              const won      = phase === "result" && hasBet && hitCount > 0;
              const lost     = phase === "result" && hasBet && hitCount === 0;
              const cellNet  = hasBet ? (hitCount > 0 ? bet * hitCount : -bet) : null;

              return (
                <div
                  key={sym.key}
                  onClick={() => addBet(sym.key)}
                  className={`relative flex flex-col items-center justify-center gap-1 p-3 rounded-xl border-2 min-h-[100px] transition-all select-none
                    ${phase === "betting" ? "cursor-pointer hover:scale-105 active:scale-95" : "cursor-default"}
                    ${won   ? "bg-green-900/50 border-green-500 shadow-lg shadow-green-500/25 ring-2 ring-green-400/40" :
                      lost  ? "bg-red-950/60 border-red-800" :
                      hasBet ? "bg-fuchsia-900/40 border-fuchsia-500 shadow-lg shadow-fuchsia-500/20" :
                               "bg-neutral-900 border-neutral-700 hover:border-fuchsia-700"}`}
                >
                  {/* Hit-count badge */}
                  {phase === "result" && hitCount > 0 && (
                    <div className="absolute -top-2.5 -right-2.5 w-7 h-7 rounded-full bg-yellow-500 text-black text-xs font-black flex items-center justify-center shadow-lg z-10">
                      ×{hitCount}
                    </div>
                  )}

                  {/* Symbol */}
                  <span className={`text-4xl font-black leading-none ${sym.dieCls}`}>
                    {sym.label}
                  </span>
                  <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">
                    {sym.name}
                  </span>

                  {/* Bet row */}
                  {hasBet && (
                    <div className="flex items-center gap-1.5 mt-1">
                      {phase === "betting" && (
                        <button
                          onClick={e => { e.stopPropagation(); subtractBet(sym.key); }}
                          className="w-5 h-5 rounded bg-neutral-700 hover:bg-neutral-600 text-xs font-black flex items-center justify-center shrink-0"
                        >
                          −
                        </button>
                      )}
                      <span className="text-xs font-black text-yellow-400 font-mono">{bet}</span>
                      {phase === "betting" && (
                        <button
                          onClick={e => { e.stopPropagation(); addBet(sym.key); }}
                          className="w-5 h-5 rounded bg-neutral-700 hover:bg-neutral-600 text-xs font-black flex items-center justify-center shrink-0"
                        >
                          +
                        </button>
                      )}
                    </div>
                  )}

                  {/* Per-symbol result */}
                  {phase === "result" && cellNet !== null && (
                    <span className={`text-xs font-black font-mono ${cellNet > 0 ? "text-green-400" : "text-red-400"}`}>
                      {cellNet > 0 ? `+${cellNet}` : cellNet}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Chip selector ── */}
        {(phase === "betting" || phase === "result") && (
          <div className="w-full bg-black/40 rounded-xl border border-fuchsia-900 p-3">
            <p className="text-center text-xs text-fuchsia-400 font-mono mb-2 uppercase tracking-wider">
              Chip Value
            </p>
            <div className="flex gap-1.5">
              {CHIPS.map((c, i) => (
                <button
                  key={c}
                  onClick={() => setChip(c)}
                  className={`flex-1 py-2 rounded-lg font-black text-sm border-2 transition-all
                    ${chip === c
                      ? "bg-fuchsia-600 border-fuchsia-400 text-white scale-105"
                      : "bg-neutral-800 border-neutral-700 hover:border-neutral-500 text-neutral-300"}`}
                >
                  {c}
                  <span className="block text-[9px] font-normal text-neutral-500 normal-case">[{i + 1}]</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Action buttons ── */}
        {phase === "betting" && (
          <div className="flex gap-3 w-full">
            <button
              onClick={clearBets}
              disabled={totalBet === 0}
              className="px-5 py-5 rounded-2xl text-base font-black bg-neutral-800 hover:bg-neutral-700 border-b-4 border-neutral-900 active:border-b-0 transition-all active:scale-95 shadow-xl disabled:opacity-30"
            >
              CLEAR
            </button>
            <button
              onClick={roll}
              disabled={!canRoll}
              className="flex-1 py-5 rounded-2xl text-2xl font-black tracking-wider bg-gradient-to-r from-fuchsia-500 to-fuchsia-600 hover:from-fuchsia-400 hover:to-fuchsia-500 border-b-8 border-fuchsia-900 active:border-b-2 transition-all active:scale-95 shadow-2xl disabled:opacity-50"
            >
              {totalBet > 0
                ? `ROLL [SPACE] · ${totalBet.toLocaleString()} bet`
                : "ROLL [SPACE]"}
            </button>
          </div>
        )}

        {phase === "result" && (
          <div className="flex gap-3 w-full">
            <button
              onClick={clearBets}
              className="px-5 py-5 rounded-2xl text-base font-black bg-neutral-800 hover:bg-neutral-700 border-b-4 border-neutral-900 active:border-b-0 transition-all active:scale-95 shadow-xl"
            >
              CLEAR
            </button>
            <button
              onClick={newRound}
              className="flex-1 py-5 rounded-2xl text-2xl font-black tracking-wider bg-gradient-to-r from-fuchsia-500 to-fuchsia-600 hover:from-fuchsia-400 hover:to-fuchsia-500 border-b-8 border-fuchsia-900 active:border-b-2 transition-all active:scale-95 shadow-2xl"
            >
              ROLL AGAIN [SPACE]
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
