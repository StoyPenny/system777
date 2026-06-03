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
const RANK: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8,
  "9": 9, "10": 10, J: 11, Q: 12, K: 13, A: 14,
};

function makeDeck(): PokerCard[] {
  const deck: PokerCard[] = [];
  for (const suit of SUITS)
    for (const value of VALUES)
      deck.push({ suit, value, numericValue: RANK[value] });
  return deck.sort(() => Math.random() - 0.5);
}

// Returns spread (how many ranks fit between the two cards).
// -1 = pair (same rank), 0 = consecutive, 1+ = valid betting range.
function calcSpread(a: number, b: number): number {
  if (a === b) return -1;
  const [low, high] = a < b ? [a, b] : [b, a];
  return high - low - 1;
}

function spreadPayout(spread: number): number {
  if (spread === 1) return 5;
  if (spread === 2) return 4;
  if (spread === 3) return 2;
  return 1;
}

type Phase = "betting" | "spread" | "result";

function CardSlot({ card, highlight }: { card?: PokerCard; highlight?: "in" | "out" | "pair" }) {
  if (!card) {
    return (
      <div className="w-20 h-28 rounded-lg border-4 border-dashed border-teal-800 flex items-center justify-center text-4xl text-teal-800 select-none">
        ?
      </div>
    );
  }
  const isRed = card.suit === "♥" || card.suit === "♦";
  const ring =
    highlight === "in" ? "ring-4 ring-green-400" :
    highlight === "out" ? "ring-4 ring-red-500" :
    highlight === "pair" ? "ring-4 ring-yellow-400" :
    "";
  return (
    <div className={`w-20 h-28 bg-white rounded-lg border-2 border-neutral-300 flex flex-col items-center justify-center gap-0.5 select-none shadow-lg ${ring}`}>
      <span className={`text-2xl font-black leading-none ${isRed ? "text-red-600" : "text-neutral-900"}`}>{card.value}</span>
      <span className={`text-2xl leading-none ${isRed ? "text-red-600" : "text-neutral-900"}`}>{card.suit}</span>
    </div>
  );
}

