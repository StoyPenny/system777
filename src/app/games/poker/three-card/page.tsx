"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import BalanceBar from "@/components/BalanceBar";
import BetSelector from "@/components/BetSelector";
import WinEffect from "@/components/WinEffect";
import { loadSession, saveSession } from "@/lib/session";
import { playWin, playBigWin, playLose, playCardFlip } from "@/lib/sounds";
import { UserProfile, PokerCard } from "@/types";

// ── Deck helpers ─────────────────────────────────────

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

// ── 3-Card hand evaluation ────────────────────────────

interface HandResult {
  rank: number;       // higher = better
  label: string;
  /** Bonus multiplier applied to the ante (above 1:1 even-money win) */
  anteBonus: number;
  sortedVals: number[]; // descending, for tiebreaking
}

function evaluate3Card(cards: PokerCard[]): HandResult {
  const vals = cards.map((c) => c.numericValue).sort((a, b) => a - b);
  const [a, b, c] = vals;
  const suits = cards.map((c) => c.suit);
  const flush = suits[0] === suits[1] && suits[1] === suits[2];
  // Straight: three consecutive, or A-2-3 (wheel)
  const straightNormal = c - a === 2 && b - a === 1;
  const straightWheel  = a === 2 && b === 3 && c === 14;
  const straight = straightNormal || straightWheel;
  const threeOfAKind = a === b && b === c;
  const pair = (a === b || b === c) && !threeOfAKind;
  // Mini Royal: A-K-Q suited
  const miniRoyal = flush && a === 12 && b === 13 && c === 14;

  // Tiebreaker: descending card values (wheel straight treated as 3-high)
  const sortedVals = straightWheel
    ? [3, 2, 1]
    : [...vals].reverse();

  if (miniRoyal)         return { rank: 7, label: "MINI ROYAL",      anteBonus: 5, sortedVals };
  if (flush && straight) return { rank: 6, label: "STRAIGHT FLUSH",  anteBonus: 4, sortedVals };
  if (threeOfAKind)      return { rank: 5, label: "THREE OF A KIND", anteBonus: 3, sortedVals };
  if (straight)          return { rank: 4, label: "STRAIGHT",        anteBonus: 1, sortedVals };
  if (flush)             return { rank: 3, label: "FLUSH",           anteBonus: 1, sortedVals };
  if (pair)              return { rank: 2, label: "PAIR",            anteBonus: 1, sortedVals };
  return                  { rank: 1, label: "HIGH CARD",             anteBonus: 0, sortedVals };
}

function compareHands(r1: HandResult, r2: HandResult): number {
  if (r1.rank !== r2.rank) return r1.rank - r2.rank;
  for (let i = 0; i < r1.sortedVals.length; i++) {
    if (r1.sortedVals[i] !== r2.sortedVals[i]) return r1.sortedVals[i] - r2.sortedVals[i];
  }
  return 0;
}

/** Dealer qualifies with Queen-high or better */
function dealerQualifies(cards: PokerCard[]): boolean {
  const result = evaluate3Card(cards);
  if (result.rank >= 2) return true; // pair or better always qualifies
  return Math.max(...cards.map((c) => c.numericValue)) >= 12; // Q, K, or A
}

// ── Card component ────────────────────────────────────

function Card({ card, faceDown = false }: { card: PokerCard; faceDown?: boolean }) {
  if (faceDown) {
    return (
      <div className="w-20 h-28 bg-teal-900 rounded-xl border-2 border-teal-700 flex items-center justify-center text-3xl select-none shadow-lg">
        🂠
      </div>
    );
  }
  const red = card.suit === "♥" || card.suit === "♦";
  return (
    <div className="w-20 h-28 bg-white rounded-xl border-2 border-neutral-300 flex flex-col items-center justify-center gap-0.5 select-none shadow-lg">
      <span className={`text-2xl font-black leading-none ${red ? "text-red-600" : "text-neutral-900"}`}>
        {card.value}
      </span>
      <span className={`text-3xl leading-none ${red ? "text-red-600" : "text-neutral-900"}`}>
        {card.suit}
      </span>
    </div>
  );
}

// ── Game component ────────────────────────────────────

type Phase = "betting" | "decision" | "reveal" | "result";

