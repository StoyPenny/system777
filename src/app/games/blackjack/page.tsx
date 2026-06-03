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
  "10": 10, J: 10, Q: 10, K: 10, A: 11,
};
const MIN_BET = 1;

function makeDeck(): PokerCard[] {
  const deck: PokerCard[] = [];
  for (const suit of SUITS)
    for (const value of VALUES)
      deck.push({ suit, value, numericValue: NUMERIC[value] });
  return deck.sort(() => Math.random() - 0.5);
}

function handTotal(cards: PokerCard[]): number {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += c.numericValue;
    if (c.value === "A") aces++;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function isBlackjack(cards: PokerCard[]): boolean {
  return cards.length === 2 && handTotal(cards) === 21;
}

type Phase = "betting" | "player" | "dealer" | "result";

interface GameState {
  deck: PokerCard[];
  player: PokerCard[];
  dealer: PokerCard[];
}

// Card display component
function Card({ card, hidden = false }: { card: PokerCard; hidden?: boolean }) {
  const isRed = card.suit === "♥" || card.suit === "♦";
  if (hidden) {
    return (
      <div className="w-16 h-24 md:w-20 md:h-28 bg-blue-900 rounded-lg border-2 border-blue-700 flex items-center justify-center text-2xl select-none shadow-lg">
        🂠
      </div>
    );
  }
  return (
    <div className="w-16 h-24 md:w-20 md:h-28 bg-white rounded-lg border-2 border-neutral-300 flex flex-col items-center justify-center gap-0.5 select-none shadow-lg">
      <span className={`text-xl font-black leading-none ${isRed ? "text-red-600" : "text-neutral-900"}`}>
        {card.value}
      </span>
      <span className={`text-2xl leading-none ${isRed ? "text-red-600" : "text-neutral-900"}`}>
        {card.suit}
      </span>
    </div>
  );
}

function Hand({ cards, hideSecond = false, label, total }: {
  cards: PokerCard[]; hideSecond?: boolean; label: string; total?: number;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-2">
        <span className="text-sm text-neutral-400 uppercase tracking-wider">{label}</span>
        {total !== undefined && (
          <span className={`font-mono font-bold text-lg px-2 py-0.5 rounded ${
            total > 21 ? "bg-red-900 text-red-300" :
            total === 21 ? "bg-yellow-900 text-yellow-300" :
            "bg-neutral-800 text-white"
          }`}>
            {total}
          </span>
        )}
      </div>
      <div className="flex gap-2 flex-wrap justify-center">
        {cards.map((card, i) => (
          <Card key={i} card={card} hidden={hideSecond && i === 1} />
        ))}
        {cards.length === 0 && (
          <div className="w-16 h-24 md:w-20 md:h-28 rounded-lg border-2 border-dashed border-neutral-700 opacity-30" />
        )}
      </div>
    </div>
  );
}

export default function BlackjackPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [bet, setBet] = useState(10);
  const [phase, setPhase] = useState<Phase>("betting");
  const [gameState, setGameState] = useState<GameState>({ deck: [], player: [], dealer: [] });
  const [message, setMessage] = useState("SET YOUR BET AND DEAL!");
  const [doubled, setDoubled] = useState(false);
  const [winEffect, setWinEffect] = useState<{ show: boolean; big: boolean }>({ show: false, big: false });

  useEffect(() => {
    const session = loadSession();
    if (!session) { router.replace("/"); return; }
    setUser(session);
  }, [router]);

  const settle = useCallback(
    async (playerCards: PokerCard[], dealerCards: PokerCard[], currentUser: UserProfile, currentBet: number, wasDoubled: boolean) => {
      const pTotal = handTotal(playerCards);
      const dTotal = handTotal(dealerCards);
      const effectiveBet = wasDoubled ? currentBet * 2 : currentBet;

      let delta = 0;
      let result = "";
      let msg = "";

      const playerBJ = isBlackjack(playerCards);
      const dealerBJ = isBlackjack(dealerCards);

      if (pTotal > 21) {
        delta = -effectiveBet;
        result = "bust";
        msg = `BUST! You went over 21. -${effectiveBet.toLocaleString()} CREDITS`;
      } else if (dealerBJ && playerBJ) {
        delta = 0;
        result = "push-blackjack";
        msg = "BOTH BLACKJACK — PUSH!";
      } else if (playerBJ) {
        delta = Math.floor(effectiveBet * 1.5);
        result = "blackjack";
        msg = `BLACKJACK! +${delta.toLocaleString()} CREDITS`;
      } else if (dealerBJ) {
        delta = -effectiveBet;
        result = "dealer-blackjack";
        msg = `DEALER BLACKJACK — -${effectiveBet.toLocaleString()} CREDITS`;
      } else if (dTotal > 21) {
        delta = effectiveBet;
        result = "dealer-bust";
        msg = `DEALER BUSTS! +${effectiveBet.toLocaleString()} CREDITS`;
      } else if (pTotal > dTotal) {
        delta = effectiveBet;
        result = "win";
        msg = `YOU WIN! ${pTotal} vs ${dTotal} — +${effectiveBet.toLocaleString()} CREDITS`;
      } else if (pTotal === dTotal) {
        delta = 0;
        result = "push";
        msg = `PUSH — ${pTotal} vs ${dTotal}`;
      } else {
        delta = -effectiveBet;
        result = "lose";
        msg = `DEALER WINS — ${pTotal} vs ${dTotal} — -${effectiveBet.toLocaleString()} CREDITS`;
      }

      // Sounds and animations
      if (result === "blackjack") {
        playBigWin();
        setWinEffect({ show: true, big: true });
      } else if (result === "dealer-bust" || result === "win") {
        playWin();
        setWinEffect({ show: true, big: false });
      } else if (result === "push" || result === "push-blackjack") {
        // no sound for push
      } else {
        playLose();
      }

      setMessage(msg);
      const res = await fetch("/api/game-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser.id, game: "blackjack", result, amount: delta }),
      });
      if (res.ok) {
        const { user: updated } = await res.json();
        saveSession(updated);
        setUser(updated);
      }
    },
    []
  );

  // Run dealer draw sequence then settle
  const runDealer = useCallback(
    async (playerCards: PokerCard[], initialDealer: PokerCard[], deckCards: PokerCard[], currentUser: UserProfile, currentBet: number, wasDoubled: boolean) => {
      setPhase("dealer");
      let dealer = [...initialDealer];
      let deck = [...deckCards];

      // Animate dealer drawing
      while (handTotal(dealer) < 17) {
        await new Promise((r) => setTimeout(r, 600));
        playCardFlip();
        dealer = [...dealer, deck.shift()!];
        setGameState((s) => ({ ...s, dealer, deck }));
      }

      await new Promise((r) => setTimeout(r, 400));
      setPhase("result");
      await settle(playerCards, dealer, currentUser, currentBet, wasDoubled);
    },
    [settle]
  );

  const dealCards = useCallback(() => {
    if (!user || user.balance < bet || bet < MIN_BET) {
      setMessage(bet < MIN_BET ? `MINIMUM BET IS ${MIN_BET}!` : "NOT ENOUGH CREDITS!");
      return;
    }
    const deck = makeDeck();
    const player = [deck[0], deck[2]];
    const dealer = [deck[1], deck[3]];
    const remaining = deck.slice(4);
    setGameState({ deck: remaining, player, dealer });
    setDoubled(false);
    setPhase("player");
    // Deal 4 cards: player1, dealer1, player2, dealer2
    [0, 120, 240, 360].forEach((ms) => setTimeout(playCardFlip, ms));

    if (isBlackjack(player)) {
      setMessage("BLACKJACK! Checking dealer...");
      // Reveal dealer immediately and settle
      setTimeout(() => runDealer(player, dealer, remaining, user, bet, false), 800);
    } else {
      setMessage("HIT [1] or STAND [2] or DOUBLE [3]");
    }
  }, [user, bet, runDealer]);

  const hit = useCallback(() => {
    if (phase !== "player") return;
    const { deck, player, dealer } = gameState;
    if (!user) return;

    const newCard = deck[0];
    const newPlayer = [...player, newCard];
    const newDeck = deck.slice(1);
    setGameState({ deck: newDeck, player: newPlayer, dealer });
    playCardFlip();

    const total = handTotal(newPlayer);
    if (total > 21) {
      setPhase("result");
      setMessage(`BUST! Went over 21. -${bet.toLocaleString()} CREDITS`);
      playLose();
      fetch("/api/game-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, game: "blackjack", result: "bust", amount: -bet }),
      }).then((r) => r.json()).then(({ user: updated }) => { saveSession(updated); setUser(updated); });
    } else if (total === 21) {
      setMessage("21! Standing automatically...");
      setTimeout(() => runDealer(newPlayer, dealer, newDeck, user, bet, false), 600);
    } else {
      setMessage(`Total: ${total} — HIT [1] STAND [2]`);
    }
  }, [phase, gameState, user, bet, runDealer]);

  const stand = useCallback(() => {
    if (phase !== "player" || !user) return;
    runDealer(gameState.player, gameState.dealer, gameState.deck, user, bet, doubled);
  }, [phase, gameState, user, bet, doubled, runDealer]);

  const doubleDown = useCallback(() => {
    if (phase !== "player" || !user) return;
    if (gameState.player.length !== 2) return;
    if (user.balance < bet * 2) { setMessage("NOT ENOUGH CREDITS TO DOUBLE!"); return; }

    const { deck, player, dealer } = gameState;
    const newCard = deck[0];
    const newPlayer = [...player, newCard];
    const newDeck = deck.slice(1);
    setDoubled(true);
    setGameState({ deck: newDeck, player: newPlayer, dealer });
    setMessage(`DOUBLED! Drew ${newCard.value}${newCard.suit} — Total: ${handTotal(newPlayer)}`);
    setTimeout(() => runDealer(newPlayer, dealer, newDeck, user, bet, true), 800);
  }, [phase, gameState, user, bet, runDealer]);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (phase === "betting" || phase === "result") {
        if (e.code === "Space") { e.preventDefault(); dealCards(); }
      }
      if (phase === "player") {
        if (e.key === "1") hit();
        if (e.key === "2") stand();
        if (e.key === "3") doubleDown();
      }
      if (e.key === "Escape") router.push("/lobby");
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [phase, dealCards, hit, stand, doubleDown, router]);

  if (!user) return null;

  const { player, dealer } = gameState;
  const playerTotal = player.length > 0 ? handTotal(player) : undefined;
  const dealerTotal = dealer.length > 0 && phase !== "player" ? handTotal(dealer) : undefined;
  const effectiveBet = doubled ? bet * 2 : bet;
  const canDouble = phase === "player" && player.length === 2 && user.balance >= bet * 2;

  return (
    <div className="flex flex-col min-h-screen bg-emerald-950 text-white">
      <BalanceBar user={user} onLogout={() => router.replace("/")} />
      <WinEffect
        show={winEffect.show}
        game="blackjack"
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

        <div className="w-full max-w-2xl bg-black rounded-3xl p-6 border-8 border-emerald-600 shadow-2xl">
          <div className="text-center text-lg font-black tracking-widest mb-4 pb-4 border-b border-neutral-800 text-emerald-400">
            BLACKJACK
            {phase !== "betting" && (
              <span className="ml-4 text-sm font-mono font-normal text-neutral-400">
                BET: <span className="text-yellow-400">{effectiveBet.toLocaleString()}</span>
                {doubled && <span className="text-orange-400 ml-1">(DOUBLED)</span>}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-8">
            <Hand
              label="Dealer"
              cards={dealer}
              hideSecond={phase === "player"}
              total={dealerTotal}
            />
            <div className="border-t border-neutral-800" />
            <Hand
              label="You"
              cards={player}
              total={playerTotal}
            />
          </div>

          <div className="mt-6 bg-neutral-950 p-3 rounded-lg border border-neutral-800 text-center min-h-12 flex items-center justify-center">
            <p className={`font-mono text-sm font-bold tracking-wide ${
              message.includes("+") ? "text-green-400" :
              message.includes("BUST") || message.includes("lose") || message.includes("DEALER WINS") ? "text-red-400" :
              message.includes("BLACKJACK") ? "text-yellow-400 text-base" :
              "text-white"
            }`}>
              {message}
            </p>
          </div>
        </div>

        {/* Betting / Action buttons */}
        {(phase === "betting" || phase === "result") ? (
          <>
            <BetSelector balance={user.balance} bet={bet} onChange={setBet} disabled={false} />
            <button
              onClick={dealCards}
              disabled={user.balance < bet || bet < MIN_BET}
              className="px-16 py-8 rounded-2xl text-3xl font-black tracking-wider bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 border-b-8 border-green-800 active:border-b-2 transition-all active:scale-95 shadow-2xl disabled:opacity-50"
            >
              DEAL [SPACE]
            </button>
          </>
        ) : (
          <div className="flex gap-4 flex-wrap justify-center">
            <button
              onClick={hit}
              disabled={phase !== "player"}
              className="px-10 py-6 rounded-2xl text-2xl font-black bg-blue-600 hover:bg-blue-500 border-b-8 border-blue-900 active:border-b-2 transition-all active:scale-95 shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              HIT [1]
            </button>
            <button
              onClick={stand}
              disabled={phase !== "player"}
              className="px-10 py-6 rounded-2xl text-2xl font-black bg-red-700 hover:bg-red-600 border-b-8 border-red-900 active:border-b-2 transition-all active:scale-95 shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              STAND [2]
            </button>
            <button
              onClick={doubleDown}
              disabled={!canDouble}
              className="px-10 py-6 rounded-2xl text-2xl font-black bg-orange-600 hover:bg-orange-500 border-b-8 border-orange-900 active:border-b-2 transition-all active:scale-95 shadow-xl disabled:opacity-30 disabled:cursor-not-allowed"
            >
              DOUBLE [3]
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