export default function RedDogPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [bet, setBet] = useState(10);
  const [phase, setPhase] = useState<Phase>("betting");
  const [card1, setCard1] = useState<PokerCard | null>(null);
  const [card2, setCard2] = useState<PokerCard | null>(null);
  const [card3, setCard3] = useState<PokerCard | null>(null);
  const [spread, setSpread] = useState<number | null>(null);
  const [raised, setRaised] = useState(false);
  const [deckRef, setDeckRef] = useState<PokerCard[]>([]);
  const [message, setMessage] = useState("SET YOUR BET AND DEAL!");
  const [winEffect, setWinEffect] = useState({ show: false, big: false });

  useEffect(() => {
    const session = loadSession();
    if (!session) { router.replace("/"); return; }
    setUser(session);
  }, [router]);

  const callApi = useCallback(async (currentUser: UserProfile, result: string, amount: number) => {
    const res = await fetch("/api/game-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: currentUser.id, game: "reddog", result, amount }),
    });
    if (res.ok) {
      const { user: updated } = await res.json();
      saveSession(updated);
      setUser(updated);
    }
  }, []);

  const deal = useCallback(async () => {
    if (!user || user.balance < bet) {
      setMessage("NOT ENOUGH CREDITS!");
      return;
    }
    const deck = makeDeck();
    const c1 = deck[0];
    const c2 = deck[1];
    setCard1(c1);
    setCard2(c2);
    setCard3(null);
    setRaised(false);
    setDeckRef(deck.slice(2));
    playCardFlip();
    setTimeout(() => playCardFlip(), 200);

    const s = calcSpread(c1.numericValue, c2.numericValue);
    setSpread(s);

    if (s === -1) {
      // Pair: immediately deal third card
      const c3 = deck[2];
      setCard3(c3);
      setTimeout(() => playCardFlip(), 400);

      if (c3.numericValue === c1.numericValue) {
        const delta = bet * 11;
        setMessage(`THREE OF A KIND! +${delta.toLocaleString()} CREDITS`);
        playBigWin();
        setWinEffect({ show: true, big: true });
        setPhase("result");
        await callApi(user, "pair-bonus", delta);
      } else {
        setMessage("PAIR — PUSH! BET RETURNED");
        setPhase("result");
        await callApi(user, "pair-push", 0);
      }
    } else if (s === 0) {
      // Consecutive: automatic push
      setMessage("CONSECUTIVE CARDS — PUSH! BET RETURNED");
      setPhase("result");
      await callApi(user, "consecutive-push", 0);
    } else {
      const payout = spreadPayout(s);
      setPhase("spread");
      setMessage(`SPREAD: ${s} — PAYS ${payout}:1 — RAISE TO DOUBLE YOUR BET`);
    }
  }, [user, bet, callApi]);

  const dealThird = useCallback(async (doRaise: boolean) => {
    if (phase !== "spread" || !user || !card1 || !card2 || spread === null || spread < 1) return;

    const effectiveBet = doRaise ? bet * 2 : bet;
    if (doRaise && user.balance < effectiveBet) {
      setMessage("NOT ENOUGH CREDITS TO RAISE!");
      return;
    }

    const c3 = deckRef[0];
    setCard3(c3);
    setRaised(doRaise);
    playCardFlip();

    const [low, high] = card1.numericValue < card2.numericValue
      ? [card1.numericValue, card2.numericValue]
      : [card2.numericValue, card1.numericValue];
    const inBetween = c3.numericValue > low && c3.numericValue < high;

    const payout = spreadPayout(spread);
    const delta = inBetween ? effectiveBet * payout : -effectiveBet;

    setPhase("result");

    if (inBetween) {
      const big = payout >= 4;
      setMessage(`IN BETWEEN! +${(effectiveBet * payout).toLocaleString()} CREDITS`);
      if (big) { playBigWin(); setWinEffect({ show: true, big: true }); }
      else { playWin(); setWinEffect({ show: true, big: false }); }
    } else {
      playLose();
      setMessage(`OUT OF RANGE — -${effectiveBet.toLocaleString()} CREDITS`);
    }

    await callApi(user, inBetween ? "win" : "lose", delta);
  }, [phase, user, card1, card2, spread, deckRef, bet, callApi]);

  const reset = useCallback(() => {
    setCard1(null);
    setCard2(null);
    setCard3(null);
    setSpread(null);
    setRaised(false);
    setDeckRef([]);
    setPhase("betting");
    setMessage("SET YOUR BET AND DEAL!");
  }, []);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") { router.push("/lobby"); return; }
      if (phase === "betting" && e.code === "Space") { e.preventDefault(); deal(); }
      if (phase === "spread") {
        if (e.key === "1") dealThird(true);
        if (e.code === "Space") { e.preventDefault(); dealThird(false); }
      }
      if (phase === "result" && e.code === "Space") { e.preventDefault(); reset(); }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [phase, deal, dealThird, reset, router]);

  if (!user) return null;

  // Sort initial cards for display (low left, high right)
  const [lowCard, highCard] =
    card1 && card2
      ? card1.numericValue <= card2.numericValue
        ? [card1, card2]
        : [card2, card1]
      : [null, null];

  const isPair = spread === -1;
  const isConsecutive = spread === 0;

  // Highlight the third card based on whether it's in range
  const thirdHighlight: "in" | "out" | "pair" | undefined =
    card3 && card1 && card2
      ? isPair
        ? card3.numericValue === card1.numericValue ? "pair" : undefined
        : card3.numericValue > (lowCard?.numericValue ?? 0) && card3.numericValue < (highCard?.numericValue ?? 0)
          ? "in" : "out"
      : undefined;

  const currentPayout = spread !== null && spread >= 1 ? spreadPayout(spread) : null;

  return (
    <div className="flex flex-col min-h-screen bg-teal-950 text-white">
      <BalanceBar user={user} onLogout={() => router.replace("/")} />
      <WinEffect
        show={winEffect.show}
        game="reddog"
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

        <div className="w-full max-w-2xl bg-black rounded-3xl p-6 border-8 border-teal-600 shadow-2xl">
          <div className="text-center text-lg font-black tracking-widest mb-4 pb-4 border-b border-neutral-800 text-teal-400">
            RED DOG
            {phase !== "betting" && (
              <span className="ml-4 text-sm font-mono font-normal text-neutral-400">
                BET: <span className="text-yellow-400">{bet.toLocaleString()}</span>
                {raised && <span className="text-orange-400 ml-1">(RAISED: {(bet * 2).toLocaleString()})</span>}
              </span>
            )}
          </div>

          {/* Card area */}
          <div className="flex flex-col items-center gap-4 min-h-36">
            {phase === "betting" && (
              <div className="flex gap-6 items-center">
                <CardSlot />
                <div className="text-neutral-700 text-3xl select-none">↔</div>
                <CardSlot />
              </div>
            )}

            {/* Spread / initial pair show */}
            {(phase === "spread" || (phase === "result" && !card3)) && card1 && card2 && (
              <div className="flex flex-col items-center gap-3">
                {spread !== null && spread >= 1 && (
                  <div className="flex items-center gap-2 text-xs font-mono text-teal-400 tracking-widest">
                    <span className="bg-teal-900 px-2 py-1 rounded">SPREAD: {spread}</span>
                    <span className="bg-neutral-800 px-2 py-1 rounded">PAYS {currentPayout}:1</span>
                  </div>
                )}
                <div className="flex gap-4 items-center">
                  <CardSlot card={lowCard ?? undefined} />
                  <div className="flex flex-col items-center gap-1 text-neutral-600">
                    <span className="text-xl select-none">↔</span>
                    {!isConsecutive && !isPair && (
                      <span className="text-xs font-mono">{spread} gap</span>
                    )}
                  </div>
                  <CardSlot card={highCard ?? undefined} />
                </div>
              </div>
            )}

            {/* Result with third card */}
            {phase === "result" && card3 && (
              <div className="flex flex-col items-center gap-3">
                {!isPair ? (
                  <div className="flex gap-4 items-center">
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-xs font-mono text-neutral-500">LOW</span>
                      <CardSlot card={lowCard ?? undefined} />
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-xs font-mono text-neutral-500">DRAWN</span>
                      <CardSlot card={card3} highlight={thirdHighlight} />
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-xs font-mono text-neutral-500">HIGH</span>
                      <CardSlot card={highCard ?? undefined} />
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-4 items-center">
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-xs font-mono text-neutral-500">PAIR</span>
                      <div className="flex gap-2">
                        <CardSlot card={card1 ?? undefined} />
                        <CardSlot card={card2 ?? undefined} />
                      </div>
                    </div>
                    <div className="text-neutral-600 text-xl select-none">→</div>
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-xs font-mono text-neutral-500">DRAWN</span>
                      <CardSlot card={card3} highlight={thirdHighlight} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-6 bg-neutral-950 p-3 rounded-lg border border-neutral-800 text-center min-h-12 flex items-center justify-center">
            <p className={`font-mono text-sm font-bold tracking-wide ${
              message.includes("+") ? "text-green-400" :
              message.includes("-") ? "text-red-400" :
              message.includes("PUSH") || message.includes("CONSECUTIVE") ? "text-yellow-300" :
              message.includes("SPREAD") ? "text-teal-300" :
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
              className="px-16 py-8 rounded-2xl text-3xl font-black tracking-wider bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-400 hover:to-teal-500 border-b-8 border-teal-900 active:border-b-2 transition-all active:scale-95 shadow-2xl disabled:opacity-50"
            >
              DEAL [SPACE]
            </button>
          </>
        )}

        {/* Spread phase — BetSelector unmounted, 1 and SPACE are free */}
        {phase === "spread" && currentPayout !== null && (
          <div className="flex gap-4 flex-wrap justify-center">
            <button
              onClick={() => dealThird(true)}
              disabled={user.balance < bet * 2}
              className="px-10 py-6 rounded-2xl text-2xl font-black tracking-wider bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 border-b-8 border-orange-900 active:border-b-2 transition-all active:scale-95 shadow-xl disabled:opacity-30 disabled:cursor-not-allowed flex flex-col items-center gap-1"
            >
              <span>RAISE [1]</span>
              <span className="text-sm font-mono font-normal">bet ×2 → {(bet * 2).toLocaleString()}</span>
            </button>
            <button
              onClick={() => dealThird(false)}
              className="px-10 py-6 rounded-2xl text-2xl font-black tracking-wider bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-400 hover:to-teal-500 border-b-8 border-teal-900 active:border-b-2 transition-all active:scale-95 shadow-xl flex flex-col items-center gap-1"
            >
              <span>DEAL [SPACE]</span>
              <span className="text-sm font-mono font-normal">bet {bet.toLocaleString()}</span>
            </button>
          </div>
        )}

        {/* Result phase */}
        {phase === "result" && (
          <button
            onClick={reset}
            className="px-16 py-8 rounded-2xl text-3xl font-black tracking-wider bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-400 hover:to-teal-500 border-b-8 border-teal-900 active:border-b-2 transition-all active:scale-95 shadow-2xl"
          >
            DEAL AGAIN [SPACE]
          </button>
        )}
      </div>
    </div>
  );
}
