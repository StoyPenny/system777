"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import BalanceBar from "@/components/BalanceBar";
import BetSelector from "@/components/BetSelector";
import WinEffect from "@/components/WinEffect";
import { loadSession, saveSession } from "@/lib/session";
import { playWin, playBigWin, playLose, playCardFlip } from "@/lib/sounds";
import { UserProfile, PokerCard } from "@/types";

const SUITS: PokerCard["suit"][] = ["♠", "♥", "♦", "♣"];
const VALUES = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const NUMERIC: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  "10": 10, J: 11, Q: 12, K: 13, A: 14,
};
const MIN_BET = 1;

function makeDeck(): PokerCard[] {
  const deck: PokerCard[] = [];
  for (const suit of SUITS)
    for (const value of VALUES)
      deck.push({ suit, value, numericValue: NUMERIC[value] });
  return deck.sort(() => Math.random() - 0.5);
}

function evaluateHand(hand: PokerCard[]): { label: string; multiplier: number } {
  const vals = hand.map((c) => c.numericValue).sort((a, b) => a - b);
  const suits = hand.map((c) => c.suit);
  const counts: Record<number, number> = {};
  vals.forEach((v) => { counts[v] = (counts[v] || 0) + 1; });
  const grouped = Object.values(counts).sort((a, b) => b - a);

  const flush = suits.every((s) => s === suits[0]);
  const straight = vals[4] - vals[0] === 4 && new Set(vals).size === 5;
  const royal = straight && vals[0] === 10;

  if (flush && royal)                              return { label: "ROYAL FLUSH",      multiplier: 800 };
  if (flush && straight)                           return { label: "STRAIGHT FLUSH",   multiplier: 50 };
  if (grouped[0] === 4)                            return { label: "FOUR OF A KIND",   multiplier: 25 };
  if (grouped[0] === 3 && grouped[1] === 2)        return { label: "FULL HOUSE",       multiplier: 9 };
  if (flush)                                       return { label: "FLUSH",            multiplier: 6 };
  if (straight)                                    return { label: "STRAIGHT",         multiplier: 4 };
  if (grouped[0] === 3)                            return { label: "THREE OF A KIND",  multiplier: 3 };
  if (grouped[0] === 2 && grouped[1] === 2)        return { label: "TWO PAIR",         multiplier: 2 };
  const pairs = Object.entries(counts).filter(([, c]) => c === 2);
  if (pairs.some(([v]) => Number(v) >= 11))        return { label: "JACKS OR BETTER",  multiplier: 1 };
  return { label: "NO WIN", multiplier: 0 };
}

type Phase = "idle" | "hold" | "result";

