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

// Payouts based on player's card rank.
// "I WIN" requires dealer to draw a lower card; "DEALER WINS" requires a higher card.
function getPayouts(rank: number): {
  playerWins: number | null;
  tie: number;
  dealerWins: number | null;
} {
  const dealerLowerCount = (rank - 1) * 4;
  const dealerHigherCount = (13 - rank) * 4;
  return {
    playerWins: dealerLowerCount === 0 ? null : Math.max(1, Math.floor(45 / dealerLowerCount)),
    tie: 10,
    dealerWins: dealerHigherCount === 0 ? null : Math.max(1, Math.floor(45 / dealerHigherCount)),
  };
}

type Phase = "betting" | "choosing" | "result";
type Choice = "player" | "tie" | "dealer";

function CardSlot({
  card,
  faceDown = false,
  large = false,
  highlight,
}: {
  card?: PokerCard;
  faceDown?: boolean;
  large?: boolean;
  highlight?: "win" | "lose" | "tie";
}) {
  const sizeClass = large ? "w-28 h-40" : "w-20 h-28";
  const textSize = large ? "text-4xl" : "text-2xl";

  if (faceDown) {
    return (
      <div className={`${sizeClass} bg-orange-900 rounded-xl border-2 border-orange-700 flex items-center justify-center text-4xl select-none shadow-xl`}>
        🂠
      </div>
    );
  }
  if (!card) {
    return (
      <div className={`${sizeClass} rounded-xl border-4 border-dashed border-orange-800 flex items-center justify-center text-5xl text-orange-700 select-none`}>
        ?
      </div>
    );
  }
  const isRed = card.suit === "♥" || card.suit === "♦";
  const ringClass =
    highlight === "win" ? "ring-4 ring-green-400" :
    highlight === "lose" ? "ring-4 ring-red-500" :
    highlight === "tie" ? "ring-4 ring-yellow-400" :
    "";
  return (
    <div className={`${sizeClass} bg-white rounded-xl border-2 border-neutral-300 flex flex-col items-center justify-center gap-1 select-none shadow-xl ${ringClass}`}>
      <span className={`${textSize} font-black leading-none ${isRed ? "text-red-600" : "text-neutral-900"}`}>
        {card.value}
      </span>
      <span className={`${textSize} leading-none ${isRed ? "text-red-600" : "text-neutral-900"}`}>
        {card.suit}
      </span>
    </div>
  );
}

