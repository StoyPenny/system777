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

// Rank 1–13: 2 is lowest, Ace is highest
const HILO_RANK: Record<string, number> = {
  "2": 1, "3": 2, "4": 3, "5": 4, "6": 5, "7": 6, "8": 7,
  "9": 8, "10": 9, J: 10, Q: 11, K: 12, A: 13,
};

function makeDeck(): PokerCard[] {
  const deck: PokerCard[] = [];
  for (const suit of SUITS)
    for (const value of VALUES)
      deck.push({ suit, value, numericValue: HILO_RANK[value] });
  return deck.sort(() => Math.random() - 0.5);
}

// Payout multiplier for each bet type given current card rank (1–13).
// Uses ~90% RTP: fair payout = 51/eligibleCards, apply 0.9 factor ≈ 45/count.
function getPayouts(rank: number): { higher: number | null; lower: number | null; same: number } {
  const higherCount = (13 - rank) * 4;
  const lowerCount = (rank - 1) * 4;
  return {
    higher: higherCount === 0 ? null : Math.max(1, Math.floor(45 / higherCount)),
    lower: lowerCount === 0 ? null : Math.max(1, Math.floor(45 / lowerCount)),
    same: 10,
  };
}

type Phase = "betting" | "choosing" | "result";
type Choice = "higher" | "lower" | "same";

function Card({ card, large = false }: { card: PokerCard; large?: boolean }) {
  const isRed = card.suit === "♥" || card.suit === "♦";
  return (
    <div className={`${large ? "w-28 h-40" : "w-20 h-28"} bg-white rounded-xl border-2 border-neutral-300 flex flex-col items-center justify-center gap-1 select-none shadow-xl`}>
      <span className={`${large ? "text-4xl" : "text-2xl"} font-black leading-none ${isRed ? "text-red-600" : "text-neutral-900"}`}>
        {card.value}
      </span>
      <span className={`${large ? "text-4xl" : "text-2xl"} leading-none ${isRed ? "text-red-600" : "text-neutral-900"}`}>
        {card.suit}
      </span>
    </div>
  );
}

