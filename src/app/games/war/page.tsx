"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import BalanceBar from "@/components/BalanceBar";
import BetSelector from "@/components/BetSelector";
import WinEffect from "@/components/WinEffect";
import { loadSession, saveSession } from "@/lib/session";
import { playWin, playBigWin, playLose, playCardFlip, playTick } from "@/lib/sounds";
import { UserProfile, PokerCard } from "@/types";

const SUITS: PokerCard["suit"][] = ["♠", "♥", "♦", "♣"];
const VALUES = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const WAR_RANK: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8,
  "9": 9, "10": 10, J: 11, Q: 12, K: 13, A: 14,
};

function makeDeck(): PokerCard[] {
  const deck: PokerCard[] = [];
  for (const suit of SUITS)
    for (const value of VALUES)
      deck.push({ suit, value, numericValue: WAR_RANK[value] });
  return deck.sort(() => Math.random() - 0.5);
}

type Phase = "betting" | "showdown" | "burning" | "result";

function CardSlot({ card, large = false, dim = false }: { card?: PokerCard; large?: boolean; dim?: boolean }) {
  if (!card) {
    return (
      <div className={`${large ? "w-24 h-36" : "w-16 h-24"} rounded-lg border-4 border-dashed border-rose-800 flex items-center justify-center text-4xl text-rose-800 select-none`}>
        ?
      </div>
    );
  }
  const isRed = card.suit === "♥" || card.suit === "♦";
  return (
    <div className={`${large ? "w-24 h-36" : "w-16 h-24"} bg-white rounded-lg border-2 border-neutral-300 flex flex-col items-center justify-center gap-0.5 select-none shadow-lg transition-opacity ${dim ? "opacity-40" : ""}`}>
      <span className={`${large ? "text-3xl" : "text-xl"} font-black leading-none ${isRed ? "text-red-600" : "text-neutral-900"}`}>{card.value}</span>
      <span className={`${large ? "text-3xl" : "text-xl"} leading-none ${isRed ? "text-red-600" : "text-neutral-900"}`}>{card.suit}</span>
    </div>
  );
}