export default function HighCardPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [bet, setBet] = useState(10);
  const [phase, setPhase] = useState<Phase>("betting");
  const [playerCard, setPlayerCard] = useState<PokerCard | null>(null);
  const [dealerCard, setDealerCard] = useState<PokerCard | null>(null);
  const [outcome, setOutcome] = useState<"player" | "dealer" | "tie" | null>(null);
  const [message, setMessage] = useState("SET YOUR BET AND DRAW!");
  const [winEffect, setWinEffect] = useState({ show: false, big: false });

  useEffect(() => {
    const session = loadSession();
    if (!session) { router.replace("/"); return; }
    setUser(session);
  }, [router]);

  const draw = useCallback(() => {
    if (!user || user.balance < bet) {
      setMessage("NOT ENOUGH CREDITS!");
      return;
    }
    const deck = makeDeck();
    setPlayerCard(deck[0]);
    setDealerCard(deck[1]);
    setOutcome(null);
    playCardFlip();
    setPhase("choosing");
    setMessage("YOUR CARD IS SHOWING — BET ON WHO WINS!");
  }, [user, bet]);

  const guess = useCallback(async (c: Choice) => {
    if (phase !== "choosing" || !user || !playerCard || !dealerCard) return;

    const payouts = getPayouts(playerCard.numericValue);
    if (c === "player" && payouts.playerWins === null) return;
    if (c === "dealer" && payouts.dealerWins === null) return;

    const pRank = playerCard.numericValue;
    const dRank = dealerCard.numericValue;
    const actual: "player" | "dealer" | "tie" =
      pRank > dRank ? "player" : pRank < dRank ? "dealer" : "tie";

    const won = c === actual;
    const payout =
      c === "player" ? (payouts.playerWins ?? 0) :
      c === "dealer" ? (payouts.dealerWins ?? 0) :
      payouts.tie;

    const delta = won ? bet * payout : -bet;

    playCardFlip();
    setOutcome(actual);
    setPhase("result");

    if (won) {
      const big = payout >= 5;
      const label =
        actual === "player" ? "YOUR CARD WINS!" :
        actual === "dealer" ? "DEALER'S CARD WINS!" :
        "IT'S A TIE!";
      setMessage(`${label} +${(bet * payout).toLocaleString()} CREDITS`);
      if (big) {
        playBigWin();
        setWinEffect({ show: true, big: true });
      } else {
        playWin();
        setWinEffect({ show: true, big: false });
      }
    } else {
      playLose();
      const label =
        actual === "player" ? "YOUR CARD WAS HIGHER" :
        actual === "dealer" ? "DEALER'S CARD WAS HIGHER" :
        "IT WAS A TIE";
      setMessage(`${label} — Wrong bet! -${bet.toLocaleString()} CREDITS`);
    }

    const res = await fetch("/api/game-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.id,
        game: "highcard",
        result: won ? (c === "tie" ? "tie-win" : "win") : "lose",
        amount: delta,
      }),
    });
    if (res.ok) {
      const { user: updated } = await res.json();
      saveSession(updated);
      setUser(updated);
    }
  }, [phase, user, playerCard, dealerCard, bet]);

  const reset = useCallback(() => {
    setPlayerCard(null);
    setDealerCard(null);
    setOutcome(null);
    setPhase("betting");
    setMessage("SET YOUR BET AND DRAW!");
  }, []);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") { router.push("/lobby"); return; }
      if (phase === "betting" && e.code === "Space") { e.preventDefault(); draw(); }
      if (phase === "choosing") {
        if (e.key === "1") guess("player");
        if (e.key === "2") guess("tie");
        if (e.key === "3") guess("dealer");
      }
      if (phase === "result" && e.code === "Space") { e.preventDefault(); reset(); }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [phase, draw, guess, reset, router]);

  if (!user) return null;

  const payouts = playerCard ? getPayouts(playerCard.numericValue) : null;

  return (
    <div className="flex flex-col min-h-screen bg-orange-950 text-white">
      <BalanceBar user={user} onLogout={() => router.replace("/")} />
      <WinEffect
        show={winEffect.show}
        game="highcard"
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

        <div className="w-full max-w-2xl bg-black rounded-3xl p-6 border-8 border-orange-600 shadow-2xl">
          <div className="text-center text-lg font-black tracking-widest mb-4 pb-4 border-b border-neutral-800 text-orange-400">
            DRAW HI-LOW
            {phase !== "betting" && (
              <span className="ml-4 text-sm font-mono font-normal text-neutral-400">
                BET: <span className="text-yellow-400">{bet.toLocaleString()}</span>
              </span>
            )}
          </div>

          {/* Showdown layout */}
          <div className="flex items-center justify-center gap-8">
            {/* Player side */}
            <div className="flex flex-col items-center gap-3 flex-1">
              <span className={`text-xs font-mono tracking-widest uppercase ${
                outcome === "player" ? "text-green-400" :
                outcome === "dealer" ? "text-red-400" :
                outcome === "tie" ? "text-yellow-400" :
                "text-neutral-400"
              }`}>
                {outcome === "player" ? "★ YOU WIN ★" :
                 outcome === "dealer" ? "✗ YOU LOSE" :
                 outcome === "tie" ? "= TIE" :
                 "YOU"}
              </span>
              <CardSlot
                card={phase === "betting" ? undefined : playerCard ?? undefined}
                large
                highlight={
                  outcome === "player" ? "win" :
                  outcome === "dealer" ? "lose" :
                  outcome === "tie" ? "tie" :
                  undefined
                }
              />
            </div>

            {/* VS divider */}
            <div className="flex flex-col items-center gap-2 pb-8">
              <span className="text-2xl font-black text-neutral-600 select-none">VS</span>
            </div>

            {/* Dealer side */}
            <div className="flex flex-col items-center gap-3 flex-1">
              <span className={`text-xs font-mono tracking-widest uppercase ${
                outcome === "dealer" ? "text-green-400" :
                outcome === "player" ? "text-red-400" :
                outcome === "tie" ? "text-yellow-400" :
                "text-neutral-400"
              }`}>
                {outcome === "dealer" ? "★ DEALER WINS" :
                 outcome === "player" ? "✗ DEALER LOSES" :
                 outcome === "tie" ? "= TIE" :
                 "DEALER"}
              </span>
              <CardSlot
                card={phase === "result" ? dealerCard ?? undefined : undefined}
                faceDown={phase === "choosing"}
                large
                highlight={
                  outcome === "dealer" ? "win" :
                  outcome === "player" ? "lose" :
                  outcome === "tie" ? "tie" :
                  undefined
                }
              />
            </div>
          </div>

          <div className="mt-6 bg-neutral-950 p-3 rounded-lg border border-neutral-800 text-center min-h-12 flex items-center justify-center">
            <p className={`font-mono text-sm font-bold tracking-wide ${
              message.includes("+") ? "text-green-400" :
              message.includes("Wrong") || message.includes("NOT ENOUGH") ? "text-red-400" :
              message.includes("SHOWING") || message.includes("DRAW") ? "text-orange-300" :
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
              onClick={draw}
              disabled={user.balance < bet}
              className="px-16 py-8 rounded-2xl text-3xl font-black tracking-wider bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 border-b-8 border-orange-900 active:border-b-2 transition-all active:scale-95 shadow-2xl disabled:opacity-50"
            >
              DRAW [SPACE]
            </button>
          </>
        )}

        {/* Choosing phase */}
        {phase === "choosing" && payouts && (
          <div className="flex gap-3 flex-wrap justify-center">
            <button
              onClick={() => guess("player")}
              disabled={payouts.playerWins === null}
              className="px-8 py-6 rounded-2xl text-xl font-black tracking-wider bg-gradient-to-r from-green-500 to-green-600 hover:from-green-400 hover:to-green-500 border-b-8 border-green-900 active:border-b-2 transition-all active:scale-95 shadow-xl disabled:opacity-30 disabled:cursor-not-allowed flex flex-col items-center gap-1"
            >
              <span>🏆 I WIN [1]</span>
              {payouts.playerWins !== null
                ? <span className="text-sm font-mono font-normal">pays ×{payouts.playerWins}</span>
                : <span className="text-sm font-mono font-normal opacity-60">unavailable</span>
              }
            </button>
            <button
              onClick={() => guess("tie")}
              className="px-8 py-6 rounded-2xl text-xl font-black tracking-wider bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 border-b-8 border-yellow-900 active:border-b-2 transition-all active:scale-95 shadow-xl flex flex-col items-center gap-1"
            >
              <span>= TIE [2]</span>
              <span className="text-sm font-mono font-normal">pays ×{payouts.tie}</span>
            </button>
            <button
              onClick={() => guess("dealer")}
              disabled={payouts.dealerWins === null}
              className="px-8 py-6 rounded-2xl text-xl font-black tracking-wider bg-gradient-to-r from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 border-b-8 border-red-900 active:border-b-2 transition-all active:scale-95 shadow-xl disabled:opacity-30 disabled:cursor-not-allowed flex flex-col items-center gap-1"
            >
              <span>💀 DEALER [3]</span>
              {payouts.dealerWins !== null
                ? <span className="text-sm font-mono font-normal">pays ×{payouts.dealerWins}</span>
                : <span className="text-sm font-mono font-normal opacity-60">unavailable</span>
              }
            </button>
          </div>
        )}

        {/* Result phase */}
        {phase === "result" && (
          <button
            onClick={reset}
            className="px-16 py-8 rounded-2xl text-3xl font-black tracking-wider bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 border-b-8 border-orange-900 active:border-b-2 transition-all active:scale-95 shadow-2xl"
          >
            DRAW AGAIN [SPACE]
          </button>
        )}
      </div>
    </div>
  );
}