export default function HiLoPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [bet, setBet] = useState(10);
  const [phase, setPhase] = useState<Phase>("betting");
  const [deck, setDeck] = useState<PokerCard[]>([]);
  const [currentCard, setCurrentCard] = useState<PokerCard | null>(null);
  const [nextCard, setNextCard] = useState<PokerCard | null>(null);
  const [message, setMessage] = useState("SET YOUR BET AND DEAL!");
  const [winEffect, setWinEffect] = useState({ show: false, big: false });

  useEffect(() => {
    const session = loadSession();
    if (!session) { router.replace("/"); return; }
    setUser(session);
  }, [router]);

  const deal = useCallback(() => {
    if (!user || user.balance < bet) {
      setMessage("NOT ENOUGH CREDITS!");
      return;
    }
    const freshDeck = makeDeck();
    const card = freshDeck[0];
    setDeck(freshDeck.slice(1));
    setCurrentCard(card);
    setNextCard(null);
    playCardFlip();
    setPhase("choosing");
    setMessage("WILL THE NEXT CARD BE HIGHER, LOWER, OR THE SAME?");
  }, [user, bet]);

  const guess = useCallback(async (c: Choice) => {
    if (phase !== "choosing" || !user || !currentCard || deck.length === 0) return;

    const drawn = deck[0];
    setNextCard(drawn);
    playCardFlip();

    const payouts = getPayouts(currentCard.numericValue);
    let won = false;
    let payout = 0;

    if (c === "higher" && payouts.higher !== null) {
      won = drawn.numericValue > currentCard.numericValue;
      payout = payouts.higher;
    } else if (c === "lower" && payouts.lower !== null) {
      won = drawn.numericValue < currentCard.numericValue;
      payout = payouts.lower;
    } else if (c === "same") {
      won = drawn.numericValue === currentCard.numericValue;
      payout = payouts.same;
    }

    const actualResult =
      drawn.numericValue > currentCard.numericValue ? "HIGHER" :
      drawn.numericValue < currentCard.numericValue ? "LOWER" : "SAME";

    const delta = won ? bet * payout : -bet;
    const resultStr = won ? (c === "same" ? "same-win" : "win") : "lose";

    if (won) {
      const big = payout >= 5;
      setMessage(`${actualResult}! YOU WIN +${(bet * payout).toLocaleString()} CREDITS`);
      if (big) {
        playBigWin();
        setWinEffect({ show: true, big: true });
      } else {
        playWin();
        setWinEffect({ show: true, big: false });
      }
    } else {
      setMessage(`${actualResult} — Wrong guess! -${bet.toLocaleString()} CREDITS`);
      playLose();
    }

    setPhase("result");

    const res = await fetch("/api/game-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, game: "hilo", result: resultStr, amount: delta }),
    });
    if (res.ok) {
      const { user: updated } = await res.json();
      saveSession(updated);
      setUser(updated);
    }
  }, [phase, user, currentCard, deck, bet]);

  const reset = useCallback(() => {
    setCurrentCard(null);
    setNextCard(null);
    setDeck([]);
    setPhase("betting");
    setMessage("SET YOUR BET AND DEAL!");
  }, []);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") { router.push("/lobby"); return; }
      if (phase === "betting" && e.code === "Space") { e.preventDefault(); deal(); }
      if (phase === "choosing") {
        if (e.key === "1") guess("higher");
        if (e.key === "2") guess("lower");
        if (e.key === "3") guess("same");
      }
      if (phase === "result" && e.code === "Space") { e.preventDefault(); reset(); }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [phase, deal, guess, reset, router]);

  if (!user) return null;

  const payouts = currentCard ? getPayouts(currentCard.numericValue) : null;
  const actualResult =
    currentCard && nextCard
      ? nextCard.numericValue > currentCard.numericValue ? "higher"
      : nextCard.numericValue < currentCard.numericValue ? "lower"
      : "same"
      : null;

  return (
    <div className="flex flex-col min-h-screen bg-amber-950 text-white">
      <BalanceBar user={user} onLogout={() => router.replace("/")} />
      <WinEffect
        show={winEffect.show}
        game="hilo"
        big={winEffect.big}
        onDone={() => setWinEffect({ show: false, big: false })}
      />

      <div className="flex flex-col items-center justify-center flex-1 gap-5 p-6 pt-24">
        <button
          onClick={() => router.push("/lobby")}
          className="self-start px-4 py-2 bg-black/40 hover:bg-black/60 border border-neutral-700 rounded-lg text-sm font-mono"
        >
          ← [ESC] LOBBY
        </button>

        <div className="w-full max-w-2xl bg-black rounded-3xl p-6 border-8 border-amber-600 shadow-2xl">
          <div className="text-center text-lg font-black tracking-widest mb-4 pb-4 border-b border-neutral-800 text-amber-400">
            HI-LO
            {phase !== "betting" && (
              <span className="ml-4 text-sm font-mono font-normal text-neutral-400">
                BET: <span className="text-yellow-400">{bet.toLocaleString()}</span>
              </span>
            )}
          </div>

          {/* Card area */}
          <div className="flex items-center justify-center gap-8 min-h-44">
            {phase === "betting" && (
              <div className="w-28 h-40 rounded-xl border-4 border-dashed border-amber-800 flex items-center justify-center text-amber-700 text-5xl select-none">
                ?
              </div>
            )}

            {phase === "choosing" && currentCard && (
              <>
                <Card card={currentCard} large />
                <div className="text-5xl text-neutral-700 select-none">?</div>
              </>
            )}

            {phase === "result" && currentCard && nextCard && (
              <>
                <Card card={currentCard} large />
                <div className={`text-5xl font-black select-none ${
                  actualResult === "higher" ? "text-green-400" :
                  actualResult === "lower" ? "text-red-400" :
                  "text-yellow-400"
                }`}>
                  {actualResult === "higher" ? "▲" : actualResult === "lower" ? "▼" : "="}
                </div>
                <Card card={nextCard} large />
              </>
            )}
          </div>

          <div className="mt-6 bg-neutral-950 p-3 rounded-lg border border-neutral-800 text-center min-h-12 flex items-center justify-center">
            <p className={`font-mono text-sm font-bold tracking-wide ${
              message.includes("YOU WIN") ? "text-green-400" :
              message.includes("Wrong") || message.includes("NOT ENOUGH") ? "text-red-400" :
              message.includes("WILL") ? "text-amber-300" :
              "text-white"
            }`}>
              {message}
            </p>
          </div>
        </div>

        {/* Betting phase */}
        {phase === "betting" && (
          <>
            <BetSelector balance={user.balance} bet={bet} onChange={setBet} disabled={false} />
            <button
              onClick={deal}
              disabled={user.balance < bet}
              className="px-16 py-8 rounded-2xl text-3xl font-black tracking-wider bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 border-b-8 border-amber-900 active:border-b-2 transition-all active:scale-95 shadow-2xl disabled:opacity-50"
            >
              DEAL [SPACE]
            </button>
          </>
        )}

        {/* Choosing phase */}
        {phase === "choosing" && payouts && (
          <div className="flex gap-3 flex-wrap justify-center">
            <button
              onClick={() => guess("higher")}
              disabled={payouts.higher === null}
              className="px-8 py-6 rounded-2xl text-xl font-black tracking-wider bg-gradient-to-r from-green-500 to-green-600 hover:from-green-400 hover:to-green-500 border-b-8 border-green-900 active:border-b-2 transition-all active:scale-95 shadow-xl disabled:opacity-30 disabled:cursor-not-allowed flex flex-col items-center gap-1"
            >
              <span>▲ HIGHER [1]</span>
              {payouts.higher !== null
                ? <span className="text-sm font-mono font-normal">pays ×{payouts.higher}</span>
                : <span className="text-sm font-mono font-normal opacity-60">unavailable</span>
              }
            </button>
            <button
              onClick={() => guess("lower")}
              disabled={payouts.lower === null}
              className="px-8 py-6 rounded-2xl text-xl font-black tracking-wider bg-gradient-to-r from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 border-b-8 border-red-900 active:border-b-2 transition-all active:scale-95 shadow-xl disabled:opacity-30 disabled:cursor-not-allowed flex flex-col items-center gap-1"
            >
              <span>▼ LOWER [2]</span>
              {payouts.lower !== null
                ? <span className="text-sm font-mono font-normal">pays ×{payouts.lower}</span>
                : <span className="text-sm font-mono font-normal opacity-60">unavailable</span>
              }
            </button>
            <button
              onClick={() => guess("same")}
              className="px-8 py-6 rounded-2xl text-xl font-black tracking-wider bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 border-b-8 border-amber-900 active:border-b-2 transition-all active:scale-95 shadow-xl flex flex-col items-center gap-1"
            >
              <span>= SAME [3]</span>
              <span className="text-sm font-mono font-normal">pays ×{payouts.same}</span>
            </button>
          </div>
        )}

        {/* Result phase */}
        {phase === "result" && (
          <button
            onClick={reset}
            className="px-16 py-8 rounded-2xl text-3xl font-black tracking-wider bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 border-b-8 border-amber-900 active:border-b-2 transition-all active:scale-95 shadow-2xl"
          >
            DEAL AGAIN [SPACE]
          </button>
        )}
      </div>
    </div>
  );
}