export default function ThreeCardPokerPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [ante, setAnte] = useState(10);
  const [phase, setPhase] = useState<Phase>("betting");
  const [playerCards, setPlayerCards] = useState<PokerCard[]>([]);
  const [dealerCards, setDealerCards] = useState<PokerCard[]>([]);
  const [message, setMessage] = useState("SET YOUR ANTE AND DEAL!");
  const [subMessage, setSubMessage] = useState<string | null>(null);
  const [winEffect, setWinEffect] = useState<{ show: boolean; big: boolean }>({ show: false, big: false });

  useEffect(() => {
    const session = loadSession();
    if (!session) { router.replace("/"); return; }
    setUser(session);
  }, [router]);

  const dealCards = useCallback(() => {
    if (!user || user.balance < ante || ante < MIN_BET) {
      setMessage(!user || user.balance < ante ? "NOT ENOUGH CREDITS!" : `MINIMUM BET IS ${MIN_BET}!`);
      return;
    }
    const deck = makeDeck();
    setPlayerCards(deck.slice(0, 3));
    setDealerCards(deck.slice(3, 6));
    setPhase("decision");
    setMessage("FOLD [1]  or  PLAY [2]");
    setSubMessage("Play costs an additional ante");
    // Deal 6 cards alternating
    [0, 80, 160, 240, 320, 400].forEach((ms) => setTimeout(playCardFlip, ms));
  }, [user, ante]);

  const fold = useCallback(() => {
    if (phase !== "decision" || !user) return;
    setPhase("result");
    setMessage(`FOLDED — -${ante.toLocaleString()} CREDITS`);
    setSubMessage(null);
    playLose();
    fetch("/api/game-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, game: "three-card-poker", result: "fold", amount: -ante }),
    }).then((r) => r.json()).then(({ user: u }) => { saveSession(u); setUser(u); });
  }, [phase, user, ante]);

  const play = useCallback(async () => {
    if (phase !== "decision" || !user) return;
    if (user.balance < ante * 2) { setMessage("NOT ENOUGH CREDITS TO PLAY!"); return; }

    setPhase("reveal");
    setSubMessage(null);
    // Reveal dealer cards
    [0, 120, 240].forEach((ms) => setTimeout(playCardFlip, ms));
    await new Promise((r) => setTimeout(r, 400));

    const playerResult = evaluate3Card(playerCards);
    const dealerResult = evaluate3Card(dealerCards);
    const qualifies     = dealerQualifies(dealerCards);
    const comparison    = compareHands(playerResult, dealerResult);

    let delta = 0;
    let result = "";
    let msg = "";
    let big = false;

    const anteBonus = playerResult.anteBonus > 1
      ? ante * (playerResult.anteBonus - 1)
      : 0;

    if (!qualifies) {
      // Dealer doesn't qualify: player wins ante 1:1, play returned
      delta = ante + anteBonus;
      result = "dealer-no-qualify";
      msg = `DEALER DOESN'T QUALIFY! +${ante.toLocaleString()} CREDITS`;
      if (anteBonus > 0) msg += ` + ${playerResult.label} BONUS +${anteBonus.toLocaleString()}`;
      playWin();
      setWinEffect({ show: true, big: false });
    } else if (comparison > 0) {
      // Player wins both bets
      delta = ante * 2 + anteBonus;
      result = "win";
      big = playerResult.anteBonus >= 4;
      msg = `${playerResult.label} BEATS ${dealerResult.label}! +${delta.toLocaleString()} CREDITS`;
      big ? playBigWin() : playWin();
      setWinEffect({ show: true, big });
    } else if (comparison === 0) {
      // Push
      delta = 0;
      result = "push";
      msg = `PUSH — ${playerResult.label} vs ${dealerResult.label}`;
    } else {
      // Dealer wins
      delta = -(ante * 2);
      result = "lose";
      msg = `${dealerResult.label} BEATS ${playerResult.label} — -${(ante * 2).toLocaleString()} CREDITS`;
      playLose();
    }

    setPhase("result");
    setMessage(msg);

    const res = await fetch("/api/game-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, game: "three-card-poker", result, amount: delta }),
    });
    if (res.ok) {
      const { user: updated } = await res.json();
      saveSession(updated);
      setUser(updated);
    }
  }, [phase, user, ante, playerCards, dealerCards]);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (phase === "betting" || phase === "result") {
        if (e.code === "Space") { e.preventDefault(); dealCards(); }
      }
      if (phase === "decision") {
        if (e.key === "1") fold();
        if (e.key === "2") play();
      }
      if (e.key === "Escape") router.push("/games/poker");
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [phase, dealCards, fold, play, router]);

  if (!user) return null;

  const showDealerFaceDown = phase === "decision";
  const totalAtRisk = phase === "decision" ? ante * 2 : 0;

  return (
    <div className="flex flex-col min-h-screen bg-teal-950 text-white">
      <BalanceBar user={user} onLogout={() => router.replace("/")} />
      <WinEffect show={winEffect.show} game="poker" big={winEffect.big}
        onDone={() => setWinEffect({ show: false, big: false })} />

      <div className="flex flex-col items-center justify-center flex-1 gap-5 p-6 pt-24">
        <button onClick={() => router.push("/games/poker")}
          className="self-start px-4 py-2 bg-black/40 hover:bg-black/60 border border-neutral-700 rounded-lg text-sm font-mono">
          ← [ESC] POKER MENU
        </button>

        <div className="w-full max-w-xl bg-black rounded-3xl p-6 border-8 border-teal-600 shadow-2xl">
          <div className="text-center text-lg font-black tracking-widest pb-3 border-b border-neutral-800 text-teal-400 mb-2">
            3-CARD POKER
            {phase !== "betting" && (
              <span className="ml-3 text-sm font-mono font-normal text-neutral-400">
                ANTE: <span className="text-yellow-400">{ante.toLocaleString()}</span>
                {totalAtRisk > 0 && <span className="text-orange-400 ml-2">+ {ante.toLocaleString()} PLAY</span>}
              </span>
            )}
          </div>

          {/* Payout reference */}
          <div className="flex gap-2 flex-wrap justify-center mb-4 text-xs font-mono text-neutral-600">
            {[["Mini Royal","5×"],["Str. Flush","4×"],["Three of a Kind","3×"],["Str/Flush/Pair","1×"]].map(([h, p]) => (
              <span key={h} className="border border-neutral-800 px-2 py-0.5 rounded">
                {h} <span className="text-teal-600">{p}</span>
              </span>
            ))}
          </div>

          {/* Hands */}
          <div className="flex flex-col gap-6">
            <div className="flex flex-col items-center gap-2">
              <span className="text-xs text-neutral-500 uppercase tracking-wider">Dealer</span>
              <div className="flex gap-3">
                {dealerCards.length === 0
                  ? [0, 1, 2].map((i) => (
                      <div key={i} className="w-20 h-28 rounded-xl border-2 border-dashed border-neutral-800 opacity-30" />
                    ))
                  : dealerCards.map((card, i) => (
                      <Card key={i} card={card} faceDown={showDealerFaceDown} />
                    ))}
              </div>
            </div>

            <div className="border-t border-neutral-800" />

            <div className="flex flex-col items-center gap-2">
              <span className="text-xs text-neutral-500 uppercase tracking-wider">You</span>
              <div className="flex gap-3">
                {playerCards.length === 0
                  ? [0, 1, 2].map((i) => (
                      <div key={i} className="w-20 h-28 rounded-xl border-2 border-dashed border-neutral-800 opacity-30" />
                    ))
                  : playerCards.map((card, i) => <Card key={i} card={card} />)}
              </div>
            </div>
          </div>

          {/* Status */}
          <div className="mt-5 bg-neutral-950 p-3 rounded-lg border border-neutral-800 text-center min-h-12 flex flex-col items-center justify-center gap-1">
            <p className={`font-mono text-sm font-bold tracking-wide ${
              message.includes("+") ? "text-green-400" :
              message.includes("-") ? "text-red-400" : "text-white"
            }`}>
              {message}
            </p>
            {subMessage && (
              <p className="text-neutral-600 text-xs font-mono">{subMessage}</p>
            )}
          </div>
        </div>

        {/* Action area */}
        {(phase === "betting" || phase === "result") ? (
          <>
            <BetSelector balance={user.balance} bet={ante} onChange={setAnte} disabled={false} />
            <button onClick={dealCards}
              disabled={user.balance < ante || ante < MIN_BET}
              className="px-16 py-8 rounded-2xl text-3xl font-black tracking-wider bg-gradient-to-r from-teal-600 to-cyan-700 hover:from-teal-500 hover:to-cyan-600 border-b-8 border-teal-900 active:border-b-2 transition-all active:scale-95 shadow-2xl disabled:opacity-50">
              DEAL [SPACE]
            </button>
          </>
        ) : phase === "decision" ? (
          <div className="flex gap-4">
            <button onClick={fold}
              className="px-12 py-7 rounded-2xl text-2xl font-black bg-red-700 hover:bg-red-600 border-b-8 border-red-900 active:border-b-2 transition-all active:scale-95 shadow-xl">
              FOLD [1]
            </button>
            <button onClick={play}
              disabled={user.balance < ante * 2}
              className="px-12 py-7 rounded-2xl text-2xl font-black bg-teal-600 hover:bg-teal-500 border-b-8 border-teal-900 active:border-b-2 transition-all active:scale-95 shadow-xl disabled:opacity-50">
              PLAY [2]
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