export default function VideoPokerPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [deck, setDeck] = useState<PokerCard[]>([]);
  const [hand, setHand] = useState<PokerCard[]>([]);
  const [held, setHeld] = useState([false, false, false, false, false]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("SET YOUR BET AND PRESS DEAL!");
  const [winAmount, setWinAmount] = useState(0);
  const [bet, setBet] = useState(10);
  const [winEffect, setWinEffect] = useState<{ show: boolean; big: boolean }>({ show: false, big: false });

  useEffect(() => {
    const session = loadSession();
    if (!session) { router.replace("/"); return; }
    setUser(session);
  }, [router]);

  const deal = useCallback(() => {
    if (!user || user.balance < bet || bet < MIN_BET) {
      setMessage(bet < MIN_BET ? `MINIMUM BET IS ${MIN_BET}!` : "NOT ENOUGH CREDITS!");
      return;
    }
    const newDeck = makeDeck();
    setHand(newDeck.slice(0, 5));
    setDeck(newDeck.slice(5));
    setHeld([false, false, false, false, false]);
    setPhase("hold");
    setMessage("TAP CARDS OR [1–5] TO HOLD, THEN DRAW");
    setWinAmount(0);
    [0, 80, 160, 240, 320].forEach((ms) => setTimeout(playCardFlip, ms));
  }, [user, bet]);

  const draw = useCallback(async () => {
    if (phase !== "hold" || !user) return;

    const remaining = [...deck];
    const finalHand = hand.map((card, i) => (held[i] ? card : remaining.shift()!));
    setHand(finalHand);
    setPhase("result");

    const replacedCount = held.filter((h) => !h).length;
    Array.from({ length: replacedCount }).forEach((_, i) =>
      setTimeout(playCardFlip, i * 80)
    );

    const { label, multiplier } = evaluateHand(finalHand);
    const won = multiplier * bet - bet;
    setWinAmount(won);
    setMessage(multiplier > 0 ? `${label}! +${won.toLocaleString()} CREDITS` : "NO WIN — DEAL AGAIN");

    const bigWin = multiplier >= 9;
    setTimeout(() => {
      if (multiplier > 0) {
        bigWin ? playBigWin() : playWin();
        setWinEffect({ show: true, big: bigWin });
      } else {
        playLose();
      }
    }, replacedCount * 80 + 100);

    const res = await fetch("/api/game-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.id, game: "poker", result: label.toLowerCase(),
        amount: multiplier > 0 ? won : -bet,
      }),
    });
    if (res.ok) {
      const { user: updated } = await res.json();
      saveSession(updated);
      setUser(updated);
    }
  }, [phase, user, deck, hand, held, bet]);

  const toggleHold = useCallback(
    (i: number) => { if (phase === "hold") setHeld((p) => p.map((v, idx) => idx === i ? !v : v)); },
    [phase]
  );

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        if (phase === "idle" || phase === "result") deal();
        else draw();
      }
      if (phase === "hold") {
        if (e.key === "1") toggleHold(0);
        if (e.key === "2") toggleHold(1);
        if (e.key === "3") toggleHold(2);
        if (e.key === "4") toggleHold(3);
        if (e.key === "5") toggleHold(4);
      }
      if (e.key === "Escape") router.push("/games/poker");
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [phase, deal, draw, toggleHold, router]);

  if (!user) return null;

  const cardColor = (card: PokerCard) =>
    card.suit === "♥" || card.suit === "♦" ? "text-red-500" : "text-neutral-900";

  return (
    <div className="flex flex-col min-h-screen bg-green-950 text-white">
      <BalanceBar user={user} onLogout={() => router.replace("/")} />
      <WinEffect show={winEffect.show} game="poker" big={winEffect.big}
        onDone={() => setWinEffect({ show: false, big: false })} />

      <div className="flex flex-col items-center justify-center flex-1 gap-5 p-6 pt-24">
        <button onClick={() => router.push("/games/poker")}
          className="self-start px-4 py-2 bg-black/40 hover:bg-black/60 border border-neutral-700 rounded-lg text-sm font-mono">
          ← [ESC] POKER MENU
        </button>

        <div className="w-full max-w-2xl bg-black rounded-3xl p-6 border-8 border-green-600 shadow-2xl">
          <div className="text-center text-lg font-black tracking-widest mb-4 pb-4 border-b border-neutral-800 text-green-400">
            VIDEO POKER — JACKS OR BETTER
          </div>

          <div className="flex gap-3 justify-center">
            {(hand.length === 0 ? Array(5).fill(null) : hand).map((card, i) => (
              card === null ? (
                <div key={i} className="flex-1 aspect-[2/3] bg-neutral-900 rounded-xl border-2 border-neutral-700 flex items-center justify-center text-4xl text-neutral-700">?</div>
              ) : (
                <button key={i} onClick={() => toggleHold(i)} disabled={phase !== "hold"}
                  className={`flex-1 aspect-[2/3] bg-white rounded-xl border-4 flex flex-col items-center justify-center gap-1 transition-all active:scale-95 disabled:cursor-default ${
                    held[i] ? "border-yellow-400 bg-yellow-50" : "border-neutral-300 hover:border-neutral-400"
                  }`}>
                  <span className={`text-3xl font-black leading-none ${cardColor(card)}`}>{card.value}</span>
                  <span className={`text-2xl leading-none ${cardColor(card)}`}>{card.suit}</span>
                  {held[i] && <span className="text-xs font-black text-yellow-600 mt-1 tracking-wider">HELD</span>}
                  {phase === "hold" && <span className="text-xs text-neutral-400 mt-0.5">[{i + 1}]</span>}
                </button>
              )
            ))}
          </div>

          <div className="mt-4 bg-neutral-950 p-3 rounded-lg border border-neutral-800 text-center min-h-12 flex items-center justify-center">
            <p className={`font-mono text-sm font-bold tracking-wide ${winAmount > 0 ? "text-green-400" : "text-white"}`}>
              {message}
            </p>
          </div>
        </div>

        <BetSelector balance={user.balance} bet={bet} onChange={setBet} disabled={phase === "hold"} />

        <button
          onClick={() => { if (phase === "idle" || phase === "result") deal(); else draw(); }}
          disabled={(phase === "idle" || phase === "result") && (user.balance < bet || bet < MIN_BET)}
          className="px-16 py-8 rounded-2xl text-3xl font-black tracking-wider bg-gradient-to-r from-green-600 to-emerald-700 hover:from-green-500 hover:to-emerald-600 border-b-8 border-green-900 active:border-b-2 transition-all active:scale-95 shadow-2xl disabled:opacity-50">
          {phase === "hold" ? "DRAW [SPACE]" : "DEAL [SPACE]"}
        </button>
      </div>
    </div>
  );
}