export default function WarPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [bet, setBet] = useState(10);
  const [phase, setPhase] = useState<Phase>("betting");
  const [remainingDeck, setRemainingDeck] = useState<PokerCard[]>([]);
  const [playerCard, setPlayerCard] = useState<PokerCard | null>(null);
  const [dealerCard, setDealerCard] = useState<PokerCard | null>(null);
  const [warPlayerCard, setWarPlayerCard] = useState<PokerCard | null>(null);
  const [warDealerCard, setWarDealerCard] = useState<PokerCard | null>(null);
  const [message, setMessage] = useState("SET YOUR BET AND DEAL!");
  const [winEffect, setWinEffect] = useState({ show: false, big: false });

  useEffect(() => {
    const session = loadSession();
    if (!session) { router.replace("/"); return; }
    setUser(session);
  }, [router]);

  const settle = useCallback(async (
    currentUser: UserProfile,
    delta: number,
    resultStr: string,
    msg: string,
    big = false,
  ) => {
    setMessage(msg);
    setPhase("result");
    if (delta > 0) {
      if (big) { playBigWin(); setWinEffect({ show: true, big: true }); }
      else { playWin(); setWinEffect({ show: true, big: false }); }
    } else if (delta < 0) {
      playLose();
    }
    const res = await fetch("/api/game-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: currentUser.id, game: "war", result: resultStr, amount: delta }),
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
    const pCard = deck[0];
    const dCard = deck[1];
    setRemainingDeck(deck.slice(2));
    setPlayerCard(pCard);
    setDealerCard(dCard);
    setWarPlayerCard(null);
    setWarDealerCard(null);
    playCardFlip();
    setTimeout(() => playCardFlip(), 200);

    if (pCard.numericValue > dCard.numericValue) {
      await settle(user, bet, "win", `YOU WIN! +${bet.toLocaleString()} CREDITS`);
    } else if (dCard.numericValue > pCard.numericValue) {
      await settle(user, -bet, "lose", `DEALER WINS — -${bet.toLocaleString()} CREDITS`);
    } else {
      setPhase("showdown");
      setMessage(`TIE! BOTH DREW ${pCard.value} — GO TO WAR?`);
    }
  }, [user, bet, settle]);

  const goToWar = useCallback(async () => {
    if (!user || remainingDeck.length < 5) return;
    setPhase("burning");
    setMessage("BURNING CARDS...");
    for (let i = 0; i < 3; i++) {
      await new Promise<void>(r => setTimeout(r, 350));
      playCardFlip();
      playTick();
    }
    await new Promise<void>(r => setTimeout(r, 350));

    const warP = remainingDeck[3];
    const warD = remainingDeck[4];
    setWarPlayerCard(warP);
    setWarDealerCard(warD);
    playCardFlip();
    setTimeout(() => playCardFlip(), 200);

    const totalBet = bet * 2;
    if (warP.numericValue > warD.numericValue) {
      // Win war: earn the war bet (original pushes) → net +bet
      await settle(user, bet, "war-win", `WAR WON! +${bet.toLocaleString()} CREDITS`);
    } else if (warD.numericValue > warP.numericValue) {
      // Lose war: forfeit both bets
      await settle(user, -totalBet, "war-lose", `LOST THE WAR! -${totalBet.toLocaleString()} CREDITS`);
    } else {
      // Second tie: jackpot — win both bets
      await settle(user, totalBet, "war-tie", `DOUBLE WAR TIE! +${totalBet.toLocaleString()} CREDITS`, true);
    }
  }, [user, bet, remainingDeck, settle]);

  const reset = useCallback(() => {
    setPlayerCard(null);
    setDealerCard(null);
    setWarPlayerCard(null);
    setWarDealerCard(null);
    setRemainingDeck([]);
    setPhase("betting");
    setMessage("SET YOUR BET AND DEAL!");
  }, []);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") { router.push("/lobby"); return; }
      if (phase === "betting" && e.code === "Space") { e.preventDefault(); deal(); }
      if (phase === "showdown" && e.code === "Space") { e.preventDefault(); goToWar(); }
      if (phase === "result" && e.code === "Space") { e.preventDefault(); reset(); }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [phase, deal, goToWar, reset, router]);

  if (!user) return null;

  const inWar = phase === "showdown" || phase === "burning" || (phase === "result" && (warPlayerCard !== null));

  return (
    <div className="flex flex-col min-h-screen bg-rose-950 text-white">
      <BalanceBar user={user} onLogout={() => router.replace("/")} />
      <WinEffect
        show={winEffect.show}
        game="war"
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

        <div className="w-full max-w-2xl bg-black rounded-3xl p-6 border-8 border-rose-600 shadow-2xl">
          <div className="text-center text-lg font-black tracking-widest mb-4 pb-4 border-b border-neutral-800 text-rose-400">
            CASINO WAR
            {phase !== "betting" && (
              <span className="ml-4 text-sm font-mono font-normal text-neutral-400">
                BET: <span className="text-yellow-400">{bet.toLocaleString()}</span>
                {inWar && <span className="text-rose-400 ml-1">(WAR BET: {(bet * 2).toLocaleString()})</span>}
              </span>
            )}
          </div>

          {/* Initial deal row */}
          <div className="flex items-center justify-center gap-8">
            <div className="flex flex-col items-center gap-2">
              <span className="text-xs font-mono text-neutral-400 tracking-widest">YOU</span>
              <CardSlot card={playerCard ?? undefined} large dim={inWar && phase === "result"} />
            </div>
            <div className="text-2xl font-black text-neutral-600 pb-6 select-none">VS</div>
            <div className="flex flex-col items-center gap-2">
              <span className="text-xs font-mono text-neutral-400 tracking-widest">DEALER</span>
              <CardSlot card={dealerCard ?? undefined} large dim={inWar && phase === "result"} />
            </div>
          </div>

          {/* War row */}
          {(phase === "burning" || phase === "showdown" && false || (warPlayerCard || warDealerCard)) && (
            <div className="border-t border-rose-900 mt-4 pt-4">
              <div className="text-center text-xs font-mono text-rose-500 tracking-widest mb-3">
                {phase === "burning" ? "⚔️  BURNING CARDS..." : "⚔️  WAR"}
              </div>
              <div className="flex items-center justify-center gap-8">
                <div className="flex flex-col items-center gap-2">
                  <span className="text-xs font-mono text-neutral-500 tracking-widest">YOUR WAR CARD</span>
                  <CardSlot card={warPlayerCard ?? undefined} large />
                </div>
                <div className="text-2xl font-black text-rose-700 pb-6 select-none">⚔️</div>
                <div className="flex flex-col items-center gap-2">
                  <span className="text-xs font-mono text-neutral-500 tracking-widest">DEALER WAR CARD</span>
                  <CardSlot card={warDealerCard ?? undefined} large />
                </div>
              </div>
            </div>
          )}

          <div className="mt-6 bg-neutral-950 p-3 rounded-lg border border-neutral-800 text-center min-h-12 flex items-center justify-center">
            <p className={`font-mono text-sm font-bold tracking-wide ${
              message.includes("+") ? "text-green-400" :
              message.includes("-") ? "text-red-400" :
              (message.includes("TIE") || message.includes("WAR")) ? "text-rose-300" :
              "text-white"
            }`}>
              {message}
            </p>
          </div>
        </div>

        {phase === "betting" && (
          <>
            <BetSelector balance={user.balance} bet={bet} onChange={setBet} disabled={false} />
            <button
              onClick={deal}
              disabled={user.balance < bet}
              className="px-16 py-8 rounded-2xl text-3xl font-black tracking-wider bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 border-b-8 border-rose-900 active:border-b-2 transition-all active:scale-95 shadow-2xl disabled:opacity-50"
            >
              DEAL [SPACE]
            </button>
          </>
        )}

        {phase === "showdown" && (
          <button
            onClick={goToWar}
            disabled={!user || user.balance < bet}
            className="px-12 py-8 rounded-2xl text-3xl font-black tracking-wider bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 border-b-8 border-red-900 active:border-b-2 transition-all active:scale-95 shadow-2xl animate-pulse disabled:opacity-50"
          >
            ⚔️ GO TO WAR [SPACE]
          </button>
        )}

        {phase === "result" && (
          <button
            onClick={reset}
            className="px-16 py-8 rounded-2xl text-3xl font-black tracking-wider bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 border-b-8 border-rose-900 active:border-b-2 transition-all active:scale-95 shadow-2xl"
          >
            DEAL AGAIN [SPACE]
          </button>
        )}
      </div>
    </div>
  );
}
