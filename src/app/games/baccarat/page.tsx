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
const VALUES = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

function baccaratValue(card: PokerCard): number {
  if (card.value === "A") return 1;
  const n = parseInt(card.value, 10);
  if (isNaN(n)) return 0; // J, Q, K
  return Math.min(n, 9);
}

function handTotal(cards: PokerCard[]): number {
  return cards.reduce((sum, c) => sum + baccaratValue(c), 0) % 10;
}

function makeDeck(): PokerCard[] {
  const deck: PokerCard[] = [];
  for (const suit of SUITS)
    for (const value of VALUES)
      deck.push({ suit, value, numericValue: 0 });
  return deck.sort(() => Math.random() - 0.5);
}

type BetChoice = "player" | "banker" | "tie";
type Phase = "betting" | "dealing" | "result";

function Card({ card }: { card: PokerCard }) {
  const isRed = card.suit === "♥" || card.suit === "♦";
  return (
    <div className="w-14 h-20 bg-white rounded-lg border-2 border-neutral-300 flex flex-col items-center justify-center gap-0.5 select-none shadow-lg">
      <span className={`text-lg font-black leading-none ${isRed ? "text-red-600" : "text-neutral-900"}`}>
        {card.value}
      </span>
      <span className={`text-xl leading-none ${isRed ? "text-red-600" : "text-neutral-900"}`}>
        {card.suit}
      </span>
    </div>
  );
}

function Hand({ cards, label, total }: { cards: PokerCard[]; label: string; total: number | null }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-2">
        <span className="text-sm text-neutral-400 uppercase tracking-wider">{label}</span>
        {total !== null && (
          <span className={`font-mono font-bold text-lg px-2 py-0.5 rounded ${
            total === 8 || total === 9 ? "bg-yellow-900 text-yellow-300" : "bg-neutral-800 text-white"
          }`}>
            {total}
          </span>
        )}
      </div>
      <div className="flex gap-2 flex-wrap justify-center min-h-20">
        {cards.map((card, i) => <Card key={i} card={card} />)}
        {cards.length === 0 && (
          <div className="w-14 h-20 rounded-lg border-2 border-dashed border-neutral-700 opacity-30" />
        )}
      </div>
    </div>
  );
}

export default function BaccaratPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [bet, setBet] = useState(10);
  const [betChoice, setBetChoice] = useState<BetChoice | null>(null);
  const [phase, setPhase] = useState<Phase>("betting");
  const [playerCards, setPlayerCards] = useState<PokerCard[]>([]);
  const [bankerCards, setBankerCards] = useState<PokerCard[]>([]);
  const [message, setMessage] = useState("PLACE YOUR BET");
  const [winEffect, setWinEffect] = useState({ show: false, big: false });

  useEffect(() => {
    const session = loadSession();
    if (!session) { router.replace("/"); return; }
    setUser(session);
  }, [router]);

  const deal = useCallback(async () => {
    if (!user || !betChoice || bet < 1 || user.balance < bet) {
      setMessage(!betChoice ? "CHOOSE PLAYER, BANKER, OR TIE FIRST!" : "NOT ENOUGH CREDITS!");
      return;
    }

    setPhase("dealing");
    setMessage("DEALING...");

    const deck = makeDeck();
    let idx = 0;
    const drawCard = (): PokerCard => deck[idx++];

    // Deal alternating: player, banker, player, banker
    const p1 = drawCard(), b1 = drawCard(), p2 = drawCard(), b2 = drawCard();

    setPlayerCards([p1]);
    setBankerCards([]);
    playCardFlip();
    await new Promise<void>((r) => setTimeout(r, 220));

    setBankerCards([b1]);
    playCardFlip();
    await new Promise<void>((r) => setTimeout(r, 220));

    setPlayerCards([p1, p2]);
    playCardFlip();
    await new Promise<void>((r) => setTimeout(r, 220));

    setBankerCards([b1, b2]);
    playCardFlip();
    await new Promise<void>((r) => setTimeout(r, 500));

    let player = [p1, p2];
    let banker = [b1, b2];

    const pNat = handTotal(player);
    const bNat = handTotal(banker);

    // No third cards on a natural (8 or 9)
    if (pNat < 8 && bNat < 8) {
      let playerThird: PokerCard | null = null;

      if (pNat <= 5) {
        playerThird = drawCard();
        await new Promise<void>((r) => setTimeout(r, 400));
        playCardFlip();
        player = [...player, playerThird];
        setPlayerCards(player);
        await new Promise<void>((r) => setTimeout(r, 400));
      }

      const bNow = handTotal(banker);
      let bankerDraws = false;

      if (playerThird === null) {
        bankerDraws = bNow <= 5;
      } else {
        const pv = baccaratValue(playerThird);
        if (bNow <= 2) bankerDraws = true;
        else if (bNow === 3) bankerDraws = pv !== 8;
        else if (bNow === 4) bankerDraws = pv >= 2 && pv <= 7;
        else if (bNow === 5) bankerDraws = pv >= 4 && pv <= 7;
        else if (bNow === 6) bankerDraws = pv === 6 || pv === 7;
        // bNow === 7: stand
      }

      if (bankerDraws) {
        const b3 = drawCard();
        await new Promise<void>((r) => setTimeout(r, 400));
        playCardFlip();
        banker = [...banker, b3];
        setBankerCards(banker);
        await new Promise<void>((r) => setTimeout(r, 400));
      }
    }

    const finalP = handTotal(player);
    const finalB = handTotal(banker);

    const winner: "player" | "banker" | "tie" =
      finalP > finalB ? "player" : finalB > finalP ? "banker" : "tie";

    let delta = 0;
    let msg = "";
    let bigWin = false;

    if (winner === "tie") {
      if (betChoice === "tie") {
        delta = bet * 8;
        msg = `TIE ${finalP}–${finalB}! You win 8:1 — +${delta.toLocaleString()} CREDITS`;
        bigWin = true;
      } else {
        delta = 0;
        msg = `TIE ${finalP}–${finalB} — PUSH. Your bet is returned.`;
      }
    } else if (winner === "player") {
      if (betChoice === "player") {
        delta = bet;
        msg = `PLAYER WINS ${finalP} vs ${finalB} — +${bet.toLocaleString()} CREDITS`;
      } else {
        delta = -bet;
        msg = `PLAYER WINS ${finalP} vs ${finalB} — -${bet.toLocaleString()} CREDITS`;
      }
    } else {
      if (betChoice === "banker") {
        delta = Math.floor(bet * 0.95);
        msg = `BANKER WINS ${finalB} vs ${finalP} — +${delta.toLocaleString()} CREDITS (5% commission)`;
      } else {
        delta = -bet;
        msg = `BANKER WINS ${finalB} vs ${finalP} — -${bet.toLocaleString()} CREDITS`;
      }
    }

    if (bigWin) {
      playBigWin();
      setWinEffect({ show: true, big: true });
    } else if (delta > 0) {
      playWin();
      setWinEffect({ show: true, big: false });
    } else if (delta < 0) {
      playLose();
    }

    setMessage(msg);
    setPhase("result");

    const res = await fetch("/api/game-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.id,
        game: "baccarat",
        result: delta > 0 ? "win" : delta === 0 ? "push" : "lose",
        amount: delta,
      }),
    });
    if (res.ok) {
      const { user: updated } = await res.json();
      saveSession(updated);
      setUser(updated);
    }
  }, [user, betChoice, bet]);

  const reset = useCallback(() => {
    setPhase("betting");
    setPlayerCards([]);
    setBankerCards([]);
    setBetChoice(null);
    setMessage("PLACE YOUR BET");
  }, []);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.push("/lobby");
      if (phase === "betting") {
        if (e.key === "p" || e.key === "P") setBetChoice("player");
        if (e.key === "b" || e.key === "B") setBetChoice("banker");
        if (e.key === "t" || e.key === "T") setBetChoice("tie");
        if (e.code === "Space") { e.preventDefault(); deal(); }
      }
      if (phase === "result") {
        if (e.code === "Space") { e.preventDefault(); reset(); }
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [phase, deal, reset, router]);

  if (!user) return null;

  const pTotal = playerCards.length > 0 ? handTotal(playerCards) : null;
  const bTotal = bankerCards.length > 0 ? handTotal(bankerCards) : null;

  const betBtnBase =
    "flex-1 py-4 px-3 rounded-xl font-black text-base border-b-4 transition-all active:scale-95 flex flex-col items-center";

  return (
    <div className="flex flex-col min-h-screen bg-indigo-950 text-white">
      <BalanceBar user={user} onLogout={() => router.replace("/")} />
      <WinEffect
        show={winEffect.show}
        game="baccarat"
        big={winEffect.big}
        onDone={() => setWinEffect({ show: false, big: false })}
      />

      <div className="flex flex-col items-center gap-5 p-6 pt-24 w-full max-w-2xl mx-auto">
        <button
          onClick={() => router.push("/lobby")}
          className="self-start px-4 py-2 bg-black/40 hover:bg-black/60 border border-neutral-700 rounded-lg text-sm font-mono"
        >
          ← [ESC] LOBBY
        </button>

        <div className="w-full bg-black rounded-3xl p-6 border-8 border-indigo-600 shadow-2xl">
          <div className="text-center text-lg font-black tracking-widest mb-4 pb-4 border-b border-neutral-800 text-indigo-400">
            BACCARAT
            {betChoice && phase !== "betting" && (
              <span className="ml-4 text-sm font-mono font-normal text-neutral-400">
                BET: <span className="text-yellow-400">{bet.toLocaleString()}</span>
                {" on "}
                <span className={`uppercase font-bold ${
                  betChoice === "player" ? "text-blue-400" :
                  betChoice === "banker" ? "text-red-400" :
                  "text-yellow-400"
                }`}>{betChoice}</span>
              </span>
            )}
          </div>

          <div className="flex flex-col gap-6">
            <Hand label="Banker" cards={bankerCards} total={bTotal} />
            <div className="border-t border-neutral-800" />
            <Hand label="Player" cards={playerCards} total={pTotal} />
          </div>

          <div className="mt-6 bg-neutral-950 p-3 rounded-lg border border-neutral-800 text-center min-h-12 flex items-center justify-center">
            <p className={`font-mono text-sm font-bold tracking-wide ${
              message.includes("+") ? "text-green-400" :
              message.includes("PUSH") ? "text-yellow-400" :
              message.includes("-") || message.includes("LOSES") ? "text-red-400" :
              "text-white"
            }`}>
              {message}
            </p>
          </div>
        </div>

        {/* Bet rule card */}
        <div className="w-full bg-black/30 rounded-xl border border-indigo-900/50 p-3 text-xs font-mono text-neutral-500 text-center">
          Natural (8 or 9) = no draw · Player draws on 0–5 · Banker follows house rules · Banker pays 0.95:1
        </div>

        {phase === "betting" && (
          <div className="flex flex-col items-center gap-4 w-full">
            {/* Bet choice buttons */}
            <div className="flex gap-3 w-full">
              <button
                onClick={() => setBetChoice("player")}
                className={`${betBtnBase} ${
                  betChoice === "player"
                    ? "bg-blue-500 border-blue-800 shadow-lg shadow-blue-500/40 scale-105"
                    : "bg-blue-900/50 border-blue-950 hover:bg-blue-800/60"
                }`}
              >
                <span>PLAYER</span>
                <span className="text-[10px] font-mono font-normal text-blue-300 mt-0.5">1:1 [P]</span>
              </button>
              <button
                onClick={() => setBetChoice("tie")}
                className={`${betBtnBase} ${
                  betChoice === "tie"
                    ? "bg-yellow-500 border-yellow-800 text-black shadow-lg shadow-yellow-500/40 scale-105"
                    : "bg-yellow-900/50 border-yellow-950 hover:bg-yellow-800/60"
                }`}
              >
                <span>TIE</span>
                <span className="text-[10px] font-mono font-normal text-yellow-300 mt-0.5">8:1 [T]</span>
              </button>
              <button
                onClick={() => setBetChoice("banker")}
                className={`${betBtnBase} ${
                  betChoice === "banker"
                    ? "bg-red-500 border-red-800 shadow-lg shadow-red-500/40 scale-105"
                    : "bg-red-900/50 border-red-950 hover:bg-red-800/60"
                }`}
              >
                <span>BANKER</span>
                <span className="text-[10px] font-mono font-normal text-red-300 mt-0.5">0.95:1 [B]</span>
              </button>
            </div>

            <BetSelector balance={user.balance} bet={bet} onChange={setBet} disabled={false} />

            <button
              onClick={deal}
              disabled={!betChoice || user.balance < bet || bet < 1}
              className="px-16 py-8 rounded-2xl text-3xl font-black tracking-wider bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 border-b-8 border-purple-900 active:border-b-2 transition-all active:scale-95 shadow-2xl disabled:opacity-50"
            >
              DEAL [SPACE]
            </button>
          </div>
        )}

        {phase === "result" && (
          <button
            onClick={reset}
            className="px-16 py-8 rounded-2xl text-3xl font-black tracking-wider bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 border-b-8 border-purple-900 active:border-b-2 transition-all active:scale-95 shadow-2xl"
          >
            PLAY AGAIN [SPACE]
          </button>
        )}
      </div>
    </div>
  );
}
